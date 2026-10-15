#!/usr/bin/env node
/**
 * check-root-clean.mjs — 「不要往根目录新增 demo」这条规则的门禁化
 *
 * ── 背景 ────────────────────────────────────────────────────────────
 * AGENTS.md §6 早就写了：「不要往仓库根目录新增 `xxx-demo.html`（已有 14 个是历史债，
 * 不再增加）」。但 2026-10-15 的 AI 环境审计实测：根目录已有 **24 个** html 沙盒，
 * 而且 `demo-bohai-glass-refract.html` / `demo-wxperia-liquid.html` 都是**未跟踪的新增**。
 * 规则写了等于没写 —— 因为它**没有牙**：没有门禁、没有归拢目录，
 * 每次做视觉沙盒"顺手放根目录"都不会有任何反馈。
 *
 * 结论与做法：**与其继续写"不要放"，不如让门禁替你把这句话的执行成本归零。**
 *
 * ── 为什么是「棘轮」而不是「要么全删、要么全留」─────────────────────
 * 直接把 24 个 demo 判红，只会逼人 `--no-verify`；强行要求"立刻全部平移到 docs/demos/"
 * 又得先拍板（根目录放原型是这个仓库的**既有惯例**，`ai-config-demo.html`、
 * `boh-fenjing-demo.html` 都这么来的 —— 惯例 vs 规则本身在打架，需人来裁）。
 *
 * 所以这里走本仓库的既定套路：**冻结现状 = 棘轮**。
 *   · 现存 24 个 → 基线记账，不判红（存量债，明账）；
 *   · 任何**新增**的根目录沙盒 → 立刻 exit 1，并告诉你该放哪儿；
 *   · 真要归拢时用 `--update` 把基线降下来（下调永远是好方向）。
 * 换句话说：这一步不逼任何人现在做决定，只**止住增长**。
 *
 * 用法：
 *   node scripts/check-root-clean.mjs            # 判红模式
 *   node scripts/check-root-clean.mjs --update   # 以当前根目录重写基线（归拢后下调）
 *   node scripts/check-root-clean.mjs --json     # 机读出口（供 check-ratchet-summary 汇总）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'scripts', 'root-clean-baseline.json');
const UPDATE = process.argv.includes('--update');

/** Vite 入口，**永远**允许 —— 它不是沙盒，少了它整个站都起不来。 */
const ENTRY = new Set(['index.html']);

/**
 * 「根目录临时脚本」的识别式。
 * 判据来自审计实测的残留物（`repro-import-tmp.mjs` / `diag-render-tmp.mjs` / `test_dm_ui.py`）：
 * 临时性写在名字里（`-tmp` / `repro-` / `diag-` / `test_*`）。
 * 刻意写得**窄**：宁可漏放一个，也不要误伤 `vite.config.js` 这类真实配置
 * （误伤会让人习惯性 `--no-verify`，那比没有门禁更糟）。
 */
const SCRATCH_RE = /^(repro-|diag-|test_)|-tmp\.(mjs|js|cjs|py)$/;

const SKIP = new Set(['stats.html']); // 构建报告，已被 .gitignore 忽略，不是沙盒

const entries = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name);

const htmlFiles = entries
  .filter((n) => n.endsWith('.html') && !ENTRY.has(n) && !SKIP.has(n))
  .sort();
const scratchFiles = entries.filter((n) => SCRATCH_RE.test(n)).sort();

if (UPDATE || !existsSync(BASELINE_FILE)) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify(
      {
        note:
          '根目录沙盒棘轮基线（check-root-clean.mjs）。' +
          '存量记账、只许下调；新增根目录 *.html 或临时脚本会 exit 1。' +
          '归拢到 docs/demos/ 之后跑 npm run check:root-clean:update 下调。',
        html: htmlFiles,
        scratch: scratchFiles,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `✅ 基线已${UPDATE ? '更新' : '建立'}：根目录沙盒 html ${htmlFiles.length} 个 + 临时脚本 ${scratchFiles.length} 个`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const allow = (list) => new Set(list || []);

// 机读出口：供 check-ratchet-summary.mjs 汇总「棘轮总账」。
// 只报数、不判定、不改退出码语义 —— 汇总器不该复制一遍计数逻辑（那就是第二份真源）。
if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({
      ratchet: 'root-clean',
      label: '根目录沙盒',
      current: htmlFiles.length + scratchFiles.length,
      baseline: allow(baseline.html).size + allow(baseline.scratch).size,
      unit: '个',
    }),
  );
  process.exit(0);
}

const violations = [];
for (const n of htmlFiles) {
  if (!allow(baseline.html).has(n)) {
    violations.push({ name: n, kind: 'html' });
  }
}
for (const n of scratchFiles) {
  if (!allow(baseline.scratch).has(n)) {
    violations.push({ name: n, kind: 'scratch' });
  }
}

if (violations.length) {
  console.error('❌ 根目录新增了沙盒文件（AGENTS.md §6：「已有存量是历史债，不再增加」）：\n');
  for (const v of violations) {
    console.error(`   + ${v.name}${v.kind === 'scratch' ? '   （临时脚本）' : ''}`);
  }
  console.error(
    `\n现存基线：html ${htmlFiles.length - violations.filter((v) => v.kind === 'html').length} 个` +
      ` + 临时脚本 ${scratchFiles.length - violations.filter((v) => v.kind === 'scratch').length} 个。`,
  );
  console.error('\n正确落点（二选一，别放根目录）：');
  console.error('   · 长期保留的原型/沙盒  →  docs/demos/');
  console.error('   · 一次性复现脚本       →  用完即删，或 scripts/probes/ 下带明确命名');
  console.error('\n若确认这是有意保留的新原型，走 `npm run check:root-clean:update` 并');
  console.error('在 commit message 里说明「为什么必须放根目录」—— 抬基线要交代理由。');
  process.exit(1);
}

const saved =
  allow(baseline.html).size +
  allow(baseline.scratch).size -
  (htmlFiles.length + scratchFiles.length);
console.log(
  `✅ 根目录沙盒未增长：html ${htmlFiles.length}（基线 ${baseline.html.length}）+ ` +
    `临时脚本 ${scratchFiles.length}（基线 ${baseline.scratch.length}）` +
    (saved > 0 ? `（已削减 ${saved}，记得 --update 下调基线）` : ''),
);
