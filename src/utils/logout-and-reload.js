/**
 * 退出登录：软重置优先，reload 兜底（2026-11-16 C1）。
 *
 * 为什么不能只 `await authStore.logout()`：
 *   logout → resetState 只清 pinia。已经挂载的页面实例里仍留着**登录态下取回的数据**
 *   （首页论坛流 / 消息 / 左栏 / hero / 通知角标…），SPA 不重建组件就不会重新取数，
 *   用户看到的是「导航变成登录按钮了，但页面还是刚才那份」。
 *
 * 为什么从「整页 reload」改成「软重置」：
 *   · reload 要重新下载并解析 HTML/JS/CSS（本地实测 192ms，慢网更久），还有一次白屏；
 *   · 软重置只做两件事：清 pinia + 重挂页面树（App 的 boundaryKey += 1，
 *     连带销毁路由级 KeepAlive 缓存）→ 组件以游客身份重新取数，效果等价。
 *   · **处理器不存在时必须回落 reload**：宁可慢，也不能让退出变成"什么都没发生"。
 *
 * 两条不能改坏的约束：
 *   1. `reset: true` —— 不再有 reload 帮忙重建 pinia，reset:false 会让旧 store 活下来
 *      （2026-11-01 那次为提速传的 false 只适用于"反正要 reload"的旧实现）。
 *   2. 顺序 —— 注销请求必须先落定（先跳转/重挂会掐断请求，Supabase 侧 refresh token
 *      还活着，下次进站可能又自动登录回来）。
 *
 * @param {{ logout: (options?: { reset?: boolean }) => Promise<void> }} authStore
 * @param {{ redirect?: string }} [options] redirect 用 hash 路径（默认 '/'）
 */

import { clearLoginTarget } from './login-redirect.js';
import { requestAuthSoftReset } from '../composables/use-auth-soft-reset.js';

export async function logoutAndReload(authStore, { redirect = '/' } = {}) {
  try {
    await authStore.logout({ reset: true });
  } finally {
    // 退出即丢弃「登录后回跳」的旧目标：它属于上一个身份的会话意图，
    // 留着会让下次登录莫名跳到一个跟当前操作无关的页面。
    clearLoginTarget();

    if (!requestAuthSoftReset({ redirect })) {
      // 兜底路径：沿用当前 URL 会留在原页面（如 /user-space），所以先写 hash 再重载。
      if (redirect) window.location.hash = `#${redirect}`;
      window.location.reload();
    }
  }
}
