/**
 * probe-css-load-failure.mjs — 路由 CSS「动态注入失败」端到端复现 + 恢复链审计
 *
 * 背景（2026-10-12 用户报障：「有概率出现旧缓存导致页面样式错乱，感觉失去了
 * CSS 样式文件的加载，尤其是成员 tab 和『我的』页面」）：
 *
 *   cssCodeSplit:true 下，路由级 CSS（含 Vue SFC scoped 样式与 <style src>）
 *   不在 index.html 的 <link> 里，而是由路由 chunk 的 JS 经 __vitePreload
 *   助手动态创建 <link> 注入。两个重页面因此完全暴露在运行时网络下：
 *     · 「我的」页  = profile-base / profile-panels / responsive-integrations
 *                    三个 CSS，唯一入口是 async-loaders.js 的 preloadProfileStyles()
 *                    （调用点几乎全是 void，fire-and-forget）
 *     · 「成员」分区 = UserSpace 路由 chunk 自带的 index-<hash>.css
 *                    （shell-community.css 内容：.community-page-grid 等）
 *
 *   __vitePreload（构建产物内核实过）的两个行为决定故障形态：
 *     ① i[url]=true 去重标记在 fetch 完成前写入 —— 失败后同一会话内再调用
 *        preloadProfileStyles() 会直接解析成功、但永远不再创建 <link>；
 *     ② 失败经 vite:preloadError 上报；恢复入口 recoverDynamicImportFailure()
 *        有 30s sessionStorage 冷却，index.html 的 link-error 监听有
 *        bohAssetRecovery 一次性护栏 —— 两者合计只够救前一两次。
 *
 * 判据设计：**自校准差分**。先跑一遍不拦截的健康基线，再跑故障态，逐属性
 * diff 计算样式。不依赖对层叠链的先验知识（.profile-tab 的 padding 被
 * shell-community.css:2862 等多层刻意覆盖，写死基线值会假红/假绿）。
 *
 * 四段：
 *   基线    不拦截，采集健康样式（自校准差分的参照系）
 *   场景 A  我的页三个 profile CSS **持续**失败 → 差分非空（可降级）+ 自愈重试确实在发新请求
 *   场景 B  路由 CSS 失败 → 导航**不再被吞**（P0-1 验收：路由照常挂载，只是样式缺失）
 *   场景 C  瞬时失败 → 恢复链强制刷新 → 刷新后恢复
 *   场景 D  恢复链被限流 + 瞬时失败 → 只靠页内自愈恢复（P0-2 验收：零强制刷新）
 *
 * ⚠️ 修复前（2026-10-12 首轮诊断）的对照结论，别再当成「应然」：
 *   · 场景 B 曾表现为 user-space 路由**根本没挂载**（导航被静默吞掉）—— 一条 CSS 404
 *     把路由 chunk 的 import() 炸掉了；修复（vite-preload-recovery 无条件吞 CSS 失败）后
 *     必须挂载成功，此处再回到 false 就是 P0-1 被回退。
 *   · 场景 A/D 曾表现为「半样式常驻、切 tab 无效」—— __vitePreload 的 i[url] 去重表
 *     让页内重试变成假重试；修复（async-loaders 摘 link 重建）后必须有新请求发出。
 *
 * 用法：
 *   ./node_modules/.bin/vite preview --outDir dist-check --port 4180 --strictPort --host ::
 *   node scripts/probes/probe-css-load-failure.mjs http://[::1]:4180
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';

const violations = [];
const fail = (m) => violations.push(m);
const note = (m) => console.log(`[css-failure] ${m}`);

const PROFILE_CSS_PATTERNS = [
  '**/static/css/profile-base-*.css',
  '**/static/css/profile-panels-*.css',
  '**/static/css/responsive-integrations-*.css',
];

/** 我的页采样点：(选择器, 属性[]) */
const PROFILE_SAMPLES = [
  ['.profile-page-content', ['maxWidth', 'paddingLeft', 'paddingBottom', 'margin']],
  ['.profile-hero-panel', ['minHeight', 'borderRadius', 'boxShadow']],
  ['.profile-hero-body', ['display', 'gridTemplateColumns', 'paddingLeft']],
  ['.profile-cover-band', ['height', 'borderRadius']],
  ['.profile-bio', ['maxWidth', 'fontSize', 'lineHeight']],
  ['.profile-post-grid', ['display', 'gridTemplateColumns', 'gap']],
  ['.profile-content-panel', ['borderRadius', 'borderTopWidth', 'backgroundColor']],
  ['.profile-service-grid', ['display', 'gridTemplateColumns', 'padding']],
];

