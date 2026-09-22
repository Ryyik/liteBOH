import { chromium } from 'playwright';

// 探针：注册页移动端横向溢出 / 触控目标 / 对比度实测（为改版方案提供数据依据）
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto(`${BASE}/#/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.apple-form', { timeout: 20000 });
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const wide = [];
  document.querySelectorAll('.join-page *').forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return;
    if (b.left < -1 || b.right > vw + 1) {
      wide.push({
        cls: (el.className || el.tagName).toString().slice(0, 48),
        left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width),
      });
    }
  });
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), w: Math.round(b.width), y: Math.round(b.y), h: Math.round(b.height) };
  };
  const taps = ['.agreement-checkbox', '.apple-continue-btn', '.apple-input', '.date-select',
    '.avatar-selector', '.pill-link', '.help-btn'].map((sel) => ({ sel, ...(rect(sel) || {}) }));
  return {
    vw,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: wide.slice(0, 12),
    title: rect('.apple-title'),
    subtitle: rect('.apple-subtitle'),
    container: rect('.join-container'),
    inputGroup: rect('.apple-input-group'),
    taps,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
