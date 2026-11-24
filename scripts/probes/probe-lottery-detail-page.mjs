// 探针：抽奖独立详情页 `/lottery/:id`（2026-11-24，plans/047 §5 收尾）
//
// 为什么要有它：这个页面此前**一条布局守卫都没有** —— 单测只有源码级断言
// （`lottery-detail-scroll.test.js` 锁 CSS 结构、`lottery-standalone-share.test.js`
// 锁路由与分享），没有一条真浏览器里量几何的。
//
// 而 2026-11-24 那次清理删掉了很大一块：弹层形态（`Teleport` / 遮罩 / `standalone`
// 分支 / 滚锁 / 来源卡片形变）在列表改 `router.push` 之后**再没有任何宿主**，
// 属于「任何路径都跑不到」的死代码。删死代码的风险恰恰在于「删多了」——
// 比如把遮罩删了却忘了给根元素铺底色（横屏四周会透出背后的东西）、
// 或者把滚锁删了却连带删掉滚动容器的 `overflow-y`（封面不跟手）。
// 这类缺陷**功能断言全绿、只有截图/几何看得出来**，所以必须落到探针里。
//
// 分组：
//   A 路由与空态（不假装存在、不锁页面滚动）
//   B 竖屏（铺满 / 根元素有底色 / surface 自己滚 / 封面有高度 / 关闭键在左上）
//   C 横屏（有上限且居中 / 圆角 / 四周有底色 / 关闭键在右上 / 操作区不被裁）
//   D 暗色（深底 + 浅字 + 商城域 token 未丢）
//   E 回到列表（关闭语义 = 跳 `/shop?tab=lottery`，不是「清深链」）
//
// 用法：先 `npm run dev`，再 `node scripts/probes/probe-lottery-detail-page.mjs`
//      PROBE_BASE 可覆盖地址（默认 http://localhost:5173）。
//
// ⚠️ 三个写探针的坑（本文件已避开）：
//   ① 暗色**必须写 localStorage 的 `boh-theme`**：手动 `setAttribute('data-theme')`
//      是假路径（暗色 CSS 由 themeManager 懒加载），量出来白底黑字像真回归。
//      本仓库已有先例（`probe-shop-checkout.mjs` 的 G13–G15）。
//   ② 抽奖数据来自后端，探针环境不该依赖它 ⇒ 直接往页面实例的 `setupState.lottery`
//      注入一份固定样本，再靠 `loading = false` 让它渲染。注入前必须等页面挂载
//      （`__vueParentComponent` 在未挂载时是 undefined）。
//   ③ 亮度判据要**算相对亮度**而不是比字符串：`rgb(22, 18, 14)` 与 `rgb(10, 10, 15)`
//      肉眼都是「深色」，但一个是页面底、一个是面板底，混起来就分不清谁该更亮。
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const MISSING_ID = '999999';
const SAMPLE_ID = 990001;

/** 样本抽奖（字段与后端 `getCommunityLotteries()` 返回体对齐） */
const SAMPLE = {
  id: SAMPLE_ID,
  title: '探针样本：限定手办',
  prize_title: '限定手办',
  prize_description: '一份用于探针的样本奖品',
  description: '这段说明用于验证正文渲染与滚动。',
  status: 'open',
  entry_count: 12,
  max_entries: 50,
  winner_count: 2,
  cover_image_url: '',
  entry_deadline_at: '2026-12-01T12:00:00Z',
  winners: [],
};

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

/** 相对亮度（0–1）。用来判「深底 / 浅字」，比字符串比较可靠。 */
const REL_LUM = `(rgb) => {
  const m = String(rgb).match(/[\\d.]+/g);
  if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}`;

