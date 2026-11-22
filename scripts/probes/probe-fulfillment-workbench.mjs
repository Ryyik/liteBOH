#!/usr/bin/env node
/**
 * 数据管理 · 订单与礼物履约台（2026-11-21）
 *
 * 目的：用真实浏览器确认三条来源（商城 / 抽奖自动单 / 赠礼）在同一队列里
 * 正确渲染、筛选、展开详情，并能就地推进状态、后台取消、一键复制收件信息，
 * 以及手机竖屏下的操作区是否真的可单手点到。
 *
 * 数据全部 mock（不读写线上）：只看页面接线与 HTTP 载荷。
 * 依赖：npm run dev（http://localhost:5173）。
 * 用法：node scripts/probes/probe-fulfillment-workbench.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const SHOT_DIR = 'debug-screenshots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const ADMIN_UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const orders = [
  {
    id: 'order-1',
    order_no: 'BOH-1001',
    user_id: 'user-a',
    items: [{ title: '机械键盘', quantity: 1, selected_spec_label: '默认', image: '' }],
    total_points: 1200,
    points_used: 1200,
    rmb_total: 0,
    payment_mode: 'points_only',
    status: 'preparing',
    created_at: '2026-11-20T01:00:00.000Z',
    updated_at: '2026-11-20T01:00:00.000Z',
    shipping_recipient: '张三',
    shipping_phone: '13800000000',
    shipping_address: '广东省 深圳市 南山区',
    remark: '',
    source: 'shop',
    lottery_id: null,
  },
  {
    id: 'order-2',
    order_no: 'BOH-LOTTERY-2002',
    user_id: 'user-b',
    items: [{ title: '八周年徽章', quantity: 1, selected_spec_label: '中奖奖品', image: '' }],
    total_points: 0,
    points_used: 0,
    rmb_total: 0,
    payment_mode: 'lottery',
    status: 'preparing',
    created_at: '2026-11-21T02:00:00.000Z',
    updated_at: '2026-11-21T02:00:00.000Z',
    shipping_recipient: '',
    shipping_phone: '',
    shipping_address: '',
    remark: '抽奖「八周年」中奖奖品，开奖时自动生成',
    source: 'lottery',
    lottery_id: 'lot-1',
  },
];

const gifts = [
  {
    id: 'gift-1',
    user_id: 'user-a',
    gift_no: 'SF-3001',
    gift_content: '纪念帆布袋',
    gift_price: 0,
    gift_points: 0,
    gift_image: '',
    gift_status: 'shipped',
    is_active: true,
    address_id: 'addr-1',
    completed_at: null,
    created_at: '2026-11-19T01:00:00.000Z',
    updated_at: '2026-11-20T01:00:00.000Z',
    profile: { username: 'alice' },
  },
  {
    id: 'gift-2',
    user_id: 'user-b',
    gift_no: 'SF-3002',
    gift_content: '周年贴纸',
    gift_price: 0,
    gift_points: 0,
    gift_image: '',
    gift_status: 'completed',
    is_active: false,
    address_id: null,
    completed_at: '2026-11-18T01:00:00.000Z',
    created_at: '2026-11-17T01:00:00.000Z',
    updated_at: '2026-11-18T01:00:00.000Z',
    profile: { username: 'bob' },
  },
];

const addresses = [
  {
    id: 'addr-1',
    user_id: 'user-a',
    recipient: '张三',
    phone: '13800000000',
    region: '广东省',
    detail: '深圳市南山区',
    is_default: true,
  },
];
const profiles = [
  { id: 'user-a', username: 'alice' },
  { id: 'user-b', username: 'bob' },
];

const patchBodies = [];
const rpcCalls = [];
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error.message).slice(0, 300)));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (/favicon|net::ERR_|Download the React/i.test(text)) return;
  pageErrors.push(text.slice(0, 300));
});

await page.route('**/rest/v1/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const table = url.pathname.split('/rest/v1/')[1] || '';
  const method = request.method();

  if (method === 'PATCH') {
    const body = request.postDataJSON();
    patchBodies.push({ table, body });
    const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
    if (table === 'shop_points_orders') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id, status: body.status }),
      });
      return;
    }
    if (table === 'user_gifts') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id, gift_status: body.gift_status }),
      });
      return;
    }
  }

  if (table === 'shop_points_orders') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${orders.length - 1}/${orders.length}` },
      body: JSON.stringify(orders),
    });
    return;
  }
  if (table === 'user_gifts') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${gifts.length - 1}/${gifts.length}` },
      body: JSON.stringify(gifts),
    });
    return;
  }
  if (table === 'user_addresses') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${addresses.length - 1}/${addresses.length}` },
      body: JSON.stringify(addresses),
    });
    return;
  }
  if (table === 'profiles') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${profiles.length - 1}/${profiles.length}` },
      body: JSON.stringify(profiles),
    });
    return;
  }
  if (table.startsWith('rpc/')) {
    const fn = table.replace(/^rpc\//, '');
    rpcCalls.push({ fn, body: request.postDataJSON() });
    /* 后台取消：模拟服务端返回「已取消 + 退回 1200 积分 + 邮件已入队」 */
    if (fn === 'admin_cancel_shop_order') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          message: 'ORDER_CANCELLED',
          order_no: 'BOH-1001',
          previous_status: 'preparing',
          refunded_points: 1200,
          current_points: 3400,
          mail_queued: true,
        }),
      });
      return;
    }
    /* 邮件账本状态：模拟「已真正由 Brevo 发出」 */
    if (fn === 'admin_shop_order_mail_status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          has_record: true,
          status: 'sent',
          attempts: 1,
          last_error: null,
          sent_at: '2026-11-21T09:50:00Z',
          queued_at: '2026-11-21T09:49:00Z',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/0' },
    body: '[]',
  });
});

