/**
 * 「去订阅页签发放」的跨组件预填意图（plans/050 期 3）。
 *
 * 用户详情里的「订阅层级」行只负责跳转；真正的发放/修改有 6 个字段与完整
 * 生命周期，属于订阅页签。这里把「要预填谁」暂存到模块级，由
 * SubscriptionGrantConsole 挂载时消费一次。
 *
 * 口径与 useAdminTabIntent 相同：TTL 3s，消费即清，避免残留污染下一次
 * 无关的重建。
 */
const PREFILL_TTL_MS = 3000;

let pendingUser = null;
let pendingAt = 0;

export const setSubscriptionGrantPrefill = (user) => {
  const id = String(user?.id || '').trim();
  pendingUser = id ? { id, username: String(user?.username || '').trim() } : null;
  pendingAt = pendingUser ? Date.now() : 0;
};

export const consumeSubscriptionGrantPrefill = () => {
  const user = pendingUser;
  const fresh = pendingAt > 0 && Date.now() - pendingAt <= PREFILL_TTL_MS;
  pendingUser = null;
  pendingAt = 0;
  return fresh ? user : null;
};
