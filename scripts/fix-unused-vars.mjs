// 未使用变量修复器（**分风险类别**，默认 dry-run）
//
// 为什么不能一把梭：`no-unused-vars` 的四个子类风险完全不同 ——
//   A 未用 catch 参数 → `catch (e)` 改 `catch {}`：**零风险**（只是去掉绑定）
//   D 未用函数参数   → 重命名 `_x`（项目约定 argsIgnorePattern: '^_'）：**零风险**
//   B 未用导入       → 删掉导入说明符：**零风险**（命名导入没有副作用）
//   B/C 未用声明/变量 → **有风险**：`const x = doSomething()` 删掉会**丢掉副作用**，
//                       必须先看 RHS 是不是纯表达式。本脚本对这类**只报告不修**。
//
// 用法：
//   node scripts/fix-unused-vars.mjs            # dry-run，只打印会改什么
//   node scripts/fix-unused-vars.mjs --apply    # 实际写入
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();

const raw = execSync('./node_modules/.bin/eslint . --format json || true', {
  cwd: ROOT,
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
});
const report = JSON.parse(raw);

const classify = (msg) => {
  if (/Allowed unused caught errors/.test(msg)) return 'A';
  if (/Allowed unused args/.test(msg)) return 'D';
  if (/is assigned a value but never used/.test(msg)) return 'C';
  return 'B';
};

/** 收集：文件 → 该文件的告警列表 */
const byFile = new Map();
for (const f of report) {
  const rel = f.filePath.replace(ROOT + '/', '');
  const items = f.messages
    .filter((m) => m.ruleId && m.ruleId.includes('no-unused-vars'))
    .map((m) => ({
      line: m.line,
      col: m.column,
      name: (m.message.match(/'([^']+)'/) || [])[1],
      kind: classify(m.message),
      msg: m.message,
    }))
    .filter((x) => x.name);
  if (items.length) byFile.set(rel, items);
}

/** 判断该名字在文件里是不是「导入说明符」：所在语句以 import 开头 */
const isImportSpecifier = (lines, line) => {
  for (let i = line - 1; i >= 0; i--) {
    const t = lines[i];
    if (/^\s*import\b/.test(t)) return true;
    // 往上找语句边界
    if (/;\s*$/.test(t) || /^\s*(?:const|let|var|function|export|class)\b/.test(t)) return false;
  }
  return false;
};

