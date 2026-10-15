#!/usr/bin/env node
/**
 * check-doc-truth.mjs — 「文档断言」与「仓库实况」的对账门禁
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 本仓库最忌讳的是「过时的结论继续被引用」。2026-10-15 的 AI 环境审计
 * 一口气抓到 **5 处文档数字漂移**：单元测试 131（实 211）、脚本 207（实 240）、
 * layering 基线 164/37（实 162/36）、根目录 demo 14（实 25）、lint 棘轮 118（实 116）。
 * 每一处都在教 AI/人按错误事实做决定。
 *
 * 人盯不住 —— 所以让门禁盯：**文档里写的数字，必须与当场实测一致。**
 *
 * 两条断言：
 *   1. **数字对账**（AGENTS.md 里的关键数字 vs 实测）—— 不一致即红；
 *      锚点丢失（正文改写了）→ **WARN 并逐条列出**（明账，每次 verify 都看得见，
 *      但不阻断 —— 因为锚点是散文，措辞演化不该卡死整个仓库）。
 *   2. **必读面字节预算**（AGENTS.md / docs/AI-ENV.md，棘轮只许降）——
 *      这两个文件**每次会话都会被读进上下文**，涨回去就是悄悄吃掉每个 AI 会话的预算。
 *
 * 用法：
 *   node scripts/check-doc-truth.mjs            # 对账
 *   node scripts/check-doc-truth.mjs --update   # 以当前值重写字节预算基线（只该在瘦身时用）
 *   node scripts/check-doc-truth.mjs --json     # 机读出口（供 check-ratchet-summary）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const BASELINE = join(ROOT, 'scripts', 'doc-truth-baseline.json');
const UPDATE = process.argv.includes('--update');

const AGENTS = 'AGENTS.md';
const AI_ENV = 'docs/AI-ENV.md';
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);

/** 计数必须用 tracked 文件集（git ls-files）：工作区里有并行会话未提交的新文件，
 *  文件系统口径会让数字随「谁在改什么」漂移，且本地绿/CI 红再犯。ls-files 对同一 commit 恒定。 */
const trackedCount = (dir, exts) =>
  execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', 'HEAD', '--', dir],
    {
      cwd: ROOT,
      encoding: 'utf-8',
    },
  )
    .split('\n')
    .filter(Boolean)
    .filter((f) => exts.some((x) => f.endsWith(x))).length;

const testsCount = trackedCount('tests', ['.test.js']);
const srcCount = trackedCount('src', ['.vue', '.js', '.ts']);
const probesCount = trackedCount('scripts/probes', ['.mjs']);
const scriptsTop = execFileSync(
  'git',
  ['-c', 'core.quotepath=false', 'ls-tree', '--name-only', 'HEAD', '--', 'scripts/'],
  { cwd: ROOT, encoding: 'utf-8' },
)
  .split('\n')
  .filter((f) => f.endsWith('.mjs')).length;
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lintLimit = Number((pkg.scripts?.lint || '').match(/--max-warnings\s+(\d+)/)?.[1] ?? NaN);

let layering = { total: null, files: null };
try {
  const b = JSON.parse(readFileSync(join(ROOT, 'scripts', 'layering-baseline.json'), 'utf8'));
  layering = { total: b.total, files: Object.keys(b.files || {}).length };
} catch {
  // 基线缺失：layering 两条对账跳过（下面按 null 处理，不算失败也不算通过）
}

let rootClean = { html: null, scratch: null };
try {
  const b = JSON.parse(readFileSync(join(ROOT, 'scripts', 'root-clean-baseline.json'), 'utf8'));
  rootClean = { html: (b.html || []).length, scratch: (b.scratch || []).length };
} catch {
  // 同上
}

const agents = read(AGENTS) || '';

/** 每条：锚点正则 → 取第 n 组 → 与实测比对。groups 里 null 表示该项跳过。 */
const CHECKS = [
  {
    label: '单元测试文件数',
    re: /(\d+) 个单元测试文件/,
    measure: () => [testsCount],
  },
  {
    label: 'src 源文件数',
    re: /`src\/` (\d+) 个源文件/,
    measure: () => [srcCount],
  },
  {
    label: '脚本数（总/顶/probes）',
    re: /(\d+) 个脚本（`scripts\/\*\.mjs` (\d+) \+ `scripts\/probes\/\*\.mjs` (\d+)）/,
    measure: () => [scriptsTop + probesCount, scriptsTop, probesCount],
  },
  {
    label: 'layering 棘轮基线（处/文件）',
    re: /基线 \*\*(\d+)\*\* 处 \/ (\d+) 文件/,
    measure: () => [layering.total, layering.files],
  },
  {
    label: '根目录沙盒冻结数（html/临时脚本）',
    re: /现存 (\d+) 个 html \+ (\d+) 个临时脚本/,
    measure: () => [rootClean.html, rootClean.scratch],
  },
  {
    label: 'lint 棘轮上限',
    re: /现为 (\d+)\*\*，以 `package\.json` 现值为准/,
    measure: () => [Number.isNaN(lintLimit) ? null : lintLimit],
  },
];

