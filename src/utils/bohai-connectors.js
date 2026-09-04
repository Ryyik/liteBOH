import { extractCitationIdsFromText } from './ai-chat-grounding.js';
import {
  CONNECTOR_TIMEOUT_MS,
  ACTION_RETRY_DELAY_MS,
  MAX_ACTION_RETRY_COUNT,
  BOHAI_ERROR_TYPES,
  BOHAI_ERROR_MESSAGES,
  categorizeError,
  shouldSkipConnector,
  recordConnectorFailure,
  resetConnectorFailures,
  recordActionFailure,
  resetActionFailures
} from './bohai-constants.js';

export const BOHAI_CONNECTOR_IDS = {
  cloud: 'cloud',
  sharedMemory: 'sharedMemory',
  knowledge: 'knowledge',
  siteGuide: 'siteGuide',
  forum: 'forum',
  userPrivate: 'userPrivate',
  health: 'health',
  webSearch: 'webSearch'
};

export const BOHAI_ACTION_IDS = {
  createPost: 'createPost',
  saveCloud: 'saveCloud',
  saveSharedMemory: 'saveSharedMemory',
  saveBothMemories: 'saveBothMemories',
  quickNote: 'quickNote',
  cloudReferenceConsent: 'cloudReferenceConsent',
  createPage: 'createPage'
};

export const BOHAI_CONNECTOR_LAYERS = {
  capability: 'capability',
  routing: 'routing',
  evidence: 'evidence',
  action: 'action'
};

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const normalizeLabel = (value) => String(value || '').trim();

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new DOMException(timeoutMessage || '操作超时', 'TimeoutError'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId) clearTimeout(timerId);
  });
};

export const createBohAIConnector = ({
  id = '',
  planKey = '',
  label = '',
  source = '',
  layer = BOHAI_CONNECTOR_LAYERS.capability,
  evidencePrefix = '',
  requiresLogin = false,
  read = null,
  describeAction = null
} = {}) => {
  // 强制要求 id 必填，避免后续熔断 key 漂移：不同 connector 共用空串或 planKey
  // 会让 circuit breaker 状态互相污染。
  const finalId = String(id || '').trim() || String(planKey || '').trim();
  if (!finalId) {
    throw new Error('createBohAIConnector: 必须提供 id 或 planKey');
  }
  return {
    id: finalId,
    planKey,
    label,
    source: source || label,
    layer,
    evidencePrefix,
    requiresLogin: Boolean(requiresLogin),
    read,
    describeAction
  };
};

export const createBohAIAction = ({
  id = '',
  label = '',
  source = '',
  requiresLogin = true,
  requiresConfirmation = true,
  validate = null,
  execute = null,
  formatSuccess = null,
  formatFailure = null
} = {}) => ({
  id,
  label,
  source: source || label,
  layer: BOHAI_CONNECTOR_LAYERS.action,
  requiresLogin: Boolean(requiresLogin),
  requiresConfirmation: Boolean(requiresConfirmation),
  validate,
  execute,
  formatSuccess,
  formatFailure
});

export const normalizeBohAIActionResult = (action = {}, rawResult = {}) => {
  const payload = rawResult && typeof rawResult === 'object' ? rawResult : {};
  const ok = Boolean(payload.ok);
  const message = String(payload.message || '').trim();
  const errorMessage = String(payload.error?.message || payload.error || '').trim();
  return {
    ok,
    actionId: action.id || '',
    label: action.label || '',
    source: action.source || action.label || '',
    message,
    errorMessage,
    data: payload.data ?? null,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
  };
};

