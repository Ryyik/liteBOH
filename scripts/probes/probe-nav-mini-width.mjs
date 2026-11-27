import { chromium } from 'playwright';

// 量 mini 胶囊的「固有内容宽」→ 反推合适的 --nav-mini-width（内容 + 两侧各 ~8px 余量）
const BASE = 'http://[::1]:5173';
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
  const s = document.querySelector('.unified-nav-surface');
  const c = s.querySelector('.nav-container');
  const cs = getComputedStyle(c);
  const surfRect = s.getBoundingClientRect();
  // 固有内容宽：把所有 shrink 影响去掉、临时放开 max-width 再量容器内容
  const prevMax = s.style.maxWidth;
  s.style.maxWidth = '2000px';
  const intrinsicContainer = c.getBoundingClientRect().width;
  const scrollW = c.scrollWidth;
  s.style.maxWidth = prevMax;
  const items = ['.nav-logo', '.nav-user-info', '#nav-hamburger'].map((sel) => {
    const el = c.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return { sel, w: Math.round(r.width), marginL: st.marginLeft, marginR: st.marginRight };
  });
  return {
    vw: window.innerWidth,
    currentMiniW: Math.round(surfRect.width),
    padding: `${cs.paddingLeft} ${cs.paddingRight}`,
    border: cs.borderLeftWidth,
    intrinsicContainerW: Math.round(intrinsicContainer),
    intrinsicScrollW: scrollW,
    intrinsicContentW: Math.round(
      intrinsicContainer - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    ),
    items,
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

for (const w of [320, 390, 480, 600, 768]) {
  const ctx = await gateNewContext({ viewport: { width: w, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(MEASURE);
  console.log(JSON.stringify(m));
  await ctx.close();
}
await browser.close();
