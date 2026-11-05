/**
 * probe-cloud-keepalive.mjs — 底栏「图库」跨非缓存页往返后，实例还活着吗？
 *
 * 为什么需要这条探针（2026-11-05 用户报障「底部导航栏切换到图库还是会整页重载」）：
 * 路由级缓存（App.vue 的 <KeepAlive :include>）只对**白名单**里的页面生效。白名单由
 * 路由表的 `meta.keepAliveName` 生成、组件侧 `defineOptions({ name })` 必须逐字对上，
 * 两处不一致时**不报错**，只表现成「每次进图库都是全新页面」（骨架 + 全量取数 + 回顶）。
 * 这种「静默不缓存」单测只能守名字，守不住「实际有没有复用一个实例」，所以这里做端到端观测。
 *
 * 五组断言（前四组是主结论，最后一组是反证，防止「什么都缓存」这种假绿）：
 *   A 我 → 图库 → 我 → 图库        两席相邻，来回切必须复用同一个图库实例，且回来 0 数据请求
 *   B 图库 → 内容(首页) → 图库      **本次报障的路径**：首页不缓存，但路过它不许带走图库的缓存
 *   C 图库 → 周边(/shop) → 图库     同上，另一个非缓存落点
 *   D 反证：首页离开再回来必须**重建**（非缓存页被缓存了同样是 bug：开场画/取数全不跑）
 *   E 反证：/user-space?tab=posts → ?tab=messages 复用（缓存页 :key 用 name，同页换 query 不重建）
 *
 * 判据用「DOM 节点上的埋点标记」而不是类名是否存在：类名在重建后照样在，标记不会——
 * 这正是「加了 class 但看不出选中」那类假绿的同一类坑。
 *
 * 用法：
 *   npx vite preview --outDir dist --port 4180 --strictPort
 *   node scripts/probes/probe-cloud-keepalive.mjs http://[::1]:4180
 *
 * ⚠️ 探针用 pinia 注入伪造登录态（与 probe-userspace-pages 同一套），所以 Supabase 请求
 * 会 401 —— 那是预期噪音，探针只数**请求条数**，不看结果。首屏 gate 用键盘下拉解锁，
 * 否则首页的底栏根本不出现（点不到「图库」）。
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';

const violations = [];
const rows = [];

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

/* ── 观测：数据请求计数（只数 Supabase REST，静态资源不算）── */
let dataRequests = 0;
page.on('request', (req) => {
  if (/supabase\.co\/rest\/v1/.test(req.url())) dataRequests += 1;
});
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 200)));

const resetRequests = () => {
  dataRequests = 0;
};

const injectLogin = () =>
  page.evaluate(() => {
    try {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      auth.isInitialized = true;
      Object.assign(auth.userInfo, {
        id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
        username: 'probe_user',
        role: 'user',
        points: 42,
      });
      return true;
    } catch {
      return false;
    }
  });

const gotoHash = async (hash, settle = 1500) => {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(settle);
};

const clickBottomNav = async (label, settle = 1400) => {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('.bottom-nav-glass .nav-item')].find((el) =>
      (el.textContent || '').includes(text),
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);
  await page.waitForTimeout(settle);
  return clicked;
};

/**
 * 给「当前页主内容根节点」打一个标记，稍后用标记是否还在判断实例有没有被复用。
 * 选择器按页面类型给，不用「#app 里面积最大的块」——那玩意在壳层组件上见过假阳性。
 */
const ROOTS = {
  cloud: '.cloud-page',
  userspace: '.user-space-page',
  home: '.home-page, .forum-page',
};

const markRoot = async (key) => {
  const tag = `${key}-${Date.now()}`;
  const ok = await page.evaluate(
    ({ selector, tagValue }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.dataset.probeMark = tagValue;
      return true;
    },
    { selector: ROOTS[key], tagValue: tag },
  );
  return ok ? tag : '';
};

const readMark = (key) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el?.dataset?.probeMark || '';
  }, ROOTS[key]);

const hasBottomNav = () =>
  page.evaluate(() => document.querySelectorAll('.bottom-nav-glass').length > 0);

const record = (name, extra = {}) => {
  rows.push({ name, ...extra });
};

/* ── 起手：进首页、伪造登录、解锁开场画 gate（否则首页没有底栏可点）── */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await injectLogin();
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
});
await page.waitForTimeout(2800);

if (!(await hasBottomNav())) {
  violations.push('首页解锁开场画后仍没有底栏 —— 后续点击全部无效，探针结果不可用');
}

/* ══════════════ A. 我 → 图库 → 我 → 图库 ══════════════ */
await gotoHash('#/user-space?tab=posts', 1800);
resetRequests();
await clickBottomNav('图库');
const cloudFirstMark = await markRoot('cloud');
record('A1 我→图库（首次）', { mark: Boolean(cloudFirstMark), requests: dataRequests });

