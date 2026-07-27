export const BOHAI_CHAT_SESSIONS_STORAGE_KEY = 'boh_chat_sessions';
export const BOHAI_CHAT_SESSIONS_MAX_ITEMS = 20;

const defaultNormalizeText = (value) => String(value || '');

export const createBohAIChatSessionSanitizer = ({
  normalizeText = defaultNormalizeText,
  maxSummaryChars = 900,
  isEmptyAssistantPlaceholder = () => false
} = {}) => {
  return (session = {}) => {
    const rawMessages = Array.isArray(session.messages) ? session.messages : [];
    const messages = rawMessages
      .filter((message) => !isEmptyAssistantPlaceholder(message))
      .map((message) => ({
        ...message,
        content: typeof message.content === 'string'
          ? message.content
          : String(message.content || '')
      }));

    return {
      title: String(session.title || '新对话'),
      pinned: Boolean(session.pinned),
      messages,
      timestamp: Number.isFinite(Number(session.timestamp)) ? Number(session.timestamp) : Date.now(),
      contextSummary: session.contextSummary && typeof session.contextSummary === 'object'
        ? {
            version: Number(session.contextSummary.version || 0),
            fingerprint: String(session.contextSummary.fingerprint || ''),
            content: normalizeText(session.contextSummary.content).slice(0, maxSummaryChars),
            coveredMessageCount: Math.max(0, Math.trunc(Number(session.contextSummary.coveredMessageCount) || 0)),
            sourceMessageCount: Math.max(0, Math.trunc(Number(session.contextSummary.sourceMessageCount) || 0)),
            retainedHistoryChars: Math.max(0, Math.trunc(Number(session.contextSummary.retainedHistoryChars) || 0)),
            updatedAt: Number(session.contextSummary.updatedAt || 0)
          }
        : null,
      isLoading: false,
      isThinking: false
    };
  };
};

export const loadBohAIChatSessionsFromStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_CHAT_SESSIONS_STORAGE_KEY,
  sanitizeSession = (session) => session,
  onError = null
} = {}) => {
  if (!storage) return [];
  const savedSessions = storage.getItem(storageKey);
  if (!savedSessions) return [];

  try {
    const parsed = JSON.parse(savedSessions);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    return parsed.slice(0, BOHAI_CHAT_SESSIONS_MAX_ITEMS).map(sanitizeSession);
  } catch (error) {
    if (typeof onError === 'function') onError(error);
    try {
      storage.setItem(`${storageKey}_corrupted_backup`, savedSessions);
    } catch { /* 备份空间不足时静默跳过 */ }
    return [];
  }
};

export const saveBohAIChatSessionsToStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_CHAT_SESSIONS_STORAGE_KEY,
  sessions = [],
  sanitizeSession = (session) => session,
  onError = null
} = {}) => {
  if (!storage) return false;
  const sessionsToSave = Array.isArray(sessions)
    ? sessions.filter((session) => !session?.temporary).slice(0, BOHAI_CHAT_SESSIONS_MAX_ITEMS).map(sanitizeSession)
    : [];

  const saveData = (data) => {
    try {
      storage.setItem(storageKey, JSON.stringify(data));
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') return false;
      throw error;
    }
  };

  if (saveData(sessionsToSave)) return true;

  const reduced = sessionsToSave.slice(0, 5);
  if (reduced.length > 0 && saveData(reduced)) {
    if (typeof onError === 'function') {
      onError(new Error('存储空间不足，已自动保留最近5条会话。'));
    }
    return true;
  }

  const minimal = sessionsToSave.slice(0, 1);
  if (minimal.length > 0) {
    try {
      storage.removeItem(storageKey);
      storage.setItem(storageKey, JSON.stringify(minimal));
      if (typeof onError === 'function') {
        onError(new Error('存储空间严重不足，已仅保留当前会话。'));
      }
      return true;
    } catch {
      if (typeof onError === 'function') {
        onError(new Error('无法保存会话数据，请清理浏览器存储空间。'));
      }
      return false;
    }
  }

  return false;
};

export const clearBohAIChatSessionsStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_CHAT_SESSIONS_STORAGE_KEY
} = {}) => {
  if (!storage) return false;
  storage.removeItem(storageKey);
  return true;
};
