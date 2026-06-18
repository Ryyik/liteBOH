import { ref, reactive, computed, nextTick } from 'vue';
import {
  SESSION_SAVE_DEBOUNCE_MS,
  SESSION_SAVE_IDLE_TIMEOUT_MS,
  MEMORY_CAPTURE_STATUS_TIMEOUT_MS,
  MAX_CONTEXT_MESSAGES,
  MAX_HISTORY_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_FINAL_PROMPT_CHARS,
  MAX_PROMPT_EXTRA_CHARS
} from './chat-engine-config.js';
import {
  loadBohAIChatSessionsFromStorage,
  saveBohAIChatSessionsToStorage,
  clearBohAIChatSessionsStorage,
  createBohAIChatSessionSanitizer
} from '@/utils/bohai-chat-session-store.js';
import {
  loadBohAIActionAuditsFromStorage,
  clearBohAIActionAuditsStorage
} from '@/utils/bohai-action-audit.js';
import {
  buildHistoryMessagesWithCachedSummary,
  getStorableDialogueMessages,
  isEmptyAssistantPlaceholder,
  normalizePromptLine,
  ESTIMATED_SYSTEM_PROMPT_CHARS,
  CONVERSATION_SUMMARY_MAX_CHARS
} from './bohai-engine-helpers.js';
import { logger } from '@/utils/logger.js';

// 使用 ref 让 _lastActualExtraChars 成为响应式，确保 computeContextBudgetUsage 能追踪其变化
const _lastActualExtraChars = ref(2000);
// EMA 平滑系数：新值占 40%，旧值占 60%，防止检索证据有无导致百分比剧烈波动
const _extraCharsEmaAlpha = 0.4;

export const updateLastActualExtraChars = (chars) => {
  if (typeof chars === 'number' && chars > 0) {
    _lastActualExtraChars.value = Math.round(_lastActualExtraChars.value * (1 - _extraCharsEmaAlpha) + chars * _extraCharsEmaAlpha);
  }
};

// ============================================================
// useConversationManager — 会话/对话管理子 composable
// ------------------------------------------------------------
// 从 useChatEngine 中提取出纯会话管理相关的状态与操作，
// 包括会话 CRUD、本地持久化、上下文压缩状态、各种 pending
// 状态（树洞/记忆/云引用/快速笔记/操作草稿）等。
//
// 依赖注入：
//   scrollToBottom  — 用于切换会话后滚动到底部
// ============================================================

