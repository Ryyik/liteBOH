/**
 * 底栏落点的路由 chunk 预取（2026-11-16）。
 *
 * 为什么需要：底栏五席是**五个独立路由**，切页要先等目标页的懒加载 chunk
 * （实测 Slow 4G 下「我 → 图库」点击后 497ms 目标页根才出现，期间屏幕上是
 * 旧页面不动、零反馈 —— 用户的原话是「切到图库总卡一下」）。
 * chunk 一到 DOM 就换成新页，所以这 500ms 不是渲染慢，是**下载**。
 *
 * 做法：把「点击后才开始下载」提前到「有空就开始下载」——
 *   · 首屏稳定后按空闲逐席预取（一次一个、间隔 350ms，别和数据请求抢并发）；
 *   · 底栏按下（pointerdown，比 click 早 ~80–120ms）立刻预取**那一席**。
 *
 * ⚠️ 三个约束（都是踩过才知道的）：
 *   ① 只能调路由表里**同一个 loader 函数** —— 不要另写一份 `import()` 清单。
 *      另写一份等于第二真源：改了路由的懒加载入口，预取会静默失效，且不会有任何报错。
 *      这里从 `router.getRoutes()` 里按 name 取 `components.default`。
 *   ② 省流 / 2G 网络下不预取（`saveData` 或 `effectiveType` 含 2g）——
 *      预取是「用未来的带宽换未来的等待」，流量敏感用户不接受这种交换。
 *   ③ 失败要**忘掉**已预取标记：chunk 拉取失败（离线、发版中途、代理断流）后
 *      若仍当作「已预热」，那次会话里就永远不会再试，等于把失败固化了。
 *
 * 预取不改变路由行为：loader 只是被提前调用，vue-router 之后照常调用同一个
 * 动态 import（模块系统有缓存，第二次是同步命中），所以不会重复下载。
 */
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';

/** 已成功预取的路由 name（失败会删除，允许重试） */
const prefetched = new Set();

const readConnection = () => {
  if (typeof navigator === 'undefined') return null;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
};

export const shouldSkipPrefetch = () => {
  const connection = readConnection();
  if (!connection) return false;
  if (connection.saveData) return true;
  return /(^|-)2g/.test(String(connection.effectiveType || ''));
};

/**
 * 「空闲批量预取」额外的网络门槛（2026-11-16 实测后加的）。
 *
 * 为什么单靠 `shouldSkipPrefetch` 不够：Slow 4G（1.6Mbps）下实测 ——
 * 空闲批量预取会跟**当前页正在跑的 31 条数据请求**抢带宽，
 * 「我 → 图库」反而从 587ms 恶化到 947ms（同时「图库 → 周边」从 614ms 降到 20ms）。
 * 也就是说：批量预取在慢网下不是「免费加速」，是**从当前页借带宽**。
 * 所以批量预取只在「带宽明显富余」时做；慢网下只保留按下即预取（用户已表达意图）。
 */
const shouldSkipBulkPrefetch = () => {
  if (shouldSkipPrefetch()) return true;
  const connection = readConnection();
  if (!connection) return false;
  const type = String(connection.effectiveType || '');
  if (type && type !== '4g') return true;
  // downlink 单位 Mbps；< 4 视为「带宽吃紧」，不做批量预取
  if (typeof connection.downlink === 'number' && connection.downlink > 0) {
    return connection.downlink < 4;
  }
  return false;
};

const resolveLoader = (router, target) => {
  try {
    const resolved = router.resolve(target);
    if (!resolved?.name) return null;
    const record = router.getRoutes().find((entry) => entry.name === resolved.name);
    const loader = record?.components?.default;
    return typeof loader === 'function' ? loader : null;
  } catch {
    return null;
  }
};

