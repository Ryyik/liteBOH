/**
 * 概览「待处理事项」计数（纯函数，供单测；plans/027 E6.5）。
 *
 * 背景（2026-10-17 审查实测）：`tabTotals` 只为 `tabs` 数组里的 tab 建键；
 * `lotteryNotificationJobs` 等已合并的旧 tab 不在数组里 ⇒ 取出来是 undefined，
 * 直接相加会让概览卡与异常 banner 变成 `NaN`（截图 batch-d-detail.png 可见）。
 * 这里统一把非有限数收敛成 0，保证「有异常就 >0、无异常就 0」，不会出现 NaN。
 */
export const toFiniteCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const sumDiagnosticIssues = ({
  moderationPendingCount = 0,
  dueDraws = 0,
  notificationJobs = 0,
  schedulerFailed = false,
} = {}) =>
  toFiniteCount(moderationPendingCount) +
  toFiniteCount(dueDraws) +
  toFiniteCount(notificationJobs) +
  (schedulerFailed ? 1 : 0);
