// 硅基流动 chat completions 端点 —— 单一真源。
// 此前同一行 `import.meta.env.VITE_SILICON_CLOUD_URL || '<默认>'` 在 5 个文件里各写了一遍
// （content-moderation / bolek-model-client / treehole-space-api / Lab/index.vue，
//  以及 chat-engine-config.js 里那份从未被引用的导出）。换 provider 端点时只应改这里。
export const SILICON_CLOUD_CHAT_URL =
  import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';

/**
 * 博莱克「自动记忆沉淀」用的模式行（`bolek_model_configs.mode_id`）。
 *
 * 为什么单独一行，而不是复用 fast / deepseek：
 *   · `fast` 是游客默认模式，还被 lab_ai_model_configs 的周报/文档排版/PPT 三个后台任务绑定
 *     —— 改它会连带换掉游客对话和那三个功能；
 *   · `deepseek` 行倍率 1.00，而记忆抽取是每轮回复后自动跑的后台任务，复用它会静默扣用户额度
 *     （free 档 50000/日，单次抽取约 3k ⇒ 十几轮就撞额度墙）。
 * 本行倍率 0（不扣费）、min_tier='free'（只服务登录用户），模型 = 魔搭 DeepSeek-V4.1-Flash。
 *
 * 迁移：`supabase/migrations/2026111702_bohai_memory_mode_internal.sql`
 * ⚠️ 它是内部行，不进用户侧模式选择器（RPC 排除 `internal-%`）。
 */
export const BOH_MEMORY_MODE_ID = 'internal-memory';

export const CONNECTOR_TIMEOUT_MS = 8000;

export const ACTION_RETRY_DELAY_MS = 1000;

export const MAX_ACTION_RETRY_COUNT = 2;

export const KEYWORD_CACHE_MAX_SIZE = 100;

export const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;

export const ROUTE_DECISION_CACHE_MAX_SIZE = 200;

// 注：`EVIDENCE_SOURCE_WEIGHTS` / `RANKING_SCORE_WEIGHTS` 已迁至
// `src/views/Bolek/domain/evidence.js`（plans/025 v2 · Step 2「domain 数据沉淀」）。
// 它们是博莱克领域数据（证据源排序口径），且只被博莱克消费；
// 全局这里保留副本会给「谁是真源」制造第二处。

export const CIRCUIT_BREAKER = {
  failureThreshold: 3,
  failureWindowMs: 5 * 60 * 1000,
  resetWindowMs: 10 * 60 * 1000,
};

export const BOLEK_ERROR_TYPES = {
  NETWORK_ERROR: 'network_error',
  AUTH_ERROR: 'auth_error',
  LOGIN_REQUIRED: 'login_required',
  TIMEOUT_ERROR: 'timeout_error',
  VALIDATION_ERROR: 'validation_error',
  EXECUTION_ERROR: 'execution_error',
  UNKNOWN_ERROR: 'unknown_error',
};

export const BOLEK_ERROR_MESSAGES = {
  actionNotFound: '动作不存在',
  loginRequired: '请先登录后再执行此操作。',
  missingExecutor: '动作未配置执行器',
  executionFailed: '动作执行失败',
  connectorTimeout: '连接器请求超时',
  connectorReadFailed: '连接器读取失败',
};

export const FRIENDLY_ERROR_MESSAGES = {
  [BOLEK_ERROR_TYPES.NETWORK_ERROR]: {
    title: '网络连接不稳定',
    message: '网络连接出现问题，请检查网络后重试。',
    suggestion: '如果问题持续存在，可能是服务器暂时不可用。',
  },
  [BOLEK_ERROR_TYPES.TIMEOUT_ERROR]: {
    title: '请求超时',
    message: '获取数据花费时间过长，已自动跳过该数据源。',
    suggestion: '请稍后重试，或尝试简化您的问题。',
  },
  [BOLEK_ERROR_TYPES.AUTH_ERROR]: {
    title: '登录状态失效',
    message: '您的登录状态已过期。',
    suggestion: '请重新登录后继续操作。',
  },
  [BOLEK_ERROR_TYPES.VALIDATION_ERROR]: {
    title: '操作验证失败',
    message: '您提供的信息不符合要求。',
    suggestion: '请检查输入内容后重试。',
  },
  [BOLEK_ERROR_TYPES.EXECUTION_ERROR]: {
    title: '执行失败',
    message: '操作执行过程中出现错误。',
    suggestion: '请稍后重试，如果问题持续存在，请联系管理员。',
  },
  [BOLEK_ERROR_TYPES.UNKNOWN_ERROR]: {
    title: '操作失败',
    message: '发生了未知错误。',
    suggestion: '请稍后重试。',
  },
};

