/**
 * probe-userspace-pages.mjs — UserSpace **全页面**切换审计（逐页，不抽样）
 *
 * 「用户空间来回切要像 App」这件事，只有把**每一页**都量一遍才站得住：
 * 抽样两三个分区会漏掉 `v-if` 销毁、面板重建、重复取数这些只在特定页出现的问题。
 *
 * 覆盖范围：
 *   A 分区入口：左栏 5 个 tab 的首次进入 + 切回
 *   B 分区内档位：SegmentTabs 的每一档（社区 6 档 / 内容 2 档 / 消息 2 档）
 *   C 独立子路由：/user-space/* 下的 9 个页面 + 设置内部档位（?view=）
 *
 * 每页记录 4 件事，分别对应一类「慢」：
 *   ① 点击 → 目标内容可见 的耗时（感知延迟）
 *   ② 期间发起的数据请求条数与端点分布（是否重复取数）
 *   ③ 长任务数量（>50ms 会掉帧）
 *   ④ 二次进入时页面根节点是否仍是同一实例（重建 = 状态丢失 + 重新取数）
 *
 * ⚠️ 两个已踩过的坑，改本文件前务必先读：
 *   1) **登录守卫会拦导航且不改 hash**（requiresLogin 未过 → 弹登录岛 + next(false)）。
 *      伪造登录必须**每次测量前幂等补打**：auth store 有 2 分钟会话心跳，
 *      无真实 session 时会把 isLoggedIn 打回 false。若测量窗口内掉登录态，
 *      页面签名会变成 `boh-login-modal-overlay` —— 看着像「切换成功」，其实测的是弹窗。
 *      本探针用 authLost 标记 + 丢弃重测来防这个假阳性。
 *   2) **`.community-forum-host` 是 `display:contents`**（自身体积 0×0），
 *      拿它做「内容可见」判据会永远超时。判据要落在**真正产生盒子的根元素**上
 *      （forum-page / profile-home-shell / x-notifications-container …）。
 *
 * 用法：
 *   npx vite preview --outDir dist-check --port 4180 --strictPort
 *   node scripts/probes/probe-userspace-pages.mjs http://[::1]:4180 [outDir] [--slow]
 *
 *   加 --slow 用 CDP 限速（1.2Mbps / 150ms RTT）。本地回环太快，请求条数的差异在耗时上看不出来；
 *   限速后才看得出「返回时打 142 个请求」和「打 13 个请求」在用户感知上的区别。
 *   只想快速复测往返那一段：ONLY=roundtrip node scripts/probes/probe-userspace-pages.mjs … --slow
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://[::1]:4180';
const OUT = process.argv[3] || '/tmp';
const SLOW = process.argv.includes('--slow');
const ONLY = process.env.ONLY || '';
mkdirSync(OUT, { recursive: true });

// ---------- 页面清单 ----------

/** A. 分区入口 */
const TAB_ENTRIES = [
  { id: 'community', label: '社区', host: '.tab-page.community-shell' },
  { id: 'posts', label: '我的', host: '.tab-page.content-shell' },
  { id: 'assets', label: '资产', host: '.tab-page.assets-shell' },
  { id: 'messages', label: '消息', host: '.tab-page.messages-tab' },
  { id: 'settings', label: '设置', host: '.tab-page.settings-shell' },
];

/** B. 分区内档位：pred 用**产生盒子的根元素**，不用 display:contents 宿主 */
const SEGMENT_PAGES = [
  { tab: 'community', seg: '最新', pred: '.community-forum-host > .forum-page' },
  { tab: 'community', seg: '关注', pred: '.community-forum-host > .forum-page' },
  { tab: 'community', seg: '新闻', pred: '.community-forum-host > .forum-page' },
  { tab: 'community', seg: '活动', pred: '.community-forum-host > .forum-page' },
  { tab: 'community', seg: '成员', pred: '.community-page-grid' },
  { tab: 'community', seg: '印象', pred: '.community-list-content .profile-subpage-shell' },
  { tab: 'posts', seg: '空间', pred: '.content-home-host .profile-home-shell' },
  { tab: 'posts', seg: 'Cloud+', pred: '.content-cloud-host .cloud-page' },
  { tab: 'messages', seg: '消息', pred: '.messages-host .x-notifications-container' },
  { tab: 'messages', seg: 'BOH AI', pred: '.ai-host .bohai-page' },
];

