/**
 * probe-bohai-mode-loading.mjs — BOH AI「模式清单加载态」探针
 *
 * 三个场景：
 *   1. RPC 延迟 3 秒 → 骨架（`.boh-mm-loading` + `.boh-mm-skeleton`）出现 → 释放后真实模式渲染
 *   2. RPC 500   → 「暂无可用模式」兜底，且骨架不残留
 *   3. 数据即时就绪 → 直接渲染模式清单，无骨架
 *
 * ⚠️ 2026-10-08 两处改写（plans/025 v2 · Step 6-4）：
 *   ① **选择器迁移**：输入区重绘为 `BohComposer.vue`，「胶囊 → 面板 → 模式行 → 左侧二级菜单」
 *      变成**单层面板**（模式清单 + 强度分段 + 高级四工具）：
 *        .composer-panel-trigger → .boh-mode-pill
 *        .composer-panel          → .boh-mode-menu
 *        .composer-panel-loading  → .boh-mm-loading
 *        .mode-skeleton-row/line  → .boh-mm-skeleton
 *        .composer-submenu(.is-left) .composer-submenu-item → .boh-mm-item[data-mode-id]
 *        .composer-submenu-item-name → .boh-mm-name
 *        .mode-menu-empty         → .boh-mm-empty
 *   ② **不再依赖真实网络**：原先「delay」场景用 `route.fetch()` 真打线上 RPC，
 *      本沙箱访问 `*.supabase.co` 会失败 ⇒ 改为**直接用固定模式清单 mock 兜住**，
 *      延迟由本地 setTimeout 控制。这样三档场景在离线环境也完全可复现。
 *      （代价：不再回归「真实 RPC 能通」—— 那条由线上冒烟覆盖，不是本探针的职责。）
 *
 * 2026-10-08 晚（用户样稿第二轮）：面板改**两视图**——打开默认停在「强度」视图，
 *   模式清单收进「模型」视图（`.boh-effort-mode` 进入）。因此 openModeMenu 多一步：
 *   点胶囊 → 点「模型名 ›」→ 才能看到骨架 / 空态 / 清单。
 *
 * 用法：BASE=http://localhost:5173 node scripts/probes/probe-bohai-mode-loading.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const SHOT_DIR = 'debug-screenshots';
const results = {};

const SEL = {
  trigger: '.boh-mode-pill',
  panel: '.boh-mode-menu',
  modeLink: '.boh-effort-mode',
  modeItem: '.boh-mm-item[data-mode-id]',
  itemName: '.boh-mm-name',
  loading: '.boh-mm-loading',
  skeletonRow: '.boh-mm-skeleton',
  empty: '.boh-mm-empty',
};

/**
 * 固定模式清单（`list_public_bohai_modes` 的行形状：`mode_id` / `display_name` / `min_tier` /
 * `sort_order`；同时带上 `id` / `name` 兼容另一条映射路径）。
 */
const MOCK_MODES = [
  {
    id: 'fast',
    mode_id: 'fast',
    // ⚠️ `model_id` 必填（2026-10-08 修）：`normalizeBohaiModelConfigRow`
    // （src/utils/api/bohai-model-config-api.js:28）`if (!modeId || !modelId || !displayName) return null`
    // 会把**缺 model_id 的行整条丢掉**。首版 mock 三条都没给 model_id ⇒ 3 条全被过滤掉、
    // 面板只剩兜底那 1 条 ⇒ 走「只有一条模式」的短路分支、把 `s1_switch_and_close` 写死成
    // true，模式切换回归**从来没被测过**，而该分支在沙箱里恒成立（注释还自承了这点）。
    model_id: 'deepseek-ai/DeepSeek-V3',
    name: 'Fast',
    display_name: 'Fast',
    tagline: '极速响应',
    min_tier: 'free',
    status: 'active',
    sort_order: 10,
    quota_multiplier: 1,
  },
  {
    id: 'air',
    mode_id: 'air',
    model_id: 'deepseek-ai/DeepSeek-V3',
    name: 'Air',
    display_name: 'Air',
    tagline: '均衡',
    min_tier: 'free',
    status: 'active',
    sort_order: 20,
    quota_multiplier: 1,
  },
  {
    id: 'code',
    mode_id: 'code',
    model_id: 'deepseek-ai/DeepSeek-R1',
    name: 'Code',
    display_name: 'Code',
    tagline: '编码',
    min_tier: 'plus',
    status: 'active',
    sort_order: 30,
    quota_multiplier: 2,
  },
];

const browser = await chromium.launch({ channel: 'chrome' });

