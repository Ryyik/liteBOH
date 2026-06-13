export const CONNECTOR_TIMEOUT_MS = 8000;

export const ACTION_RETRY_DELAY_MS = 1000;

export const MAX_ACTION_RETRY_COUNT = 2;

export const KEYWORD_CACHE_MAX_SIZE = 100;

export const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;

export const ROUTE_DECISION_CACHE_MAX_SIZE = 200;

export const EVIDENCE_SOURCE_WEIGHTS = {
  userPrivate: 22,
  cloud: 18,
  forum: 16,
  sharedMemory: 14,
  knowledge: 12,
  siteGuide: 10
};

export const RANKING_SCORE_WEIGHTS = {
  lexicalMultiplier: 5,
  defaultSourceScore: 6,
  confidenceMultiplier: 10
};

export const CIRCUIT_BREAKER = {
  failureThreshold: 3,
  failureWindowMs: 5 * 60 * 1000,
  resetWindowMs: 10 * 60 * 1000
};

export const BOHAI_ERROR_TYPES = {
  NETWORK_ERROR: 'network_error',
  AUTH_ERROR: 'auth_error',
  LOGIN_REQUIRED: 'login_required',
  TIMEOUT_ERROR: 'timeout_error',
  VALIDATION_ERROR: 'validation_error',
  EXECUTION_ERROR: 'execution_error',
  UNKNOWN_ERROR: 'unknown_error'
};

export const BOHAI_ERROR_MESSAGES = {
  actionNotFound: '动作不存在',
  loginRequired: '请先登录后再执行此操作。',
  missingExecutor: '动作未配置执行器',
  executionFailed: '动作执行失败',
  connectorTimeout: '连接器请求超时',
  connectorReadFailed: '连接器读取失败'
};

export const FRIENDLY_ERROR_MESSAGES = {
  [BOHAI_ERROR_TYPES.NETWORK_ERROR]: {
    title: '网络连接不稳定',
    message: '网络连接出现问题，请检查网络后重试。',
    suggestion: '如果问题持续存在，可能是服务器暂时不可用。'
  },
  [BOHAI_ERROR_TYPES.TIMEOUT_ERROR]: {
    title: '请求超时',
    message: '获取数据花费时间过长，已自动跳过该数据源。',
    suggestion: '请稍后重试，或尝试简化您的问题。'
  },
  [BOHAI_ERROR_TYPES.AUTH_ERROR]: {
    title: '登录状态失效',
    message: '您的登录状态已过期。',
    suggestion: '请重新登录后继续操作。'
  },
  [BOHAI_ERROR_TYPES.VALIDATION_ERROR]: {
    title: '操作验证失败',
    message: '您提供的信息不符合要求。',
    suggestion: '请检查输入内容后重试。'
  },
  [BOHAI_ERROR_TYPES.EXECUTION_ERROR]: {
    title: '执行失败',
    message: '操作执行过程中出现错误。',
    suggestion: '请稍后重试，如果问题持续存在，请联系管理员。'
  },
  [BOHAI_ERROR_TYPES.UNKNOWN_ERROR]: {
    title: '操作失败',
    message: '发生了未知错误。',
    suggestion: '请稍后重试。'
  }
};

export const categorizeError = (error) => {
  if (!error) return { type: BOHAI_ERROR_TYPES.UNKNOWN_ERROR, recoverable: true };
  const name = String(error.name || '');
  const message = String(error.message || '').toLowerCase();

  if (name === 'AbortError' || message.includes('timeout') || message.includes('abort')) {
    return { type: BOHAI_ERROR_TYPES.TIMEOUT_ERROR, recoverable: true };
  }
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
    return { type: BOHAI_ERROR_TYPES.AUTH_ERROR, recoverable: false };
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('econnrefused')) {
    return { type: BOHAI_ERROR_TYPES.NETWORK_ERROR, recoverable: true };
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return { type: BOHAI_ERROR_TYPES.VALIDATION_ERROR, recoverable: false };
  }
  return { type: BOHAI_ERROR_TYPES.EXECUTION_ERROR, recoverable: true };
};

export const getUserFriendlyError = (error) => {
  const { type } = categorizeError(error);
  return FRIENDLY_ERROR_MESSAGES[type] || FRIENDLY_ERROR_MESSAGES[BOHAI_ERROR_TYPES.UNKNOWN_ERROR];
};

const connectorFailureTracker = new Map();
// 写动作（createPost 等）单独的失败追踪器，与读连接器熔断解耦，
// 避免写动作的业务错误污染 connector 熔断窗口。
const actionFailureTracker = new Map();

export const shouldSkipConnector = (connectorId) => {
  const failures = connectorFailureTracker.get(connectorId) || { count: 0, lastFailure: 0 };
  const now = Date.now();

  if (failures.count >= CIRCUIT_BREAKER.failureThreshold
      && (now - failures.lastFailure) < CIRCUIT_BREAKER.failureWindowMs) {
    return true;
  }

  if ((now - failures.lastFailure) > CIRCUIT_BREAKER.resetWindowMs) {
    connectorFailureTracker.set(connectorId, { count: 0, lastFailure: 0 });
  }

  return false;
};

export const recordConnectorFailure = (connectorId) => {
  const current = connectorFailureTracker.get(connectorId) || { count: 0, lastFailure: 0 };
  connectorFailureTracker.set(connectorId, {
    count: current.count + 1,
    lastFailure: Date.now()
  });
};

export const resetConnectorFailures = (connectorId) => {
  connectorFailureTracker.set(connectorId, { count: 0, lastFailure: 0 });
};

// 写动作的失败追踪与查询（独立于 connector 熔断器，仅用于后续统计 / 慢失败告警，
// 不会影响 runBohAIAction 入口处是否跳过该动作）。
export const recordActionFailure = (actionId) => {
  if (!actionId) return;
  const current = actionFailureTracker.get(actionId) || { count: 0, lastFailure: 0 };
  actionFailureTracker.set(actionId, {
    count: current.count + 1,
    lastFailure: Date.now()
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
