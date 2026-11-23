// 探针：周边「确认订单」页（2026-11-03 改版）
//
// 这一页替代了原来那个「确认收货信息」表单弹窗。要守住的东西有四类：
//   1) 形态：竖屏是**整页**（铺满视口、无圆角无阴影、没有遮罩），横屏才是居中弹窗；
//   2) 金额：按**实时商品价**算（服务端下单也是这么算的），价差要就地提示；
//   3) 预检：积分不足 / 商品下架 / 超库存 → 拦住提交并给出可点的修复入口，
//      而不是让用户点了「提交订单」再收一句 toast；
//   4) 结果页：说「礼物已提交」（现金是线下确认的，说"支付成功"是误导）、
//      编号完整可复制、有「查看礼物 / 继续逛逛」两个出口。
//
// 用法：先 `npm run dev`（默认 5173），再 `node scripts/probes/probe-shop-checkout.mjs`
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const SHOP_URL = `${BASE}/#/shop`;

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

const FALLBACK = {
  id: '',
  recipient: '张三',
  phone: '13800001234',
  region: '江苏省苏州市姑苏区 人民路 200 号 3 栋 501',
  detail: '',
};

/** 打开商城并把购物袋塞满两件，返回商品数（无凭据下直接置位页面状态） */
const bootShop = async (page, { points = 9999, openCheckout = true } = {}) => {
  await page.goto(SHOP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card .p-name'), null, {
    timeout: 30000,
  });
  return page.evaluate(
    ({ fallback, points, openCheckout }) => {
      const st = document.querySelector('.store-page').__vueParentComponent.setupState;
      const products = st.allProducts || [];
      st.userInfo.points = points;
      for (const p of products.slice(0, 2)) {
        st.bagStore.addToBag(p, 'Default', '默认规格');
      }
      st.fallbackAddress = fallback;
      if (openCheckout) st.showCheckout = true;
      return products.length;
    },
    { fallback: FALLBACK, points, openCheckout },
  );
};

const geometry = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('.ck-sheet');
    if (!sheet) return null;
    const box = sheet.getBoundingClientRect();
    const style = getComputedStyle(sheet);
    const scrim = document.querySelector('.ck-scrim');
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      sheet: { x: box.x, y: box.y, w: Math.round(box.width), h: Math.round(box.height) },
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
      scrimDisplay: scrim ? getComputedStyle(scrim).display : 'missing',
    };
  });

const submitState = (page) =>
  page.evaluate(() => {
    const btn = document.querySelector('.ck-submit');
    return {
      disabled: Boolean(btn?.disabled),
      label: btn?.innerText?.trim() || '',
      issues: [...document.querySelectorAll('.ck-issue')].map((el) => el.innerText.trim()),
      total: document.querySelector('.ck-total strong')?.innerText?.trim() || '',
      fixButton: document.querySelector('.ck-issue-fix')?.innerText?.trim() || '',
      lines: document.querySelectorAll('.ck-item').length,
    };
  });

/* 与其它 Shop 探针一致：走系统 Chrome + 直连代理。
   本机 Playwright 的 chromium_headless_shell 不一定装了，裸 launch() 会直接抛
   「Executable doesn't exist」；PROBE_CHANNEL 可覆盖。 */