const violations = [];
const missingAnchors = [];

for (const c of CHECKS) {
  const m = agents.match(c.re);
  if (!m) {
    missingAnchors.push(c.label);
    continue;
  }
  const expected = c.measure();
  const got = m.slice(1).map(Number);
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] == null) continue; // 实测侧拿不到（如基线缺失）：不算失败
    if (got[i] !== expected[i]) {
      violations.push(`${c.label}：文档写 ${got[i]}，实测 ${expected[i]}`);
    }
  }
}

// ── 必读面字节预算（棘轮：只许降）────────────────────────────────────
const BUDGET_FILES = [AGENTS, AI_ENV];
const budget = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : { note: '必读面字节棘轮基线。只许下调；瘦身后跑 npm run check:doc-truth:update。', files: {} };
const budgetViolations = [];
const currentBytes = {};
for (const f of BUDGET_FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  const bytes = readFileSync(p).length;
  currentBytes[f] = bytes;
  const base = budget.files?.[f];
  if (base != null && bytes > base)
    budgetViolations.push(`${f}: ${bytes} > 基线 ${base} (+${bytes - base})`);
}

// 机读出口：供 check-ratchet-summary.mjs 汇总（只报数、不判定）。
if (process.argv.includes('--json')) {
  const total = BUDGET_FILES.reduce((a, f) => a + (currentBytes[f] || 0), 0);
  const baseTotal = BUDGET_FILES.reduce((a, f) => a + (budget.files?.[f] ?? 0), 0);
  console.log(
    JSON.stringify({
      ratchet: 'doc-truth',
      label: '必读面字节',
      current: total,
      baseline: baseTotal,
      unit: 'B',
    }),
  );
  process.exit(0);
}

if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ note: budget.note, files: currentBytes }, null, 2)}\n`,
  );
  console.log(
    `✅ 字节预算基线已${UPDATE ? '更新' : '建立'}：${BUDGET_FILES.map((f) => `${f}=${currentBytes[f] || 0}B`).join('，')}`,
  );
  // ⚠️ 必须在这里退出：内存里的 `budget` 还是**旧基线**，不退出的话下面的判定
  // 会拿旧基线比新值，输出「基线已更新」紧接着又报「超基线」——自相矛盾。
  // 2026-10-15 自查实测踩到（与 check-important-budget / check-root-clean 的
  // 「--update 后 exit 0」惯例不一致，本次对齐）。
  process.exit(0);
}

// ── 输出 ──────────────────────────────────────────────────────────────
if (missingAnchors.length) {
  console.warn(
    `⚠️ doc-truth 有 ${missingAnchors.length} 个锚点在 ${AGENTS} 里找不到（正文被改写？明账，不阻断）：`,
  );
  for (const l of missingAnchors) console.warn(`   · ${l}`);
  console.warn('   → 更新 check-doc-truth.mjs 里的正则，或把文档数字恢复成与实测一致。');
}

if (violations.length || budgetViolations.length) {
  console.error('');
  if (violations.length) {
    console.error(`❌ ${AGENTS} 的 ${violations.length} 个数字与实测不一致（过时的结论必须改）：`);
    for (const v of violations) console.error(`   · ${v}`);
    console.error(
      '\n   修法：改文档让它与实测一致（实测才是真源），或修真源（如果文档才是对的）。',
    );
  }
  if (budgetViolations.length) {
    console.error(`❌ 必读面字节超出棘轮基线（每次会话都要读进上下文，只许降不许涨）：`);
    for (const v of budgetViolations) console.error(`   · ${v}`);
    console.error(
      '\n   瘦身或外置后跑 npm run check:doc-truth:update 下调基线（上调需在 commit message 说明理由）。',
    );
  }
  process.exit(1);
}

console.log(
  `✅ doc-truth 通过：${CHECKS.length} 个文档数字与实测一致` +
    (missingAnchors.length ? `（${missingAnchors.length} 个锚点缺失已列明账）` : '') +
    `；必读面 ${AGENTS}=${currentBytes[AGENTS] || 0}B / ${AI_ENV}=${currentBytes[AI_ENV] || 0}B（基线内）`,
);