const armAdminGuard = () =>
  page.evaluate((uid) => {
    const app = document.querySelector('#app')?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    if (!pinia) return 'no-pinia';
    const apply = () => {
      const s = pinia.state.value.auth;
      if (!s) return;
      s.isLoggedIn = true;
      s.isInitialized = true;
      if (s.userInfo) Object.assign(s.userInfo, { username: '探针', id: uid, role: 'admin' });
    };
    apply();
    if (!window.__bohProbeGuard) window.__bohProbeGuard = setInterval(apply, 150);
    return String(pinia.state.value.auth?.userInfo?.role || '(空)');
  }, ADMIN_UUID);

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(3000);
await armAdminGuard();
await page.evaluate(() => {
  location.hash = '#/admin/data-management?section=data&tab=fulfillment';
});
await page.waitForSelector('.fl-page', { timeout: 30000 });
await page.waitForSelector('.fl-card:not(.is-skeleton)', { timeout: 15000 });
await page.waitForTimeout(400);

const cards = page.locator('.fl-card:not(.is-skeleton)');
record('四张履约卡片全部渲染', (await cards.count()) === 4, `count=${await cards.count()}`);

const summaryValues = await page.locator('.fl-stat-value').allTextContents();
/* 顺序即优先级：「待补信息」排在第二，因为它是唯一「不处理就永远寄不出」的一类，
   竖屏概览横滑时前两张卡必须是最该看的两个数。 */
record(
  '概览计数与优先顺序正确',
  JSON.stringify(summaryValues) === JSON.stringify(['4', '1', '2', '1', '1']),
  summaryValues.join('/'),
);

const firstCardText = await cards.first().innerText();
record(
  '默认排序把缺收件信息的抽奖单放在首位',
  firstCardText.includes('抽奖') && firstCardText.includes('待补收件信息'),
  firstCardText.replace(/\s+/g, ' ').slice(0, 80),
);

const lotteryBadge = await page.locator('.fl-origin.is-lottery').count();
record('抽奖来源标签存在', lotteryBadge === 1, `count=${lotteryBadge}`);

await page.locator('.fl-stat', { hasText: '待补信息' }).click();
await page.waitForTimeout(250);
record('「待补信息」筛选只剩 1 条', (await cards.count()) === 1, `count=${await cards.count()}`);

await page.getByRole('button', { name: '重置筛选' }).click();
await page.waitForTimeout(250);
record('重置筛选恢复 4 条', (await cards.count()) === 4, `count=${await cards.count()}`);

const preparingCard = page.locator('.fl-card', { hasText: 'BOH-1001' });
await preparingCard.getByRole('button', { name: '标记已寄出' }).click();
await page.waitForTimeout(300);
record(
  '商城单可就地推进为已寄出',
  patchBodies.some(
    (entry) => entry.table === 'shop_points_orders' && entry.body.status === 'shipped',
  ),
  JSON.stringify(patchBodies.at(-1) || null),
);
record(
  '推进后按钮切换为标记已送达',
  (await preparingCard.getByRole('button', { name: '标记已送达' }).count()) === 1,
);