/** 成员分区采样点 */
const COMMUNITY_SAMPLES = [
  ['.community-page-grid', ['display', 'gridTemplateColumns', 'maxWidth', 'gap']],
  ['.community-pulse', ['borderRadius', 'padding', 'backgroundColor']],
  ['.community-users-list', ['display', 'gap']],
  ['.community-group', ['borderRadius', 'backgroundColor']],
];

/** 运行时反查：哪些 index-<hash>.css 装着 shell-community（.community-page-grid）。
 *  UserSpace 路由 CSS 与 Profile 路由 CSS 都含它，全部拦掉（本探针不访问 /profile，
 *  拦前者即命中「成员」分区的样式来源）。 */
async function findRouteCssFiles() {
  const entryHtml = await (await fetch(`${BASE}/`)).text();
  const appJs = entryHtml.match(/src="\.\/(static\/js\/app-[^"]+\.js)"/)?.[1];
  if (!appJs) return [];
  const chunk = await (await fetch(`${BASE}/${appJs}`)).text();
  const candidates = [
    ...new Set([...chunk.matchAll(/"(\.\.\/css\/index-[A-Za-z0-9_-]+\.css)"/g)].map((m) => m[1])),
  ];
  const hits = [];
  for (const rel of candidates) {
    const css = await (await fetch(`${BASE}/static/js/${rel}`)).text();
    if (css.includes('.community-page-grid{')) hits.push(rel.split('/').pop());
  }
  return hits;
}

const ROUTE_CSS_FILES = await findRouteCssFiles();
if (!ROUTE_CSS_FILES.length)
  fail('未能反查到成员分区路由 CSS 文件（index-*.css），场景 B 无法构造');
note(`成员分区路由 CSS（场景 B 拦截目标）：${ROUTE_CSS_FILES.join(', ') || '（未找到）'}`);

/**
 * 登录态注入：initLoginState() 会把无会话的 isLoggedIn 打回 false，
 * 所以必须像 probe-userspace-pages.mjs 那样持续幂等补打，不能只打一次。
 */
const loginInit = () => {
  const inject = () => {
    try {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
      const auth = pinia?.state?.value?.auth;
      if (!auth) return;
      auth.isLoggedIn = true;
      auth.isInitialized = true;
      Object.assign(auth.userInfo, {
        id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
        username: 'probe_user',
        role: 'user',
        points: 42,
      });
    } catch {
      /* 还没挂载，下一轮再试 */
    }
  };
  const timer = setInterval(inject, 400);
  setTimeout(() => clearInterval(timer), 60000);
};

/** 采样：返回 { 选择器: { 属性: 值 } }，元素不存在则记 null */
/** 暗色主题：8 条主题 CSS 各自是否真的生效（按 cssRules 条数；-1 未挂上 / -2 读不到） */
const DARK_THEME_KEYS = [
  'dark-mode',
  'navbar-dark',
  'forum-dark',
  'post-detail-dark',
  'user-space-dark',
  'user-center-dark',
  'bohai-dark',
  'messages-dark',
];
// ⚠️ 必须把 keys 作为**参数**传进来：page.evaluate 只序列化函数体，
// 闭包里的模块级变量在页面上下文里并不存在（首版就踩了 DARK_THEME_KEYS is not defined）。
const darkThemeProbe = (keys) =>
  Object.fromEntries(
    keys.map((key) => {
      const re = new RegExp(`/${key}-[^/]+\\.css$`);
      const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) =>
        re.test(l.href),
      );
      let rules = -1;
      try {
        rules = link?.sheet ? link.sheet.cssRules.length : -1;
      } catch {
        rules = -2;
      }
      return [key, rules];
    }),
  );

const sampleStyles = (samples) => {
  const out = {};
  for (const [sel, props] of samples) {
    const el = document.querySelector(sel);
    if (!el) {
      out[sel] = null;
      continue;
    }
    const cs = getComputedStyle(el);
    out[sel] = Object.fromEntries(props.map((p) => [p, cs[p]]));
  }
  return out;
};

