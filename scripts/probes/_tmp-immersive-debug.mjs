/* 临时调试：沉浸态下登录按钮为何未被隐藏 */
import { existsSync, readdirSync } from 'node:fs';
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

const browser = await launchWithFallback();
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
await page.goto('http://localhost:5199/#/albums/demo', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForSelector('.ar-book', { timeout: 30000 });
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const btn = document.querySelector('.nav-login-btn');
  const surface = document.querySelector('.unified-nav-surface');
  const container = document.getElementById('unified-nav-container');
  const dump = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      display: s.display,
      position: s.position,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      classes: el.className,
    };
  };
  // 枚举样式表里含 nav-immersive 的规则条数
  let immersiveRules = 0;
  let userHideRule = false;
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const text = rule.cssText || '';
      if (text.includes('nav-immersive-on')) {
        immersiveRules += 1;
        if (text.includes('.nav-user')) userHideRule = true;
      }
    }
  }
  return {
    container: container?.className,
    surface: dump(surface),
    loginBtn: dump(btn),
    navUser: dump(document.querySelector('.nav-user')),
    immersiveRules,
    userHideRule,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
