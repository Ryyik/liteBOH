// 探针：商城「礼物详情 / 订单详情」（用户侧，2026-11-02；2026-11-24 迁 BohModal）
//
// 用户口径：「购物订单可以带图片，支持点开详情（详情里可以取消订单）可以看内容和状态
// （例如什么时候发货，什么时候运输），横屏弹窗竖屏全屏形式」。
//
// 它是 plans/045 阶段 2 的**第六家族**，也是 Shop「B 类 5 份」里最后一份：
// 形态与第四家族（AdminOrderSheet）同族 —— 竖屏整页、横屏居中，
// 靠壳的 `portrait-page` 变体保住「翻到下一页」的语义。
//
// 这四类东西要守住：
//   A) 壳契约：层级读 --boh-z-modal、560 宽、竖屏铺满/零圆角/无 grab 条、
//      滚锁落在 html（本站真正的滚动容器）；
//   B) 内容契约（用户口径，迁壳不许丢）：状态词 + 三段进度 + 商品行 + 编号/费用、
//      收货信息读**下单快照**（不是当前资料）、现金待收提示；
//   C) 动作区：未发货给「取消礼物」（两段式确认）、已发货不给；
//      底部动作区只在有动作时出现（不该空占一条）；
//   D) 形态回归：横屏回圆角居中弹窗（证明 portrait-page 没把横屏也压成整页）、
//      Esc 关闭并释放滚锁、暗色下标题/正文可读且卡片比页面底亮。
//
// ⚠️ 探针不写库：取消订单会退积分 + 发邮件，这里只**断言入口存在与两段式文案**，
//    真调用由 tests/unit/shop-order-cancel.test.js 守。
//
// ⚠️ 两条实测坑（第四次家族时吃过，这里同样适用）：
//   ① 暗色必须写 localStorage 的 `boh-theme` 让 themeManager 懒加载 8 份暗色 CSS；
//      手动 setAttribute('data-theme') 是假路径（--boh-page-bg 的暗色值只在
//      dark-mode.css 里，那文件是按需加载的），量出来白底黑字像真回归。
//   ② 组件常驻挂载 + 靠 order 判空显示 ⇒ 不能靠「点卡片」来注入，
//      必须直接把 setupState.detailOrder 塞进 OrderPanel（没有真实订单数据）。
//
// 用法：先 `npm run dev`（默认 5173），再
//   node scripts/probes/probe-shop-order-detail.mjs
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
  args: ['--no-sandbox', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/** 一份「准备中」的现金单：能同时验证时间线、快照、现金提示与取消入口 */
const FAKE_ORDER = {
  id: 'probe-od-1',
  kind: 'shop',
  orderNo: 'BOH-ORDER-PROBE-0001',
  status: 'preparing',
  statusLabel: '准备中',
  priceText: '45 积分 + ¥12.90',
  rmb: 1290,
  paymentMode: 'points_plus_cash',
  createdAt: '2026-11-20T10:30:00+08:00',
  updatedAt: '2026-11-21T09:00:00+08:00',
  items: [{ title: '围巾小狗', specLabel: '米白色 · 均码', quantity: 1 }],
  shipping: {
    recipient: '张三',
    phone: '138****1234',
    address: '江苏省苏州市工业园区星湖街 328 号',
  },
  remark: '麻烦用顺丰',
};

const boot = async (page) => {
  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-0/0',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      },
      body: '[]',
    });
  });
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
  );

  await page.goto(SHOP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card .p-name'), null, {
    timeout: 30000,
  });

  // 注入登录态（订单详情要按 role 判管理员动作；普通用户只看自己的单）
  await page.evaluate(() => {
    const st = document.querySelector('.store-page').__vueParentComponent.setupState;
    st.authStore.isInitialized = true;
    st.authStore.userInfo.role = 'user';
    st.authStore.userInfo.username = 'Ryyik';
  });
  await page.waitForTimeout(200);
};

/* 打开详情：组件常驻挂载、靠 order 判空显示，所以直接把 detailOrder 塞进 OrderPanel。
   ⚠️ 两件事必须按顺序：
     ① OrderPanel 只在 activeTab === 'order'（「我的礼物」）时挂载（v-else-if），
        默认分区是 products ⇒ 不先切 tab，整个面板根本不在 DOM 里（no-order-panel）；
     ② 做法是改 setupState.activeTab 而不是点 tab 按钮 —— tab 上可能有未读角标/跳转
        逻辑，改状态是探针该走的最小路径。
   判据用 setupState.detailOrder —— 壳里没有这个字段。 */
