import { chromium } from 'playwright';
const BASE = 'http://[::1]:5173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[' + m.type() + '] ' + m.text().slice(0, 300)); });
await page.goto(BASE + '/#/user-space?tab=community', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app') && document.querySelector('#app').__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(500);
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const auth = pinia.state.value.auth;
  auth.isLoggedIn = true;
  Object.assign(auth.userInfo, { id: 'a1b2c3d4-0000-4000-8000-000000000001', username: 'probe_user', role: 'user', points: 42 });
});
await page.waitForSelector('.post-card-v2', { timeout: 30000 });
await page.locator('.post-card-v2 .post-title-v2').first().click();
await page.waitForTimeout(4000);
const state = await page.evaluate(() => ({
  overlay: Boolean(document.querySelector('.pd-modal-overlay')),
  body: Boolean(document.querySelector('.pd-modal-body')),
  modalPage: Boolean(document.querySelector('.post-detail-page--modal')),
  empty: Boolean(document.querySelector('.post-detail-page .empty-state')),
  skeleton: Boolean(document.querySelector('.post-detail-skeleton'))
}));
console.log('state:', JSON.stringify(state));
errors.slice(0, 10).forEach((e) => console.log(e));
await browser.close();
