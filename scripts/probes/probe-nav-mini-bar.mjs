import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：竖屏导航 Mini Bar 形态（plans/009-portrait-nav-mini-bar.md）
//   默认 mini 胶囊（logo + 头像 + 汉堡）⇄ 点汉堡一步展开长条 + 菜单；
//   任意岛唤起强制展开且连体；岛关闭双轴回缩 mini；连发通知无缝接管不闪断。
//   场景：
//     A 竖屏 390x844（≤480 档）首帧 mini + 点 logo 不展开（直达）
//     B 点汉堡 → 长条 + 菜单（一步到位）
//     C 点外部 → 回缩 mini
//     D 菜单开着唤起通知岛 → 菜单被收 + 岛强制展开连体
//     E 连发两条通知 → 宽度轨迹全程 >300（无缝接管无闪断）→ 结束回 mini
//     F 滚动 >140px 回缩；横向滚动（scrollLeft）不误触
//     G 桌面横屏 1400x900：默认 mini + hover 展开 + 移开回缩
//     H 竖屏 600x900（>480 档）mini 宽 188
//     I 横屏 900x600（700–1023 档）：mini 180 + hover 展开 720 居中 + 点开下拉
//     J hover 热区 = 胶囊盒子（下方 120px / 右侧 24px 都不许展开）+ 展开态 pointermove 不量盒子
//     L 未登录：hover「登录」不展开（保证能点中）+ 登录岛上半岛=下半岛同宽相接
//     M 登录态：hover 头像 / logo 也不展开（它们与登录同属直接动作目标）
//     N 资讯页搜索岛（状态卡）在场时打开下拉：卡片让位、surface 按菜单长高、菜单不被裁
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
      points: 42,
    });
  });
};

// dev 下 HMR 会打断 evaluate → 包一次重试，避免假红
const evalRetry = async (page, fn, arg) => {
  try {
    return await page.evaluate(fn, arg);
  } catch {
    await page.waitForTimeout(1000);
    return page.evaluate(fn, arg);
  }
};

const MEASURE_FN = () => {
  const $ = (s) => document.querySelector(s);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
    };
  };
  const surface = $('.unified-nav-surface');
  const container = surface ? surface.querySelector('.nav-container') : null;
  const cs = surface ? getComputedStyle(surface) : null;
  const logoText = $('.nav-logo-text');
  const username = $('.nav-username');
  const menu = $('.nav-menu-mobile');
  const statusCard = $('.global-nav-status-card');
  return {
    surface: rect(surface),
    classes: surface ? surface.className : null,
    surfaceMaxW: cs ? cs.maxWidth : null,
    surfaceH: cs ? cs.height : null,
    containerScrollW: container ? container.scrollWidth : null,
    containerClientW: container ? container.clientWidth : null,
    logoTextOpacity: logoText ? getComputedStyle(logoText).opacity : null,
    usernameOpacity: username ? getComputedStyle(username).opacity : null,
    logoIcon: rect($('.nav-logo-icon')),
    avatar: rect($('.nav-avatar')),
    burger: rect($('#nav-hamburger')),
    burgerRendered: (() => {
      const b = $('#nav-hamburger');
      if (!b) return false;
      const s = getComputedStyle(b);
      const r2 = b.getBoundingClientRect();
      return s.display !== 'none' && r2.width > 0;
    })(),
    // 桌面一级菜单（与上面的 menu = .nav-menu-mobile 不是一个元素，别混用）
    navMenuDisplay: (() => {
      const m = $('.nav-menu');
      return m ? getComputedStyle(m).display : null;
    })(),
    menuActive: !!menu && menu.classList.contains('active'),
    menuDisplay: menu ? getComputedStyle(menu).display : null,
    statusCardRect: rect(statusCard),
    statusCardRendered: (() => {
      if (!statusCard) return false;
      const s = getComputedStyle(statusCard);
      return s.display !== 'none' && statusCard.getBoundingClientRect().height > 0;
    })(),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
};

// 采样 surface 宽度轨迹（E 场景「无闪断」的判据）
const startWidthPolling = (page) =>
  page.evaluate(() => {
    window.__miniPoll = [];
    window.__miniPollTimer = setInterval(() => {
      const s = document.querySelector('.unified-nav-surface');
      if (s)
        window.__miniPoll.push({
          t: Date.now(),
          w: Math.round(s.getBoundingClientRect().width),
          island: s.classList.contains('has-status-card'),
        });
    }, 50);
  });
const stopWidthPolling = (page) =>
  page.evaluate(() => {
    clearInterval(window.__miniPollTimer);
    return window.__miniPoll || [];
  });

