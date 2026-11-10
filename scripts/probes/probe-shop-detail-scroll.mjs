import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：商城商品详情的「滚动归属」（2026-11-10 用户报障
//   「商城详情的滚动还是在滚动商品列表页，而不是详情页」）
//
// 真因不是详情自己不能滚，而是**页面那把锁锁错了元素**：
//   `src/style.css` 写死 `html { overflow-y: auto !important }` +
//   `body { overflow-y: visible !important }` ⇒ 文档滚动发生在 html 上，
//   而代码只写 `document.body.style.overflow = 'hidden'`（inline、无 important），
//   连样式表都盖不过 ⇒ 等于没锁，滚轮/触控一路穿到背后的商品列表。
//
// 本探针钉的就是这条：**详情打开期间，window.scrollY 必须一动不动**，
// 且详情内容区自己能滚；关闭后页面必须恢复可滚（防「锁住不还」的反向事故）。
// 反证：把 useBodyScrollLock 里锁 documentElement 的三行删掉，A1–A3 立刻红。
//   ⚠️ 只有 A1–A3 是**判别性**断言：A4（内容区滚轮）与 B2（竖屏）在没锁的情况下
//   也可能绿 —— 页面已到底、或 `overscroll-behavior: contain` 兜住了容器内的滚动。
//   改断言时别把 A1–A3 换掉，换掉这道探针就变成永远绿的假门禁。
//
// 用法：node scripts/probes/probe-shop-detail-scroll.mjs
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/shop-detail-scroll';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail === undefined ? '' : '— ' + detail);
  } else {
    fail += 1;
    console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail);
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

