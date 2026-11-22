// =====================================================================
// 探针：商城大屏布局 —— 商品/抽奖网格 auto-fill 自适应增列 + 内容限宽 1480 居中
//      （2026-11-22 新增，配套 tokens.css 的 --page-content-max）
//
//   背景：2026-11-01「横屏全宽屏布局」口径下内容区不限宽 + 固定三列，
//   2560 视口（扣左栏 240 + 边距 48 → 内容区 2272px）单卡被摊到 ~747px 见方、
//   一行只有 3 张；3440 下 ~1040px。改法：横屏内容收进 --page-content-max(1480px)
//   居中（与论坛 .forum-container 同一条上限），网格改 auto-fill minmax(280px)。
//
//   锁四件事：
//     ① 横屏内容区（.store-main）在超大屏（1920/2560）收进 1480 且左右对称居中
//     ② 商品/抽奖网格列数随宽度自长：2560→5 列（卡 ~283px）、1920→5 列、1440→3 列
//        （1440 的 3 列 = 旧固定三列档的回归口径：笔记本档视觉不变）
//     ③ 竖屏 390 不受影响：仍 2 列（手机竖屏口径保留）
//     ④ 订单/购物袋/地址 760px 面板跟着居中，不再钉在内容区左侧
//
//   数据：商品走线上真实表 —— auto-fill 的轨道数只由容器宽决定，卡片数不影响
//   「单卡宽度」断言；断言只挑小卡（.p-card，排除 .p-skeleton / .is-banner / .is-large
//   两类通栏形态 —— 它们 grid-column: 1/-1 满宽是形态语义，不是大屏缺陷）。
//   抽奖没有内置兜底数据（失败只出「加载失败」空态），必须 mock
//   rpc/get_community_lotteries 回 7 条；lotteries 表（保底链路 / pity 补查）回 []。
//
//   反证（必须做）：把 Shop/style.scoped.css 横屏分支改回
//   `width: auto; margin: 0 24px` + `grid-template-columns: repeat(3, minmax(0,1fr))`
//   → ①② 当场红（2560 下 store-main ≈ 2272、单卡 ≈ 747px）。
//
//   用法：先 `npm run dev`（默认 5173），再 `node scripts/probes/probe-large-screen-layout.mjs`
// =====================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PROBE_BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

/* 抽奖 mock 行：normalizeLottery 容忍缺字段，给齐渲染需要的 id/title/prize/封面即可。
   封面用 data:image/svg+xml（带序号），不依赖外网。 */