const openDetail = async (page, order = FAKE_ORDER) => {
  const switched = await page.evaluate(() => {
    const root = document.querySelector('.store-page');
    const st = root?.__vueParentComponent?.setupState;
    if (!st) return 'no-store-page';
    st.activeTab = 'order';
    return 'ok';
  });
  if (switched !== 'ok') return switched;
  await page.waitForTimeout(600);

  const ok = await page.evaluate((payload) => {
    /* ⚠️ 起点必须是 `.order-panel` 元素本身，不能从 `.store-page` 往上走：
       OrderPanel 挂在 `<section :key="activeTab">` 里，从 store-page 的
       __vueParentComponent 出发只会走到 index → KeepAlive → App，
       中间**不会**经过 OrderPanel（实测 names 里根本没有它）⇒ 恒 no-order-panel。 */
    const el = document.querySelector('.order-panel');
    if (!el) return 'no-order-panel';
    let comp = el.__vueParentComponent;
    while (comp && !(comp.setupState && 'detailOrder' in comp.setupState)) comp = comp.parent;
    if (!comp) return 'no-detail-state';
    comp.setupState.detailOrder = payload;
    return 'ok';
  }, order);
  if (ok !== 'ok') return ok;
  await page.waitForTimeout(500);
  return 'ok';
};