const report = { results: {}, checks: {}, pageErrors: [] };
const browser = await launch();

/* ⚠️ 2026-11-15：首页开屏期间导航栏**不挂载**（App.vue 的 v-if 经
   utils/global-navbar-visibility.js 读 useHomeGate 的 homeGateScreening）。
   探针代表「已经看过开场画的老用户」，故每个 context 先预置 gate 通过标记，
   否则所有等待 .unified-nav-surface 的断言都会 20s 超时。
   key 与 src/utils/home-gate-storage.js 一致（dev 构建无 buildId ⇒ 无后缀）；
   必须在**首次 goto 之前**注入 —— addInitScript 只对后续导航生效。 */
const gateNewContext = async (options = {}) => {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* about:blank 等无 storage 场景忽略 */
    }
    try {
      /* 抑制「概览加载岛」：首页登录后 Home 会调 maybeShowOverviewIsland() →
         showIsland.custom(OverviewIslandLoading)，导航会被撑成 has-custom-card 展开态。
         开屏在场时这段不跑（本次改动前探针从没撞上它），开屏一跳过它就跟着跑，
         A 组「首帧 mini」测量会随机量到展开态的中间值。
         预置「本会话已弹过」标记 = 稳定复现真实老用户的状态。
         userId 与下方 injectAuth 注入的 probe_user 是同一个（改一处要一起改）；
         有专门测概览岛的探针，它们不走这个 helper，不受影响。 */
      sessionStorage.setItem('boh_overview_island:00ac36b4-6594-440f-a9c1-38b7bd47ee8b', '1');
    } catch {
      /* ignore */
    }
  });
  return ctx;
};

// ---------- 场景 A：竖屏 390x844 首帧 mini + logo 直达 ----------
{
  const context = await gateNewContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('A: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.A_mini = await evalRetry(page, MEASURE_FN);
  // 点 logo：直达不展开
  await page.click('.nav-logo');
  await page.waitForTimeout(500);
  report.results.A_afterLogoTap = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-A-firstframe.png` });
  await context.close();
}

// ---------- 场景 B/C：点汉堡展开 + 菜单；点外部回缩 ----------
{
  const context = await gateNewContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('BC: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  // B：点汉堡 = 展开 + 菜单一步到位
  await page.click('#nav-hamburger');
  await page.waitForTimeout(1000);
  report.results.B_expanded = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-B-expanded.png` });
  // C：点胶囊外部（页面左下角）→ 回缩 mini
  await page.mouse.click(30, 700);
  await page.waitForTimeout(800);
  report.results.C_collapsed = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-C-collapsed.png` });
  await context.close();
}

// ---------- 场景 D：菜单开着唤起通知岛 → 收菜单 + 强制展开连体 ----------
{
  const context = await gateNewContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('D: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.click('#nav-hamburger'); // 先开菜单
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('boh_global_nav_status', {
        detail: { title: '离线摘要已生成', message: '探针 D', icon: 'success', durationMs: 4000 },
      }),
    );
  });
  await page.waitForTimeout(1100);
  report.results.D_island = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-D-island.png` });
  // 岛关闭 → 双轴回 mini
  await page.waitForTimeout(4200);
  report.results.D_afterClose = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-D-afterclose.png` });
  await context.close();
}

// ---------- 场景 E：连发两条通知，宽度轨迹无闪断 ----------
{
  const context = await gateNewContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('E: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await startWidthPolling(page);
  await page.evaluate(() => {
    const fire = (title) =>
      window.dispatchEvent(
        new CustomEvent('boh_global_nav_status', {
          detail: { title, message: '', icon: 'success', durationMs: 1800 },
        }),
      );
    fire('探针通知一');
    setTimeout(() => fire('探针通知二'), 120); // 第二条入队（第一条在场）
  });
  await page.waitForTimeout(6200);
  const track = await stopWidthPolling(page);
  await context.close();
  const islandFrames = track.filter((f) => f.island);
  const minIslandW = islandFrames.length ? Math.min(...islandFrames.map((f) => f.w)) : 0;
  const lastW = track.length ? track[track.length - 1].w : 0;
  const islandSpan = islandFrames.length
    ? islandFrames[islandFrames.length - 1].t - islandFrames[0].t
    : 0;
  report.results.E_track = {
    frames: track.length,
    islandFrames: islandFrames.length,
    minIslandW,
    lastW,
    islandSpan,
  };
  report.results.E_minIslandW = minIslandW;
  report.results.E_lastW = lastW;
  report.results.E_islandSpan = islandSpan;
}

// ---------- 场景 F：滚动回缩 + 横向滚动不误触 ----------
{
  const context = await gateNewContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('F: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.click('#nav-hamburger');
  await page.waitForTimeout(900);
  // 横向滚动（scrollLeft）不触发回缩：插入一个横滑容器并滚动它
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'probe-hscroll';
    d.style.cssText =
      'position:fixed;left:0;bottom:0;width:200px;height:40px;overflow-x:auto;z-index:1;';
    d.innerHTML = '<div style="width:600px;height:10px"></div>';
    document.body.appendChild(d);
    d.scrollLeft = 80;
  });
  await page.waitForTimeout(700);
  report.results.F_afterHScroll = await evalRetry(page, MEASURE_FN);
  // 纵向滚动 >140 → 回缩
  await page.evaluate(() => window.scrollTo(0, 220));
  await page.waitForTimeout(800);
  report.results.F_afterVScroll = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-F-scrolled.png` });
  await context.close();
}

