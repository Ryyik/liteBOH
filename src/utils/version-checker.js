import { logger } from './logger.js';
import { hasActiveUpload } from './upload-activity.js';
import { captureUpdateContinuity } from './update-continuity.js';

// ============================================
// 独立版本指纹检测器
// 绕过 Service Worker 缓存，直接通过 HTTP 拉取 version.json 比对
// 版本不一致时：注销 SW + 清空 Cache Storage + 强制刷新
//
// 版本数据分离：
// - version: 语义版本（如 4.7.2，用户可见展示）
// - buildId: 构建指纹（commit+timestamp，内部比对基准）
// 比对 buildId 而非 version，确保同版本重新部署（hotfix）也能触发更新
// ============================================

const CHECK_INTERVAL = 90 * 1000; // 前台**活跃**时每 90 秒检查一次（挂机降频见 shouldPollNow）
// 挂机降频窗口：连续这么久没有任何交互（pointerdown / keydown）就不再轮询。
//
// 为什么要降：version.json 走 DYNAMIC + `?_t=Date.now()` + `cache:'no-store'`，
// 每次都要绕缓存回源 —— 90s 一轮 = **每个前台标签页 40 次/时**，挂机看板/投屏
// 这种「开着但没人碰」的标签页纯属白烧。降频后挂机时段请求为 0，下一次交互
// 会立刻补查一次（见 markInteraction），新鲜度和成本的折中就在这里。
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
// 页面隐藏超过这个时长后切回，才允许「切回即自动强刷」：短暂切走（回消息、切窗口）
// 不打断；离开较久再回来时，页面本来就要重新进入，刷新代价最低。
const AUTO_APPLY_AFTER_HIDDEN_MS = 30 * 1000;
/* 空闲窗口（2026-11-23 新增，第五条静默通道）：连续这么久没有任何交互 ⇒ 切换构建。
   20s 的取法：短于「回消息、看一眼别处」的典型离去时长，长于「读一段话、想一下」的
   停顿 —— 后者用户其实还在这一页上，不该在这时候把它刷掉。 */
const IDLE_APPLY_MS = 20 * 1000;
/* 空闲检查的轮询粒度。不发请求，只读 pendingUpdate，所以可以密。 */
const IDLE_TICK_MS = 3 * 1000;
const VERSION_URL = './version.json'; // 相对路径，适配任意部署路径
const RELOAD_TARGET_KEY = 'boh_version_reload_target';
const UPDATE_QUERY_KEY = '__boh_update';
const VERSION_REQUEST_TIMEOUT = 10_000;
// 新 SW 必须下载完整新预缓存才能激活并接管页面，本地弱网下远超秒级，
// 这里给足等待窗口；超时后走「注销旧 SW + 直连网络导航」的兜底（见 forceCleanAndReload）。
const SERVICE_WORKER_UPDATE_TIMEOUT = 10_000;

let intervalId = null;
let idleApplyTimer = null;
let visibilityHandler = null;
let interactionHandler = null;
/** 最近一次用户交互时间戳（0 = 本会话还没有交互记录） */
let lastInteractionAt = 0;
/** 挂机期间跳过了轮询 ⇒ 下一次交互要补查一次，否则回神后迟迟看不到新版本 */
let idleSkipPending = false;
let versionFetchInFlight = null;
let automaticCheckInFlight = null;
let currentVersion = null; // 当前语义版本（来自 meta boh-version，如 4.7.2）
let currentBuildId = null; // 当前构建指纹（来自 meta boh-build-id，用于比对）

/* ============================================
   未提交内容追踪（自动强刷的护栏）
   ============================================
   为什么需要：自动强刷最大的代价是丢掉用户没提交的内容。只看
   `document.activeElement` 不够 —— 用户打完字、点了别处（滚动页面 / 切预览 /
   点空白处收键盘）再切走标签页时，activeElement 已经回到 body，护栏直接失效。
   那种情况下切回被强刷 = 内容凭空消失。

   判据用「input 事件 + 当前值非空」标记：
     · 程序化回填（v-model 载入已有数据、草稿恢复）**不触发** input 事件
       ⇒ 不会把「页面本来就有内容」误判成用户输入；
     · 用户把内容清空后标记自动撤销（值空即视为干净）；
     · WeakSet 持有元素 ⇒ 元素销毁后自动回收，无需手工清理。

   刻意**只收文本型输入**（text-like input / textarea / contenteditable）：
   select / checkbox / file 的「值」不代表未提交内容（勾选态、筛选条件刷新后重置
   只是小困扰，不是数据丢失），收进来会让列表页一碰筛选就永久禁用自动更新。
   论坛发帖另有一层实时暂存（`_autosave`），这里的护栏是给没有暂存机制的表单兜底。
   ============================================ */
const dirtyEditables = new WeakSet();

/**
 * 文本型输入类型。
 * ⚠️ **不含 `search`**：搜索框里的词是「筛选条件」，不是待提交内容 ——
 * 收进来会让任何带常驻筛选框的页面（商城 / 四个控制台 / Cloud+ / 抽奖发放）
 * 在页存续期间一直把自动应用降级成提示（2026-11-01 复核：临时用例实测拦住强刷）。
 * 全站搜索面板本身是关即卸载（导航栏 v-if 渲染），不受这条影响。
 */
const TEXT_INPUT_TYPES = new Set([
  'text',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

const isTextEditable = (el) => {
  if (!el || el.nodeType !== 1) return false;
  // 显式逃生口：给「值不代表未提交内容」的输入框（筛选框、命令面板等）用
  if (el.hasAttribute?.('data-no-guard')) return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = String(el.type || 'text').toLowerCase();
    if (type === 'search') return false;
    return TEXT_INPUT_TYPES.has(type);
  }
  return el.isContentEditable === true;
};

const readEditableText = (el) => {
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA') return String(el.value ?? '');
  return String(el.textContent ?? '');
};

const trackEditableInput = (event) => {
  const el = event.target;
  if (!isTextEditable(el)) return;
  if (readEditableText(el).trim()) dirtyEditables.add(el);
  else dirtyEditables.delete(el);
};

/** 页面上是否有用户填过、还没提交的内容。保守方向：误判为脏只会退化成弹提示。 */
const hasUnsavedEditableContent = () => {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
    return false;
  }
  const nodes = document.querySelectorAll('input, textarea, [contenteditable]');
  for (const el of nodes) {
    if (!dirtyEditables.has(el)) continue;
    if (readEditableText(el).trim()) return true;
  }
  return false;
};

