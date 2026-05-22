import { extractCitationIdsFromText } from './ai-chat-grounding.js';

export const BOHAI_CONNECTOR_IDS = {
  cloud: 'cloud',
  sharedMemory: 'sharedMemory',
  knowledge: 'knowledge',
  siteGuide: 'siteGuide',
  forum: 'forum',
  userPrivate: 'userPrivate',
  webSearch: 'webSearch'
};

export const BOHAI_ACTION_IDS = {
  createPost: 'createPost',
  sendMail: 'sendMail',
  saveCloud: 'saveCloud',
  saveSharedMemory: 'saveSharedMemory',
  saveBothMemories: 'saveBothMemories',
  quickNote: 'quickNote',
  cloudReferenceConsent: 'cloudReferenceConsent'
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
} = {}) => ({
  id,
  planKey,
  label,
  source: source || label,
  layer,
  evidencePrefix,
  requiresLogin: Boolean(requiresLogin),
  read,
  describeAction
});

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
  logger = null
} = {}) => {
  if (!action || typeof action !== 'object') {
    return {
      ok: false,
      actionId: '',
      label: '',
      source: '',
      message: '',
      errorMessage: '动作不存在',
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
      errorMessage: '请先登录后再执行此操作。',
      data: null,
      metadata: { reason: 'login_required' }
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
      errorMessage: '动作未配置执行器',
      data: null,
      metadata: { reason: 'missing_executor' }
    };
  }

  try {
    const rawResult = await action.execute(payload, { auth, action });
    return normalizeBohAIActionResult(action, rawResult);
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('boh-ai', `${action.label || action.id || 'Action'} 执行失败`, error);
    }
    return {
      ok: false,
      actionId: action.id || '',
      label: action.label || '',
      source: action.source || action.label || '',
      message: '',
      errorMessage: error?.message || '动作执行失败',
      data: null,
      metadata: { reason: 'exception' }
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

export const runBohAIReadConnectors = async ({
  connectors = [],
  plan = {},
  queryText = '',
  logger = null
} = {}) => {
  const activeConnectors = connectors.filter((connector) => isConnectorActiveForPlan(connector, plan));
  const settled = await Promise.allSettled(
    activeConnectors.map(async (connector) => {
      if (typeof connector.read !== 'function') {
        return normalizeConnectorReadResult(connector, null);
      }
      const rawResult = await connector.read(queryText, { plan, connector });
      return normalizeConnectorReadResult(connector, rawResult);
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

    if (logger && typeof logger.warn === 'function') {
      logger.warn('boh-ai', `${connector?.label || connector?.id || 'Connector'} 检索失败`, result.reason);
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
