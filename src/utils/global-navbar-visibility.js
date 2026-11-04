/**
 * 全局导航栏是否显示 —— **单一真源**。
 *
 * 为什么必须单源：`<UnifiedNavbar v-if="showGlobalNavbar" />`（App.vue）决定导航栏是否渲染，
 * 导航 surface 内的任务岛/通知岛/自定义岛随宿主生灭。
 *
 * ⚠️ 历史坑（保留档案）：旧 AI 岛挂在导航栏内时，「导航栏已隐藏但 meta 没标记」的路由上
 * `showIsland.ai()` 会静默假成功。2026-11-04 plans/038 P3 后 AI 岛已迁移为 App 级
 * BohIsland（Teleport 到 body、canOpen 不看本函数），这类路由不再有黑洞 ——
 * 但 ForumToolbar 等带「问 BOHAI」按钮的视图列表留在这里作背景。
 *
 * 所以：App.vue 的 showGlobalNavbar 调用本函数。要加新的隐藏条件，只改这里一处。
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