export const shouldAutoApplyVersion = (remoteBuildId, attemptedBuildId = '') => {
  const target = String(remoteBuildId || '').trim();
  return Boolean(target && target !== String(attemptedBuildId || '').trim());
};

export const buildVersionReloadPath = (href, targetBuildId = '') => {
  const reloadUrl = new URL(href);
  reloadUrl.searchParams.delete('forceUpdate');
  reloadUrl.searchParams.delete('clearCache');
  reloadUrl.searchParams.set(UPDATE_QUERY_KEY, String(targetBuildId || Date.now()));
  return `${reloadUrl.pathname}${reloadUrl.search}${reloadUrl.hash}`;
};

// Safari 在注销仍控制当前页面的 SW 后立刻导航时，仍可能命中旧的 NavigationRoute
// 缓存。更新时应先让新 SW 接管；其 cleanupOutdatedCaches 会负责移除旧预缓存。
// 返回 true 表示「可以安全导航」：要么新 SW 已接管（其预缓存里有新 index.html），
// 要么根本没有会拦截导航的 SW；返回 false 表示新 SW 未能及时接管，调用方必须
// 先注销旧 SW 再导航（旧 SW 会用旧预缓存的 index.html 应答任何导航，
// 查询串只影响 HTTP 缓存、影响不了 SW 预缓存 → 否则用户会看到一模一样的旧页面）。
const updateServiceWorkerBeforeReload = async () => {
  if (!('serviceWorker' in navigator)) return false;

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (!registrations.length) return false;

  let controllerChangeHandler = null;
  let timeoutId = null;
  const controllerChanged = new Promise((resolve) => {
    controllerChangeHandler = () => resolve(true);
    navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler, {
      once: true,
    });
  });
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve(false), SERVICE_WORKER_UPDATE_TIMEOUT);
  });

  try {
    // 先让浏览器重新拉取 sw.js（updateViaCache:'none'，只等脚本字节比对完成，
    // 不等新 SW 的全量预缓存下载）。installing/waiting 一旦出现说明确有新版本。
    // 整条链路（update + 等接管）与超时对跑：弱网下 update() 挂起时也能按时兜底。
    const updatePromise = Promise.allSettled(
      registrations.map((registration) => registration.update()),
    );
    const flow = updatePromise.then(() => {
      const hasPendingWorker = registrations.some(
        (registration) => registration.installing || registration.waiting,
      );
      if (!hasPendingWorker) {
        // 没有新 SW：当前活跃 SW 的预缓存清单已是最新，导航即可拿到新应用壳。
        return true;
      }
      // 有新 SW：等它完成安装并 claim 页面（skipWaiting + clientsClaim 下接管
      // 必然触发 controllerchange），新 SW 的预缓存里才有新的 index.html。
      return controllerChanged;
    });
    return await Promise.race([flow, timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    if (controllerChangeHandler) {
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
    }
  }
};

// 兜底：注销所有 SW 并清空 Cache Storage，让下一次导航直连网络。
// 仅在新 SW 无法及时接管时使用。
// ⚠️ 两个实测结论（scripts/probes/probe-version-update-click.mjs 抓到的）：
// ① Chrome 在「有新 SW 正在安装」时，unregister() 的 promise 会拖到安装结束
//    才 resolve（几十秒级），所以发起注销后只能给它一个短限时，不能 await 到底；
// ② 就算旧 SW 因注册未及摘除而继续拦截导航，Cache Storage 已被清空 →
//    workbox 的 NavigationRoute 预缓存未命中会回落到网络 fetch，
//    照样拿到新的 index.html。两件事合起来保证兜底导航必然离开旧文档。
const DISMANTLE_GRACE_MS = 1_000;

const dismantleServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const unregisterPromise = Promise.allSettled(
      registrations.map((registration) => registration.unregister()),
    );
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
    await Promise.race([
      unregisterPromise,
      new Promise((resolve) => window.setTimeout(resolve, DISMANTLE_GRACE_MS)),
    ]);
    logger.warn('version', '已注销旧 SW 并清空缓存，本次导航将直连网络');
  } catch (err) {
    logger.warn('version', '注销旧 Service Worker 失败，仍尝试导航', err);
  }
};

/* ============================================
   预缓存里的应用壳是哪个构建（「没有 pending worker」不能当结论）
   ============================================
   为什么必须有这一层：
     `updateServiceWorkerBeforeReload` 原先把「update() 完成后既无 installing 也无
     waiting」当成「当前活跃 SW 的预缓存已是最新」→ 直接导航。这个假设在两种情况下
     不成立，而两种情况的后果都一模一样（用户点「立即更新」拿回一模一样的旧页面）：
       · sw.js 本身被中间层缓存住 —— GitHub Pages 给 .js 发 max-age=14400，
         Cloudflare 默认又把 .js 纳入边缘缓存 ⇒ registration.update() 逐字节相同、
         浏览器判定「没有新 SW」；
       · 新 SW 安装中途失败（预缓存任一 URL 拉不到）⇒ installing 变 null。
     两情况下旧 SW 仍然控制页面，它的 NavigationRoute 会用**旧预缓存里的
     index.html** 应答导航：__boh_update 只影响 HTTP 缓存，影响不了 SW 预缓存。
     接着 sessionStorage 里已写入目标 buildId ⇒ 启动自检的
     shouldAutoApplyVersion 判定「这个目标试过了」⇒ 不自动强刷，只再弹一次窗
     ⇒ 表现就是「点更新 → 还是弹」，永远出不来（2026-11-10 用户报障）。
   判据不用缓存实现细节，只用标准 Cache API：翻一遍 Cache Storage 里名为
   index.html 的条目，读出它 HTML 里的 boh-build-id。
   ============================================ */