/** C. 独立子路由 + 设置内部档位
 *  设置三档与「我的」**同路由**（只改 query），所以「主内容块类名变化」这个判据对它们无效
 *  （三次都是 `user-space-page`）——改用页头标题文字做判据，否则会误报超时。 */
const SUB_ROUTES = [
  { id: '设置·资料编辑', hash: '/user-space?tab=settings&view=edit-profile', guarded: false, pred: '.settings-shell .profile-edit-page-shell' },
  { id: '设置·数据导出', hash: '/user-space?tab=settings&view=data-export', guarded: false, predText: '导出我的数据' },
  { id: '设置·数据与隐私', hash: '/user-space?tab=settings&view=data-management', guarded: false, predText: '数据与隐私' },
  { id: '订阅方案', hash: '/user-space/subscriptions', guarded: false },
  { id: '礼物/地址', hash: '/user-space/gifts', guarded: true },
  { id: '合作伙伴', hash: '/user-space/partners', guarded: true },
  { id: '账号安全', hash: '/user-space/account-security', guarded: true },
  { id: 'BOH 云盘', hash: '/user-space/note', guarded: true },
  { id: '共享记忆', hash: '/user-space/shared-memories', guarded: true },
  { id: '标签与印象', hash: '/user-space/tags-impressions', guarded: true },
  { id: 'PushPlus 设置', hash: '/user-space/pushplus-settings', guarded: true },
  { id: '版本/预览', hash: '/user-space/settings/version', guarded: true },
];

const HOME_HASH = '/user-space?tab=posts';
const ROUTE_HOME = '/user-space?tab=community';

// ---------- 工具 ----------

const endpointOf = (rawUrl) => {
  try {
    const u = new URL(rawUrl);
    const p = u.pathname;
    if (p.startsWith('/rest/v1/rpc/')) return `rpc:${p.slice('/rest/v1/rpc/'.length)}`;
    if (p.startsWith('/rest/v1/')) return `tbl:${p.slice('/rest/v1/'.length)}`;
    if (p.startsWith('/functions/v1/')) return `fn:${p.slice('/functions/v1/'.length)}`;
    if (p.startsWith('/auth/v1/')) return `auth:${p.slice('/auth/v1/'.length)}`;
    if (p.startsWith('/storage/v1/')) return 'storage';
    if (u.hostname.includes('cloudinary')) return 'img:cloudinary';
    return `${u.hostname}${p.slice(0, 34)}`;
  } catch {
    return rawUrl.slice(0, 50);
  }
};

const isDataRequest = (url) =>
  !/\/static\//.test(url) && !/\.(js|css|webp|png|jpg|jpeg|svg|woff2?)(\?|$)/.test(url);