// ---------- A) 竖屏：壳契约 + 内容契约 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await boot(page);

  const opened = await openDetail(page);
  check('A0 能打开详情（注入 detailOrder 成功）', opened === 'ok', opened);
  if (opened === 'ok') {
    const geo = await page.evaluate(() => {
      const overlay = document.querySelector('.boh-modal__overlay');
      const dialog = document.querySelector('.boh-modal__dialog');
      if (!overlay || !dialog) return null;
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
      'A1 竖屏是整页（铺满 390×844，portrait-page）',
      Boolean(geo) && geo.x === 0 && geo.y === 0 && geo.w === 390 && geo.h === 844,
      JSON.stringify(geo),
    );
    check('A2 整页零圆角（不是贴底 Sheet）', geo?.radius === '0px', geo?.radius);
    check('A3 整页无 grab 条', geo?.grab === 'none', geo?.grab);
    check('A4 层级读 --boh-z-modal', geo?.z === 2147482600, `z=${geo?.z}`);
    check(
      'A5 滚锁落在 html（真正的滚动容器）',
      geo?.bodyLocked === 'hidden' && geo?.rootLocked === 'hidden',
      `body=${geo?.bodyLocked} html=${geo?.rootLocked}`,
    );

    /* A6/A7 头部必须**撑满**弹窗宽度，标题才会居中、分隔线才贯通。
       🔴 这两条是截图发现的、探针原先漏掉的：#head 槽外层是 flex 行容器，
       宿主 header 作为唯一子项时宽度按内容收缩 ⇒ 标题贴到返回按钮右侧、
       分隔线只画一半。B1 只判「文字是礼物详情」，完全抓不到这个。
       判据用几何（宽度占比 + 标题中心是否在弹窗中线）。 */
    const headGeo = await page.evaluate(() => {
      const head = document.querySelector('.od-head');
      const dialog = document.querySelector('.boh-modal__dialog');
      const title = document.querySelector('.od-head-title');
      if (!head || !dialog || !title) return null;
      const h = head.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      const t = title.getBoundingClientRect();
      return {
        headW: Math.round(h.width),
        dialogW: Math.round(d.width),
        headInsetL: Math.round(h.left - d.left),
        headInsetR: Math.round(d.right - h.right),
        titleCenterOffset: Math.round(t.left + t.width / 2 - (d.left + d.width / 2)),
      };
    });
    check(
      'A6 头部撑满弹窗宽度（左右无空档）',
      Boolean(headGeo) &&
        headGeo.headW >= headGeo.dialogW - 2 &&
        headGeo.headInsetL <= 1 &&
        headGeo.headInsetR <= 1,
      JSON.stringify(headGeo),
    );
    check(
      'A7 标题在弹窗中线上（居中，不被返回按钮挤偏）',
      Boolean(headGeo) && Math.abs(headGeo.titleCenterOffset) <= 2,
      JSON.stringify(headGeo),
    );

    // ---------- B) 内容契约（用户口径） ----------
    const copy = await page.evaluate(() => {
      const text = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
      const steps = [...document.querySelectorAll('.od-step')].map((el) => ({
        label: el.querySelector('strong')?.innerText.trim() || '',
        done: el.classList.contains('done'),
        current: el.classList.contains('current'),
      }));
      return {
        title: text('.od-head-title'),
        status: text('.od-status-copy strong'),
        hint: text('.od-status-copy small'),
        steps,
        sectionTitles: [...document.querySelectorAll('.od-section-title')].map((el) =>
          el.innerText.trim(),
        ),
        itemTitle: text('.od-item-copy strong'),
        itemSpec: text('.od-item-copy small'),
        itemQty: text('.od-item-qty'),
        meta: [...document.querySelectorAll('.od-meta dt')].map((el) => el.innerText.trim()),
        metaValues: [...document.querySelectorAll('.od-meta dd')].map((el) => el.innerText.trim()),
        shippingRecipient: text('.od-shipping-head strong'),
        shippingAddr: text('.od-shipping-addr'),
        shippingNote: text('.od-shipping small'),
        remark: text('.od-remark'),
        cashNote: text('.od-note.is-due'),
      };
    });
    check('B1 标题是「礼物详情」', copy.title === '礼物详情', copy.title);
    check(
      'B2 状态词与提示上屏',
      copy.status === '准备中' && copy.hint === '正在为你准备',
      `${copy.status} / ${copy.hint}`,
    );
    check(
      'B3 三段进度全部列出（准备中/已寄出/已送达）',
      copy.steps.length === 3 &&
        copy.steps[0].label === '准备中' &&
        copy.steps[1].label === '已寄出' &&
        copy.steps[2].label === '已送达',
      JSON.stringify(copy.steps),
    );
    check(
      'B4 当前档只有第一段（准备中），其余未完成',
      copy.steps[0]?.current === true &&
        copy.steps[0]?.done === true &&
        copy.steps[1]?.done === false,
      JSON.stringify(copy.steps),
    );
    check(
      'B5 商品行带标题/规格/数量',
      copy.itemTitle === '围巾小狗' && copy.itemSpec.includes('米白') && copy.itemQty === '×1',
      `${copy.itemTitle} / ${copy.itemSpec} / ${copy.itemQty}`,
    );
    check(
      'B6 编号/领取时间/费用/运费四行齐全',
      copy.meta.includes('编号') &&
        copy.meta.includes('领取时间') &&
        copy.meta.includes('费用') &&
        copy.meta.includes('运费'),
      JSON.stringify(copy.meta),
    );
    /* 收货信息必须读**下单快照**：这条是 2026-11-04 的教训 ——
       只读当前资料时，用户改了默认地址这张单就永久说不清寄给谁。
       快照态的文案是「下单时留档，改地址不影响此单」。 */
    check(
      'B7 收货信息读下单快照（文案不冒充"当前"）',
      copy.shippingRecipient === '张三' && copy.shippingNote.includes('下单时留档'),
      `${copy.shippingRecipient} / ${copy.shippingNote}`,
    );
    check(
      'B8 地址与备注上屏',
      copy.shippingAddr.includes('星湖街') && copy.remark.includes('顺丰'),
      `${copy.shippingAddr} / ${copy.remark}`,
    );
    check(
      'B9 现金待收写清金额与「联系收取」',
      copy.cashNote.includes('¥12.90') && copy.cashNote.includes('由管理员联系收取'),
      copy.cashNote,
    );

    /* ---------- C) 动作区 ---------- */
    const actions = await page.evaluate(() => {
      const foot = document.querySelector('.od-foot');
      const cancel = document.querySelector('.od-cancel');
      const advance = document.querySelector('.od-advance');
      const box = foot?.getBoundingClientRect();
      return {
        hasFoot: Boolean(foot),
        cancelText: cancel?.innerText?.trim() || '',
        hasAdvance: Boolean(advance),
        footW: box ? Math.round(box.width) : 0,
        // 动作区不能被壳的 #footer 内衬叠成窄条：可用宽度应接近整页宽
        viewportW: window.innerWidth,
      };
    });
    check('C1 未发货给「取消礼物」入口', actions.cancelText === '取消礼物', actions.cancelText);
    check('C2 普通用户没有「推进进度」（管理员专属）', actions.hasAdvance === false);
    check(
      'C3 动作区铺满宽度（没有与壳的 footer 内衬叠成窄条）',
      actions.hasFoot && actions.footW >= actions.viewportW - 90,
      JSON.stringify(actions),
    );

    /* 两段式确认：第一下只进入确认态（文案变「确认取消」），不直接调接口。
       ⚠️ 这里只点一下、不点第二下 —— 第二下会真调 cancel RPC 并退积分。 */
    await page.click('.od-cancel');
    await page.waitForTimeout(250);
    const armed = await page.evaluate(() => ({
      text: document.querySelector('.od-cancel')?.innerText?.trim() || '',
      cls: document.querySelector('.od-cancel')?.className || '',
    }));
    check(
      'C4 首次点击只进确认态（不直接取消）',
      armed.text === '确认取消' && armed.cls.includes('armed'),
      JSON.stringify(armed),
    );

    /* ---------- C5) 内容区不能被壳的 body 二次裁切 ----------
       竖屏整页下，滚动必须只归壳的 body。宿主自己再写 overflow-y:auto
       会变成双层滚动：滑动时先滚内层、到底才带动外层（手感是断的）。
       判据：内容区（.od-body）自身不产生滚动条，滚动条在 .boh-modal__body 上。 */
    const scrollOwner = await page.evaluate(() => {
      const inner = document.querySelector('.od-body');
      const shell = document.querySelector('.boh-modal__body');
      if (!inner || !shell) return null;
      return {
        innerOverflow: getComputedStyle(inner).overflowY,
        shellOverflow: getComputedStyle(shell).overflowY,
      };
    });
    check(
      'C5 滚动只归壳的 body（内容区不自己滚）',
      scrollOwner?.innerOverflow === 'visible' && scrollOwner?.shellOverflow === 'auto',
      JSON.stringify(scrollOwner),
    );

    // ---------- D) Esc 关闭 + 滚锁释放 ----------
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('D1 Esc 关闭详情', (await page.locator('.boh-modal__overlay').count()) === 0);
    const after = await page.evaluate(() => ({
      body: document.body.style.overflow,
      root: document.documentElement.style.getPropertyValue('overflow-y'),
    }));
    check(
      'D2 Esc 后滚锁释放',
      after.body !== 'hidden' && after.root !== 'hidden',
      JSON.stringify(after),
    );
  }
  await ctx.close();
}