const readBuildIdFromHtml = (html) => {
  const source = String(html || '');
  const byNameFirst = /<meta[^>]*name=["']boh-build-id["'][^>]*content=["']([^"']+)["']/i.exec(
    source,
  );
  if (byNameFirst) return byNameFirst[1];
  const byContentFirst = /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']boh-build-id["']/i.exec(
    source,
  );
  return byContentFirst ? byContentFirst[1] : '';
};

/**
 * 读「当前活跃 SW 预缓存里的应用壳」是哪个构建。
 * @returns {Promise<string>} buildId；'' 表示读不到（无 Cache API / 没有壳条目 / 读失败）
 *   ⇒ 调用方按「无法判定」处理，退回改动前的行为，不要因为读不到就清缓存。
 */
const readPrecachedShellBuildId = async () => {
  if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return '';
  try {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      const shellRequest = requests.find((request) => {
        try {
          return /(^|\/)index\.html$/i.test(new URL(request.url).pathname);
        } catch {
          return false;
        }
      });
      if (!shellRequest) continue;
      const response = await cache.match(shellRequest);
      if (!response) continue;
      const buildId = readBuildIdFromHtml(await response.text());
      if (buildId) return buildId;
    }
  } catch (err) {
    logger.warn('version', '读取预缓存应用壳失败，按无法判定处理', err?.message || err);
  }
  return '';
};

const readReloadTarget = () => {
  let storedTarget = '';
  try {
    storedTarget = sessionStorage.getItem(RELOAD_TARGET_KEY) || '';
  } catch (err) {
    logger.warn('version', '无法读取目标构建标记', err);
  }
  if (storedTarget) return storedTarget;

  // sessionStorage 不可用时，刷新 URL 中的目标构建仍能阻止自动刷新循环。
  try {
    return new URL(window.location.href).searchParams.get(UPDATE_QUERY_KEY) || '';
  } catch {
    return '';
  }
};

const writeReloadTarget = (targetBuildId) => {
  try {
    sessionStorage.setItem(RELOAD_TARGET_KEY, targetBuildId);
  } catch (err) {
    logger.warn('version', '无法记录目标构建，继续执行更新', err);
  }
};

const clearReloadTarget = () => {
  try {
    sessionStorage.removeItem(RELOAD_TARGET_KEY);
  } catch (err) {
    logger.warn('version', '无法清除目标构建标记', err);
  }
};

/**
 * 从 meta 标签读取当前页面语义版本
 * 该版本在构建时由 bohVersionPlugin 注入到 index.html
 */
const readCurrentVersion = () => {
  const meta = document.querySelector('meta[name="boh-version"]');
  return meta?.getAttribute('content') || null;
};

/**
 * 从 meta 标签读取当前页面构建指纹
 * 该指纹在构建时由 bohVersionPlugin 注入到 index.html
 */
const readCurrentBuildId = () => {
  const meta = document.querySelector('meta[name="boh-build-id"]');
  return meta?.getAttribute('content') || null;
};

/**
 * 强制拉取远程 version.json
 * 使用 cache: 'no-store' 绕过浏览器缓存
 * 加时间戳查询参数绕过 CDN 缓存（GitHub Pages CDN 对 .json 有缓存）
 */