const browser = await chromium.launch({
  channel: process.env.PROBE_CHANNEL || 'chrome',
  args: ['--no-sandbox', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

// ---------- A) 竖屏：整页形态 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await bootShop(page);
  await page.waitForSelector('.ck-sheet', { timeout: 10000 });
  await page.waitForTimeout(500);

  const geo = await geometry(page);
  check(
    'A1 竖屏铺满视口（不是一张浮在上面的卡片）',
    geo.sheet.w === 390 && geo.sheet.h === 844,
    JSON.stringify(geo.sheet),
  );
  check(
    'A2 无圆角 / 无阴影（整页语义）',
    geo.radius === '0px' && geo.shadow === 'none',
    `${geo.radius} / ${geo.shadow}`,
  );
  check('A3 竖屏不渲染遮罩', geo.scrimDisplay === 'none', geo.scrimDisplay);
  check('A4 页头是「确认订单」+ 件数', await page.isVisible('.ck-title'));

  const ready = await submitState(page);
  check('A5 地址齐全 + 积分充足时可提交', ready.disabled === false, JSON.stringify(ready));

  // 底部结算条必须固定在视口底部（长列表滚动时不能跟着内容跑掉）
  await page.evaluate(() => {
    const body = document.querySelector('.ck-body');
    if (body) body.scrollTop = body.scrollHeight;
  });
  await page.waitForTimeout(300);
  const footBox = await page.evaluate(() => {
    const foot = document.querySelector('.ck-foot').getBoundingClientRect();
    return { bottom: Math.round(foot.bottom), viewport: window.innerHeight };
  });
  check(
    'A6 底部结算条贴在视口底部',
    Math.abs(footBox.viewport - footBox.bottom) <= 1,
    JSON.stringify(footBox),
  );
  await ctx.close();
}

// ---------- B) 积分不足：就地拦住 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await bootShop(page, { points: 0 });
  await page.waitForSelector('.ck-sheet', { timeout: 10000 });
  await page.waitForTimeout(400);
  const state = await submitState(page);
  check('B1 积分不足时提交按钮禁用', state.disabled === true);
  check(
    'B2 提示写明还差多少积分',
    state.issues.some((text) => text.includes('积分不足')),
    JSON.stringify(state.issues),
  );
  await ctx.close();
}

// ---------- C) 商品下架：拦住 + 一键移除 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await bootShop(page);
  await page.waitForSelector('.ck-sheet', { timeout: 10000 });
  await page.waitForTimeout(400);
  const before = await submitState(page);

  // 把第一件商品从商品表里摘掉 = 它已下架（购物袋里还留着快照）
  await page.evaluate(() => {
    const st = document.querySelector('.store-page').__vueParentComponent.setupState;
    st.productsData.splice(0, 1);
  });
  await page.waitForTimeout(400);
  const after = await submitState(page);
  check('C1 有商品下架时拦住提交', after.disabled === true);
  check('C2 给出「移除失效商品」入口', after.fixButton.includes('移除'), after.fixButton);

  await page.click('.ck-issue-fix');
  await page.waitForTimeout(500);
  const fixed = await submitState(page);
  check('C3 移除后行数减少', fixed.lines === before.lines - 1, `${before.lines} → ${fixed.lines}`);
  check('C4 移除后恢复可提交', fixed.disabled === false, JSON.stringify(fixed.issues));
  await ctx.close();
}

// ---------- D) 价格变化：按实时价算 + 提示 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await bootShop(page);
  await page.waitForSelector('.ck-sheet', { timeout: 10000 });
  await page.waitForTimeout(400);
  const before = await submitState(page);

  await page.evaluate(() => {
    const st = document.querySelector('.store-page').__vueParentComponent.setupState;
    const first = st.productsData[0];
    /* 两个价位一起抬：不同 SKU 的 payment_mode 不同（points_only 不看 rmb_price），
       只改一个字段可能正好落在"本单不计这项"的那一侧，测出来像没生效。 */
    first.points_cost = Number(first.points_cost || 0) + 10;
    first.rmb_price = Number(first.rmb_price || 0) + 100;
  });
  await page.waitForTimeout(400);
  const after = await submitState(page);
  check(
    'D1 价格变动后就地提示',
    after.issues.some((text) => text.includes('价格已更新')),
    JSON.stringify(after.issues),
  );
  check(
    'D2 合计按实时价重算（不是快照）',
    after.total !== before.total,
    `${before.total} → ${after.total}`,
  );
  check('D3 价差只提醒、不拦提交', after.disabled === false);
  await ctx.close();
}

// ---------- E) 横屏：居中弹窗 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await bootShop(page);
  await page.waitForSelector('.ck-sheet', { timeout: 10000 });
  await page.waitForTimeout(500);
  const geo = await geometry(page);
  const centered = Math.abs(geo.sheet.x + geo.sheet.w / 2 - 422) <= 1;
  check('E1 横屏居中', centered, JSON.stringify(geo.sheet));
  check('E2 横屏不溢出视口', geo.sheet.w < 844 && geo.sheet.h < 390, JSON.stringify(geo.sheet));
  check('E3 横屏有遮罩（弹窗语义）', geo.scrimDisplay !== 'none', geo.scrimDisplay);
  await ctx.close();
}

