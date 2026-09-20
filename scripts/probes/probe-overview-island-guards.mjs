/**
 * 智能概览（灵动岛 + /overview 页）守卫回归探针（Playwright + 伪造登录，不需要真实账号）
 *
 * 覆盖 20260920 修复的三处：
 *  A. 本机无「上次在线日」游标 + 会话锚点已退化成今天（今天登录过、之后任意一次刷新
 *     ——HMR / PWA 接管 / F5——捕获到的 profiles.last_active_at 就是今天）时，
 *     检查**不得静默短路**：必须弹出加载岛。修复前该分支直接 return，连加载态都不触发。
 *  B. 该分支（以及失败分支）**不得写入**「当日已读」游标：写下去会把当天钉死，
 *     之后每次触发都被 `lastOnlineDay >= todayKey` 守卫短路。
 *  C. 回归：锚点仍是真实离线时间（60 天前）时窗口口径不变，加载岛照常弹出。
 *  D. P1-a：会话结束（pagehide）把「上次在线日」推进到当天，但**不写**「当日已检查」
 *     （两个 key 分工：在线日只决定窗口，检查日才做同日去重）。
 *  E. P1-b：/overview 页查询锚点下钳到不晚于「今日零点」（同一天刷新后不再窗口塌成
 *     几分钟而显示空态），超过一天的真实离线锚点原样保留。
 *  F. 回归：刷新（pagehide）之后再点「我的方块」仍必须弹岛 —— 不能因为「今天上过线」
 *     把当天窗口掐掉。
 *  G. 跨设备（服务端 profiles.last_online_day / overview_checked_day）：
 *     G1 本机无记录且会话锚点为空时，窗口仍应取自服务端「上次在线日」（离开 5 天）；
 *     G2 服务端记录「今天已检查」时，换设备后同一天不重复推送。
 *
 * 说明：探针不含真实会话，灵动岛场景下 RPC 必然失败（auth.uid() 为空 → 服务端 raise），
 * 因此 A/B/C/F 只断言「守卫是否放行」与「游标是否被污染」；E/G 用路由拦截伪造 RPC 响应后
 * 断言请求体与卡片文案。
 *
 * 前置：dev server（默认 http://localhost:5173，可用 BASE_URL 覆盖；也可打到 preview 4173）。
 * 运行：node scripts/probes/probe-overview-island-guards.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const FAKE_UID = 'probe-overview-uid-0001';
const DAY_MARKER_KEY = `boh_overview_last_online_day:${FAKE_UID}`;
const CHECKED_DAY_KEY = `boh_overview_checked_day:${FAKE_UID}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const launchBrowser = async () => {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
};

/** 等 auth 状态稳定（连续 quietMs 无变化）：
 *  冷启动无会话时，init 链会在 supabase INITIAL_SESSION 之后才落回登出态并 resetState，
 *  注入早于这一刻就会被清掉——所以必须等它静下来，而不是赌一个固定秒数 */
const waitAuthStable = async (page, { quietMs = 1500, timeoutMs = 25000 } = {}) => {
  const started = Date.now();
  let lastKey = null;
  let lastChangeAt = Date.now();
  while (Date.now() - started < timeoutMs) {
    const snap = await page.evaluate(() => {
      const auth = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.auth;
      return auth ? `${auth.isInitialized}|${auth.isLoggedIn}|${auth.userInfo?.id || ''}` : 'none';
    });
    if (snap !== lastKey) {
      lastKey = snap;
      lastChangeAt = Date.now();
    } else if (Date.now() - lastChangeAt >= quietMs) {
      return snap;
    }
    await page.waitForTimeout(200);
  }
  return lastKey;
};

/** 打开应用（等 auth 初始化彻底静下来），可挂路由拦截 */
const openApp = async (browser, { onPage } = {}) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));
  if (onPage) await onPage(page);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await waitAuthStable(page);
  return { page, pageErrors };
};

/** 注入伪造登录态 + 预置锚点，并清干净该账号的游标与会话标记（复现「本机首次启用游标」）。
 *  注入后回读校验：被启动期异步链清掉时重试（最多 3 次） */
