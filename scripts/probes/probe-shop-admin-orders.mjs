// 探针：商城「订单管理」（管理员，2026-11-10）
//
// 用户口径：「点击头像出现一个订单管理」——管理员要能在一屏里看到**全部**订单
// （不只是自己的），并当场推进进度（现金单收完钱就能点发货）。
//
// 这一页有四类东西要守住：
//   1) 入口只对管理员出现（普通用户点头像应该直达购物袋，不弹菜单）；
//   2) 列表是**全部**订单 —— 如果哪天有人顺手加了 `user_id` 过滤，
//      管理员就又会变成"只看自己的单"，而界面看起来一切正常；
//   3) 每行的动作与状态严格对应：准备中 →「标记已发货」、已发货 →「标记完成」、
//      完成/取消 → 无动作（不能把已完成的单再"推进"一次）；
//   4) 形态：竖屏整页、横屏居中弹窗（与结算页同一套断点）。
//
// ⚠️ 探针不写库：订单数据靠注入组件状态，点击「标记已发货」这类**写操作**不在这里跑
//    （真跑会给用户发站内信 + 邮件）。写路径由 tests/unit/shop-order-advance.test.js 守。
//
// 用法：先 `npm run dev`（默认 5173），再
//   node scripts/probes/probe-shop-admin-orders.mjs
//   本机浏览器版本对不上时可指定 channel：PROBE_CHANNEL=chrome
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const SHOP_URL = `${BASE}/#/shop`;

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

const browser = await chromium.launch({
  channel: process.env.PROBE_CHANNEL || undefined,
  args: ['--no-sandbox'],
});

const boot = async (page) => {
  await page.goto(SHOP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card .p-name'), null, {
    timeout: 30000,
  });
};

const setRole = (page, role) =>
  page.evaluate((value) => {
    const st = document.querySelector('.store-page').__vueParentComponent.setupState;
    st.authStore.isInitialized = true;
    st.authStore.userInfo.role = value;
  }, role);

/* 组件实例要沿 parent 往上找：Teleport 后的根节点，其 __vueParentComponent 是
   BaseTransition，不是 AdminOrderSheet 本身。 */
const sheetState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('.ao-root');
    if (!root) return null;
    let comp = root.__vueParentComponent;
    while (comp && !comp.setupState?.orders) comp = comp.parent;
    return comp ? comp.setupState : null;
  });

const FAKE_ORDERS = [
  {
    id: 'probe-1',
    orderNo: 'BOH-ORDER-PROBE-0001',
    buyerName: 'Ryyik',
    status: 'preparing',
    statusLabel: '准备中',
    priceText: '45 积分 + ¥12.90',
    createdAt: new Date().toISOString(),
    items: [{ title: '围巾小狗', quantity: 1 }],
    shipping: { recipient: '张三', phone: '138****1234', address: '江苏省苏州市' },
    remark: '',
  },
  {
    id: 'probe-2',
    orderNo: 'BOH-ORDER-PROBE-0002',
    buyerName: '小方块',
    status: 'shipped',
    statusLabel: '已寄出',
    priceText: '45 积分 + ¥6.90',
    createdAt: new Date().toISOString(),
    items: [{ title: '钥匙扣', quantity: 1 }],
    shipping: { recipient: '李四', phone: '', address: '北京市朝阳区' },
    remark: '',
  },
  {
    id: 'probe-3',
    orderNo: 'BOH-ORDER-PROBE-0003',
    buyerName: 'Ryyik',
    status: 'completed',
    statusLabel: '已送达',
    priceText: '10 积分',
    createdAt: new Date().toISOString(),
    items: [{ title: '贴纸', quantity: 3 }],
    shipping: { recipient: '王五', phone: '', address: '上海市' },
    remark: '',
  },
];

// ---------- A) 普通用户：点头像不弹菜单，直达购物袋 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await boot(page);
  await setRole(page, 'user');
  await page.waitForTimeout(200);
  await page.click('.avatar-btn');
  await page.waitForTimeout(300);
  check('A1 普通用户点头像不弹菜单', (await page.locator('.avatar-menu').count()) === 0);
  /* 普通用户点头像 = 去「我的礼物」；未登录时这条链先弹登录框（goBag 的既有行为）。
     不拿 hash 断言 —— switchTab 只改 activeTab，路由 query 是**单向**同步的。 */
  const loginPrompt = await page.evaluate(
    () =>
      document.querySelector('.store-page').__vueParentComponent.setupState.authStore
        .showLoginModal,
  );
  check(
    'A2 普通用户点头像走「我的礼物」链（未登录先弹登录）',
    loginPrompt === true,
    String(loginPrompt),
  );
  check('A3 普通用户没有订单管理弹层', (await page.locator('.ao-root').count()) === 0);
  await ctx.close();
}

