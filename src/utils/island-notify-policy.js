/**
 * 通知岛节流闸门（`showIsland.notify` 的准入策略）
 *
 * 为什么需要它 —— 队列本身只保证「不重叠」，不保证「不密集」：
 * `UnifiedNavbar` 里的 `navStatusQueue` 已经在串行播放，但它有三个洞：
 *   ① 队列无上限（理论上可以堆到十几条，逐条播完要 20s+）；
 *   ② 两条之间零间隔（`presentNavStatus` 的 dismiss 定时器到点就直接接管下一条），
 *      用户看到的是「同一张卡不停换字」，而不是几条独立的通知；
 *   ③ 没有类别概念 —— 引导类教学和「发帖失败」排同一个队。
 *
 * 这里只做「能不能进队列 / 下一条要等多久」的判定，不持有队列、不碰 DOM，
 * 队列仍然在 navbar 内（单一真源），本模块是**纯函数 + 一个会话级计数器**。
 *
 * ⚠️ 探针旁路：`window.__BOH_ISLAND_POLICY_OFF__ = true` 后全部放行。
 *    现有 9 个探针/脚本依赖通知岛按时出现（island-smoke、probe-global-search、
 *    probe-overview-island-guards 等），加闸门后连续触发两条会被吞掉 ⇒ 断言随机红。
 *    探针要测时序时应显式打开旁路，而不是放宽断言。
 */

/** 闸门参数（唯一真源，别在调用处再写一份数字） */
export const ISLAND_NOTIFY_POLICY = Object.freeze({
  /** 队列长度上限；超出时按「引导类 → 普通类 → 失败类」的顺序淘汰 */
  maxQueue: 3,
  /** 相邻两条之间的最小间隔（从「上一条开始展示」算起，不是退场后） */
  minGapMs: 1200,
  /** 引导类通知在每个会话内的展示配额 */
  onboardingPerSession: 1,
});

const BYPASS_FLAG = '__BOH_ISLAND_POLICY_OFF__';

/** 会话级状态（模块单例，页面刷新即重置） */
const session = { onboardingShown: 0, lastShownAt: 0 };

const bypassed = () => typeof window !== 'undefined' && window[BYPASS_FLAG] === true;

/** 引导类：教学 / 首次进入说明，可被丢弃 */
export const isIslandOnboardingItem = (item) => String(item?.kind || '') === 'onboarding';

/** 关键类：失败 / 权限 / 错误，永不节流、永不丢弃 */
export const isIslandCriticalItem = (item) => {
  const kind = String(item?.kind || '');
  const tone = String(item?.tone || '');
  const icon = String(item?.icon || '');
  return (
    kind === 'error' ||
    kind === 'critical' ||
    tone === 'danger' ||
    icon === 'error' ||
    icon === 'warning'
  );
};

/** 重置会话状态（探针切换场景 / 切换账号时用） */
export const resetIslandNotifyPolicy = () => {
  session.onboardingShown = 0;
  session.lastShownAt = 0;
};

/**
 * 准入判定。
 * @returns {{ admit: boolean, reason: 'bypass'|'critical'|'ok'|'onboarding-quota'|'queue-full' }}
 */
export const admitIslandNotification = (item, { busy = false, queueLength = 0 } = {}) => {
  if (bypassed()) return { admit: true, reason: 'bypass' };
  // 失败类无条件放行：被吞掉的失败提示比噪音严重得多
  if (isIslandCriticalItem(item)) return { admit: true, reason: 'critical' };
  if (
    isIslandOnboardingItem(item) &&
    session.onboardingShown >= ISLAND_NOTIFY_POLICY.onboardingPerSession
  ) {
    return { admit: false, reason: 'onboarding-quota' };
  }
  // 正在展示的那条不占队列长度；只有排队时才判上限
  if (busy && queueLength >= ISLAND_NOTIFY_POLICY.maxQueue)
    return { admit: false, reason: 'queue-full' };
  return { admit: true, reason: 'ok' };
};

/** 一条通知真正上屏后记账（由 navbar 的 presentNavStatus 调用） */
export const noteIslandNotificationShown = (item, { now = Date.now() } = {}) => {
  session.lastShownAt = Number(now) || 0;
  if (isIslandOnboardingItem(item)) session.onboardingShown += 1;
};

/** 距「允许展示下一条」还差多少毫秒；0 表示可以立刻上屏 */
export const islandNotifyGapMs = (now = Date.now()) => {
  if (bypassed()) return 0;
  if (!session.lastShownAt) return 0;
  const elapsed = Number(now) - session.lastShownAt;
  if (!Number.isFinite(elapsed) || elapsed >= ISLAND_NOTIFY_POLICY.minGapMs) return 0;
  return Math.max(0, ISLAND_NOTIFY_POLICY.minGapMs - elapsed);
};

const pickVictimIndex = (queue) => {
  const onboarding = queue.findIndex(isIslandOnboardingItem);
  if (onboarding >= 0) return onboarding;
  const normal = queue.findIndex((it) => !isIslandCriticalItem(it));
  return normal >= 0 ? normal : 0;
};

/**
 * 带上限地入队。满了按 pickVictimIndex 淘汰一条再塞。
 * @returns {Array} 被丢弃的项（探针/日志可用来归因）
 */
export const pushWithIslandQueueCap = (queue, item) => {
  const dropped = [];
  const cap = bypassed() ? Number.POSITIVE_INFINITY : ISLAND_NOTIFY_POLICY.maxQueue;
  while (queue.length >= cap) {
    const [gone] = queue.splice(pickVictimIndex(queue), 1);
    if (!gone) break;
    dropped.push(gone);
  }
  queue.push(item);
  return dropped;
};