// ---------- 场景 G：桌面横屏 1400x900 —— 默认 mini + hover 展开（2026-11-14 起） ----------
// 旧契约是「横屏零影响（nav-mini-caps 必须不在、宽度恒 860）」，
// 2026-11-14 用户口径改为「桌面也收 mini，hover/点击展开」⇒ 断言随之改写。
// 注意：只有 (hover: hover) and (pointer: fine) 的设备才启用，Playwright 桌面上下文满足。
{
  const context = await gateNewContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('G: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.G_landscape = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-G-landscape.png` });

  // hover 展开
  // ⚠️ 不能点几何中心：mini 的 logo / 头像 / 汉堡三个热区里，中心点大概率落在头像上；
  //    头像自 2026-11-20 起是「直接动作目标」（hover 不展开，保证点击命中）。
  //    这里取 logo 与头像之间的空白间隙（约 25% 宽），才是真正代表「其他区域」的热区。
  const gBox = await page.locator('.unified-nav-surface').boundingBox();
  await page.mouse.move(gBox.x + gBox.width * 0.25, gBox.y + gBox.height / 2);
  await page.waitForTimeout(700);
  report.results.G_hover = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-G-hover.png` });

  // 移开 → 回缩
  await page.mouse.move(gBox.x + gBox.width / 2, 820);
  await page.waitForTimeout(800);
  report.results.G_afterLeave = await evalRetry(page, MEASURE_FN);
  await context.close();
}

// ---------- 场景 H：竖屏 600x900（>480 档）mini 宽 128 ----------
{
  const context = await gateNewContext({ viewport: { width: 600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('H: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.H_portrait_mid = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-H-600w.png` });
  await context.close();
}