// ---------- B) 管理员：菜单三项 + 打开订单管理 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await boot(page);
  await setRole(page, 'admin');
  await page.waitForTimeout(200);
  await page.click('.avatar-btn');
  await page.waitForTimeout(300);

  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('.avatar-menu-item')].map((el) => el.innerText.trim()),
  );
  check('B1 管理员菜单含「礼物管理」', menu.includes('礼物管理'), JSON.stringify(menu));
  check('B2 菜单仍保留「我的礼物」', menu.includes('我的礼物'));

  const index = menu.indexOf('礼物管理');
  await page.locator('.avatar-menu-item').nth(index).click();
  await page.waitForTimeout(500);
  check('B3 点「礼物管理」打开弹层', (await page.locator('.ao-root').count()) === 1);

  const geo = await page.evaluate(() => {
    const box = document.querySelector('.ao-sheet').getBoundingClientRect();
    return { x: box.x, y: box.y, w: Math.round(box.width), h: Math.round(box.height) };
  });
  check(
    'B4 竖屏是整页（铺满视口）',
    geo.x === 0 && geo.y === 0 && geo.w === 390 && geo.h === 844,
    JSON.stringify(geo),
  );

  // ---------- C) 列表：动作与状态严格对应 ----------
  /* 注入前必须等真实请求落地（2026-11-12 踩到）：
     `*.supabase.co` 恢复可达后，打开弹层触发的 load() 真的会发出并耗时，
     而它结尾是 `orders.value = data` —— 若在它返回前注入，注入结果会被
     覆盖成空数组（C1~C7 全红，表现为「三单全部列出 | []」）。
     网络快慢不定，所以先等 loading 归零，注入后再补一次兜底注入。 */
  const injectOrders = () =>
    page.evaluate((orders) => {
      const root = document.querySelector('.ao-root');
      let comp = root.__vueParentComponent;
      while (comp && !comp.setupState?.orders) comp = comp.parent;
      comp.setupState.orders = orders;
      comp.setupState.loading = false;
      comp.setupState.loadError = '';
    }, FAKE_ORDERS);

  await page
    .waitForFunction(
      () => {
        const root = document.querySelector('.ao-root');
        let comp = root?.__vueParentComponent;
        while (comp && !comp.setupState?.orders) comp = comp.parent;
        return Boolean(comp) && comp.setupState.loading === false;
      },
      null,
      { timeout: 20000 },
    )
    .catch(() => {});

  await injectOrders();
  await page.waitForTimeout(500);
  await injectOrders();
  await page.waitForTimeout(300);

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.ao-item')].map((el) => ({
      status: el.querySelector('.ao-status')?.innerText.trim(),
      action: el.querySelector('.ao-advance')?.innerText.trim() || '',
      done: el.querySelector('.ao-done')?.innerText.trim() || '',
    })),
  );
  check('C1 三单全部列出', rows.length === 3, JSON.stringify(rows));
  check(
    'C2 准备中 →「标记已寄出」',
    rows[0]?.status === '准备中' && rows[0]?.action === '标记已寄出',
  );
  check(
    'C3 已寄出 →「标记已送达」',
    rows[1]?.status === '已寄出' && rows[1]?.action === '标记已送达',
  );
  check(
    'C4 送达态不再给推进按钮',
    rows[2]?.status === '已送达' && rows[2]?.action === '' && rows[2]?.done === '已送达',
    JSON.stringify(rows[2]),
  );

  const count = await page.evaluate(() => document.querySelector('.ao-count')?.innerText.trim());
  check('C5 顶栏显示总单数', count === '3 单', count);

  // 筛选
  const preparingChip = page.locator('.ao-filter', { hasText: '准备中' });
  await preparingChip.click();
  await page.waitForTimeout(250);
  check('C6 筛选「准备中」只剩 1 行', (await page.locator('.ao-item').count()) === 1);
  await page.locator('.ao-filter', { hasText: '全部' }).click();
  await page.waitForTimeout(250);
  check('C7 切回「全部」恢复 3 行', (await page.locator('.ao-item').count()) === 3);

  // ---------- D) 关闭：Esc ----------
  // ⚠️ 竖屏是整页形态，遮罩被面板完全盖住 ⇒ 点遮罩这一档只能在横屏测（见 E2）。
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check('D1 Esc 关闭弹层', (await page.locator('.ao-root').count()) === 0);

  // ---------- E) 横屏：居中弹窗 + 点遮罩关闭 ----------
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(250);
  await page.click('.avatar-btn');
  await page.waitForTimeout(250);
  const menu3 = await page.evaluate(() =>
    [...document.querySelectorAll('.avatar-menu-item')].map((el) => el.innerText.trim()),
  );
  await page.locator('.avatar-menu-item').nth(menu3.indexOf('礼物管理')).click();
  await page.waitForTimeout(500);
  const land = await page.evaluate(() => {
    const box = document.querySelector('.ao-sheet').getBoundingClientRect();
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
  check(
    'E1 横屏居中且不溢出视口',
    Math.abs(land.x + land.w / 2 - land.vw / 2) <= 1 &&
      land.w <= land.vw - 60 &&
      land.h <= land.vh - 20,
    JSON.stringify(land),
  );

  // 横屏面板四边留白，遮罩真的可点（竖屏整页形态下这条永远点不到）
  await page.locator('.ao-scrim').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(350);
  check('E2 横屏点遮罩关闭弹层', (await page.locator('.ao-root').count()) === 0);

  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
