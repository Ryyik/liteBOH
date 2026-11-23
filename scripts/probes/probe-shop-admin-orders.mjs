// 探针：商城「订单管理」（管理员，2026-11-10；2026-11-23 迁 BohModal）
//
// 用户口径：「点击头像出现一个订单管理」——管理员要能在一屏里看到**全部**订单
// （不只是自己的），并当场推进进度（现金单收完钱就能点发货）。
//
// 这一页有五类东西要守住：
//   1) 入口只对管理员出现（普通用户点头像应该直达购物袋，不弹菜单）；
//   2) 列表是**全部**订单 —— 如果哪天有人顺手加了 `user_id` 过滤，
//      管理员就又会变成"只看自己的单"，而界面看起来一切正常；
//   3) 每行的动作与状态严格对应：准备中 →「标记已寄出」、已寄出 →「标记已送达」、
//      完成/取消 → 无动作（不能把已完成的单再"推进"一次）；
//   4) 形态：竖屏**整页**（铺满视口）、横屏居中弹窗（与结算页同一套断点）；
//   5) 壳能力（plans/045 阶段 2 第四家族）：层级读 --boh-z-modal、720 宽、
//      滚锁落在 html（本站真正的滚动容器）、Esc 由焦点陷阱接、暗色可读。
//
// ⚠️ 探针不写库：订单数据靠注入组件状态，点击「标记已寄出」这类**写操作**不在这里跑
//    （真跑会给用户发站内信 + 邮件）。写路径由 tests/unit/shop-order-advance.test.js 守。
//
// ⚠️ 形态断言是这家的**用户口径**：竖屏整页（不是贴底 Sheet）。BohModal 默认窄屏是
//    贴底 Sheet，本宿主靠 `portrait-page` 变体保住「翻到下一页」的语义 —— 若哪天有人
//    删掉这个 prop，B4 必须转红。这条反证做过（见 plans/045）。
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