export function useConversationManager({
  scrollToBottom: scrollToBottomOption
} = {}) {
  // scrollToBottom 可能是一个函数或 getter（当 composable 创建时 scrollToBottom 尚未定义时使用）
  const resolveScrollToBottom = () => {
    if (typeof scrollToBottomOption === 'function') return scrollToBottomOption();
    return scrollToBottomOption;
  };
  // ============================================================
  // State
  // ============================================================
  const chatSessions = reactive([
    { title: '新对话', messages: [], timestamp: Date.now(), isLoading: false, isThinking: false }
  ]);
  const currentSessionIndex = ref(0);
  const activeGenerationSessionIndex = ref(null);

  const treeholeMemoryCache = reactive({
    userId: '',
    fetchedAt: 0,
    items: []
  });
  const sharedMemoryCache = reactive({
    fetchedAt: 0,
    items: []
  });
  const sharedMemorySearchCache = new Map();

  const actionAuditLog = ref(loadBohAIActionAuditsFromStorage());

  const pendingTreeholeCreation = reactive({
    awaitingConfirmation: false,
    userId: '',
    sessionIndex: -1
  });
  const pendingCloudReferenceConsent = reactive({
    awaitingConfirmation: false,
    userId: '',
    sessionIndex: -1
  });
  const pendingSharedMemoryCapture = reactive({
    awaitingConfirmation: false,
    userId: '',
    sessionIndex: -1,
    content: '',
    destination: 'ask'
  });
  const pendingQuickNote = reactive({
    visible: false,
    busy: false,
    userId: '',
    sessionIndex: -1,
    messageIndex: -1,
    title: '',
    content: '',
    error: ''
  });
  const pendingActionDraft = reactive({
    active: false,
    type: '',
    userId: '',
    sessionIndex: -1,
    awaitingIdea: false,
    postTitle: '',
    postContent: '',
    pageType: '',
    pageDescription: '',
    pageHtml: '',
    mailReceiverId: '',
    mailReceiverName: '',
    mailSubject: '',
    mailContent: ''
  });
  const userPrivateContextCache = reactive({
    userId: '',
    fetchedAt: 0,
    snapshot: null
  });

  const isCompressingContext = ref(false);
  const compressingSessionIndex = ref(-1);

  const memoryCaptureStatusMessage = ref('');
  let memoryCaptureStatusTimer = null;

  let saveDebounceTimer = null;
  let saveIdleTimer = null;
  let saveIdleCallbackId = null;
  let saveCallCounter = 0;

  // ============================================================
  // Reset functions
  // ============================================================
  const resetUserPrivateContextCache = () => {
    userPrivateContextCache.userId = '';
    userPrivateContextCache.fetchedAt = 0;
    userPrivateContextCache.snapshot = null;
  };

  const resetSharedMemorySearchCache = () => {
    sharedMemorySearchCache.clear();
  };

  const resetPendingTreeholeCreation = () => {
    pendingTreeholeCreation.awaitingConfirmation = false;
    pendingTreeholeCreation.userId = '';
    pendingTreeholeCreation.sessionIndex = -1;
  };

  const resetPendingCloudReferenceConsent = () => {
    pendingCloudReferenceConsent.awaitingConfirmation = false;
    pendingCloudReferenceConsent.userId = '';
    pendingCloudReferenceConsent.sessionIndex = -1;
  };

  const resetPendingSharedMemoryCapture = () => {
    pendingSharedMemoryCapture.awaitingConfirmation = false;
    pendingSharedMemoryCapture.userId = '';
    pendingSharedMemoryCapture.sessionIndex = -1;
    pendingSharedMemoryCapture.content = '';
    pendingSharedMemoryCapture.destination = 'ask';
  };

  const resetPendingQuickNote = () => {
    pendingQuickNote.visible = false;
    pendingQuickNote.busy = false;
    pendingQuickNote.userId = '';
    pendingQuickNote.sessionIndex = -1;
    pendingQuickNote.messageIndex = -1;
    pendingQuickNote.title = '';
    pendingQuickNote.content = '';
    pendingQuickNote.error = '';
  };

  const resetPendingActionDraft = () => {
    pendingActionDraft.active = false;
    pendingActionDraft.type = '';
    pendingActionDraft.userId = '';
    pendingActionDraft.sessionIndex = -1;
    pendingActionDraft.awaitingIdea = false;
    pendingActionDraft.postTitle = '';
    pendingActionDraft.postContent = '';
    pendingActionDraft.mailReceiverId = '';
    pendingActionDraft.mailReceiverName = '';
    pendingActionDraft.mailSubject = '';
    pendingActionDraft.mailContent = '';
    pendingActionDraft.pageType = '';
    pendingActionDraft.pageDescription = '';
    pendingActionDraft.pageHtml = '';
  };

  // ============================================================
  // Session sanitizer (for storage)
  // ============================================================
  const sanitizeChatSessionForStorage = createBohAIChatSessionSanitizer({
    normalizeText: (value) => normalizePromptLine(value, CONVERSATION_SUMMARY_MAX_CHARS),
    maxSummaryChars: CONVERSATION_SUMMARY_MAX_CHARS,
    isEmptyAssistantPlaceholder
  });

  // ============================================================
  // Context budget calculation
  // ============================================================
  const computeContextBudgetUsage = (session, { pendingCount = 2 } = {}) => {
    const source = Array.isArray(session?.messages) ? session.messages : [];
    // 根据 pendingCount 排除正在输入/生成的占位消息
    // pendingCount=0 时不能 slice(0, -0)，JS 会把 -0 转成 0 导致 slice(0,0) 永远返回空数组
    const historySource = source.length > pendingCount
      ? pendingCount > 0
        ? source.slice(0, -pendingCount)
        : source.slice()
      : [];
    const recentBuilt = buildHistoryMessagesWithCachedSummary({
      ...(session || {}),
      messages: historySource
    }, {
      maxChars: MAX_HISTORY_CONTEXT_CHARS,
      maxMessages: MAX_CONTEXT_MESSAGES,
      maxPerMessage: MAX_HISTORY_MESSAGE_CHARS
    });

    let historyChars = 0;
    recentBuilt.forEach((item) => {
      historyChars += String(item?.content || '').length + 20;
    });

    // 实际模型上下文 = 系统提示词(~600) + 历史消息 + 结构化用户提示词(含检索证据/规则, 最多 MAX_FINAL_PROMPT_CHARS)
    // 用总预算来反映真实占用，而不是只看历史消息占比
    const estimatedExtraChars = Math.min(
      MAX_PROMPT_EXTRA_CHARS,
      Math.max(_lastActualExtraChars.value, 2000)
    );
    const totalUsedChars = ESTIMATED_SYSTEM_PROMPT_CHARS + historyChars + estimatedExtraChars;
    const totalBudget = ESTIMATED_SYSTEM_PROMPT_CHARS + MAX_HISTORY_CONTEXT_CHARS + MAX_FINAL_PROMPT_CHARS;

    const rawPercent = totalBudget > 0 ? (totalUsedChars / totalBudget) * 100 : 0;
    const percent = Math.max(0, Math.min(100, rawPercent));
    // 显示用：仅历史 + 系统提示词基线，去掉不可控的 estimatedExtraChars，消息增加时百分比真实增长
    const historyBudget = ESTIMATED_SYSTEM_PROMPT_CHARS + MAX_HISTORY_CONTEXT_CHARS;
    const historyPercent = historyBudget > 0 ? ((ESTIMATED_SYSTEM_PROMPT_CHARS + historyChars) / historyBudget) * 100 : 0;
    const includedMessageCount = recentBuilt.length;
    const totalMessageCount = getStorableDialogueMessages(source).length;
    const hasSummary = recentBuilt.some((item) => item?.role === 'system' && /【此前对话摘要】/.test(String(item?.content || '')));

    return {
      used: totalUsedChars,
      max: totalBudget,
      percent,
      historyPercent: Math.max(0, Math.min(100, historyPercent)),
      includedMessageCount,
      totalMessageCount,
      hasSummary,
      // 颜色档位基于 historyPercent；high ≥ 85% 触发自动压缩，full ≥ 100% 时强制压缩
      level: historyPercent >= 100 ? 'full' : historyPercent >= 85 ? 'high' : historyPercent >= 60 ? 'mid' : 'low'
    };
  };

  const contextBudgetUsage = computed(() => computeContextBudgetUsage(chatSessions[currentSessionIndex.value], { pendingCount: 0 }));

  // ============================================================
  // Save / Load sessions from local storage
  // ============================================================
  const loadSessions = () => {
    const migratedSessions = loadBohAIChatSessionsFromStorage({
      sanitizeSession: sanitizeChatSessionForStorage,
      onError: (error) => logger.error('boh-ai', 'Failed to load chat sessions', error)
    });
    if (migratedSessions.length > 0) {
      chatSessions.splice(0, chatSessions.length, ...migratedSessions);
    }
  };

  const saveSessions = () => {
    saveBohAIChatSessionsToStorage({
      sessions: chatSessions,
      sanitizeSession: sanitizeChatSessionForStorage
    });
  };

  const clearSaveTimers = () => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    if (saveIdleTimer) {
      clearTimeout(saveIdleTimer);
      saveIdleTimer = null;
    }
    if (typeof window !== 'undefined' && saveIdleCallbackId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(saveIdleCallbackId);
      saveIdleCallbackId = null;
    }
  };

  const scheduleSaveSessions = () => {
    clearSaveTimers();
    const thisCallId = ++saveCallCounter;
    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;
      if (thisCallId !== saveCallCounter) return; // Superseded by newer call

      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        saveIdleCallbackId = window.requestIdleCallback(() => {
          if (thisCallId !== saveCallCounter) return;
          saveIdleCallbackId = null;
          saveSessions();
        }, { timeout: SESSION_SAVE_IDLE_TIMEOUT_MS });
        return;
      }

      saveIdleTimer = setTimeout(() => {
        if (thisCallId !== saveCallCounter) return;
        saveIdleTimer = null;
        saveSessions();
      }, 0);
    }, SESSION_SAVE_DEBOUNCE_MS);
  };

  // ============================================================
  // Clear cache (nuclear reset)
  // ============================================================
  const clearCache = () => {
    clearSaveTimers();
    if (memoryCaptureStatusTimer) {
      clearTimeout(memoryCaptureStatusTimer);
      memoryCaptureStatusTimer = null;
    }
    memoryCaptureStatusMessage.value = '';
    clearBohAIChatSessionsStorage();
    clearBohAIActionAuditsStorage();
    actionAuditLog.value = [];
    chatSessions.splice(0, chatSessions.length, { title: '新对话', messages: [], timestamp: Date.now(), isLoading: false, isThinking: false });
    currentSessionIndex.value = 0;
    activeGenerationSessionIndex.value = null;
    isCompressingContext.value = false;
    compressingSessionIndex.value = -1;
    localStorage.removeItem('hasSeenAiWelcome_2025_02');
    treeholeMemoryCache.userId = '';
    treeholeMemoryCache.fetchedAt = 0;
    treeholeMemoryCache.items = [];
    sharedMemoryCache.fetchedAt = 0;
    sharedMemoryCache.items = [];
    resetSharedMemorySearchCache();
    resetUserPrivateContextCache();
    resetPendingTreeholeCreation();
    resetPendingCloudReferenceConsent();
    resetPendingSharedMemoryCapture();
    resetPendingQuickNote();
    resetPendingActionDraft();
  };

  // ============================================================
  // Session CRUD
  // ============================================================
  const getSessionByIndex = (index) => {
    if (!Number.isInteger(index)) return null;
    if (index < 0 || index >= chatSessions.length) return null;
    return chatSessions[index];
  };

  const startNewChat = () => {
    chatSessions.unshift({
      title: '新对话',
      messages: [],
      timestamp: Date.now(),
      isLoading: false,
      isThinking: false
    });
    currentSessionIndex.value = 0;
  };

  const deleteSession = (index) => {
    if (activeGenerationSessionIndex.value === index) {
      return;
    }

    if (chatSessions.length === 1) {
      chatSessions[0] = { title: '新对话', messages: [], timestamp: Date.now(), isLoading: false, isThinking: false };
      return;
    }
    chatSessions.splice(index, 1);

    if (activeGenerationSessionIndex.value !== null && activeGenerationSessionIndex.value > index) {
      activeGenerationSessionIndex.value -= 1;
    }

    if (currentSessionIndex.value >= chatSessions.length) {
      currentSessionIndex.value = chatSessions.length - 1;
    }
  };

  const switchSession = (index) => {
    currentSessionIndex.value = index;
    nextTick(() => {
      const fn = resolveScrollToBottom();
      if (typeof fn === 'function') fn(true);
    });
  };

  // ============================================================
  // Memory capture status message
  // ============================================================
  const setMemoryCaptureStatusMessage = (text) => {
    memoryCaptureStatusMessage.value = String(text || '').trim();
    if (memoryCaptureStatusTimer) {
      clearTimeout(memoryCaptureStatusTimer);
      memoryCaptureStatusTimer = null;
    }
    if (memoryCaptureStatusMessage.value) {
      memoryCaptureStatusTimer = setTimeout(() => {
        memoryCaptureStatusMessage.value = '';
        memoryCaptureStatusTimer = null;
      }, MEMORY_CAPTURE_STATUS_TIMEOUT_MS);
    }
  };

  // ============================================================
  // Active action draft computed
  // ============================================================
  const activeActionDraft = computed(() => {
    if (!pendingActionDraft.active) return null;
    if (pendingActionDraft.sessionIndex !== currentSessionIndex.value) return null;
    return {
      active: true,
      type: pendingActionDraft.type,
      sessionIndex: pendingActionDraft.sessionIndex,
      postTitle: pendingActionDraft.postTitle,
      postContent: pendingActionDraft.postContent,
      mailReceiverId: pendingActionDraft.mailReceiverId,
      mailReceiverName: pendingActionDraft.mailReceiverName,
      mailSubject: pendingActionDraft.mailSubject,
      mailContent: pendingActionDraft.mailContent,
      pageType: pendingActionDraft.pageType,
      pageDescription: pendingActionDraft.pageDescription,
      pageHtml: pendingActionDraft.pageHtml
    };
  });

  // ============================================================
  // Return
  // ============================================================
  return {
    // State
    chatSessions, currentSessionIndex, activeGenerationSessionIndex,
    treeholeMemoryCache, sharedMemoryCache, sharedMemorySearchCache,
    actionAuditLog,
    pendingTreeholeCreation, pendingCloudReferenceConsent,
    pendingSharedMemoryCapture, pendingQuickNote, pendingActionDraft,
    userPrivateContextCache,
    isCompressingContext, compressingSessionIndex,
    contextBudgetUsage,
    memoryCaptureStatusMessage,
    activeActionDraft,
    // Functions
    isEmptyAssistantPlaceholder,
    resetUserPrivateContextCache, resetSharedMemorySearchCache,
    resetPendingTreeholeCreation, resetPendingCloudReferenceConsent,
    resetPendingSharedMemoryCapture, resetPendingQuickNote, resetPendingActionDraft,
    sanitizeChatSessionForStorage,
    computeContextBudgetUsage,
    loadSessions, saveSessions, scheduleSaveSessions, clearSaveTimers,
    clearCache,
    getSessionByIndex,
    startNewChat, deleteSession, switchSession,
    setMemoryCaptureStatusMessage
  };
}