// ---------- E) 横屏：居中弹窗 + 可点遮罩 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await boot(page);
  const opened = await openDetail(page);
  if (opened === 'ok') {
    const land = await page.evaluate(() => {
      const dialog = document.querySelector('.boh-modal__dialog');
      if (!dialog) return null;
      const box = dialog.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        w: Math.round(box.width),
        h: Math.round(box.height),
        vw: window.innerWidth,
        vh: window.innerHeight,
        radius: getComputedStyle(dialog).borderTopLeftRadius,
      };
    });
    check(
      'E1 横屏居中且不溢出视口',
      Boolean(land) &&
        Math.abs(land.x + land.w / 2 - land.vw / 2) <= 1 &&
        land.w <= land.vw - 60 &&
        land.h <= land.vh - 20,
      JSON.stringify(land),
    );
    check(
      'E2 横屏恢复圆角弹窗（portrait-page 只在竖屏生效）',
      land?.radius !== '0px',
      land?.radius,
    );
    // 竖屏整页时遮罩被面板完全盖住，点遮罩这一档只能在横屏测
    await page.locator('.boh-modal__overlay').click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(400);
    check('E3 横屏点遮罩关闭', (await page.locator('.boh-modal__overlay').count()) === 0);
  }
  await ctx.close();
}

// ---------- F) 已发货：取消入口消失 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await boot(page);
  const shipped = {
    ...FAKE_ORDER,
    status: 'shipped',
    statusLabel: '已寄出',
    rmb: 0,
    paymentMode: 'points_only',
  };
  const opened = await openDetail(page, shipped);
  if (opened === 'ok') {
    const state = await page.evaluate(() => ({
      cancel: document.querySelector('.od-cancel')?.innerText?.trim() || '',
      hasFoot: Boolean(document.querySelector('.od-foot')),
      note: document.querySelector('.od-note')?.innerText?.trim() || '',
      currentIndex: [...document.querySelectorAll('.od-step')].findIndex((el) =>
        el.classList.contains('current'),
      ),
    }));
    check('F1 已寄出不给「取消礼物」（包裹在路上不能自助退）', state.cancel === '', state.cancel);
    check('F2 已寄出没有动作区（不空占一条）', state.hasFoot === false);
    check('F3 给出「联系管理员」的替代说明', state.note.includes('无法自助取消'), state.note);
    check('F4 进度停在第二段（已寄出）', state.currentIndex === 1, String(state.currentIndex));
  }
  await ctx.close();
}