/* ── 一键复制完整收件信息（2026-11-21）────────────────────────────── */
const copyButton = preparingCard.getByRole('button', { name: '复制完整收件信息' });
record(
  '有地址的单显示复制按钮',
  (await copyButton.count()) === 1,
  `count=${await copyButton.count()}`,
);

await copyButton.click();
await page.waitForTimeout(250);
const clipText = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
record(
  '复制出来是带字段名的三行，而不是单行拼接',
  clipText.split('\n').length === 3 &&
    clipText.includes('收货人：张三') &&
    clipText.includes('电话：13800000000') &&
    clipText.includes('地址：'),
  JSON.stringify(clipText),
);

/* ── 后台取消（2026-11-21）────────────────────────────────────────── */
const cancelButton = preparingCard.getByRole('button', { name: '取消' });
record('已寄出的单仍给取消入口（后端允许，但不自动退积分）', (await cancelButton.count()) === 1);

await cancelButton.click();
await page.waitForSelector('.confirm-modal', { timeout: 5000 });
const confirmMessage = await page.locator('.confirm-message').innerText();
record(
  '取消前二次确认，且明确写出「不会自动退积分」',
  confirmMessage.includes('已寄出') && confirmMessage.includes('不会自动退回积分'),
  confirmMessage.replace(/\s+/g, ' ').slice(0, 100),
);

await page.locator('.confirm-btn.primary').click();
await page.waitForTimeout(600);

record(
  '取消走 admin_cancel_shop_order RPC 而不是直接改表',
  rpcCalls.some((call) => call.fn === 'admin_cancel_shop_order'),
  JSON.stringify(rpcCalls.map((call) => call.fn)),
);
record(
  '取消请求带上了订单号与来源原因',
  rpcCalls.some(
    (call) =>
      call.fn === 'admin_cancel_shop_order' &&
      call.body?.p_order_id === 'order-1' &&
      call.body?.p_reason === 'admin_cancel_from_workbench',
  ),
  JSON.stringify(rpcCalls.find((call) => call.fn === 'admin_cancel_shop_order')?.body || null),
);
record(
  '取消后卡片转为已取消，不再挂着推进按钮',
  (await preparingCard.innerText()).includes('已取消') &&
    (await preparingCard.getByRole('button', { name: '标记已送达' }).count()) === 0,
  (await preparingCard.innerText()).replace(/\s+/g, ' ').slice(0, 80),
);

const giftCard = page.locator('.fl-card', { hasText: 'SF-3001' });
await giftCard.getByRole('button', { name: '标记已送达' }).click();
await page.waitForTimeout(300);
record(
  '赠礼可就地推进为已送达',
  patchBodies.some(
    (entry) => entry.table === 'user_gifts' && entry.body.gift_status === 'completed',
  ),
  JSON.stringify(patchBodies.at(-1) || null),
);

const completedGiftCard = page.locator('.fl-card', { hasText: 'SF-3002' });
const completedGiftText = await completedGiftCard.innerText();
record(
  '已送达且无地址的历史赠礼不再提示“待补”',
  !completedGiftText.includes('待补收件信息') && completedGiftText.includes('收货人 / 地址未留存'),
  completedGiftText.replace(/\s+/g, ' ').slice(0, 90),
);

const lotteryCard = page.locator('.fl-card', { hasText: 'BOH-LOTTERY-2002' });
await lotteryCard.getByRole('button', { name: '详情' }).click();
await page.waitForTimeout(200);
record('抽奖单详情交代自动建单口径', (await lotteryCard.innerText()).includes('开奖自动生成'), '');

/* ── 进度邮件真实状态（2026-11-21）────────────────────────────────
   用户问的是「到底发出去了没有」，页面必须给账本答案而不是「已排队」。 */
record(
  '展开详情会查邮件账本（走只读 RPC）',
  rpcCalls.some((call) => call.fn === 'admin_shop_order_mail_status'),
  JSON.stringify(rpcCalls.map((call) => call.fn)),
);
record(
  '邮件状态如实显示「已由 Brevo 发出」，不说成含糊的「已排队」',
  (await lotteryCard.innerText()).includes('邮件已由 Brevo 发出'),
  (await lotteryCard.innerText()).replace(/\s+/g, ' ').slice(0, 120),
);

/* 推进状态后，上一档的邮件结论必须失效：否则详情里会挂着旧的「已发出」 */
const mailCallsBefore = rpcCalls.filter((c) => c.fn === 'admin_shop_order_mail_status').length;
await lotteryCard.getByRole('button', { name: '标记已寄出' }).click();
await page.waitForTimeout(400);