async function openShop(width, height, tag) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/shop`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(1200);
  await page.waitForSelector('.p-card', { timeout: 20000 });
  return { page, context };
}

const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) };
  }, selector);

const scrollState = (page) =>
  page.evaluate(() => ({
    pageY: window.scrollY,
    rootOverflowY: getComputedStyle(document.documentElement).overflowY,
    rootInlineOverflowY: document.documentElement.style.getPropertyValue('overflow-y'),
    surfaceTop: document.querySelector('.surface-scroll')?.scrollTop ?? -1,
  }));

/** 在某个坐标上滚一轮滚轮，返回滚动前后状态。 */
async function wheelAt(page, x, y, dy = 400) {
  const before = await scrollState(page);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(450);
  const after = await scrollState(page);
  return { before, after };
}

// ── A 组：横屏（桌面 / 平板），详情是居中弹窗 ──────────────────────
{
  const { page, context } = await openShop(1440, 900, 'landscape');
  await page.evaluate(() => window.scrollTo(0, 240));
  await page.waitForTimeout(300);
  const cardBefore = await rectOf(page, '.p-card');

  await page.locator('.p-card').first().click();
  await page.waitForSelector('.detail-surface', { timeout: 10000 });
  await page.waitForTimeout(800);

  const opened = await scrollState(page);
  check(
    'A1 详情打开即锁根元素（html overflow-y = hidden）',
    opened.rootOverflowY === 'hidden',
    `computed=${opened.rootOverflowY} inline=${opened.rootInlineOverflowY || '(空)'}`,
  );

  const geom = await page.evaluate(() => {
    const b = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return { media: b('.surface-media'), scroll: b('.surface-scroll') };
  });

  const onMedia = await wheelAt(page, geom.media.x + geom.media.w / 2, geom.media.y + 120);
  check(
    'A2 滚轮打在封面图上：背后列表不动',
    onMedia.after.pageY === onMedia.before.pageY,
    `pageY ${onMedia.before.pageY} → ${onMedia.after.pageY}`,
  );

  const onScrim = await wheelAt(page, 30, 30);
  check(
    'A3 滚轮打在遮罩上：背后列表不动',
    onScrim.after.pageY === onScrim.before.pageY,
    `pageY ${onScrim.before.pageY} → ${onScrim.after.pageY}`,
  );

  const onContent = await wheelAt(
    page,
    geom.scroll.x + geom.scroll.w / 2,
    geom.scroll.y + Math.min(200, geom.scroll.h / 2),
  );
  check(
    'A4 滚轮打在内容区：背后列表不动',
    onContent.after.pageY === onContent.before.pageY,
    `pageY ${onContent.before.pageY} → ${onContent.after.pageY}`,
  );

  /* 上锁会隐藏滚动条 —— 若不用 padding 补位，整页会横向位移一个滚动条宽度。
     背景卡片的 x/宽度必须与打开前一致（±1px 容差给亚像素）。 */
  const cardAfter = await rectOf(page, '.p-card');
  check(
    'A5 上锁不引起横向位移（滚动条宽度已补位）',
    cardBefore && cardAfter && Math.abs(cardBefore.x - cardAfter.x) <= 1,
    `卡片 x ${cardBefore?.x} → ${cardAfter?.x}`,
  );

  await page.screenshot({ path: `${OUT}/landscape-open.png` });

  // 关闭：Esc → 页面必须恢复可滚
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const closed = await scrollState(page);
  /* 落点必须在内容区：横屏左栏是 fixed 的 `.userspace-rail-scroll`（自己会滚），
     滚轮打在那里页面本来就不动，会把这个断言测成假绿。 */
  await page.mouse.move(900, 600);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(450);
  const afterClose = await scrollState(page);
  check(
    'A6 关闭后页面恢复可滚（锁没赖着不走）',
    closed.rootOverflowY !== 'hidden' && afterClose.pageY !== closed.pageY,
    `overflow-y=${closed.rootOverflowY}，pageY ${closed.pageY} → ${afterClose.pageY}`,
  );

  await context.close();
}

// ── B 组：竖屏（手机），详情是全屏页，内容区自己滚 ────────────────
{
  const { page, context } = await openShop(390, 844, 'portrait');
  await page.evaluate(() => window.scrollTo(0, 120));
  await page.waitForTimeout(300);

  await page.locator('.p-card').first().click();
  await page.waitForSelector('.detail-surface', { timeout: 10000 });
  await page.waitForTimeout(800);

  // 商品文案短时内容区不会溢出：垫一段高度，测「容器能滚 + 页面不跟着滚」
  const forced = await page.evaluate(() => {
    const sc = document.querySelector('.surface-scroll');
    if (!sc) return false;
    if (sc.scrollHeight > sc.clientHeight + 4) return false;
    const pad = document.createElement('div');
    pad.style.height = '1400px';
    pad.setAttribute('data-probe-pad', '1');
    sc.appendChild(pad);
    return true;
  });

  const geom = await page.evaluate(() => {
    const r = document.querySelector('.surface-scroll').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const onContent = await wheelAt(page, geom.x + geom.w / 2, geom.y + geom.h / 2);
  check(
    'B1 竖屏：详情内容区自己滚起来了',
    onContent.after.surfaceTop > onContent.before.surfaceTop,
    `scrollTop ${onContent.before.surfaceTop} → ${onContent.after.surfaceTop}${
      forced ? '（已垫高内容）' : '（原始内容已溢出）'
    }`,
  );
  check(
    'B2 竖屏：内容区滚动时背后列表不动',
    onContent.after.pageY === onContent.before.pageY,
    `pageY ${onContent.before.pageY} → ${onContent.after.pageY}`,
  );

  await page.screenshot({ path: `${OUT}/portrait-open.png` });
  await context.close();
}

// ── C 组：其它分区不能「误上锁」（挂载了但没打开的弹层不许锁住页面）──
{
  const { page, context } = await openShop(1440, 900, 'tabs');
  /* 抽奖 / 订单两个分区各自挂着 LotteryPanel / OrderPanel（内含常驻挂载的详情层），
     它们的滚动锁必须跟着「有没有真的打开详情」走。锁在挂载时误上，表现为
     「切到抽奖后整页滚不动」—— 比原来的穿透更难排查，所以单独钉一条。 */
  for (const [tab, label] of [
    ['lottery', '抽奖'],
    ['order', '订单'],
  ]) {
    await page.evaluate((t) => {
      const btn = [...document.querySelectorAll('.store-tabs button')].find((b) =>
        b.textContent.includes(t === 'lottery' ? '抽奖' : '订单'),
      );
      btn?.click();
    }, tab);
    await page.waitForTimeout(1500);
    const before = await scrollState(page);
    /* 「订单」分区未登录时是空态，页面可能比视口还短 ⇒ 滚不动是正常的，
       不能据此判红。真正的判据是「没有把根元素锁住」。 */
    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight > 40,
    );
    await page.mouse.move(900, 600);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(450);
    const after = await scrollState(page);
    check(
      `C${tab === 'lottery' ? 1 : 2} 切到「${label}」分区：页面没有被误上锁`,
      before.rootOverflowY !== 'hidden' && (!scrollable || after.pageY !== before.pageY),
      `pageY ${before.pageY} → ${after.pageY}，html overflow-y=${before.rootOverflowY}，${
        scrollable ? '可滚' : '内容不足一屏（跳过滚动判据）'
      }`,
    );
  }
  await context.close();
}

check('Z1 全程无 pageerror', errors.length === 0, errors.join(' | ') || '0 条');

await browser.close();
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
