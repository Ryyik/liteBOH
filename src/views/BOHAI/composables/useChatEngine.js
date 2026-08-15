import { ref, computed, nextTick, watch, shallowRef, onScopeDispose } from 'vue';
import { storeToRefs } from 'pinia';
import { getPosts, getUserPosts } from '@/utils/api/forum-api.js';
import {
  createMyTreeholeSpace,
  getSharedAIMemoriesForAI,
  searchSharedAIMemoriesForAI,
  searchBohAIKnowledgeForAI,
  createSharedAIMemory,
  createTreeholeMemory,
  captureTreeholeMemoriesFromDialogue
} from '@/utils/api/treehole-api.js';
import { getMyCloudEntriesForAI } from '@/utils/api/boh-cloud-api.js';
import { callVaultSiliconChat, callVaultSiliconChatStream } from '@/utils/api/api-key-runtime-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import {
  buildBohaiRuntimeModels,
  listActiveBohaiModelConfigs
} from '@/utils/api/bohai-model-config-api.js';
import {
  isLikelyBohInternalFactualQuestion,
  isLikelyFactualQuestion,
  extractCitationIdsFromText,
  sanitizeUnsupportedCommunityEvidenceClaims,
  resolveKnowledgeRoutingPlanCore
} from '@/utils/ai-chat-grounding.js';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/utils/supabase-client.js';
import {
  normalizeActionDecisionText,
  isPostDraftRequest
} from '@/utils/bohai-action-draft-intent.js';
import { isLikelyPersonalSupportRequest } from '@/views/BOHAI/engine/bohai-auto-router.js';
import { resolveAutoModeDecisionLocally } from '@/views/BOHAI/engine/bohai-auto-decision.js';
import {
  BOHAI_ACTION_IDS,
  BOHAI_CONNECTOR_IDS,
  createBohAIConnector,
  runBohAIReadConnectors,
  summarizeBohAIConnectorResults
} from '@/utils/bohai-connectors.js';

import { createBohAIRetrievalTrace } from '@/utils/bohai-observability.js';
import { useActionDraft } from './useActionDraft.js';
import { useMemoryCapture } from './useMemoryCapture.js';
import { useThinkingTimer } from './useThinkingTimer.js';
import { useWebSearchLifecycle } from './useWebSearchLifecycle.js';
import { useRateLimiter } from './useRateLimiter.js';
import { useContextCompression } from './useContextCompression.js';
import { useResourceSearch } from './useResourceSearch.js';
import {
  isCommunityQuestion,
  isCommunityCreativeRequest,
  shouldUseMemoryContext,
  summarizeThinkingSubject
} from './useIntentDetection.js';
import { SITE_OPERATION_MEMORY } from '@/data/ai-site-guide.js';
import { logger } from '@/utils/logger.js';
import { isAbortError, CHAT_ERROR_MESSAGES, getAbortMessage, safeErrorDetail } from '../utils/chatErrorMessages.js';
import {
  BASE_SYSTEM_PROMPT,
  CONTEXT_PLACEHOLDER,
  CLOUD_REFERENCE_CONSENT_KEY,
  FORUM_MAX_CHARS_PER_POST,
  FORUM_MAX_POSTS,
  GIFT_STATUS_LABELS,
  KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS,
  KNOWLEDGE_CONTEXT_MAX_CHARS,
  MAX_CONTEXT_MESSAGES,
  MAX_FINAL_PROMPT_CHARS,
  MAX_HISTORY_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_MESSAGES_TOTAL_TOKENS,
  MAX_PROMPT_EXTRA_CHARS,
  MAX_USER_INPUT_CHARS,
  MEMORY_CAPTURE_CONTEXT_ITEMS,
  MEMORY_CAPTURE_MIN_DIALOGUE_ITEMS,
  MEMORY_CAPTURE_MIN_USER_CHARS,
  MEMORY_MAX_CHUNKS,
  MEMORY_NOTICE_MAX_ITEMS,
  OPERATION_MAX_STEPS,
  PLAN_MODE_PROMPT_APPENDIX,
  ROUTING_FORUM_REALTIME_PATTERN,
  ROUTING_HISTORY_FACT_PATTERN,
  SHARED_MEMORY_CACHE_TTL_MS,
  SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS,
  SHARED_MEMORY_CONTEXT_MAX_ITEMS,
  SHARED_MEMORY_LIMIT,
  SHARED_MEMORY_SEARCH_CACHE_MAX,
  SHARED_MEMORY_SEARCH_FETCH_LIMIT,
  SHARED_MEMORY_TRIGGER_KEYWORDS,
  SHOW_INTERNAL_PROGRESS_NOTES,
  SITE_GUIDE_MAX_CHUNKS,
  THINKING_SPEED_DELTAS_BY_ID,
  SUBSCRIPTION_STATUS_LABELS,
  TREEHOLE_CONTEXT_MAX_ITEM_CHARS,
  TREEHOLE_CONTEXT_MAX_ITEMS,
  TREEHOLE_MEMORY_CACHE_TTL_MS,
  TREEHOLE_MEMORY_LIMIT,
  USER_PRIVATE_ALL_KEYWORDS,
  USER_PRIVATE_BIRTHDAY_KEYWORDS,
  USER_PRIVATE_CONTEXT_CACHE_TTL_MS,
  USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS,
  USER_PRIVATE_CONTEXT_MAX_ITEMS,
  USER_PRIVATE_GIFT_KEYWORDS,
  USER_PRIVATE_GIFTS_FETCH_LIMIT,
  USER_PRIVATE_PERSONAL_PATTERN,
  USER_PRIVATE_POST_KEYWORDS,
  USER_PRIVATE_POSTS_FETCH_LIMIT,
  BOH_DEFAULT_MODE_ID,
  USER_PRIVATE_PUSHPLUS_KEYWORDS,
  USER_PRIVATE_SUBSCRIPTION_KEYWORDS,
  USER_PRIVATE_SUMMARY_KEYWORDS
} from './chat-engine-config.js';
import { useConversationManager, updateLastActualExtraChars } from './useConversationManager.js';
import { useGenerationPipeline } from './useGenerationPipeline.js';
import { useModelConfig } from './useModelConfig.js';
import { useMessageManager } from './useMessageManager.js';
import { useKnowledgeRetrieval } from './useKnowledgeRetrieval.js';
import {
  CONVERSATION_SUMMARY_RECENT_MESSAGES,
  CONVERSATION_SUMMARY_MIN_MESSAGES,
  CONVERSATION_SUMMARY_MAX_CHARS,
  CONVERSATION_SUMMARY_TWO_LEVEL_THRESHOLD,
  CONVERSATION_SUMMARY_STORAGE_VERSION,
  GENERATION_STALL_TIMEOUT_MS,
  getAIMemory,
  normalizeText,
  extractQueryKeywords,
  scoreChunk,
  selectRelevantChunks,
  trimKnowledgeChunk,
  truncateText,
  isLikelyMemoryDuplicate,
  extractExplicitMemoryContent,
  appendPromptSection,
  normalizePromptLine,
  buildContextualFollowUpQuery,
  buildContextualWebSearchQuery,
  isContextDependentFollowUp,
  getStorableDialogueMessages,
  buildConversationSummaryFingerprint,
  buildHistoryMessagesWithCachedSummary,
  getCachedSummaryIfUsable,
  buildSearchResultsContext,
  rankEvidenceContextBlocks,
  buildSharedEvidenceContext,
  buildSystemEvidenceContext,
  trimMessagesToBudget,
  estimateTokens,
  estimateMessagesTokens,
  TOKEN_ESTIMATE_ROLE_OVERHEAD,
  buildStructuredUserPrompt,
  containsAnyKeyword,
  isMissingRelationError,
  parsePostTitleAndBody,
  getPostTitleAndBody,
  formatPromptDate,
  formatPromptDateTime,
  getBirthdayCountdown,
  formatBillingCycleLabel,
  searchWebForPrompt,
  isOperationQuestion,
  shouldUseSiteGuide,
  extractSingleLineField,
  extractMultilineField,
  extractFieldUntilNextLabel,
  compressKnowledgeContextBlocks,
  getGenerationProfile as getDefaultGenerationProfile,
  cleanAssistantVisibleReply,
  isDegenerateAssistantReply,
  isDegenerateStreamOutput,
  createContextBudgetTracker,
  extractStructuredMemories,
  buildStructuredMemoryBlock,
  compactMessages,
  buildAgentContext,
  buildPageContextBlock,
  MAX_PAGE_CONTEXT_CHARS,
  CONTEXT_CATEGORIES
} from './bohai-engine-helpers.js';
import {
  runAgentClusterBranch,
  isAgentClusterMode,
  useAgentClusterState
} from './agent-cluster-helpers.js';

const dispatchUserSpaceIslandMessage = (payload = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('boh_userspace_nav_island', { detail: payload }));
};

// ============================================================
// BOH AI Chat Engine 主 composable
// ------------------------------------------------------------
// 单一 useChatEngine 函数体很长（6825 行）。闭包依赖较多，完整
// 拆分需在外部补全上下文。建议后续按以下分区逐步抽出子 composable：
//   SECTION A (~L220-)    state / reactive（chatSessions、treehole cache 等）
//   SECTION B (~L340-)    session 持久化（load/migrate/save）
//   SECTION C (~L470-)    mode / style / settings 选择
//   SECTION D (~L560-)    session CRUD（addMessage、editMessage、delete 等）
//   SECTION E (~L640-)    Quick Note 草稿与保存
//   SECTION F (~L700-)    路由：发件人查找、用户私域获取
//   SECTION G (~L840-)    Action 草稿解析（post / mail / page）
//   SECTION H (~L1050-)   Action 注册与执行
//   SECTION I (~L1200-)   答案生成主流程（retrieval、grounding、stream）
//   SECTION J (~L5500-)   工具函数（citation 抽取、降级处理、moderation）
//   SECTION K (~L6500-)   暴露给模板的接口
// 计划在下一次重构里把每个 SECTION 抽到独立 composable / 纯函数模块，
// useChatEngine 仅做编排。本文件先保留分节注释，行为不变。
// ============================================================