const injectFakeLogin = async (page, anchorIso) => {
  const readAuth = () =>
    page.evaluate(() => {
      const auth = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.auth;
      return { isLoggedIn: auth.isLoggedIn === true, id: String(auth.userInfo.id || '') };
    });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(
      ({ uid, anchorIso: anchor }) => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const auth = pinia.state.value.auth;
        auth.isLoggedIn = true;
        auth.isInitialized = true;
        Object.assign(auth.userInfo, { id: uid, username: '探针账号', role: 'user', points: 0 });
        auth.offlineAnchorAt = anchor;
        auth.overviewMarks = null; // 服务端标记由场景自行取回，先清干净，避免跨场景串味
        // /overview 页的 useOfflineOverview.load() 会主动 await initLoginState()：
        // 无真实会话时它会重新走一遍同步链路并把伪造登录清成登出态 → 这里把该 action 置空
        // （store 实例经 pinia._s 取，setup store 的 action 不在 state 上）
        const store = pinia._s?.get?.('auth');
        if (store) store.initLoginState = async () => {};
        localStorage.removeItem(`boh_overview_last_online_day:${uid}`);
        localStorage.removeItem(`boh_overview_checked_day:${uid}`);
        sessionStorage.removeItem(`boh_overview_island:${uid}`);
      },
      { uid: FAKE_UID, anchorIso }
    );
    await page.waitForTimeout(250);
    const state = await readAuth();
    if (state.isLoggedIn && state.id === FAKE_UID) return true;
    await page.waitForTimeout(900);
  }
  return false;
};

/** 装一个「加载岛出现过」记录器：RPC 被本地拦截时响应是瞬时的，加载岛可能只闪几毫秒，
 *  waitForSelector 会漏判 —— 必须用 MutationObserver 记录「是否出现过 + 是否可见」 */
