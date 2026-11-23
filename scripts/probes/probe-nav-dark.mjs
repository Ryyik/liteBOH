import { chromium } from 'playwright';

// 探针：暗色模式下导航栏 logo/链接文字颜色（vendor 无暗色规则的修复验证）
// 断言：data-theme=dark 下 .nav-logo / .nav-menu a / .nav-link-wrapper 计算色为 #f5f5f7，
// 覆盖带 body.page-* 黑字规则的页面（home/newsroom）与普通页面（lotteries）。
const BASE = 'http://localhost:5173';
const PAGES = [
  { path: '/#/', name: 'home', bodyClass: 'page-home' },
  { path: '/#/newsroom', name: 'newsroom', bodyClass: 'page-newsroom' },
  { path: '/#/lotteries', name: 'lotteries', bodyClass: '' },
  { path: '/#/user-space', name: 'user-space', bodyClass: '' },
];
const EXPECT = 'rgb(245, 245, 247)';
// 历史污染色：博莱克岛绿色（已修）+ BirthdayHero 粉色（已修），容器不得再被塞色
const BANNED = ['rgb(110, 231, 183)', 'rgb(255, 155, 179)'];

const browser = await chromium.launch({ channel: 'chrome' });

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

const context = await gateNewContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

let allPass = true;
for (const p of PAGES) {
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 20000,
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('unified-nav-container')?.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).color : 'MISSING';
    };
    const pickBg = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : 'MISSING';
    };
    const surface = document.querySelector('.unified-nav-surface');
    const container = document.getElementById('unified-nav-container');
    return {
      bodyClass: document.body.className,
      surfaceBg: surface ? getComputedStyle(surface).backgroundColor : 'MISSING',
      containerColor: container ? getComputedStyle(container).color : 'MISSING',
      logo: pick('.nav-logo'),
      menuA: pick('.nav-menu a'),
      linkWrapper: pick('.nav-link-wrapper'),
      username: pick('.nav-username'),
      hamburgerBg: pickBg('.nav-hamburger span'),
    };
  });

  const ok =
    r.logo === EXPECT &&
    r.menuA === EXPECT &&
    r.linkWrapper === EXPECT &&
    r.username === EXPECT &&
    r.hamburgerBg === EXPECT &&
    !BANNED.includes(r.containerColor);
  allPass = allPass && ok;
  console.log(
    `[${p.name}] ${ok ? 'PASS' : 'FAIL'} body="${r.bodyClass}" surface=${r.surfaceBg} logo=${r.logo} menuA=${r.menuA} wrapper=${r.linkWrapper} username=${r.username} hamburgerBg=${r.hamburgerBg} containerColor=${r.containerColor}`,
  );
  await page.screenshot({ path: `debug-screenshots/nav-dark-${p.name}.png` });

  // 还原浅色，避免影响下一页（SPA 内 body class 由路由接管，这里手动还原）
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('unified-nav-container')?.removeAttribute('data-theme');
  });
}

await browser.close();
console.log(`[pageerrors] ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(allPass && errors.length === 0 ? 'ALL PASS' : 'HAS FAILURE');
process.exit(allPass && errors.length === 0 ? 0 : 1);
