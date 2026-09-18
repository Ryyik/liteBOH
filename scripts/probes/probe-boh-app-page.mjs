import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：BOH App 产品介绍页（/app）
//   覆盖：Hero 结构与下载直链 · 滚动分镜（sticky 钉住 + 全程无空白带）
//        · 探索菜单入口 · reduced-motion 降级 · 横向溢出
//
//   核心断言是 B4「全程始终有内容可见」：
//   分镜用绝对定位叠放，一旦交叉淡出写错（两屏同时接近全透明），
//   页面在滚动中途会出现整片空白 —— 这正是本次要钉死的回归。
//
//   反证：把 panelStyle 里的 focus 改回 `clamp(1 - Math.abs(signed))`，
//        B4 必须在进度 0.25 附近变红（可见度掉到 0.25 以下）。
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/boh-app-page';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
let skip = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log('PASS ', name, detail === undefined ? '' : '— ' + detail); }
  else { fail += 1; console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail); }
};
const skipCheck = (name, why) => { skip += 1; console.log('SKIP ', name, '— ' + why); };

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const errors = [];

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));

await page.goto(`${BASE}/#/app`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForSelector('.boh-app-page', { timeout: 20000 });
await page.waitForTimeout(800);

// ---------------- A. Hero ----------------
check('A1 Hero 标题渲染', await page.locator('.hero h1').count() === 1,
  (await page.locator('.hero h1').first().innerText()).replace(/\n/g, ' '));

const heroHref = await page.getAttribute('.hero-actions .btn-primary', 'href');
check('A2 主按钮指向 Release 直链',
  (heroHref || '').includes('/releases/download/android-latest/boh.apk'), heroHref);

check('A3 手机模型已渲染', await page.locator('.phone-screen').count() === 1);
check('A4 应用图标实际加载成功', await page.evaluate(() => {
  const img = document.querySelector('.phone-icon');
  return !!img && img.complete && img.naturalWidth > 0;
}));

// ---------------- D. 溢出（在 /app 上量） ----------------
const overflowX = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('D1 无横向溢出', overflowX <= 1, `${overflowX}px`);

// ---------------- B. 滚动分镜 ----------------
const geom = await page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const rect = stage.getBoundingClientRect();
  return { top: window.scrollY + rect.top, height: stage.offsetHeight, vh: window.innerHeight };
});
check('B1 舞台提供足够滚动距离', geom.height >= geom.vh * 2, `${geom.height}px vs 视口 ${geom.vh}px`);

const distance = geom.height - geom.vh;
// 全局 html 带 scroll-behavior: smooth，scrollTo 会异步收敛；
// 探针要的是瞬时定位，先关掉，否则采到的位置不是请求的那个进度点。
await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

const scrollToProgress = async (p) => {
  await page.evaluate((y) => window.scrollTo(0, y), geom.top + distance * p);
  await page.waitForTimeout(240);
};
const readPanels = () => page.$$eval('.panel', (els) =>
  els.map((e) => parseFloat(getComputedStyle(e).opacity)));

await scrollToProgress(0.5);
const stickyTop = await page.evaluate(
  () => document.querySelector('.stage-sticky').getBoundingClientRect().top);
check('B2 sticky 已钉住视口顶部', Math.abs(stickyTop) <= 2, `top=${stickyTop.toFixed(1)}px`);

const opsMid = await readPanels();
check('B3 中段切到第二屏', opsMid[1] > 0.9 && opsMid[0] < 0.2,
  JSON.stringify(opsMid.map((n) => +n.toFixed(2))));

const samples = [];
let domAnomaly = '';
for (let i = 0; i <= 20; i += 1) {
  const p = i / 20;
  await scrollToProgress(p);
  const probe = await page.evaluate(() => ({
    n: document.querySelectorAll('.panel').length,
    y: Math.round(window.scrollY),
    hash: location.hash,
  }));
  if (probe.n !== 3 && !domAnomaly) {
    domAnomaly = `进度 ${p} 处 panel 数=${probe.n}（scrollY=${probe.y}, hash=${probe.hash}）`;
  }
  const ops = await readPanels();
  samples.push({ p, max: Math.max(...ops), ops: ops.map((n) => +n.toFixed(2)) });
}
const worst = samples.reduce((a, b) => (b.max < a.max ? b : a));
// 阈值 0.45：交叉淡入在中点处两屏各 0.5（透明度之和恒为 1）是设计预期，
// 真正要拦的是「所有屏同时接近 0」的空白带。
check('B4 全程始终有内容可见（无空白带）', worst.max >= 0.45 && !domAnomaly,
  `最低可见度 ${Number.isFinite(worst.max) ? worst.max.toFixed(2) : '空'} @ 进度 ${worst.p}` +
  ` · 三屏 ${JSON.stringify(worst.ops)}${domAnomaly ? ' · ' + domAnomaly : ''}`);

const opsStart = samples[0].ops;
const opsEnd = samples[samples.length - 1].ops;
check('B5 起点第一屏独占', opsStart[0] > 0.95 && opsStart[2] < 0.5, JSON.stringify(opsStart));
check('B6 终点第三屏独占', opsEnd[2] > 0.95 && opsEnd[0] < 0.5, JSON.stringify(opsEnd));

await page.evaluate(() => document.querySelector('.highlights')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/highlights.png` });

await scrollToProgress(0.5);
await page.screenshot({ path: `${OUT}/mid.png` });
await scrollToProgress(0.25);
await page.screenshot({ path: `${OUT}/transition.png` });
await scrollToProgress(0);
await page.screenshot({ path: `${OUT}/start.png` });

// ---------------- C. 导航入口 ----------------
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
const explore = page.locator('text=探索').first();
if (await explore.count() > 0) {
  await explore.click();
  await page.waitForTimeout(600);
  const entry = page.getByText('BOH App', { exact: true }).first();
  const entryCount = await entry.count();
  const entryVisible = entryCount > 0 && await entry.isVisible();
  check('C1 探索菜单含 BOH App 入口', entryVisible, entryCount === 0 ? '未渲染' : '已渲染');
  if (entryVisible) {
    await entry.click();
    await page.waitForTimeout(1000);
    check('C2 点击后进入 /app', page.url().includes('#/app'), page.url());
  } else {
    skipCheck('C2 点击后进入 /app', '入口不可见');
  }
} else {
  skipCheck('C1 探索菜单含 BOH App 入口', '页面上未找到「探索」入口');
  skipCheck('C2 点击后进入 /app', '上一步跳过');
}

// ---------------- E. reduced-motion 降级 ----------------
const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const rmPage = await rmCtx.newPage();
await rmPage.goto(`${BASE}/#/app`, { waitUntil: 'domcontentloaded' });
await rmPage.waitForSelector('.boh-app-page', { timeout: 20000 });
await rmPage.waitForTimeout(700);
check('E1 reduced-motion 下转为静态堆叠', await rmPage.locator('.stage.is-static').count() === 1);
const rmOps = await rmPage.$$eval('.panel', (els) => els.map((e) => parseFloat(getComputedStyle(e).opacity)));
check('E2 静态降级下三屏同时可见', rmOps.length === 3 && rmOps.every((o) => o > 0.99),
  JSON.stringify(rmOps));
await rmCtx.close();

// ---------------- F. 未捕获异常 ----------------
check('F1 页面无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(`\n=== BOH App 产品页：${pass} PASS / ${fail} FAIL / ${skip} SKIP ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