const fetchRemoteVersion = () => {
  if (versionFetchInFlight) return versionFetchInFlight;

  versionFetchInFlight = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), VERSION_REQUEST_TIMEOUT);
    try {
      const url = `${VERSION_URL}?_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`version.json 请求失败: ${res.status}`);
      }
      return await res.json();
    } finally {
      window.clearTimeout(timeoutId);
    }
  })().finally(() => {
    versionFetchInFlight = null;
  });

  return versionFetchInFlight;
};

/**
 * 解析本次更新要落到哪个构建。
 *
 * 调用方不给目标时（main.js 的 SW updatefound 那条补充路径就是这种：它只知道
 * 「有新 SW 装好了」，不知道版本号），必须先问 version.json 要到目标的 buildId ——
 * 否则 `boh_version_reload_target` 记不下目标、`__boh_update` 只是时间戳，
 * 两道防循环护栏同时失效，一旦落地失败就会无限重试。
 *
 * @returns {Promise<string>} '' = 确实拿不到（离线 / version.json 不可读），
 *   此时退回「没有目标的旧流程」，不做预缓存判定。
 */
const resolveTargetBuildId = async (targetBuildId) => {
  const given = String(targetBuildId || '').trim();
  if (given) return given;
  if (pendingUpdate?.remoteBuildId) return String(pendingUpdate.remoteBuildId);
  try {
    const remote = await fetchRemoteVersion();
    if (remote?.buildId && remote.buildId !== currentBuildId) return String(remote.buildId);
  } catch (err) {
    logger.warn('version', '解析更新目标失败，按无目标流程更新', err?.message || err);
  }
  return '';
};

/**
 * 让最新 Service Worker 接管后，使用带构建指纹的导航刷新页面。
 * 不主动删除 Workbox 缓存：旧 SW 仍控制当前页面时清缓存会让导航继续命中旧应用壳。
 */
export const forceCleanAndReload = async (targetBuildId = '') => {
  const safeTargetBuildId = await resolveTargetBuildId(targetBuildId);
  const reloadPath = buildVersionReloadPath(window.location.href, safeTargetBuildId);

  /* 采集现场（2026-11-23）：静默切换能「不让用户看见」的前提就是这一步 ——
     之后再补就没机会了，整页导航一旦开始，旧文档的滚动位置就没了。
     放在这里而不是各调用方：五个静默通道（冷启动/切回/导航/空闲/落点自救）
     全都汇入本函数，只有一处采集才不会有漏。 */
  if (captureUpdateContinuity()) {
    logger.debug('version', '已记录当前滚动位置，切换后复原');
  }

  logger.info('version', '开始切换到最新应用壳', {
    from: currentVersion,
    buildId: currentBuildId,
    target: safeTargetBuildId || '(未知)',
  });

  let takeoverReady = false;
  try {
    if (safeTargetBuildId) {
      writeReloadTarget(safeTargetBuildId);
    }

    if ('serviceWorker' in navigator) {
      takeoverReady = await updateServiceWorkerBeforeReload();
      // ⚠️ 「没有 pending worker」≠「预缓存里的壳已是最新」：sw.js 被边缘/中间层
      // 缓存住、或新 SW 安装中途失败时，两者同时为假却都看不到 installing/waiting。
      // 这里必须**正面核对**预缓存里的 index.html 是不是目标构建，否则导航会被
      // 旧 SW 的旧预缓存应答 → 用户点「立即更新」拿回一模一样的旧页面。
      if (takeoverReady && safeTargetBuildId) {
        const precachedBuildId = await readPrecachedShellBuildId();
        if (precachedBuildId && precachedBuildId !== safeTargetBuildId) {
          logger.warn(
            'version',
            '无 pending worker，但预缓存里的应用壳仍是旧构建（sw.js 很可能被缓存住），改走注销兜底',
            { precachedBuildId, target: safeTargetBuildId },
          );
          takeoverReady = false;
        }
      }
    }
  } catch (err) {
    logger.error('version', '强制更新流程出错', err);
  } finally {
    // 只有「新 SW 已接管（预缓存里有新 index.html）」或「无 SW 拦截」时才能直接导航。
    // 否则必须先注销旧 SW：旧 SW 的 NavigationRoute 会用旧预缓存的 index.html
    // 应答任何带查询串的导航，用户点「立即更新」后会看到一模一样的旧页面。
    if (!takeoverReady) {
      await dismantleServiceWorkers();
    }
    // 无论清理成功、失败或超时，都必须离开当前旧文档。查询参数同时
    // 绕过浏览器和 CDN 对 index.html 的缓存，并保留 Hash 路由。
    try {
      window.location.replace(reloadPath);
    } catch (err) {
      logger.error('version', '更新导航失败，退回普通刷新', err);
      window.location.reload();
    }
  }
};

// ============================================
// 引导超时自救（src/App.vue 10s 兜底专用入口）
// 引导卡死最常见的原因是「本机旧构建撞上新部署」：旧 index.html 引用的 hash chunk
// 已被删除。这一步用 version.json 判定是不是这种情况 —— 是，就自动强刷，用户
// 不用手点「重新加载」；不是（真网络差 / 已是最新），就交还报错态，绝不动用户
// 缓存（强刷会清空预缓存，弱网下二次加载反而更慢）。
// 护栏与启动 autoApply 完全同一套：shouldAutoApplyVersion + reload target，
// 同一目标 buildId 只试一次，CDN 尚未切换时不会形成刷新循环。
// ============================================

/**
 * 判定「这次引导超时是不是旧构建撞上新部署」并自救。
 * @returns {Promise<'reloading'|'no-update'|'unreachable'|'cooldown'|'dev'|'no-meta'>}
 *   reloading    已发起 forceCleanAndReload（调用方切换到「更新中」态）
 *   no-update    线上与当前同构建（真网络慢），调用方维持报错态
 *   unreachable  version.json 拉取失败（离线/CDN 异常），调用方维持报错态
 *   cooldown     该目标构建本次会话已尝试过，不重复强刷（防循环）
 *   dev/no-meta  开发环境 / 页面缺版本 meta（旧缓存页面），不采取动作
 */
export const recoverIfStaleBuild = async () => {
  if (import.meta.env.DEV) return 'dev';
  const localBuildId = readCurrentBuildId();
  if (!localBuildId) return 'no-meta';
  let remote;
  try {
    remote = await fetchRemoteVersion();
  } catch {
    // version.json 拉不到：多半是真网络问题。此时强刷只会雪上加霜，交给报错态。
    return 'unreachable';
  }
  if (!remote?.buildId || remote.buildId === localBuildId) return 'no-update';
  if (!shouldAutoApplyVersion(remote.buildId, readReloadTarget())) return 'cooldown';
  logger.info('version', '引导超时且线上有新构建，自动清理旧缓存并刷新', {
    currentBuildId: localBuildId,
    remoteBuildId: remote.buildId,
  });
  void forceCleanAndReload(remote.buildId);
  return 'reloading';
};

/* ============================================
   落地失败的一次性自救（打断「点更新 → 还是弹」的死循环）
   ============================================
   症状：带着 `__boh_update=<目标>` 回来，自己的壳却还是旧构建。
   成因：上一跳导航被旧 SW 的旧预缓存应答了（sw.js 被缓存住 / 新 SW 安装失败 /
   任何我们没枚举到的中间层）。此时 `boh_version_reload_target` 已写入目标，
   `shouldAutoApplyVersion` 判定「这个目标试过了」⇒ 自动强刷被关掉，只剩反复弹窗。

   这里做**一次性**硬重置：注销所有 SW + 清空全部 Cache Storage，再回到不带
   `__boh_update` 的干净地址（清空缓存后旧 SW 的预缓存必然落空 → 导航直连网络，
   这是 probe-version-update-click 已验证过的兜底路径）。
   `boh_version_hard_reset` 记住已硬重置过的目标 ⇒ 同一目标只干一次；再失败就
   老实弹提示，绝不无限刷新。

   护栏与自动强刷同一套：有上传在跑 / 有填了没提交的输入就不动，退化成弹提示。
   ============================================ */
const HARD_RESET_TARGET_KEY = 'boh_version_hard_reset';

const readHardResetTarget = () => {
  try {
    return sessionStorage.getItem(HARD_RESET_TARGET_KEY) || '';
  } catch {
    return '';
  }
};

const writeHardResetTarget = (targetBuildId) => {
  try {
    sessionStorage.setItem(HARD_RESET_TARGET_KEY, targetBuildId);
    // 写完必须读回来核对：某些隐私模式/配额异常下 setItem 静默失败或 getItem 抛错，
    // 那样闸门等于不存在 —— 宁可退回弹提示，也不能冒无限刷新的风险。
    if (sessionStorage.getItem(HARD_RESET_TARGET_KEY) !== targetBuildId) {
      logger.warn('version', '硬重置标记写入后读不回，跳过硬重置');
      return false;
    }
    return true;
  } catch (err) {
    // ⚠️ 写不进标记就**绝不能**硬重置：标记是唯一的防循环闸门，
    // 落不了盘意味着每次加载都会重置一次 = 无限刷新，比反复弹窗更糟。
    logger.warn('version', '无法记录硬重置标记，跳过硬重置', err?.message || err);
    return false;
  }
};

/**
 * 本次加载是否该做「落地失败」的硬重置。抽成纯函数是为了可测。
 * @param {string} localBuildId  当前页面 meta 里的构建指纹
 * @param {string} target        上一次导航想落到哪个构建
 * @param {string} alreadyReset  已经硬重置过的目标（空 = 还没重置过）
 */
export const shouldHardResetStaleLanding = (localBuildId, target, alreadyReset) => {
  if (!localBuildId || !target) return false;
  if (target === localBuildId) return false; // 已经落地到目标
  return String(alreadyReset || '') !== String(target);
};

/**
 * 若「带着更新目标回来却仍是旧壳」，做一次硬重置并导航。
 * @returns {Promise<boolean>} true = 已发起导航（调用方不要再做版本检查/弹窗）
 */
export const recoverStaleLanding = async () => {
  if (import.meta.env.DEV) return false;
  const localBuildId = readCurrentBuildId();
  const target = readReloadTarget();
  // 同一目标只硬重置一次（这是防刷新循环的唯一闸门，别删）
  if (!shouldHardResetStaleLanding(localBuildId, target, readHardResetTarget())) return false;
  // 上传中的代价不可恢复、未提交内容是用户的字 —— 一律退化成弹提示
  if (hasActiveUpload() || hasUnsavedEditableContent()) {
    logger.info('version', '落地仍是旧壳，但用户正在上传/有未提交内容，暂不硬重置');
    return false;
  }
  // 标记写不下就别重置（否则每次加载都会重置 = 无限刷新）
  if (!writeHardResetTarget(target)) return false;

  logger.warn('version', '带着更新目标回来却仍是旧壳，执行一次性硬重置', {
    localBuildId,
    target,
  });

  /* 硬重置同样是「整页重新加载」，用户眼前的位置照样会丢 —— 也要采集现场。
     2026-11-23 补：这条路径此前**绕过 forceCleanAndReload 直接调 location.replace**，
     于是成了「更新接续」的一个漏口。
     ⚠️ 必须带 preserveExisting：走到这里说明**新文档已经加载完**（scrollY=0、
     docH 只有一屏），重新采集会把上一次记下的真实位置覆盖成 0 —— 实测证据是
     window.name 抓到 `yAtCapture:0, docH:800`，而切换前用户实际在 600px。 */
  captureUpdateContinuity({ preserveExisting: true });

  await dismantleServiceWorkers();

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete(UPDATE_QUERY_KEY);
  try {
    window.location.replace(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  } catch (err) {
    logger.error('version', '硬重置导航失败，退回普通刷新', err);
    window.location.reload();
  }
  return true;
};

/* 「已知有新构建但还没应用」的状态。
   启动时那条 autoApply 只覆盖「冷启动就发现是旧构建」；用户一直开着页面时，
   轮询/可见性检查发现更新只会弹 toast，页面继续跑旧构建 —— 而他下一次点击导航
   正好去请求已被新部署删掉的 hash 资源（实测：点底栏毫无反应 / 半样式）。
   所以把这个状态留在这里，交给 router 的导航守卫在**用户本来就要换页的那一拍**应用。 */
let pendingUpdate = null;

/* ============================================
   「发现新构建」之后做什么：只记挂起态，不通知任何人
   ============================================
   2026-11-23 口径（用户定稿）：**更新不弹窗、也不做通知**。

   为什么把「通知」整个删掉，而不只是把弹窗换成一个更轻的提示：
     ① 两个选项的**执行结果完全一样**。用户点「立即更新」走的是
        forceCleanAndReload(remoteBuildId)，系统在静默窗口做的也是这一句。
        既然结果相同，问与不问不产生任何决策差异。
     ② 「新版本」这三个字**不携带决策依据**。用户不知道改了什么、刷新会丢什么，
        他手里的信息严格少于系统 —— 系统知道此刻有没有上传在跑、焦点在不在输入框、
        有没有媒体在播、有没有填了没提交的内容。把判断权交给信息更少的一方，
        不是体贴，是把责任推给用户。
     ③ 通知本身是**在掩盖副作用**，不是消除副作用。页面跳回顶部、展开的帖子收起、
        白屏一闪 —— 这些该由状态接续（update-continuity.js）和快照垫层解决；
        解决了就不需要说，没解决就先说一声只是把「跳了」变成「跳了还多一个框」。

   所以现在的语义是**顺延**（defer），而不是询问（ask）：
     护栏命中 ⇒ 什么都不做，把挂起态留在 pendingUpdate 里，
     等下一个静默窗口（切回 / 导航 / 空闲 20s / 冷启动）自然应用。
     护栏全都是**有明确结束点**的（上传有 begin/end 计数、输入有 blur、
     播放有 pause/ended），所以「等一会儿」总能等到，不存在永久卡死。
   ============================================ */

/**
 * 记录「远端有新构建可用」。
 * 与「弹提示」彻底分开：这里只写状态，不产生任何用户可见的东西。
 */
export const markUpdateAvailable = (remoteVersion, remoteBuildId) => {
  if (!remoteBuildId) return;
  pendingUpdate = { remoteVersion: remoteVersion || '', remoteBuildId: String(remoteBuildId) };
};

/** 读当前挂起的更新（无调用方：留给调试/测试读数，别按「有人用」去改签名）。 */
export const getPendingUpdate = () => pendingUpdate;

export const clearPendingUpdate = () => {
  pendingUpdate = null;
};

/**
 * 导航前应用挂起的更新：该刷新就发起刷新并返回 true（调用方应**取消本次导航**）。
 *
 * 为什么是「导航这一拍」：
 *   · 用户在旧构建上继续操作，下一次导航大概率撞上已删除的 hash 资源（404 / 半样式）；
 *   · 与其等他撞上再由恢复链整页强刷（那时页面已经坏了一下），不如在他本来就要换页时先切构建 ——
 *     落点由 hash 保留，用户感知就是「点了就到位」，只是这一次多了一次整页加载。
 * 防循环：`boh_version_reload_target` 记住本次会话已尝试过的目标 buildId
 *（沿用 shouldAutoApplyVersion 的判定，与启动时那条 autoApply 同一套护栏）。
 *
 * ⚠️ **这个函数是活代码，不要当死代码删**：调用方是 `src/router/index.ts` 的
 * `router.beforeEach`（`if (applyPendingUpdateBeforeNavigation()) return next(false);`），
 * 由 f7ce1a42（2026-10-13）接上，并带 `tests/unit/update-on-navigation.test.js`。
 * 748ea632 的提交说明写「全仓没有任何调用方…目前是死代码」是**错的**；真正没有
 * 调用方的只有 `getPendingUpdate`（保留给外部读数 / 测试，见该函数注释）。
 */
export const applyPendingUpdateBeforeNavigation = () => {
  const target = pendingUpdate?.remoteBuildId;
  if (!target) return false;
  if (!shouldAutoApplyVersion(target, readReloadTarget())) return false;
  // 导航是用户主动发起的，他本来就要离开当前页 —— typing/editing/media 都不成立。
  // 只留 upload 这一条：上传中断的代价照旧是全部重传（Cloudinary 不可续传），
  // 而 SPA 内切页不会打断 fetch/XHR，上传会继续跑完。
  // 返回 false = 不刷新、照常导航；挂起态留着，等空闲/下一次导航再说。
  if (hasActiveUpload()) return false;
  logger.info('version', '导航时发现挂起的新构建，先切构建再继续', {
    from: currentBuildId,
    to: target,
  });
  void forceCleanAndReload(target);
  return true;
};

/**
 * 记录「远端有新构建可用」，并派发一个**只给诊断用**的事件。
 *
 * ⚠️ 这个事件**没有任何 UI 消费方，也不该有**（2026-11-23 定稿：不弹窗、不通知）。
 * 保留它只为一件事：让探针/测试能观测到「挂起态已建立」这个时刻，而不必去读
 * 模块内部变量（探针在浏览器里拿不到 ES 模块私有状态）。
 * 名字刻意从 `boh:update-available` 改成 `boh:update-pending`：
 * 前者读起来像「有个提示要弹」，后者只陈述「有个切换在排队」。如果哪天又有人
 * 想在这里挂 UI，请先回去读本文件上方那段「顺延而不是询问」的论证。
 */
const markUpdatePending = (remoteVersion, remoteBuildId) => {
  markUpdateAvailable(remoteVersion, remoteBuildId);
  logger.info('version', '新构建已排队，等下一个静默窗口应用', {
    remoteVersion,
    remoteBuildId,
    target: pendingUpdate?.remoteBuildId,
  });
  window.dispatchEvent(
    new CustomEvent('boh:update-pending', {
      detail: { remoteVersion, remoteBuildId, currentVersion, currentBuildId },
    }),
  );
};

const clearCompletedReloadState = (remoteBuildId) => {
  if (!remoteBuildId || remoteBuildId !== currentBuildId) return;
  clearReloadTarget();
  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has(UPDATE_QUERY_KEY)) return;
  currentUrl.searchParams.delete(UPDATE_QUERY_KEY);
  window.history.replaceState(
    window.history.state,
    '',
    `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
  );
};

