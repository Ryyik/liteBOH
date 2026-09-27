/* 临时调试：检查书页内 grid/slot 的实际计算高度 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import('playwright');
const cacheDir = join(process.env.HOME || '', 'Library/Caches/ms-playwright');
const exe =
  [
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-headless-shell-mac-arm64/chrome-headless-shell',
  ]
    .map((p) =>
      join(
        cacheDir,
        '..',
        'ms-playwright',
        'chromium_headless_shell-1234',
        'chrome-headless-shell-mac-arm64',
        'chrome-headless-shell',
      ),
    )
    .find((p) => existsSync(p)) || undefined;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5199/#/albums/demo', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForSelector('.ar-book', { timeout: 30000 });
await page.click('.ar-page-nav.next');
await page.waitForSelector('.ar-page-left .sheet-grid', { timeout: 30000 });
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const pick = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      display: s.display,
      gridTemplateRows: s.gridTemplateRows,
      aspectRatio: s.aspectRatio,
    };
  };
  return {
    book: pick(document.querySelector('.ar-book')),
    spread: pick(document.querySelector('.ar-spread')),
    pageLeft: pick(document.querySelector('.ar-page-left')),
    sheet: pick(document.querySelector('.ar-page-left .sheet')),
    content: pick(document.querySelector('.ar-page-left .sheet-content')),
    grid: pick(document.querySelector('.ar-page-left .sheet-grid')),
    gridAreas: document.querySelector('.ar-page-left .sheet-grid')?.style.gridTemplateAreas,
    slot: pick(document.querySelector('.ar-page-left .sheet-slot')),
    img: pick(document.querySelector('.ar-page-left .sheet-slot img')),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
