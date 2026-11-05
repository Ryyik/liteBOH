/**
 * keepAlive 路由的滚动位置记忆（2026-11-04）
 *
 * 为什么需要：底栏「图库」与「我」是相邻两席，来回切不该整页重挂。加了
 * `meta.keepAlive` 之后组件/DOM/内部滚动容器都保住了，但 **Cloud+ 这类页面的
 * 滚动发生在 window 上**（`.cloud-page { min-height: 100vh }`），而 router 的
 * scrollBehavior 对跨路由恒返回 `{ top: 0 }` —— 内容没重建、却一眼回顶，
 * 用户仍然会觉得「重挂了一次」。
 *
 * 三条口径（改这里之前先想清楚）：
 *   1. **只记 keepAlive 路由**：非缓存页面离开就该从顶部开始，不该凭空记住位置。
 *   2. **按 fullPath 记**：`?tab=posts` / `?tab=messages`、`?view=content` / `?view=share`
 *      各自是用户心里的「一页」，切回来要回到各自的位置。
 *   3. 只存数字、不碰 DOM：捕获点是 router.beforeEach（此时旧页面还没换掉），
 *      读点是 scrollBehavior，两处都只调这里，别在组件里再写一份。
 */
const scrollMemory = new Map();

/* 条数上限：一次会话里 keepAlive 的 fullPath 很少超过 10 条，
   24 只是防止「?tab=a&x=1」这类参数组合把 Map 撑大。超了丢最早的一条。 */
const MAX_ENTRIES = 24;

/**
 * 记下某个 keepAlive 路由离开时的窗口滚动位置。
 * @param {import('vue-router').RouteLocationNormalized} route 离开的路由
 * @param {number} scrollY 捕获时刻的 window.scrollY
 */
export const rememberRouteScroll = (route, scrollY) => {
  const path = String(route?.fullPath || '');
  if (!route?.meta?.keepAlive || !path) return;
  if (!Number.isFinite(scrollY)) return;
  // 先删再塞：Map 的插入序即最近使用序，这里顺带做 LRU
  scrollMemory.delete(path);
  scrollMemory.set(path, Math.max(0, Math.round(scrollY)));
  if (scrollMemory.size > MAX_ENTRIES) {
    const oldest = scrollMemory.keys().next().value;
    scrollMemory.delete(oldest);
  }
};

/**
 * 取某个 keepAlive 路由上次离开时的滚动位置。
 * @returns {number|undefined} 没记过（或不是缓存路由）时返回 undefined，调用方走原逻辑
 */
export const recallRouteScroll = (route) => {
  if (!route?.meta?.keepAlive) return undefined;
  return scrollMemory.get(String(route?.fullPath || ''));
};

/** 仅供测试/极端场景（如强制登出换账号）清空记忆。 */
export const clearRouteScrollMemory = () => {
  scrollMemory.clear();
};
