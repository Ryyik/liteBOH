/**
 * 首屏 feed 预发（A1，2026-11-16）。
 *
 * ── 解决什么 ──
 * 首访的时间轴是这样的：开场画 0～2s（此时**一条数据请求都没有**）→ 宿主路由 chunk 与
 * AsyncForum chunk 依次下载、解析 → ForumMain 挂载 → 这才发出第一条 `posts` 请求。
 * 实测（本地 dev 探针）第一条数据请求要等到 ~3.8s，而它距离 ForumMain chunk 完成只差 30–40ms
 * ⇒ 那 3 秒多完全是「客户端在搭骨架、没空取数」，不是在等网络。
 * 于是把首屏那一笔 feed 提前到开场画期间发出去，让「下载/解析」和「等数据库」重叠。
 *
 * ── 为什么敢这么写 ──
 * `getPosts` 走 `executeRead`，它有 in-flight 去重 + TTL 缓存，键是
 * `buildRequestKey('posts.getPosts', params)` —— 只要参数与 ForumMain 首次挂载时
 * **逐字一致**（两边都用 `buildForumFeedParams()` 这个单源），ForumMain 挂载后会直接
 * 命中这笔在途请求，不会发第二笔。所以这个函数天然幂等，不需要自己记状态。
 *
 * ── 两条已知代价（别当 bug 修）──
 * 1. 登录态在预发与挂载之间翻转（例如持久化的 `userInfo` 已失效、`initLoginState` 随后
 *    改成未登录）时，key 里的 `userId` 不同 ⇒ 会多发一笔。窗口很窄，且这一笔本身是
 *    「用户本来也要发的那一笔」，只是多了一次。
 * 2. 预发没有 AbortSignal（还没有人持有它）⇒ 用户秒退时这笔请求不会被取消。
 *    代价是一次后台读，收益是「不退的用户省掉一整段等待」，划算。
 */

import { getPosts } from '@/utils/api/forum/post-api.js';
import { useAuthStore } from '@/stores/auth';
import { buildForumFeedParams } from './forum-config.js';

/**
 * 预发首屏 feed。可安全重复调用（request-core 负责去重）。
 * @returns {Promise<any>|null} 不可用的环境（无 pinia）返回 null
 */
export function prefetchForumFirstPage() {
  let userId = null;
  try {
    const authStore = useAuthStore();
    userId = authStore?.isLoggedIn ? authStore.userInfo?.id || null : null;
  } catch {
    // 没有活跃的 pinia（单测 / SSR 预渲染）：不发请求，交给正常路径
    return null;
  }
  return getPosts(userId, buildForumFeedParams());
}
