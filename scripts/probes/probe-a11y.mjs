import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// =====================================================================
// 探针：全站无障碍（axe-core）—— 棘轮模式（2026-10-04 新增）
//
//   为什么要有这条：本仓有 200+ 个探针，但**零无障碍断言** ——
//   对比度、缺 label、焦点顺序、ARIA 误用这些问题没有任何机制能发现。
//   工具用 axe-core（Deque 的 WCAG 规则引擎，业界事实标准），
//   通过 `@axe-core/playwright` 驱动，**与既有探针同栈**（都是 Playwright）。
//
//   为什么是棘轮而不是「必须全绿」：
//     无障碍债是**存量**（本仓从未做过 a11y 治理），一次要求全绿不现实，
//     会逼出「关掉规则」这种自欺。所以沿用本仓 `check-important-budget` /
//     `check:dark-tokens` 的套路：**存量锁死、只许降不许升**，新增即失败。
//
//   用法：
//     node scripts/probes/probe-a11y.mjs            # 对比基线，新增违规即 exit 1
//     node scripts/probes/probe-a11y.mjs --update   # 以当前状态重写基线（清理后用）
//     node scripts/probes/probe-a11y.mjs --report   # 只打印当前违规，不做判定
//
//   ⚠️ 基线键是 `页面::规则id::impact`，**不是只按规则 id** ——
//      同一个规则在不同页面上的成因往往不同（例如 color-contrast 在首页是
//      深色 hero、在 AI 页是气泡），只按规则聚合会让「A 页修好了、B 页新增了」
//      互相抵消，棘轮当场失去意义。
//
//   覆盖页面选的是**不需要登录、无首屏 gate 阻塞**的公开页；
//     首页 `#/` 有开场 gate（见 AGENTS.md 的智能概览条目），
//     所以额外采一次 `/?view=latest` 拿论坛列表态。
// =====================================================================
const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const BASELINE_FILE = join(process.cwd(), 'scripts', 'a11y-baseline.json');

const UPDATE = process.argv.includes('--update');
const REPORT_ONLY = process.argv.includes('--report');

/** 只跑 WCAG A/AA（AAA 与本项目的产品目标不符，且噪音大）。 */
const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

const PAGES = [
  { name: '首页', hash: '#/' },
  { name: '论坛列表', hash: '#/?view=latest' },
  { name: '摄影集', hash: '#/albums' },
  { name: 'BOH AI', hash: '#/ai-chat' },
  { name: '关于我们', hash: '#/about' },
];

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const current = {}; // "页面::规则::impact" -> count
const perPage = {};

for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/${p.hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const res = await new AxeBuilder({ page }).options(AXE_OPTIONS).analyze();

    const byRule = {};
    for (const v of res.violations) {
      // 一个规则可命中多个节点；键里带 impact 是因为同一规则在不同影响级别下的
      // 处置优先级不同（serious 与 moderate 不该互相抵消）。
      const key = `${p.name}::${v.id}::${v.impact || 'unknown'}`;
      current[key] = (current[key] || 0) + v.nodes.length;
      byRule[v.id] = (byRule[v.id] || 0) + v.nodes.length;
    }
    perPage[p.name] = {
      violations: res.violations.length,
      nodes: Object.values(byRule).reduce((a, b) => a + b, 0),
      byRule,
    };
    console.log(
      `  · ${p.name.padEnd(6)} 违规规则 ${String(res.violations.length).padStart(2)} 条 / 命中节点 ${String(perPage[p.name].nodes).padStart(3)} 个` +
        (res.violations.length
          ? `  ${res.violations.map((v) => `${v.id}(${v.impact})`).join(', ')}`
          : ''),
    );
  } catch (e) {
    check(`[${p.name}] 扫描完成`, false, String(e.message).slice(0, 120));
  } finally {
    await ctx.close();
  }
}
await browser.close();

const totalNodes = Object.values(current).reduce((a, b) => a + b, 0);

if (REPORT_ONLY) {
  console.log(`\n[report] 当前共 ${totalNodes} 个违规节点，分布：`);
  for (const [k, v] of Object.entries(current).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)}  ${k}`);
  }
  process.exit(0);
}

if (UPDATE || !existsSync(BASELINE_FILE)) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), nodes: current }, null, 2)}\n`,
  );
  if (UPDATE) {
    console.log(`\n✅ 无障碍基线已更新：${totalNodes} 个违规节点`);
    process.exit(0);
  }
  console.log(
    `\n⚠️ 首次运行：已写出基线 ${BASELINE_FILE}（${totalNodes} 个节点）。下次起改为棘轮判定。`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')).nodes || {};
// ⚠️ 容差是**必需**的，不是偷懒：论坛列表是虚拟滚动 + 广告位动态插入，
// 同一份代码两次扫描的节点数会 ±1~2 抖动。精确计数会变成「假红生成器」，
// 而假红比没有门禁更糟（人会开始无视它）。
// 判定分两档：① **出现基线里没有的键**（新的 页面::规则::impact 组合）⇒ 立即红，
//            ② 已有键的增长超过 TOLERANCE ⇒ 红。
const TOLERANCE = 3;
const regressions = [];
const improvements = [];

for (const [key, n] of Object.entries(current)) {
  const base = baseline[key];
  if (base === undefined) regressions.push({ key, base: 0, now: n, kind: '新增键' });
  else if (n > base + TOLERANCE) regressions.push({ key, base, now: n, kind: '增长超容差' });
  else if (n < base) improvements.push({ key, base, now: n });
}
for (const key of Object.keys(baseline)) {
  if (!(key in current)) improvements.push({ key, base: baseline[key], now: 0 });
}

console.log('');
if (improvements.length) {
  console.log(`✅ 已削减 ${improvements.length} 项（记得 --update 下调基线）：`);
  for (const i of improvements) console.log(`   ${i.key}  ${i.base} → ${i.now}`);
}

if (!regressions.length) {
  check(
    `无障碍未新增违规（当前 ${totalNodes} 个节点，基线 ${Object.values(baseline).reduce((a, b) => a + b, 0)} 个）`,
    true,
  );
} else {
  console.log(`❌ 新增 ${regressions.length} 项无障碍违规：`);
  for (const r of regressions)
    console.log(`   [${r.kind}] ${r.key}  基线 ${r.base} → 当前 ${r.now}`);
  check('无障碍未新增违规', false, `新增 ${regressions.length} 项`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n合计 ${results.length} 条，失败 ${failed.length} 条`);
process.exit(failed.length ? 1 : 0);