// ---------- F) 结果页：话术与出口 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await bootShop(page, { openCheckout: false });
  await page.evaluate(() => {
    const st = document.querySelector('.store-page').__vueParentComponent.setupState;
    st.userInfo.points = 1145;
    st.paymentSuccess = {
      orderNo: 'BOH20261103220218',
      paymentSummary: '55 积分 + ¥11.90',
      itemSummary: '围巾小狗 等 2 件',
      shippingTo: '张三 · 江苏省苏州市',
      emailState: 'sent',
    };
  });
  await page.waitForTimeout(2600);
  const text = await page.evaluate(() => document.body.innerText);
  check(
    'F1 标题是「礼物已提交」而不是「支付成功」',
    text.includes('礼物已提交') && !text.includes('支付成功'),
  );
  check('F2 编号完整显示（不截断）', text.includes('BOH20261103220218'));
  check('F3 有复制入口', (await page.isVisible('.payment-success-copy-btn')) === true);
  check(
    'F4 两个出口都在',
    (await page.isVisible('.payment-success-confirm')) &&
      (await page.isVisible('.payment-success-secondary')),
  );
  check('F5 写明后续步骤', text.includes('管理员确认') && text.includes('备货寄出'));
  await ctx.close();
}

// ---------- G) 结果页形态（2026-11-23 迁 BohModal 第五家族） ----------
// F 组只测话术与出口；这一组测**壳契约与分区**，那是这份弹窗最容易回归的地方：
// ① 卡片（动画本体）与关闭钮必须钉住不动，只有文字滚 —— 2026-11-10 用户报障
//    「结算动画全部飘到页面外面」的修法就是这条分区，迁壳时最容易被摊平掉；
// ② 窄屏是贴底 Sheet、横屏是居中弹窗（与 BohModal 既有口径一致）；
// ③ 标题吃的是 --boh-text-primary，不是壳 body 的 --liquid-text-secondary
//    （迁移时踩过：标题一度回落成 rgb(110,110,115) 中灰，截图才看得出来）。
const openResult = async (page) => {
  await page.evaluate(() => {
    const st = document.querySelector('.store-page').__vueParentComponent.setupState;
    st.userInfo.points = 1145;
    st.paymentSuccess = {
      orderNo: 'BOH20261103220218',
      paymentSummary: '55 积分 + ¥11.90',
      itemSummary: '围巾小狗 等 2 件',
      shippingTo: '张三 · 江苏省苏州市',
      emailState: 'sent',
    };
  });
  await page.waitForTimeout(2600); // 等卡片翻转 + 文字 reveal 落定
};

