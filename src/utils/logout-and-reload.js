/**
 * 退出登录 + 整页重载（用户口径：点完「退出登录」页面要自动刷新）。
 *
 * 为什么不能只 `await authStore.logout()`：
 *   logout → resetState() 只清 pinia。已经挂载的页面实例里仍留着**登录态下取回的数据**
 *   （首页论坛流 / 消息 / 左栏 / hero / 通知角标…），SPA 不重建组件就不会重新取数，
 *   用户看到的是「导航变成登录按钮了，但页面还是刚才那份」。
 *   整页 reload 是唯一能保证「退出后立刻就是游客视角」的做法 ——
 *   与 ProfileSettingsPanel.replayHomeGate 同一套处理（hash 先归位再 reload）。
 *   由此反推：**这条路径上根本不需要 resetState**（pinia 随 reload 一起没了），
 *   所以下面传 `reset: false` —— 省掉一次无意义的「动态 import 三个 store + 各自清场」。
 *
 * ⚠️ reload 必须在 `logout()` 落定之后：先 reload 会把注销请求掐断，Supabase 侧的
 *    refresh token 还活着，下次进站可能又自动登录回来。
 *
 * ⚠️ 2026-11-01 提速复盘（用户口径「退出登录的速度还可以再提升一下」）：
 *   真正的瓶颈**不在**这一步的 reload（实测 192ms），而在 signOut 里面 ——
 *   解绑推送前要 `readLocalSubscription()`，它会等 Service Worker 就绪，上限 3s，
 *   没开过通知的机器（permission=default）必定等满。已在 push-api 里加了权限快路径。
 *
 * @param {{ logout: (options?: { reset?: boolean }) => Promise<void> }} authStore
 * @param {{ redirect?: string }} [options] redirect 用 hash 路径（默认 '/')
 */
export async function logoutAndReload(authStore, { redirect = '/' } = {}) {
  try {
    await authStore.logout({ reset: false });
  } finally {
    // `location.reload()` 沿用当前 URL；不先写 hash 会留在原页面（如 /user-space）
    if (redirect) window.location.hash = `#${redirect}`;
    window.location.reload();
  }
}