/* 组件实例要沿 parent 往上找：Teleport 后挂在 body 下，其 __vueParentComponent
   现在是 BohModal 内部的 Transition/子树，不是 AdminOrderSheet 本身。
   判据用宿主自己的 setupState.orders（壳里没有这个字段）。 */

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
  check('A3 普通用户没有订单管理弹层', (await page.locator('.boh-modal__overlay').count()) === 0);
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
  check('B3 点「礼物管理」打开弹层', (await page.locator('.boh-modal__overlay').count()) === 1);

  const geo = await page.evaluate(() => {
    const overlay = document.querySelector('.boh-modal__overlay');
    const dialog = document.querySelector('.boh-modal__dialog');
    const box = dialog.getBoundingClientRect();
    const cs = getComputedStyle(dialog);
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
      radius: cs.borderTopLeftRadius,
      z: Number(getComputedStyle(overlay).zIndex),
      grab: getComputedStyle(document.querySelector('.boh-modal__grab')).display,
      bodyLocked: document.body.style.overflow,
      rootLocked: document.documentElement.style.getPropertyValue('overflow-y'),
    };
  });
  check(
    'B4 竖屏是整页（铺满视口，portrait-page 变体）',
    geo.x === 0 && geo.y === 0 && geo.w === 390 && geo.h === 844,
    JSON.stringify(geo),
  );
  check('B5 整页零圆角（不是贴底 Sheet）', geo.radius === '0px', geo.radius);
  check('B6 整页无 grab 条（不是"浮一层"心智）', geo.grab === 'none', geo.grab);
  check('B7 层级读 --boh-z-modal', geo.z === 2147482600, `z=${geo.z}`);
  check(
    'B8 滚锁落在 html（真正的滚动容器）',
    geo.bodyLocked === 'hidden' && geo.rootLocked === 'hidden',
    `body=${geo.bodyLocked} html=${geo.rootLocked}`,
  );

  // ---------- C) 列表：动作与状态严格对应 ----------
  /* 注入前必须等真实请求落地（2026-11-12 踩到）：
     `*.supabase.co` 恢复可达后，打开弹层触发的 load() 真的会发出并耗时，
     而它结尾是 `orders.value = data` —— 若在它返回前注入，注入结果会被
     覆盖成空数组（C1~C7 全红，表现为「三单全部列出 | []」）。
     网络快慢不定，所以先等 loading 归零，注入后再补一次兜底注入。 */
  const injectOrders = () =>
    page.evaluate((orders) => {
      const root = document.querySelector('.boh-modal__overlay');
      let comp = root.__vueParentComponent;
      while (comp && !comp.setupState?.orders) comp = comp.parent;
      comp.setupState.orders = orders;
      comp.setupState.loading = false;
      comp.setupState.loadError = '';
    }, FAKE_ORDERS);

  await page
    .waitForFunction(
      () => {
        const root = document.querySelector('.boh-modal__overlay');
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

  /* ⚠️ 筛选条必须**肉眼可见且纵向堆在头部之下**，不能只测「点得到」。
     迁 BohModal 时踩到：把 header 和 filters 两个块级元素直接塞进 #head 槽，
     而槽外层是 flex **行**容器（壳里那条 space-between 是给标题+关闭钮的）
     ⇒ 两者横排、被挤成 0 高，整条筛选栏从画面上消失。
     当时 C6/C7 照样全绿（Playwright 的 click 会命中被压扁的元素），
     只有截图才看得出来 —— 所以这里补几何断言。
     🔴 反证教训：第一版只测高度/宽度/inView，把 flex-direction 删掉照样绿
     （横排时 filters 宽度仍然够、高度也还在）⇒ **必须测「堆叠关系」**：
     filters.top 要在 head.bottom 之下，且两者横向应有重叠（同一列）。 */
  const filterGeo = await page.evaluate(() => {
    const bar = document.querySelector('.ao-filters');
    const head = document.querySelector('.ao-head');
    const chip = document.querySelector('.ao-filter');
    if (!bar || !head || !chip) return null;
    const b = bar.getBoundingClientRect();
    const hd = head.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
    return {
      barH: Math.round(b.height),
      barW: Math.round(b.width),
      barTop: Math.round(b.top),
      headBottom: Math.round(hd.bottom),
      stacked: Math.round(b.top) >= Math.round(hd.bottom) - 1,
      // 纵向堆叠时两者应有横向重叠；横排时它们是左右并置（x 不重叠）
      overlapX: Math.min(b.right, hd.right) - Math.max(b.left, hd.left),
      chipH: Math.round(c.height),
      chipW: Math.round(c.width),
      inView: b.top >= 0 && b.bottom <= window.innerHeight,
      hitIsChip: hit === chip || chip.contains(hit),
      visible: getComputedStyle(bar).display !== 'none',
    };
  });
  check(
    'C8 筛选条真的可见（高度/宽度/在视口内）',
    Boolean(filterGeo) &&
      filterGeo.visible &&
      filterGeo.barH >= 30 &&
      filterGeo.barW >= 300 &&
      filterGeo.inView,
    JSON.stringify(filterGeo),
  );
  check(
    'C9 筛选条纵向堆在头部之下（不是被挤成并排）',
    Boolean(filterGeo) && filterGeo.stacked && filterGeo.overlapX > 200,
    JSON.stringify(filterGeo),
  );
  check(
    'C10 筛选胶囊没被挤压且未被遮挡',
    Boolean(filterGeo) && filterGeo.chipH >= 20 && filterGeo.chipW >= 30 && filterGeo.hitIsChip,
    JSON.stringify(filterGeo),
  );

  /* C11 亮色下卡片必须与列表底分得开。
     🔴 这条也是截图抓出来的：整页形态把底色统一成 --boh-page-bg 后，
     亮色下页面 = #fff、卡片 = #fff ⇒ 卡片边界完全消失（一片纯白）。
     列表区必须用 --boh-bg-secondary（浅灰），头部/筛选条才用页面色。 */
  const lightLayer = await page.evaluate(() => {
    const card = document.querySelector('.ao-item');
    const body = document.querySelector('.ao-body');
    if (!card || !body) return null;
    return {
      card: getComputedStyle(card).backgroundColor,
      body: getComputedStyle(body).backgroundColor,
    };
  });
  check(
    'C11 亮色卡片与列表底可分辨（不是一片纯白）',
    Boolean(lightLayer) && lightLayer.card !== lightLayer.body,
    JSON.stringify(lightLayer),
  );

  // 筛选
  const preparingChip = page.locator('.ao-filter', { hasText: '准备中' });
  await preparingChip.click();
  await page.waitForTimeout(250);
  check('C6 筛选「准备中」只剩 1 行', (await page.locator('.ao-item').count()) === 1);
  await page.locator('.ao-filter', { hasText: '全部' }).click();
  await page.waitForTimeout(250);
  check('C7 切回「全部」恢复 3 行', (await page.locator('.ao-item').count()) === 3);

  // ---------- D) 关闭：Esc（由壳的焦点陷阱接，组件级监听已删） ----------
  // ⚠️ 竖屏是整页形态，遮罩被面板完全盖住 ⇒ 点遮罩这一档只能在横屏测（见 E2）。
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check('D1 Esc 关闭弹层', (await page.locator('.boh-modal__overlay').count()) === 0);
  const afterClose = await page.evaluate(() => ({
    body: document.body.style.overflow,
    root: document.documentElement.style.getPropertyValue('overflow-y'),
  }));
  check(
    'D2 Esc 关闭后滚锁释放',
    afterClose.body !== 'hidden' && afterClose.root !== 'hidden',
    JSON.stringify(afterClose),
  );

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
    const dialog = document.querySelector('.boh-modal__dialog');
    const box = dialog.getBoundingClientRect();
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
      vw: window.innerWidth,
      vh: window.innerHeight,
      radius: getComputedStyle(dialog).borderTopLeftRadius,
    };
  });
  check(
    'E1 横屏居中且不溢出视口',
    Math.abs(land.x + land.w / 2 - land.vw / 2) <= 1 &&
      land.w <= land.vw - 60 &&
      land.h <= land.vh - 20,
    JSON.stringify(land),
  );
  // 竖屏整页是零圆角，横屏回到居中弹窗必须重新有圆角 —— 这条同时证明
  // portrait-page 只在竖屏生效，没有把横屏也一起压成整页
  check('E2 横屏恢复圆角弹窗', land.radius !== '0px', land.radius);

  // 横屏面板四边留白，遮罩真的可点（竖屏整页形态下这条永远点不到）
  await page.locator('.boh-modal__overlay').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(350);
  check('E3 横屏点遮罩关闭弹层', (await page.locator('.boh-modal__overlay').count()) === 0);

  await ctx.close();
}