export const categorizeError = (error) => {
  if (!error) return { type: BOLEK_ERROR_TYPES.UNKNOWN_ERROR, recoverable: true };
  const name = String(error.name || '');
  const message = String(error.message || '').toLowerCase();

  if (name === 'AbortError' || message.includes('timeout') || message.includes('abort')) {
    return { type: BOLEK_ERROR_TYPES.TIMEOUT_ERROR, recoverable: true };
  }
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
    return { type: BOLEK_ERROR_TYPES.AUTH_ERROR, recoverable: false };
  }
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnrefused')
  ) {
    return { type: BOLEK_ERROR_TYPES.NETWORK_ERROR, recoverable: true };
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return { type: BOLEK_ERROR_TYPES.VALIDATION_ERROR, recoverable: false };
  }
  return { type: BOLEK_ERROR_TYPES.EXECUTION_ERROR, recoverable: true };
};

export const getUserFriendlyError = (error) => {
  const { type } = categorizeError(error);
  return FRIENDLY_ERROR_MESSAGES[type] || FRIENDLY_ERROR_MESSAGES[BOLEK_ERROR_TYPES.UNKNOWN_ERROR];
};

const connectorFailureTracker = new Map();
// 写动作（createPost 等）单独的失败追踪器，与读连接器熔断解耦，
// 避免写动作的业务错误污染 connector 熔断窗口。
const actionFailureTracker = new Map();

export const shouldSkipConnector = (connectorId) => {
  const failures = connectorFailureTracker.get(connectorId) || { count: 0, lastFailure: 0 };
  const now = Date.now();

  if (
    failures.count >= CIRCUIT_BREAKER.failureThreshold &&
    now - failures.lastFailure < CIRCUIT_BREAKER.failureWindowMs
  ) {
    return true;
  }

  if (now - failures.lastFailure > CIRCUIT_BREAKER.resetWindowMs) {
    connectorFailureTracker.set(connectorId, { count: 0, lastFailure: 0 });
  }

  return false;
};

export const recordConnectorFailure = (connectorId) => {
  const current = connectorFailureTracker.get(connectorId) || { count: 0, lastFailure: 0 };
  connectorFailureTracker.set(connectorId, {
    count: current.count + 1,
    lastFailure: Date.now(),
  });
};

export const resetConnectorFailures = (connectorId) => {
  connectorFailureTracker.set(connectorId, { count: 0, lastFailure: 0 });
};

// 写动作的失败追踪与查询（独立于 connector 熔断器，仅用于后续统计 / 慢失败告警，
// 不会影响 runBolekAction 入口处是否跳过该动作）。
export const recordActionFailure = (actionId) => {
  if (!actionId) return;
  const current = actionFailureTracker.get(actionId) || { count: 0, lastFailure: 0 };
  actionFailureTracker.set(actionId, {
    count: current.count + 1,
    lastFailure: Date.now(),
  });
};

export const resetActionFailures = (actionId) => {
  if (!actionId) return;
  actionFailureTracker.set(actionId, { count: 0, lastFailure: 0 });
};

export const getActionFailureStats = (actionId) => {
  if (!actionId) return { count: 0, lastFailure: 0 };
  return actionFailureTracker.get(actionId) || { count: 0, lastFailure: 0 };
};
