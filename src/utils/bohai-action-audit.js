export const BOHAI_ACTION_AUDIT_STORAGE_KEY = 'boh_ai_action_audits';
export const BOHAI_ACTION_AUDIT_MAX_ITEMS = 60;

const normalizeText = (value, maxChars = 180) => String(value || '').trim().slice(0, maxChars);

const summarizePayload = (actionId = '', payload = {}) => {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const content = normalizeText(safePayload.content, 160);
  const title = normalizeText(safePayload.title, 80);
  const subject = normalizeText(safePayload.subject, 80);
  const receiverName = normalizeText(safePayload.receiverName || safePayload.receiver || '', 40);

  switch (actionId) {
    case 'createPost':
      return {
        title,
        contentPreview: content,
        contentLength: String(safePayload.content || '').length
      };
    case 'sendMail':
      return {
        receiverName,
        subject,
        contentPreview: content,
        contentLength: String(safePayload.content || '').length
      };
    case 'saveCloud':
    case 'quickNote':
    case 'saveSharedMemory':
      return {
        title,
        contentPreview: content,
        contentLength: String(safePayload.content || '').length
      };
    default:
      return {
        preview: normalizeText(JSON.stringify(safePayload), 220)
      };
  }
};

export const createBohAIActionAuditEntry = ({
  result = {},
  payload = {},
  auth = {}
} = {}) => {
  const actionId = String(result?.actionId || '').trim();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    actionId,
    label: String(result?.label || '').trim(),
    source: String(result?.source || '').trim(),
    ok: Boolean(result?.ok),
    message: normalizeText(result?.message || '', 240),
    errorMessage: normalizeText(result?.errorMessage || '', 240),
    userId: normalizeText(auth?.userId || '', 80),
    username: normalizeText(auth?.username || '', 80),
    createdAt: Date.now(),
    payload: summarizePayload(actionId, payload),
    metadata: result?.metadata && typeof result.metadata === 'object' ? result.metadata : {}
  };
};

export const loadBohAIActionAuditsFromStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_ACTION_AUDIT_STORAGE_KEY
} = {}) => {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, BOHAI_ACTION_AUDIT_MAX_ITEMS) : [];
  } catch (_error) {
    return [];
  }
};

export const saveBohAIActionAuditsToStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_ACTION_AUDIT_STORAGE_KEY,
  audits = []
} = {}) => {
  if (!storage) return false;
  storage.setItem(storageKey, JSON.stringify((Array.isArray(audits) ? audits : []).slice(0, BOHAI_ACTION_AUDIT_MAX_ITEMS)));
  return true;
};

export const appendBohAIActionAudit = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_ACTION_AUDIT_STORAGE_KEY,
  audits = [],
  entry = null
} = {}) => {
  if (!entry) return Array.isArray(audits) ? audits : [];
  const next = [entry, ...(Array.isArray(audits) ? audits : [])].slice(0, BOHAI_ACTION_AUDIT_MAX_ITEMS);
  saveBohAIActionAuditsToStorage({ storage, storageKey, audits: next });
  return next;
};

export const clearBohAIActionAuditsStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_ACTION_AUDIT_STORAGE_KEY
} = {}) => {
  if (!storage) return false;
  storage.removeItem(storageKey);
  return true;
};