/* ---------- F) 暗色：整页底色与标题可读 ---------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  /* ⚠️ 切主题必须写 localStorage 的 `boh-theme`，让 themeManager 自己应用并触发
     ensureThemeCSS('dark') 懒加载 8 个暗色样式表。
     手动 setAttribute('data-theme','dark') 是**假路径**：tokens.css 里那条暗色块会生效，
     但 dark-mode.css（--boh-page-bg 的暗色值只在那里）压根不会加载，
     量出来是白底黑字 —— 看着像真回归，其实是探针自己在骗自己。
     （同坑记录：probe-navbar-tokens.mjs 文件头） */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'dark');
    } catch {
      /* 隐私模式忽略 */
    }
  });
  await boot(page);
  await setRole(page, 'admin');
  await page.waitForTimeout(600); // 等暗色 CSS 落地（懒加载 + 判活复核）
  await page.click('.avatar-btn');
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('.avatar-menu-item')].map((el) => el.innerText.trim()),
  );
  await page.locator('.avatar-menu-item').nth(menu.indexOf('礼物管理')).click();
  await page.waitForTimeout(500);
  await page.evaluate((orders) => {
    const root = document.querySelector('.boh-modal__overlay');
    let comp = root.__vueParentComponent;
    while (comp && !comp.setupState?.orders) comp = comp.parent;
    comp.setupState.orders = orders;
    comp.setupState.loading = false;
  }, FAKE_ORDERS);
  await page.waitForTimeout(300);

  /* 注入前先等真实请求落地（load() 结尾是 orders.value = data，注入会被覆盖）。
     与 C 段同一套时序，这里补一次否则暗色段经常读到空列表（F3 会拿到 card=none）。 */
  const findAndWait = () =>
    page.waitForFunction(
      () => {
        const root = document.querySelector('.boh-modal__overlay');
        let comp = root?.__vueParentComponent;
        while (comp && !comp.setupState?.orders) comp = comp.parent;
        return Boolean(comp) && comp.setupState.loading === false;
      },
      null,
      { timeout: 20000 },
    );
  await findAndWait().catch(() => {});
  const injectF = () =>
    page.evaluate((orders) => {
      const root = document.querySelector('.boh-modal__overlay');
      let comp = root?.__vueParentComponent;
      while (comp && !comp.setupState?.orders) comp = comp.parent;
      if (!comp) return;
      comp.setupState.orders = orders;
      comp.setupState.loading = false;
      comp.setupState.loadError = '';
    }, FAKE_ORDERS);
  await injectF();
  await page.waitForTimeout(500);
  await injectF();
  await page.waitForTimeout(300);

  // 容器缺失时返回 null 而不是抛错：反证要能走到 F3 的断言，而不是整段崩掉
  const colors = await page.evaluate(() => {
    const titleEl = document.querySelector('.ao-title');
    const dialogEl = document.querySelector('.boh-modal__dialog');
    const cardEl = document.querySelector('.ao-item');
    if (!titleEl || !dialogEl || !cardEl) return null;
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      title: getComputedStyle(titleEl).color,
      pageBg: getComputedStyle(dialogEl).backgroundColor,
      cardBg: getComputedStyle(cardEl).backgroundColor,
    };
  });
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  if (!colors) {
    check('F0 暗色主题真生效', false, '标题/弹窗/订单卡任一缺失，无法量色');
    check('F1 暗色整页底是深色', false, '容器缺失');
    check('F2 暗色标题是浅字', false, '容器缺失');
    check('F3 暗色卡片比页面底更亮（层次是浮起不是凹陷）', false, '容器缺失');
  } else {
    // 前置：确认暗色 CSS 真加载了，否则下面几条的颜色断言毫无意义
    check('F0 暗色主题真生效', colors.theme === 'dark', colors.theme);
    // 整页形态用的是不透明页面色（不是半透明玻璃），暗色下必须是深底
    check('F1 暗色整页底是深色', lum(colors.pageBg) < 0.35, colors.pageBg);
    check('F2 暗色标题是浅字', lum(colors.title) > 0.5, colors.title);
    /* F3 层次方向：卡片必须比页面底**更亮**（= 浮起）。
       🔴 这条抓过一次真回归：迁移时把根元素的 `shop-sheet-tokens` 丢了，
       卡片回落成全站暗色 #0a0a0f，比页面底 #16120e 更暗 —— 视觉上卡片"凹"进页面里。
       当时 D/F 全绿（只测了「底是深的」「字是浅的」），只有截图看得出。 */
    check(
      'F3 暗色卡片比页面底更亮（层次是浮起不是凹陷）',
      lum(colors.cardBg) > lum(colors.pageBg),
      `card=${colors.cardBg} page=${colors.pageBg}`,
    );
  }
  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
