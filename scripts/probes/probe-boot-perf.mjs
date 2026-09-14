/**
 * 首屏性能对比：改造前(dist) vs 改造后(dist-check)
 *
 * 目的：确认内联启动骨架**让首帧内容提前出现**，并且不拖慢挂载/可交互。
 *
 * ⚠️ 指标口径（2026-09-14 修正）：
 *   旧版的「首屏可交互」判据是"导航栏出现"，那实际等于 Vue mount 时刻，
 *   与骨架无关 —— 拿它论证骨架收益是错的。现在拆成三个互不混淆的指标：
 *     FCP          首个内容绘制（内联骨架会让它必然提前，只说明"有东西了"）
 *     vueMount     Vue 挂载完成（导航栏就位）
 *     主体首帧      路由页真实内容出现（用户真正要等的东西）
 *     骨架可见时长  .boh-boot 从出现到被 mount 清空的毫秒数（体验改善的直接度量）
 *
 * 用法（从仓库根目录运行；两个目标都要先准备好静态服务，且无 SW，口径一致）：
 *   npx vite build            → dist         （改造前基线，需在改动前构建的产物）
 *   npx vite build --outDir dist-check       （改造后产物）
 *   (cd dist && python3 -m http.server 4199 --bind 127.0.0.1) &        # 用 run_in_background
 *   (cd dist-check && python3 -m http.server 4200 --bind 127.0.0.1) &
 *   node scripts/probes/probe-boot-perf.mjs
 */
import { chromium } from 'playwright';

const TARGETS = [
  { label: '改造前 dist       ', base: 'http://127.0.0.1:4199' },
  { label: '改造后 dist-check ', base: 'http://127.0.0.1:4200' },
];

const ROUNDS = Number(process.env.ROUNDS || 3);

const launch = () => chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const collect = (page) => page.evaluate(() => {
  const paints = performance.getEntriesByType('paint');
  const fcp = paints.find((p) => p.name === 'first-contentful-paint');
  const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
  const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1] : null;
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const mark = window.__bootMark || {};
  return {
    fcp: fcp ? Math.round(fcp.startTime) : null,
    lcp: lcp ? Math.round(lcp.startTime) : null,
    domContentLoaded: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
    vueMount: mark.mounted ? Math.round(mark.mounted) : null,
    mainVisible: mark.mainVisible ? Math.round(mark.mainVisible) : null,
    skeletonVisibleMs: typeof mark.skeletonMs === 'number' ? Math.round(mark.skeletonMs) : null,
  };
});

const browser = await launch();
const results = {};

try {
  for (const target of TARGETS) {
    results[target.label] = [];
    for (let round = 1; round <= ROUNDS; round += 1) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        serviceWorkers: 'block',
      });
      const page = await context.newPage();

      // 逐帧打点：骨架可见窗口 / Vue 挂载 / 路由主体首帧
      await page.addInitScript(() => {
        window.__bootMark = { mounted: 0, mainVisible: 0, skeletonFirstSeenAt: 0, skeletonMs: undefined };
        // 路由主体 = #app 直系子元素里，排除导航栏/页脚/骨架/边缘触发器的那个有高度的元素
        const IGNORE = /^(unified-nav|footer-pages|boh-boot|boh-boot-body|ai-edge-trigger)$/;
        const mark = () => {
          if (!window.__bootMark.mounted) {
            const nav = document.querySelector('#unified-nav-container');
            if (nav && nav.getBoundingClientRect().height > 0) {
              window.__bootMark.mounted = performance.now();
            }
          }
          if (!window.__bootMark.mainVisible) {
            const main = [...document.querySelectorAll('#app > *')].find((el) => {
              const cls = (el.className || '').toString().split(' ')[0];
              return !IGNORE.test(cls) && el.getBoundingClientRect().height > 0;
            });
            if (main) window.__bootMark.mainVisible = performance.now();
          }
          const boot = document.querySelector('.boh-boot');
          if (boot && !window.__bootMark.skeletonFirstSeenAt) {
            window.__bootMark.skeletonFirstSeenAt = performance.now();
          }
          if (!boot && window.__bootMark.skeletonFirstSeenAt && window.__bootMark.skeletonMs === undefined) {
            window.__bootMark.skeletonMs = performance.now() - window.__bootMark.skeletonFirstSeenAt;
          }
          requestAnimationFrame(mark);
        };
        requestAnimationFrame(mark);
      });

      await page.goto(`${target.base}/#/`, { waitUntil: 'load' });
      await page.waitForTimeout(2200);
      const metrics = await collect(page);
      results[target.label].push(metrics);
      console.log(`${target.label} 第 ${round} 次`, JSON.stringify(metrics));
      await context.close();
    }
  }
} finally {
  // 端口没起服务 / goto 抛错时也要回收浏览器进程
  await browser.close();
}

const median = (values) => {
  const arr = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!arr.length) return null;
  return arr[Math.floor(arr.length / 2)];
};

console.log('\n========== 中位数汇总（越低越好，单位 ms）==========');
const summary = {};
for (const [label, rows] of Object.entries(results)) {
  summary[label] = {
    FCP: median(rows.map((r) => r.fcp)),
    LCP: median(rows.map((r) => r.lcp)),
    'Vue挂载': median(rows.map((r) => r.vueMount)),
    '主体首帧': median(rows.map((r) => r.mainVisible)),
    '骨架可见时长': median(rows.map((r) => r.skeletonVisibleMs)),
    DOMContentLoaded: median(rows.map((r) => r.domContentLoaded)),
  };
  console.log(label, JSON.stringify(summary[label]));
}

const labels = Object.keys(summary);
if (labels.length === 2) {
  const [before, after] = labels.map((l) => summary[l]);
  const diff = (a, b) => (a === null || b === null ? '—' : `${b - a >= 0 ? '+' : ''}${b - a} ms`);
  console.log('\n改造后 - 改造前:');
  console.log(`  FCP       ${diff(before.FCP, after.FCP)}`);
  console.log(`  LCP       ${diff(before.LCP, after.LCP)}`);
  console.log(`  Vue挂载    ${diff(before['Vue挂载'], after['Vue挂载'])}`);
  console.log(`  主体首帧   ${diff(before['主体首帧'], after['主体首帧'])}`);
  console.log(`  骨架可见时长 ${after['骨架可见时长']}ms（改造前无骨架，恒为 —）`);
}
