/**
 * perf-probe-dark.mjs — 暗色主题冷启的样式竞态实测
 *
 * 关注点：index.html 在内联脚本里就把 data-theme="dark" 设上了，但暗色主题 CSS
 * （theme-css-loader.js 的 8 个 dynamic import）是在 Vue 挂载后异步加载的。
 * 若两者之间用户已经看到页面，就会出现「暗色属性 + 亮色样式」的错配窗口。
 *
 * 做法：预置 localStorage.boh-theme=dark → 限速冷启 → 从最早时刻用 rAF 采样
 *       导航栏容器的计算背景色，找出它发生变化（暗色样式生效）的时刻。
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

// 预热一次以写入 localStorage（不参与测量）
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('boh-theme', 'dark'));

// 采样脚本：从最早可执行时刻开始记录
await page.addInitScript(() => {
  window.__themeLog = [];
  const tick = () => {
    const root = document.documentElement;
    const nav = document.querySelector('#unified-nav-container');
    const boot = document.querySelector('.boh-boot');
    window.__themeLog.push({
      t: Math.round(performance.now()),
      theme: root.getAttribute('data-theme'),
      navBg: nav ? getComputedStyle(nav).backgroundColor : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bootBg: boot ? getComputedStyle(boot).backgroundColor : null,
      sheets: document.styleSheets.length,
    });
    if (window.__themeLog.length > 900) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 150,
  downloadThroughput: (1.2 * 1024 * 1024) / 8, uploadThroughput: (600 * 1024) / 8,
});

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForTimeout(9000);

const log = await page.evaluate(() => window.__themeLog);
const themeCss = await page.evaluate(() => {
  return performance.getEntriesByType('resource')
    .filter((r) => /(dark-mode|navbar-dark|forum-dark|user-space-dark|messages-dark|bohai-dark)/.test(r.name))
    .map((r) => ({ n: r.name.split('/').pop(), start: Math.round(r.startTime), end: Math.round(r.responseEnd) }));
});

console.log('\n######## 暗色冷启样式竞态（限速 1.2Mbps，无 SW）########');
console.log(`  采样点 ${log.length} 个`);
const first = log[0];
console.log(`  最早采样 t=${first.t}ms  data-theme=${first.theme}  导航栏底色=${first.navBg}  body=${first.bodyBg}  骨架=${first.bootBg}`);

// 找导航栏底色的首次变化
let changeAt = null;
for (let i = 1; i < log.length; i++) {
  if (log[i].navBg && log[i - 1].navBg && log[i].navBg !== log[i - 1].navBg) {
    changeAt = log[i];
    break;
  }
}
const distinct = [...new Set(log.filter((x) => x.navBg).map((x) => x.navBg))];
console.log(`  导航栏出现过的底色取值（按时间顺序去重）：${distinct.join(' → ')}`);
console.log(`  导航栏底色首次变化：${changeAt ? `t=${changeAt.t}ms → ${changeAt.navBg}` : '本次采样内无变化'}`);
const darkCssEnd = themeCss.length ? Math.max(...themeCss.map((x) => x.end)) : null;
console.log(`  主题 CSS 共 ${themeCss.length} 个，最后一个 ${darkCssEnd}ms 到位`);
themeCss.forEach((x) => console.log(`    ${x.n.padEnd(30)} ${x.start}ms → ${x.end}ms`));

// 关键判定：暗色属性已设 但 导航栏仍是亮色 的时间窗
const rootDarkFrom = log.find((x) => x.theme === 'dark');
const navSettled = darkCssEnd;
console.log(`  data-theme 变为 dark 于 t=${rootDarkFrom ? rootDarkFrom.t : '—'}ms；主题 CSS 全部到位于 ${navSettled}ms`);
console.log(`  → 结构等价的错配窗口 ≈ ${rootDarkFrom && navSettled ? Math.max(0, navSettled - rootDarkFrom.t) : '—'}ms（上限估计，实际是否可见取决于该时段是否已渲染出内容）`);

const bootStyled = log.filter((x) => x.bootBg && x.bootBg !== 'rgba(0, 0, 0, 0)');
console.log(`  骨架节点存在且带非透明底色的采样点：${bootStyled.length} 个（首个 t=${bootStyled[0]?.t ?? '—'}ms，底色 ${bootStyled[0]?.bootBg ?? '—'}）`);

await browser.close();
console.log('\n探针结束。');