/** 样式表清单：href + 规则数（加载失败的 sheet 为 null / 0 条） */
const sheetInventory = () =>
  [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => ({
    f: l.href.split('/').pop(),
    rules: l.sheet ? l.sheet.cssRules.length : -1,
  }));

const diffStyles = (base, next) => {
  const diff = {};
  for (const sel of Object.keys(base)) {
    const a = base[sel];
    const b = next[sel];
    if (!a || !b) {
      if (a !== b) diff[sel] = `${a ? '有元素' : '无元素'} → ${b ? '有元素' : '无元素'}`;
      continue;
    }
    for (const p of Object.keys(a)) {
      if (a[p] !== b[p]) diff[`${sel} {${p}}`] = `${a[p]} → ${b[p]}`;
    }
  }
  return diff;
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

async function newPage() {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // 默认隔离 SW 专测应用层恢复链；CSS_PROBE_SW=allow 时放行 SW，
    // 测「SW 已激活」这一线上真实形态（forceCleanAndReload 的 SW 路径）。
    serviceWorkers: process.env.CSS_PROBE_SW === 'allow' ? 'allow' : 'block',
  });
  const page = await ctx.newPage();
  await page.addInitScript(loginInit);
  const fullLoads = [];
  const cssLog = [];
  const consoleErrors = [];
  const events = [];
  const WATCH =
    /static\/css\/(profile-|responsive-integrations-|index-|dark-|navbar-dark|forum-dark|post-detail-dark|user-space-dark|user-center-dark|bohai-dark|messages-dark)[^/]*\.css/;
  page.on('load', () => fullLoads.push(page.url()));
  page.on('pageerror', (err) => consoleErrors.push(String(err?.message || err)));
  page.on('response', (res) => {
    if (WATCH.test(res.url())) cssLog.push(`${res.url().split('/').pop()}→${res.status()}`);
  });
  page.on('requestfailed', (req) => {
    if (WATCH.test(req.url())) cssLog.push(`${req.url().split('/').pop()}→FAILED`);
  });
  // 页面/上下文异常关闭是「探针自己挂了」与「产品行为」的分界，必须留痕
  page.on('crash', () => events.push('page-crash'));
  ctx.on('close', () => events.push('ctx-close'));
  await page.exposeFunction('__cssProbeEvent', (e) => events.push(e));
  await page.addInitScript(() => {
    window.addEventListener(
      'error',
      (e) => {
        const t = e.target;
        if (t && t.tagName === 'LINK')
          window.__cssProbeEvent(`link-error:${t.href.split('/').pop()}`);
      },
      true,
    );
    window.addEventListener('vite:preloadError', () => window.__cssProbeEvent('vite:preloadError'));
  });
  return { ctx, page, fullLoads, cssLog, consoleErrors, events };
}

