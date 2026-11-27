import { chromium } from 'playwright';

// =====================================================================
// 探针：竖屏 mini 胶囊的「视觉居中」回归护栏
//   用户反馈过截图里看起来偏左 → 定位到两个独立问题：
//     ① 外壳/内容外框是否真的居中（几何居中）
//     ② 头像圆心是否偏离胶囊中心（视觉重心）
//   断言：
//     A 每档：外壳左右边距相等、中心 = 视口中心、内容外框中心 = 视口中心
//     B 每档：头像圆心相对胶囊中心的偏移 ≥ -6（修前 390 档 -9 / >480 档 -10；
//       根因是 vendor 给 .nav-user-info 钉了 gap:8px（带 important），
//       用户名收起后仍占位 → 已用 .nav-username 的负 margin 抵消）
//     C 岛态（满宽）：内容外框仍居中、用户名恢复显示（负 margin 不污染展开态）
//   反证：删掉 .nav-username 的 margin-left:-8px → B 组必红（偏移回到 -9/-10）。
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
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

const MEASURE = () => {
  const $ = (s) => document.querySelector(s);
  const s = $('.unified-nav-surface');
  const sb = s.getBoundingClientRect();
  const cx = (sb.left + sb.right) / 2;
  const logo = $('.nav-logo');
  const burger = $('#nav-hamburger');
  const avatar = $('.nav-avatar');
  const username = $('.nav-username');
  const rect = (el) => (el ? el.getBoundingClientRect() : null);
  const mid = (el) => {
    const b = rect(el);
    return b ? (b.left + b.right) / 2 : null;
  };
  const opticalL = rect(logo) ? rect(logo).left : null;
  const opticalR = rect(burger) ? rect(burger).right : null;
  return {
    vw: window.innerWidth,
    classes: s.className,
    leftMargin: +sb.left.toFixed(2),
    rightMargin: +(window.innerWidth - sb.right).toFixed(2),
    surfaceCxVsVp: +(cx - window.innerWidth / 2).toFixed(2),
    opticalMidVsVp:
      opticalL !== null && opticalR !== null
        ? +((opticalL + opticalR) / 2 - window.innerWidth / 2).toFixed(2)
        : null,
    avatarOffset: mid(avatar) !== null ? +(mid(avatar) - cx).toFixed(2) : null,
    logoOffset: mid(logo) !== null ? +(mid(logo) - cx).toFixed(2) : null,
    burgerOffset: mid(burger) !== null ? +(mid(burger) - cx).toFixed(2) : null,
    usernameW: rect(username) ? +rect(username).width.toFixed(1) : null,
  };
};

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
  });
  return ctx;
};

// ---------- A/B：各竖屏档的几何居中 + 头像偏移 ----------
// 竖屏档位。⚠️ 末档原为 768x1000：2026-10-30 起 mini 边界从 768 收到 699
// （iPad mini 744 起走完整导航，见 unified-nav.css 的同名注释），而本探针没跟着改 ⇒
// 768 那一档的 A/B 断言从那天起一直红着（768 不是 mini，汉堡 display:none ⇒ 右参考点 rect 全 0，
// Δ 恒为负）。这不是代码回归，是**探针的用例过期**；改成 699 才是真正的边界档。
const miniCases = [
  [360, 780],
  [390, 844],
  [430, 932],
  [500, 1035],
  [600, 900],
  [699, 844],
];
for (const [w, h] of miniCases) {
  const ctx = await gateNewContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { timeout: 20000 });
  await page.waitForTimeout(1100);
  const m = await page.evaluate(MEASURE);
  const tag = `${w}x${h}`;
  check(
    `A ${tag} 外壳居中（左右边距相等 + Δ中心=0）`,
    m.leftMargin === m.rightMargin && m.surfaceCxVsVp === 0,
    `L/R=${m.leftMargin}/${m.rightMargin} Δ=${m.surfaceCxVsVp}`,
  );
  check(`A ${tag} 内容外框居中`, m.opticalMidVsVp === 0, `Δ=${m.opticalMidVsVp}`);
  check(
    `B ${tag} 头像圆心偏移 ≥ -6`,
    m.avatarOffset !== null && m.avatarOffset >= -6 && m.avatarOffset <= 0,
    `头像=${m.avatarOffset} logo=${m.logoOffset} 汉堡=${m.burgerOffset}`,
  );
  await ctx.close();
}

// ---------- C：岛态（满宽）不被负 margin 污染 ----------
{
  const ctx = await gateNewContext({ viewport: { width: 500, height: 1035 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('boh_global_nav_status', {
        detail: { title: '视觉重心探针', message: '', icon: 'success', durationMs: 6000 },
      }),
    ),
  );
  await page.waitForTimeout(1100);
  const m = await page.evaluate(MEASURE);
  check(
    'C 岛态满宽：内容外框仍居中',
    /has-status-card/.test(m.classes) && m.opticalMidVsVp === 0,
    `cls=${m.classes.trim()} Δ=${m.opticalMidVsVp}`,
  );
  check(
    'C 岛态用户名恢复显示（负 margin 只在 mini 态生效）',
    m.usernameW !== null && m.usernameW > 20,
    `usernameW=${m.usernameW}`,
  );
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\nchecks: ${results.length}, failed: ${failed.length}`);
failed.forEach((r) => console.log('  FAIL ' + r.name));
process.exit(failed.length ? 1 : 0);
