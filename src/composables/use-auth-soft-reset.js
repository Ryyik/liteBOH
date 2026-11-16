/**
 * 退出登录的「软重置」通道（2026-11-16 C1）。
 *
 * 背景：退出后必须让用户**立刻**看到游客视角。此前的做法是 `location.reload()` ——
 * 靠整页重载把 SPA 内存里的一切（pinia、组件 state、请求缓存）一起扔掉。
 * 代价是重新下载并解析 HTML/JS/CSS（实测 reload 本身 ~192ms，慢网更久），
 * 还有一次白屏闪烁。
 *
 * 现在改成：
 *   1. `authStore.logout({ reset: true })` 真清 pinia（不再是 reload 帮忙清）；
 *   2. 由 App 注册的处理器**重挂页面树**（boundaryKey += 1）+ 回到 `/`。
 * 页面树一重挂，所有路由级 `KeepAlive` 缓存一起销毁，组件会以游客身份重新取数 ——
 * 效果等价于 reload，但不走网络加载。
 *
 * ⚠️ 为什么要有注册表而不是直接 import App 里的东西：
 *   · `utils/` 不能反向依赖 `App.vue`；
 *   · 处理器不存在时（单元测试、极端渲染失败）必须能**明确回落到 reload**，
 *     否则退出登录会变成"什么都不发生"——这比慢更糟。
 */

let softResetHandler = null;

/** App 启动时注册一次。传 null 可注销（测试用）。 */
export const registerAuthSoftResetHandler = (handler) => {
  softResetHandler = typeof handler === 'function' ? handler : null;
};

/**
 * 请求一次软重置。
 * @returns {boolean} 是否真的有处理器接管（false ⇒ 调用方必须自己 reload 兜底）
 */
export const requestAuthSoftReset = ({ redirect = '/' } = {}) => {
  if (!softResetHandler) return false;
  try {
    softResetHandler({ redirect });
    return true;
  } catch {
    // 处理器自己炸了（例如页面树已处于错误态）——交回调用方走 reload
    return false;
  }
};