// ---------- 场景 I：横屏 900x600 —— 700–1023 档也走 mini + hover 展开（2026-11-15） ----------
// 用户报障原文：「横屏的 hover 自动展开又没了」。
// 原因：资格判定原为 `min-width:1024px`，900/1000 这一档落进「常驻长条」，
// 而 `handleNavPointerEnter` 里 `if (!desktopMiniActive) return` 直接早退 ⇒ hover 无反应。
// 现在资格加了一条「orientation: landscape and min-width: 700px」（见 DESKTOP_MINI_QUERY）。
// 这条探针同时锁住两个容易回退的点：
//   ① mini 宽度必须是 180 而不是 720 —— fold-nav-rail.css 的
//      `max-width: min(720px, 100% - 112px)` 会压过 mini 的 max-width（实测过）；
//   ② 展开后必须**视口居中** —— 同一条 fold-nav-rail 规则还带 `left: -gutter/2` 左移。
{
  const context = await gateNewContext({ viewport: { width: 900, height: 600 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('I: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.I_landscape_mid = await evalRetry(page, MEASURE_FN);

  const ibox = await page.locator('.unified-nav-surface').boundingBox();
  // 同 G：避开 logo / 头像 / 汉堡，取胶囊内空白间隙，验证「其他区域 hover 展开」。
  await page.mouse.move(ibox.x + ibox.width * 0.25, ibox.y + ibox.height / 2);
  await page.waitForTimeout(700);
  report.results.I_hover = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-I-hover.png` });

  // 展开后点「社区」→ 下拉应在这条 720 的岛里长出来（不是浮一张卡、也不是不响应）
  const comm = await page.evaluate(() => {
    const li = [...document.querySelectorAll('.nav-menu > .nav-menu-item')].find((x) =>
      x.textContent.includes('社区'),
    );
    // 2026-11-20：一级下拉触发器由 <a> 改为原生 <button>（disclosure 语义）。
    const trigger = li?.querySelector('a, button');
    if (!trigger) return null;
    const r = trigger.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (comm) {
    await page.mouse.click(comm.x, comm.y);
    await page.waitForTimeout(800);
    report.results.I_submenu = await page.evaluate(() => {
      const s = document.querySelector('#unified-nav-container .unified-nav-surface');
      const sub = document.querySelector('.nav-submenu.active');
      const r = s.getBoundingClientRect();
      return {
        classes: s.className,
        surfaceW: +r.width.toFixed(1),
        surfaceH: +r.height.toFixed(1),
        center: +(r.left + r.width / 2).toFixed(1),
        viewportCenter: window.innerWidth / 2,
        submenuH: sub ? +sub.getBoundingClientRect().height.toFixed(1) : null,
      };
    });
    await page.screenshot({ path: `${OUT}/nav-mini-I-submenu.png` });
  }
  await context.close();
}

// ---------- 场景 J：hover 热区必须**只等于胶囊盒子**（2026-11-15） ----------
// 用户报障：「hover 区域不对，不够精确，我鼠标放在远处他也起来了」。
// 根因：折叠态 `.nav-menu-mobile` 是 visibility:hidden，但 vendor 给里面的
// `.nav-mobile-main-menu` 写了 `visibility: visible` —— 可见性可以被子元素压过，
// 于是胶囊下方挂着一块 178×312 的**不可见热区**，指针离胶囊 200px 也能拉起导航。
// 修法：`.nav-menu-mobile { pointer-events: none }`（整棵子树关掉命中）+ index.vue 的几何判据。
// 这条探针锁三件事：
//   ① 胶囊正下方 120px（同 x）不展开 —— 反证：删掉 pointer-events:none → 立刻红；
//   ② 胶囊左右外侧 24px 不展开；
//   ③ 胶囊内部仍能正常触发（别为了"精确"把热区做没了）。
{
  const context = await gateNewContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('J: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);

  const g = await page.locator('.unified-nav-surface').boundingBox();
  const wait = async (ms) => page.waitForTimeout(ms);
  const widthOf = () =>
    page.evaluate(() => {
      const s = document.querySelector('#unified-nav-container .unified-nav-surface');
      return +s.getBoundingClientRect().width.toFixed(1);
    });
  const reset = async () => {
    await page.mouse.move(g.x + g.width / 2, 800);
    await wait(500);
  };

  await reset();
  const baseW = await widthOf();
  // ① 正下方 120px
  await page.mouse.move(g.x + g.width / 2, g.y + g.height + 120, { steps: 2 });
  await wait(500);
  const belowW = await widthOf();
  // ② 右侧 24px（同一中线）
  await reset();
  await page.mouse.move(g.x + g.width + 24, g.y + g.height / 2, { steps: 2 });
  await wait(500);
  const rightW = await widthOf();
  // ③ 盒内空白间隙（不是几何中心：中心落点在头像上，属于直接动作目标，不会展开）
  await reset();
  await page.mouse.move(g.x + g.width * 0.25, g.y + g.height / 2, { steps: 2 });
  await wait(600);
  const insideW = await widthOf();

  /* ④ 展开态下指针移动**不再量盒子**（2026-11-16 性能契约）。
     `isPointerOnSurface` 里的 getBoundingClientRect 会强制同步布局，而 pointermove
     每秒可触发 100+ 次。曾经几何判据排在 `isExpandedLooking` 门控**之前**，
     于是「展开态什么也不做」的分支每次移动都白量一次盒子（实测 200 次事件 = 200 次）。
     这条锁的是「调用次数不随事件数线性增长」—— 允许 1~2 次（首帧建立缓存/页面自身），
     但不允许 120 次。 */
  const gbcr = await page.evaluate(async () => {
    const s = document.querySelector('#unified-nav-container .unified-nav-surface');
    const r = s.getBoundingClientRect();
    let calls = 0;
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (...a) {
      if (this === s) calls += 1;
      return orig.apply(this, a);
    };
    for (let i = 0; i < 120; i += 1) {
      s.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: r.left + 20 + ((r.width - 40) * i) / 120,
          clientY: r.top + r.height / 2,
          bubbles: true,
          pointerType: 'mouse',
        }),
      );
      if (i % 20 === 0) await new Promise((res) => requestAnimationFrame(res));
    }
    Element.prototype.getBoundingClientRect = orig;
    return { calls, width: +r.width.toFixed(0) };
  });

  report.results.J_hitzone = { baseW, belowW, rightW, insideW, box: g, move: gbcr };
  await page.screenshot({ path: `${OUT}/nav-mini-J-hitzone.png` });
  await context.close();
}

/* ---------- L. 未登录 mini 态：hover「登录」不展开 + 登录岛两半同宽 ----------
   L1 用户口径（2026-11-16）「鼠标对着 mini 态的登录两个字去的时候，优先保证他们可以
     点击到登录，其他区域则自动展开导航栏」：mini 展开时 `.nav-container` padding 12→32、
     菜单插进来，登录按钮会横向平移 ~500px ⇒ 瞄着它过去、70ms 后按钮从指针底下跑掉。
     反证：删掉 handleNavPointerEnter/Move 里的 isPointerOnDirectAction 分支 →
     胶囊会撑到 720，L1 立刻红（M 组把头像 / logo 也纳入同一判据）。
   L2 登录浮层是「导航上半岛 + 登录卡下半岛」拼成的一张岛（横屏 ≥769）。上半岛几何只写在
     `.has-login-card` 上，mini 的收起规则 `:not(.nav-expanded)`(1,3,0) 权重更高 ⇒
     曾经上半岛只有 180×44、下半岛 720 宽，两个岛根本不接（用户报障「顶部导航栏对登录的
     适配不好」）。修法是让登录也进 isExpandedLooking（与通知岛/任务岛同一条纪律）。 */
{
  const context = await gateNewContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('L: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  // ⚠️ 刻意不 injectAuth：未登录才有「登录」按钮
  await page.waitForSelector('#nav-login-btn', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);

  const geo = () =>
    page.evaluate(() => {
      const s = document.querySelector('#unified-nav-container .unified-nav-surface');
      const r = s.getBoundingClientRect();
      const card = document.querySelector('.boh-login-modal-overlay .boh-login-modal-container');
      const cr = card?.getBoundingClientRect();
      return {
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
        top: +r.top.toFixed(1),
        bottom: +r.bottom.toFixed(1),
        left: +r.left.toFixed(1),
        cls: s.className.replace('unified-nav-surface ', ''),
        card: cr
          ? {
              w: +cr.width.toFixed(1),
              top: +cr.top.toFixed(1),
              left: +cr.left.toFixed(1),
            }
          : null,
      };
    });

  const before = await geo();
  const lb = await page.locator('#nav-login-btn').boundingBox();
  // 从下方移向「登录」并停留 900ms —— 必须仍是胶囊
  await page.mouse.move(lb.x + lb.width / 2, 700);
  await page.waitForTimeout(150);
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2, { steps: 8 });
  await page.waitForTimeout(900);
  const onLogin = await geo();

  // 点它：登录浮层必须打开，且上半岛 = 720×64、与下半岛同宽相接
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const opened = await geo();

  report.results.L_login = { before, onLogin, opened };
  await page.screenshot({ path: `${OUT}/nav-mini-L-login-island.png` });
  await context.close();
}

/* ---------- P. 竖屏 390 未登录：mini 的「登录」必须与账户胶囊同型 ----------
   vendor ≤699 的 `min-height: 40px`（触屏高度）与 ≤480 的 `padding: 4px 8px /
   font-size: 10px` 叠加后宽度也收敛到 40 ⇒ 40×40 + radius 20 = 正圆；只补宽度
   又变成「40 高 + 10px 小字」的空胶囊（2026-11-24 用户两轮报障，口径「都改成
   药丸型」「这貌似不对吧」）。现按同排兄弟控件归一：58×32 / 12px，与已登录态的
   账户胶囊（.nav-user-info 实测 58×32）一致。见 style.scoped.css 的 portrait ≤699 块。
   反证：删掉那条 `.nav-login-btn` 覆盖 → 回到 40×40 正圆（vendor 的 40 触屏高度
   + ≤480 的 10px 字号 / 8px 内边距），P 组立刻红。 */
{
  const context = await gateNewContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('P: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  // 刻意不 injectAuth：未登录才有「登录」按钮
  await page.waitForSelector('#nav-login-btn', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.P_login_pill = await page.evaluate(() => {
    const b = document.querySelector('#nav-login-btn');
    const s = document.querySelector('#unified-nav-container .unified-nav-surface');
    const cont = s.querySelector('.nav-container');
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      radius: parseFloat(cs.borderTopLeftRadius),
      fontSize: cs.fontSize,
      surfaceW: +s.getBoundingClientRect().width.toFixed(1),
      overflow: cont.scrollWidth > Math.round(s.getBoundingClientRect().width) - 2,
    };
  });
  await page.screenshot({ path: `${OUT}/nav-mini-P-portrait-login.png` });
  await context.close();
}

/* ---------- M. 桌面 mini 态：头像 / logo 也是直接动作目标（2026-11-20） ----------
   登录按钮之外，logo 与头像在 180→720 的展开中间样会横向移动（约 270px）。
   用户瞄着它们移过去、70ms 后岛撑开，点击就会落空。
   反证：删掉 handleNavPointerEnter/Move 里的 isPointerOnDirectAction 分支 →
   胶囊会撑到 720，M1/M2 立刻红。 */
{
  const context = await gateNewContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('M: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);

  const widthOf = () =>
    page.evaluate(() => {
      const s = document.querySelector('#unified-nav-container .unified-nav-surface');
      return +s.getBoundingClientRect().width.toFixed(1);
    });
  const reset = async () => {
    await page.mouse.move(720, 820);
    await page.waitForTimeout(500);
  };

  await reset();
  const baseW = await widthOf();
  const avatarBox = await page.locator('.nav-avatar').boundingBox();
  await page.mouse.move(avatarBox.x + avatarBox.width / 2, avatarBox.y + avatarBox.height / 2, {
    steps: 8,
  });
  await page.waitForTimeout(900);
  const onAvatarW = await widthOf();

  await reset();
  const logoBox = await page.locator('.nav-logo').boundingBox();
  await page.mouse.move(logoBox.x + logoBox.width / 2, logoBox.y + logoBox.height / 2, {
    steps: 8,
  });
  await page.waitForTimeout(900);
  const onLogoW = await widthOf();

  report.results.M_direct_targets = { baseW, onAvatarW, onLogoW, avatarBox, logoBox };
  await page.screenshot({ path: `${OUT}/nav-mini-M-direct-targets.png` });
  await context.close();
}

/* ---------- N. 资讯页搜索岛（状态卡）在场时打开下拉（2026-11-20） ----------
   用户截图报障：`/newsroom` 的搜索岛常驻在 nav 下方，点开「探索」后菜单按 rest 高度
   开始画，而 surface 被 has-status-card 的 `!important` 高度锁在 128px ⇒ 菜单只露出
   前两项、搜索岛与菜单叠在一起。
   修法（style.scoped.css）：菜单展开期间状态卡 `display:none`，surface 高度改跟
   `--nav-submenu-h`，并带 ID + !important 压过 has-status-card。
   反证：删掉那组 height 覆盖 → surfaceH 回到 128、subBottom 超出 surfaceBottom。 */
{
  const context = await gateNewContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('N: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/newsroom`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForSelector('.global-nav-status-card.is-news-tools', {
    state: 'visible',
    timeout: 20000,
  });
  await page.waitForTimeout(700);

  const measureHybrid = () =>
    page.evaluate(() => {
      const s = document.querySelector('#unified-nav-container .unified-nav-surface');
      const r = s.getBoundingClientRect();
      const card = document.querySelector('.global-nav-status-card.is-news-tools');
      const sub = document.querySelector('.nav-submenu.active');
      const sr = sub?.getBoundingClientRect();
      return {
        surfaceH: +r.height.toFixed(1),
        surfaceBottom: +r.bottom.toFixed(1),
        cardDisplay: card ? getComputedStyle(card).display : null,
        subActive: !!sub,
        subBottom: sr ? +sr.bottom.toFixed(1) : null,
      };
    });

  const before = await measureHybrid();
  const explore = await page.evaluate(() => {
    const trigger = [...document.querySelectorAll('.nav-link-wrapper')].find(
      (el) => el.textContent.trim() === '探索',
    );
    const r = trigger.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(explore.x, explore.y);
  await page.waitForTimeout(800);
  const opened = await measureHybrid();
  await page.screenshot({ path: `${OUT}/nav-mini-N-status-island-menu.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const restored = await measureHybrid();

  report.results.N_status_hybrid = { before, opened, restored };
  await context.close();
}

await browser.close();

// ---------- 断言 ----------
const A = report.results.A_mini;
const AL = report.results.A_afterLogoTap;
const B = report.results.B_expanded;
const C = report.results.C_collapsed;
const D = report.results.D_island;
const DC = report.results.D_afterClose;
const F1 = report.results.F_afterHScroll;
const F2 = report.results.F_afterVScroll;
const G = report.results.G_landscape;
const GL = report.results.G_hover;
const GH = report.results.G_afterLeave;
const H = report.results.H_portrait_mid;
const I = report.results.I_landscape_mid;
const IH = report.results.I_hover;
const IS = report.results.I_submenu;
const J = report.results.J_hitzone;
const L = report.results.L_login;
const P = report.results.P_login_pill;
const M = report.results.M_direct_targets;
const N = report.results.N_status_hybrid;

const hasMini = (m) => /nav-mini-caps/.test(m.classes || '');
const hasExpanded = (m) => /nav-expanded/.test(m.classes || '');

report.checks = {
  // A：首帧 mini —— 机制类在、展开类不在、宽度即 mini 档、文本隐藏、三元素齐全
  A_mini_class: hasMini(A) && !hasExpanded(A),
  A_mini_width: A.surface && A.surface.w >= 162 && A.surface.w <= 174,
  A_no_overflow: A.containerScrollW && A.containerScrollW <= A.surface.w - 2,
  A_texts_hidden: A.logoTextOpacity === '0' && A.usernameOpacity === '0',
  A_anchors_alive:
    !!A.logoIcon && A.logoIcon.w > 0 && A.avatar && A.avatar.w > 0 && A.burgerRendered,
  A_logo_tap_no_expand: hasMini(AL) && !hasExpanded(AL) && AL.surface && AL.surface.w <= 174,
  // B：点汉堡一步到位 —— 长条 + 菜单 + 文本可见
  B_expanded_class: hasExpanded(B) && hasMini(B),
  B_full_width: B.surface && B.surface.w > 300,
  B_texts_shown: B.logoTextOpacity === '1' && B.usernameOpacity === '1',
  B_menu_open: B.menuActive && B.menuDisplay !== 'none',
  // C：点外部回缩
  C_collapsed_back: hasMini(C) && !hasExpanded(C) && C.surface && C.surface.w <= 174,
  C_menu_closed: !C.menuActive || C.menuDisplay === 'none',
  // D：岛强制展开 + 连体（状态卡 top 相对 surface ≈ status-top 57px）+ 菜单被收
  D_island_forced_expand: hasExpanded(D) && D.surface && D.surface.w > 300,
  D_menu_auto_closed: !D.menuActive || D.menuDisplay === 'none',
  D_island_attached:
    D.statusCardRect && D.surface && Math.abs(D.statusCardRect.top - D.surface.top - 57) <= 10,
  // 岛关闭后一起回缩（双轴：宽回 mini、高回 50）
  D_closed_back_to_mini:
    hasMini(DC) && !hasExpanded(DC) && DC.surface && DC.surface.w <= 174 && DC.surfaceH === '50px',
  // E：连发两条，岛活跃窗口内宽度轨迹最小值仍 >300（无闪断），结束回 mini
  E_no_flash_gap: report.results.E_minIslandW > 300 && report.results.E_islandSpan > 3200,
  E_back_to_mini: report.results.E_lastW <= 174,
  // F：横向滚动不误触、纵向滚动回缩
  F_hscroll_no_collapse: hasExpanded(F1) && F1.menuActive,
  F_vscroll_collapses: hasMini(F2) && !hasExpanded(F2),
  // G：桌面横屏 = 默认 mini(180×44) → hover 展开(720×50) → 移开回缩(180×44)
  //    2026-11-15：岛宽 860→720、mini 200→176、mini 高 50→44。
  G_mini_by_default: hasMini(G) && !hasExpanded(G),
  G_mini_width_180: G.surface && Math.abs(G.surface.w - 180) <= 6,
  G_mini_height_44: G.surfaceH === '44px',
  G_menu_hidden_in_mini: G.navMenuDisplay === 'none',
  G_hover_expands: hasExpanded(GL) && GL.surface && Math.abs(GL.surface.w - 720) <= 6,
  // 展开态汉堡**保留**（2026-11-15）：hover 汉堡触发展开后，它变成「钉住/收起」把手。
  // 旧契约要求 `!GL.burgerRendered`（展开后藏掉），但那样鼠标下方会突然变成空白/搜索，
  // 且没有按钮可点回去 —— 交互闭环断了。现在只断言「菜单出来了 + 汉堡仍在」。
  G_hover_menu_visible: GL.navMenuDisplay === 'flex' && GL.logoTextOpacity === '1',
  G_hover_burger_kept: GL.burgerRendered === true,
  G_collapse_after_leave:
    hasMini(GH) && !hasExpanded(GH) && GH.surface && Math.abs(GH.surface.w - 180) <= 6,
  // H：>480 竖屏 mini 档 188（内容实测 144 + 两条间隙各 8 + padding 28）
  H_mini_width_188: hasMini(H) && H.surface && H.surface.w >= 182 && H.surface.w <= 194,
  H_no_overflow: H.containerScrollW && H.containerScrollW <= H.surface.w - 2,
  // I：横屏 900 —— 700–1023 档也必须是 mini（180）+ hover 展开（720 + 视口居中）+ 下拉可用。
  //    反证：把 DESKTOP_MINI_QUERY 的 landscape 那一段删掉 → I_mini_width_180 立刻红（180→720）。
  I_mini_width_180: hasMini(I) && !hasExpanded(I) && I.surface && Math.abs(I.surface.w - 180) <= 6,
  I_hover_expands: hasExpanded(IH) && IH.surface && Math.abs(IH.surface.w - 720) <= 6,
  I_hover_centered:
    IH.surface &&
    IH.viewport &&
    Math.abs(IH.surface.left + IH.surface.w / 2 - IH.viewport.w / 2) <= 2,
  I_submenu_opens: !!IS && IS.surfaceH > 120 && IS.submenuH > 100,
  I_submenu_centered: !!IS && Math.abs(IS.center - IS.viewportCenter) <= 2,
  // J：热区 = 胶囊盒子本身。below/right 用「明显变宽」当判据（>+120 = 展开了），
  //    而不是精确等于 180 —— 收起动画尾巴上的 204 不是展开，别误判。
  J_no_expand_below: J.belowW < J.baseW + 120,
  J_no_expand_right: J.rightW < J.baseW + 120,
  J_inside_expands: J.insideW >= 700,
  // J4：展开态 120 次 pointermove 里量盒子的次数不许跟着事件数涨。
  //     反证：把 handleNavPointerMove 里 `isExpandedLooking` 门控挪回几何判据之后
  //     → calls 变成 120 → 立刻红。
  J_move_no_layout_thrash: !!J.move && J.move.calls <= 2,
  /* L1：hover「登录」不许展开（判据用「宽度没有明显变大」，不用精确 180 ——
     收起动画尾巴上的中间值不是展开）。 */
  L_login_hover_no_expand: !!L && L.onLogin.w < L.before.w + 40,
  L_login_hover_keeps_h44: !!L && Math.abs(L.onLogin.h - L.before.h) <= 2,
  // L2：点开登录后上半岛必须是 720×64 的宽岛，且与下半岛同宽
  L_login_island_upper: !!L && Math.abs(L.opened.w - 720) <= 6 && Math.abs(L.opened.h - 64) <= 2,
  L_login_island_same_width: !!L && !!L.opened.card && Math.abs(L.opened.card.w - L.opened.w) <= 2,
  /* L2b：接缝 —— 下半岛 top 比上半岛底边高 2px（两半岛重叠 2px 防止采样缝）。
     判据双向 ±2px，写死「高 2px」会被亚像素舍入打成假红。 */
  L_login_island_seam:
    !!L && !!L.opened.card && Math.abs(L.opened.card.top - (L.opened.bottom - 2)) <= 2,
  /* P：竖屏未登录的「登录」= 与已登录态账户胶囊同型 —— 58×32（±2）、12px、
     圆角吃满半高（药丸而非正圆），mini 胶囊内容不许溢出。 */
  P_login_is_pill: !!P && P.w - P.h >= 8 && P.radius >= P.h / 2 - 1,
  P_login_matches_account:
    !!P && Math.abs(P.h - 32) <= 2 && P.w >= 54 && P.w <= 62 && P.fontSize === '12px',
  P_mini_no_overflow: !!P && !P.overflow,
  /* M：头像 / logo 与登录同属「直接动作目标」—— hover 停留不许把胶囊撑开，
     否则目标会在点击前横向移走。判据与 L1 同一口径（宽度没有明显变大）。 */
  M_avatar_hover_no_expand: !!M && M.onAvatarW < M.baseW + 40,
  M_logo_hover_no_expand: !!M && M.onLogoW < M.baseW + 40,
  /* N：资讯页搜索岛在场时打开下拉 —— 卡片让位、surface 按菜单长高、菜单不被裁；
     关菜单后搜索岛原样回来。 */
  N_status_island_present: !!N && N.before.cardDisplay !== 'none',
  N_status_yields_menu: !!N && N.opened.subActive && N.opened.cardDisplay === 'none',
  N_surface_grows_for_menu: !!N && N.opened.surfaceH > 200,
  N_menu_not_clipped: !!N && N.opened.subActive && N.opened.subBottom <= N.opened.surfaceBottom + 2,
  N_status_restored: !!N && !N.restored.subActive && N.restored.cardDisplay !== 'none',
};

report.pass = Object.values(report.checks).every(Boolean) && report.pageErrors.length === 0;

fs.writeFileSync(`${OUT}/nav-mini-report.json`, JSON.stringify(report, null, 2));
const failed = Object.entries(report.checks).filter(([, v]) => !v);
console.log(`checks: ${Object.keys(report.checks).length}, failed: ${failed.length}`);
failed.forEach(([k]) => console.log('  FAIL ' + k));
if (report.pageErrors.length) console.log('pageErrors:', report.pageErrors.slice(0, 5));
console.log(JSON.stringify(report.results, null, 2));
process.exit(report.pass ? 0 : 1);
