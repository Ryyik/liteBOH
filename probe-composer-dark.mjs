import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) { s.userInfo.username = '测试用户'; s.userInfo.id = ''; s.userInfo.avatarUrl = ''; }
  document.documentElement.setAttribute('data-theme', 'dark');
});
await page.waitForTimeout(600);
await page.click('.mobile-compose-fab');
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible' });
await page.waitForTimeout(600);
await page.fill('.post-title-input', '暗色模式标题验证');
await page.waitForTimeout(300);
await page.screenshot({ path: 'debug-screenshots/composer-portrait-dark.png' });
await browser.close();
console.log('dark screenshot done');
