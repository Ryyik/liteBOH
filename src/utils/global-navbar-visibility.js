/**
 * 全局导航栏是否显示 —— **单一真源**。
 *
 * 为什么必须单源：`<UnifiedNavbar v-if="showGlobalNavbar" />`（App.vue）决定导航栏是否渲染，
 * 而 AI 岛（BOH AI 对话岛）的岛体是**挂在导航栏内部**的。导航栏不渲染 = 没有宿主容器，
 * `openBohaiOverlay()` 只会把 `isOpen` 置位而永远不显示任何东西 —— 更糟的是
 * `showIsland.ai()` 还会返回 true，调用方以为开成功了。
 *
 * ⚠️ 这里踩过一次：`useGlobalAiOverlay.canOpen` 曾只判 `route.name === 'AiChat'` 与
 * `route.meta.hideNavbar` 两条，而本函数有六条。于是下面这几类路由上
 * canOpen=true 但导航栏已隐藏：
 *   · `?embed=desktop`
 *   · `?from=userspace*`（从用户空间跳出的详情等）
 *   · `/user-space?tab=profile&view=…`（我的 → 子视图）
 *   · `/user-space?tab=settings&view=…`（设置 → 子视图）
 * 论坛列表在这些视图里照常渲染（ForumToolbar 带「问 BOHAI」按钮），点下去就是
 * 「AI 岛当前不可用，请稍后再试」—— 一个看起来像偶发、实则必然的静默失败。
 *
 * 所以：App.vue 的 showGlobalNavbar 与 useGlobalAiOverlay 的 canOpen **都调用本函数**。
 * 要加新的隐藏条件，只改这里一处。
 *
 * @param {import('vue-router').RouteLocationNormalizedLoaded | null | undefined} route
 * @returns {boolean} 导航栏是否应该显示
 */
export const isGlobalNavbarVisible = (route) => {
  if (!route) return true;
  // 桌面嵌入模式（外部壳把本页当 iframe 用，自带导航）
  if (route.query?.embed === 'desktop') return false;
  // 路由显式标记：admin/* 、PostDetail、UserProfile、公告类页面等
  if (route.meta?.hideNavbar) return false;
  // 从用户空间跳出的页面（详情/子页）自带返回入口，不再叠一层悬浮导航
  if (String(route.query?.from || '').startsWith('userspace')) return false;
  // 用户空间「我的」子视图
  if (
    route.path === '/user-space' &&
    route.query?.tab === 'profile' &&
    route.query?.view &&
    route.query.view !== 'home'
  )
    return false;
  // 设置子页（数据导出/数据与隐私/编辑资料）：悬浮导航岛会盖住 sticky 头部的返回按钮
  if (
    route.path === '/user-space' &&
    route.query?.tab === 'settings' &&
    route.query?.view &&
    route.query.view !== 'home'
  )
    return false;
  return true;
};
