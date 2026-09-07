import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
await page.goto('http://localhost:5173/#/forum', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) { s.userInfo.username = '测试用户'; s.userInfo.id = ''; }
});
await page.waitForTimeout(600);
await page.click('.mobile-compose-fab');
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible' });
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  const els = document.elementsFromPoint(330, 520);
  return els.slice(0, 8).map((el) => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 60),
      pos: cs.position,
      z: cs.zIndex,
      opacity: cs.opacity,
      filter: cs.filter === 'none' ? '' : cs.filter,
      bg: cs.backgroundColor,
      blend: cs.mixBlendMode,
      rect: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect())
    };
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
