import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

await page.goto('http://localhost:5173/#/download?tab=tutorial', { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);

// 1. 页面顶部：侧栏不应遮 Hero（top 应等于其自然位置）
const top1 = await page.$eval('.tutorial-sidebar', el => Math.round(el.getBoundingClientRect().top));
const heroBottom = await page.$eval('.hero-glass', el => Math.round(el.getBoundingClientRect().bottom));
console.log('页面顶部: sidebar top =', top1, '| hero bottom =', heroBottom, top1 >= heroBottom ? '✅ 不遮 Hero' : '❌ 遮住 Hero');
await page.screenshot({ path: 'debug-screenshots/final-top.png' });

// 2. 滚动后：侧栏应吸附在导航下方
await page.click('.toc-list li:nth-child(5)');
await page.waitForTimeout(1300);
const deep = await page.evaluate(() => {
  const sb = document.querySelector('.tutorial-sidebar').getBoundingClientRect();
  const nav = document.getElementById('unified-nav-container').getBoundingClientRect();
  return { scrollY: Math.round(window.scrollY), sbTop: Math.round(sb.top), navBottom: Math.round(nav.bottom) };
});
console.log('滚到深处:', JSON.stringify(deep), Math.abs(deep.sbTop - (deep.navBottom + 24)) <= 2 ? '✅ 吸附导航下方' : '❌ 未吸附');

// 3. 固定状态继续点目录
await page.click('.toc-section:nth-child(2) .toc-list li:nth-child(1)');
await page.waitForTimeout(1300);
const active = await page.$eval('.toc-list li.active', el => el.textContent.trim());
console.log('固定态再跳转 → 高亮:', active);
await page.screenshot({ path: 'debug-screenshots/final-docked.png' });

// 4. 移动端抽屉默认关闭
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
const drawer = await page.$eval('.tutorial-sidebar', el => getComputedStyle(el).transform);
console.log('移动端抽屉 transform:', drawer, drawer.includes('-391') || drawer === 'matrix(1, 0, 0, 1, -390, 0)' || drawer.includes('matrix(1, 0, 0, 1, -3') ? '✅ 默认收起' : '⚠️ 检查:' + drawer);
await page.screenshot({ path: 'debug-screenshots/final-mobile.png' });

await browser.close();
