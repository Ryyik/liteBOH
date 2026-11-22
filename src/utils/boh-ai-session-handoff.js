/**
 * boh-ai-session-handoff —— 「论坛内联回答卡片 → /ai-chat 自动打开这条对话」的交接。
 *
 * 背景（2026-11-22）：BOHAI 会话没有 id，只有 `timestamp` + 数组下标
 * （`useConversationManager.startNewChat` unshift，落盘形状见 bohai-chat-session-store.js），
 * 且全页 `/ai-chat` 是 keepAlive 的 —— 挂载/激活时恒取 index 0，没有任何
 * 「从外部带一个会话进来打开」的通道。本模块就是那条通道：
 *
 *   · 发起方（BohForumAnswerCard）：点卡片 → 停流 → 强制落盘 → `requestBohAISessionOpen(ts)`
 *     → `router.push('/ai-chat')`；
 *   · 消费方（useBohShell 的 onMounted + onActivated，isStandalone 门控）：
 *     `consumePendingBohAISessionOpen()` 读后即清 → reload storage → 按 timestamp 找下标
 *     → `switchSession(idx)`。
 *
 * 为什么用模块单例而不是 sessionStorage：交接只发生在 SPA 内部的 router.push，
 * 不跨刷新；模块单例与 `useBohIsland` 的 pendingAsk 同款先例，且不用碰存储键名清单。
 *
 * ⚠️ 读后即清是契约：消费方拿到 0（或 falsy）就代表「没有待交接」。
 */

let pendingTimestamp = 0;

/**
 * 发起交接：请求全页打开这条会话。
 * @param {number} timestamp 会话的创建时间戳（`chatSessions[currentSessionIndex].timestamp`）
 * @returns {boolean} 是否受理（timestamp 非正数拒绝）
 */
export const requestBohAISessionOpen = (timestamp) => {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  pendingTimestamp = ts;
  return true;
};

/**
 * 消费交接：取走待打开的会话 timestamp（读后即清）。
 * @returns {number} 0 = 没有待交接
 */
export const consumePendingBohAISessionOpen = () => {
  const ts = pendingTimestamp;
  pendingTimestamp = 0;
  return ts;
};
