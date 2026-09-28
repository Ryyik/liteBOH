#!/usr/bin/env node
/**
 * audit-css.mjs — CSS 只读审计（**不做任何删除**）
 *
 * 为什么要有这个工具：本仓库的 CSS 债一直缺一个可信的判据。
 * 2026-09-28 的教训是——**判据错了比没有判据更危险**：
 *   · 报告说「CSS 孤儿约 311 个类」，自建审计实测 1404 个（差 4.5 倍）；
 *   · 我第一版审计器因为「scoped 样式的定义方与使用方是同一个 .vue」误报 4193 个（55%）；
 *   · 我统计 partial 重复时只数了 `.g-*`，漏掉 base/responsive/console 用的其他前缀，
 *     把 443KB 的重复误判成 24KB。
 * 所以本工具把已知的四类假阳性逐一规避，并在输出里标注置信度，而不是给一个笼统的数。
 *
 * 用法：
 *   node scripts/audit-css.mjs                 全部
 *   node scripts/audit-css.mjs --orphans       只看孤儿类名
 *   node scripts/audit-css.mjs --duplication   只看共享 partial 的重复体量
 *   node scripts/audit-css.mjs --json          机读输出
 *
 * ⚠️ 只报告，不删除。删 CSS 必须配视觉回归，而本工具不提供那个能力。
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const ONLY_ORPHANS = argv.includes('--orphans');
const ONLY_DUP = argv.includes('--duplication');
const AS_JSON = argv.includes('--json');

// ── 文件收集 ────────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-check',
  '.build-verify',
  'coverage',
]);
const walk = (dir, out = []) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const srcFiles = walk(join(ROOT, 'src'));
const rel = (f) => relative(ROOT, f).split('\\').join('/');
const cssFiles = srcFiles.filter((f) => f.endsWith('.css'));
const vueFiles = srcFiles.filter((f) => f.endsWith('.vue'));
const codeFiles = srcFiles.filter((f) => /\.(js|mjs|ts|vue|css)$/.test(f));

/**
 * 从 CSS 文本里抽「选择器里出现的类名」。
 *
 * 必须按 brace-depth 扫描、**只取规则前导（prelude）**，否则声明值里的 `.5`、`-square`
 * 之类会被正则当成类名（这正是第一版审计器的一类假阳性）。
 * 同时跳过 @keyframes 块内部（那里是 0%/to 之类的关键帧选择器，不是类名）。
 */
