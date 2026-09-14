import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：消息中心智能建议岛补充回归 —— 暗色主题 + 移动端视口
// 场景 A：暗色 1280x900。boh-theme=dark 必须用 addInitScript 预置（css 懒加载，setAttribute 会误报）。
//   断言：html[data-theme=dark] 生效、岛卡弹出、.nsc-title 实测为暗色文字色（非 #1d1d1f）。
// 场景 B：移动 390x844 亮色。
//   断言：岛卡弹出、卡片宽度 ≤ vw-24（640px 断点样式）、CTA 与关闭键可见可点区域 > 0。
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';

const mockRoutes = async (page) => {
  let unreadMock = 3;
  await page.route('**/rest/v1/rpc/get_unread_notification_count', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ count: unreadMock }]) }));
  await page.route('**/rest/v1/rpc/mark_all_as_read', (r) => {
    unreadMock = 0;
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/notifications?**', (r) => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
        id: 'n1', recipient_id: UUID, sender_id: UUID, type: 'like', status: 'unread', archived_at: null,
        created_at: new Date().toISOString(), content: null,
        sender: { id: UUID, username: '瑞一颗', avatar_url: '' },
        post: { id: 'p1', title: 'Mock 帖子', body: 'b', content: null }, comment: null
      }]) })
    : r.fulfill({ status: 204, body: '' }));
  return () => { unreadMock = 3; };
};

const openAndInject = async (page, viewportLabel) => {
  await page.goto(`${BASE}/#/user-space?tab=messages`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '' });
    const ns = pinia._s.get('notifications');
    if (ns) ns.unreadCount = 3;
    else if (pinia.state.value.notifications) pinia.state.value.notifications.unreadCount = 3;
  }, UUID);
  const comp = await page.evaluate((uid) => {
    const el = document.querySelector('.messages-host .x-notifications-container');
    const ss = el?.__vueParentComponent?.setupState;
    if (ss && 'currentUserId' in ss) ss.currentUserId = uid;
    return !!ss;
  }, UUID);
  await page.waitForTimeout(1500);
  const card = await page.evaluate(() => {
    const el = document.querySelector('#unified-nav-container .notif-suggest-card');
    if (!el) return null;
    const cs = getComputedStyle(el.querySelector('.nsc-title'));
    const rect = el.getBoundingClientRect();
    return {
      title: el.querySelector('.nsc-title')?.textContent?.trim() || '',
      titleColor: cs.color,
      width: Math.round(rect.width),
      viewport: window.innerWidth,
      ctaBox: (() => { const b = el.querySelector('.nsc-cta')?.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null; })(),
      closeBox: (() => { const b = el.querySelector('.nsc-close')?.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null; })()
    };
  });
  return { card, compReady: comp, label: viewportLabel };
};

/* ---------- 场景 A：暗色 1280x900 ---------- */
{
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  await page.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  const resetMock = await mockRoutes(page);
  const { card } = await openAndInject(page, 'dark-desktop');
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('暗色主题生效（html[data-theme=dark]）', theme === 'dark', `theme=${theme}`);
  check('暗色下建议岛自动弹出', !!card, JSON.stringify(card && card.title));
  if (card) {
    // 暗色下标题应为亮色文字（#f2f5f8），不能还是亮色主题的 #1d1d1f
    const lightish = card.titleColor && card.titleColor !== 'rgb(29, 29, 31)' && !/^rgb\((?:1[0-9]|2[0-9]|[1-9]),/.test(card.titleColor.replace(/\s/g, '').slice(4));
    check('暗色下标题为亮色文字', lightish, card.titleColor);
    await page.screenshot({ path: `${OUT}/notif-suggest-island-dark.png` });
  }
  check('暗色场景无 JS 错误', errs.length === 0, errs.join(' | '));
  await browser.close();
}

/* ---------- 场景 B：移动 390x844 ---------- */
{
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  const resetMock = await mockRoutes(page);
  const { card } = await openAndInject(page, 'mobile');
  check('移动端建议岛自动弹出', !!card, JSON.stringify(card && card.title));
  if (card) {
    check('移动端卡片宽度 ≤ vw-24（640px 断点）', card.width > 0 && card.width <= card.viewport - 24, `${card.width}px / vw ${card.viewport}`);
    check('CTA 可见可点', !!card.ctaBox && card.ctaBox.w > 40 && card.ctaBox.h >= 24, JSON.stringify(card.ctaBox));
    check('关闭键可见可点', !!card.closeBox && card.closeBox.w >= 24 && card.closeBox.h >= 24, JSON.stringify(card.closeBox));
    await page.screenshot({ path: `${OUT}/notif-suggest-island-mobile.png` });
  }
  check('移动端场景无 JS 错误', errs.length === 0, errs.join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