/**
 * 执行一次版本检查（只检测，不自动刷新）
 * 比对 buildId（构建指纹），同版本重新部署也能触发更新
 * @returns {Promise<{hasUpdate: boolean, message: string, remoteVersion?: string, currentVersion?: string, remoteBuildId?: string}>}
 */
export const checkVersion = async () => {
  // 开发环境跳过
  if (import.meta.env.DEV) {
    return { hasUpdate: false, message: '开发环境下版本检测不可用，请在生产环境使用' };
  }

  // 首次运行时记录当前版本与构建指纹
  if (!currentVersion) {
    currentVersion = readCurrentVersion();
    if (!currentVersion) {
      // 没有 meta 标签（可能是旧版本页面），不强制更新，避免误判
      logger.warn('version', '未找到版本 meta 标签，跳过版本检测');
      return { hasUpdate: false, message: '未找到版本信息，无法检测更新' };
    }
    currentBuildId = readCurrentBuildId();
    logger.debug('version', '当前页面版本', { version: currentVersion, buildId: currentBuildId });
  }

  try {
    const remote = await fetchRemoteVersion();
    if (!remote?.buildId) {
      logger.warn('version', 'version.json 缺少 buildId 字段', remote);
      return { hasUpdate: false, message: '版本信息读取失败' };
    }

    // 比对构建指纹：同版本重新部署（hotfix）时 buildId 变化也能触发更新
    if (remote.buildId !== currentBuildId) {
      logger.info('version', '发现新版本', {
        currentVersion,
        remoteVersion: remote.version,
        currentBuildId,
        remoteBuildId: remote.buildId,
      });
      return {
        hasUpdate: true,
        message: `发现新版本 ${remote.version}，可以立即更新`,
        remoteVersion: remote.version,
        currentVersion,
        remoteBuildId: remote.buildId,
      };
    }

    clearCompletedReloadState(remote.buildId);
    // 远端已与当前一致（说明刷新已落地）⇒ 挂起态必须清掉，否则导航守卫会拿旧目标反复尝试
    clearPendingUpdate();
    logger.debug('version', '版本一致，无需更新', {
      version: currentVersion,
      buildId: currentBuildId,
    });
    return {
      hasUpdate: false,
      message: `当前已是最新版本 ${currentVersion}`,
      currentVersion,
    };
  } catch (err) {
    // version.json 拉取失败不阻塞用户，仅记录日志
    // 可能是网络问题或 GitHub Pages CDN 暂时不可用
    logger.warn('version', '版本检查失败', err?.message || err);
    return { hasUpdate: false, message: '版本检查失败，请稍后重试' };
  }
};

