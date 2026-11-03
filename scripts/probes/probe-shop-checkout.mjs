// 探针：周边「确认订单」页（2026-11-03 改版）
//
// 这一页替代了原来那个「确认收货信息」表单弹窗。要守住的东西有四类：
//   1) 形态：竖屏是**整页**（铺满视口、无圆角无阴影、没有遮罩），横屏才是居中弹窗；
//   2) 金额：按**实时商品价**算（服务端下单也是这么算的），价差要就地提示；
//   3) 预检：积分不足 / 商品下架 / 超库存 → 拦住提交并给出可点的修复入口，
//      而不是让用户点了「提交订单」再收一句 toast；
//   4) 结果页：说「订单已提交」（现金是线下确认的，说"支付成功"是误导）、
//      订单号完整可复制、有「查看订单 / 继续逛逛」两个出口。
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

const browser = await chromium.launch({ args: ['--no-sandbox'] });

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
    'F1 标题是「订单已提交」而不是「支付成功」',
    text.includes('订单已提交') && !text.includes('支付成功'),
  );
  check('F2 订单号完整显示（不截断）', text.includes('BOH20261103220218'));
  check('F3 有复制入口', (await page.isVisible('.payment-success-copy-btn')) === true);
  check(
    'F4 两个出口都在',
    (await page.isVisible('.payment-success-confirm')) &&
      (await page.isVisible('.payment-success-secondary')),
  );
  check('F5 写明后续步骤', text.includes('管理员确认') && text.includes('备货发出'));
  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
