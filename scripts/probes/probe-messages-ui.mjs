// 探针：消息中心 UI 现状截图（注入 mock 通知数据）
// 拦截 /auth/v1/user + /rest/v1/notifications，伪造登录用户与 8 条通知
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SB = 'https://nplnlefdwfgtyimfkyih.supabase.co';

const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ryyik@bohrite.example.com',
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email' },
  user_metadata: { username: '瑞一颗' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: new Date().toISOString()
};

const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

const rows = [
  { id: 'n1', type: 'like', status: 'unread', created_at: iso(5), sender_id: 'u1', archived_at: null,
    sender: { id: 'u1', username: '星野', avatar_url: '' }, post: { id: 'p1', title: null, body: null, content: 'Beta6 的液态玻璃导航真的绝了' }, comment: null },
  { id: 'n2', type: 'comment', status: 'unread', created_at: iso(38), sender_id: 'u2', archived_at: null,
    sender: { id: 'u2', username: 'Mochi', avatar_url: '' }, post: { id: 'p2', title: null, body: null, content: '关于横屏适配的讨论' },
    comment: { id: 'c1', content: '这个反馈我复现了，横屏下底部导航确实会压住返回键，要不要一起提个 issue？', parent_id: null, author_username: 'Mochi', parent: null } },
  { id: 'n3', type: 'follow', status: 'unread', created_at: iso(180), sender_id: 'u3', archived_at: null,
    sender: { id: 'u3', username: '阿澈', avatar_url: '' }, post: null, comment: null },
  { id: 'n4', type: 'impression', status: 'read', created_at: iso(60 * 26), sender_id: 'u4', archived_at: null,
    sender: { id: 'u4', username: '小满', avatar_url: '' }, post: null, comment: null },
  { id: 'n5', type: 'system', status: 'read', created_at: iso(60 * 30), sender_id: null, archived_at: null,
    sender: null, post: null, comment: null },
  { id: 'n6', type: 'gift', status: 'read', created_at: iso(60 * 50), sender_id: 'u5', archived_at: null,
    sender: { id: 'u5', username: '方块运营', avatar_url: '' }, post: null, comment: null },
  { id: 'n7', type: 'like', status: 'read', created_at: iso(60 * 72), sender_id: 'u6', archived_at: null,
    sender: { id: 'u6', username: 'Lumi', avatar_url: '' }, post: { id: 'p3', title: null, body: null, content: '树洞：深夜 emo 一条' }, comment: null },
  { id: 'n8', type: 'comment', status: 'read', created_at: iso(60 * 96), sender_id: 'u2', archived_at: null,
    sender: { id: 'u2', username: 'Mochi', avatar_url: '' }, post: { id: 'p2', title: null, body: null, content: '关于横屏适配的讨论' },
    comment: { id: 'c2', content: '补个截图给你参考', parent_id: null, author_username: 'Mochi', parent: null } }
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

const newPage = async ({ theme = 'light', viewport = { width: 420, height: 900 } } = {}) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await context.route('**/auth/v1/user', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }));
  await context.route('**/rest/v1/notifications**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
  const page = await context.newPage();
  await page.addInitScript(({ t, u }) => {
    localStorage.setItem('boh-theme', t);
    // 伪造 supabase-js 本地会话：getUser() 才会真正发起 /auth/v1/user 请求
    localStorage.setItem('sb-nplnlefdwfgtyimfkyih-auth-token', JSON.stringify({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'mock-refresh-token',
      user: u
    }));
  }, { t: theme, u: mockUser });
  return { context, page };
};

const openMessages = async (page) => {
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__;
    const pinia = app.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) {
      s.userInfo.username = '瑞一颗';
      s.userInfo.id = '00000000-0000-4000-8000-000000000001';
      s.userInfo.email = 'ryyik@bohrite.example.com';
    }
  });
  await page.evaluate(() => { window.location.hash = '#/user-space?tab=messages'; });
  await page.waitForTimeout(3000);
};

// 1. 列表态 明/暗
for (const theme of ['light', 'dark']) {
  const { context, page } = await newPage({ theme });
  await openMessages(page);
  await page.screenshot({ path: `debug-screenshots/messages-list-${theme}.png` });
  await context.close();
}

// 1b. 横屏列表
{
  const { context, page } = await newPage({ theme: 'light', viewport: { width: 844, height: 420 } });
  await openMessages(page);
  await page.screenshot({ path: 'debug-screenshots/messages-landscape-light.png' });
  await context.close();
}

// 2. 详情态 / 筛选下拉 / 选择模式（浅色）
{
  const { context, page } = await newPage({ theme: 'light' });
  await openMessages(page);
  const first = page.locator('.x-item').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'debug-screenshots/messages-detail-light.png' });
  }
  await context.close();
}
// 2b. 详情态（暗色）
{
  const { context, page } = await newPage({ theme: 'dark' });
  await openMessages(page);
  const first = page.locator('.x-item').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'debug-screenshots/messages-detail-dark.png' });
  }
  await context.close();
}
// 2c. 空态（notifications 返回空数组 → dataLoadedOnce 落空态而非白屏）
{
  const context = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  await context.route('**/auth/v1/user', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }));
  await context.route('**/rest/v1/notifications**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  const page = await context.newPage();
  await page.addInitScript(({ t, u }) => {
    localStorage.setItem('boh-theme', t);
    localStorage.setItem('sb-nplnlefdwfgtyimfkyih-auth-token', JSON.stringify({
      access_token: 'mock-access-token', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh-token', user: u
    }));
  }, { t: 'light', u: mockUser });
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { window.location.hash = '#/user-space?tab=messages'; });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'debug-screenshots/messages-empty-light.png' });
  await context.close();
}
{
  const { context, page } = await newPage({ theme: 'light' });
  await openMessages(page);
  const filterBtn = page.locator('.x-filter-chip.filter-trigger').first();
  if (await filterBtn.count()) {
    await filterBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'debug-screenshots/messages-filter-open-light.png' });
  }
  await context.close();
}
{
  const { context, page } = await newPage({ theme: 'light' });
  await openMessages(page);
  const selectBtn = page.locator('.x-mark-all-btn-minimal, .x-select-btn').first();
  if (await selectBtn.count()) {
    await selectBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'debug-screenshots/messages-select-mode-light.png' });
  }
  await context.close();
}

await browser.close();
console.log('messages mock probe done');
