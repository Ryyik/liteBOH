/* 临时视觉探针：书页阅读 4 视口截图（桌面横屏 / 竖屏手机 / 横屏手机 / 竖屏平板） */
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const launchWithFallback = async () => {
  const { chromium } = await import('playwright');
  const cacheDir = join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  const candidates = [];
  if (existsSync(cacheDir)) {
    for (const dir of readdirSync(cacheDir)) {
      candidates.push(
        join(cacheDir, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
        join(cacheDir, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
      );
    }
  }
  const exe = candidates.find((p) => existsSync(p));
  return chromium.launch({ executablePath: exe, headless: true });
};

const BASE = process.env.BASE_URL || 'http://localhost:5199';
mkdirSync('output', { recursive: true });

const VIEWPORTS = [
  ['desktop-landscape', { width: 1440, height: 900 }],
  ['phone-portrait', { width: 390, height: 844 }],
  ['phone-landscape', { width: 844, height: 390 }],
  ['tablet-portrait', { width: 820, height: 1180 }],
];

const browser = await launchWithFallback();

try {
  for (const [name, viewport] of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${BASE}/#/albums/demo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.ar-book', { timeout: 30000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `output/book-${name}.png` });
    if (name === 'desktop-landscape') {
      await page.click('.ar-page-nav.next');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'output/book-desktop-spread1.png' });
      // 布局诊断
      const diag = await page.evaluate(() => {
        const dump = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        };
        return {
          spread: dump('.ar-spread'),
          pageLeft: dump('.ar-page-left'),
          sheet: dump('.ar-page-left .sheet'),
          grid: dump('.ar-page-left .sheet-grid'),
          text: dump('.ar-page-left .sheet-text'),
          pages: window.__DEBUG_PAGES__ || null,
        };
      });
      console.log('DIAG', JSON.stringify(diag));
    }
    await page.close();
    console.log(`${name} done`);
  }
} finally {
  await browser.close();
}