async function newPage(routeMode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error')
      consoleMsgs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

  if (routeMode === 'delay' || routeMode === 'fail500' || routeMode === 'ready') {
    await page.route('**/rest/v1/rpc/list_public_bohai_modes*', async (route) => {
      if (routeMode === 'fail500') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
        return;
      }
      if (routeMode === 'delay') await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_MODES),
      });
    });
  }
  return { context, page, consoleMsgs };
}

async function clipOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return undefined;
  return {
    x: Math.max(0, box.x - 40),
    y: Math.max(0, box.y - 260),
    width: Math.min(1280, box.width + 80),
    height: Math.min(900 - Math.max(0, box.y - 260), box.height + 300),
  };
}

/** 伪造登录：未登录时壳只放行 `fast` 一个模式（`filteredChatModes`），测不了切换。
 * ⚠️ 会话恢复是**异步**的（本地无会话 ⇒ AuthSessionMissingError），它结束时会用
 * `isLoggedIn=false` **盖掉**过早注入的登录态 —— 表现是面板只剩内置 fast 一条、
 * mock 白答（2026-10-08 实测抓到）。所以注入必须是「注入 → 等一拍 → 复核 → 被盖掉就重注」
 * 的循环，直到登录态站稳（store 的 init 只跑一次，站稳后不会再被改）。 */
async function injectAuth(page) {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  const setLoggedIn = () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user' });
  };
  const isLoggedIn = () =>
    page.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      return pinia?.state.value?.auth?.isLoggedIn === true;
    });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.evaluate(setLoggedIn);
    await page.waitForTimeout(400);
    if (await isLoggedIn()) {
      await page.waitForTimeout(300);
      if (await isLoggedIn()) return;
    }
  }
  throw new Error('injectAuth: 登录态反复被会话恢复覆盖，10 次注入未站稳');
}

/** 底行胶囊 → 面板（默认强度视图）→ 点「模型名 ›」进模型视图（模式清单就在那里） */
async function openModeMenu(page) {
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector(SEL.trigger, { timeout: 15000 });
  await page.locator(SEL.trigger).first().scrollIntoViewIfNeeded();
  await page.locator(SEL.trigger).first().click();
  await page.waitForSelector(SEL.panel, { state: 'visible', timeout: 5000 });
  await page.locator(SEL.modeLink).first().click();
  await page.waitForTimeout(220);
}

const checks = {};