resetRequests();
await clickBottomNav('我');
// ⚠️ 计数窗口只包「回图库」这一拍：中间那一页自己会取数（首页一次 8–10 条），
// 把它算进来就永远非 0，断言会变成测「中间页要不要取数」。
resetRequests();
await clickBottomNav('图库');
const cloudAfterUserspace = await readMark('cloud');
record('A2 我→图库（回访）', {
  reused: cloudAfterUserspace === cloudFirstMark,
  requests: dataRequests,
});
if (!cloudFirstMark) violations.push('A1：图库页根节点 (.cloud-page) 没出现，后续复用判定不可用');
else if (cloudAfterUserspace !== cloudFirstMark) {
  violations.push('A2：「我 ↔ 图库」回访时图库实例被重建（keepAlive 失效）');
}
if (dataRequests > 0) {
  violations.push(`A2：回访图库又发了 ${dataRequests} 条数据请求（缓存实例不该重新取数）`);
}

/* ══════════════ B. 图库 → 内容(首页) → 图库 —— 本次报障路径 ══════════════ */
const cloudMarkForHome = await markRoot('cloud');
resetRequests();
await clickBottomNav('内容', 1800);
resetRequests();
await clickBottomNav('图库');
const cloudAfterHome = await readMark('cloud');
record('B 图库→内容→图库', {
  reused: cloudAfterHome === cloudMarkForHome,
  requests: dataRequests,
});
if (cloudAfterHome !== cloudMarkForHome) {
  violations.push(
    'B：经过首页后图库实例被重建 —— KeepAlive 容器随非缓存路由销毁了（本次报障的根因）',
  );
}
if (dataRequests > 0) {
  violations.push(`B：经过首页回图库时又发了 ${dataRequests} 条数据请求`);
}

/* ══════════════ C. 图库 → 周边 → 图库 ══════════════ */
const cloudMarkForShop = await markRoot('cloud');
resetRequests();
await clickBottomNav('周边', 1800);
resetRequests();
await clickBottomNav('图库');
const cloudAfterShop = await readMark('cloud');
record('C 图库→周边→图库', {
  reused: cloudAfterShop === cloudMarkForShop,
  requests: dataRequests,
});
if (cloudAfterShop !== cloudMarkForShop) {
  violations.push('C：经过周边(/shop)后图库实例被重建');
}
if (dataRequests > 0) {
  violations.push(`C：经过周边回图库时又发了 ${dataRequests} 条数据请求`);
}

/* ══════════════ D. 反证：首页必须**不**缓存 ══════════════ */
await clickBottomNav('内容', 1800);
const homeMark = await markRoot('home');
resetRequests();
await clickBottomNav('图库');
await clickBottomNav('内容', 1800);
const homeAfter = await readMark('home');
record('D 内容→图库→内容（反证）', {
  rebuilt: homeAfter !== homeMark,
  requests: dataRequests,
});
if (!homeMark) violations.push('D：首页根节点没找到，反证不可用');
else if (homeAfter === homeMark) {
  violations.push(
    'D：首页被缓存了 —— 非白名单页面不该复用实例（开场画、取数、滚动都会停在旧状态）',
  );
}

/* ══════════════ E. 反证：同路由换 tab 不重建「我」 ══════════════ */
await gotoHash('#/user-space?tab=posts', 1600);
const userspaceMark = await markRoot('userspace');
resetRequests();
await page.evaluate(() => {
  window.location.hash = '/user-space?tab=messages';
});
await page.waitForTimeout(1400);
const userspaceAfterTab = await readMark('userspace');
record('E ?tab=posts→?tab=messages（反证）', {
  reused: userspaceAfterTab === userspaceMark,
  requests: dataRequests,
});
if (!userspaceMark) violations.push('E：「我」页根节点没找到，反证不可用');
else if (userspaceAfterTab !== userspaceMark) {
  violations.push(
    'E：同路由换 ?tab 把「我」整棵重建了 —— 缓存页的 :key 必须用 route.name，不能用 path',
  );
}

const realErrors = pageErrors.filter((e) => !/ResizeObserver|AbortError/i.test(e));
if (realErrors.length) violations.push(`页面抛错：${realErrors[0]}`);

await browser.close();

/* ── 汇总 ── */
console.log('\n场景                                 复用/重建   数据请求');
console.log('------------------------------------------------------------');
for (const row of rows) {
  let verdict = '—';
  if (row.rebuilt !== undefined) verdict = row.rebuilt ? '重建 ✓' : '未重建 ✗';
  else if (row.reused !== undefined) verdict = row.reused ? '复用 ✓' : '重建 ✗';
  console.log(`${row.name.padEnd(34, ' ')} ${verdict.padEnd(10, ' ')} ${row.requests ?? ''}`);
}

if (violations.length) {
  console.error(`\n✗ probe-cloud-keepalive：${violations.length} 处不符`);
  for (const message of violations) console.error(`  · ${message}`);
  process.exit(1);
}

console.log(
  '\n✓ probe-cloud-keepalive：图库在「我 / 内容 / 周边」三种来路上都复用同一实例；' +
    '首页与另一条非缓存页按预期重建。',
);
