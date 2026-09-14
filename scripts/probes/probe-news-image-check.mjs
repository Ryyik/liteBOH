import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failed = [];
page.on('requestfailed', (req) => { if (req.resourceType() === 'image') failed.push(req.url().slice(0, 90)); });

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await page.locator('.toolbar-filter-btn').click();
await page.waitForTimeout(350);
await page.locator('.filter-dropdown-section', { hasText: '内容类型' }).locator('.filter-tag-btn', { hasText: '新闻' }).first().click();
await page.waitForTimeout(2500);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 2000); await page.waitForTimeout(600); }
await page.waitForTimeout(1800);

const report = await page.evaluate(() => {
  return [...document.querySelectorAll('.posts-list [data-forum-post-id]')].map((c) => {
    const img = c.querySelector('img');
    const src = img ? (img.currentSrc || img.getAttribute('src') || img.dataset.lazySrc || '') : '';
    return {
      src: src.slice(0, 70),
      kind: src.startsWith('data:') ? 'data-svg' : /\/src\/assets\//.test(src) ? 'bundled' : /https?:/.test(src) ? 'remote' : 'raw-broken',
      ok: img ? (img.complete ? img.naturalWidth > 0 : 'lazy') : 'no-img'
    };
  });
});
const dist = report.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {});
const realBroken = report.filter((r) => r.kind === 'raw-broken' || (r.ok === false && r.kind !== 'data-svg'));
console.log('news cards:', report.length, 'dist:', JSON.stringify(dist));
console.log('real broken:', realBroken.length, realBroken.slice(0, 4));
console.log('bundled ok:', report.filter((r) => r.kind === 'bundled' && r.ok === true).length, '/', report.filter((r) => r.kind === 'bundled').length);
console.log('requestfailed:', failed.length ? failed.slice(0, 4) : 'none');
await page.screenshot({ path: 'debug-screenshots/forum-card-images-news.png' });
await browser.close();
