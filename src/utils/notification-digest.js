/**
 * 灵动岛未读聚合文案（本地规则，不走 AI）。
 *
 * 口径（2026-10-15 拍板）：用户点开消息中心且未读 ≥ UNREAD_DIGEST_MIN 条时，
 * UserSpaceMain 弹出 NotificationSuggestIsland，标题用本模块生成的聚合句，
 * 代替原来的「N 条未读消息」。文案形态只有一档（类型计数）：
 *
 *   「7 条未读：点赞 3 · 评论 2 · 系统 1」        （≤3 类全列）
 *   「7 条未读：点赞 3 · 评论 2 · 关注 1 等 4 类」 （>3 类截前 3 类）
 *
 * 设计约束：
 * - 纯函数、确定性输出 —— 可单测，任何失败路径返回 null（调用方退回默认文案），绝不抛错。
 * - 总数 N 与底部导航角标同源（RPC get_unread_notification_count），不是列表行数：
 *   列表分页截断（>30 条未读）时类型分布只是样本，N 仍以角标为准。
 * - 系统类归组口径对齐 Messages/index.vue 的 isSystemNotificationType（system/gift/
 *   中奖/订阅/发帖审查/举报处理/评论审查 都算「系统」），未收录类型兜底「消息」。
 * - 1–3 条档（直述/点名）刻意不实现：阈值 ≥4 才弹岛，写了也是死代码。
 */

import {
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTIFICATION_TYPE,
} from './moderation-retry-cache.js';

/** 弹岛的最小未读数（拍板口径：>3 条才弹，即 ≥4） */
export const UNREAD_DIGEST_MIN = 4;

/** 与 Messages/index.vue:1073 本地常量口径一致（那里没有独立真源模块） */
const LOTTERY_WIN_NOTIFICATION_TYPE = 'lottery_win';
const SUBSCRIPTION_NOTIFICATION_TYPE = 'subscription';

/** 社交类 → 计数标签（名词式；与 getTypeLabel 的动词式标签是两张表，勿合并） */
const SOCIAL_TYPE_LABELS = {
  like: '点赞',
  comment: '评论',
  follow: '关注',
  impression: '印象',
};

/** 系统组（对齐 isSystemNotificationType）→ 统一计为「系统」 */
const SYSTEM_GROUP_TYPES = new Set([
  'system',
  'gift',
  LOTTERY_WIN_NOTIFICATION_TYPE,
  SUBSCRIPTION_NOTIFICATION_TYPE,
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTIFICATION_TYPE,
]);

const digestTypeLabel = (type) => {
  if (SOCIAL_TYPE_LABELS[type]) return SOCIAL_TYPE_LABELS[type];
  if (SYSTEM_GROUP_TYPES.has(type)) return '系统';
  return '消息';
};

/**
 * 生成灵动岛单行聚合文案。
 * @param {Array} notifications 通知行（getUserNotifications 返回的原始行即可，含 status/archived_at/type）
 * @param {{ totalCount?: number|null }} [options] totalCount 传角标 unreadCount；大于列表未读数时作为 N
 * @returns {string|null} <UNREAD_DIGEST_MIN 条或无未读返回 null；否则「N 条未读：点赞 x · …」
 */
export function buildUnreadDigest(notifications = [], { totalCount = null } = {}) {
  try {
    const unread = (Array.isArray(notifications) ? notifications : []).filter(
      (n) => n && n.status === 'unread' && !n.archived_at,
    );
    if (unread.length < UNREAD_DIGEST_MIN) return null;

    // 按类型计数：Map 保首现序，同数量时先出现者排前（输出稳定）
    const counts = new Map();
    for (const n of unread) {
      const label = digestTypeLabel(n.type);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const groups = [...counts.entries()]
      .map(([label, count], idx) => ({ label, count, idx }))
      .sort((a, b) => b.count - a.count || a.idx - b.idx);

    // N 优先用角标口径（totalCount），与底部导航红点一致
    const total =
      Number.isFinite(Number(totalCount)) && Number(totalCount) > unread.length
        ? Number(totalCount)
        : unread.length;

    const shown = groups.slice(0, 3).map((g) => `${g.label} ${g.count}`);
    const rest = groups.length > 3 ? ` 等 ${groups.length} 类` : '';
    return `${total} 条未读：${shown.join(' · ')}${rest}`;
  } catch {
    // 文案是增强不是依赖：任何异常都退回调用方的默认文案
    return null;
  }
}