const installIslandRecorder = (page) =>
  page.evaluate(() => {
    window.__islandSeen = { appeared: false, visible: false };
    const scan = () => {
      const el = document.querySelector('.ov-island-loading');
      if (!el) return;
      window.__islandSeen.appeared = true;
      if (el.offsetParent !== null && el.getBoundingClientRect().height > 0) {
        window.__islandSeen.visible = true;
      }
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__islandObserver = observer;
    scan();
  });

const readIslandRecorder = (page) =>
  page.evaluate(() => window.__islandSeen || { appeared: false, visible: false });

/** 等通知岛卡出现**目标文案**（导航栏始终有一个常驻占位卡，不能只等 .global-nav-status-card） */
const waitForCardText = async (page, expected, timeout = 8000) => {
  try {
    await page.waitForFunction(
      (text) => (document.querySelector('.global-nav-status-card')?.textContent || '').includes(text),
      expected,
      { timeout }
    );
  } catch {
    // 断言统一处理
  }
  return (await page.textContent('.global-nav-status-card').catch(() => '')) || '';
};

/** A/B/C/F：点「我的方块」触发自动检查 → 看加载岛与游标 */
const runIslandScenario = async (browser, { name, anchorIso, prePagehide = false }) => {
  const { page, pageErrors } = await openApp(browser);

  try {
    await injectFakeLogin(page, anchorIso);
    // F：先模拟一次「今天离开过」（刷新/关标签），再点击 —— 当天窗口不能被掐掉
    if (prePagehide) {
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.waitForTimeout(200);
    }
    await installIslandRecorder(page);
    await page.click('#nav-user-info', { timeout: 8000 });

    // 等伪造登录下的 RPC 失败返回（岛应由宿主静默收掉）
    await page.waitForTimeout(2000);
    const island = await readIslandRecorder(page);
    const marks = await page.evaluate(
      ({ onlineKey, checkedKey }) => ({
        online: localStorage.getItem(onlineKey),
        checked: localStorage.getItem(checkedKey)
      }),
      { onlineKey: DAY_MARKER_KEY, checkedKey: CHECKED_DAY_KEY }
    );

    check(`${name} · 加载岛弹出`, island.appeared && island.visible, `出现过=${island.appeared} 可见=${island.visible}`);
    check(`${name} · 失败分支未写检查日游标（防污染）`, marks.checked === null, marks.checked === null ? '' : `残留=${marks.checked}`);
    check(`${name} · 无未捕获页面错误`, pageErrors.length === 0, pageErrors.join(' | ').slice(0, 160));
  } finally {
    await page.close();
  }
};

/** D：pagehide（离开/关闭会话）应把「上次在线日」写成当天，但不写「当日已检查」 */
const runPagehideScenario = async (browser) => {
  const { page, pageErrors } = await openApp(browser);
  const name = 'D pagehide 落盘上次在线日';

  try {
    await injectFakeLogin(page, new Date().toISOString());
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(300);
    const marks = await page.evaluate(
      ({ onlineKey, checkedKey }) => ({
        online: localStorage.getItem(onlineKey),
        checked: localStorage.getItem(checkedKey)
      }),
      { onlineKey: DAY_MARKER_KEY, checkedKey: CHECKED_DAY_KEY }
    );

    check(`${name} · 在线日=当天`, marks.online === todayKey(), `游标=${marks.online} 期望=${todayKey()}`);
    check(`${name} · 不写检查日（保留当天推送机会）`, marks.checked === null, marks.checked === null ? '' : `残留=${marks.checked}`);
    check(`${name} · 无未捕获页面错误`, pageErrors.length === 0, pageErrors.join(' | ').slice(0, 160));
  } finally {
    await page.close();
  }
};

/** G：跨设备天粒度标记（服务端 mark_overview_state）——
 *  窗口吃服务端「上次在线日」（本机无任何记录、会话锚点为空也能拿到真实离线窗口），
 *  同日去重吃服务端「当日已检查」（换设备后同一天不再重复推送）。 */
const runCrossDeviceScenario = async (browser, { name, previousOnlineDay = null, checkedDay = null, expectWindowDay = null, expectCard = '' }) => {
  const captured = { markCalls: 0, summaryCalls: 0, summaryAnchor: null };
  const { page, pageErrors } = await openApp(browser, {
    onPage: (p) => {
      p.route('**/rest/v1/rpc/mark_overview_state', async (route) => {
        captured.markCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          // 真实 RPC 的语义：返回写入前的旧值（跨设备上次在线日 / 当日已检查），并写今天
          body: JSON.stringify({ today: todayKey(), previous_online_day: previousOnlineDay, checked_day: checkedDay })
        });
      });
      p.route('**/rest/v1/rpc/get_offline_overview', async (route) => {
        captured.summaryCalls += 1;
        const body = JSON.parse(route.request().postData() || '{}');
        captured.summaryAnchor = body?.p_anchor ?? null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            anchor: body?.p_anchor ?? null,
            anchor_source: 'param',
            is_first_login: false,
            server_time: new Date().toISOString(),
            total: 2,
            has_more: false,
            items: [
              {
                type: 'post',
                id: 'probe-cross-device-1',
                title: '跨设备窗口里的帖子',
                excerpt: '探针数据',
                author: '探针账号',
                published_at: new Date().toISOString(),
                image: '',
                category: 'daily'
              }
            ]
          })
        });
      });
    }
  });

  try {
    // 锚点为空：本机与心跳锚点都提供不了窗口，只能靠服务端标记
    await injectFakeLogin(page, null);
    await page.evaluate(async () => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('auth');
      await store.refreshOverviewMarks();
    });
    await installIslandRecorder(page);
    await page.click('#nav-user-info', { timeout: 8000 });

    let cardText = '';
    if (expectCard) {
      // 等目标文案（导航栏有常驻占位卡，不能只等卡片元素出现）
      cardText = await waitForCardText(page, expectCard);
    } else {
      await page.waitForTimeout(2000);
    }
    const island = await readIslandRecorder(page);
    const islandAppeared = island.appeared;

    check(`${name} · 服务端标记已取回`, captured.markCalls >= 1, `调用 ${captured.markCalls} 次`);
    if (expectCard) {
      check(`${name} · 加载岛弹出`, islandAppeared && island.visible, `出现过=${island.appeared} 可见=${island.visible}`);
      check(`${name} · 窗口用服务端上次在线日`, captured.summaryAnchor === expectWindowDay, `实际=${captured.summaryAnchor} 期望=${expectWindowDay}`);
      check(`${name} · 卡片文案`, cardText.includes(expectCard), cardText.replace(/\s+/g, ' ').slice(0, 70));
    } else {
      check(`${name} · 同日去重：不弹岛、不发摘要请求`, !islandAppeared && captured.summaryCalls === 0, `岛=${islandAppeared} 摘要请求=${captured.summaryCalls}`);
    }
    check(`${name} · 无未捕获页面错误`, pageErrors.length === 0, pageErrors.join(' | ').slice(0, 160));
  } finally {
    await page.close();
  }
};