export const runBohAIAction = async ({
  action = null,
  payload = {},
  auth = {},
  logger = null,
  retryCount = 0,
  actionTimeoutMs = CONNECTOR_TIMEOUT_MS
} = {}) => {
  if (!action || typeof action !== 'object') {
    return {
      ok: false,
      actionId: '',
      label: '',
      source: '',
      message: '',
      errorMessage: BOHAI_ERROR_MESSAGES.actionNotFound,
      data: null,
      metadata: {}
    };
  }

  const isLoggedIn = Boolean(auth?.isLoggedIn);
  const userId = String(auth?.userId || '').trim();
  if (action.requiresLogin && (!isLoggedIn || !userId)) {
    return {
      ok: false,
      actionId: action.id || '',
      label: action.label || '',
      source: action.source || action.label || '',
      message: '',
      errorMessage: BOHAI_ERROR_MESSAGES.loginRequired,
      data: null,
      metadata: { reason: BOHAI_ERROR_TYPES.LOGIN_REQUIRED }
    };
  }

  if (typeof action.validate === 'function') {
    const validation = await action.validate(payload, { auth, action });
    if (validation && validation.ok === false) {
      return normalizeBohAIActionResult(action, validation);
    }
  }

  if (typeof action.execute !== 'function') {
    return {
      ok: false,
      actionId: action.id || '',
      label: action.label || '',
      source: action.source || action.label || '',
      message: '',
      errorMessage: BOHAI_ERROR_MESSAGES.missingExecutor,
      data: null,
      metadata: { reason: BOHAI_ERROR_TYPES.VALIDATION_ERROR }
    };
  }

  try {
    const executePromise = action.execute(payload, { auth, action });
    const rawResult = await withTimeout(executePromise, actionTimeoutMs, BOHAI_ERROR_MESSAGES.connectorTimeout);
    resetActionFailures(action.id || 'action');
    return normalizeBohAIActionResult(action, rawResult);
  } catch (error) {
    const errorInfo = categorizeError(error);
    const actionId = action.id || 'action';

    if (logger && typeof logger.warn === 'function') {
      logger.warn('boh-ai', `${action.label || actionId} 执行失败`, {
        error: error.message,
        type: errorInfo.type,
        recoverable: errorInfo.recoverable,
        retry: retryCount
      });
    }

    if (errorInfo.recoverable && retryCount < MAX_ACTION_RETRY_COUNT) {
      await new Promise((resolve) => setTimeout(resolve, ACTION_RETRY_DELAY_MS * (retryCount + 1)));
      return runBohAIAction({
        action,
        payload,
        auth,
        logger,
        retryCount: retryCount + 1,
        actionTimeoutMs
      });
    }

    // 写动作失败单独记录到 actionFailureTracker，不再污染 connector 熔断窗口。
    recordActionFailure(actionId);

    return {
      ok: false,
      actionId: action.id || '',
      label: action.label || '',
      source: action.source || action.label || '',
      message: '',
      errorMessage: error?.message || BOHAI_ERROR_MESSAGES.executionFailed,
      data: null,
      metadata: {
        reason: errorInfo.type,
        recoverable: errorInfo.recoverable,
        retries: retryCount
      }
    };
  }
};

export const isConnectorActiveForPlan = (connector = {}, plan = {}) => {
  const key = String(connector.planKey || '').trim();
  return Boolean(key && plan?.[key]);
};

export const normalizeConnectorReadResult = (connector = {}, rawResult = null) => {
  const fallback = {
    connectorId: connector.id || '',
    label: connector.label || '',
    source: connector.source || connector.label || '',
    context: '',
    total: 0,
    labels: [],
    confidence: 0,
    evidenceRefs: [],
    metadata: {}
  };

  if (!rawResult) return fallback;

  if (typeof rawResult === 'string') {
    const context = rawResult.trim();
    return {
      ...fallback,
      context,
      total: context ? 1 : 0,
      confidence: context ? 0.7 : 0,
      evidenceRefs: extractCitationIdsFromText(context)
    };
  }

  const context = String(rawResult.context || '').trim();
  const total = Number.isFinite(Number(rawResult.total))
    ? Math.max(0, Number(rawResult.total))
    : (context ? 1 : 0);
  const labels = toArray(rawResult.labels)
    .map(normalizeLabel)
    .filter(Boolean);
  const confidence = Number.isFinite(Number(rawResult.confidence))
    ? Math.max(0, Math.min(1, Number(rawResult.confidence)))
    : (context ? 0.72 : 0);
  const explicitEvidenceRefs = toArray(rawResult.evidenceRefs)
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean);

  return {
    ...fallback,
    context,
    total,
    labels,
    confidence,
    evidenceRefs: explicitEvidenceRefs.length > 0
      ? explicitEvidenceRefs
      : extractCitationIdsFromText(context),
    metadata: rawResult.metadata && typeof rawResult.metadata === 'object'
      ? rawResult.metadata
      : {}
  };
};