export function useChatEngine() {
  const authStore = useAuthStore();
  const { isLoggedIn, userInfo } = storeToRefs(authStore);

  const { state: agentClusterState, reset: resetAgentClusterState, apply: applyAgentClusterEvent } = useAgentClusterState();
  const {
    webSearchActive,
    runWebSearch,
    resetWebSearchLifecycle
  } = useWebSearchLifecycle({ search: searchWebForPrompt });
  const communitySearchActive = ref(false);

  // scrollToBottom getter — 允许 useConversationManager 在 scrollToBottom
  // 定义完成后按需引用，而不要求 composable 在创建时就拿到函数引用。
  let _scrollToBottom = null;
  const _getScrollToBottom = () => _scrollToBottom;
  const safeScrollToBottom = (force = false) => {
    if (typeof _scrollToBottom === 'function') {
      _scrollToBottom(force);
    }
  };

  const {
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
    resetUserPrivateContextCache, resetSharedMemorySearchCache,
    resetPendingTreeholeCreation, resetPendingCloudReferenceConsent,
    resetPendingSharedMemoryCapture, resetPendingQuickNote, resetPendingActionDraft,
    computeContextBudgetUsage,
    loadSessions, scheduleSaveSessions,
    clearCache,
    getSessionByIndex,
    startNewChat: _startNewChat, clearCurrentSession, clearAllSessions, deleteSession, switchSession,
    setMemoryCaptureStatusMessage
  } = useConversationManager({
    scrollToBottom: _getScrollToBottom
  });

  const isStreamingGeneration = ref(false);
  const attachedContext = ref(null);
  const setAttachedContext = (ctx) => { attachedContext.value = ctx; };
  const clearAttachedContext = () => { attachedContext.value = null; };

  // chatSessions 为 reactive，直接 watch 会被 Vue 强制 deep 遍历（含每条消息内容），
  // 流式 token 追加也会触发全量遍历。改用轻量 getter 仅跟踪会话数与各会话消息数，
  // 内容编辑（如流式 token）不改变 length，不再触发遍历。
  watch(() => chatSessions.map((s) => s?.messages?.length || 0), () => {
    if (isStreamingGeneration.value) return;
    scheduleSaveSessions();
  });

  watch(() => chatSessions.map((s) => `${s?.title || ''}:${s?.pinned ? 1 : 0}:${s?.temporary ? 1 : 0}`), () => {
    if (isStreamingGeneration.value) return;
    scheduleSaveSessions();
  });

  watch(() => userInfo.value?.id || '', (nextId, prevId) => {
    if (nextId === prevId) return;
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
    if (!nextId && isQuickNoteEnabled.value) {
      isQuickNoteEnabled.value = false;
      persistQuickNoteSetting();
    }
  });

  loadSessions();

  // 局部状态（不属于子 composable 的纯引擎内部状态）
  const abortController = ref(null);
  const runtimeAvailableModels = ref([]);
  const runtimeChatModes = ref([]);
  const runtimeGenerationProfiles = ref({});

  const {
    thinkingTime, thinkingStatus, thinkingTimer,
    startThinkingTimer, stopThinkingTimer,
    setThinkingStatus, clearThinkingStatus
  } = useThinkingTimer();

  const getGenerationProfile = (modeId, options = {}) => ({
    ...getDefaultGenerationProfile(modeId, options),
    ...(runtimeGenerationProfiles.value?.[modeId] || {})
  });

  

  // --------------------------------------------------------------
  // useModelConfig — 模式/样式/设置（必须先初始化，因为 currentModeId 被后续模块依赖）
  // --------------------------------------------------------------
  const {
    currentModeId, currentMode, currentModelId, currentModel,
    lastRoutedMode,
    isCommandMode, isSearching, isForumSearchEnabled,
    isMemoryCaptureEnabled, isTreeholeMemoryEnabled, isTreeholeMemoryToggling,
    isQuickNoteEnabled, isPlanModeEnabled,
    isSharedMemoryEnabled, isKnowledgeBaseEnabled,
    currentResponseStyleId, currentResponseStyle,
    responseStyleOptions,
    currentThinkingSpeedId, currentThinkingSpeed,
    thinkingSpeedOptions,
    cloudReferenceConsent,
    webSearchDisabledNoticeShownFor,
    getModelForModeId,
    togglePlanMode, setResponseStyle, setThinkingSpeed,
    persistModeSetting,
    persistMemoryCaptureSetting,
    persistTreeholeMemorySetting, persistQuickNoteSetting,
    persistSharedMemorySetting, persistKnowledgeBaseSetting
  } = useModelConfig({ availableModels: runtimeAvailableModels, chatModes: runtimeChatModes });

  const applyRuntimeModelConfig = (payload = {}) => {
    if (Array.isArray(payload.availableModels) && payload.availableModels.length > 0) {
      runtimeAvailableModels.value.splice(0, runtimeAvailableModels.value.length, ...payload.availableModels);
    }
    if (Array.isArray(payload.chatModes) && payload.chatModes.length > 0) {
      runtimeChatModes.value.splice(0, runtimeChatModes.value.length, ...payload.chatModes);
      if (!runtimeChatModes.value.some((mode) => mode.id === currentModeId.value)) {
        currentModeId.value = runtimeChatModes.value[0]?.id || BOH_DEFAULT_MODE_ID;
      }
    }
    runtimeGenerationProfiles.value = payload.generationProfiles || {};
  };

  

  // --------------------------------------------------------------
  // AI 生成管线（从 useGenerationPipeline 导入）
  // --------------------------------------------------------------
  const {
    callModelInternal,
    callModelStream,
    _getSmartContext,
    createThinkingState,
    filterThinkingContent,
    filterThinkingContentStream,
    flushThinkingBuffer,
    resetThinkingState,
    createSseLineParser,
    getFallbackModel,
    safeChunkToString
  } = useGenerationPipeline({ availableModels: runtimeAvailableModels.value, abortController, currentModeId });
  // --------------------------------------------------------------

  // 计算属性：当前会话的加载状态
  const isLoading = computed(() => chatSessions[currentSessionIndex.value]?.isLoading || false);
  const isThinking = computed(() => chatSessions[currentSessionIndex.value]?.isThinking || false);

  const loadRuntimeModelConfig = async () => {
    try {
      const result = await listActiveBohaiModelConfigs();
      if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
        if (result.error) {
          logger.warn('boh-ai', 'BOHAI 模型配置读取失败，使用默认配置', result.error);
        }
        return;
      }
      applyRuntimeModelConfig(buildBohaiRuntimeModels(result.data));
    } catch (error) {
      logger.error('boh-ai', 'BOHAI 模型配置加载异常', error);
    }
  };
  void loadRuntimeModelConfig();
  // --------------------------------------------------------------

  // --------------------------------------------------------------
  // useKnowledgeRetrieval — 知识路由与上下文构建
  // --------------------------------------------------------------
  const {
    buildKnowledgeContextBlock,
    getVectorKnowledgeChunks,
    buildVectorKnowledgeContext,
    getMemoryContext,
    getSharedMemoriesCached,
    selectSharedMemoriesByQuery,
    getSharedMemoriesByQuery,
    getSharedMemoryContext,
    getSiteGuideContext,
    shouldUseTreeholeContext,
    getTreeholeMemoriesCached,
    selectTreeholeMemoriesByQuery,
    getTreeholeContext,
    rankForumPostsByQuery,
    getForumTagFilterFromQuery,
    getForumSortModeFromQuery,
    isLatestForumSummaryQuery,
    sortForumPostsByCreatedAtDesc,
    normalizeForumSummaryText,
    buildForumPostNaturalSummary,
    buildExtractiveForumSummaryAnswer,
    buildForumNarrativeSummaryPrompt,
    removeForumSummaryLinks,
    getForumSummarySourceText,
    detectForumSummaryPolarityConflicts,
    buildForumSearchQueries,
    mergeForumPosts,
    getForumContext,
    getUserPrivateSnapshotCached,
    getUserPrivateContext,
    resolveKnowledgeRoutingPlan,
    getRetrievalTargetLabels,
    createReadConnectors,
    buildAutoKnowledgeContext
  } = useKnowledgeRetrieval({
    isLoggedIn,
    userInfo,
    isTreeholeMemoryEnabled,
    isForumSearchEnabled,
    isSharedMemoryEnabled,
    isKnowledgeBaseEnabled,
    treeholeMemoryCache,
    sharedMemoryCache,
    sharedMemorySearchCache,
    userPrivateContextCache,
    resetUserPrivateContextCache,
    getPosts,
    getUserPosts,
    getMySubscriptions,
    getSharedAIMemoriesForAI,
    searchSharedAIMemoriesForAI,
    searchBohAIKnowledgeForAI,
    getMyCloudEntriesForAI,
    supabase
  });
  // --------------------------------------------------------------

  // --------------------------------------------------------------
  // useMessageManager — 消息 CRUD / 随手记 / 操作草稿 UI
  // --------------------------------------------------------------
  const {
    inputMessage,
    textareaRef,
    appendSessionMessage,
    mergeAssistantMessageMeta,
    updateAssistantActionNotes,
    appendUserMessageWithTitle,
    resetComposerInput,
    extractQuickNoteContent,
    buildQuickNoteTitle,
    queueQuickNoteConfirmation,
    cancelPendingActionDraftFromUI,
    confirmPendingActionDraftFromUI,
    updatePendingPostDraftFromUI
  } = useMessageManager({
    getSessionByIndex,
    callModelInternal,
    currentModel,
    availableModels: runtimeAvailableModels.value,
    isLoggedIn,
    userInfo,
    isQuickNoteEnabled,
    scrollToBottom: safeScrollToBottom,
    currentSessionIndex,
    submitPostDraft: (...args) => submitPostDraft(...args),
    logger,
    pendingQuickNote,
    resetPendingQuickNote,
    pendingActionDraft,
    resetPendingActionDraft,
    activeActionDraft
  });
  // --------------------------------------------------------------
  // useActionDraft — Action 草稿解析、注册与执行
  // --------------------------------------------------------------
  const actionDraft = useActionDraft({
    chatSessions,
    currentSessionIndex,
    pendingActionDraft,
    actionAuditLog,
    treeholeMemoryCache,
    sharedMemoryCache,
    resetSharedMemorySearchCache,
    appendSessionMessage,
    appendUserMessageWithTitle,
    resetComposerInput,
    resetPendingActionDraft,
    scrollToBottom: safeScrollToBottom,
    getSessionByIndex,
    isLoggedIn,
    userInfo,
    abortController,
    activeGenerationSessionIndex,
    startThinkingTimer,
    stopThinkingTimer,
    setThinkingStatus,
    clearThinkingStatus,
    getGenerationProfile,
    getModelForModeId,
    currentModel,
    runtimeAvailableModels,
    callModelInternal,
    extractQuickNoteContent,
    buildQuickNoteTitle,
    getSharedMemoriesCached
  });

  const {
    getLocalDateKey,
    formatPostDraftPreview,
    formatPageDraftPreview,
    updatePostDraftByUserInput,
    getActionAuthContext,
    runRegisteredAction,
    submitPostDraft,
    tryStartActionDraftFromUserInput,
    tryStartPageCreationFromUserInput
  } = actionDraft;

  // → isTreeholeCreateConfirm, isTreeholeCreateReject 已提取到 useIntentDetection.js
  // → _requestTreeholeCreationConfirmation, handlePendingTreeholeCreationReply 已提取到 useMemoryCapture.js


  // ============================================================
  // useMemoryCapture — 记忆/Cloud+/随手记逻辑
  // ============================================================
  const {
    toggleMemoryCapture,
    toggleTreeholeMemory,
    refreshCloudReferenceConsent,
    toggleQuickNoteMode,
    updatePendingQuickNoteDraft,
    dismissQuickNoteDraft,
    confirmQuickNoteDraft,
    requestCloudReferenceConsent,
    approveCloudReferenceConsent,
    rejectCloudReferenceConsent,
    handlePendingCloudReferenceConsentReply,
    handlePendingTreeholeCreationReply,
    requestSharedMemorySaveConfirmation,
    memoryCaptureTip,
    _requestTreeholeCreationConfirmation
  } = useMemoryCapture({
    pendingTreeholeCreation,
    pendingCloudReferenceConsent,
    pendingSharedMemoryCapture,
    pendingQuickNote,
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isQuickNoteEnabled,
    isTreeholeMemoryToggling,
    cloudReferenceConsent,
    memoryCaptureStatusMessage,
    isLoggedIn,
    userInfo,
    currentSessionIndex,
    chatSessions,
    inputMessage,
    textareaRef,
    appendSessionMessage,
    resetComposerInput,
    resetPendingTreeholeCreation,
    resetPendingCloudReferenceConsent,
    resetPendingSharedMemoryCapture,
    resetPendingQuickNote,
    persistMemoryCaptureSetting,
    persistTreeholeMemorySetting,
    persistQuickNoteSetting,
    setMemoryCaptureStatusMessage,
    getSessionByIndex,
    scrollToBottom: safeScrollToBottom,
    nextTick,
    runRegisteredAction,
    normalizePromptLine,
    extractQuickNoteContent,
    buildQuickNoteTitle
  });
  // --------------------------------------------------------------


  // 功能互斥：避免“指令模式 + 联网搜索”同时开启造成行为与 UI 不一致
  watch(isCommandMode, (enabled) => {
    if (enabled && isSearching.value) {
      isSearching.value = false;
    }
  });
  watch(isSearching, (enabled) => {
    if (enabled && isCommandMode.value) {
      isCommandMode.value = false;
    }
  });

  watch(isForumSearchEnabled, (enabled) => {
    if (enabled && isCommandMode.value) {
      isCommandMode.value = false;
    }
  });

  const {
    isRateLimited, rateLimitMessage,
    checkRateLimit, recordMessageSent
  } = useRateLimiter();

  const messages = computed(() => chatSessions[currentSessionIndex.value]?.messages || []);

  // 自动上下文压缩：当本轮上下文进度完整达到 100% 时，
  // 在 sendMessage 中主动调用 ensureContextCompression 让刷新出的摘要赶上本轮请求，
  // 这样 BOH AI 真正看到的就是压缩后的窗口。isCompressingContext 暴露给 UI 用于显示"压缩中"状态。
  // computeContextBudgetUsage / contextBudgetUsage / isCompressingContext / compressingSessionIndex
  // 已委托给 useConversationManager 管理。

  // refreshConversationSummaryCache 采用 forward-declaration：
  // 先声明 wrapper，wrapper 在被调用时才读取 refreshConversationSummaryCacheFn 的当前值。
  // 真正的实现（依赖 callModelInternal）在下方 L893 处赋值给 refreshConversationSummaryCacheFn，
  // 此时 wrapper 通过闭包自动拿到真正的实现。
  let refreshConversationSummaryCacheFn = null;
  const refreshConversationSummaryCache = (...args) => {
    if (refreshConversationSummaryCacheFn) return refreshConversationSummaryCacheFn(...args);
  };

  const { ensureContextCompression } = useContextCompression({
    getSessionByIndex,
    isCompressingContext,
    compressingSessionIndex,
    computeContextBudgetUsage,
    refreshConversationSummaryCache
  });

  // Scroll Helper
  const scrollToBottomCallback = ref(null);
  const onScrollToBottom = (callback) => {
    scrollToBottomCallback.value = callback;
  };
  const scrollToBottom = (force = false) => {
    if (scrollToBottomCallback.value) {
      scrollToBottomCallback.value(force);
    }
  };
  _scrollToBottom = scrollToBottom;

  // Session Management — 会话 CRUD 已委托给 useConversationManager
  const startNewChat = () => {
    _startNewChat();
    isCommandMode.value = false; // Reset modes
    isSearching.value = false;
    isForumSearchEnabled.value = false;
    isKnowledgeBaseEnabled.value = false;
    // Auto 路由相关状态重置
    lastRoutedMode.value = '';
  };

  const stopGeneration = () => {
    const activeIndex = activeGenerationSessionIndex.value;

    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }

    if (generationTimeoutTimer) {
      clearTimeout(generationTimeoutTimer);
      generationTimeoutTimer = null;
    }

    if (activeIndex !== null) {
      const activeSession = getSessionByIndex(activeIndex);
      if (activeSession) {
        activeSession.isLoading = false;
        activeSession.isThinking = false;
      }
    }

    activeGenerationSessionIndex.value = null;
    stopThinkingTimer();
    // B-9 fix: reset thinking state to prevent stale buffer leaking into next generation
    resetThinkingState();
    nextTick(() => {
      if (textareaRef.value) textareaRef.value.focus();
    });
  };

  const buildDialogueMessagesForMemoryCapture = (sessionMessages = []) => {
    return (Array.isArray(sessionMessages) ? sessionMessages : [])
      .filter((item) => item?.meta?.kind !== 'memory_saved_notice')
      .filter((item) => item?.role === 'assistant' || item?.role === 'user')
      .slice(-MEMORY_CAPTURE_CONTEXT_ITEMS)
      .map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: normalizePromptLine(item?.content, 900)
      }))
      .filter((item) => item.content);
  };

  const captureMemoryFromConversation = async ({
    sessionIndex,
    userText,
    assistantText
  } = {}) => {
    const shouldWriteSharedMemory = isMemoryCaptureEnabled.value;
    const shouldWriteTreeholeMemory = false;
    if (!shouldWriteSharedMemory && !shouldWriteTreeholeMemory) return;
    if (!isLoggedIn.value || !userInfo.value?.id) return;

    const safeUserText = String(userText || '').trim();
    const safeAssistantText = String(assistantText || '').trim();
    if (!safeUserText || !safeAssistantText) return;
    if (safeUserText.length < MEMORY_CAPTURE_MIN_USER_CHARS) return;

    const session = getSessionByIndex(sessionIndex);
    if (!session) return;

    const dialogueMessages = buildDialogueMessagesForMemoryCapture(session.messages);
    if (dialogueMessages.length < MEMORY_CAPTURE_MIN_DIALOGUE_ITEMS) return;

    const appendMemorySavedNotice = ({
      savedContents = [],
      treeholeSavedCount = 0,
      pendingCount = 0
    } = {}) => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession) return;

      const items = (Array.isArray(savedContents) ? savedContents : [])
        .map((item) => normalizePromptLine(item, 120))
        .filter(Boolean)
        .slice(0, MEMORY_NOTICE_MAX_ITEMS);

      if (items.length === 0) return;

      const lines = [
        '已保存的记忆',
        ...items.map((item) => `- ${item}`)
      ];
      if (treeholeSavedCount > 0) {
        lines.push(`已写入树洞：${treeholeSavedCount} 条`);
      }
      if (pendingCount > 0) {
        lines.push(`待确认：${pendingCount} 条`);
      }

      targetSession.messages.push({
        role: 'assistant',
        content: lines.join('\n'),
        meta: { kind: 'memory_saved_notice' }
      });
      nextTick(() => scrollToBottom());
    };

    const explicitMemoryContent = extractExplicitMemoryContent(safeUserText);
    if (explicitMemoryContent) {
      let isDuplicate = false;
      if (shouldWriteSharedMemory) {
        const existingShared = await getSharedMemoriesCached();
        isDuplicate = isLikelyMemoryDuplicate(explicitMemoryContent, existingShared);
      }
      if (!isDuplicate && shouldWriteTreeholeMemory) {
        const existingTreehole = await getTreeholeMemoriesCached();
        isDuplicate = isLikelyMemoryDuplicate(explicitMemoryContent, existingTreehole);
      }

      if (!isDuplicate) {
        let sharedSavedCount = 0;
        let treeholeSavedCount = 0;

        if (shouldWriteSharedMemory) {
          const manualSaveResult = await createSharedAIMemory(String(userInfo.value?.id || ''), {
            content: explicitMemoryContent,
            mood: '',
            tags: ['用户指定', '即时记忆'],
            confidence: 1,
            evidence: [{ messageId: 'u_explicit', quote: truncateText(safeUserText, 240) }],
            source: 'manual',
            status: 'active'
          });

          if (manualSaveResult.ok) {
            sharedSavedCount = 1;
            sharedMemoryCache.fetchedAt = 0;
            sharedMemoryCache.items = [];
            resetSharedMemorySearchCache();
          } else {
            logger.warn('boh-ai', '用户指令公共记忆保存失败', manualSaveResult.error?.message || manualSaveResult.error);
          }
        }

        if (shouldWriteTreeholeMemory) {
          const treeholeSaveResult = await createTreeholeMemory(String(userInfo.value?.id || ''), {
            content: explicitMemoryContent,
            mood: '',
            tags: shouldWriteSharedMemory ? ['AI提取', '公共记忆同步'] : ['AI提取', '私密树洞'],
            source: 'ai',
            isStarred: false
          });

          if (treeholeSaveResult.ok) {
            treeholeSavedCount = 1;
            treeholeMemoryCache.userId = '';
            treeholeMemoryCache.fetchedAt = 0;
            treeholeMemoryCache.items = [];
          } else if (treeholeSaveResult.error?.code === 'TREEHOLE_SPACE_REQUIRED') {
            isTreeholeMemoryEnabled.value = false;
            persistTreeholeMemorySetting();
            setMemoryCaptureStatusMessage(treeholeSaveResult.error?.message || '树洞未开启，已自动关闭树洞同步。');
          } else {
            logger.warn('boh-ai', '用户指令树洞记忆保存失败', treeholeSaveResult.error?.message || treeholeSaveResult.error);
          }
        }

        if (sharedSavedCount > 0 || treeholeSavedCount > 0) {
          appendMemorySavedNotice({
            savedContents: [explicitMemoryContent],
            treeholeSavedCount,
            pendingCount: 0
          });
          if (sharedSavedCount > 0 && treeholeSavedCount > 0) {
            setMemoryCaptureStatusMessage('已根据你的明确指令保存 1 条公共记忆，并写入树洞。');
          } else if (sharedSavedCount > 0) {
            setMemoryCaptureStatusMessage('已根据你的明确指令保存 1 条公共记忆。');
          } else if (treeholeSavedCount > 0) {
            setMemoryCaptureStatusMessage('已根据你的明确指令保存 1 条树洞私密记忆。');
          }
        }
      } else {
        setMemoryCaptureStatusMessage('这条记忆已存在，已自动跳过重复保存。');
      }
    }

    const result = await captureTreeholeMemoriesFromDialogue({
      userId: String(userInfo.value?.id || ''),
      sessionId: `${session.timestamp || Date.now()}-${sessionIndex}`,
      messages: dialogueMessages,
      writeToTreehole: shouldWriteTreeholeMemory,
      writeToShared: shouldWriteSharedMemory
    });

    if (!result.ok) {
      if (result.error?.code === 'TREEHOLE_SPACE_REQUIRED') {
        isTreeholeMemoryEnabled.value = false;
        persistTreeholeMemorySetting();
        setMemoryCaptureStatusMessage(result.error?.message || '树洞未开启，已自动关闭树洞同步。');
        return;
      }
      logger.warn('boh-ai', '自动记忆沉淀失败', result.error?.message || result.error);
      return;
    }

    const sharedSavedCount = Number(result.data?.sharedSavedCount || 0);
    const treeholeSavedCount = Number(result.data?.treeholeSavedCount || 0);
    const pendingCount = Number(result.data?.pendingCount || 0);
    const duplicateCount = Number(result.data?.duplicateCount || 0);
    const displayPendingCount = shouldWriteSharedMemory ? pendingCount : 0;
    const savedContents = (Array.isArray(result.data?.items) ? result.data.items : [])
      .filter((item) => item?.status === 'auto_saved' || item?.memoryId || item?.sharedMemoryId)
      .map((item) => item?.content);

    if (sharedSavedCount > 0 || displayPendingCount > 0 || treeholeSavedCount > 0) {
      if (sharedSavedCount > 0) {
        sharedMemoryCache.fetchedAt = 0;
        sharedMemoryCache.items = [];
        resetSharedMemorySearchCache();
      }
      const pendingPart = displayPendingCount > 0 ? `，${displayPendingCount} 条进入待确认` : '';
      if (shouldWriteSharedMemory && shouldWriteTreeholeMemory) {
        setMemoryCaptureStatusMessage(`本轮已写入 AI 公共记忆 ${sharedSavedCount} 条，写入树洞 ${treeholeSavedCount} 条${pendingPart}。`);
      } else if (shouldWriteSharedMemory) {
        setMemoryCaptureStatusMessage(`本轮已写入 AI 公共记忆 ${sharedSavedCount} 条${pendingPart}。`);
      } else {
        setMemoryCaptureStatusMessage(`本轮已写入树洞私密记忆 ${treeholeSavedCount} 条。`);
      }
      appendMemorySavedNotice({
        savedContents,
        treeholeSavedCount,
        pendingCount: displayPendingCount
      });
      return;
    }

    if (duplicateCount > 0) {
      setMemoryCaptureStatusMessage('本轮识别到重复记忆，已自动跳过。');
    }
  };

  refreshConversationSummaryCacheFn = async (sessionIndex, requestSignal = undefined, options = {}) => {
    const { force: forceRegenerate = false } = options;
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return;

    const dialogueMessages = getStorableDialogueMessages(targetSession.messages);
    if (dialogueMessages.length < CONVERSATION_SUMMARY_MIN_MESSAGES) return;

    const fingerprint = buildConversationSummaryFingerprint(targetSession.messages);
    if (!fingerprint) return;
    // 手动触发（force=true）时跳过 fingerprint 命中检查，允许重新生成摘要
    if (!forceRegenerate
      && targetSession.contextSummary?.version === CONVERSATION_SUMMARY_STORAGE_VERSION
      && targetSession.contextSummary?.fingerprint === fingerprint
      && normalizePromptLine(targetSession.contextSummary?.content, 20)
    ) {
      return;
    }

    const olderMessages = dialogueMessages.slice(0, -CONVERSATION_SUMMARY_RECENT_MESSAGES);
    if (olderMessages.length < 4) return;

    // 增量合并：一层摘要也继承已有摘要，避免重新生成时丢失关键细节
    // 之前只有 50+ 条消息的二层摘要才合并，10-50 条区间每次全量重建导致信息丢失
    const existingSummary = normalizePromptLine(targetSession.contextSummary?.content, 20);
    const isTwoLevel = existingSummary && dialogueMessages.length > CONVERSATION_SUMMARY_TWO_LEVEL_THRESHOLD;
    // 二层摘要取后半段中间消息，一层摘要取全部 olderMessages
    const messagesToSummarize = isTwoLevel
      ? olderMessages.slice(-Math.floor(olderMessages.length / 2))
      : olderMessages;

    // 结构化摘要：facts（已确认事实）+ progress（对话进展），信息密度更高
    const summaryPrompt = [
      '请把以下 BOH AI 对话历史和已有摘要（若有）合并压缩成结构化上下文摘要。',
      '输出格式（严格遵守）：',
      '<facts>',
      '已确认的用户身份/目标/偏好/关键事实，每条一行，最多 8 条，共不超过 300 字。',
      '</facts>',
      '<progress>',
      '对话进展和当前任务状态，不超过 400 字。保留关键结论和待办，删除寒暄/重复/已解决细节。',
      '</progress>',
      '要求：',
      '- 不要添加原文没有的信息。',
      '- 不要输出 <facts> 和 <progress> 以外的任何内容。',
      '',
      existingSummary ? `【已有摘要】${existingSummary}` : '【无已有摘要】',
      '',
      '【待压缩对话】',
      messagesToSummarize.map((message) => `${message.role}: ${message.content}`).join('\n')
    ].join('\n');

    const summaryModel = runtimeAvailableModels.value.find(m => m.id === 'Qwen/Qwen2.5-7B-Instruct') || runtimeAvailableModels.value[0];
    if (!summaryModel?.id) return;
    const summarySignal = requestSignal || (typeof AbortController !== 'undefined' ? new AbortController().signal : undefined);

    try {
      const summary = await callModelInternal(
        summaryModel.id,
        summaryPrompt,
        '<role>你是 BOH AI 的本地对话摘要器。</role>\n<constraints>\n- 只输出 <facts> 和 <progress> 两个 XML 段落\n- 不要添加原文没有的信息\n- 不要输出任何额外说明\n</constraints>',
        [],
        summarySignal,
        0,
        // max_tokens 从 1100 提到 1400，容纳结构化输出（facts 300 + progress 400 + 标签开销）
        { max_tokens: 1400, temperature: 0.08, top_p: 0.55, frequency_penalty: 0.05 }
      );

      const latestSession = getSessionByIndex(sessionIndex);
      if (!latestSession) return;
      latestSession.contextSummary = {
        version: CONVERSATION_SUMMARY_STORAGE_VERSION,
        fingerprint,
        content: normalizePromptLine(filterThinkingContent(summary), CONVERSATION_SUMMARY_MAX_CHARS),
        coveredMessageCount: olderMessages.length,
        sourceMessageCount: dialogueMessages.length,
        retainedHistoryChars: dialogueMessages
          .slice(-CONVERSATION_SUMMARY_RECENT_MESSAGES)
          .reduce((total, message) => total + String(message?.content || '').length + 20, 0),
        updatedAt: Date.now()
      };
      scheduleSaveSessions();
    } catch (error) {
      if (!isAbortError(error)) {
        logger.warn('boh-ai', 'Conversation summary refresh failed', error);
      }
    }
  };

  const cleanupGenerationState = (sessionIndex, requestController) => {
    clearThinkingStatus();
    const targetSession = getSessionByIndex(sessionIndex);
    if (targetSession) {
      targetSession.isLoading = false;
      targetSession.isThinking = false;
    }
    if (abortController.value === requestController) {
      abortController.value = null;
    }
    if (activeGenerationSessionIndex.value === sessionIndex) {
      activeGenerationSessionIndex.value = null;
    }
    stopThinkingTimer();
  };

  const { handleResourceSearchRequest } = useResourceSearch({
    getSessionByIndex,
    scrollToBottom,
    getModelForModeId,
    callModelInternal,
    activeGenerationSessionIndex,
    startThinkingTimer,
    stopThinkingTimer,
    setThinkingStatus,
    cleanupGenerationState,
    appendUserMessageWithTitle,
    resetComposerInput,
    mergeAssistantMessageMeta,
    currentSessionIndex,
    abortController,
    runtimeAvailableModels
  });

  let generationTimeoutTimer = null;
  let streamIdleTimer = null;

  const sendMessage = async () => {
    if (!inputMessage.value.trim() || isLoading.value || abortController.value) return;

    const rateLimitResult = checkRateLimit();
    if (rateLimitResult.blocked) return;
    recordMessageSent();

    const sessionIndex = currentSessionIndex.value;
    const session = getSessionByIndex(sessionIndex);
    if (!session) return;
    const userText = inputMessage.value.trim();

    if (await handlePendingCloudReferenceConsentReply(userText)) return;
    if (await handlePendingTreeholeCreationReply(userText)) return;

    if (await tryStartActionDraftFromUserInput(userText, sessionIndex)) return;
    if (await tryStartPageCreationFromUserInput(userText, sessionIndex)) return;
    if (await handleResourceSearchRequest(userText)) return;

    if (isAgentClusterMode(currentModeId.value)) {
      isStreamingGeneration.value = true;
      appendUserMessageWithTitle(sessionIndex, userText);
      resetComposerInput();
      clearAttachedContext();
      scrollToBottom(true);
      // Agent 集群分支同样会携带历史消息，先压缩上下文让 BOH AI 看到的就是压缩后窗口
      await ensureContextCompression(sessionIndex);
      session.isLoading = true;
      session.isThinking = true;
      activeGenerationSessionIndex.value = sessionIndex;
      const clusterController = new AbortController();
      abortController.value = clusterController;
      session.messages.push({ role: 'assistant', content: '' });
      const clusterMessageIndex = session.messages.length - 1;
      await nextTick();
      scrollToBottom();
      resetAgentClusterState();
      try {
        const historyForCluster = Array.isArray(session.messages) ? session.messages.slice(0, -1) : [];
        // 真实 contextSummary：把已经压缩过的旧历史摘要喂给 Orchestrator，避免它把全量历史当 cold start 处理
        const sessionSummaryContent = (session?.contextSummary && typeof session.contextSummary === 'object'
          ? String(session.contextSummary.content || '').trim()
          : '');
        // P1-7：把主 ChatEngine 的真实调用链注入 cluster 的 chat-engine Agent，
        // 这样集群里的"对话"Agent 与主 ChatEngine 共享 system prompt、上下文压缩与所有自动注入。
        const clusterInvokeChatEngine = async ({ query, history, signal, onStream }) => {
          try {
            const activeModeId = runtimeChatModes.value.some((mode) => mode.id === currentModeId.value)
              ? currentModeId.value
              : BOH_DEFAULT_MODE_ID;
            const generationModel = getModelForModeId(activeModeId, { userText: query })
              || currentModel.value
              || runtimeAvailableModels.value[0];
            const modeAppendix = String(
              runtimeChatModes.value.find((mode) => mode.id === activeModeId)?.promptAppendix || ''
            ).trim();
            const systemPromptContent = [
              BASE_SYSTEM_PROMPT,
              modeAppendix
            ].filter(Boolean).join('\n');
            const content = await callModelInternal(
              generationModel.id,
              String(query || ''),
              systemPromptContent,
              Array.isArray(history) ? history : [],
              signal,
              0,
              { max_tokens: 1800, temperature: 0.22, top_p: 0.75 }
            );
            const answerText = String(content || '').trim();
            if (typeof onStream === 'function' && answerText) {
              onStream(answerText);
            }
            return {
              ok: true,
              answer: answerText,
              mode: currentModeId.value,
              sources: [],
              notes: ['对话 Agent 走主 ChatEngine'],
              tokens: Math.max(400, Math.round(answerText.length / 1.5))
            };
          } catch (error) {
            if (isAbortError(error)) {
              return { ok: false, status: 'cancelled', answer: '', error: { message: '已取消' } };
            }
            return {
              ok: false,
              status: 'failed',
              answer: '',
              error: { message: error?.message || String(error) },
              notes: [`对话 Agent 失败：${error?.message || String(error)}`]
            };
          }
        };
        const result = await runAgentClusterBranch({
          userText,
          history: historyForCluster,
          historySummary: sessionSummaryContent,
          clusterMode: 'auto',
          signal: clusterController.signal,
          invokeChatEngine: clusterInvokeChatEngine,
          onEvent: applyAgentClusterEvent,
          webSearch: isSearching.value ? searchWebForPrompt : undefined,
          onStream: (text) => {
            const target = getSessionByIndex(sessionIndex);
            const message = target?.messages?.[clusterMessageIndex];
            if (message) {
              message.content = String(text || '');
              scrollToBottom();
            }
          }
        });
        // 兜底：onStream 可能因中间层未透传而丢失，这里确保最终答案一定写入消息
        const target = getSessionByIndex(sessionIndex);
        const message = target?.messages?.[clusterMessageIndex];
        if (message && result?.answer && !message.content) {
          message.content = String(result.answer);
          scrollToBottom();
        }
        if (result?.degraded) {
          if (message) {
            const note = agentClusterState.lastError ? `\n\n（Agent 集群已降级：${String(agentClusterState.lastError).slice(0, 80)}）` : '';
            message.content = `${message.content || ''}${note}`;
          }
        }
        return;
      } catch (clusterError) {
        if (!isAbortError(clusterError)) {
          logger.error('boh-ai', 'Agent cluster branch failed', clusterError);
        }
        applyAgentClusterEvent({
          type: isAbortError(clusterError) ? 'cancelled' : 'error',
          payload: { message: clusterError?.message || String(clusterError || '') },
          createdAt: Date.now()
        });
        const target = getSessionByIndex(sessionIndex);
        if (target?.messages?.[clusterMessageIndex]) {
          target.messages[clusterMessageIndex].content = isAbortError(clusterError)
            ? '已停止生成。'
            : `多任务处理失败，请重试。`;
        }
        return;
      } finally {
        session.isLoading = false;
        session.isThinking = false;
        isStreamingGeneration.value = false;
        if (activeGenerationSessionIndex.value === sessionIndex) {
          activeGenerationSessionIndex.value = null;
        }
        if (abortController.value === clusterController) {
          abortController.value = null;
        }
        stopThinkingTimer();
      }
    }

    appendUserMessageWithTitle(sessionIndex, userText);
    resetComposerInput();
    clearAttachedContext();
    scrollToBottom(true);

    session.isLoading = true;
    session.isThinking = true;
    activeGenerationSessionIndex.value = sessionIndex;
    // 上下文窗口接近上限时，先把会话历史压成摘要，再让模型拿到真正"压缩后"的上下文。
    // 摘要生成失败/无更新会快速 no-op 退出，不会阻塞发送。
    const preflightController = new AbortController();
    const compressionPromise = ensureContextCompression(sessionIndex, {
      signal: preflightController.signal
    });
    abortController.value = preflightController;
    session.messages.push({
      role: 'assistant',
      content: ''
    });
    const messageIndex = session.messages.length - 1;
    await nextTick();
    scrollToBottom();

    const removePreflightLoader = () => {
      const targetSession = getSessionByIndex(sessionIndex);
      const maybeLoader = targetSession?.messages?.[messageIndex];
      if (maybeLoader?.role === 'assistant' && !String(maybeLoader.content || '').trim()) {
        targetSession.messages.splice(messageIndex, 1);
      }
    };

    const finishPreflightOnly = () => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (targetSession) {
        targetSession.isLoading = false;
        targetSession.isThinking = false;
      }
      if (activeGenerationSessionIndex.value === sessionIndex) {
        activeGenerationSessionIndex.value = null;
      }
      if (abortController.value === preflightController) {
        abortController.value = null;
      }
      stopThinkingTimer();
    };

    const historyMessagesForCurrentTurn = Array.isArray(session.messages)
      ? session.messages.slice(0, -2)
      : [];
    const localContextualQuery = buildContextualFollowUpQuery(userText, historyMessagesForCurrentTurn, {
      maxChars: MAX_USER_INPUT_CHARS
    });
    const enableSearch = isSearching.value;
    let autonomousContextualQuery = '';

    // 无论是否联网，都先让模型自主消解短消息中的省略指代。解析后的完整意图统一用于
    // 回答路由、资料检索和最终提示；固定规则仅在解析失败时兜底。
    if (userText.length <= 160 && historyMessagesForCurrentTurn.length >= 2) {
      const resolverModel = currentModel.value || runtimeAvailableModels.value[0];
      if (resolverModel?.id) {
        try {
          setThinkingStatus('正在结合最近对话理解你的追问...');
          const resolverHistory = historyMessagesForCurrentTurn
            .filter((item) => item?.role === 'user' || item?.role === 'assistant')
            .slice(-6)
            .map((item) => ({
              role: item.role,
              content: truncateText(String(item?.content || '').trim(), 1200)
            }))
            .filter((item) => item.content);
          const rewrittenQuery = await callModelInternal(
            resolverModel.id,
            userText,
            `<role>你是 BOH AI 的上下文理解器。</role>
<task>结合最近对话，把当前用户消息改写成一条含义完整、脱离聊天记录也能正确理解的问题或指令。</task>
<constraints>
- 自主判断省略的对象、代词和时间范围；不要只解释当前短语的字面意思。
- 上一轮助手提到的实体可以用于定位对象，但不得把助手未经证实的说法当成已确认事实。
- 如果当前消息本身已经完整，原样输出。
- 只输出改写后的问题或指令，不要回答，不要加“查询：”等前缀。
</constraints>`,
            resolverHistory,
            preflightController.signal,
            0,
            { max_tokens: 256, temperature: 0, top_p: 0.3, frequency_penalty: 0 }
          );
          autonomousContextualQuery = normalizePromptLine(
            filterThinkingContent(rewrittenQuery)
              .replace(/^(?:独立查询|搜索查询|查询|改写)\s*[:：]\s*/i, '')
              .replace(/^["'“”]|["'“”]$/g, ''),
            600
          );
        } catch (resolverError) {
          if (isAbortError(resolverError)) {
            removePreflightLoader();
            finishPreflightOnly();
            return;
          }
          logger.warn('boh-ai', 'Contextual query rewrite failed, using local fallback', resolverError);
        }
      }
    }

    const contextualQuery = autonomousContextualQuery || localContextualQuery;
    const shouldUseContextualQuery = contextualQuery && contextualQuery !== userText;
    const routingQueryText = shouldUseContextualQuery ? contextualQuery : userText;
    const webSearchQueryText = autonomousContextualQuery || buildContextualWebSearchQuery(
      userText,
      historyMessagesForCurrentTurn,
      { maxChars: MAX_USER_INPUT_CHARS }
    );
    refreshCloudReferenceConsent();

    // 4 模式不再做"自动路由"，但 capability 决策（联网/Cloud+ 引用/保存/指令）仍统一由
    // resolveAutoModeDecisionLocally 提供，本地纯函数判定，不再调 LLM 二次校验。
    const autoDecision = resolveAutoModeDecisionLocally(routingQueryText, {
      isAutoMode: currentModeId.value === 'auto',
      cloudReferenceEnabled: Boolean(isTreeholeMemoryEnabled.value || cloudReferenceConsent.value === 'granted'),
      isLoggedIn: Boolean(isLoggedIn.value && userInfo.value?.id),
      helpers: { isPostDraftRequest }
    });

    if (autoDecision?.shouldSaveCloud || autoDecision?.shouldSaveSharedMemory || autoDecision?.shouldAskMemoryDestination) {
      removePreflightLoader();
      finishPreflightOnly();
      if (requestSharedMemorySaveConfirmation({
        content: userText,
        sessionIndex,
        destination: autoDecision.saveDestination || 'ask'
      })) {
        return;
      }
    }

    if (autoDecision?.shouldReferenceCloud && !isTreeholeMemoryEnabled.value) {
      if (!isLoggedIn.value || !userInfo.value?.id) {
        removePreflightLoader();
        finishPreflightOnly();
        appendSessionMessage(
          sessionIndex,
          'assistant',
          '总结最近日常需要参考你的 BOH Cloud+，但你还没有登录，所以我先不读取这部分内容。'
        );
        return;
      }

      if (cloudReferenceConsent.value === 'denied') {
        removePreflightLoader();
        finishPreflightOnly();
        appendSessionMessage(
          sessionIndex,
          'assistant',
          '你此前已关闭 Cloud+ 隐私授权，因此本次不会读取个人内容。如需重新开启，请前往 BOH AI 设置中的“个人记忆”。'
        );
        return;
      }

      if (cloudReferenceConsent.value !== 'granted') {
        removePreflightLoader();
        finishPreflightOnly();
        requestCloudReferenceConsent();
        return;
      }

      isTreeholeMemoryEnabled.value = true;
      persistTreeholeMemorySetting();
      setMemoryCaptureStatusMessage('Auto 已为你开启 Cloud+ 参考。');
      dispatchUserSpaceIslandMessage({
        title: '已开启 Cloud+ 参考',
        message: 'BOH AI 将结合你的 Cloud+ 内容回答',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 4200
      });
    }

    const operationQuestion = isOperationQuestion(routingQueryText);
    const communityQuestion = isCommunityQuestion(routingQueryText);
    const communityCreativeRequest = communityQuestion && isCommunityCreativeRequest(userText);
    const communityNeedsEvidence = communityQuestion && !communityCreativeRequest;
    const bohInternalFactualQuestion = isLikelyBohInternalFactualQuestion(routingQueryText, { operationQuestion });
    const factualQuestion = isLikelyFactualQuestion(routingQueryText, { operationQuestion }) || bohInternalFactualQuestion;
    // 联网搜索触发条件：仅当用户手动开启联网搜索开关时才触发。
    // 之前 autoDecision.shouldSearchWeb 会让 AI 在用户未开启搜索时自动发起联网搜索，
    // 与用户预期不符，已移除自动触发逻辑。
    session.isLoading = true;
    session.isThinking = true;
    const requestController = new AbortController();
    abortController.value = requestController;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();
    isStreamingGeneration.value = true;
    setThinkingStatus(`正在分析问题：${summarizeThinkingSubject(userText)}`);
    let generationTimedOut = false;
    let generationTimeoutReason = '生成服务长时间没有返回新内容';
    generationTimeoutTimer = null;

    const updateContent = (text) => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession || !targetSession.messages[messageIndex]) return;
      targetSession.messages[messageIndex].content = text;
      scrollToBottom();
    };
    const resetGenerationStallTimeout = (reason = generationTimeoutReason) => {
      generationTimeoutReason = reason;
      clearTimeout(generationTimeoutTimer);
      generationTimeoutTimer = setTimeout(() => {
        generationTimedOut = true;
        if (!requestController.signal.aborted) {
          requestController.abort();
        }
      }, GENERATION_STALL_TIMEOUT_MS);
    };
    const markGenerationProgress = (status = '') => {
      if (status) setThinkingStatus(status);
      resetGenerationStallTimeout(status || generationTimeoutReason);
    };
    resetGenerationStallTimeout('等待生成服务响应');

    try {
      let finalPrompt = truncateText(userText, MAX_USER_INPUT_CHARS);
      let internalEvidenceContext = '';
      let webEvidenceContext = '';
      let currentContent = '';
      let groundingEvidenceRefs = [];
      let searchResultCount = 0;
      let webSearchVerified = false;
      let hasKnowledgeContext = false;
      let latestForumSummaryPosts = [];
      const showProgress = SHOW_INTERNAL_PROGRESS_NOTES;

      const setProgressContent = (nextText) => {
        if (!showProgress) return;
        resetGenerationStallTimeout('正在更新检索进度');
        currentContent = String(nextText || '');
        updateContent(currentContent);
      };

      const appendProgressContent = (appendText) => {
        if (!showProgress) return;
        resetGenerationStallTimeout('正在更新检索进度');
        currentContent += String(appendText || '');
        updateContent(currentContent);
      };

      const WEB_SEARCH_TIMEOUT_MS = 30_000; // 30s web search timeout
      const webSearchSignal = typeof AbortSignal.any === 'function'
        ? AbortSignal.any([requestController.signal, AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS)])
        : requestController.signal;
      const webSearchPromise = enableSearch
        ? runWebSearch(webSearchQueryText || userText, webSearchSignal)
        : Promise.resolve({ ok: true, disabled: false, count: 0, context: '', results: [] });

      if (enableSearch) {
        markGenerationProgress('正在并行搜索网络资料...');
        setProgressContent('正在搜索相关网络资料...\n\n');
      }

      // C1 fix: 知识检索与联网搜索并行启动，减少串行等待时间
      const knowledgePromise = (async () => {
        communitySearchActive.value = Boolean(communityNeedsEvidence || isForumSearchEnabled.value);
        try {
          markGenerationProgress('正在判断需要查看哪些 BOH 资料...');
          const routingPreview = resolveKnowledgeRoutingPlan(routingQueryText);
          if (isForumSearchEnabled.value) {
            routingPreview.plan.forum = true;
          }
          const previewTargets = getRetrievalTargetLabels(routingPreview.plan);
          if (previewTargets.length > 0) {
            markGenerationProgress(`正在查看 ${previewTargets.join('、')}...`);
          }

          const {
            retrievalPlan,
            routingReasons,
            connectorResults,
            retrievalTrace,
            treeholeTotal,
            sharedMemoryTotal,
            userPrivateLabels,
            evidenceRefs,
            contextText
          } = await buildAutoKnowledgeContext(routingQueryText, {
            forceTreehole: Boolean(autoDecision?.shouldReferenceCloud)
          });
          return {
            ok: true,
            retrievalPlan,
            routingReasons,
            connectorResults,
            retrievalTrace,
            treeholeTotal,
            sharedMemoryTotal,
            userPrivateLabels,
            evidenceRefs,
            contextText
          };
        } catch (knowledgeError) {
          logger.error('boh-ai', 'Knowledge retrieval failed', knowledgeError);
          return { ok: false, error: knowledgeError };
        }
      })();

      // 等待知识检索完成，先展示结果
      {
        const knowledgeResult = await knowledgePromise;
        if (knowledgeResult.ok) {
          const {
            retrievalPlan,
            routingReasons,
            connectorResults,
            retrievalTrace,
            treeholeTotal,
            sharedMemoryTotal,
            userPrivateLabels,
            evidenceRefs,
            contextText
          } = knowledgeResult;
          const successfulConnectorResults = Array.isArray(connectorResults)
            ? connectorResults.filter((item) => item?.ok)
            : [];
          const forumConnectorResult = successfulConnectorResults.find((item) => item?.connectorId === BOHAI_CONNECTOR_IDS.forum);
          if (isLatestForumSummaryQuery(routingQueryText) && Array.isArray(forumConnectorResult?.metadata?.posts)) {
            latestForumSummaryPosts = forumConnectorResult.metadata.posts;
          }
          const retrievalTargets = [];
          if (retrievalPlan.treehole) retrievalTargets.push(treeholeTotal > 0 ? `BOH Cloud+(${treeholeTotal}条)` : 'BOH Cloud+');
          if (retrievalPlan.sharedMemory && sharedMemoryTotal > 0) {
            retrievalTargets.push(`AI公共记忆(${sharedMemoryTotal}条)`);
          }
          if (retrievalPlan.memory) retrievalTargets.push('记忆库');
          if (retrievalPlan.siteGuide) retrievalTargets.push('操作手册');
          if (retrievalPlan.forum) retrievalTargets.push('社区帖子');
          if (retrievalPlan.userPrivate && Array.isArray(userPrivateLabels) && userPrivateLabels.length > 0) {
            retrievalTargets.push(...userPrivateLabels.slice(0, 3));
          }

          mergeAssistantMessageMeta(sessionIndex, messageIndex, { ragTrace: retrievalTrace });

          if (retrievalTargets.length > 0) {
            appendProgressContent(`正在检索 ${retrievalTargets.join('、')}...\n\n`);
          }

          if (Array.isArray(routingReasons) && routingReasons.length > 0) {
            appendProgressContent(`检索路径：${routingReasons.slice(0, 4).join('；')}\n\n`);
          }

          if (contextText) {
            hasKnowledgeContext = true;
            // C2 fix: 不在此处独立截断，统一在 buildStructuredUserPrompt 前用共享预算处理
            internalEvidenceContext = contextText;
            groundingEvidenceRefs = Array.isArray(evidenceRefs) ? evidenceRefs.slice(0, 32) : [];
            if (retrievalTargets.length > 0) {
              appendProgressContent('已找到相关资料\n\n');
              markGenerationProgress('已找到相关资料，正在整理回答依据...');
            }
          } else if (retrievalTargets.length > 0) {
            appendProgressContent('未找到相关站内资料\n\n');
            markGenerationProgress('未找到明确资料，正在分析问题本身...');
          }
        } else {
          appendProgressContent(`站内检索暂时不可用\n\n`);
          markGenerationProgress('资料检索失败，正在尝试直接回答...');
        }
      }

      const webSearchResult = await webSearchPromise;

      if (enableSearch) {
        try {
          if (webSearchResult?.disabled) {
            if (isSearching.value) {
              isSearching.value = false;
            }
            // 会话级去重：同一会话已经提示过"联网搜索未配置"就不再刷一次。
            if (!webSearchDisabledNoticeShownFor.has(sessionIndex)) {
              webSearchDisabledNoticeShownFor.add(sessionIndex);
              updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索未配置，已跳过外部检索。']);
            }
            setProgressContent(`${webSearchResult.message}，已跳过网络检索。\n\n`);
          } else if (webSearchResult?.ok) {
            searchResultCount = Number(webSearchResult.count || 0);
            if (webSearchResult.context) {
              // C2 fix: 不在此处独立截断，统一在 buildStructuredUserPrompt 前用共享预算处理
              webEvidenceContext = webSearchResult.context;
            }
            const results = Array.isArray(webSearchResult.results) ? webSearchResult.results : [];
            webSearchVerified = results.length > 0;
            if (results.length > 0) {
              setProgressContent(`找到 ${results.length} 个结果：\n${results.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join('\n')}\n\n`);
            } else {
              setProgressContent('未找到相关结果\n\n');
            }
          } else {
            if (webSearchResult?.error && webSearchResult.error?.name !== 'AbortError') {
              logger.error('boh-ai', 'Search failed', webSearchResult.error);
            }
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索失败，已尝试继续回答。']);
            appendProgressContent(`搜索服务暂时不可用\n\n`);
          }
        } catch (searchError) {
          if (searchError?.name !== 'AbortError') {
            logger.error('boh-ai', 'Search failed', searchError);
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索失败，已尝试继续回答。']);
            appendProgressContent(`搜索暂时失败\n\n`);
          }
        }
      }

      // 把本轮搜索结果存到 assistant 消息 meta，供下一轮追问复用（保持对话连贯）
      // 只存精简版（url+title+截断content），避免 localStorage 持久化膨胀
      if (enableSearch && webSearchResult?.ok && webEvidenceContext) {
        const compactResults = (Array.isArray(webSearchResult.results) ? webSearchResult.results : [])
          .slice(0, 5)
          .map((r) => ({
            title: String(r?.title || '').slice(0, 120),
            url: String(r?.url || '').slice(0, 240),
            content: String(r?.content || '').slice(0, 400)
          }));
        mergeAssistantMessageMeta(sessionIndex, messageIndex, {
          searchContext: {
            query: String(webSearchQueryText || userText).slice(0, 600),
            results: compactResults,
            aiAnswer: String(webSearchResult?.aiAnswer || '').slice(0, 600)
          }
        });
      }
      // 内部证据（知识库/论坛/Cloud+）也写入 meta，供追问时复用
      // 解决"追问 [F1] 是谁时模型不知道 [F1] 内容"的割裂问题
      if (internalEvidenceContext && groundingEvidenceRefs.length > 0) {
        mergeAssistantMessageMeta(sessionIndex, messageIndex, {
          evidenceContext: String(internalEvidenceContext).slice(0, 4000),
          evidenceRefs: groundingEvidenceRefs.slice(0, 16)
        });
      }

      const shouldEnforceGrounding = factualQuestion || operationQuestion || enableSearch || communityNeedsEvidence || bohInternalFactualQuestion;

      const latestForumSummaryMode = isLatestForumSummaryQuery(routingQueryText);
      const personalSupportMode = isLikelyPersonalSupportRequest(userText);

      // 模式选择（4 模式下不再做自动路由）：
      // 1) 当前模式 (currentModeId.value)
      // 2) isPlanModeEnabled 开启时强制 plan（不覆盖 agent 自身）
      // 3) 追问场景：若当前文本是上下文依赖型追问，沿用上一轮 routedMode（保持分析深度连贯）
      // 4) 兜底 fast
      let activeModeId = currentModeId.value;
      if (isPlanModeEnabled.value && activeModeId !== 'agent-cluster') {
        activeModeId = 'plan';
      } else if (shouldUseContextualQuery || isContextDependentFollowUp(userText)) {
        // 追问场景：从历史 assistant 消息读取上一轮 routedMode 并沿用
        for (let i = historyMessagesForCurrentTurn.length - 1; i >= 0; i -= 1) {
          const prevMsg = historyMessagesForCurrentTurn[i];
          if (prevMsg?.role !== 'assistant') continue;
          const prevMode = prevMsg?.meta?.routedMode;
          if (prevMode && prevMode !== 'agent-cluster' && prevMode !== 'auto') {
            activeModeId = prevMode;
            break;
          }
        }
      }
      // 暴露给 UI：本轮路由到的具体模式（含 plan 模式提升 / 追问沿用）
      lastRoutedMode.value = activeModeId;
      // 在消息 meta 中记录 routedMode：供后续追问场景做"沿用上一轮模式"判断
      mergeAssistantMessageMeta(sessionIndex, messageIndex, { routedMode: activeModeId });
      const isPlanMode = activeModeId === 'plan';
      if (isPlanModeEnabled.value) {
        updateAssistantActionNotes(sessionIndex, messageIndex, ['Plan 模式已开启，显示实时进度。']);
      }
      const hasForumEvidence = Array.isArray(groundingEvidenceRefs)
        && groundingEvidenceRefs.some((ref) => /^F\d+$/i.test(String(ref)));

      const responseRules = `<constraints>
- 涉及社区事实时，优先依据检索内容回答。
- 涉及用户个人复盘时，优先结合 BOH Cloud+ 私有内容给出总结和建议。
- 追问时保持对话连贯，不要重复已说过的内容，直接推进。
- 对于通用知识问题（非方块之家站内内容），直接给出最佳回答，不确定的部分标注不确定即可；不要建议用户去论坛搜索、不要提供搜索步骤，也不要问"你是想了解 X 还是想在论坛查帖子"。
${hasForumEvidence ? `- 总结论坛帖子时，用检索资料中的发帖者信息指代，不要泛称"有人提到"。
- 不要编造论坛用户、帖子或链接；没有检索到论坛资料时，不要提及论坛内容。` : ''}
${personalSupportMode ? '- 用户在表达自己的困扰、情绪或身体状态时，先用 1-2 句接住他的处境和感受，再给最多 2-3 个低压力、今晚就能做的小动作；不要上来就列长清单，不要把普通困扰写成医学建议。结尾可以轻轻问一句具体情况，让用户愿意继续说。' : ''}
${isPlanMode ? '- Plan 模式下需要提问时用【追问】格式，不要直接在对话中发问；信息充足后用 - [ ] 输出结构化计划。' : ''}
${latestForumSummaryMode ? '- 用户要求总结论坛最新内容时，必须严格按 [F1]、[F2]、[F3]、[F4]、[F5] 的顺序输出；[F1] 是最新发布，后面依次更早。不得按热度、重要性或主题重排；若不足 5 条，只输出已检索到的条目。' : ''}
</constraints>`;

      let communityRules = '';
      if (bohInternalFactualQuestion) {
        communityRules = `<constraints>
- 涉及方块之家、BOH、论坛帖子、成员、活动、历史等内容时，依据检索到的资料回答。
- 不要凭印象补全人物、事件、时间线或统计数字。
- 资料没有覆盖的点，直接说“未检索到相关依据”即可。
</constraints>`;
      }

      let evidenceRules = '';
      if (shouldEnforceGrounding) {
        evidenceRules = `<constraints>
- 优先基于检索到的资料回答，不确定的部分直接说明不确定。
- 回答要自然流畅，不需要标注来源编号。
</constraints>`;
      }

      let operationRules = '';
      if (operationQuestion) {
        operationRules = `<constraints>
- 给出入口路径和操作步骤；简单操作用自然段落说明，复杂操作用编号步骤。
- 如果无法从已检索资料确认路径，直接说“无法确认该功能的准确路径”。
- 禁止猜测未出现过的页面路径或按钮文案。
</constraints>`;
      }

      const actualExtraChars = (internalEvidenceContext.length || 0) + (webEvidenceContext.length || 0) + (communityRules.length || 0) + (evidenceRules.length || 0) + (operationRules.length || 0);
      updateLastActualExtraChars(actualExtraChars);

      // 对话连贯性修复：当前轮未搜索时，复用上一轮 assistant 消息的搜索结果
      // 解决"追问时 AI 不知道上一轮 [W1][W2] 的实际内容"导致的不连贯问题
      if (!webEvidenceContext && historyMessagesForCurrentTurn.length >= 2) {
        for (let i = historyMessagesForCurrentTurn.length - 1; i >= 0; i -= 1) {
          const prevMsg = historyMessagesForCurrentTurn[i];
          if (prevMsg?.role !== 'assistant') continue;
          const prevSearch = prevMsg?.meta?.searchContext;
          if (!prevSearch || !Array.isArray(prevSearch.results) || prevSearch.results.length === 0) break;
          // 用上一轮的精简搜索结果重建 context
          const restoredResults = prevSearch.results.map((r) => ({
            title: String(r?.title || ''),
            url: String(r?.url || ''),
            content: String(r?.content || '')
          }));
          webEvidenceContext = buildSearchResultsContext(restoredResults, String(prevSearch.aiAnswer || ''));
          // 标记为复用上下文，供后续逻辑识别
          searchResultCount = restoredResults.length;
          webSearchVerified = true;
          break;
        }
      }
      // 内部证据跨轮恢复：当前轮未检索到内部证据时，复用上一轮的 evidenceContext
      // 解决"追问 [F1] 是谁时模型不知道 [F1] 内容"的割裂问题
      if (!internalEvidenceContext && historyMessagesForCurrentTurn.length >= 2) {
        for (let i = historyMessagesForCurrentTurn.length - 1; i >= 0; i -= 1) {
          const prevMsg = historyMessagesForCurrentTurn[i];
          if (prevMsg?.role !== 'assistant') continue;
          const prevEvidence = prevMsg?.meta?.evidenceContext;
          const prevRefs = prevMsg?.meta?.evidenceRefs;
          if (!prevEvidence) break;
          internalEvidenceContext = String(prevEvidence);
          if (Array.isArray(prevRefs) && prevRefs.length > 0) {
            groundingEvidenceRefs = prevRefs.slice(0, 32);
          }
          break;
        }
      }

      // 搜索状态兜底：用户开启了联网搜索但当前轮搜索失败/无结果，且没有上一轮结果可复用时，
      // 把失败状态注入 webEvidenceContext，让模型知道搜索未能完成并据实告知用户，
      // 而不是因为上下文为空就回答"我没有访问实时数据的能力"。
      if (enableSearch && !webEvidenceContext) {
        let searchStatusReason = '搜索未能完成';
        if (webSearchResult?.disabled) {
          searchStatusReason = '联网搜索未配置（Tavily Key 缺失）';
        } else if (webSearchResult?.ok && searchResultCount === 0) {
          searchStatusReason = '未找到相关搜索结果';
        } else if (!webSearchResult?.ok) {
          const failMsg = String(webSearchResult?.message || '').trim();
          searchStatusReason = failMsg || '搜索服务暂时不可用';
        }
        webEvidenceContext = `<web_search_status>\n用户已开启联网搜索，但${searchStatusReason}。请在回答开头用一句话简要告知用户搜索未能完成及原因，再基于你已有的知识尽力回答用户问题；不要说"我没有访问实时数据的能力"这类话。\n</web_search_status>`;
      }

      // C2+C5 fix: 共享 8000 字预算 + URL 去重
      const evidenceUrls = Array.isArray(groundingEvidenceRefs) ? groundingEvidenceRefs.map((r) => String(r?.url || r?.source || '').trim()).filter(Boolean) : [];
      const searchUrls = Array.isArray(webSearchResult?.results) ? webSearchResult.results.map((r) => String(r?.url || '').trim()).filter(Boolean) : [];
      const sharedContext = buildSharedEvidenceContext({
        evidenceContext: internalEvidenceContext,
        searchContext: webEvidenceContext,
        maxChars: MAX_PROMPT_EXTRA_CHARS,
        evidenceUrls,
        searchUrls
      });

      finalPrompt = buildStructuredUserPrompt({
        userText: shouldUseContextualQuery
          ? `${userText}\n\n【上下文理解提示】这是一条追问；请结合最近对话理解，不要把它当成脱离上下文的新问题。\n${contextualQuery}`
          : userText,
        responseRules,
        communityRules,
        evidenceRules,
        operationRules
      });

      const preferAccuracyModel = factualQuestion || operationQuestion || enableSearch || communityNeedsEvidence;
      const planMode = runtimeChatModes.value.find((m) => m.id === 'plan');
      const planModel = planMode?.model ? runtimeAvailableModels.value.find((m) => m.id === planMode.model) : null;
      const routedModeModel = getModelForModeId(activeModeId, { userText });
      const generationModel = preferAccuracyModel && planModel
        ? planModel
        : (hasKnowledgeContext && planModel ? planModel : routedModeModel);
      markGenerationProgress('正在生成回答...');

      let url = generationModel.url;
      let headers = {
        'Content-Type': 'application/json'
      };
      let requestBody = {};
      const stylePromptAppendix = String(currentResponseStyle.value?.promptAppendix || '').trim();
      const evidenceContextBlock = buildSystemEvidenceContext({
        evidenceContext: sharedContext.evidenceContext,
        searchContext: sharedContext.searchContext
      });

      // 上下文压缩修复：在构建历史消息前 await 摘要，
      // 确保本轮就能用上新摘要（之前在第 1722 行才 await，首跨阈值轮拿不到新摘要）
      await compressionPromise;

      // 优化1: Token 预算监控
      const budgetTracker = createContextBudgetTracker();
      budgetTracker.addEstimate(CONTEXT_CATEGORIES.SYSTEM_PROMPT, BASE_SYSTEM_PROMPT);
      budgetTracker.addEstimate(CONTEXT_CATEGORIES.EVIDENCE, evidenceContextBlock);
      budgetTracker.addEstimate(CONTEXT_CATEGORIES.RULES, finalPrompt);

      // 优化2: 结构化记忆提取
      const structuredMemories = extractStructuredMemories(historyMessagesForCurrentTurn);
      const structuredMemoryBlock = buildStructuredMemoryBlock(structuredMemories);
      budgetTracker.addEstimate(CONTEXT_CATEGORIES.STRUCTURED_MEMORY, structuredMemoryBlock);

      // 摘要并入主 system prompt 的 context 段落（之前作为独立 system 消息，部分模型处理不一致）
      const cachedSummary = getCachedSummaryIfUsable(session);
      const pageContextBlock = buildPageContextBlock(attachedContext.value);
      const contextBlock = [pageContextBlock, evidenceContextBlock, cachedSummary ? `\n<conversation_summary>\n${cachedSummary}\n</conversation_summary>\n` : '']
        .filter((s) => String(s || '').trim())
        .join('\n');

      const systemPromptContent = [
        BASE_SYSTEM_PROMPT.replace(`\n${CONTEXT_PLACEHOLDER}\n`, contextBlock ? `\n${contextBlock}\n` : ''),
        structuredMemoryBlock,
        isPlanMode ? PLAN_MODE_PROMPT_APPENDIX : '',
        stylePromptAppendix
      ].filter((section) => String(section || '').trim()).join('\n');
      const generationProfile = getGenerationProfile(activeModeId, {
        factualQuestion: factualQuestion || communityNeedsEvidence,
        operationQuestion
      });

      const recentMessages = buildHistoryMessagesWithCachedSummary({
        ...session,
        messages: historyMessagesForCurrentTurn
      }, {
        maxChars: MAX_HISTORY_CONTEXT_CHARS,
        maxMessages: MAX_CONTEXT_MESSAGES,
        maxPerMessage: MAX_HISTORY_MESSAGE_CHARS
      });

      if (latestForumSummaryMode && latestForumSummaryPosts.length > 0 && !enableSearch) {
        markGenerationProgress('正在把社区动态整理成自然叙述...');
        let narrativeAnswer = '';
        const forumSummarySourceText = getForumSummarySourceText(latestForumSummaryPosts);
        const forumNarrativePrompt = buildForumNarrativeSummaryPrompt(latestForumSummaryPosts);
        try {
          const rawNarrative = await callModelInternal(
            generationModel.id,
            forumNarrativePrompt,
            `${systemPromptContent}\n<constraints>\n- 绝对不能编造论坛帖子内容\n- 绝对不能输出链接或 URL\n- 绝对不能输出列表格式，必须用自然段落\n- 必须严格基于用户提供的论坛帖子资料\n</constraints>`,
            [],
            requestController.signal,
            0,
            {
              ...generationProfile,
              temperature: 0.03,
              top_p: 0.42,
              max_tokens: Math.min(Number(generationProfile.max_tokens || 1200), 900)
            }
          );
          narrativeAnswer = removeForumSummaryLinks(cleanAssistantVisibleReply(filterThinkingContent(rawNarrative)));

          const polarityConflicts = detectForumSummaryPolarityConflicts(forumSummarySourceText, narrativeAnswer);
          if (polarityConflicts.length > 0) {
            logger.warn('boh-ai', '论坛总结检测到极性冲突，准备重写', polarityConflicts);
            markGenerationProgress('正在核对总结准确性...');
            const repairedNarrative = await callModelInternal(
              generationModel.id,
              `${forumNarrativePrompt}\n\n【上次总结存在的准确性问题】\n${polarityConflicts.map((item) => `- ${item}`).join('\n')}\n\n【上次总结】\n${narrativeAnswer}\n\n请重写总结，必须修正上述问题，尤其不能把“大/小、多少、喜欢/不喜欢、要/不要”等语义方向写反。`,
              `${systemPromptContent}\n<constraints>\n- 你正在修正论坛总结\n- 绝对不能编造\n- 绝对不能输出链接或列表\n- 必须严格基于资料，优先准确，其次自然\n</constraints>`,
              [],
              requestController.signal,
              0,
              {
                ...generationProfile,
                temperature: 0,
                top_p: 0.35,
                max_tokens: Math.min(Number(generationProfile.max_tokens || 1200), 900)
              }
            );
            const repairedAnswer = removeForumSummaryLinks(cleanAssistantVisibleReply(filterThinkingContent(repairedNarrative)));
            narrativeAnswer = repairedAnswer || '';
          }
        } catch (summaryError) {
          if (summaryError?.name === 'AbortError') throw summaryError;
          logger.warn('boh-ai', 'AI 论坛叙述总结失败，降级为规则总结', summaryError);
        }

        const finalNarrativeAnswer = narrativeAnswer || buildExtractiveForumSummaryAnswer(latestForumSummaryPosts);
        markGenerationProgress('正在输出论坛总结...');
        clearThinkingStatus();
        const targetSession = getSessionByIndex(sessionIndex);
        if (targetSession) {
          targetSession.isThinking = false;
        }
        updateContent(finalNarrativeAnswer);
        nextTick(scrollToBottom);

        void captureMemoryFromConversation({
          sessionIndex,
          userText,
          assistantText: finalNarrativeAnswer
        });
        return;
      }

      const groundingRefSet = new Set(
        (Array.isArray(groundingEvidenceRefs) ? groundingEvidenceRefs : []).map((id) => String(id).toUpperCase())
      );
      const maxSearchCitationRef = enableSearch
        ? Math.max(0, Math.min(9, Math.trunc(Number(searchResultCount) || 0)))
        : 0;
      const totalGroundingRefCount = groundingRefSet.size + maxSearchCitationRef;

      const needsInternalEvidence = communityNeedsEvidence || bohInternalFactualQuestion;
      const noInternalEvidence = needsInternalEvidence && totalGroundingRefCount <= 0;

      const sanitizeCommunityEvidenceClaims = (reply) => sanitizeUnsupportedCommunityEvidenceClaims(reply, {
        availableEvidenceRefs: groundingEvidenceRefs,
        fallbackText: '我没有检索到对应的 BOH 论坛帖子或用户，不能把这件事说成社区里有人分享过。'
      });

      // 依据校验：无内部证据时追加不确定声明，不拦截回答
      const ensureGroundedReply = (rawReply) => {
        const safeReply = String(rawReply || '').trim();
        const realtimeVerificationNote = enableSearch && factualQuestion && !webSearchVerified
          ? '（联网搜索未返回可用结果，以下内容未经过实时网络验证。）\n\n'
          : '';
        if (noInternalEvidence && safeReply) {
          return realtimeVerificationNote + safeReply + '\n\n（未检索到相关站内资料，以上回答基于通用知识）';
        }
        if (!safeReply) return realtimeVerificationNote.trim();
        if (!shouldEnforceGrounding) return realtimeVerificationNote + safeReply;
        if (totalGroundingRefCount <= 0) {
          if (needsInternalEvidence) {
            return '未检索到明确依据，无法确认这部分 BOH 内部内容。为了避免编造，我不能凭印象补全答案；可以换个更具体的关键词，或开启联网搜索后再试。';
          }
          return realtimeVerificationNote + safeReply;
        }
        return realtimeVerificationNote + safeReply;
      };

      const thinkingSpeedDeltas = THINKING_SPEED_DELTAS_BY_ID[currentThinkingSpeedId.value];
      const hasSpeedOverride = thinkingSpeedDeltas && (thinkingSpeedDeltas.temperature !== 0 || thinkingSpeedDeltas.topP !== 0 || thinkingSpeedDeltas.maxTokensScale !== 1);

      requestBody = {
        model: generationModel.id,
        messages: [
          { role: 'system', content: systemPromptContent },
          ...recentMessages,
          { role: 'user', content: finalPrompt }
        ],
        stream: true,
        temperature: Math.max(0, Math.min(2, generationProfile.temperature + (hasSpeedOverride ? (thinkingSpeedDeltas.temperature || 0) : 0))),
        top_p: Math.max(0, Math.min(1, generationProfile.top_p + (hasSpeedOverride ? (thinkingSpeedDeltas.topP || 0) : 0))),
        frequency_penalty: generationProfile.frequency_penalty,
        max_tokens: hasSpeedOverride
          ? Math.max(1, Math.round((generationProfile.max_tokens || 4096) * (thinkingSpeedDeltas.maxTokensScale || 1)))
          : generationProfile.max_tokens
      };

      // C1 fix + 优化1/3: 发送前裁剪 messages 数组，使用分层压缩
      budgetTracker.addEstimate(CONTEXT_CATEGORIES.HISTORY, recentMessages.map((m) => m.content).join(' '));
      const budgetState = budgetTracker.getUsage();
      requestBody.messages = compactMessages(requestBody.messages, MAX_MESSAGES_TOTAL_TOKENS);
      if (budgetState.level === 'high' || budgetState.level === 'full') {
        const degPlan = budgetTracker.getDegradationPlan();
        if (degPlan.drops.length > 0) {
          logger.info('boh-ai', 'Context budget', JSON.stringify({ level: budgetState.level, drops: degPlan.drops }));
        }
      }

      const STREAM_FETCH_TIMEOUT_MS = 120_000; // 2 min stream timeout
      markGenerationProgress('正在请求模型生成回答...');
      const streamFetchSignal = typeof AbortSignal.any === 'function'
        ? AbortSignal.any([requestController.signal, AbortSignal.timeout(STREAM_FETCH_TIMEOUT_MS)])
        : requestController.signal;

      // 创建流专用的思考过滤状态
      const thinkingState = createThinkingState();
      markGenerationProgress('正在生成回答...');

      let assistantMessage = getSessionByIndex(sessionIndex)?.messages?.[messageIndex]?.content || '';
      let lastVisibleStreamContent = cleanAssistantVisibleReply(filterThinkingContent(assistantMessage));
      let shouldRepairDegenerateStream = false;
      let hasReceivedVisibleAnswer = false;
      const stopThinkingWhenAnswerVisible = () => {
        if (hasReceivedVisibleAnswer) return;
        hasReceivedVisibleAnswer = true;
        clearThinkingStatus();
        const targetSession = getSessionByIndex(sessionIndex);
        if (targetSession) {
          targetSession.isThinking = false;
        }
      };

      const response = await callVaultSiliconChatStream({
        provider: generationModel.providerKey || 'siliconflow',
        purpose: 'chat',
        mode: activeModeId,
        apiUrl: url,
        timeoutMs: STREAM_FETCH_TIMEOUT_MS,
        signal: streamFetchSignal,
        payload: requestBody
      });

      // B9 fix: callVaultSiliconChatStream 已在内部对 !response.ok 抛出错误，
      // 此处 response 必定 ok 且 body 为可读流，移除不可达的 !response.ok 检查。
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      streamIdleTimer = null;
      const readNextStreamChunk = async () => {
        if (!hasReceivedVisibleAnswer) return reader.read();
        return Promise.race([
          reader.read(),
          new Promise((resolve) => {
            streamIdleTimer = setTimeout(() => {
              resolve({ done: true, value: undefined, idleTimeout: true });
            }, 2500);
          })
        ]).finally(() => {
          if (streamIdleTimer) {
            clearTimeout(streamIdleTimer);
            streamIdleTimer = null;
          }
        });
      };
      const sseParser = createSseLineParser((payload) => {
        try {
          const data = JSON.parse(payload);
          const delta = data.choices?.[0]?.delta || {};
          const rawContent = delta.content || '';

          if (rawContent) {
            resetGenerationStallTimeout('正在接收模型输出');
            const content = safeChunkToString(rawContent);
            const filteredContent = filterThinkingContentStream(content, thinkingState);
            if (filteredContent && filteredContent !== '[object Object]') {
              if (shouldRepairDegenerateStream) {
                return;
              }
              if (String(filteredContent).trim()) {
                stopThinkingWhenAnswerVisible();
              }
              assistantMessage += filteredContent;
              const visibleStreamContent = cleanAssistantVisibleReply(filterThinkingContent(assistantMessage));
              if (visibleStreamContent) {
                lastVisibleStreamContent = visibleStreamContent;
              }
              updateContent(assistantMessage);
              nextTick(scrollToBottom);

              if (isDegenerateStreamOutput(assistantMessage)) {
                shouldRepairDegenerateStream = true;
                markGenerationProgress('生成内容异常，正在自动修复...');
                appendProgressContent('回答异常，正在自动修复...\n\n');
              }
            }
          }
        } catch (e) {
          logger.error('boh-ai', 'Parse error', e);
        }
      });

      while (true) {
        const { done, value, idleTimeout } = await readNextStreamChunk();
        if (idleTimeout) {
          try {
            await reader.cancel();
          } catch (_cancelError) {
            // Ignore reader cancel errors.
          }
          break;
        }
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sseParser.push(chunk);
        if (sseParser.isDone()) break;
        if (shouldRepairDegenerateStream) {
          try {
            await reader.cancel();
          } catch (_cancelError) {
            // Ignore reader cancel errors.
          }
          break;
        }
      }

      if (!shouldRepairDegenerateStream && !sseParser.isDone()) {
        sseParser.push(decoder.decode());
        sseParser.flush();

        // 流式处理结束，刷新缓冲区并添加剩余内容
        const remainingContent = flushThinkingBuffer(thinkingState);
        if (remainingContent) {
          assistantMessage += remainingContent;
          const visibleStreamContent = cleanAssistantVisibleReply(filterThinkingContent(assistantMessage));
          if (visibleStreamContent) {
            lastVisibleStreamContent = visibleStreamContent;
            updateContent(assistantMessage);
            nextTick(scrollToBottom);
          }
        }
      }

      // SSE error 事件处理：边缘函数在流中发送 event: error 时，抛出错误让上层捕获
      const sseError = sseParser.getError?.();
      if (sseError) {
        throw sseError;
      }

      if (shouldRepairDegenerateStream) {
        const retryPrompt = appendPromptSection(
          finalPrompt,
          `\n<constraints>
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 输出必须是正常中文句子，结构清晰，不要输出长串符号。
- 若信息不足，请直接说明"我暂时无法确认"，不要输出占位符。
</constraints>`,
          MAX_FINAL_PROMPT_CHARS
        );

        const retryReply = await callModelInternal(
          generationModel.id,
          retryPrompt,
          systemPromptContent,
          recentMessages,
          requestController.signal,
          0,
          generationProfile
        );
        const retryFiltered = filterThinkingContent(retryReply);

        const repairedContent = (!isDegenerateAssistantReply(retryFiltered) && String(retryFiltered || '').trim())
          ? retryFiltered
          : '回答出现异常，可以切换到“思考”模式重试。';

        const groundedRepairedContent = cleanAssistantVisibleReply(ensureGroundedReply(repairedContent))
          || '我暂时没有生成到有效内容，请再试一次。';
        updateContent(sanitizeCommunityEvidenceClaims(groundedRepairedContent));
        nextTick(scrollToBottom);
        await queueQuickNoteConfirmation({
          rawText: userText,
          sessionIndex,
          requestSignal: requestController.signal,
          modelId: generationModel.id
        });

        void captureMemoryFromConversation({
          sessionIndex,
          userText,
          assistantText: groundedRepairedContent
        });
        return;
      }

      // 对完整内容进行二次过滤，确保所有思考内容都被过滤掉
      let finalFilteredContent = filterThinkingContent(assistantMessage);
      if (String(finalFilteredContent || '').trim()) {
        stopThinkingWhenAnswerVisible();
      }

      if (!cleanAssistantVisibleReply(finalFilteredContent)) {
        logger.warn('boh-ai', 'Stream completed without visible assistant content, retrying non-stream fallback');
        markGenerationProgress('正在补全回答...');
        try {
          const fallbackModel = getFallbackModel(generationModel.id);
          const fallbackReply = await callModelInternal(
            fallbackModel?.id || generationModel.id,
            appendPromptSection(
              finalPrompt,
              '\n<constraints>\n- 补答：上一轮流式输出没有生成可见正文\n- 直接给出最终回答，不要输出思考过程、检索日志或空内容\n</constraints>',
              MAX_FINAL_PROMPT_CHARS
            ),
            systemPromptContent,
            recentMessages,
            requestController.signal,
            0,
            {
              ...generationProfile,
              max_tokens: Math.min(Number(generationProfile.max_tokens || 1200), 1200)
            }
          );
          finalFilteredContent = filterThinkingContent(fallbackReply);
        } catch (fallbackError) {
          logger.warn('boh-ai', 'Non-stream fallback after empty stream failed', fallbackError);
        }
      }

      if (isDegenerateAssistantReply(finalFilteredContent)) {
        logger.warn('boh-ai', 'Detected degenerate output, retrying once with strict settings');
        markGenerationProgress('生成内容异常，正在自动重试...');
        appendProgressContent('回答异常，正在自动重试...\n\n');

        const retryPrompt = appendPromptSection(
          finalPrompt,
          `\n<constraints>
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 若信息不足，请直接说明"我暂时无法确认"，不要输出占位符。
</constraints>`,
          MAX_FINAL_PROMPT_CHARS
        );

        const retryReply = await callModelInternal(
          generationModel.id,
          retryPrompt,
          systemPromptContent,
          recentMessages,
          requestController.signal,
          0,
          generationProfile
        );
        const retryFiltered = filterThinkingContent(retryReply);

        if (!isDegenerateAssistantReply(retryFiltered) && String(retryFiltered || '').trim()) {
          finalFilteredContent = retryFiltered;
        } else {
          finalFilteredContent = '抱歉，本轮生成内容异常。你可以切到“思考/专业”模式重试，我也可以继续帮你完成这个问题。';
        }
      }

      finalFilteredContent = ensureGroundedReply(finalFilteredContent);
      finalFilteredContent = cleanAssistantVisibleReply(finalFilteredContent);
      finalFilteredContent = sanitizeCommunityEvidenceClaims(finalFilteredContent);
      if (!finalFilteredContent) {
        finalFilteredContent = lastVisibleStreamContent || CHAT_ERROR_MESSAGES.noValidContent;
        finalFilteredContent = sanitizeCommunityEvidenceClaims(finalFilteredContent);
      }

      const typedVisibleContent = cleanAssistantVisibleReply(filterThinkingContent(assistantMessage));
      if (finalFilteredContent !== typedVisibleContent) {
        assistantMessage = finalFilteredContent;
        updateContent(finalFilteredContent);
      }
      nextTick(scrollToBottom);
      await queueQuickNoteConfirmation({
        rawText: userText,
        sessionIndex,
        requestSignal: requestController.signal,
        modelId: generationModel.id
      });

      // 对话结束后异步尝试“选择性记忆沉淀”，不阻塞主回答流程
      void captureMemoryFromConversation({
        sessionIndex,
        userText,
        assistantText: finalFilteredContent
      });
    } catch (error) {
      const targetSession = getSessionByIndex(sessionIndex);
      const currentContent = targetSession?.messages?.[messageIndex]?.content || '';

      if (isAbortError(error)) {
        logger.debug('boh-ai', 'Generation stopped');
        const filteredStoppedContent = cleanAssistantVisibleReply(filterThinkingContent(currentContent));
        updateContent(getAbortMessage(filteredStoppedContent, {
          timedOut: generationTimedOut,
          isDegenerate: isDegenerateAssistantReply(filteredStoppedContent)
        }));
      } else {
        logger.error('boh-ai', 'Generation error', error);
        updateContent(CHAT_ERROR_MESSAGES.generationFailed(safeErrorDetail(error)));
      }

      if (targetSession) {
        targetSession.isThinking = false;
      }
      stopThinkingTimer();
      nextTick(scrollToBottom);
    } finally {
      clearTimeout(generationTimeoutTimer);
      communitySearchActive.value = false;
      isStreamingGeneration.value = false;
      cleanupGenerationState(sessionIndex, requestController);
      scheduleSaveSessions();
    }
  };

  onScopeDispose(() => {
    clearTimeout(generationTimeoutTimer);
    clearTimeout(streamIdleTimer);
    stopThinkingTimer(); // 修复：清理 100ms interval 定时器
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    resetWebSearchLifecycle();
    communitySearchActive.value = false;
  });

  return {
    chatSessions,
    currentSessionIndex,
    inputMessage,
    isLoading,
    isThinking,
    thinkingTime,
    thinkingStatus,
    textareaRef,
    currentModeId,
    currentMode,
    currentModelId,
    currentModel,
    isCommandMode,
    isSearching,
    webSearchActive,
    communitySearchActive,
    isForumSearchEnabled,
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isTreeholeMemoryToggling,
    isQuickNoteEnabled,
    isPlanModeEnabled,
    isSharedMemoryEnabled,
    isKnowledgeBaseEnabled,
    agentClusterState,
    resetAgentClusterState,
    currentResponseStyleId,
    currentResponseStyle,
    responseStyleOptions,
    currentThinkingSpeedId,
    currentThinkingSpeed,
    thinkingSpeedOptions,
    pendingCloudReferenceConsent,
    pendingQuickNote,
    actionAuditLog,
    memoryCaptureTip,
    isRateLimited,
    rateLimitMessage,
    chatModes: computed(() => runtimeChatModes.value),
    messages,
    contextBudgetUsage,
    isCompressingContext,
    compressingSessionIndex,
    // 主动压缩：用户可手动触发上下文压缩，force=true 绕过阈值检查
    compressContextManually: (sessionIndex) => ensureContextCompression(
      sessionIndex ?? currentSessionIndex.value,
      { force: true }
    ),
    onScrollToBottom,
    // Auto 路由相关：让 UI 能看到本轮路由结果
    lastRoutedMode,
    startNewChat,
    clearCurrentSession,
    clearAllSessions,
    deleteSession,
    switchSession,
    sendMessage,
    toggleMemoryCapture,
    toggleTreeholeMemory,
    toggleQuickNoteMode,
    togglePlanMode,
    setResponseStyle,
    setThinkingSpeed,
    persistModeSetting,
    persistSharedMemorySetting,
    persistKnowledgeBaseSetting,
    updatePendingQuickNoteDraft,
    dismissQuickNoteDraft,
    confirmQuickNoteDraft,
    approveCloudReferenceConsent,
    rejectCloudReferenceConsent,
    activeActionDraft,
    updatePendingPostDraftFromUI,
    cancelPendingActionDraftFromUI,
    confirmPendingActionDraftFromUI,
    stopGeneration,
    clearCache,
    attachedContext,
    setAttachedContext,
    clearAttachedContext
  };
}
