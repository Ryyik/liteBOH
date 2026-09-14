import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：消息中心智能建议岛回归（进入「消息 tab·收件箱」且有未读 → 导航岛自动弹「N 条未读·全部已读」）
// 入口：/#/user-space?tab=messages（消息中心唯一真实入口；底部导航「消息」项带未读徽标）
// 登录策略：等 3s 会话检查放完后现注 pinia（auth + notifications store），注入后立即交互
// mock：按 URL 特征拦截 supabase（未读计数 RPC / 全部已读 RPC / notifications 列表），禁拦 /auth/v1/**
// 断言：
//  1) 进入消息收件箱 → navbar 弹出 .notif-suggest-card，文案「3 条未读消息」+ CTA「全部已读」
//  2) 点「全部已读」→ 卡片 done 态「已全部标记为已读」→ 自动收起 → 底部导航未读徽标消失
//     去重守卫：成功反馈只由本岛 done 态呈现，不应再派发同义导航状态卡（否则 navbar 叠两张卡）
//  3) × 掉后同批次（未读数未增长）切走再切回不弹；未读增长后新批次重新弹
//  4) 切走 tab / AI 分区卡片跟随收起
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

// ---- supabase mock：unreadMock 是未读计数真相（node 侧闭包） ----
let unreadMock = 3;
await page.route('**/rest/v1/rpc/get_unread_notification_count', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ count: unreadMock }]) }));
let markAllCalls = 0;
await page.route('**/rest/v1/rpc/mark_all_as_read', (route) => {
  markAllCalls += 1;
  unreadMock = 0; // 全部已读后，随后的未读计数刷新必须归零
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await page.route('**/rest/v1/notifications?**', (route) => {
  const req = route.request();
  if (req.method() === 'GET') {
    const rows = Array.from({ length: unreadMock }, (_, i) => ({
      id: `mock-notif-${i + 1}`, recipient_id: UUID, sender_id: UUID,
      type: 'like', status: 'unread', archived_at: null,
      created_at: new Date(Date.now() - i * 3600_000).toISOString(),
      content: null,
      sender: { id: UUID, username: '瑞一颗', avatar_url: '' },
      post: { id: `mock-post-${i + 1}`, title: `Mock 帖子 ${i + 1}`, body: 'mock body', content: null },
      comment: null
    }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  }
  return route.fulfill({ status: 204, body: '' });
});

await page.goto(`${BASE}/#/user-space?tab=messages`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(3000); // 等 init 期会话检查（一次性异步）放完

// 现注登录 + 未读数（notifications store 实例直改；store 可能懒初始化，state 树兜底）
const injectState = (unread) => page.evaluate(({ uid, n }) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '' });
  const ns = pinia._s.get('notifications');
  if (ns) ns.unreadCount = n;
  else if (pinia.state.value.notifications) pinia.state.value.notifications.unreadCount = n;
  else pinia.state.value.notifications = { unreadCount: n };
}, { uid: UUID, n: unread });

const getCard = () => page.evaluate(() => {
  const card = document.querySelector('#unified-nav-container .notif-suggest-card');
  if (!card) return null;
  return {
    title: card.querySelector('.nsc-title')?.textContent?.trim() || '',
    cta: card.querySelector('.nsc-cta')?.textContent?.trim() || ''
  };
});

const gotoTab = async (tab) => {
  await page.evaluate((t) => { location.hash = `#/user-space?tab=${t}`; }, tab);
  await page.waitForTimeout(900); // 等 tab 切换过渡 + watch 链
};

await page.waitForSelector('.bottom-nav-glass', { timeout: 15000 });
await page.waitForSelector('.tab-page.messages-tab', { timeout: 15000 });
await page.waitForSelector('.messages-host .x-notifications-container', { timeout: 15000 }).catch(() => {});
await injectState(3);
// markAllAsRead 依赖组件内 currentUserId（来自 getCurrentUser 网络调用，伪造登录无 session）→ 直塞实例。
// setupState 是 proxyRefs：读已解包，直接赋值即写入内部 ref。
await page.evaluate((uid) => {
  const comp = document.querySelector('.messages-host .x-notifications-container')?.__vueParentComponent;
  const ss = comp?.setupState;
  if (ss && 'currentUserId' in ss) ss.currentUserId = uid;
}, UUID);
await page.waitForTimeout(1500); // 未读计数 RPC 异步到达 → watch 补弹

/* ---------- 1) 进入消息收件箱 → 建议岛自动弹出 ---------- */
let card = await getCard();
check('进入收件箱后建议岛自动弹出', !!card, JSON.stringify(card));
if (card) {
  check('卡片文案为「3 条未读消息」', card.title.includes('3 条未读消息'), card.title);
  check('CTA 文案为「全部已读」', card.cta.includes('全部已读'), card.cta);
  await page.screenshot({ path: `${OUT}/notif-suggest-island-present.png` });
}

/* ---------- 2) 点「全部已读」→ done 态 → 自动收起 → 徽标消失 ---------- */
if (card) {
  // 监听导航状态卡事件（showIsland.notify → boh_global_nav_status）：
  // 成功反馈只应由建议岛自己的 done 态呈现；若 Messages 的 showFeedback 再派发一条同义状态卡，
  // 两者同处 navbar surface → 叠成两张卡 = 「灵动岛和提示重复」。事件计数不受出卡时序影响，比查 DOM 稳。
  await page.evaluate(() => {
    window.__navStatusEvents = [];
    window.addEventListener('boh_global_nav_status', (e) => {
      window.__navStatusEvents.push(String(e?.detail?.title || ''));
    });
  });
  await page.click('#unified-nav-container .notif-suggest-card .nsc-cta');
  let doneOk = true;
  try {
    await page.waitForFunction(() =>
      document.querySelector('#unified-nav-container .notif-suggest-card .nsc-title')?.textContent?.includes('已全部标记为已读'),
      null, { timeout: 6000 });
  } catch { doneOk = false; }
  check('点击后卡片进入成功态文案', doneOk);
  // 去重守卫：1) 未派发同义导航状态卡  2) 未落页面内反馈 toast（showIsland 不可用时的降级通路）
  const dupTitles = await page.evaluate(() =>
    (window.__navStatusEvents || []).filter((t) => t.includes('已全部标记为已读')));
  check('成功反馈不重复（未派发同义导航状态卡）', dupTitles.length === 0, dupTitles.join(' | '));
  const toastDup = await page.evaluate(() => !!document.querySelector('.message-feedback-toast'));
  check('成功反馈不重复（无页面内 feedback toast）', !toastDup);
  await page.screenshot({ path: `${OUT}/notif-suggest-island-done.png` });
  let autoClosed = true;
  try {
    await page.waitForSelector('#unified-nav-container .notif-suggest-card', { state: 'detached', timeout: 6000 });
  } catch { autoClosed = false; }
  check('成功态后卡片自动收起', autoClosed);
  await page.waitForTimeout(500);
  const badgeGone = await page.evaluate(() => !document.querySelector('.bottom-nav-glass .unread-badge'));
  check('底部导航未读徽标消失', badgeGone);
  check('mark_all_as_read RPC 已发出', markAllCalls >= 1, `calls=${markAllCalls}`);
}

/* ---------- 3) × 掉后同批次不弹；未读增长后新批次重新弹 ---------- */
unreadMock = 3; // 重置 mock 真相（第 2 步的 mark_all_as_read 把它清零了）
markAllCalls = 0;
await injectState(3);
await gotoTab('posts');          // 切走（若卡片还在应被收起）
const goneOnLeave = await page.evaluate(() => !document.querySelector('#unified-nav-container .notif-suggest-card'));
check('切走 tab 卡片跟随收起', goneOnLeave);
await gotoTab('messages');       // 切回收件箱 → 3 > 0（无 dismiss 记录）→ 应弹
card = await getCard();
check('切回收件箱重新弹卡（新会话无 dismiss）', !!card, JSON.stringify(card));
if (card) {
  await page.click('#unified-nav-container .notif-suggest-card .nsc-close');
  await page.waitForSelector('#unified-nav-container .notif-suggest-card', { state: 'detached', timeout: 4000 });
  check('点 × 后卡片收起', true);
  await gotoTab('posts');
  await gotoTab('messages');     // 同批次（3 未增长）→ 不弹
  await page.waitForTimeout(1200);
  const silentOk = await page.evaluate(() => !document.querySelector('#unified-nav-container .notif-suggest-card'));
  check('同批次 × 掉后切走切回不再弹', silentOk);
}
await injectState(5);            // 未读增长 → 新批次
await gotoTab('posts');
await gotoTab('messages');
await page.waitForTimeout(1200);
card = await getCard();
check('未读增长后新批次重新弹卡', !!card, JSON.stringify(card));

/* ---------- 4) 切到 AI 分区卡片收起 ---------- */
if (card) {
  await page.click('.messages-tab .segment-tab:has-text("BOH AI")');
  await page.waitForTimeout(600);
  const goneOnAi = await page.evaluate(() => !document.querySelector('#unified-nav-container .notif-suggest-card'));
  check('切到 AI 分区卡片收起', goneOnAi);
}

check('全程无 JS 错误', errors.length === 0, errors.join(' | '));
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