/** E：/overview 页 RPC 请求体的 p_anchor 断言（路由拦截，不依赖真实会话） */
const runAnchorScenario = async (browser, { name, anchorIso, expect }) => {
  const captured = { body: null };
  const { page, pageErrors } = await openApp(browser, {
    onPage: (p) =>
      p.route('**/rest/v1/rpc/get_offline_overview', async (route) => {
        try {
          captured.body = JSON.parse(route.request().postData() || '{}');
        } catch {
          captured.body = {};
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            anchor: captured.body?.p_anchor ?? null,
            anchor_source: 'param',
            is_first_login: false,
            server_time: new Date().toISOString(),
            total: 0,
            has_more: false,
            items: []
          })
        });
      })
  });

  try {
    await injectFakeLogin(page, anchorIso);
    await page.evaluate(() => {
      location.hash = '#/overview';
    });
    await page.waitForTimeout(2500);

    // 失败时把现场一并带出：请求是否发生 / 页面是否挂载 / 伪造登录是否还在
    const diag = await page.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__;
      return {
        hash: location.hash,
        loggedIn: app.config.globalProperties.$pinia.state.value.auth.isLoggedIn === true,
        mounted: Boolean(document.querySelector('.smart-overview-page'))
      };
    });
    check(
      `${name} · p_anchor 正确`,
      captured.body?.p_anchor === expect,
      `实际=${captured.body?.p_anchor} 期望=${expect} | 请求体=${captured.body ? '有' : '无'} | 现场=${JSON.stringify(diag)}`
    );
    check(`${name} · 无未捕获页面错误`, pageErrors.length === 0, pageErrors.join(' | ').slice(0, 160));
  } finally {
    await page.close();
  }
};

const main = async () => {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    console.error('无法启动 Chromium（需本机 Chrome 或 npx playwright install chromium）:', err.message);
    process.exit(2);
  }

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();

  try {
    // A：今天登录过又刷新过的会话 —— 锚点被顶成今天（修复前的必现故障场景）
    await runIslandScenario(browser, { name: 'A 锚点=今天(刷新后会话)', anchorIso: new Date().toISOString() });
    // B：登录竞态 —— SIGNED_IN 里资料请求未回，锚点仍为空
    await runIslandScenario(browser, { name: 'B 锚点=null(登录竞态)', anchorIso: null });
    // C：回归 —— 锚点仍是真实离线时间，真实离线窗口不受影响
    await runIslandScenario(browser, { name: 'C 锚点=60天前(真实离线)', anchorIso: sixtyDaysAgo });
    // D：会话结束落盘「上次在线日」
    await runPagehideScenario(browser);
    // F：回归 —— 今天已经离开过一次（刷新/关标签）后再点，当天窗口不能被掐掉
    await runIslandScenario(browser, {
      name: 'F 先离开过再点击',
      anchorIso: new Date().toISOString(),
      prePagehide: true
    });

    // G：跨设备 —— 服务端标记提供窗口 / 同日去重
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const fiveDaysAgoKey = `${fiveDaysAgo.getFullYear()}-${String(fiveDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(fiveDaysAgo.getDate()).padStart(2, '0')}`;
    const fiveDaysAgoFrontier = (() => {
      const f = new Date(fiveDaysAgo);
      f.setDate(f.getDate() + 1);
      f.setHours(0, 0, 0, 0);
      return f.toISOString();
    })();

    // G1：本机无记录 + 会话锚点为空，窗口仍应来自服务端「上次在线日」
    await runCrossDeviceScenario(browser, {
      name: 'G1 窗口来自服务端上次在线日',
      previousOnlineDay: fiveDaysAgoKey,
      checkedDay: null,
      expectWindowDay: fiveDaysAgoFrontier,
      expectCard: '你离开了 5 天'
    });
    // G2：服务端记录「今天已检查」→ 换设备后同一天不重复推送
    await runCrossDeviceScenario(browser, {
      name: 'G2 跨设备同日去重',
      previousOnlineDay: fiveDaysAgoKey,
      checkedDay: todayKey()
    });
    // E1/E2：/overview 页锚点钳制（今天 → 今日零点；60 天前 → 原样）
    await runAnchorScenario(browser, {
      name: 'E1 页锚点=今天 → 钳到今日零点',
      anchorIso: new Date().toISOString(),
      expect: todayMidnight.toISOString()
    });
    await runAnchorScenario(browser, {
      name: 'E2 页锚点=60天前 → 原样保留',
      anchorIso: sixtyDaysAgo,
      expect: sixtyDaysAgo
    });
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) process.exit(1);
};

main().catch((err) => {
  console.error('探针异常:', err);
  process.exit(2);
});