// G1–G9：竖屏（贴底 Sheet + 分区 + 滚动行为）
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await bootShop(page, { openCheckout: false });
  await openResult(page);

  const geo = await page.evaluate(() => {
    const dlg = document.querySelector('.boh-modal__dialog');
    const body = document.querySelector('.boh-modal__body');
    const r = dlg.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      bottom: Math.round(r.bottom),
      radius: getComputedStyle(dlg).borderTopLeftRadius,
      grab: getComputedStyle(document.querySelector('.boh-modal__grab')).display,
      z: Number(getComputedStyle(document.querySelector('.boh-modal__overlay')).zIndex),
      closeInHead: !!document.querySelector('.boh-modal__head .payment-success-close'),
      headCount: document.querySelectorAll('.boh-modal__head').length,
      scrollable: body.scrollHeight > body.clientHeight + 2,
      scrollRatio: `${body.scrollHeight}/${body.clientHeight}`,
      bodyOverflow: getComputedStyle(body).overflowY,
    };
  });
  check(
    'G1 竖屏贴底 Sheet（满宽 + 贴底）',
    geo.x === 0 && geo.w === 390 && Math.abs(geo.bottom - 844) <= 1,
    JSON.stringify(geo),
  );
  check('G2 贴底形态有 grab 条', geo.grab !== 'none', geo.grab);
  check('G3 层级读 --boh-z-modal（压过导航 9999 与灵动岛）', geo.z === 2147482600, `z=${geo.z}`);
  check('G4 关闭钮在 #head 槽内（不随文字滚走）', geo.closeInHead === true);
  check(
    'G5 唯一滚动体是壳的 body（卡片钉住、只滚文字）',
    geo.scrollable === true && geo.bodyOverflow === 'auto',
    JSON.stringify({
      scrollable: geo.scrollable,
      ratio: geo.scrollRatio,
      overflow: geo.bodyOverflow,
    }),
  );

  /* G5b 卡片下沿必须干净：① 卡面底部到 body 顶边之间留出空隙 —— 滚动内容在
     body 顶边被裁切，紧贴卡面会形成「内容被切开」的糊边（截图为证）；
     ② 卡面右下角（BOH 所在）的 hitTest 仍命中卡片本身，说明没有遮罩压上来。
     🔴 这条抓过两次真回归：先是用 ::after 渐变收口、起点写成 `bottom: -14px`，
     直接糊掉「BOH」；改留间距后，又要防止有人把间距改回 0。 */
  const cardBottom = await page.evaluate(() => {
    const face = document.querySelector('.payment-card-face');
    /* 内衬在宿主自己的 .payment-success-body 上（壳的 .boh-modal__body 只是外层滚动体，
       它的 padding 被 flush 为零）。量错层会让 padTop 恒为 0，判据形同虚设。 */
    const host = document.querySelector('.payment-success-body');
    if (!face || !host) return null;
    const f = face.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    const hit = document.elementFromPoint(f.right - 24, f.bottom - 12);
    const scene = document.querySelector('.payment-card-scene');
    /* 量"第一块内容的绘制起点"，不是 body 的 border box：
       内衬加在 body 内部时 body.top 不会变，只有内容起点变了。 */
    const firstContent = document.querySelector('.payment-success-copy');
    const fc = firstContent ? firstContent.getBoundingClientRect() : null;
    return {
      gap: fc ? Math.round(fc.top - f.bottom) : -1,
      faceBottom: Math.round(f.bottom),
      bodyTop: Math.round(b.top),
      firstContentTop: fc ? Math.round(fc.top) : null,
      padTop: Math.round(parseFloat(getComputedStyle(host).paddingTop) || 0),
      hitClass: hit ? String(hit.className || hit.tagName) : 'none',
      hitIsCard: Boolean(hit && scene && (scene === hit || scene.contains(hit))),
    };
  });
  check(
    'G5b 卡面下沿干净（有间隙、BOH 处没被压住）',
    Boolean(cardBottom) &&
      cardBottom.gap >= 18 &&
      cardBottom.padTop >= 10 &&
      cardBottom.hitIsCard === true,
    JSON.stringify(cardBottom),
  );

  /* G5c 滚动中段：文字必须在滚动体顶边**淡出**，而不是被硬切成半行。
     🔴 这条抓过真回归：卡片钉住后文字在它下面滚，滚到中段时
     「55 积分 + ¥11.90」半边露在卡片下沿、半边被裁 —— 截图一眼看出是 bug，
     而 G1–G5 全绿（几何、滚动行为都对）。修法是在**壳的滚动体**上加 mask 渐隐；
     试过的三条歪路都别走回去：head 加渐变遮罩（玻璃上糊白带 + 盖掉 BOH）、
     head 加不透明底（硬色带 + 管不到 body 内部）、只加 padding（裁切线不动）。
     判据：滚动体 computed mask-image 必须是 linear-gradient 且带透明起点。
     ⚠️ 必须用 :global —— 宿主 scoped 写出的是后代选择器，而壳的元素不是宿主后代。 */
  await page.evaluate(() => {
    const body = document.querySelector('.boh-modal__body');
    if (body) body.scrollTop = 120;
  });
  await page.waitForTimeout(400);
  const fade = await page.evaluate(() => {
    const body = document.querySelector('.boh-modal__body');
    if (!body) return null;
    const cs = getComputedStyle(body);
    const mask = cs.maskImage || cs.webkitMaskImage || 'none';
    const r = body.getBoundingClientRect();
    // 顶边处命中的必须仍是滚动体内元素（说明内容确实滚到了那儿）
    const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + 4);
    return {
      mask,
      hasFade: mask.includes('linear-gradient') && /rgba\(0, 0, 0, 0\)|transparent/.test(mask),
      topHit: topEl ? String(topEl.className || topEl.tagName) : 'none',
      scrolled: body.scrollTop,
    };
  });
  check(
    'G5c 滚动中段文字在顶边淡出（不是被硬切）',
    Boolean(fade) && fade.hasFade === true && fade.scrolled === 120,
    JSON.stringify(fade),
  );

  // 滚到底：卡片与关闭钮必须仍在原位（这是那条报障的判据）
  const snapshot = () =>
    page.evaluate(() => {
      const card = document.querySelector('.payment-card-scene');
      const close = document.querySelector('.payment-success-close');
      const body = document.querySelector('.boh-modal__body');
      if (!card || !close || !body) return null;
      const c = card.getBoundingClientRect();
      const x = close.getBoundingClientRect();
      return { cardTop: Math.round(c.top), closeTop: Math.round(x.top) };
    });
  const before = await snapshot();
  await page.evaluate(() => {
    const body = document.querySelector('.boh-modal__body');
    if (body) body.scrollTop = body.scrollHeight;
  });
  await page.waitForTimeout(400);
  const after = await snapshot();
  /* 判据：滚到底后两个元素的位置**完全不变**。
     元素缺失时给 null → 直接判红（而不是让探针崩掉）：反证时要能看到是哪条红的。 */
  check(
    'G6 滚到底后卡片与关闭钮原地不动（2026-11-10 报障的回归判据）',
    Boolean(before) &&
      Boolean(after) &&
      after.cardTop === before.cardTop &&
      after.closeTop === before.closeTop,
    `${JSON.stringify(before)} → ${JSON.stringify(after)}`,
  );

  const titleColor = await page.evaluate(() => {
    const el = document.querySelector('#payment-success-title');
    if (!el) return null;
    const rgb = getComputedStyle(el).color;
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    // 壳的 body 自带 --liquid-text-secondary；标题若没显式给基色就会精确等于它
    const shell = getComputedStyle(document.querySelector('.boh-modal__body')).color;
    return {
      rgb,
      lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
      shell,
      sameAsShell: rgb === shell,
    };
  });
  check(
    'G7 亮色标题是深字，且不吃壳 body 的中灰',
    Boolean(titleColor) && titleColor.lum < 0.3 && !titleColor.sameAsShell,
    titleColor
      ? `${titleColor.rgb} lum=${titleColor.lum.toFixed(2)} shell=${titleColor.shell}`
      : '标题元素缺失',
  );

  // 不点遮罩关闭：这一屏是"单已提交"的确认态，误关会让人以为没成功
  await page.locator('.boh-modal__overlay').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(400);
  check(
    'G8 点遮罩不关闭（closeOnBackdrop=false）',
    (await page.locator('.boh-modal__overlay').count()) === 1,
  );
  check('G9 无 JS 错误', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// G10–G12：横屏（居中弹窗 + 暗色）
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await bootShop(page, { openCheckout: false });
  await openResult(page);
  const land = await page.evaluate(() => {
    const dlg = document.querySelector('.boh-modal__dialog');
    const r = dlg.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      w: Math.round(r.width),
      radius: getComputedStyle(dlg).borderTopLeftRadius,
      vw: window.innerWidth,
      grab: getComputedStyle(document.querySelector('.boh-modal__grab')).display,
      bodyScrollable: (() => {
        const b = document.querySelector('.boh-modal__body');
        return b.scrollHeight > b.clientHeight + 2;
      })(),
    };
  });
  check(
    'G10 横屏居中且不溢出',
    Math.abs(land.x + land.w / 2 - land.vw / 2) <= 1 && land.w <= land.vw - 60,
    JSON.stringify(land),
  );
  check(
    'G11 横屏有圆角、无 grab 条',
    land.radius !== '0px' && land.grab === 'none',
    JSON.stringify(land),
  );
  check('G12 横屏文字区仍可滚（矮视口不把内容挤没）', land.bodyScrollable === true);
  await ctx.close();
}

