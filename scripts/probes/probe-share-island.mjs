import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write']
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 140)));

await page.route('**/rest/v1/rpc/create_forum_quote_repost', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'stub-repost-id', post_kind: 'repost' }]) }));

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await page.waitForTimeout(2800);
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
  if (pinia.state.value.auth.userInfo) {
    pinia.state.value.auth.userInfo.username = '测试用户';
    pinia.state.value.auth.userInfo.id = 'probe-user';
  }
});
await page.waitForTimeout(1200);

const openShare = async () => {
  await page.locator('.posts-list [data-forum-post-id]').first().locator('.share-btn-v2').click();
  await page.locator('.share-island-card').waitFor({ state: 'visible', timeout: 4000 });
};
const assertHidden = async (label, timeout = 4000) => {
  try {
    await page.locator('.share-island-card').waitFor({ state: 'hidden', timeout });
    console.log(`PASS: ${label} 岛已关闭`);
  } catch {
    console.log(`FAIL: ${label} 岛未关闭`);
  }
};

// 1. 转发撰写态点 × → 岛必须真正关闭
await openShare();
await page.locator('.share-option').nth(1).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'debug-screenshots/share-v3-1-compose.png' });
await page.locator('.share-island-close').click();
await assertHidden('撰写态点 ×');

// 2. 重开 → 复制链接 → 成功态自动关闭
await openShare();
await page.locator('.share-option').first().click();
await page.waitForTimeout(400);
await assertHidden('复制成功自动关闭', 3500);

// 3. Esc 关闭
await openShare();
await page.keyboard.press('Escape');
await assertHidden('Esc 关闭');

// 4. 全链路转发回归
await openShare();
await page.locator('.share-option').nth(1).click();
await page.waitForTimeout(400);
await page.locator('.share-compose-input').fill('转发测试');
await page.locator('.share-compose-submit').click();
await page.waitForTimeout(800);
const successText = (await page.locator('.share-success-copy strong').textContent().catch(() => '') || '').trim();
console.log('forward success:', successText);
await assertHidden('转发成功自动关闭', 4000);
await page.screenshot({ path: 'debug-screenshots/share-v3-2-success.png' });

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await context.close();
await browser.close();