/**
 * 追一层「内层懒加载」（2026-11-16 实测补的）。
 *
 * 为什么需要：有些页面的路由入口只是一个**薄壳**，真正的重面板在壳里再懒加载一次
 * （最典型的是 `Cloud+/index.vue`：它 `createPanelAsync(() => import('./CloudPlusMain.vue'))`）。
 * 只预取路由 chunk 时，「我 → 图库」实测仍剩 341ms 空窗 —— 那 341ms 是第二层
 * chunk 在下载。这不是配置问题，是层级问题。
 *
 * 做法：`defineAsyncComponent` 会在组件上挂 `__asyncLoader`（Vue 内部字段），
 * 有就顺手触发一次。**不做白名单** —— 一列清单就是第二真源，迟早和实际结构漂移。
 * ⚠️ 这是内部 API：用 `typeof === 'function'` 守着，拿不到就当没有，绝不影响主流程。
 */
const chaseInnerAsyncLoader = (module) => {
  try {
    const component = module?.default;
    const inner = component?.__asyncLoader;
    if (typeof inner !== 'function') return Promise.resolve(false);
    return Promise.resolve(inner())
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
};

/**
 * 预取单个落点。
 * @returns {Promise<boolean>} true = 已就绪（含「之前就预取过」）
 */
export const prefetchRoute = (router, target) => {
  if (!router || !target) return Promise.resolve(false);
  if (shouldSkipPrefetch()) return Promise.resolve(false);

  const loader = resolveLoader(router, target);
  if (!loader) return Promise.resolve(false);

  let key;
  try {
    key = String(router.resolve(target).name || target);
  } catch {
    key = String(target);
  }
  if (prefetched.has(key)) return Promise.resolve(true);

  prefetched.add(key);
  return Promise.resolve(loader())
    .then((module) => chaseInnerAsyncLoader(module))
    .then(() => true)
    .catch(() => {
      // 失败不固化为「已预热」：下次（空闲或按下）还要能重试
      prefetched.delete(key);
      return false;
    });
};

/**
 * 首屏稳定后按空闲逐席预取底栏落点。
 * @param {import('vue-router').Router} router
 * @returns {() => void} 取消函数（宿主卸载时用）
 */
export const scheduleBottomNavPrefetch = (router) => {
  if (typeof window === 'undefined' || !router) return () => {};
  if (shouldSkipBulkPrefetch()) return () => {};

  const targets = [...new Set(BOTTOM_NAV_ITEMS.map((item) => item.route).filter(Boolean))];
  /* 当前落点不排进队列（2026-11-16）：这个函数只在首屏 `isReady()` 之后才排程，
     也就是说**当前页的 chunk 已经下完了**，预取它纯属白占一格 —— 而队列是按
     350ms 一席铺开的，白占一格等于把后面每一席都往后推 350ms。
     实测（probe-bottomnav-switch-timeline --slow）：首页进入后立刻点「图库」，
     修前图库排在第 4 位 ⇒ 1050ms 后才开始下，首切必然空窗。 */
  const currentPath = String(router.currentRoute?.value?.path || '');
  const queued = targets.filter((target) => String(target).split('?')[0] !== currentPath);
  let cancelled = false;
  let timerId = 0;
  let index = 0;

  const step = () => {
    if (cancelled || index >= queued.length) return;
    const target = queued[index];
    index += 1;
    /* ⚠️ 不 await 上一席（2026-11-16 实测修正）：串行等下载完成会把队列堵死 ——
       首页 `/` 的 chunk 最大，Slow 4G 下要 3–4s，排在它后面的「图库」就迟迟不开始，
       实测点击时仍是 337ms 空窗。改成**按时间铺开**：每 350ms 开一席，
       并发自然被这个间隔限制在 2 席以内，不会把带宽一次抢光。 */
    void prefetchRoute(router, target);
    if (index < queued.length) timerId = window.setTimeout(step, 350);
  };

  const idle =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback
      : (callback) => window.setTimeout(callback, 1200);

  // timeout 兜底：一直「不空闲」也不能永远不预取
  idle(step, { timeout: 3000 });

  return () => {
    cancelled = true;
    if (timerId) window.clearTimeout(timerId);
  };
};

/** 仅供单测清理。 */
export const __resetRoutePrefetchForTests = () => prefetched.clear();