const SHELL_CLASSES = ['unified-nav', 'footer-pages', 'ai-edge-trigger', 'boh-boot', 'boh-boot-body'];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const ROWS = { tabs: [], segs: [], routes: [], roundTrips: [] };
const violations = [];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  if (SLOW) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.2 * 1024 * 1024) / 8,
      uploadThroughput: (600 * 1024) / 8,
    });
  }

  await page.addInitScript((shellClasses) => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration));
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* 不支持则跳过 */ }

    /** 主内容块 = #app 下面积最大且非壳层的子元素 */
    window.__bohMainBlock = () => {
      const blocks = [...(document.querySelector('#app')?.children || [])]
        .filter((el) => !shellClasses.some((c) => el.classList.contains(c)))
        .map((el) => {
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            cls: String(el.className).split(' ')[0] || '(无类)',
            area: Math.round(rect.width * rect.height),
            opacity: cs.opacity,
            visibility: cs.visibility,
            display: cs.display,
          };
        })
        .filter((b) => b.area > 2000 && b.display !== 'none');
      blocks.sort((a, b) => b.area - a.area);
      return { count: blocks.length, main: blocks[0] || null };
    };

    /** 元素是否真的可见：自身与祖先链都不能 display:none / visibility:hidden，且自身有盒子 */
    window.__vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      let node = el;
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        node = node.parentElement;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
  }, SHELL_CLASSES);

  const mainSig = () => page.evaluate(() => window.__bohMainBlock()?.main?.cls ?? null);
  const mainBlock = () => page.evaluate(() => window.__bohMainBlock());
  const vis = (sel) => page.evaluate((s) => window.__vis(s), sel);

  // ---- 登录态 ----
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
  const loggedIn = () =>
    page.evaluate(() => {
      try {
        return !!document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
          ?.auth?.isLoggedIn;
      } catch {
        return false;
      }
    });
  const ensureLogin = async () => {
    if (await loggedIn()) return true;
    await injectLogin();
    await page.waitForTimeout(120);
    return loggedIn();
  };

  // ---- 观测 ----
  let reqBucket = [];
  // 在途请求集合：用来测「数据真正就位」的时刻。
  // ⚠️ 别只看 DOM 出现时间：返回 UserSpace 时壳是**同步**挂上来的（chunk 已缓存），
  // DOM 判定永远十几毫秒；用户感知到的「卡一下」等的是这些数据请求落定。
  const inflight = new Set();
  let lastQuiet = Date.now();
  page.on('request', (req) => {
    if (!isDataRequest(req.url())) return;
    reqBucket.push(endpointOf(req.url()));
    inflight.add(req);
    lastQuiet = Date.now();
  });
  const onDone = (req) => {
    if (!inflight.has(req)) return;
    inflight.delete(req);
    lastQuiet = Date.now();
  };
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  const waitQuiet = async (quietMs = 500, timeoutMs = 25000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (inflight.size === 0 && Date.now() - lastQuiet >= quietMs) return Date.now();
      await page.waitForTimeout(40);
    }
    return Date.now();
  };
  let consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));
  const ltCount = () => page.evaluate(() => (window.__longTasks || []).length);

  /** 执行 act() → 等 pred() 为真 → 统计期间开销 */
  const measure = async (act, pred, opts = {}) => {
    const { settle = 420, timeoutMs = 9000 } = opts;
    reqBucket = [];
    consoleErrors = [];
    const ltBefore = await ltCount();
    const t0 = Date.now();
    await act();
    let at = null;
    const deadline = t0 + timeoutMs;
    while (Date.now() < deadline) {
      if (await pred()) { at = Date.now() - t0; break; }
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(settle);
    // 「数据就位」时刻（仅往返那一段需要，限速下才有区分度）
    let settleMs = null;
    if (opts.waitQuiet) settleMs = (await waitQuiet(500)) - t0;
    const ltAfter = await ltCount();
    const byEndpoint = {};
    for (const e of reqBucket) byEndpoint[e] = (byEndpoint[e] || 0) + 1;
    return {
      ms: at,
      timeout: at === null,
      dataRequests: reqBucket.length,
      byEndpoint,
      settleMs,
      longTasks: ltAfter - ltBefore,
      authLost: !(await loggedIn()),
      mainCls: await mainSig(),
      errors: consoleErrors.filter((e) => !/CORS|ERR_FAILED|Failed to load resource|favicon/i.test(e)),
    };
  };

  /** 带登录保障 + 一次重测（会话心跳可能在窗口内打回登录态） */
  const measureGuarded = async (act, pred, opts) => {
    await ensureLogin();
    let r = await measure(act, pred, opts);
    if (r.authLost) {
      await injectLogin();
      await page.waitForTimeout(150);
      r = await measure(act, pred, opts);
      r.retried = true;
    }
    return r;
  };

  const clickTab = (tab) =>
    page.evaluate((t) => {
      const el = document.querySelector(`.userspace-rail [data-tab="${t}"], .userspace-bottom-nav [data-tab="${t}"]`);
      if (!el) return false;
      el.click();
      return true;
    }, tab);

  /** 只在**当前活跃的** tab-page 内找档位按钮，避免点到 v-show 隐藏壳里的同名档 */
  const clickSeg = (tabSel, label) =>
    page.evaluate(
      ({ host, txt }) => {
        const hostEl = document.querySelector(host);
        if (!hostEl) return false;
        const el = [...hostEl.querySelectorAll('.segment-tab')].find((b) => b.textContent.trim() === txt);
        if (!el) return false;
        el.click();
        return true;
      },
      { host: `.tab-page.${tabSel}`, txt: label },
    );

  const gotoHash = (hash) => page.evaluate((h) => { window.location.hash = `#${h}`; }, hash);

  // ---------- 冷启 ----------
  const t0 = Date.now();
  await page.goto(`${BASE}/#/user-space`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 }).catch(() => {});
  const shellReadyMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  await injectLogin();
  await page.waitForTimeout(2500);
  const shell = await page.evaluate(() => ({
    hasShell: !!document.querySelector('.user-space-page'),
    rail: document.querySelectorAll('.userspace-rail-item[data-tab]').length,
    bottom: document.querySelectorAll('.userspace-bottom-nav [data-tab]').length,
    hash: location.hash,
  }));
  console.log(`[us-pages] 壳就绪 ${shellReadyMs}ms；user-space-page=${shell.hasShell}；左栏 ${shell.rail} 项 / 底栏 ${shell.bottom} 项；登录态=${await loggedIn()}`);

  // ---------- A. 分区入口 ----------
  // ONLY=roundtrip 时跳过 A/B/C/C-2，只跑 C-3：限速下复测往返要快得多
  if (ONLY !== 'roundtrip') {
  console.log('\n######## A. 分区入口 ########');
  for (const t of TAB_ENTRIES) {
    if (await vis(t.host)) {
      ROWS.tabs.push({ ...t, phase: '起点', ms: null, dataRequests: 0, byEndpoint: {}, longTasks: 0, errors: [] });
      continue;
    }
    const r = await measureGuarded(() => clickTab(t.id), () => vis(t.host), { settle: 450 });
    ROWS.tabs.push({ ...t, phase: '首次', ...r });
    if (r.timeout) violations.push(`分区「${t.label}」点击后容器未可见（超时），主内容=${r.mainCls}`);
    if (r.authLost) violations.push(`分区「${t.label}」测量窗口内掉登录态，数字不可用`);
    await page.waitForTimeout(220);
  }
  for (const t of TAB_ENTRIES) {
    const other = TAB_ENTRIES.find((x) => x.id !== t.id);
    await clickTab(other.id);
    await page.waitForTimeout(520);
    const r = await measureGuarded(() => clickTab(t.id), () => vis(t.host), { settle: 450 });
    ROWS.tabs.push({ ...t, phase: '切回', ...r });
    await page.waitForTimeout(220);
  }

  // ---------- B. 分区内档位 ----------
  console.log('\n######## B. 分区内档位 ########');
  const TAB_SHELL = { community: 'community-shell', posts: 'content-shell', messages: 'messages-tab' };
  for (const s of SEGMENT_PAGES) {
    await clickTab(s.tab);
    await page.waitForTimeout(560);
    const other = SEGMENT_PAGES.find((x) => x.tab === s.tab && x.seg !== s.seg);
    if (other) {
      await clickSeg(TAB_SHELL[s.tab], other.seg);
      await page.waitForTimeout(460);
    }
    const r = await measureGuarded(
      () => clickSeg(TAB_SHELL[s.tab], s.seg),
      () => vis(s.pred),
      { settle: 420 },
    );
    ROWS.segs.push({ ...s, ...r });
    if (r.timeout) violations.push(`档位「${s.tab}/${s.seg}」点击后内容未可见（超时），主内容=${r.mainCls}`);
    if (r.authLost) violations.push(`档位「${s.tab}/${s.seg}」测量窗口内掉登录态`);
    await page.waitForTimeout(220);
  }

  // ---------- C. 独立子路由 ----------
  console.log('\n######## C. 独立子路由（首次进入）########');
  await gotoHash(ROUTE_HOME);
  await page.waitForTimeout(900);

  const enterOnce = async (r) => {
    const before = await mainSig();
    // 判据按页面类型分派：同路由换档位不能用「主块类名变化」，得看页头标题/专属根元素
    let pred;
    if (r.pred) pred = () => vis(r.pred);
    else if (r.predText) pred = () => page.evaluate((t) => (document.body.innerText || '').includes(t), r.predText);
    else pred = async () => (await mainSig()) !== before;
    const m = await measureGuarded(() => gotoHash(r.hash), pred, { settle: 520 });
    const probe = await mainBlock();
    // 假阳性守卫：签名变成登录弹窗 = 被登录守卫拦下，不是「切过去了」
    if (probe.main && /login-modal/.test(probe.main.cls)) {
      m.blockedByLogin = true;
    }
    return { ...m, main: probe.main };
  };

  for (const r of SUB_ROUTES) {
    const m = await enterOnce(r);
    ROWS.routes.push({ ...r, phase: '首次', ...m });
    // 记录该页主内容根节点，供「二次进入」比对
    await page.evaluate((id) => {
      window.__nodes = window.__nodes || {};
      const host = [...(document.querySelector('#app')?.children || [])]
        .filter((el) => el.getBoundingClientRect().height > 200)[0];
      window.__nodes[id] = host || null;
    }, r.id);
    if (m.blockedByLogin) violations.push(`子路由「${r.id}」被登录守卫拦下（拿到的是登录弹窗，数字不可用）`);
    if (m.timeout) violations.push(`子路由「${r.id}」切换后主内容未出现（超时）`);
    if (m.errors.length) violations.push(`子路由「${r.id}」切换时报错：${m.errors[0]}`);
    await page.waitForTimeout(200);
  }

  console.log('\n######## C-2. 子路由二次进入（先回「我的」再进）########');
  for (const r of SUB_ROUTES) {
    await gotoHash(HOME_HASH);
    await page.waitForTimeout(760);
    const m = await enterOnce(r);
    const same = await page.evaluate((id) => {
      const host = [...(document.querySelector('#app')?.children || [])]
        .filter((el) => el.getBoundingClientRect().height > 200)[0];
      return { same: !!host && host === window.__nodes?.[id], present: !!host };
    }, r.id);
    ROWS.routes.push({ ...r, phase: '二次', ...m, sameNode: same.same });
    await page.waitForTimeout(200);
  }
  } // 结束 ONLY !== 'roundtrip'

  // ---------- C-3. 往返：我的 → 子路由 → 回「我的」 ----------
  // 这是用户真正感知的「来回切」：返回那一段要不要重跑整棵 UserSpace 树、打多少请求。
  // 判据是 `.user-space-page` 的**节点身份**——同 = 路由级 KeepAlive 跨路由存活；异 = 整棵重建。
  console.log('\n######## C-3. 往返（我的 → 子路由 → 回「我的」）########');
  const ROUND_TRIP = SUB_ROUTES.filter((r) => !r.pred && !r.predText); // 排除同路由的设置档位
  for (const r of ROUND_TRIP) {
    await gotoHash(HOME_HASH);
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__shell = document.querySelector('.user-space-page'); });

    let pred;
    if (r.pred) pred = () => vis(r.pred);
    else if (r.predText) pred = () => page.evaluate((t) => (document.body.innerText || '').includes(t), r.predText);
    else {
      const before = await mainSig();
      pred = async () => (await mainSig()) !== before;
    }
    await measureGuarded(() => gotoHash(r.hash), pred, { settle: 460 });

    // 返回「我的」
    const back = await measureGuarded(
      () => gotoHash(HOME_HASH),
      () => vis('.tab-page.content-shell'),
      { settle: 560, waitQuiet: true },
    );
    const shell = await page.evaluate(() => ({
      same: !!document.querySelector('.user-space-page') && document.querySelector('.user-space-page') === window.__shell,
      present: !!document.querySelector('.user-space-page'),
    }));
    ROWS.roundTrips = ROWS.roundTrips || [];
    ROWS.roundTrips.push({ id: r.id, ...back, shellSame: shell.same, shellPresent: shell.present });    await page.waitForTimeout(200);
  }

  const longTasks = await page.evaluate(() => window.__longTasks || []);
  await page.screenshot({ path: `${OUT}/us-pages-final.png` });
  await ctx.close();

  // ---------- 报告 ----------
  const fmtMap = (m, n = 4) => {
    const items = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
    return items.map(([k, v]) => `${v}×${k}`).join('  ') || '—';
  };
  const cell = (r) => `${(r.ms == null ? '超时' : r.ms + 'ms').padStart(9)}  ${String(r.dataRequests).padStart(6)}  ${String(r.longTasks).padStart(5)}`;

  console.log('\n======== A. 分区入口 ========');
  console.log(`${'分区'.padEnd(8)}${'阶段'.padEnd(6)}${'耗时'.padStart(9)}  数据请求  长任务`);
  for (const r of ROWS.tabs) {
    console.log(`${r.label.padEnd(8)}${r.phase.padEnd(6)}${r.ms == null ? '        —' : cell(r)}`);
  }

  console.log('\n======== B. 分区内档位 ========');
  console.log(`${'分区/档位'.padEnd(18)}${'耗时'.padStart(9)}  数据请求  长任务  端点分布`);
  for (const r of ROWS.segs) {
    console.log(`${(r.tab + '/' + r.seg).padEnd(18)}${cell(r)}   ${fmtMap(r.byEndpoint)}`);
  }

  console.log('\n======== C. 独立子路由 ========');
  console.log(`${'页面'.padEnd(16)}${'阶段'.padEnd(6)}${'耗时'.padStart(9)}  数据请求  长任务  复用  主内容`);
  for (const r of ROWS.routes) {
    console.log(
      `${r.id.padEnd(16)}${r.phase.padEnd(6)}${cell(r)}  ` +
        `${(r.phase === '二次' ? (r.sameNode ? '复用' : '重建') : '—').padStart(4)}  ${r.main?.cls ?? '(无)'}`,
    );
    if (r.dataRequests) console.log(`${''.padEnd(28)}${fmtMap(r.byEndpoint, 3)}`);
  }

  const stat = (rows) => {    const t = rows.map((r) => r.ms).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    if (!t.length) return '（无有效数据）';
    return `中位 ${t[Math.floor(t.length / 2)]}ms / 最慢 ${t[t.length - 1]}ms（${t.length} 次）`;
  };
  const reqSum = (rows) => rows.reduce((s, r) => s + (r.dataRequests || 0), 0);

  const firstC = ROWS.routes.filter((r) => r.phase === '首次');
  const secondC = ROWS.routes.filter((r) => r.phase === '二次');
  console.log('\n======== C-3. 往返（返回「我的」那一段）========');
  console.log(`${'子路由'.padEnd(16)}${'DOM出现'.padStart(9)}${'数据就位'.padStart(10)}  返回请求数  shell 复用`);
  for (const r of ROWS.roundTrips) {
    console.log(
      `${r.id.padEnd(16)}${(r.ms == null ? '超时' : r.ms + 'ms').padStart(9)}` +
        `${(r.settleMs == null ? '—' : r.settleMs + 'ms').padStart(10)}  ` +
        `${String(r.dataRequests).padStart(10)}  ${r.shellSame ? '复用 ✅' : '重建 ❌'}`,
    );
  }
  console.log('\n======== 汇总 ========');
  console.log(`A 分区入口     首次+切回 ${stat(ROWS.tabs.filter((r) => r.ms != null))}   数据请求合计 ${reqSum(ROWS.tabs)}`);
  console.log(`B 分区内档位   ${stat(ROWS.segs)}   数据请求合计 ${reqSum(ROWS.segs)}`);
  console.log(`C 子路由首次   ${stat(firstC)}   数据请求合计 ${reqSum(firstC)}`);
  console.log(`C 子路由二次   ${stat(secondC)}   数据请求合计 ${reqSum(secondC)}`);
  const rebuilt = secondC.filter((r) => r.sameNode === false);
  console.log(`子路由二次进入「重建」：${rebuilt.length ? rebuilt.map((r) => r.id).join('、') : '无'}`);
  const rt = ROWS.roundTrips;
  console.log(
    `C-3 往返返回：${stat(rt)}   返回请求合计 ${reqSum(rt)}   ` +
      `shell 复用 ${rt.filter((r) => r.shellSame).length}/${rt.length}`,
  );
  console.log(`整轮长任务：${longTasks.length} 个${longTasks.length ? ' → ' + longTasks.slice(0, 12).join('ms, ') + 'ms' : ''}`);
} finally {
  await browser.close();
}

if (violations.length) {
  console.error('\n[us-pages] 巡检发现问题：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log('\n[us-pages] 全部页面切换后内容均可见、无报错。');
}