/**
 * 本轮定时轮询该不该真的发请求。
 *
 * 两个否定条件：
 *   · 页面不在前台 —— 后台标签页不轮询（回到前台由 visibilityHandler 立即补一次）；
 *   · 连续 `ACTIVE_WINDOW_MS` 没有任何交互 —— 挂机/投屏场景不再回源，等用户
 *     下次交互时由 markInteraction 补查（见 initVersionChecker）。
 *
 * 抽成纯函数是为了可测：`lastInteractionAt` 是模块级状态，直接测 interval
 * 只能靠假时钟碰运气。
 */
export const shouldPollNow = (lastInteractionAt, now = Date.now(), visibilityState = 'visible') => {
  if (visibilityState !== 'visible') return false;
  const last = Number(lastInteractionAt) || 0;
  if (!last) return false;
  return now - last <= ACTIVE_WINDOW_MS;
};

/**
 * 初始化版本检测器
 * 启动定时轮询 + 页面可见性监听
 */
export const initVersionChecker = () => {
  if (import.meta.env.DEV) {
    logger.debug('version', '开发环境，跳过版本检测器初始化');
    return;
  }
  if (intervalId || visibilityHandler) {
    logger.debug('version', '版本检测器已初始化，跳过重复启动');
    return;
  }

  // 本会话以「刚加载」为起点算活跃：首轮 90s 检查不该因为还没点击而被跳过
  lastInteractionAt = Date.now();
  idleSkipPending = false;

  // 自动轮询检测：发现新构建只**记挂起态**，然后在下一个静默窗口应用。
  // 这里没有任何「通知用户」的代码，理由见上方「顺延而不是询问」那段。
  let hiddenAt = 0; // 页面进入后台的时刻（0 = 当前可见）
  const isTypingInForm = (el) => {
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    return (
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
    );
  };

  /**
   * 是否有正在播放的媒体：切换构建会打断播放（尤其是用户刚切回来继续看的那一支）。
   * 注意：跨域 iframe 内的播放器查不到，只能覆盖页面内 <video>/<audio>。
   */
  const isMediaPlaying = () => {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
      return false;
    }
    return Array.from(document.querySelectorAll('video, audio')).some(
      (el) => !el.paused && !el.ended,
    );
  };

  /**
   * 当前这一拍能不能安全地切换构建。返回**挡路的原因**，'' = 可以切。
   *
   * 抽成单一函数是这次改动的关键：判定只有一份，五个静默窗口（冷启动 / 切回 /
   * 导航 / 空闲 / 挂机补查）全部调它。「一处判、多处用」替代了原来「每处各写一遍，
   * 写漏一个就漏一道护栏」的写法。
   *
   * 四道护栏的语义已从「弹提示问用户」改成「顺延到下一个窗口」：
   *   upload  —— 有文件正在上传（计数式 begin/end，有明确结束点）
   *   typing  —— 焦点还在输入框里（blur 即结束）
   *   media   —— 有媒体在播（pause/ended 即结束）
   *   editing —— 填过内容但焦点已离开（导航/清空即结束；没有焦点信号，靠 input 追踪）
   *
   * upload 排第一位：它是唯一**不可恢复**的一种。typing/editing 丢的是 DOM 里的
   * 文本（多数表单还有草稿），media 丢的只是播放进度；而上传一旦中断，Cloudinary
   * 的 signed/unsigned 都不支持断点续传，用户必须从第一张重新传。
   */
  const blockReason = () => {
    if (hasActiveUpload()) return 'upload';
    if (isTypingInForm(document.activeElement)) return 'typing';
    if (isMediaPlaying()) return 'media';
    if (hasUnsavedEditableContent()) return 'editing';
    return '';
  };

  /**
   * 尝试应用一个已知的新构建。**唯一**的静默切换入口。
   * @returns {Promise<boolean>} true = 已发起整页切换（调用方不要再继续）
   */
  const tryApply = async (remoteBuildId, { source } = {}) => {
    // 防循环：同一目标本会话只试一次（CDN 未切换时会一直报「有新版本」，不闸就无限刷）
    if (!shouldAutoApplyVersion(remoteBuildId, readReloadTarget())) {
      logger.debug('version', '该目标构建本会话已尝试过，不再重试', remoteBuildId);
      return false;
    }
    const reason = blockReason();
    if (reason) {
      logger.info('version', '有未完成的操作，本次切换顺延到下一个静默窗口', {
        reason,
        source,
        remoteBuildId,
      });
      return false;
    }
    logger.info('version', '静默窗口到手，切换构建', {
      currentBuildId,
      remoteBuildId,
      source,
    });
    await forceCleanAndReload(remoteBuildId);
    return true;
  };

  const autoCheck = ({ autoApply = false, source = 'poll' } = {}) => {
    if (automaticCheckInFlight) return automaticCheckInFlight;

    automaticCheckInFlight = (async () => {
      try {
        const result = await checkVersion();
        if (!result.hasUpdate) return;
        if (autoApply && (await tryApply(result.remoteBuildId, { source }))) return;
        // 没能立刻应用（护栏挡着 / 防循环闸门）：只记挂起态，等下一个窗口。
        // 注意这里**不派发任何提示** —— markUpdatePending 只是诊断信号，
        // 全站没有任何组件监听它（2026-11-23 定稿，见该函数注释）。
        markUpdatePending(result.remoteVersion, result.remoteBuildId);
      } catch (err) {
        logger.warn('version', '自动版本检查异常', err?.message || err);
      }
    })().finally(() => {
      automaticCheckInFlight = null;
    });

    return automaticCheckInFlight;
  };

  /**
   * 空闲窗口：用户连续 `IDLE_APPLY_MS` 没有任何交互、页面在前台、且挂着待应用的
   * 新构建 ⇒ 静默切。
   *
   * 这是本次新增的第五条通道，补的是原来最大的空档：用户停在某一页持续操作
   * （不导航、不切走、也不打字）时，四条通道全都轮不到，旧构建会一直跑到他自己撞上
   * 已删除的 hash 资源为止。加了它，「页面开着不动」也终于是个切换时机。
   *
   * 为什么判「无交互」而不是判「无操作」：pointerdown/keydown 的沉默是最廉价可靠的
   * 信号，且与挂机降频用的信号完全一致（ACTIVE_WINDOW_MS）。它和护栏是**叠加**关系：
   * 沉默 20s 不代表没有上传在跑（上传是异步的，用户可以点完就走），所以 tryApply
   * 里照样过全部四道护栏。
   */
  const maybeApplyWhenIdle = () => {
    if (!pendingUpdate?.remoteBuildId) return;
    if (document.visibilityState !== 'visible') return;
    if (blockReason()) return;
    void tryApply(pendingUpdate.remoteBuildId, { source: 'idle' });
  };

  // 页面启动时若发现自己属于旧构建，自动应用一次新构建。同一目标 buildId
  // 只尝试一次，CDN 尚未完成切换时会退回更新提示，避免刷新循环。
  //
  // 先做「上一次更新是否根本没落地」的自救：带着目标回来却还是旧壳时，
  // 「同一目标只试一次」的护栏会让它退化成反复弹窗 —— 由 recoverStaleLanding
  // 做一次性硬重置彻底跳出循环（详见该函数注释）。
  void (async () => {
    if (await recoverStaleLanding()) return; // 已发起硬重置导航，本次不再检查
    await autoCheck({ autoApply: true, source: 'boot' });
  })();

  // 定时轮询
  intervalId = setInterval(() => {
    // 后台标签页 / 挂机时段都不发请求：既省 version.json 的回源请求（它走 DYNAMIC，
    // 每次都要回源站），也避免「页面在后台被静默刷掉」。回到前台由 visibilityHandler
    // 立即补一次；挂机后回神由 markInteraction 补一次。
    if (!shouldPollNow(lastInteractionAt, Date.now(), document.visibilityState)) {
      idleSkipPending = true;
      return;
    }
    autoCheck({ source: 'poll' });
  }, CHECK_INTERVAL);

  /* ── 第五条通道：空闲窗口 ─────────────────────────────────────────
     用户连续 IDLE_APPLY_MS 没有任何交互 ⇒ 就是「他现在没在用」，切构建代价最低。
     这条补的是原来最大的空档：人停在某一页持续操作（不导航、不切走、也不打字）时，
     另外四条通道全都轮不到，旧构建会一直跑到他自己撞上已删除的 hash 资源为止。

     定时器刻意**不复用 CHECK_INTERVAL**：轮询间隔 90s 是为省 version.json 回源，
     而这里不发任何请求（只在已挂起时动手），所以可以密得多。3s 一跳 = 20s 沉默
     后最多 3s 内就切走，用户感知不到「卡在旧版本」。
     ⚠️ 它只在 pendingUpdate 存在时才真正干活，没有挂起更新时几乎零开销。 */
  idleApplyTimer = setInterval(() => {
    if (!lastInteractionAt) return;
    if (Date.now() - lastInteractionAt < IDLE_APPLY_MS) return;
    maybeApplyWhenIdle();
  }, IDLE_TICK_MS);

  // 记交互：挂机降频后，用户一碰页面就把「跳过的那次检查」补回来
  const markInteraction = () => {
    lastInteractionAt = Date.now();
    if (!idleSkipPending) return;
    idleSkipPending = false;
    autoCheck({ source: 'resume' });
  };
  interactionHandler = markInteraction;
  document.addEventListener('pointerdown', interactionHandler, true);
  document.addEventListener('keydown', interactionHandler, true);

  // 页面从隐藏切换回可见时立即检查；离开超过 AUTO_APPLY_AFTER_HIDDEN_MS 才允许
  // 自动强刷（短暂切走不打断），刷新由 tryApply 内的护栏最终裁决。
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      // 切回来的这一拍本身就是活跃信号，定时轮询不必再等下一个交互才恢复
      lastInteractionAt = Date.now();
      idleSkipPending = false;
      const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      autoCheck({ autoApply: awayMs >= AUTO_APPLY_AFTER_HIDDEN_MS, source: 'visibility' });
      return;
    }
    hiddenAt = Date.now();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
  // 捕获阶段监听：不管中间层有没有 stopPropagation，都能记到用户真正输入过什么。
  document.addEventListener('input', trackEditableInput, true);

  logger.info(
    'version',
    `版本检测器已启动（前台活跃时每 ${CHECK_INTERVAL / 1000} 秒检查一次，` +
      `连续 ${ACTIVE_WINDOW_MS / 60000} 分钟无交互则暂停轮询；` +
      `离开超过 ${AUTO_APPLY_AFTER_HIDDEN_MS / 1000} 秒后切回会自动应用；` +
      `静默 ${IDLE_APPLY_MS / 1000} 秒也会应用）`,
  );
};

/**
 * 销毁版本检测器（一般不需要手动调用）
 */
export const destroyVersionChecker = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (idleApplyTimer) {
    clearInterval(idleApplyTimer);
    idleApplyTimer = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  if (interactionHandler) {
    document.removeEventListener('pointerdown', interactionHandler, true);
    document.removeEventListener('keydown', interactionHandler, true);
    interactionHandler = null;
  }
  lastInteractionAt = 0;
  idleSkipPending = false;
  document.removeEventListener('input', trackEditableInput, true);
};