/** RHS 是否含函数调用（= 可能有副作用 → 不能删） */
const rhsHasCall = (lineText) => {
  const rhs = lineText.split('=').slice(1).join('=');
  if (!rhs) return false;
  // 排除 new Set()/[] 这类字面量构造，只认「看起来像调用」
  return /[A-Za-z_$][\w$]*\s*\(/.test(rhs);
};

const plan = [];
for (const [rel, items] of byFile) {
  const lines = readFileSync(`${ROOT}/${rel}`, 'utf-8').split('\n');
  for (const it of items) {
    const text = lines[it.line - 1] ?? '';
    if (it.kind === 'A') {
      plan.push({ rel, ...it, action: 'A: catch (x) → catch', risk: 'zero' });
    } else if (it.kind === 'D') {
      plan.push({ rel, ...it, action: `D: 参数 ${it.name} → _${it.name}`, risk: 'zero' });
    } else if (isImportSpecifier(lines, it.line)) {
      plan.push({ rel, ...it, action: 'B: 删导入说明符', risk: 'zero' });
    } else if (rhsHasCall(text)) {
      plan.push({ rel, ...it, action: '（跳过）RHS 含函数调用，可能有副作用', risk: 'review' });
    } else {
      plan.push({ rel, ...it, action: 'C/B: 删声明（RHS 无调用）', risk: 'low' });
    }
  }
}

const zero = plan.filter((p) => p.risk === 'zero');
const low = plan.filter((p) => p.risk === 'low');
const review = plan.filter((p) => p.risk === 'review');
console.log(`总计 ${plan.length} 条`);
console.log(`  零风险（A/D/导入）: ${zero.length}`);
console.log(`  低风险（RHS 无调用的声明）: ${low.length}`);
console.log(`  需人工复核（RHS 含调用）: ${review.length}`);
console.log('');
if (!APPLY) {
  console.log('=== dry-run：零风险批次的前 20 条 ===');
  for (const p of zero.slice(0, 20)) console.log(`  ${p.rel}:${p.line}  ${p.name}  →  ${p.action}`);
  console.log('');
  console.log('=== 需人工复核的清单（RHS 含函数调用，删了可能丢副作用）===');
  for (const p of review.slice(0, 25)) console.log(`  ${p.rel}:${p.line}  ${p.name}`);
  if (review.length > 25) console.log(`  …还有 ${review.length - 25} 条`);
  console.log('');
  console.log('加 --apply 实际写入。');
  process.exit(0);
}

// ── 实际写入：只处理零风险批次，且**改完自检，出错自动回滚** ──────────
//
// 为什么必须有自检闸门：第一版修复器把树弄坏了 ——
//   · A 类用 `text.replace(re,'catch')` 替换的是**全文件第一个** `catch (e)`，
//     而不是报告的那一处 → 把在用 `e` 的 catch 绑定删了 → `'e' is not defined`；
//   · B 类对**默认导入**（`import X from '…'`）也套用"删说明符"，把模块路径删了
//     → 解析错误。
// 分类没错，**实现错了**。所以现在：编辑按行精确作用 + 改完跑 eslint 自检 +
// 一旦出现新 error 就整体回滚。**工具必须能证明自己没搞坏东西。**

const backupDir = mkdtempSync(`${tmpdir()}/unusedfix-`);
const byFileZero = new Map();
for (const p of zero) {
  if (!byFileZero.has(p.rel)) byFileZero.set(p.rel, []);
  byFileZero.get(p.rel).push(p);
}

const countErrors = () => {
  const out = execSync('./node_modules/.bin/eslint . --format json || true', {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const list = [];
  for (const f of JSON.parse(out)) {
    for (const m of f.messages) {
      if (m.severity === 2)
        list.push(`${f.filePath.replace(ROOT + '/', '')}:${m.line}  ${m.message}`);
    }
  }
  return list;
};
const errorsBefore = countErrors();

let touched = 0;
const failed = [];
let n = 0;
for (const [rel, items] of byFileZero) {
  const abs = `${ROOT}/${rel}`;
  copyFileSync(abs, `${backupDir}/${n++}-${rel.replace(/\//g, '__')}`);
  const lines = readFileSync(abs, 'utf-8').split('\n');
  // 从后往前改，避免行号漂移
  for (const it of [...items].sort((a, b) => b.line - a.line)) {
    const idx = it.line - 1;
    const line = lines[idx];
    if (line === undefined) {
      failed.push(`${rel}:${it.line} 行不存在`);
      continue;
    }
    const nm = it.name.replace(/[$]/g, '\\$');
    if (it.kind === 'A') {
      // **只改这一行**：`… } catch (e) {` → `… } catch {`
      const re = new RegExp(`catch\\s*\\(\\s*${nm}\\s*\\)`);
      if (!re.test(line)) {
        failed.push(`${rel}:${it.line} A ${it.name} 该行未匹配 catch`);
        continue;
      }
      lines[idx] = line.replace(re, 'catch');
    } else if (it.kind === 'D') {
      const re = new RegExp(`(?<![\\w$])${nm}(?![\\w$])`);
      if (!re.test(line)) {
        failed.push(`${rel}:${it.line} D ${it.name} 该行未找到`);
        continue;
      }
      lines[idx] = line.replace(re, `_${it.name}`);
    } else if (it.kind === 'B') {
      // ⚠️ 只处理**具名导入**（在 `{ … }` 里）。默认导入 `import X from '…'` /
      // 命名空间 `import * as X` **一律跳过** —— 第一版就是在这里把模块路径删了。
      const importLineNo = (() => {
        for (let i = idx; i >= 0; i--) {
          if (/^\s*import\b/.test(lines[i])) return i;
          if (
            /;\s*$/.test(lines[i]) ||
            /^\s*(?:const|let|var|function|export|class)\b/.test(lines[i])
          )
            return -1;
        }
        return -1;
      })();
      if (importLineNo < 0) {
        failed.push(`${rel}:${it.line} B ${it.name} 不是具名导入（已跳过）`);
        continue;
      }
      // 该 import 语句里必须出现 `{`（具名导入）
      const stmtEnd = (() => {
        for (let i = importLineNo; i < lines.length; i++)
          if (/from\s+['"]/.test(lines[i]) || /;\s*$/.test(lines[i])) return i;
        return importLineNo;
      })();
      const stmt = lines.slice(importLineNo, stmtEnd + 1).join('\n');
      if (!/\{/.test(stmt)) {
        failed.push(`${rel}:${it.line} B ${it.name} 非具名导入（已跳过）`);
        continue;
      }
      // 情况 1：该行只有这一个说明符且是单行 import → 删整行
      if (importLineNo === stmtEnd) {
        const inner = line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
        const specs = inner
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (specs.length === 1 && specs[0] === it.name) {
          lines.splice(idx, 1);
          continue;
        }
      }
      // 情况 2：多行 import 的独立一行 → 删整行
      if (new RegExp(`^\\s*${nm}\\s*,?\\s*$`).test(line)) {
        lines.splice(idx, 1);
        continue;
      }
      // 情况 2.5：**别名导入** `X as Y` —— 必须删整个说明符。
      // 只删 Y 会留下悬空的 `X as` → `Unexpected token as`（第一版就栽在这，
      // 自检闸门把它抓了出来）。
      const aliasM = line.match(/^\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*),?\s*$/);
      if (aliasM && aliasM[2] === it.name) {
        lines.splice(idx, 1);
        continue;
      }
      // 情况 3：同行多说明符 → 删该说明符与相邻一个逗号
      const re1 = new RegExp(`(?<![\\w$])${nm}(?![\\w$])\\s*,\\s*`);
      const re2 = new RegExp(`\\s*,\\s*(?<![\\w$])${nm}(?![\\w$])`);
      if (re1.test(line)) lines[idx] = line.replace(re1, '');
      else if (re2.test(line)) lines[idx] = line.replace(re2, '');
      else {
        failed.push(`${rel}:${it.line} B ${it.name} 未能安全定位`);
        continue;
      }
    }
  }
  writeFileSync(abs, lines.join('\n'));
  touched++;
}

const errorsAfter = countErrors();
console.log(`已写入：${touched} 个文件`);
if (failed.length) {
  console.log(`\n跳过 ${failed.length} 处（未安全定位，保持原样）：`);
  for (const f of failed.slice(0, 15)) console.log('  ' + f);
}
console.log(`\n自检：eslint error ${errorsBefore.length} → ${errorsAfter.length}`);
if (errorsAfter.length > errorsBefore.length) {
  console.log('❌ 自检失败（引入了新 error）→ **自动整体回滚**');
  console.log('   新增的 error：');
  for (const e of errorsAfter.slice(0, 15)) console.log('     ' + e);
  for (const b of readdirSync(backupDir)) {
    const rel = b.replace(/^\d+-/, '').replace(/__/g, '/');
    copyFileSync(`${backupDir}/${b}`, `${ROOT}/${rel}`);
  }
  console.log('已回滚。请修正脚本后重试。');
  process.exit(1);
}
console.log('✅ 自检通过：没有引入新 error');