const extractClasses = (cssText) => {
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const out = new Set();
  const stack = []; // 'rule' | 'at' | 'keyframes'
  let prelude = '';

  const takePrelude = (kind) => {
    if (kind !== 'keyframes' && !/^\s*@/.test(prelude)) {
      for (const m of prelude.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(m[1]);
    }
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const trimmed = prelude.trim();
      let kind = 'rule';
      if (/^@keyframes\b/i.test(trimmed)) kind = 'keyframes';
      else if (/^@/.test(trimmed)) kind = 'at';
      takePrelude(kind);
      stack.push(kind);
      prelude = '';
    } else if (ch === '}') {
      stack.pop();
      prelude = '';
    } else if (ch === ';') {
      // 任何 `;` 都终结一条声明/语句 —— 必须清空，否则规则内的声明文本会累积进
      // 下一次的「前导」，把值里的 `.5` / `-link` 之类当成类名（第一版的假阳性来源）。
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return out;
};

/** 取 .vue 的 <style> 块内容 */
const styleBlocks = (vueText) =>
  [...vueText.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
/** 取 .vue 的模板+脚本（剥掉 <style>），用于「使用面」判定 */
const withoutStyle = (vueText) => vueText.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

// ── 1) 孤儿类名 ─────────────────────────────────────────────────────
const buildOrphanReport = () => {
  /** 类名 → 定义它的文件集合 */
  const defined = new Map();
  const addDefs = (classes, file) => {
    for (const c of classes) {
      if (!defined.has(c)) defined.set(c, new Set());
      defined.get(c).add(file);
    }
  };
  for (const f of cssFiles) addDefs(extractClasses(readFileSync(f, 'utf-8')), rel(f));
  for (const f of vueFiles) addDefs(extractClasses(styleBlocks(readFileSync(f, 'utf-8'))), rel(f));

  /**
   * 动态拼名：`badge-${x}` / 'badge-' + x / "badge-" + x
   * 这些前缀下任何类名都可能在运行时出现，**不能判为孤儿**。
   * （这是第二类假阳性。）
   */
  const dynamicPrefixes = new Set();
  for (const f of codeFiles) {
    const t = readFileSync(f, 'utf-8');
    for (const m of t.matchAll(/[`'"]([A-Za-z][A-Za-z0-9_-]*?)-?\$\{/g)) dynamicPrefixes.add(m[1]);
    for (const m of t.matchAll(/[`'"]([A-Za-z][A-Za-z0-9_-]*-)\s*\+/g)) dynamicPrefixes.add(m[1]);
  }

  /** 使用面文本 */
  const usage = [];
  for (const f of codeFiles) {
    const t = readFileSync(f, 'utf-8');
    usage.push({ file: rel(f), text: f.endsWith('.vue') ? withoutStyle(t) : t });
  }

  /**
   * Vue <Transition> / <TransitionGroup> 的类是**运行时生成**的，源码里天然不出现：
   *   <Transition name="bag-item"> → bag-item-enter-active / -enter-from / -enter-to
   *                                   / -leave-active / -leave-from / -leave-to / -move
   * 不排除它们就会把一批合法的动画类判成孤儿（第三类假阳性）。
   * 默认名（不写 name）是 v-enter-* 等，一并排除。
   */
  const transitionClasses = new Set();
  const SUFFIXES = [
    'enter-active',
    'enter-from',
    'enter-to',
    'leave-active',
    'leave-from',
    'leave-to',
    'move',
    'appear-active',
    'appear-from',
    'appear-to',
  ];
  const names = new Set(['v']);
  for (const f of vueFiles) {
    const t = readFileSync(f, 'utf-8');
    // 注意大小写：源码里两种写法都有（<Transition> 与 <transition>），必须 i 标志。
    for (const m of t.matchAll(/<transition(?:group)?\b[^>]*?\bname=["']([^"']+)["']/gi)) {
      names.add(m[1]);
    }
  }
  for (const n of names) for (const s of SUFFIXES) transitionClasses.add(`${n}-${s}`);

  const orphans = [];
  const cssOnly = [];
  const transitionSuspect = [];
  const TRANSITION_SUFFIX = /-(enter|leave|appear)-(active|from|to)$|-move$/;
  for (const [cls, definers] of defined) {
    if (transitionClasses.has(cls)) continue; // 已由 <transition name="…"> 证明在用
    if (cls.startsWith('-') || cls.endsWith('-')) continue; // 解析残渣，不是合法类名
    if ([...dynamicPrefixes].some((p) => cls.startsWith(p))) continue; // 动态可达，跳过
    const re = new RegExp(
      `(?<![A-Za-z0-9_-])${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`,
    );
    let hitNonCss = false;
    let hitCss = false;
    for (const { file, text } of usage) {
      if (file.endsWith('.css') && definers.has(file)) continue; // 别拿定义它的 CSS 自证
      if (!re.test(text)) continue;
      if (file.endsWith('.css')) hitCss = true;
      else hitNonCss = true;
      if (hitNonCss) break;
    }
    if (hitNonCss) continue;
    // 形如 xxx-enter-active 但没找到对应的 <transition name="xxx">：
    // 要么 name 是动态拼的，要么就是真死代码 —— 工具分不清，**不冒充确定结论**。
    if (TRANSITION_SUFFIX.test(cls)) transitionSuspect.push(cls);
    else (hitCss ? cssOnly : orphans).push(cls);
  }

  return {
    definedCount: defined.size,
    orphans: orphans.sort(),
    cssOnly: cssOnly.sort(),
    transitionSuspect: transitionSuspect.sort(),
    dynamicPrefixes: [...dynamicPrefixes].sort(),
    transitionClasses: [...transitionClasses].sort(),
  };
};

// ── 2) 共享 partial 的重复体量 ──────────────────────────────────────
/**
 * 正确口径（2026-09-28 实测得出）：
 *   重复字节 = 文件体积 × (被 .vue 以 @import 引入的次数 − 1)
 * 不要去数产物里的选择器 —— 各 partial 前缀不同，极易漏（我漏过 443KB）。
 *
 * ⚠️ 必须按**解析后的真实路径**匹配，不能按 basename：
 *    全仓有一堆同名 `style.scoped.css`，按 basename 匹配会得到「被 17 个文件导入」
 *    这种离谱结果（第一版本工具就栽在这里）。@import 的路径要相对**导入方所在目录**解析。
 */
const normalize = (p) => p.split('\\').join('/');
const resolveImport = (fromFile, spec) => {
  if (!spec.startsWith('.')) return null; // 只处理相对路径；裸包名/别名不参与
  const baseDir = fromFile.slice(0, fromFile.lastIndexOf('/'));
  const parts = `${baseDir}/${spec}`.split('/');
  const stack = [];
  for (const seg of parts) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') stack.pop();
    else stack.push(seg);
  }
  return stack.join('/');
};

const buildDuplicationReport = () => {
  // 收集所有 .vue 的 @import 目标（解析后）
  const importedBy = new Map(); // 解析后的路径 → 导入方列表
  for (const f of vueFiles) {
    const rf = rel(f);
    const text = readFileSync(f, 'utf-8');
    for (const m of text.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
      const resolved = resolveImport(rf, m[1]);
      if (!resolved) continue;
      if (!importedBy.has(resolved)) importedBy.set(resolved, []);
      importedBy.get(resolved).push(rf);
    }
  }

  const rows = [];
  for (const f of cssFiles) {
    const rf = rel(f);
    const importers = importedBy.get(normalize(rf)) || [];
    if (importers.length < 2) continue; // 只被 1 次引用 → 不产生重复
    const size = statSync(f).size;
    rows.push({
      file: rf,
      size,
      importers: importers.length,
      wasted: size * (importers.length - 1),
      importerList: importers,
    });
  }
  rows.sort((a, b) => b.wasted - a.wasted);
  return rows;
};

// ── 输出 ────────────────────────────────────────────────────────────
const orphanReport = ONLY_DUP ? null : buildOrphanReport();
const dupReport = ONLY_ORPHANS ? null : buildDuplicationReport();

if (AS_JSON) {
  console.log(JSON.stringify({ orphans: orphanReport, duplication: dupReport }, null, 2));
  process.exit(0);
}

if (orphanReport) {
  const { definedCount, orphans, cssOnly, transitionSuspect, dynamicPrefixes, transitionClasses } =
    orphanReport;
  console.log('═══ 孤儿类名（只报告，不删除）═══');
  console.log(`定义过的类名（去重）：${definedCount}`);
  console.log(`  确定孤儿（除定义处外，全仓任何地方都不出现）：${orphans.length}`);
  console.log(`  疑似孤儿（只被别的 CSS 引用，可能是复合选择器）：${cssOnly.length}`);
  console.log(
    `  待确认过渡类（形如 *-enter-active 但没找到 <transition name="…">）：${transitionSuspect.length}`,
  );
  console.log(`  已排除的动态拼名前缀：${dynamicPrefixes.length} 个`);
  console.log(`  已排除的过渡类（由 <transition name> 证明在用）：${transitionClasses.length} 个`);
  console.log('');
  console.log('  确定孤儿（前 40）：');
  for (const c of orphans.slice(0, 40)) console.log(`    .${c}`);
  if (orphans.length > 40) console.log(`    …还有 ${orphans.length - 40} 个`);
  console.log('');
  console.log('  ⚠️ 删之前必须做视觉回归 —— 本工具不提供那个能力，也不建议凭这份清单直接删。');
  console.log('  ⚠️ 「待确认过渡类」尤其别直接删：动态 :name 拼出来的话，删了动画就没了。');
  console.log('');
}

if (dupReport) {
  const totalWasted = dupReport.reduce((a, r) => a + r.wasted, 0);
  console.log('═══ 共享 partial 的 scoped @import 重复 ═══');
  console.log('（口径：体积 × (被 .vue @import 的次数 − 1)；被 1 次引用的不产生重复）');
  console.log('');
  console.log(
    `  ${'文件'.padEnd(46)}${'体积'.padStart(8)}${'导入方'.padStart(7)}${'重复字节'.padStart(10)}`,
  );
  for (const r of dupReport) {
    const name = r.file.length > 44 ? '…' + r.file.slice(-43) : r.file;
    console.log(
      `  ${name.padEnd(46)}${String(r.size).padStart(8)}${String(r.importers).padStart(7)}${String(r.wasted).padStart(10)}`,
    );
  }
  console.log('');
  console.log(`  可回收合计：${totalWasted} bytes（${(totalWasted / 1024).toFixed(0)} KB）`);
  console.log('');
  console.log('  修法：把被多处 scoped 导入的 partial 改为「真全局、只加载一次」——');
  console.log(
    '        前提是类名已命名空间化，否则会泄漏全站。参见 commit ca6eb30d 的 google-components.css 案例。',
  );
}