{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  /* 切暗色必须写 localStorage 的 boh-theme（让 themeManager 懒加载暗色 CSS）；
     手动 setAttribute('data-theme') 是假路径，量出来白底黑字像真回归。 */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'dark');
    } catch {
      /* 隐私模式忽略 */
    }
  });
  await bootShop(page, { openCheckout: false });
  await openResult(page);
  const dark = await page.evaluate(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    const title = getComputedStyle(document.querySelector('#payment-success-title')).color;
    const dlg = getComputedStyle(document.querySelector('.boh-modal__dialog')).backgroundColor;
    // 壳 body 的继承色：暗色下是 #a1a1a6（lum≈0.63）—— 只看"够不够亮"抓不到它
    const shell = getComputedStyle(document.querySelector('.boh-modal__body')).color;
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    return {
      theme,
      title,
      titleLum: lum(title),
      dlg,
      dlgLum: lum(dlg),
      shell,
      sameAsShell: title === shell,
    };
  });
  check('G13 暗色主题真生效', dark.theme === 'dark', dark.theme);
  check('G14 暗色弹窗底是深色', dark.dlgLum < 0.35, dark.dlg);
  /* ⚠️ 只判 lum > 0.5 是假绿：壳 body 的 --liquid-text-secondary 暗色值是 #a1a1a6
     （lum≈0.63），漏给基色时标题仍然"够亮"，这条照样过。
     真判据是「标题色 ≠ 壳 body 继承色」—— 那才证明基色是宿主自己给的。 */
  check(
    'G15 暗色标题是浅字，且不吃壳 body 的中灰',
    dark.titleLum > 0.5 && !dark.sameAsShell,
    `${dark.title} lum=${dark.titleLum.toFixed(2)} shell=${dark.shell}`,
  );
  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
