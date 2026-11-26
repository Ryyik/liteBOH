/**
 * 全局导航栏是否显示 —— **单一真源**。
 *
 * 为什么必须单源：`<UnifiedNavbar v-if="showGlobalNavbar" />`（App.vue）决定导航栏是否渲染，
 * 导航 surface 内的任务岛/通知岛/自定义岛随宿主生灭。
 *
 * ⚠️ 历史坑（保留档案）：旧 AI 岛挂在导航栏内时，「导航栏已隐藏但 meta 没标记」的路由上
 * `showIsland.ai()` 会静默假成功。2026-11-04 plans/038 P3 后 AI 岛已迁移为 App 级
 * BohIsland（Teleport 到 body、canOpen 不看本函数），这类路由不再有黑洞 ——
 * 但 ForumToolbar 等带「问博莱克」按钮的视图列表留在这里作背景。
 *
 * 所以：App.vue 的 showGlobalNavbar 调用本函数。要加新的隐藏条件，只改这里一处。
 *
 * @param {import('vue-router').RouteLocationNormalizedLoaded | null | undefined} route
 * @param {boolean} [gateScreening=false] 首页开场画（`.home-gate`）是否在场。
 *   刻意做成**显式参数**而不是在函数里读全局单例：本文件是纯路由判据、被单测直接调用，
 *   读可变全局状态会让「path === '/'」的用例结果取决于跑测时的 localStorage。
 *   调用方（App.vue）传 `homeGateScreening.value`，computed 里读 ref 仍然能追踪依赖。
 * @param {boolean} [settingsImmersive=false] 设置竖屏子页是否处于沉浸态（2026-11-24）。
 *   同样走显式参数：这个状态住在 `ProfileSettingsPanel` 里、经 `useSettingsChrome`
 *   单例广播出来。写进函数体读全局会让本文件的单测变成「取决于上一个用例留下的状态」。
 * @param {boolean} [settingsWide=false] 当前是否处于设置两栏的宽视口（横屏 ≥1024×600）。
 *   横屏的岛浮在左栏上方、不挡右栏表单，所以「子页隐藏导航」这两条都要放行。
 * @returns {boolean} 导航栏是否应该显示
 */
export const isGlobalNavbarVisible = (
  route,
  gateScreening = false,
  settingsImmersive = false,
  settingsWide = false,
) => {
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
  // ⚠️ 2026-11-24：这条**只对竖屏成立**。横屏两栏里岛浮在左栏上方、右栏表单不受影响，
  //    用户口径「横屏还是挂导航栏的」—— 所以宽视口下不在这里隐藏，
  //    改由 settingsImmersive（竖屏子页沉浸态）统一控制。
  if (
    !settingsWide &&
    route.path === '/user-space' &&
    route.query?.tab === 'settings' &&
    route.query?.view &&
    route.query.view !== 'home'
  )
    return false;
  /* 设置竖屏子页沉浸态（2026-11-24 用户口径：「二级三级页面都要占满屏幕，不挂导航栏了」）。
     竖屏点组行进二级页**不改 URL**，所以这条不能靠 route.query.view 判 ——
     由 ProfileSettingsPanel 经 useSettingsChrome 单例广播出来。
     横屏（settingsWide）永远不隐藏：那边是两栏，岛不挡内容，用户要求保留。
     ⚠️ 必须限定在 `/user-space`：单例的复位挂在 onDeactivated / onBeforeUnmount 上，
        极端时序下（页面切走但钩子还没跑）标记可能短暂残留，不限定路由会让
        论坛 / 首页也跟着丢导航栏。 */
  if (
    settingsImmersive &&
    !settingsWide &&
    (route.path === '/user-space/pushplus-settings' ||
      (route.path === '/user-space' && route.query?.tab === 'settings'))
  )
    return false;
  /* 独立登录页（`/login`）不挂导航栏（2026-11-24）。
     登录页重做成「纯白/纯黑极简入口」后，浮在顶部的玻璃导航胶囊与右侧的用户
     入口在视觉上是**两块杂物**：它既不属于这张页面，又抢走唯一的视觉重心
     （BOH 字标）。而且登录页本身不需要导航 —— 页内只有登录/注册两个动作，
     没有可去的地方。
     ⚠️ 只判**路由**、不看组件状态 ⇒ 登录弹窗（`isModal`，浮在任意页面上）
        完全不受影响，那条路径的 route.path 从来不是 /login。
     ⚠️ 不要改成 `route.path.startsWith('/login')` —— /reset-password 是另一条
        路由、另一个页面，它有自己要展示的内容。 */
  if (route.path === '/login') return false;
  /* 首页开场画（`.home-gate`）在场期间**不挂载**导航栏（2026-11-15 用户口径）。
     这不是「隐藏」而是「不渲染」：开屏层是 inset:0 的满屏浮层且锁滚动，
     导航压在上面既抢视觉重心，又会在 z 轴上跟「下滑揭开」的手势层打架。
     ⚠️ 只对首页生效 —— 非首页即便「本会话没看过开场画」，也不存在开屏层。 */
  if (route.path === '/' && gateScreening) return false;
  return true;
};