// ---------- 场景 1: 延迟 3 秒（加载态 + 成功态 + 切换回归） ----------
{
  const { context, page, consoleMsgs } = await newPage('delay');
  await openModeMenu(page);

  const loading = await page.evaluate((SEL) => {
    const panel = document.querySelector(SEL.panel);
    return {
      panelOpen: !!panel && getComputedStyle(panel).display !== 'none',
      hasLoadingBlock: !!panel?.querySelector(SEL.loading),
      skeletonCount: panel?.querySelectorAll(SEL.skeletonRow).length || 0,
      hasLoadingHint: panel?.textContent?.includes('模式加载中…') || false,
      hasEmptyFallback: !!panel?.querySelector(SEL.empty),
      modeItemCount: panel?.querySelectorAll(SEL.modeItem).length || 0,
    };
  }, SEL);
  results.loadingState = loading;
  results.loadingShot = await clipOf(page, SEL.panel);
  await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-loading-delayed.png` });
  checks.s1_skeleton_shown =
    loading.panelOpen && loading.hasLoadingBlock && loading.skeletonCount > 0;
  checks.s1_no_modes_while_loading = loading.modeItemCount === 0;

  await page.waitForSelector(`${SEL.panel} ${SEL.modeItem}`, { state: 'visible', timeout: 8000 });
  const loaded = await page.evaluate((SEL) => {
    const panel = document.querySelector(SEL.panel);
    const trigger = document.querySelector(SEL.trigger);
    return {
      loadingBlockGone: !panel?.querySelector(SEL.loading),
      hasEmptyFallback: !!panel?.querySelector(SEL.empty),
      optionCount: panel?.querySelectorAll(SEL.modeItem).length || 0,
      optionNames: [...(panel?.querySelectorAll(SEL.itemName) || [])].map((el) =>
        el.textContent.trim(),
      ),
      triggerText: trigger?.textContent.trim(),
    };
  }, SEL);
  results.loadedState = loaded;
  // 本探针测的是**加载态生命周期**：pending 时有骨架 → 释放后骨架消失且不再空态。
  //
  // ⚠️ 条数下限从 1 提到 2（2026-10-08）：mock 里 `min_tier: 'free'` 的有两条（fast / air），
  // 所以 free 档理应看到 ≥2 条。下限留在 1 的话，mock 一旦又被整条过滤掉
  // （缺 `model_id` 就会），探针只会「少一条」然后照样全绿 —— 那正是首版的失败方式。
  // 现在它会连同下面的 `s1_switch_and_close` 一起判红。
  checks.s1_loaded_after_delay =
    loaded.loadingBlockGone && !loaded.hasEmptyFallback && loaded.optionCount >= 2;
  try {
    await page.locator(SEL.panel).screenshot({ path: `${SHOT_DIR}/bohai-mode-loaded.png` });
  } catch {
    await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-loaded.png` });
  }

  // 切换回归：选另一个模式 → 整个面板收起 + 胶囊文案更新
  const before = loaded.triggerText;
  if (loaded.optionCount > 1) {
    const target = page.locator(`${SEL.panel} ${SEL.modeItem}`).nth(1);
    const targetName = (await target.locator(SEL.itemName).textContent()).trim();
    await target.click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(
      (SEL) => document.querySelector(SEL.trigger)?.textContent.trim(),
      SEL,
    );
    const panelClosed = await page.evaluate((SEL) => {
      const el = document.querySelector(SEL.panel);
      return !el || getComputedStyle(el).display === 'none';
    }, SEL);
    results.modeSwitch = {
      before,
      clicked: targetName,
      after,
      changed: before !== after,
      panelClosedAfterPick: panelClosed,
    };
    checks.s1_switch_and_close = before !== after && panelClosed;
    await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-switched.png` });
  } else {
    // ⚠️ 2026-10-08：这里原先是 `checks.s1_switch_and_close = true`（恒真）。
    // 本文件尾部的 `process.exit(results.pass ? 0 : 1)` 门禁会把这条恒真断言变成
    // 「洗绿」——模式切换真坏掉时它照样 PASS。mock 补上 `model_id` 后本分支不该再命中，
    // 所以改成**如实判红**：真只有一条模式时必须有人来看一眼，而不是自动放行。
    results.modeSwitch = {
      skipped: true,
      note: '只有一条模式可选，未能验证切换回归（mock 缺 model_id 会被 normalize 整条丢弃）',
      optionCount: loaded.optionCount,
    };
    checks.s1_switch_and_close = false;
  }
  results.consoleMsgsScenario1 = consoleMsgs.slice(0, 10);
  await context.close();
}

// ---------- 场景 2: RPC 500 失败兜底 ----------
{
  const { context, page, consoleMsgs } = await newPage('fail500');
  await openModeMenu(page);
  await page.waitForTimeout(1500); // 等 loading 结束
  const failed = await page.evaluate((SEL) => {
    const panel = document.querySelector(SEL.panel);
    return {
      hasEmptyFallback: !!panel?.querySelector(SEL.empty),
      emptyText: panel?.querySelector(SEL.empty)?.textContent.trim() || '',
      hasLoadingBlock: !!panel?.querySelector(SEL.loading),
      skeletonCount: panel?.querySelectorAll(SEL.skeletonRow).length || 0,
      optionCount: panel?.querySelectorAll(SEL.modeItem).length || 0,
    };
  }, SEL);
  results.fail500State = failed;
  checks.s2_empty_fallback =
    failed.hasEmptyFallback && !failed.hasLoadingBlock && failed.skeletonCount === 0;
  try {
    await page.locator(SEL.panel).screenshot({ path: `${SHOT_DIR}/bohai-mode-empty-fallback.png` });
  } catch {
    await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-empty-fallback.png` });
  }
  results.consoleMsgsScenario2 = consoleMsgs.slice(0, 10);
  await context.close();
}

// ---------- 场景 3: 数据即时就绪（回归） ----------
{
  const { context, page } = await newPage('ready');
  await openModeMenu(page);
  await page.waitForSelector(`${SEL.panel} ${SEL.modeItem}`, { state: 'visible', timeout: 15000 });
  const ready = await page.evaluate((SEL) => {
    const panel = document.querySelector(SEL.panel);
    return {
      optionCount: panel?.querySelectorAll(SEL.modeItem).length || 0,
      hasLoadingBlock: !!panel?.querySelector(SEL.loading),
      hasEmptyFallback: !!panel?.querySelector(SEL.empty),
    };
  }, SEL);
  results.readyState = ready;
  checks.s3_no_skeleton_when_ready =
    ready.optionCount >= 1 && !ready.hasLoadingBlock && !ready.hasEmptyFallback;
  await context.close();
}

results.checks = checks;
results.pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.pass ? 0 : 1);
