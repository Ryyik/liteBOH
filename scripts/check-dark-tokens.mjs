#!/usr/bin/env node
/**
 * check-dark-tokens.mjs — 暗色裸色棘轮门禁
 *
 * 背景（2026-09-18 全量调研，见 docs/dark-mode-audit-report-2026-09-18.md）：
 * src 下位于暗色规则块内的颜色字面量有 ≈2800 个（分布在 89 个文件），
 * 而 themes/*.css 的 token 化率只有约 9% —— 也就是说 token 层设计是对的，
 * 却被 90 个文件的裸字面量绕过，导致"任何一次调色都要改约 2800 处"。
 *
 * 项目已有三道同型门禁（check-liquid-glass / check-important-budget /
 * check-first-paint），唯独暗色没有。本门禁按同一套路数把存量锁死。
 *
 * 三档策略 —— 牙齿只长在"已经干净的地方"：
 *   1) **分区严格（始终生效）**：scripts/dark-gate-scopes.json 的 strict 名单里的区域表示
 *      "已清扫到 0 个裸色"，再出现即 exit 1。名单为空时这一档不存在。
 *      这是唯一适合进部署链的一档 —— 它只覆盖已经干净的地方，假红概率极低。
 *   2) **全局总量观察（默认）**：总量涨了只打印 ⚠️ + 增长明细，exit 0，**永不让构建失败**。
 *      暗色还在迁移中途，拿总量硬卡构建会把正常迭代挡在门外（新页面、并行工作流）。
 *   3) **全局总量严格（--strict）**：总量涨即 exit 1。等 P2/P3 把 token 补齐、
 *      存量压下来之后，再决定要不要切。切法只是把 build:ci 里的脚本换成 :strict 那条。
 *
 * 其余口径：
 *   - 只降不升：棘轮看**总量**（单文件增长只打印定位提示，不判红 —— 否则
 *     "把样式从 A 文件搬到 B 文件"这种重构会被误判成新增债务）；
 *   - 新文件记入增长明细并带 [新文件] 标记；
 *   - 存量减少时顺手下调基线（--update），让预算单调递减；
 *   - 计数口径的单一实现在 scripts/lib/dark-token-counter.mjs（与出报告用的
 *     dark-token-scan.mjs 共用），且计数前剥掉注释（否则注释里提到色值/important
 *     会被算成真实声明 —— check-important-budget 曾因此假红过）。
 *
 * 注意：!important 不在这里棘轮 —— 那属于 check:important-budget 的职责
 * （其白名单排除了 themes/，见 plans/007）。本脚本只做参考值打印，避免同一属性
 * 出现两个互相打架的预算。要收紧 themes/ 的 !important，正确做法是把该目录
 * 移出白名单后 --update 一次，而不是在这里加第二个数。
 *
 * 用法：
 *   node scripts/check-dark-tokens.mjs            观察模式（默认）：只报告，exit 0
 *   node scripts/check-dark-tokens.mjs --strict   总量上升时 exit 1（切严格卡口用）
 *   node scripts/check-dark-tokens.mjs --update   以当前数量重写基线（有意削减/登记后使用）
 *   node scripts/check-dark-tokens.mjs --all      连未跟踪文件一起看（只报告，不判定）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanDarkTokens } from './lib/dark-token-counter.mjs';

const ROOT = process.cwd();
const BUDGET_FILE = join(ROOT, 'scripts', 'dark-token-budget.json');
const SCOPES_FILE = join(ROOT, 'scripts', 'dark-gate-scopes.json');
const UPDATE = process.argv.includes('--update');
const ALL = process.argv.includes('--all');
const STRICT = process.argv.includes('--strict');

/** glob → RegExp：** 跨目录、* 不跨 / */
const globToRe = (glob) =>
  new RegExp(
    '^' +
      glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*') +
      '$'
  );

const { darkLiterals, darkFiles, literalPerFile, importantTotal } = scanDarkTokens({ tracked: !ALL });

if (ALL) {
  console.log(`[check:dark-tokens] 审计模式（含未跟踪文件）：${darkLiterals} 字面量 / ${darkFiles.length} 文件 / ${importantTotal} important`);
  process.exit(0);
}