const browser = await chromium.launch({
  channel: process.env.PROBE_CHANNEL || 'chrome',
  args: ['--no-sandbox', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/** 打开 `/lottery/:id`，可选注入样本 + 暗色 */
const openPage = async (browser, viewport, { sample = false, dark = false } = {}) => {
  const ctx = await browser.newContext({
    viewport,
    isMobile: viewport.width < 700,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (dark) {
    /* 坑①：必须走 localStorage，让 themeManager 去懒加载暗色 CSS */
    await page.addInitScript(() => {
      try {
        localStorage.setItem('boh-theme', 'dark');
      } catch {
        /* 隐私模式忽略 */
      }
    });
  }
  const id = sample ? SAMPLE_ID : MISSING_ID;
  await page.goto(`${BASE}/#/lottery/${id}`, { waitUntil: 'domcontentloaded' });
  if (sample) {
    /* 坑②：注入前要等页面挂载完毕，否则 __vueParentComponent 还不存在 */
    await page.waitForFunction(
      () => !!document.querySelector('.lottery-detail-page')?.__vueParentComponent,
      null,
      { timeout: 15000 },
    );
    await page.evaluate((payload) => {
      const vm = document.querySelector('.lottery-detail-page').__vueParentComponent;
      vm.setupState.lottery = payload;
      vm.setupState.loading = false;
    }, SAMPLE);
    await page.waitForFunction(() => !!document.querySelector('.detail-surface'), null, {
      timeout: 10000,
    });
    await page.waitForTimeout(400);
  } else {
    /* 空态要等**列表取完**才出现（首屏是骨架），用固定 sleep 猜不准 ——
       固定 1800ms 时列表还没回来、量到的是骨架，A1 会假红。 */
    await page.waitForSelector('.ldp-empty, .detail-surface', { timeout: 25000 });
    await page.waitForTimeout(300);
  }
  return { ctx, page, errors };
};

const geometry = (page) =>
  page.evaluate((lumSrc) => {
    const lum = eval(lumSrc);
    const root = document.querySelector('.detail-root');
    const surface = document.querySelector('.detail-surface');
    if (!root || !surface) return null;
    const sb = surface.getBoundingClientRect();
    const foot = document.querySelector('.surface-footer')?.getBoundingClientRect();
    const close = document.querySelector('.surface-close')?.getBoundingClientRect();
    const join = document.querySelector('.join-btn')?.getBoundingClientRect();
    const media = document.querySelector('.surface-media')?.getBoundingClientRect();
    const style = getComputedStyle(surface);
    return {
      rootClass: root.className,
      rootBg: getComputedStyle(root).backgroundColor,
      rootLum: lum(getComputedStyle(root).backgroundColor),
      surfaceBg: style.backgroundColor,
      surface: {
        x: Math.round(sb.x),
        y: Math.round(sb.y),
        w: Math.round(sb.width),
        h: Math.round(sb.height),
        bottom: Math.round(sb.bottom),
      },
      radius: style.borderTopLeftRadius,
      overflowY: style.overflowY,
      footBottom: foot ? Math.round(foot.bottom) : null,
      close: close ? { x: Math.round(close.x), y: Math.round(close.y) } : null,
      joinInView: join ? join.bottom <= sb.bottom + 1 && join.top >= sb.top - 1 : false,
      mediaH: media ? Math.round(media.height) : 0,
      title: document.querySelector('.surface-title')?.innerText?.trim() || '',
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }, REL_LUM);

// ---------- A) 路由与空态 ----------
{
  const { ctx, page, errors } = await openPage(browser, { width: 390, height: 844 });
  const state = await page.evaluate(() => ({
    empty: !!document.querySelector('.ldp-empty'),
    sheet: !!document.querySelector('.detail-surface'),
    scrim: !!document.querySelector('.detail-scrim'),
    rootOverflow: getComputedStyle(document.documentElement).overflowY,
    bodyOverflow: getComputedStyle(document.body).overflowY,
  }));
  check('A1 不存在的抽奖给空态（不假装存在）', state.empty === true && state.sheet === false);
  check('A2 遮罩层已彻底删除（独立页没有要压暗的背景）', state.scrim === false);
  /* 独立页是不叠层的路由页：锁住 body/根滚动会让 iOS 回弹与滚动变怪
     （2026-11-10 商品详情那条报障的反面），所以必须确认没人到处上锁。 */
  check(
    'A3 不锁页面滚动（独立页语义）',
    state.rootOverflow !== 'hidden' && state.bodyOverflow !== 'hidden',
    `html=${state.rootOverflow} body=${state.bodyOverflow}`,
  );
  check('A4 无 pageerror', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- B) 竖屏（390×844） ----------
{
  const { ctx, page, errors } = await openPage(
    browser,
    { width: 390, height: 844 },
    { sample: true },
  );
  const geo = await geometry(page);
  check(
    'B1 竖屏铺满视口',
    geo && geo.surface.w === 390 && geo.surface.h === 844,
    JSON.stringify(geo?.surface),
  );
  /* 删遮罩后最容易漏的一条：原来四周的底色是遮罩层给的，
     现在必须由根元素自己铺 —— 否则横屏面板外面会透出背后的东西。 */
  check(
    'B2 根元素自己铺页面底色（不依赖已删除的遮罩层）',
    geo && geo.rootLum !== null && geo.rootBg !== 'rgba(0, 0, 0, 0)',
    geo?.rootBg,
  );
  /* 竖屏滚动容器必须是**整个 surface**：封面是滚动流的一部分，
     往上滑要跟着滚出去（2026-11-02 用户口径）；改成内容区独立滚动封面就钉死了。 */
  check('B3 竖屏由 surface 自己滚（封面随滚动离开）', geo?.overflowY === 'auto', geo?.overflowY);
  /* 封面区塌成 0 / 56px 是 grid/flex 收缩的经典表现，且内容断言全绿 */
  check('B4 封面区有真实高度（不是塌成一条）', geo && geo.mediaH > 150, String(geo?.mediaH));
  check('B5 关闭键竖屏在左上', geo && geo.close && geo.close.x < 40, JSON.stringify(geo?.close));
  check('B6 标题渲染出来', Boolean(geo?.title?.includes('限定手办')), geo?.title);
  check('B7 无 pageerror', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- C) 横屏（1280×800，双侧栏场景） ----------
{
  const { ctx, page, errors } = await openPage(
    browser,
    { width: 1280, height: 800 },
    { sample: true },
  );
  const geo = await geometry(page);
  check(
    'C1 横屏有上限且居中（不铺满整个视口）',
    geo && geo.surface.w <= 1120 && geo.surface.w < 1280,
    JSON.stringify(geo?.surface),
  );
  check('C2 横屏有圆角（弹窗语言）', geo && geo.radius !== '0px', String(geo?.radius));
  check(
    'C3 横屏四周露出页面底色（不是透明，也不是黑边）',
    geo && geo.rootLum !== null && geo.rootBg !== 'rgba(0, 0, 0, 0)',
    geo?.rootBg,
  );
  check('C4 关闭键横屏在右上', geo && geo.close && geo.close.x > 800, JSON.stringify(geo?.close));
  /* 底部操作区被 surface 的 overflow:hidden 裁掉是「看不见但点得到」的那类缺陷 */
  check(
    'C5 底部操作区在面板内（没被裁）',
    geo && geo.footBottom !== null && geo.footBottom <= geo.surface.bottom + 1,
    `foot=${geo?.footBottom} surface=${geo?.surface?.bottom}`,
  );
  check('C6 报名按钮完整落在面板内', geo?.joinInView === true);
  check('C7 无 pageerror', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- D) 暗色 ----------
{
  const { ctx, page, errors } = await openPage(
    browser,
    { width: 390, height: 844 },
    { sample: true, dark: true },
  );
  const dark = await page.evaluate((lumSrc) => {
    const lum = eval(lumSrc);
    const root = document.querySelector('.detail-root');
    const surface = document.querySelector('.detail-surface');
    const title = document.querySelector('.surface-title');
    const cs = getComputedStyle(surface);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      rootBg: getComputedStyle(root).backgroundColor,
      rootLum: lum(getComputedStyle(root).backgroundColor),
      surfaceBg: cs.backgroundColor,
      surfaceLum: lum(cs.backgroundColor),
      titleColor: getComputedStyle(title).color,
      titleLum: lum(getComputedStyle(title).color),
    };
  }, REL_LUM);
  check('D1 暗色真的生效', dark.theme === 'dark', dark.theme);
  check(
    'D2 暗色根元素是深底（没刷成白纸）',
    dark.rootLum !== null && dark.rootLum < 0.35,
    dark.rootBg,
  );
  check('D3 暗色标题是浅字', dark.titleLum !== null && dark.titleLum > 0.5, dark.titleColor);
  /* ⚠️ 这里刻意**不判 `classList.contains('shop-sheet-tokens')`**。
     2026-11-24 反证实测：判类名时「去掉这个类」确实红，但那是假牙 ——
     本页这条路由根本不加载 `store-tokens.css`（只有 Shop/index.vue 与 BagPage.vue 引入），
     带不带这个类，`--boh-bg-primary` 读到的都是全局 `#0a0a0f`。
     真正要守的是**暗色下详情面板本身也是深色**（而不是白纸）。
     这才是用户看得见的那件事，类名是否有用不属于探针的判据。 */
  check(
    'D4 暗色详情面板也是深底（面板不吃浅色 fallback）',
    dark.surfaceLum !== null && dark.surfaceLum < 0.35,
    `surface=${dark.surfaceBg}`,
  );
  check('D5 暗色无 pageerror', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------- E) 关闭语义：回到抽奖列表 ----------
{
  const { ctx, page } = await openPage(browser, { width: 1280, height: 800 }, { sample: true });
  /* 关闭键要真的可点（横屏在右上角，别被别的层盖住）——用 elementFromPoint 判遮挡，
     只判 `isVisible` 时被盖住也照样绿。 */
  const clickable = await page.evaluate(() => {
    const btn = document.querySelector('.surface-close');
    if (!btn) return false;
    const box = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return btn === hit || btn.contains(hit);
  });
  check('E1 关闭键没被其他层盖住（elementFromPoint 命中自身）', clickable === true);
  await page.evaluate(() => document.querySelector('.surface-close')?.click());
  await page.waitForTimeout(900);
  const url = page.url();
  /* 独立页的关闭语义是「回到抽奖列表」，不是「清深链」——
     旧深链 `?lottery=<id>` 只是兼容入口，落点已统一到 /shop?tab=lottery。 */
  check('E2 关闭后回到抽奖列表', url.includes('/shop') && url.includes('tab=lottery'), url);
  await ctx.close();
}

await browser.close();

if (failed) {
  console.log(`\n${failed} 条失败`);
  process.exit(1);
}
console.log('\n全部通过');
