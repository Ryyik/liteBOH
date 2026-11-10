/**
 * 论坛「上次看到这里」分隔线 —— 判定与文案的**单一真源**（纯函数，视图层只负责渲染）。
 *
 * 产品背景（2026-11-10 拍板，取代「智能概览」页 `/overview` 的入口地位）：
 * 用户回来的第一诉求不是「再给我一份列表」，而是「我上次看到哪儿了」。所以不做页面、
 * 不做弹层，只在论坛信息流里画一条位置标记。
 *
 * 口径与取舍：
 * - **锚点复用 `authStore.offlineAnchorAt`，不新建表、不新增 RPC。** 它是会话级快照，
 *   值 = 上一段在线结束的时刻（`captureOfflineAnchor` 在写库前捕获，见 auth.ts:1061）。
 *   为什么不加 `forum_seen_at` 列：那是「读到哪一条」的精确解，但要一次迁移 + 一个写入时机，
 *   v1 先用天粒度近似验证形态；偏差是「心跳把几分钟前算成已读」，表现为少报几条。
 * - **新帖数从已加载的列表里数前缀，不向服务端要。** 换数据源（例如
 *   `get_offline_overview` 的 total）会包含新闻、排除自己的帖子，算出的数在论坛列表里
 *   对不上 —— 分隔线位置必须与渲染顺序同源，否则线会插在错误的两条之间。
 * - **只在「时间倒序 + 无任何筛选」时画。** 热门排序不是时间序；搜索结果 / 标签筛选 /
 *   我的帖子 / 只看关注下面那条列表根本不是全量时间流，标注「上次看到这里」是错的。
 * - **首次登录不画。** 锚点是合成的 now-7d（`isFirstLoginSession`），没有「上次」可言。
 * - **全列表都是新帖不画。** 线会落在列表末尾，看不到任何旧内容，纯噪声。
 * - **时间不可解析时停止计数（保守）。** 宁可少标，不可把旧帖标成新帖 —— 标注错位置的
 *   代价远高于漏标（用户会以为自己漏看了内容）。
 */

/** 时间戳 → 展示文案：同年 `MM-DD HH:mm`，跨年补年份。 */
export const formatSeenAnchorLabel = (iso, now = new Date()) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.getFullYear() === now.getFullYear()
    ? `${monthDay} ${clock}`
    : `${date.getFullYear()}-${monthDay} ${clock}`;
};

export const FORUM_SEEN_DIVIDER_HIDDEN = Object.freeze({
  visible: false,
  splitIndex: -1,
  newCount: 0,
});

/**
 * @param {object} options
 * @param {Array<{created_at?: string}>} options.posts 当前列表（时间倒序）
 * @param {string|null} options.anchorIso 「上次在线」时刻（authStore.offlineAnchorAt）
 * @param {boolean} options.isFirstLogin 合成锚点会话（真·首次登录）
 * @param {boolean} options.enabled 当前是否处于「时间倒序 + 无筛选」的列表
 * @returns {{visible: boolean, splitIndex: number, newCount: number}}
 *   splitIndex = 分隔线应插在的**绝对下标**（第一条旧帖的位置），visible 为 false 时为 -1
 */
export const resolveForumSeenDivider = ({
  posts = [],
  anchorIso = null,
  isFirstLogin = false,
  enabled = true,
} = {}) => {
  if (!enabled || isFirstLogin) return FORUM_SEEN_DIVIDER_HIDDEN;
  const anchorMs = anchorIso ? new Date(anchorIso).getTime() : NaN;
  if (!Number.isFinite(anchorMs)) return FORUM_SEEN_DIVIDER_HIDDEN;

  const list = Array.isArray(posts) ? posts : [];
  // 少于 2 条无从「分开新旧」：要么全旧（newCount=0）要么全新（newCount=length），都会被下面判掉
  if (list.length < 2) return FORUM_SEEN_DIVIDER_HIDDEN;

  let newCount = 0;
  for (const post of list) {
    const ts = post?.created_at ? new Date(post.created_at).getTime() : NaN;
    if (!Number.isFinite(ts) || ts <= anchorMs) break;
    newCount += 1;
  }
  if (newCount <= 0 || newCount >= list.length) return FORUM_SEEN_DIVIDER_HIDDEN;

  return { visible: true, splitIndex: newCount, newCount };
};