const COLORS = ['e5732f', '3f7fd4', '5aa86a', 'b4553f', '7a6bd6', 'c9a227', '2f8f8f'];
const svgUrl = (label, color) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>` +
  `<rect width='320' height='180' fill='%23${color}'/>` +
  `<text x='160' y='110' font-size='48' font-family='sans-serif' text-anchor='middle' fill='white'>${label}</text>` +
  `</svg>`;
const lotteryRows = Array.from({ length: 7 }, (_, i) => ({
  id: `2222222${String(i).padStart(2, '0')}-2222-4222-8222-222222222222`,
  title: `探针抽奖 ${i + 1}`,
  prize_title: `奖品 ${i + 1}`,
  cover_image_url: svgUrl(i + 1, COLORS[i % COLORS.length]),
  status: 'open',
  winner_count: 1,
  entry_count: i + 3,
}));

/* 几何测量：page.evaluate 只序列化函数体 ⇒ 选择器一律作为参数传入（AI-ENV §3） */
const boxOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
  }, sel);

/* 列数：computed gridTemplateColumns 是「每条轨道宽度」的空格串 */
const gridCols = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return 0;
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  }, sel);

/* 相对 .store-page 内容盒（含 padding-left = 左栏让位）的左右留白是否对称 */
const centering = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    const host = document.querySelector('.store-page');
    if (!el || !host) return null;
    const r = el.getBoundingClientRect();
    const p = host.getBoundingClientRect();
    const ps = getComputedStyle(host);
    const padL = parseFloat(ps.paddingLeft) || 0;
    const padR = parseFloat(ps.paddingRight) || 0;
    return {
      w: Math.round(r.width),
      leftGap: Math.round(r.left - (p.left + padL)),
      rightGap: Math.round(p.right - padR - r.right),
    };
  }, sel);

const SMALL_CARD_SEL = '.p-card:not(.p-skeleton):not(.is-banner):not(.is-large)';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

// ---------- A) 2560×1440：超大屏档（限宽 + 5 列 + 面板居中） ----------
{
  const ctx = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
  const page = await ctx.newPage();
  await page.route('**/rest/v1/rpc/get_community_lotteries*', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify(lotteryRows) }),
  );
  await page.route('**/rest/v1/lotteries*', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto(`${BASE}/#/shop`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card:not(.p-skeleton)'), null, {
    timeout: 30000,
  });

  const main = await centering(page, '.store-main');
  check(
    'A1 2560 store-main 收进 1480 上限',
    main && Math.abs(main.w - 1480) <= 2,
    JSON.stringify(main),
  );
  check(
    'A2 2560 store-main 在内容区内左右对称（居中）',
    main && Math.abs(main.leftGap - main.rightGap) <= 2 && main.leftGap > 0,
    `left=${main?.leftGap} right=${main?.rightGap}`,
  );

  const cols = await gridCols(page, '.product-grid');
  check('A3 2560 商品网格 5 列（auto-fill 自适应）', cols === 5, `cols=${cols}`);

  const card = await boxOf(page, SMALL_CARD_SEL);
  check(
    'A4 2560 商品单卡 ~283px（≤320 且 ≥240）',
    card && card.w <= 320 && card.w >= 240,
    `w=${card?.w}`,
  );

  // 切抽奖分区：hash 直达（与页面自身 syncTabFromRoute 同一条链路，不依赖按钮点击）
  await page.goto(`${BASE}/#/shop?tab=lottery`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('.lt-card'), null, { timeout: 15000 });
  const ltCols = await gridCols(page, '.lt-grid');
  check('A5 2560 抽奖网格 5 列（与商品同口径）', ltCols === 5, `cols=${ltCols}`);
  const ltCard = await boxOf(page, '.lt-card');
  check(
    'A6 2560 抽奖单卡 ~286px（≤320 且 ≥240）',
    ltCard && ltCard.w <= 320 && ltCard.w >= 240,
    `w=${ltCard?.w}`,
  );

  // 购物袋：塞两件（bagStore 是本地 pinia 状态，无需登录）再 hash 切分区
  await page.evaluate(() => {
    const st = document.querySelector('.store-page').__vueParentComponent.setupState;
    const products = st.allProducts || [];
    for (const p of products.slice(0, 2)) st.bagStore.addToBag(p, 'Default', '默认规格');
  });
  await page.goto(`${BASE}/#/shop?tab=bag`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bag-panel', { timeout: 15000 });
  const bag = await centering(page, '.bag-panel');
  check(
    'A7 2560 购物袋 760px 且居中',
    bag && bag.w === 760 && Math.abs(bag.leftGap - bag.rightGap) <= 2,
    JSON.stringify(bag),
  );

  await page.goto(`${BASE}/#/shop?tab=order`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.order-panel', { timeout: 15000 });
  const order = await centering(page, '.order-panel');
  check(
    'A8 2560 订单 760px 且居中（未登录空态也渲染根节点）',
    order && order.w === 760 && Math.abs(order.leftGap - order.rightGap) <= 2,
    JSON.stringify(order),
  );

  await page.goto(`${BASE}/#/shop?tab=address`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.addr-panel', { timeout: 15000 });
  const addr = await centering(page, '.addr-panel');
  check(
    'A9 2560 地址 760px 且居中',
    addr && addr.w === 760 && Math.abs(addr.leftGap - addr.rightGap) <= 2,
    JSON.stringify(addr),
  );

  await page.screenshot({ path: `${OUT}/large-screen-shop-2560.png`, fullPage: false });
  await ctx.close();
}

// ---------- B) 1920×1080：上限已触发（内容区 1632 > 1480） ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/shop`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card:not(.p-skeleton)'), null, {
    timeout: 30000,
  });
  const main = await centering(page, '.store-main');
  check(
    'B1 1920 store-main 收进 1480 上限',
    main && Math.abs(main.w - 1480) <= 2,
    JSON.stringify(main),
  );
  const cols = await gridCols(page, '.product-grid');
  check('B2 1920 商品网格 5 列', cols === 5, `cols=${cols}`);
  const card = await boxOf(page, SMALL_CARD_SEL);
  check('B3 1920 商品单卡 ≤320', card && card.w <= 320, `w=${card?.w}`);
  await ctx.close();
}

// ---------- C) 1440×900：笔记本档（内容区 1200 < 1480，保持全宽 1152 + 3 列回归口径） ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/shop`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card:not(.p-skeleton)'), null, {
    timeout: 30000,
  });
  const main = await boxOf(page, '.store-main');
  check(
    'C1 1440 store-main 保持全宽 1152（= 1440 − 左栏 240 − 48）',
    main && Math.abs(main.w - 1152) <= 3,
    `w=${main?.w}`,
  );
  const cols = await gridCols(page, '.product-grid');
  check('C2 1440 商品网格 3 列（旧固定三列档回归）', cols === 3, `cols=${cols}`);
  const card = await boxOf(page, SMALL_CARD_SEL);
  check('C3 1440 商品单卡 ~373px（≤420）', card && card.w <= 420, `w=${card?.w}`);
  await ctx.close();
}

// ---------- D) 390×844 竖屏：口径不变（2 列） ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/shop`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 25000 });
  await page.waitForFunction(() => !!document.querySelector('.p-card:not(.p-skeleton)'), null, {
    timeout: 30000,
  });
  const cols = await gridCols(page, '.product-grid');
  check('D1 390 竖屏商品网格仍 2 列（竖屏口径不动）', cols === 2, `cols=${cols}`);
  const card = await boxOf(page, SMALL_CARD_SEL);
  check('D2 390 竖屏商品单卡 ~173px（≤200）', card && card.w <= 200, `w=${card?.w}`);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} 项断言失败` : '\n全部断言通过');
process.exit(failed ? 1 : 0);