if (UPDATE || !existsSync(BUDGET_FILE)) {
  const next = {
    total: darkLiterals,
    perFile: Object.fromEntries([...literalPerFile.entries()].sort((a, b) => b[1] - a[1])),
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(BUDGET_FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(`✅ 基线已${UPDATE ? '更新' : '建立'}：${darkLiterals} 个暗色字面量（${Object.keys(next.perFile).length} 个文件）`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'));

// ── 分区棘轮（牙齿只长在已经干净的地方）─────────────────────────────
// strict 名单里的 glob 表示"这块已经清扫到 0 个裸色"；再出现即 exit 1，
// 且**不受观察模式影响** —— 已清扫区域本来就不该有新裸色，假红概率极低，
// 所以这部分可以有牙齿、可以进部署链。名单为空 → 本门禁永不阻断构建。
const scopes = existsSync(SCOPES_FILE) ? JSON.parse(readFileSync(SCOPES_FILE, 'utf-8')) : { strict: [] };
const strictRegs = (scopes.strict || []).map((g) => ({ glob: g, re: globToRe(g) }));
const scopeHits = [...literalPerFile.entries()]
  .filter(([file, n]) => n > 0 && strictRegs.some((s) => s.re.test(file)))
  .sort((a, b) => b[1] - a[1]);

if (scopeHits.length) {
  console.error('❌ 已清扫完毕的暗色区域里又出现了裸色字面量（这些区域基线为 0）：');
  scopeHits.forEach(([file, n]) => {
    const hit = strictRegs.filter((s) => s.re.test(file)).map((s) => s.glob).join(', ');
    console.error(`   ${file}: ${n} 处   ← 命中严格名单 ${hit}`);
  });
  console.error('\n  这些文件已经 token 化过，出现裸色通常是复制了旧写法。改回 var() 即可；');
  console.error(`  若确实要放宽该区域，编辑 ${SCOPES_FILE.replace(ROOT + '/', '')} 把它移出 strict。`);
  process.exit(1);
}

// ── 全局总量棘轮（默认只报告）────────────────────────────────────
// 口径：**看总量**，单文件增长只作为定位提示。按文件判红会把"把一段暗色样式
// 从 A 文件挪到 B 文件 / 拆文件"这类重构也判红，那是假红 —— 债务没有增加。
// （存量减少时的 --update 会把 perFile 一起下调，所以两边不会长期分叉。）
const growth = [...literalPerFile.entries()]
  .filter(([file, n]) => n > (budget.perFile[file] ?? 0))
  .sort((a, b) => b[1] - (budget.perFile[b[0]] ?? 0) - (a[1] - (budget.perFile[a[0]] ?? 0)));
const newFiles = growth.filter(([file]) => !(file in budget.perFile));
const totalUp = darkLiterals > budget.total;

if (totalUp) {
  const tag = STRICT ? '❌' : '⚠️ ';
  const tail = STRICT ? '' : '  [观察模式：不影响本次构建]';
  console.error(`${tag} 暗色裸色总量上升：${budget.total} → ${darkLiterals}（+${darkLiterals - budget.total}）${tail}`);
  if (growth.length) {
    console.error('   本次增长的文件（若只是文件间搬移，总量不会上升）：');
    growth.forEach(([file, n]) => {
      const base = budget.perFile[file] ?? 0;
      console.error(`     ${newFiles.some(([f]) => f === file) ? '[新文件] ' : ''}${file}: ${base} → ${n} (+${n - base})`);
    });
  }
  console.error('\n可选做法：');
  console.error('  · 优先把裸值换成同文件/同页面已有的 var()（多数文件里 token 早已定义好，只是没被消费）；');
  console.error('  · 确实需要新增 token 时，加在 src/styles/themes/dark-mode.css 的 token 块，然后引用它；');
  console.error('  · 确属有意为之（迁移中途的过渡态、新页面早期形态）：node scripts/check-dark-tokens.mjs --update 登记基线。');
  console.error('  详情见 docs/dark-mode-audit-report-2026-09-18.md');
  if (STRICT) process.exit(1);
  process.exit(0);
}

const saved = budget.total - darkLiterals;
console.log(
  `✅ 暗色裸色预算通过${STRICT ? '（严格模式）' : '（观察模式，不阻断构建）'}：当前 ${darkLiterals} / 基线 ${budget.total}（${darkFiles.length} 个文件）` +
    (saved > 0 ? `（已削减 ${saved}，记得 --update 下调基线）` : '')
);
console.log(
  `   分区棘轮名单：${strictRegs.length ? `${strictRegs.length} 条严格区域（任一出现裸色即失败）` : '空 —— 本门禁当前不会阻断任何构建'}`
);
if (growth.length) {
  console.log('   提示：以下文件增长但总量未增（文件间搬移，不判红）：');
  growth.forEach(([file, n]) => console.log(`     ${file}: ${budget.perFile[file] ?? 0} → ${n}`));
}
console.log(`   参考值：暗色块内 !important ${importantTotal} 处 —— 由 check:important-budget 负责棘轮，此处只观测`);