// ---------- G) 暗色：底深、字浅、卡片比页面亮 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  /* ⚠️ 必须写 localStorage 的 boh-theme（见文件头坑 ①）。 */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'dark');
    } catch {
      /* 隐私模式忽略 */
    }
  });
  await boot(page);
  const opened = await openDetail(page);
  if (opened === 'ok') {
    await page.waitForTimeout(600);
    const dark = await page.evaluate(() => {
      const lum = (color) => {
        const m = String(color).match(/[\d.]+/g);
        if (!m) return null;
        const [r, g, b] = m.slice(0, 3).map(Number);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      };
      const dialog = document.querySelector('.boh-modal__dialog');
      const well = document.querySelector('.od-status');
      const raised = document.querySelector('.od-item');
      const title = document.querySelector('.od-head-title');
      const step = document.querySelector('.od-step.current');
      if (!dialog || !well || !raised) return null;
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        page: getComputedStyle(dialog).backgroundColor,
        pageLum: lum(getComputedStyle(dialog).backgroundColor),
        well: getComputedStyle(well).backgroundColor,
        wellLum: lum(getComputedStyle(well).backgroundColor),
        raised: getComputedStyle(raised).backgroundColor,
        raisedLum: lum(getComputedStyle(raised).backgroundColor),
        titleColor: getComputedStyle(title).color,
        titleLum: lum(getComputedStyle(title).color),
        stepColor: getComputedStyle(step).color,
        stepLum: lum(getComputedStyle(step).color),
      };
    });
    /* G0 先确认主题真生效 —— 否则后面几条会在白底上量出"一切正常"（假绿）。 */
    check(
      'G0 暗色主题真生效（底是深色）',
      Boolean(dark) && dark.theme === 'dark' && dark.pageLum !== null && dark.pageLum < 0.25,
      JSON.stringify({ theme: dark?.theme, page: dark?.page, lum: dark?.pageLum }),
    );
    check(
      'G1 标题是浅字',
      Boolean(dark) && dark.titleLum > 0.5,
      `${dark?.titleColor} lum=${dark?.titleLum}`,
    );
    check(
      'G2 当前进度项是浅字（不吃暗色低对比灰）',
      Boolean(dark) && dark.stepLum > 0.4,
      `${dark?.stepColor} lum=${dark?.stepLum}`,
    );
    /* G3/G4 暗色层次：这一页有**两种**卡片，方向相反，必须分开判。
       · 抬起件（商品行 .od-item / 收货块 .od-shipping）用 --boh-bg-primary，应比页面底**亮**；
       · 凹陷件（状态条 .od-status / 备注块 .od-remark）用 --boh-bg-secondary，应比页面底**暗**。
       🔴 第一版这里只判了 .od-status「必须比页面亮」，实测红 —— 那条断言本身是错的
       （凹陷件本来就该更暗）。顺带量出一个真实变化：迁移前整页底色是商城域 #1c1c1e，
       而抬起件也是 #1c1c1e ⇒ 卡片与页面同色、边界消失（旧实现的缺陷）；
       迁壳后整页底色取全局 --boh-page-bg = #16120e，抬起件反而浮得起来。
       所以判据是「两个方向都要与页面**可分辨**」，不是「一律更亮」。 */
    check(
      'G3 抬起件比页面底亮（商品行浮得起来）',
      Boolean(dark) && dark.raisedLum > dark.pageLum,
      `raised=${dark?.raised} (${dark?.raisedLum}) > page=${dark?.page} (${dark?.pageLum})`,
    );
    check(
      'G4 凹陷件比页面底暗（状态条是"井"不是"砖"）',
      Boolean(dark) && dark.wellLum < dark.pageLum,
      `well=${dark?.well} (${dark?.wellLum}) < page=${dark?.page} (${dark?.pageLum})`,
    );
  }
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
