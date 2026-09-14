import { chromium } from 'playwright';

// 首页来回滚动加载不全 复现探针
// 场景：首页英雄区是「IO 延迟渲染（rootMargin 800px）+ content-visibility: auto +
//       contain-intrinsic-size: auto 720px」的组合。怀疑快速来回滚动时：
//   A) content-visibility 跳过渲染的区块被滚回来后不重绘（Chromium paint-skip bug）
//   B) 占位高度(720px)与真实高度不符 → 滚动过程中 scrollHeight 跳变
//   C) IO 延迟渲染在快速滚动下漏触发 → 某些行 inner 一直为空
//   D) lazy 图片在跳过渲染的子树里不加载
// 检查项：
//   1. 每个阶段的 scrollHeight（布局跳动检测）
//   2. 每个 .home-hero-row：is-deferred 残留 / inner 子元素数 / 高度
//   3. 图片：complete && naturalWidth>0
//   4. 滚动回顶后截图逐行取证（视觉确认空白区块）

const BASE = 'http://localhost:5173';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));

await page.goto(BASE + '/#/home', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForSelector('.home-hero-content .home-hero-row', { timeout: 15000 });
// 等空闲预热完成（300ms setTimeout + rIC timeout 2500 / Safari fallback 2000）
await page.waitForTimeout(3200);

// —— 行清单 + 初始状态 ——
const inventory = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.home-hero-content .home-hero-row')];
  return rows.map((row, i) => {
    const inner = row.querySelector('.home-hero-row-inner');
    return {
      i,
      label: row.getAttribute('aria-label') || `row-${i}`,
      deferred: row.classList.contains('is-deferred'),
      childCount: inner ? inner.children.length : 0,
      height: row.offsetHeight,
      cv: getComputedStyle(row).contentVisibility,
    };
  });
});
console.log('rows:', JSON.stringify(inventory, null, 1));
// 行数随远程 home_heroes 配置实时变动，只做下限断言
check('英雄区行数 >= 5', inventory.length >= 5, String(inventory.length));
// 空闲预热契约：无需滚动，等待期后所有行都应已完成渲染（离屏行仅 DOM，不参与绘制）
const prewarmed = inventory.filter((r) => r.deferred || r.childCount === 0);
check('空闲预热后全部行已渲染（无需滚动）', prewarmed.length === 0,
  prewarmed.length ? `未渲染: ${prewarmed.map((r) => r.label).join(', ')}` : `${inventory.length} 行全渲染`);

// —— 阶段 1：快速滚到底（大步长，模拟惯性快滚）——
const snap = () => page.evaluate(() => ({
  y: window.scrollY,
  h: document.documentElement.scrollHeight,
  vh: window.innerHeight,
}));
const scrollHeights = [];
const fastScrollTo = async (targetY, label) => {
  const step = 1800;
  let cur = await page.evaluate(() => window.scrollY);
  const dir = targetY > cur ? 1 : -1;
  while (dir > 0 ? cur < targetY : cur > targetY) {
    cur += dir * step;
    await page.evaluate((y) => window.scrollTo(0, y), Math.min(Math.max(cur, 0), targetY));
    await page.waitForTimeout(16);
    const s = await snap();
    scrollHeights.push({ label, y: Math.round(s.y), h: s.h });
  }
  await page.evaluate((y) => window.scrollTo(0, y), targetY);
};

let s = await snap();
const bottom0 = s.h - s.vh;
await fastScrollTo(bottom0, 'down1');
await page.waitForTimeout(600);

// —— 阶段 2：快速滚回顶 ——
await fastScrollTo(0, 'up1');
await page.waitForTimeout(600);

// —— 阶段 3：疯狂来回（瞬间跳，5 轮）——
for (let i = 0; i < 5; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), bottom0);
  await page.waitForTimeout(60);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(60);
}
// 最后一轮停在中部
await page.evaluate((y) => window.scrollTo(0, y), Math.round(bottom0 / 2));
await page.waitForTimeout(600);

// —— 检查 1：布局跳动 ——
// 阈值 24px：视口驱动行已零误差；内容驱动行（split/agent/special）留 ±1 行小误差，
// 由空闲预热与 contain-intrinsic-size:auto 记忆真实尺寸兜底，肉眼不可感知
const hValues = [...new Set(scrollHeights.map((x) => x.h))].sort((a, b) => a - b);
const jump = hValues[hValues.length - 1] - hValues[0];
check('滚动过程中布局稳定（跳变 ≤ 24px）', jump <= 24,
  jump > 0 ? `高度从 ${hValues[0]} 变到 ${hValues[hValues.length - 1]}（差 ${jump}px）` : `恒定 ${hValues[0]}px`);

// —— 检查 2：每行渲染状态（来回滚动后）——
const afterRound = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.home-hero-content .home-hero-row')];
  return rows.map((row, i) => {
    const inner = row.querySelector('.home-hero-row-inner');
    const rect = row.getBoundingClientRect();
    return {
      i,
      label: row.getAttribute('aria-label') || `row-${i}`,
      deferred: row.classList.contains('is-deferred'),
      childCount: inner ? inner.children.length : 0,
      height: Math.round(rect.height),
      nearViewport: rect.top < window.innerHeight && rect.bottom > 0,
    };
  });
});
console.log('after round-trip:', JSON.stringify(afterRound, null, 1));
const unrendered = afterRound.filter((r) => r.childCount === 0 || r.deferred);
check('来回滚动后所有行都完成渲染', unrendered.length === 0,
  unrendered.length ? `未渲染: ${unrendered.map((r) => `${r.label}(deferred=${r.deferred})`).join(', ')}` : '全部渲染');

// —— 检查 3：图片加载状态 ——
const imgs = await page.evaluate(() =>
  [...document.querySelectorAll('.home-hero-content img')].map((img) => ({
    alt: (img.alt || img.getAttribute('aria-label') || '').slice(0, 20),
    complete: img.complete,
    nw: img.naturalWidth,
    loading: img.loading,
  }))
);
const badImgs = imgs.filter((x) => !x.complete || x.nw === 0);
check('英雄区所有图片已加载', badImgs.length === 0,
  badImgs.length ? `未加载: ${badImgs.map((x) => x.alt).join(', ')}` : `${imgs.length} 张全部完成`);
console.log('imgs:', JSON.stringify(imgs, null, 1));

// —— 检查 4：逐行截图取证（视觉确认空白区块）——
// 从第 2 行开始逐个滚到视口中部，截取该行 bbox
const rowCount = afterRound.length;
for (let i = 1; i < Math.min(rowCount, 11); i++) {
  const row = afterRound[i];
  if (row.childCount === 0) continue;
  const box = await page.evaluate((idx) => {
    const el = document.querySelectorAll('.home-hero-content .home-hero-row')[idx];
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: r.y + window.scrollY, w: r.width, h: r.height };
  }, i);
  await page.waitForTimeout(450);
  const clip = { x: box.x, y: Math.max(0, box.y - 0), width: box.w, height: Math.min(box.h, 1400) };
  // scrollIntoView 后重新取绝对坐标（防止布局变化）
  const box2 = await page.evaluate((idx) => {
    const el = document.querySelectorAll('.home-hero-content .home-hero-row')[idx];
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, i);
  await page.screenshot({
    path: `debug-screenshots/home-scroll-row${i}.png`,
    clip: { x: box2.x, y: box2.y, width: box2.w, height: Math.min(box2.h, 1400) },
  });
}
await page.screenshot({ path: 'debug-screenshots/home-scroll-final-mid.png', fullPage: false });

check('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
process.exit(failed.length ? 1 : 0);
