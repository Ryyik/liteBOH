/**
 * 退出登录 + 整页重载（用户口径：点完「退出登录」页面要自动刷新）。
 *
 * 为什么不能只 `await authStore.logout()`：
 *   logout → resetState() 只清 pinia。已经挂载的页面实例里仍留着**登录态下取回的数据**
 *   （首页论坛流 / 消息 / 左栏 / hero / 通知角标…），SPA 不重建组件就不会重新取数，
 *   用户看到的是「导航变成登录按钮了，但页面还是刚才那份」。
 *   整页 reload 是唯一能保证「退出后立刻就是游客视角」的做法 ——
 *   与 ProfileSettingsPanel.replayHomeGate 同一套处理（hash 先归位再 reload）。
 *
 * ⚠️ reload 必须在 `logout()` 落定之后：先 reload 会把注销请求掐断，Supabase 侧的
 *    refresh token 还活着，下次进站可能又自动登录回来。
 *
 * @param {{ logout: () => Promise<void> }} authStore
 * @param {{ redirect?: string }} [options] redirect 用 hash 路径（默认 '/')
 */
export async function logoutAndReload(authStore, { redirect = '/' } = {}) {
  try {
    await authStore.logout();
  } finally {
    // `location.reload()` 沿用当前 URL；不先写 hash 会留在原页面（如 /user-space）
    if (redirect) window.location.hash = `#${redirect}`;
    window.location.reload();
  }
}
