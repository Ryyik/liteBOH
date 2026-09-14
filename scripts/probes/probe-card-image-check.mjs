import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failed = [];
page.on('requestfailed', (req) => { if (req.resourceType() === 'image') failed.push(req.url().slice(0, 110)); });

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);

// 用内容类型筛选捞出全部活动官方卡
await page.locator('.toolbar-filter-btn').click();
await page.waitForTimeout(350);
await page.locator('.filter-dropdown-section', { hasText: '内容类型' }).locator('.filter-tag-btn', { hasText: '活动' }).first().click();
await page.waitForTimeout(2200);

// 逐屏滚动让懒加载触发
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel(0, 2200);
  await page.waitForTimeout(650);
}
await page.waitForTimeout(2000);

const report = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.posts-list [data-forum-post-id]')];
  return cards.map((c) => {
    const img = c.querySelector('.post-images img, [class*="image"] img, img');
    const src = img ? (img.currentSrc || img.getAttribute('src') || '') : '';
    return {
      title: (c.querySelector('[class*="title"]')?.textContent || c.textContent || '').trim().slice(0, 18),
      src: src.slice(0, 80),
      isBundled: /\/src\/assets\/images\//.test(src) || /assets\/images.*\.webp/.test(src),
      ok: img ? (img.complete ? img.naturalWidth > 0 : 'lazy') : 'no-img'
    };
  });
});
console.log('activity cards:', report.length);
const bundled = report.filter((r) => r.isBundled);
console.log('bundled-asset covers:', bundled.length, '| ok:', bundled.filter((r) => r.ok === true).length, '| broken:', bundled.filter((r) => r.ok === false).length);
bundled.slice(0, 6).forEach((r) => console.log(`  [${r.ok}] ${r.title} <- ${r.src}`));
const brokenAll = report.filter((r) => r.ok === false);
console.log('total broken:', brokenAll.length);
brokenAll.slice(0, 8).forEach((r) => console.log(`  BROKEN ${r.title} <- ${r.src}`));
console.log('requestfailed:', failed.length ? failed.slice(0, 5) : 'none');
await page.screenshot({ path: 'debug-screenshots/forum-card-images-activity.png' });
await browser.close();