/* 推进后卡片保持展开态。必须「收起 → 再展开」才会重新触发查询，
   只点一次等于把它收起，计数器当然不会涨（这里踩过一次，别写成一跳）。 */
const toggle = lotteryCard.locator('.fl-detail-toggle');
const isOpen = async () => (await lotteryCard.locator('.fl-expanded').count()) > 0;

if (await isOpen()) {
  await toggle.click();
  await page.waitForTimeout(250);
}
await toggle.click();
await page.waitForTimeout(500);
const mailCallsAfter = rpcCalls.filter((c) => c.fn === 'admin_shop_order_mail_status').length;
record(
  '推进状态后重新查邮件账本，不沿用旧状态的结论',
  mailCallsAfter > mailCallsBefore,
  `before=${mailCallsBefore} after=${mailCallsAfter}`,
);

await page.screenshot({
  path: `${SHOT_DIR}/fulfillment-workbench-1440.png`,
  fullPage: true,
});
record('桌面截图已保存', true, `${SHOT_DIR}/fulfillment-workbench-1440.png`);

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);

/* 竖屏不能只看「有没有截图」，要量命中区：手机上 44px 以下基本按不准 */
const touchAudit = await page.evaluate(() => {
  const pick = (selector) =>
    Array.from(document.querySelectorAll(selector)).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: (node.textContent || '').trim().slice(0, 14),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
  return {
    pageWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    buttons: pick('.fl-card-foot button'),
    copyButtons: pick('.fl-copy'),
    chips: pick('.fl-chip').slice(0, 3),
    summaryOverflow: (() => {
      const node = document.querySelector('.fl-summary');
      if (!node) return null;
      return {
        overflowX: getComputedStyle(node).overflowX,
        scrollable: node.scrollWidth > node.clientWidth,
      };
    })(),
  };
});

record(
  '竖屏无横向溢出（页面不跟着列表左右晃）',
  touchAudit.scrollWidth <= touchAudit.pageWidth + 1,
  `scrollWidth=${touchAudit.scrollWidth} client=${touchAudit.pageWidth}`,
);

record(
  '竖屏操作按钮命中区 ≥44px',
  touchAudit.buttons.length > 0 && touchAudit.buttons.every((btn) => btn.height >= 44),
  JSON.stringify(touchAudit.buttons),
);

record(
  '竖屏复制按钮带文字且 ≥32px，不只留一个小图标',
  touchAudit.copyButtons.length > 0 &&
    touchAudit.copyButtons.every((btn) => btn.height >= 32 && btn.width >= 50),
  JSON.stringify(touchAudit.copyButtons),
);

record(
  '概览卡在竖屏改为横向可滑，不把队列挤出首屏',
  touchAudit.summaryOverflow?.overflowX === 'auto' &&
    touchAudit.summaryOverflow?.scrollable === true,
  JSON.stringify(touchAudit.summaryOverflow),
);

record(
  '筛选 chip 在竖屏可单手点到（≥36px）',
  touchAudit.chips.every((chip) => chip.height >= 36),
  JSON.stringify(touchAudit.chips),
);

await page.screenshot({
  path: `${SHOT_DIR}/fulfillment-workbench-390.png`,
  fullPage: false,
});
record('竖屏截图已保存', true, `${SHOT_DIR}/fulfillment-workbench-390.png`);

/* 大号手机横放：纵向留白要让位给内容 */
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(300);
const landscapeAudit = await page.evaluate(() => ({
  heroParagraphHidden: (() => {
    const node = document.querySelector('.fl-hero p:not(.fl-eyebrow)');
    return node ? getComputedStyle(node).display === 'none' : null;
  })(),
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
record(
  '横屏压缩次要说明文字且不溢出',
  landscapeAudit.heroParagraphHidden === true &&
    landscapeAudit.scrollWidth <= landscapeAudit.clientWidth + 1,
  JSON.stringify(landscapeAudit),
);
await page.screenshot({
  path: `${SHOT_DIR}/fulfillment-workbench-landscape.png`,
  fullPage: false,
});

record(
  '零 pageerror / console.error',
  pageErrors.length === 0,
  pageErrors.join(' | ').slice(0, 300),
);

await browser.close();
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.error('FAILED:', failed.map((item) => item.name).join(', '));
  process.exitCode = 1;
}