/** 走通用导航：进 user-space 指定 tab，等关键元素出现 */
async function openUserSpaceTab(page, tab, waitSel) {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate((t) => {
    window.location.hash = `#/user-space?tab=${t}`;
  }, tab);
  await page.waitForSelector(waitSel, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

try {
  // ============================================================
  // 基线（不拦截）：我的页 + 成员分区
  // ============================================================
  note('基线 —— 不拦截，采集健康样式');
  let profileBaseline = {};
  let communityBaseline = {};
  {
    const { ctx, page } = await newPage();
    await openUserSpaceTab(page, 'posts', '.profile-home-shell');
    profileBaseline = await page.evaluate(sampleStyles, PROFILE_SAMPLES);
    const sheets = await page.evaluate(sheetInventory);
    note(
      `  我的页采样 ${Object.values(profileBaseline).filter(Boolean).length} 个元素；样式表 ${sheets.length} 个`,
    );
    const pb = sheets.find((s) => /profile-base-/.test(s.f));
    note(`  profile-base 样式表规则数：${pb ? pb.rules : '（不在 DOM）'}`);
    await openUserSpaceTab(page, 'community', '.tab-page.community-shell');
    const membersTabForBaseline = page.locator('button.segment-tab', { hasText: '成员' }).first();
    if (await membersTabForBaseline.count()) await membersTabForBaseline.click().catch(() => {});
    await page.waitForSelector('.community-page-grid', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    communityBaseline = await page.evaluate(sampleStyles, COMMUNITY_SAMPLES);
    const communitySamples = Object.values(communityBaseline).filter(Boolean).length;
    note(`  成员分区采样 ${communitySamples} 个元素`);
    if (communitySamples === 0)
      fail('基线：成员分区的采样点一个都没渲染出来 —— 场景 B 的差分将失去判据');
    await ctx.close();
  }

  // ============================================================
  // 场景 A：我的页三个 profile CSS 持续失败
  // ============================================================
  note('场景 A —— 我的页 profile 三样式持续失败');
  {
    const { ctx, page, fullLoads, cssLog, consoleErrors, events } = await newPage();
    for (const pattern of PROFILE_CSS_PATTERNS) {
      await page.route(pattern, (route) => route.abort());
    }
    await openUserSpaceTab(page, 'posts', '.profile-home-shell');
    await page.waitForTimeout(6000); // 恢复链窗口

    let snap = await page.evaluate(sampleStyles, PROFILE_SAMPLES);
    let diff = diffStyles(profileBaseline, snap);
    const diffCount = Object.keys(diff).length;
    note(`  与健康基线的样式差分：${diffCount} 项`);
    note(
      `  差分示例：${
        Object.entries(diff)
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${v}`)
          .join('；') || '（无）'
      }`,
    );
    if (diffCount > 0) note('  ✔ 复现：我的页缺 profile CSS → 半样式塌陷（差分非空）');
    else fail('场景 A：profile CSS 已拦但与健康基线零差分 —— 断言基线失效');

    // 切走再切回（switchTab → void preloadProfileStyles() 的页内重试路径）
    const messagesItem = page.locator('button.nav-item', { hasText: '消息' }).first();
    const postsItem = page.locator('button.nav-item', { hasText: '我的' }).first();
    if (await messagesItem.count()) {
      await messagesItem.click().catch(() => {});
      await page.waitForTimeout(1500);
      await postsItem.click().catch(() => {});
      await page.waitForTimeout(3000);
      snap = await page.evaluate(sampleStyles, PROFILE_SAMPLES);
      diff = diffStyles(profileBaseline, snap);
      note(`  切走再切回后差分：${Object.keys(diff).length} 项`);
      if (Object.keys(diff).length > 0)
        note('  ✔ 复现：切 tab 不触发有效重试（__vitePreload 去重标记吃掉重试），半样式常驻');
    }

    // 自愈证据：每次整页加载本该只发 1 次 profile-base 请求；请求数 > 加载次数
    // 说明页内重试真的绕过去重表发了新请求（修复前两者恒等）。
    const baseAttempts = cssLog.filter((line) => line.startsWith('profile-base-')).length;
    note(`  profile-base 请求次数：${baseAttempts} / 整页加载次数：${fullLoads.length}`);
    if (baseAttempts > fullLoads.length)
      note('  ✔ 自愈生效：失败后仍在重发请求（绕开了 __vitePreload 去重表）');
    else
      fail(
        `场景 A：profile-base 请求次数(${baseAttempts}) 未超过加载次数(${fullLoads.length}) —— 自愈重试未工作`,
      );

    note(`  整页加载次数：${fullLoads.length}`);
    note(`  事件序列：${events.join(' , ') || '（无）'}`);
    note(`  CSS 流水：${cssLog.join(' | ') || '（无）'}`);
    consoleErrors.slice(0, 3).forEach((e) => note(`  未捕获错误：${e.slice(0, 100)}`));
    note(`  未捕获错误合计 ${consoleErrors.length} 条`);
    await ctx.close();
  }

  // ============================================================
  // 场景 B：成员分区路由 CSS（shell-community）失败
  // ============================================================
  note('场景 B —— 成员分区路由 CSS 失败');
  if (ROUTE_CSS_FILES.length) {
    const { ctx, page, fullLoads, cssLog, consoleErrors, events } = await newPage();
    for (const f of ROUTE_CSS_FILES) {
      await page.route(`**/static/css/${f}`, (route) => route.abort());
    }
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.location.hash = '#/user-space?tab=community';
    });
    await page.waitForTimeout(3000);
    const membersTab = page.locator('button.segment-tab', { hasText: '成员' }).first();
    if (await membersTab.count()) await membersTab.click().catch(() => {});
    await page.waitForSelector('.community-page-grid', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(6000); // 恢复链窗口

    const snap = await page.evaluate(sampleStyles, COMMUNITY_SAMPLES);
    const mounted = await page.evaluate(() => !!document.querySelector('.user-space-page'));
    const diff = diffStyles(communityBaseline, snap);
    note(`  user-space 路由是否挂载：${mounted}`);
    note(`  与健康基线的样式差分：${Object.keys(diff).length} 项`);
    note(
      `  差分示例：${
        Object.entries(diff)
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${v}`)
          .join('；') || '（无）'
      }`,
    );
    if (!mounted)
      fail('场景 B：路由 CSS 失败把整个 /user-space 路由带崩了（导航被吞）—— P0-1 被回退');
    else if (Object.keys(diff).length > 0)
      note('  ✔ P0-1 生效：路由照常挂载（导航不再被吞），样式降级为缺失');
    else fail('场景 B：路由 CSS 已拦但样式零差分 —— 断言基线失效');

    note(`  整页加载次数：${fullLoads.length}`);
    note(`  事件序列：${events.join(' , ') || '（无）'}`);
    note(`  CSS 流水：${cssLog.join(' | ') || '（无）'}`);
    note(`  未捕获错误 ${consoleErrors.length} 条`);
    await ctx.close();
  }

  // ============================================================
  // 场景 C：瞬时失败（每个文件仅第一次请求失败）→ 恢复链应救回
  // ============================================================
  note('场景 C —— 瞬时失败（每文件仅首次请求失败）');
  {
    const { ctx, page, fullLoads, cssLog, consoleErrors, events } = await newPage();
    const counters = new Map();
    for (const pattern of PROFILE_CSS_PATTERNS) {
      await page.route(pattern, (route) => {
        const n = (counters.get(pattern) || 0) + 1;
        counters.set(pattern, n);
        if (n <= 1) route.abort();
        else route.continue();
      });
    }
    await openUserSpaceTab(page, 'posts', '.profile-home-shell');
    await page.waitForTimeout(20000); // 恢复链 + 重新加载

    const snap = await page.evaluate(sampleStyles, PROFILE_SAMPLES);
    const diff = diffStyles(profileBaseline, snap);
    note(`  与健康基线的样式差分：${Object.keys(diff).length} 项`);
    note(`  整页加载次数：${fullLoads.length}`);
    note(`  事件序列：${events.join(' , ') || '（无）'}`);
    note(`  CSS 流水：${cssLog.join(' | ') || '（无）'}`);
    if (Object.keys(diff).length === 0 && fullLoads.length > 1)
      note('  ✔ 瞬时失败被恢复链救回（代价：整页强制刷新）');
    else {
      note('  ✘ 瞬时失败未被救回或只救到一半');
      if (Object.keys(diff).length > 0)
        fail('场景 C：瞬时失败后刷新完成，但样式与健康基线仍有差分');
    }
    note(`  未捕获错误 ${consoleErrors.length} 条`);
    await ctx.close();
  }
  // ============================================================
  // 场景 D：两条全局恢复通道都被限流 + 瞬时失败 → 只能靠页内自愈
  // ============================================================
  note('场景 D —— 恢复链被限流时的页内自愈（P0-2 验收）');
  {
    const { ctx, page, fullLoads, cssLog, consoleErrors } = await newPage();
    // ① vite:preloadError 通道：预置冷却戳（sessionStorage，探针同源可控）
    // ② index.html 的 link-error 通道：URL 带 bohAssetRecovery ⇒ 该页 hasRecovered 恒真、监听器全程惰性
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('boh_vite_preload_reload_ts', String(Date.now()));
      } catch {
        /* 隐私模式等：忽略 */
      }
    });
    const counters = new Map();
    for (const pattern of PROFILE_CSS_PATTERNS) {
      await page.route(pattern, (route) => {
        const n = (counters.get(pattern) || 0) + 1;
        counters.set(pattern, n);
        if (n <= 1) route.abort();
        else route.continue();
      });
    }
    await page.goto(`${BASE}/?bohAssetRecovery=1`, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.location.hash = '#/user-space?tab=posts';
    });
    await page.waitForSelector('.profile-home-shell', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(12000); // 退避重试窗口：700ms / 1.8s / 4s

    const snap = await page.evaluate(sampleStyles, PROFILE_SAMPLES);
    const diff = diffStyles(profileBaseline, snap);
    const diffCount = Object.keys(diff).length;
    note(`  与健康基线的样式差分：${diffCount} 项`);
    note(
      `  差分示例：${
        Object.entries(diff)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${v}`)
          .join('；') || '（无）'
      }`,
    );
    note(`  整页加载次数：${fullLoads.length}（应恒为 1：两条恢复通道都被限流）`);
    note(`  CSS 流水：${cssLog.join(' | ') || '（无）'}`);
    if (diffCount === 0 && fullLoads.length === 1)
      note('  ✔ P0-2 生效：零强制刷新，仅靠页内摘 link 重建把样式修回来了');
    else if (diffCount > 0)
      fail(`场景 D：恢复链被限流后样式未自愈（差分 ${diffCount} 项）—— 自愈重试没接上`);
    if (fullLoads.length > 1) note('  （注意：出现了整页重载，本场景的隔离不成立，结论不可用）');
    consoleErrors.slice(0, 3).forEach((e) => note(`  未捕获错误：${e.slice(0, 100)}`));
    if (consoleErrors.length)
      fail(
        `场景 D：自愈链路自己抛了 ${consoleErrors.length} 条未捕获错误（读 cssRules / 重建 link 必须完全兜住）`,
      );
    else note('  未捕获错误 0 条');
    await ctx.close();
  }

  // ============================================================
  // 场景 E：暗色主题 CSS 瞬时失败 → 页内自愈（主题加载器验收）
  // ============================================================
  note('场景 E —— 暗色主题 CSS 失败自愈（两条恢复通道同样被限流）');
  {
    const { ctx, page, fullLoads, cssLog, consoleErrors, events } = await newPage();
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('boh_vite_preload_reload_ts', String(Date.now()));
      } catch {
        /* 忽略 */
      }
      // 深色主题：index.html 的早期脚本据此设 data-theme=dark，theme-manager 随即 ensureThemeCSS('dark')
      try {
        localStorage.setItem('boh-theme', 'dark');
      } catch {
        /* 忽略 */
      }
    });
    const counters = new Map();
    for (const key of DARK_THEME_KEYS) {
      await page.route(`**/static/css/${key}-*.css`, (route) => {
        const n = (counters.get(key) || 0) + 1;
        counters.set(key, n);
        if (n <= 1) route.abort();
        else route.continue();
      });
    }
    await page.goto(`${BASE}/?bohAssetRecovery=1`, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      window.location.hash = '#/user-space?tab=posts';
    });
    await page.waitForTimeout(12000); // 退避重试窗口：600ms / 1.6s / 3.6s

    const snap = await page
      .evaluate(darkThemeProbe, DARK_THEME_KEYS)
      .catch((e) => ({ __error: String(e).slice(0, 120) }));
    const ok = Object.values(snap).filter((n) => n > 0).length;
    const broken = Object.entries(snap).filter(([, n]) => n <= 0);
    note(`  8 条主题样式已生效 ${ok} 条；整页加载次数：${fullLoads.length}`);
    if (broken.length) note(`  未生效：${broken.map(([k, n]) => `${k}(${n})`).join(', ')}`);
    note(`  CSS 流水：${cssLog.join(' | ') || '（无）'}`);
    if (ok === 8 && fullLoads.length === 1)
      note('  ✔ 主题自愈生效：零强制刷新，8 条暗色样式全部修回');
    else if (ok === 8) note('  ✔ 主题样式全部就位（但发生过整页重载，隔离不成立）');
    else fail(`场景 E：暗色主题样式仍有 ${broken.length} 条未生效 —— 主题自愈没接上`);
    consoleErrors.slice(0, 3).forEach((e) => note(`  未捕获错误：${e.slice(0, 90)}`));
    if (consoleErrors.length) fail(`场景 E：主题自愈链路自己抛了 ${consoleErrors.length} 条错误`);
    if (snap.__error) fail(`场景 E：暗色样式采样失败（${snap.__error}）`);
    note(`  页面事件：${events.join(' , ') || '（无）'}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log('');
if (violations.length) {
  console.error('[css-failure] 未通过：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log('[css-failure] 探针执行完毕（复现记录见上方）。');
}
