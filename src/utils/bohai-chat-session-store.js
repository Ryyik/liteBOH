export const BOHAI_CHAT_SESSIONS_STORAGE_KEY = 'boh_chat_sessions';
export const BOHAI_CHAT_SESSIONS_MAX_ITEMS = 20;

const defaultNormalizeText = (value) => String(value || '');

/** 守门统计的存储上限：只防 localStorage 膨胀，不参与业务截断 */
const MAX_GUARD_STAT_TYPES = 12;

/**
 * 归一化守门统计。没有就返回 null（不写入字段），避免给非访谈会话塞空对象。
 * 上一版只写了 lastViolations 却没登记白名单，保存时被静默丢弃 —— 这里一并补上。
 */
const sanitizeGuardStats = (value) => {
  if (!value || typeof value !== 'object') return null;
  const byTypeSource = value.byType && typeof value.byType === 'object' ? value.byType : {};
  const byType = {};
  Object.keys(byTypeSource)
    .slice(0, MAX_GUARD_STAT_TYPES)
    .forEach((key) => {
      const count = Math.max(0, Math.trunc(Number(byTypeSource[key]) || 0));
      if (count > 0) byType[String(key).slice(0, 32)] = count;
    });
  return {
    checked: Math.max(0, Math.trunc(Number(value.checked) || 0)),
    triggered: Math.max(0, Math.trunc(Number(value.triggered) || 0)),
    adopted: Math.max(0, Math.trunc(Number(value.adopted) || 0)),
    byType,
  };
};

export const createBohAIChatSessionSanitizer = ({
  normalizeText = defaultNormalizeText,
  maxSummaryChars = 900,
  // 推理内容比正文更容易很长，且随每条消息一起进 localStorage（上限 20 个会话）⇒ 显式截断
  maxReasoningChars = 4000,
  isEmptyAssistantPlaceholder = () => false,
} = {}) => {
  return (session = {}) => {
    const rawMessages = Array.isArray(session.messages) ? session.messages : [];
    const messages = rawMessages
      .filter((message) => !isEmptyAssistantPlaceholder(message))
      .map((message) => {
        const normalized = {
          ...message,
          content:
            typeof message.content === 'string' ? message.content : String(message.content || ''),
        };
        // 2026-10-10「推理过程可展开」：`reasoning` 与 `content` 并列存在消息上。
        // 空值**不写字段**（不给历史消息塞空串）；有值才截断后落盘。
        const reasoning = normalizeText(message.reasoning || '').slice(0, maxReasoningChars);
        if (reasoning) normalized.reasoning = reasoning;
        else delete normalized.reasoning;
        return normalized;
      });

    return {
      title: String(session.title || '新对话'),
      pinned: Boolean(session.pinned),
      messages,
      timestamp: Number.isFinite(Number(session.timestamp))
        ? Number(session.timestamp)
        : Date.now(),
      contextSummary:
        session.contextSummary && typeof session.contextSummary === 'object'
          ? {
              version: Number(session.contextSummary.version || 0),
              fingerprint: String(session.contextSummary.fingerprint || ''),
              content: normalizeText(session.contextSummary.content).slice(0, maxSummaryChars),
              coveredMessageCount: Math.max(
                0,
                Math.trunc(Number(session.contextSummary.coveredMessageCount) || 0),
              ),
              sourceMessageCount: Math.max(
                0,
                Math.trunc(Number(session.contextSummary.sourceMessageCount) || 0),
              ),
              retainedHistoryChars: Math.max(
                0,
                Math.trunc(Number(session.contextSummary.retainedHistoryChars) || 0),
              ),
              updatedAt: Number(session.contextSummary.updatedAt || 0),
            }
          : null,
      // 心理访谈状态：会话级字段是显式白名单，不加进来会在保存时被静默丢弃
      // （表现为刷新后访谈从头开始，且不报任何错）。
      // 这里的 12 是「存储安全上限」，比 interview-engine.js 的 INTERVIEW_LIMITS.evidenceMax(8) 宽松，
      // 目的是防 localStorage 膨胀，不参与业务截断 —— 两者不是同一条规则。
      expertState:
        session.expertState && typeof session.expertState === 'object'
          ? {
              roleId: String(session.expertState.roleId || ''),
              trackId: String(session.expertState.trackId || ''),
              phase: String(session.expertState.phase || ''),
              birthDateSource: String(session.expertState.birthDateSource || ''),
              askedCount: Math.max(0, Math.trunc(Number(session.expertState.askedCount) || 0)),
              ladderingDepth: Math.max(
                0,
                Math.trunc(Number(session.expertState.ladderingDepth) || 0),
              ),
              lastSummaryAt: Math.max(
                0,
                Math.trunc(Number(session.expertState.lastSummaryAt) || 0),
              ),
              shortReplyStreak: Math.max(
                0,
                Math.trunc(Number(session.expertState.shortReplyStreak) || 0),
              ),
              signals: Array.isArray(session.expertState.signals)
                ? session.expertState.signals
                    .map((item) => String(item || ''))
                    .filter(Boolean)
                    .slice(0, 24)
                : [],
              evidence: Array.isArray(session.expertState.evidence)
                ? session.expertState.evidence
                    .map((item) => normalizeText(item || ''))
                    .filter(Boolean)
                    .slice(0, 12)
                : [],
              lastUserText: normalizeText(session.expertState.lastUserText || '').slice(0, 200),
              // 守门留痕：必须登记进白名单，否则保存时被静默丢弃（见 useChatEngine 守门段注释）
              lastViolations: normalizeText(session.expertState.lastViolations || '').slice(0, 120),
              guardStats: sanitizeGuardStats(session.expertState.guardStats),
              startedAt: Number(session.expertState.startedAt || 0),
              finishedAt: Number(session.expertState.finishedAt || 0),
            }
          : null,
      isLoading: false,
      isThinking: false,
    };
  };
};

export const loadBohAIChatSessionsFromStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_CHAT_SESSIONS_STORAGE_KEY,
  sanitizeSession = (session) => session,
  onError = null,
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
    } catch {
      /* 备份空间不足时静默跳过 */
    }
    return [];
  }
};

export const saveBohAIChatSessionsToStorage = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_CHAT_SESSIONS_STORAGE_KEY,
  sessions = [],
  sanitizeSession = (session) => session,
  onError = null,
} = {}) => {
  if (!storage) return false;
  const sessionsToSave = Array.isArray(sessions)
    ? sessions
        .filter((session) => !session?.temporary)
        .slice(0, BOHAI_CHAT_SESSIONS_MAX_ITEMS)
        .map(sanitizeSession)
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
  storageKey = BOHAI_CHAT_SESSIONS_STORAGE_KEY,
} = {}) => {
  if (!storage) return false;
  storage.removeItem(storageKey);
  return true;
};

/**
 * 会话存储的**写入所有权**守卫（2026-10-11 加 keepAlive 后必须防的一条）。
 *
 * 背景：`/ai-chat` 进了 `<KeepAlive>`，切页只是 **deactivated**（组件还活着，流继续跑）；
 * 而灵动岛（`UnifiedNavbar/BOHAIIsland.vue`）会**另起一个** BOHAIMain —— 于是同一时刻
 * 可能有**两个引擎**往同一个 localStorage 键写。谁后写谁覆盖：岛里新发的消息会被
 * 页面实例的旧快照抹掉，且**没有任何报错**（症状是「换页回来消息少了一条」）。
 *
 * 判据用「上次同步时读到的原文」而不是版本号/时间戳：
 *   · 写入前比对一次存储原文 —— 不一致 ⇒ **别人写过了**，本次写入必须放弃；
 *   · 不引入第二个键当版本号（那会变成第二份真源，还得维护它的清理）；
 *   · 放弃写入后由调用方择机 `adopt()` 重新载入（**绝不能流式中换** ——
 *     会把正在生成的那条消息冲掉，见 `useChatEngine.syncSessionsIfStale`）。
 *
 * @returns {{ adopt: () => string|null, canWrite: () => boolean, commit: () => string|null }}
 */
export const createBohAISessionWriteGuard = ({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  storageKey = BOHAI_CHAT_SESSIONS_STORAGE_KEY,
} = {}) => {
  /** 我们认可为「与自己一致」的存储原文；null = 还没同步过（首屏） */
  let adoptedRaw = null;

  const readRaw = () => {
    if (!storage) return null;
    try {
      return storage.getItem(storageKey);
    } catch {
      /* 隐私模式 / 存储被禁用：读不到就当「没有别人写过」，与旧行为一致 */
      return null;
    }
  };

  return {
    /** 载入（或重新载入）会话之后调用：把此刻的存储内容认作与自己一致 */
    adopt: () => {
      adoptedRaw = readRaw();
      return adoptedRaw;
    },
    /** 写入前调用。false = 存储已被别的实例改过，本次写入必须放弃 */
    canWrite: () => readRaw() === adoptedRaw,
    /** 自己写完之后调用 */
    commit: () => {
      adoptedRaw = readRaw();
      return adoptedRaw;
    },
  };
};
