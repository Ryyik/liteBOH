import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

let publishCalls = 0;
await page.route('**/rest/v1/rpc/publish_official_forum_card', (route) => {
  publishCalls += 1;
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ post_id: 'stub-post', created: true }]) });
});

const injectRole = (role) => page.evaluate((r) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
  if (pinia.state.value.auth.userInfo) pinia.state.value.auth.userInfo.role = r;
}, role);

// ===== Newsroom =====
await page.goto('http://localhost:5173/#/newsroom', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await page.waitForTimeout(2800);

// guest：按钮不可见
const guestBtns = await page.locator('.news-publish-btn').count();
console.log('[newsroom] guest publish btns (expect 0):', guestBtns);

// admin：按钮可见
await injectRole('admin');
await page.waitForTimeout(400);
const adminBtns = await page.locator('.news-publish-btn:visible').count();
console.log('[newsroom] admin publish btns (expect >0):', adminBtns);

// 点击第一张（featured 或 grid 首张）
await page.locator('.news-publish-btn').first().click();
await page.waitForTimeout(700);
const notifyTitle = (await page.locator('.global-nav-status-card strong').first().textContent().catch(() => '') || '').trim();
console.log('[newsroom] notify:', notifyTitle, '| rpc calls:', publishCalls);
await page.screenshot({ path: 'debug-screenshots/publish-1-newsroom.png' });

// ===== Activities =====
await page.goto('http://localhost:5173/#/activities-wall', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2600);
const actBtns = await page.locator('.activity-publish-btn:visible').count();
console.log('[activities] admin publish btns (expect >0):', actBtns);
const beforeCalls = publishCalls;
await page.locator('.activity-publish-btn').first().click();
await page.waitForTimeout(700);
const actNotify = (await page.locator('.global-nav-status-card strong').first().textContent().catch(() => '') || '').trim();
console.log('[activities] notify:', actNotify, '| new rpc calls:', publishCalls - beforeCalls);
await page.screenshot({ path: 'debug-screenshots/publish-2-activities.png' });

console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');
await context.close();
await browser.close();