// 公共 core：activeConnectors 过滤 + Promise.allSettled + 错误归一化
// 行为：onProgress 缺失时退化为与原 runBohAIReadConnectors 完全一致；存在时按完成顺序回调。
const runBohAIReadConnectorsCore = async ({
  connectors = [],
  plan = {},
  queryText = '',
  logger = null,
  timeoutMs = CONNECTOR_TIMEOUT_MS,
  onProgress = null
} = {}) => {
  const activeConnectors = connectors.filter((connector) => {
    if (!isConnectorActiveForPlan(connector, plan)) return false;
    // createBohAIConnector 已强制 id 必填；这里再做一次防御，避免外部直接传入
    // 匿名对象时熔断 key 漂移到空串。
    const connectorId = connector.id || connector.planKey || '';
    return !shouldSkipConnector(connectorId);
  });

  const total = activeConnectors.length;
  let completed = 0;
  const notifyProgress = (currentLabel) => {
    if (typeof onProgress === 'function') {
      completed += 1;
      onProgress({
        completed,
        total,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 100,
        currentConnector: currentLabel || null,
        status: completed >= total ? 'completed' : 'loading'
      });
    }
  };

  const settled = await Promise.allSettled(
    activeConnectors.map(async (connector) => {
      const connectorId = connector.id || '';
      const connectorLabel = connector.label || connectorId;
      if (typeof connector.read !== 'function') {
        notifyProgress(connectorLabel);
        return normalizeConnectorReadResult(connector, null);
      }
      try {
        const readPromise = connector.read(queryText, { plan, connector });
        const rawResult = await withTimeout(readPromise, timeoutMs, BOHAI_ERROR_MESSAGES.connectorTimeout);
        resetConnectorFailures(connectorId);
        notifyProgress(connectorLabel);
        return normalizeConnectorReadResult(connector, rawResult);
      } catch (error) {
        const errorInfo = categorizeError(error);
        if (logger && typeof logger.warn === 'function') {
          logger.warn('boh-ai', `${connectorLabel} 检索失败`, {
            error: error.message,
            type: errorInfo.type
          });
        }
        recordConnectorFailure(connectorId);
        notifyProgress(connectorLabel);
        throw error;
      }
    })
  );

  return settled.map((result, index) => {
    const connector = activeConnectors[index];
    if (result.status === 'fulfilled') {
      return {
        ok: true,
        connector,
        ...result.value
      };
    }

    return {
      ok: false,
      connector,
      connectorId: connector?.id || '',
      label: connector?.label || '',
      source: connector?.source || connector?.label || '',
      context: '',
      total: 0,
      labels: [],
      confidence: 0,
      evidenceRefs: [],
      metadata: {},
      error: result.reason
    };
  });
};

export const runBohAIReadConnectors = async (options = {}) => runBohAIReadConnectorsCore(options);

export const runBohAIReadConnectorsWithProgress = async (options = {}) => runBohAIReadConnectorsCore(options);

export const summarizeBohAIConnectorResults = (results = []) => {
  const source = Array.isArray(results) ? results : [];
  const contextBlocks = [];
  const evidenceRefs = new Set();
  const totalsById = {};
  const labelsById = {};

  source.forEach((result) => {
    const connectorId = String(result?.connectorId || result?.connector?.id || '').trim();
    if (!connectorId) return;
    totalsById[connectorId] = Number(result?.total || 0);
    labelsById[connectorId] = Array.isArray(result?.labels) ? result.labels : [];

    if (result?.context) {
      contextBlocks.push(result.context);
    }

    toArray(result?.evidenceRefs).forEach((ref) => {
      const normalized = String(ref || '').trim().toUpperCase();
      if (normalized) evidenceRefs.add(normalized);
    });
  });

  return {
    contextBlocks,
    evidenceRefs: [...evidenceRefs],
    totalsById,
    labelsById
  };
};

export const buildBohAIConnectorActionNote = (results = []) => {
  const parts = [];
  (Array.isArray(results) ? results : []).forEach((result) => {
    if (result?.ok === false) return;
    const connector = result?.connector || {};
    if (typeof connector.describeAction === 'function') {
      const custom = connector.describeAction(result);
      if (custom) parts.push(custom);
      return;
    }
    if (result?.context) {
      parts.push(`查看了${result.label || result.source || connector.label || '相关资料'}`);
    }
  });
  if (parts.length === 0) return '';
  return `${parts.join('，')}。`;
};
