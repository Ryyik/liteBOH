import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5173/#/activities-wall?tab=wall', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
// 点击第一张墙上的纸条 → 详情弹窗（.modal-backdrop）
await page.locator('.block-wall-page .wall-item').first().click();
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  const backdrop = document.querySelector('.block-wall-page .modal-backdrop');
  const nav = document.getElementById('unified-nav-container');
  if (!backdrop || !nav) return { found: false };
  const bz = getComputedStyle(backdrop).zIndex;
  const nz = getComputedStyle(nav).zIndex;
  // 用 elementFromPoint 检查弹窗中心点最顶层元素是否属于弹窗
  const r = backdrop.getBoundingClientRect();
  const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    found: true,
    backdropZ: bz, navZ: nz,
    above: Number(bz) > Number(nz),
    topElInBackdrop: backdrop.contains(topEl)
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: 'debug-screenshots/aw-detail-z.png' });
await browser.close();
