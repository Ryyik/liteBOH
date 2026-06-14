import { ref, computed, nextTick, watch } from 'vue';
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
  detectBohAIResourceSearchIntent,
  getResourceTypeLabel,
  searchMinecraftResourcesForBohAI
} from '@/utils/api/resource-search-api.js';
import {
  isLikelyBohInternalFactualQuestion,
  isLikelyFactualQuestion,
  extractCitationIdsFromText,
  sanitizeUnsupportedCommunityEvidenceClaims,
  resolveKnowledgeRoutingPlanCore
} from '@/utils/ai-chat-grounding.js';
import { useAuthStore } from '@/stores/auth.js';
import { supabase } from '@/utils/supabase-client.js';
import {
  normalizeActionDecisionText,
  isPostDraftRequest
} from '@/utils/bohai-action-draft-intent.js';
import { isLikelyPersonalSupportRequest } from '@/utils/bohai-auto-router.js';
import { resolveAutoModeDecisionLocally } from '@/utils/bohai-auto-decision.js';
import {
  BOHAI_ACTION_IDS,
  BOHAI_CONNECTOR_IDS,
  buildBohAIConnectorActionNote,
  createBohAIConnector,
  runBohAIReadConnectors,
  summarizeBohAIConnectorResults
} from '@/utils/bohai-connectors.js';

import { createBohAIRetrievalTrace } from '@/utils/bohai-observability.js';
import { useActionDraft } from './useActionDraft.js';
import { useMemoryCapture } from './useMemoryCapture.js';
import {
  isCommunityQuestion,
  isCommunityCreativeRequest,
  shouldUseMemoryContext,
  summarizeThinkingSubject
} from './useIntentDetection.js';
import { SITE_OPERATION_MEMORY } from '@/data/ai-site-guide.js';
import { logger } from '@/utils/logger.js';
import {
  ACCURACY_PREFERRED_MODEL_ID,
  AUTO_ROUTER_MODEL_ID,
  BASE_SYSTEM_PROMPT,
  BLOCK_DURATION_MS,
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
  MAX_MESSAGES_PER_WINDOW,
  MAX_MESSAGES_TOTAL_TOKENS,
  MAX_PROMPT_EXTRA_CHARS,
  MAX_USER_INPUT_CHARS,
  MEMORY_CAPTURE_CONTEXT_ITEMS,
  MEMORY_CAPTURE_MIN_DIALOGUE_ITEMS,
  MEMORY_CAPTURE_MIN_USER_CHARS,
  MEMORY_MAX_CHUNKS,
  MEMORY_NOTICE_MAX_ITEMS,
  MIN_INTERVAL_MS,
  OPERATION_MAX_STEPS,
  PLAN_MODE_PROMPT_APPENDIX,
  RAG_PREFERRED_MODEL_ID,
  RATE_LIMIT_WINDOW_MS,
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
  USER_PRIVATE_SUMMARY_KEYWORDS,
  availableModels,
  chatModes
} from './chat-engine-config.js';

export { availableModels, chatModes } from './chat-engine-config.js';
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
  getStorableDialogueMessages,
  buildConversationSummaryFingerprint,
  buildHistoryMessagesWithCachedSummary,
  rankEvidenceContextBlocks,
  buildSharedEvidenceContext,
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
  isDegenerateStreamOutput
} from './bohai-engine-helpers.js';
import {
  runAgentClusterBranch,
  isAgentClusterMode,
  useAgentClusterState
} from './agent-cluster-helpers.js';
import {
  RESOURCE_FOLLOW_UP_PATTERN,
  RESOURCE_RECOMMENDATION_PATTERN,
  WEAK_RESOURCE_QUERY_PATTERN,
  KNOWN_RESOURCE_NAME_ALIASES,
  stripResourceQueryNoise as stripResourceQueryNoiseShared
} from '../agents/core/agent-patterns.js';

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
    startNewChat: _startNewChat, deleteSession, switchSession,
    setMemoryCaptureStatusMessage
  } = useConversationManager({
    scrollToBottom: _getScrollToBottom
  });

  const isStreamingGeneration = ref(false);

  watch(chatSessions, () => {
    if (isStreamingGeneration.value) return;
    scheduleSaveSessions();
  }, { deep: true });

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
  const thinkingTime = ref(0);
  const thinkingStatus = ref('');
  const thinkingTimer = ref(null);
  const abortController = ref(null);
  const runtimeAvailableModels = ref(availableModels.map((model) => ({ ...model })));
  const runtimeChatModes = ref(chatModes.map((mode) => ({ ...mode })));
  const runtimeGenerationProfiles = ref({});

  // Timer Logic
  const startThinkingTimer = () => {
    thinkingTime.value = 0;
    if (thinkingTimer.value) clearInterval(thinkingTimer.value);
    thinkingTimer.value = setInterval(() => {
      thinkingTime.value = parseFloat((thinkingTime.value + 0.1).toFixed(1));
    }, 100);
  };

  const stopThinkingTimer = () => {
    if (thinkingTimer.value) {
      clearInterval(thinkingTimer.value);
      thinkingTimer.value = null;
    }
  };

  const setThinkingStatus = (text) => {
    thinkingStatus.value = String(text || '').trim();
  };

  const clearThinkingStatus = () => {
    thinkingStatus.value = '';
  };

  const getGenerationProfile = (modeId, options = {}) => ({
    ...getDefaultGenerationProfile(modeId, options),
    ...(runtimeGenerationProfiles.value?.[modeId] || {})
  });

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

  const loadRuntimeModelConfig = async () => {
    const result = await listActiveBohaiModelConfigs();
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      if (result.error) {
        logger.warn('boh-ai', 'BOHAI 模型配置读取失败，使用默认配置', result.error);
      }
      return;
    }
    applyRuntimeModelConfig(buildBohaiRuntimeModels(result.data));
  };

  // --------------------------------------------------------------
  // AI 生成管线（从 useGenerationPipeline 导入）
  // --------------------------------------------------------------
  const {
    callModelInternal,
    callModelStream,
    _getSmartContext,
    filterThinkingContent,
    filterThinkingContentStream,
    flushThinkingBuffer,
    resetThinkingState,
    createSseLineParser,
    getFallbackModel,
    safeChunkToString
  } = useGenerationPipeline({ availableModels: runtimeAvailableModels.value, abortController });
  // --------------------------------------------------------------

  // 计算属性：当前会话的加载状态
  const isLoading = computed(() => chatSessions[currentSessionIndex.value]?.isLoading || false);
  const isThinking = computed(() => chatSessions[currentSessionIndex.value]?.isThinking || false);

  // --------------------------------------------------------------
  // useModelConfig — 模式/样式/设置
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
    cloudReferenceConsent,
    webSearchDisabledNoticeShownFor,
    getModelForModeId,
    togglePlanMode, setResponseStyle,
    persistMemoryCaptureSetting,
    persistTreeholeMemorySetting, persistQuickNoteSetting,
    persistSharedMemorySetting, persistKnowledgeBaseSetting
  } = useModelConfig({ availableModels: runtimeAvailableModels, chatModes: runtimeChatModes });
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
    buildVisibleRetrievalActionNote,
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
    createActionRegistry,
    runRegisteredAction,
    submitPostDraft,
    handlePendingActionDraftReply,
    tryStartActionDraftFromUserInput,
    tryStartPageCreationFromUserInput,
    generatePageHtmlFromUserIdea,
    extractHtmlBlock,
    callAIToGenerate
  } = actionDraft;

  // → isTreeholeCreateConfirm, isTreeholeCreateReject 已提取到 useIntentDetection.js
  // → _requestTreeholeCreationConfirmation, handlePendingTreeholeCreationReply 已提取到 useMemoryCapture.js


  // ============================================================
  // useMemoryCapture — 记忆/Cloud+/随手记逻辑
  // ============================================================
  const {
    toggleMemoryCapture,
    toggleTreeholeMemory,
    toggleQuickNoteMode,
    updatePendingQuickNoteDraft,
    dismissQuickNoteDraft,
    confirmQuickNoteDraft,
    requestCloudReferenceConsent,
    applyCloudReferenceConsent,
    approveCloudReferenceConsent,
    rejectCloudReferenceConsent,
    handlePendingTreeholeCreationReply,
    handlePendingCloudReferenceConsentReply,
    handlePendingSharedMemoryCaptureReply,
    requestSharedMemorySaveConfirmation,
    saveConfirmedAutoMemory,
    persistCloudReferenceConsent,
    shouldSuppressMemoryStatusEcho,
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

  // Rate Limiting
  const lastMessageTime = ref(0);
  const messageCount = ref(0);
  const windowStartTime = ref(Date.now());
  const isRateLimited = ref(false);
  const rateLimitMessage = ref('');

  const messages = computed(() => chatSessions[currentSessionIndex.value]?.messages || []);

  // 自动上下文压缩：当下一轮 BOH AI 实际可见的上下文达到 high/full 时，
  // 在 sendMessage 中主动调用 ensureContextCompression 让刷新出的摘要赶上本轮请求，
  // 这样 BOH AI 真正看到的就是压缩后的窗口。isCompressingContext 暴露给 UI 用于显示"压缩中"状态。
  // computeContextBudgetUsage / contextBudgetUsage / isCompressingContext / compressingSessionIndex
  // 已委托给 useConversationManager 管理。

  const ensureContextCompression = async (sessionIndex, { force = false } = {}) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;

    // 已在压缩同一会话：避免并发触发
    if (isCompressingContext.value && compressingSessionIndex.value === sessionIndex) {
      return true;
    }

    // 已有其他会话正在压缩中，跳过本次压缩以避免多余计算
    if (isCompressingContext.value) return false;

    // 非强制模式下才需要计算预算来判断是否需要压缩；force 模式直接压缩
    if (!force) {
      const usage = computeContextBudgetUsage(targetSession);
      if (usage.level !== 'high' && usage.level !== 'full') return false;
    }

    isCompressingContext.value = true;
    compressingSessionIndex.value = sessionIndex;
    try {
      await refreshConversationSummaryCache(sessionIndex);
    } catch (error) {
      logger.warn('boh-ai', 'Auto context compression failed', error);
    } finally {
      if (compressingSessionIndex.value === sessionIndex) {
        isCompressingContext.value = false;
        compressingSessionIndex.value = -1;
      }
    }
    return true;
  };

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

  const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

  // Session Management — 会话 CRUD 已委托给 useConversationManager
  const startNewChat = () => {
    _startNewChat();
    isCommandMode.value = false; // Reset modes
    isSearching.value = false;
    isForumSearchEnabled.value = false;
    isSharedMemoryEnabled.value = false;
    isKnowledgeBaseEnabled.value = false;
    currentModeId.value = BOH_DEFAULT_MODE_ID;
    // Auto 路由相关状态重置
    lastRoutedMode.value = '';
  };

  const stopGeneration = () => {
    const activeIndex = activeGenerationSessionIndex.value;

    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
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

  const refreshConversationSummaryCache = async (sessionIndex, requestSignal = undefined) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return;

    const dialogueMessages = getStorableDialogueMessages(targetSession.messages);
    if (dialogueMessages.length < CONVERSATION_SUMMARY_MIN_MESSAGES) return;

    const fingerprint = buildConversationSummaryFingerprint(targetSession.messages);
    if (!fingerprint) return;
    if (
      targetSession.contextSummary?.version === CONVERSATION_SUMMARY_STORAGE_VERSION
      && targetSession.contextSummary?.fingerprint === fingerprint
      && normalizePromptLine(targetSession.contextSummary?.content, 20)
    ) {
      return;
    }

    const olderMessages = dialogueMessages.slice(0, -CONVERSATION_SUMMARY_RECENT_MESSAGES);
    if (olderMessages.length < 4) return;

    // C6 fix: 长会话（50+）二层摘要 — 将已有摘要压缩为"摘要的摘要"，再追加新摘要
    const existingSummary = normalizePromptLine(targetSession.contextSummary?.content, 20);
    let summaryPrompt;
    if (existingSummary && dialogueMessages.length > CONVERSATION_SUMMARY_TWO_LEVEL_THRESHOLD) {
      // 二层摘要：已有摘要 + 中间层消息
      const middleMessages = olderMessages.slice(-Math.floor(olderMessages.length / 2));
      summaryPrompt = [
        '请把以下 BOH AI 对话历史和已有摘要合并压缩成一段可复用上下文摘要。',
        '要求：',
        '- 最多 500 中文字。',
        '- 保留用户目标、偏好、已确认事实、当前任务状态。',
        '- 删除寒暄、重复内容、无效报错和已解决细节。',
        '- 不要添加原文没有的信息。',
        '',
        `【已有摘要】${existingSummary}`,
        '',
        middleMessages.map((message) => `${message.role}: ${message.content}`).join('\n')
      ].join('\n');
    } else {
      summaryPrompt = [
        '请把以下 BOH AI 对话历史压缩成一段可复用上下文摘要。',
        '要求：',
        '- 最多 500 中文字。',
        '- 保留用户目标、偏好、已确认事实、当前任务状态。',
        '- 删除寒暄、重复内容、无效报错和已解决细节。',
        '- 不要添加原文没有的信息。',
        '',
        olderMessages.map((message) => `${message.role}: ${message.content}`).join('\n')
      ].join('\n');
    }

    const summaryModel = runtimeAvailableModels.value.find(m => m.id === 'Qwen/Qwen2.5-7B-Instruct') || runtimeAvailableModels.value[0];
    if (!summaryModel?.id) return;
    const summarySignal = requestSignal || (typeof AbortController !== 'undefined' ? new AbortController().signal : undefined);

    try {
      const summary = await callModelInternal(
        summaryModel.id,
        summaryPrompt,
        '你是 BOH AI 的本地对话摘要器，只输出摘要正文。',
        [],
        summarySignal,
        0,
        { max_tokens: 1100, temperature: 0.08, top_p: 0.55, frequency_penalty: 0.05 }
      );

      const latestSession = getSessionByIndex(sessionIndex);
      if (!latestSession) return;
      latestSession.contextSummary = {
        version: CONVERSATION_SUMMARY_STORAGE_VERSION,
        fingerprint,
        content: normalizePromptLine(filterThinkingContent(summary), CONVERSATION_SUMMARY_MAX_CHARS),
        updatedAt: Date.now()
      };
      scheduleSaveSessions();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        logger.warn('boh-ai', 'Conversation summary refresh failed', error);
      }
    }
  };

  const buildResourceSearchReply = (searchPayload = {}) => {
    const results = Array.isArray(searchPayload.results) ? searchPayload.results : [];
    const typeLabel = searchPayload.typeLabel || getResourceTypeLabel(searchPayload.type);
    const keywordText = Array.isArray(searchPayload.displayKeywords) && searchPayload.displayKeywords.length > 0
      ? searchPayload.displayKeywords.slice(0, 5).join('、')
      : (searchPayload.query || (searchPayload.isGenericRecommendation ? `热门${typeLabel === '全部' ? '资源' : typeLabel}` : '这个关键词'));
    const filters = [
      typeLabel && searchPayload.type !== 'all' ? typeLabel : '',
      searchPayload.loader ? searchPayload.loader : '',
      searchPayload.version ? searchPayload.version : ''
    ].filter(Boolean);
    const filterText = filters.length > 0 ? `（${filters.join(' / ')}）` : '';
    const searchIntro = searchPayload.isGenericRecommendation
      ? `我按热门和下载量帮你筛了一批${typeLabel === '全部' ? '资源' : typeLabel}${filterText}。`
      : `我先理解了你的需求，提取关键词：${keywordText}${filterText}。`;
    if (results.length === 0) {
      return searchPayload.isGenericRecommendation
        ? `我按热门和下载量搜索了${typeLabel === '全部' ? '资源' : typeLabel}${filterText}，但资源库暂时没有返回结果。可以换个类型、版本或加载器再试。`
        : `我理解你的需求后提取了关键词：${keywordText}${filterText}。但资源库里暂时没有找到匹配结果，可以换个描述，或放宽版本/加载器再试。`;
    }

    return [
      searchIntro,
      `在资源库里找到了 ${results.length} 个相关资源。`,
      '',
      '下面已经展示前几条结果，也可以点击“查看资源列表”打开完整面板。'
    ].join('\n');
  };

  // 资源查询相关正则与别名已迁移到 agents/core/agent-patterns.js 统一管理，
  // 这里直接使用顶部 import 的 RESOURCE_FOLLOW_UP_PATTERN /
  // RESOURCE_RECOMMENDATION_PATTERN / WEAK_RESOURCE_QUERY_PATTERN / KNOWN_RESOURCE_NAME_ALIASES。
  const stripResourceQueryNoise = (value = '') => stripResourceQueryNoiseShared(normalizePromptLine, value);

  const isWeakResourceQuery = (value = '') => {
    const raw = normalizePromptLine(value, 80).toLowerCase();
    if (!raw) return true;
    const stripped = stripResourceQueryNoise(raw);
    return !stripped || WEAK_RESOURCE_QUERY_PATTERN.test(raw) || WEAK_RESOURCE_QUERY_PATTERN.test(stripped);
  };

  const normalizeResourceSearchQueries = (queries = []) => {
    const source = Array.isArray(queries) ? queries : [queries];
    return [...new Set(
      source
        .map((item) => normalizePromptLine(item, 80).toLowerCase())
        .map((item) => stripResourceQueryNoise(item))
        .filter(Boolean)
        .filter((item) => !isWeakResourceQuery(item))
        .filter((item) => item.length >= 2)
    )].slice(0, 5);
  };

  const normalizeResourceDisplayKeywords = (keywords = []) => {
    const source = Array.isArray(keywords) ? keywords : [keywords];
    return [...new Set(
      source
        .map((item) => normalizePromptLine(item, 40))
        .filter(Boolean)
        .filter((item) => /^热门/.test(item) || !isWeakResourceQuery(item))
    )].slice(0, 5);
  };

  const getKnownResourceNameQueries = (userText = '') => {
    const source = String(userText || '');
    const terms = [];
    KNOWN_RESOURCE_NAME_ALIASES.forEach((item) => {
      if (item.pattern.test(source)) terms.push(...item.terms);
    });
    return normalizeResourceSearchQueries(terms);
  };

  const getResourceTopicQueryOverride = (userText = '') => {
    const source = String(userText || '');
    const knownResourceQueries = getKnownResourceNameQueries(source);
    if (knownResourceQueries.length > 0) return knownResourceQueries;
    const terms = [];
    const add = (...items) => terms.push(...items);
    if (/宝可梦|神奇宝贝|精灵宝可梦|口袋妖怪|pokemon|pixelmon|cobblemon/i.test(source)) add('cobblemon', 'pixelmon', 'pokemon');
    if (/家具|家居|沙发|椅子|桌子|柜子/i.test(source)) add('furniture', 'decoration');
    if (/优化|性能|帧数|卡顿|流畅|低配|轻量/i.test(source)) add('performance', 'optimization');
    if (/小地图|地图导航|导航/i.test(source)) add('minimap', 'map');
    if (/科技|工业|机械|自动化/i.test(source)) add('tech', 'automation');
    if (/魔法|法术/i.test(source)) add('magic');
    if (/冒险|探索|地牢/i.test(source)) add('adventure', 'exploration', 'dungeon');
    if (/建筑|建造|装饰|室内|摆件/i.test(source)) add('building', 'decoration');
    if (/农业|种田|食物|料理/i.test(source)) add('farming', 'food');
    if (/生存|养老/i.test(source)) add('survival');
    if (/服务端|服务器/i.test(source)) add('server');
    if (/菜单|物品栏|背包|库存/i.test(source)) add('inventory', 'menu');
    if (/高清|真实|写实/i.test(source)) add('realistic', 'high resolution');
    return normalizeResourceSearchQueries(terms);
  };

  const getGenericResourceDisplayKeywords = (type = 'all') => {
    const label = getResourceTypeLabel(type);
    return [`热门${label === '全部' ? '资源' : label}`];
  };

  const isGenericResourceRecommendation = (userText = '', intent = {}) => {
    const source = String(userText || '');
    if (!RESOURCE_RECOMMENDATION_PATTERN.test(source)) return false;
    if (getResourceTopicQueryOverride(source).length > 0) return false;
    if (intent.type && intent.type !== 'all') return true;
    return /(资源|东西|mod|模组|整合包|材质包|资源包|光影|minecraft|我的世界|mc)/i.test(source);
  };

  const finalizeResourceSearchPlan = (userText = '', intent = {}, plan = {}) => {
    const safeIntentType = ['all', 'mod', 'modpack', 'resourcepack', 'shader'].includes(intent.type) ? intent.type : 'all';
    const safePlanType = ['all', 'mod', 'modpack', 'resourcepack', 'shader'].includes(plan.type) ? plan.type : 'all';
    const type = safeIntentType !== 'all' ? safeIntentType : safePlanType;
    const topicQueries = getResourceTopicQueryOverride(userText);
    const planQueries = normalizeResourceSearchQueries(plan.searchQueries);
    const genericRecommendation = topicQueries.length === 0
      && !plan.inheritedResourceTopic
      && (
        isGenericResourceRecommendation(userText, { ...intent, type })
        || (planQueries.length === 0 && Boolean(plan.isGenericRecommendation))
      );
    const searchQueries = topicQueries.length > 0
      ? topicQueries
      : (genericRecommendation ? [] : planQueries);
    const displayKeywords = topicQueries.length > 0
      ? topicQueries
      : (
        genericRecommendation
          ? getGenericResourceDisplayKeywords(type)
          : (
            normalizeResourceDisplayKeywords(plan.displayKeywords).length > 0
              ? normalizeResourceDisplayKeywords(plan.displayKeywords)
              : searchQueries
          )
      );

    return {
      ...plan,
      type,
      loader: normalizePromptLine(plan.loader, 24) || normalizePromptLine(intent.loader, 24),
      version: normalizePromptLine(plan.version, 24) || normalizePromptLine(intent.version, 24),
      searchQueries,
      displayKeywords,
      sort: genericRecommendation ? 'downloads' : (plan.sort === 'downloads' ? 'downloads' : 'relevance'),
      isGenericRecommendation: genericRecommendation,
      reason: genericRecommendation
        ? '按资源类型进行热门推荐。'
        : (plan.reason || '已根据资源类型和中文需求提取关键词。')
    };
  };

  const createFallbackResourceSearchPlan = (userText = '', intent = {}) => {
    const fallbackQuery = normalizePromptLine(intent.query, 120) || normalizePromptLine(userText, 120);
    const topicQueries = getResourceTopicQueryOverride(userText);
    const fallbackQueries = normalizeResourceSearchQueries([
      ...topicQueries,
      fallbackQuery
    ]);
    const isGenericRecommendation = fallbackQueries.length === 0 && isGenericResourceRecommendation(userText, intent);
    return {
      type: intent.type || 'all',
      loader: intent.loader || '',
      version: intent.version || '',
      searchQueries: fallbackQueries,
      displayKeywords: fallbackQueries.length > 0 ? fallbackQueries : getGenericResourceDisplayKeywords(intent.type || 'all'),
      reason: isGenericRecommendation ? '按资源类型进行热门推荐。' : '已根据资源类型和中文需求提取关键词。',
      sort: isGenericRecommendation ? 'downloads' : 'relevance',
      isGenericRecommendation,
      usedModel: false
    };
  };

  const getResourceDisplayKeywordOverride = (userText = '') => {
    return getResourceTopicQueryOverride(userText);
  };

  const getLastResourceSearchPayload = (sessionIndex, beforeMessageIndex = Infinity) => {
    const session = getSessionByIndex(sessionIndex);
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    const maxIndex = Math.min(messages.length - 1, Number.isFinite(beforeMessageIndex) ? beforeMessageIndex - 1 : messages.length - 1);
    for (let index = maxIndex; index >= 0; index -= 1) {
      const message = messages[index];
      const payload = message?.role === 'assistant' && message?.meta?.kind === 'resource_search_results'
        ? message.meta.resourceSearch
        : null;
      if (payload && typeof payload === 'object') return payload;
    }
    return null;
  };

  const shouldInheritPreviousResourceTopic = (userText = '', plan = {}) => {
    if (!RESOURCE_FOLLOW_UP_PATTERN.test(String(userText || ''))) return false;
    return normalizeResourceSearchQueries(plan.searchQueries).length === 0
      || Boolean(plan.isGenericRecommendation);
  };

  const resolveResourceSearchPlanWithModel = async (userText, intent, requestSignal = undefined) => {
    const fallback = createFallbackResourceSearchPlan(userText, intent);
    const plannerModel = getModelForModeId('fast')
      || runtimeAvailableModels.value.find((item) => item.id === AUTO_ROUTER_MODEL_ID)
      || runtimeAvailableModels.value[0];
    if (!plannerModel?.id) return fallback;

    // 合并外部 signal 与 8s 超时，替代手动 setTimeout + AbortController
    const PLANNER_TIMEOUT_MS = 8000;
    const combinedSignal = requestSignal
      ? (typeof AbortSignal.any === 'function'
          ? AbortSignal.any([requestSignal, AbortSignal.timeout(PLANNER_TIMEOUT_MS)])
          : requestSignal)
      : AbortSignal.timeout(PLANNER_TIMEOUT_MS);

    try {
      const raw = await callModelInternal(
        plannerModel.id,
        [
          '请把用户的 Minecraft 资源搜索需求改写成适合 Modrinth / CurseForge 等资源库检索的英文关键词。',
          '只输出 JSON，不要解释，不要 Markdown。',
          '',
          '字段：',
          '- type: "all" | "mod" | "modpack" | "resourcepack" | "shader"',
          '- loader: "fabric" | "forge" | "neoforge" | "quilt" | ""',
          '- version: 例如 "1.21.1"，没有就空字符串',
          '- searchQueries: string[]，0 到 5 个英文检索词，按优先级排序，短词优先，不要把中文原句直接翻译成无效长句',
          '- displayKeywords: string[]，给用户看的中文/英文关键词，最多 5 个',
          '- targetKind: "exact_resource" | "category" | "generic_recommendation"',
          '- normalizedTarget: string，用户真正想找的资源名或类别，例如 "Botania"、"magic mods"、"popular modpacks"',
          '- reason: string，一句话说明你提取了什么方向，最多 40 字',
          '- sort: "relevance" | "downloads"，泛推荐用 downloads，明确主题用 relevance',
          '',
          '规则：',
          '0. 先判断用户说的是具体 Mod 名还是泛类别。具体 Mod 名必须映射到英文项目名/常用 slug，不要降级成类别词。',
          '1. “我要家具mod/家具模组/家居”应输出 furniture、decoration、furnish 等关键词，而不是搜索“我要家具”。',
          '2. “宝可梦/神奇宝贝/口袋妖怪/Pixelmon/Cobblemon”必须输出 cobblemon、pixelmon、pokemon，不要输出“找宝可梦/宝可梦整合包”。',
          '3. “植物魔法”是具体 Mod Botania，必须输出 botania；不能只输出 magic。',
          "4. 常见中文名映射：暮色森林=twilight forest，匠魂=tinkers construct，机械动力=create，应用能源=applied energistics 2，农夫乐事=farmer's delight，通用机械=mekanism。",
          '5. “优化/帧数/低配”应输出 performance、optimization 等关键词。',
          '6. “小地图”如果是泛需求可输出 minimap、map；如果提到 Xaero 输出 xaero minimap。',
          '7. 如果用户说 Mod，就 type=mod；整合包 type=modpack；材质 type=resourcepack；光影 type=shader。',
          '8. searchQueries 不要包含 mod、modpack、minecraft、版本号或加载器，类型/版本/加载器走字段。',
          '9. 如果用户只是说“推荐一点整合包/推荐一些 mod/来点材质”这类泛推荐，没有具体主题，searchQueries 必须是 []，sort 必须是 downloads，displayKeywords 用“热门整合包/热门Mod”等。',
          '',
          `本地初判：${JSON.stringify({
            type: intent.type,
            loader: intent.loader,
            version: intent.version,
            query: intent.query
          })}`,
          `用户消息：${truncateText(userText, 500)}`
        ].join('\n'),
        '你是 BOH AI 的 Minecraft 资源搜索规划器。先判断用户真正想找什么，再把它改写成资源库检索词。你只返回严格 JSON。',
        [],
        combinedSignal,
        0,
        { max_tokens: 520, temperature: 0.05, top_p: 0.45, frequency_penalty: 0.02 }
      );
      // B10 fix: _safeJsonParse 未定义，会崩溃。改为内联安全解析。
      let parsed = {};
      try { parsed = JSON.parse(String(raw || '').trim()); } catch (_) { /* 解析失败使用空对象兜底 */ }
      const safeType = ['all', 'mod', 'modpack', 'resourcepack', 'shader'].includes(parsed?.type) ? parsed.type : fallback.type;
      const parsedSearchQueries = normalizeResourceSearchQueries(parsed?.searchQueries);
      const searchQueries = parsedSearchQueries.length > 0 ? parsedSearchQueries : fallback.searchQueries;
      const displayOverride = normalizeResourceDisplayKeywords(getResourceDisplayKeywordOverride(userText));
      const isGenericRecommendation = searchQueries.length === 0 && (
        Boolean(fallback.isGenericRecommendation)
        || normalizeResourceDisplayKeywords(parsed?.displayKeywords).some((item) => /^热门/.test(item))
      );
      const parsedDisplayKeywords = normalizeResourceDisplayKeywords(parsed?.displayKeywords);
      return {
        type: safeType || fallback.type,
        loader: normalizePromptLine(parsed?.loader, 24) || fallback.loader,
        version: normalizePromptLine(parsed?.version, 24) || fallback.version,
        searchQueries,
        displayKeywords: displayOverride.length > 0
          ? displayOverride
          : parsedDisplayKeywords.length > 0
            ? parsedDisplayKeywords
            : (searchQueries.length > 0 ? searchQueries : getGenericResourceDisplayKeywords(safeType || fallback.type)),
        reason: normalizePromptLine(parsed?.reason, 80) || fallback.reason,
        targetKind: ['exact_resource', 'category', 'generic_recommendation'].includes(parsed?.targetKind) ? parsed.targetKind : '',
        normalizedTarget: normalizePromptLine(parsed?.normalizedTarget, 80),
        sort: parsed?.sort === 'downloads' || fallback.sort === 'downloads' ? 'downloads' : 'relevance',
        isGenericRecommendation,
        usedModel: true
      };
    } catch (error) {
      if (error?.name === 'AbortError' && requestSignal?.aborted) throw error;
      logger.warn('boh-ai', 'Resource search planning failed, using fallback', error);
      return fallback;
    }
  };

  const searchResourcesByPlan = async (plan = {}, requestSignal = undefined) => {
    const queries = normalizeResourceSearchQueries(plan.searchQueries);
    const effectiveQueries = queries.length > 0 ? queries : [''];
    const sortMode = plan.sort === 'downloads' || queries.length === 0 ? 'downloads' : 'relevance';
    const seen = new Set();
    const results = [];
    const searchedQueries = [];
    let totalHits = 0;

    for (const query of effectiveQueries) {
      if (requestSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const result = await searchMinecraftResourcesForBohAI({
        query,
        type: plan.type || 'all',
        loader: plan.loader || '',
        version: plan.version || '',
        limit: 8,
        sort: sortMode,
        signal: requestSignal
      });
      searchedQueries.push(query);
      totalHits += Number(result.totalHits || 0);
      for (const item of result.results || []) {
        const key = item.project_id || `${item.source}:${item.slug || item.title}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        results.push({ ...item, matchedQuery: query });
        if (results.length >= 12) break;
      }
      if (results.length >= 12) break;
    }

    return {
      ok: true,
      query: queries[0] || '',
      queries,
      searchedQueries: searchedQueries.filter(Boolean),
      type: plan.type || 'all',
      typeLabel: getResourceTypeLabel(plan.type || 'all'),
      version: normalizePromptLine(plan.version, 24),
      loader: normalizePromptLine(plan.loader, 24),
      totalHits,
      results,
      sort: sortMode,
      isGenericRecommendation: queries.length === 0 || Boolean(plan.isGenericRecommendation)
    };
  };

  const handleResourceSearchRequest = async (rawUserText = '') => {
    const userText = String(rawUserText || '').trim();
    const sessionIndex = currentSessionIndex.value;
    const session = getSessionByIndex(sessionIndex);
    if (!session) return false;
    let intent = detectBohAIResourceSearchIntent(userText);
    if (!intent.matched && RESOURCE_RECOMMENDATION_PATTERN.test(userText)) {
      const previousResourceSearch = getLastResourceSearchPayload(sessionIndex);
      if (previousResourceSearch) {
        intent = {
          matched: true,
          query: '',
          type: previousResourceSearch.type || 'all',
          loader: previousResourceSearch.loader || '',
          version: previousResourceSearch.version || ''
        };
      }
    }
    if (!intent.matched) return false;

    appendUserMessageWithTitle(sessionIndex, userText);
    resetComposerInput();
    scrollToBottom(true);

    session.isLoading = true;
    session.isThinking = true;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();
    const requestController = new AbortController();
    abortController.value = requestController;
    session.messages.push({
      role: 'assistant',
      content: ''
    });
    const messageIndex = session.messages.length - 1;
    setThinkingStatus('意图理解中...');
    await nextTick();
    scrollToBottom();

    try {
      let plan = finalizeResourceSearchPlan(
        userText,
        intent,
        await resolveResourceSearchPlanWithModel(userText, intent, requestController.signal)
      );
      const previousResourceSearch = getLastResourceSearchPayload(sessionIndex, messageIndex);
      if (previousResourceSearch && shouldInheritPreviousResourceTopic(userText, plan)) {
        const previousQueries = normalizeResourceSearchQueries(previousResourceSearch.displayKeywords).length > 0
          ? normalizeResourceSearchQueries(previousResourceSearch.displayKeywords)
          : normalizeResourceSearchQueries(previousResourceSearch.queries || previousResourceSearch.query);
        if (previousQueries.length > 0) {
          plan.searchQueries = previousQueries;
          plan.displayKeywords = previousQueries;
          plan.sort = 'relevance';
          plan.isGenericRecommendation = false;
          plan.inheritedResourceTopic = true;
          plan.reason = '沿用上一轮资源主题继续搜索。';
        }
      }
      plan = finalizeResourceSearchPlan(userText, intent, plan);
      const plannedKeywords = normalizeResourceDisplayKeywords(plan.displayKeywords).join('、') || normalizeResourceSearchQueries(plan.searchQueries).join('、');
      setThinkingStatus(plan.isGenericRecommendation
        ? `正在搜索热门${getResourceTypeLabel(plan.type || intent.type || 'all')}...`
        : `正在搜索资源：${plannedKeywords || intent.query || userText}`);

      const searchPayload = await searchResourcesByPlan(plan, requestController.signal);
      const payload = {
        ...searchPayload,
        rawQuery: userText,
        displayKeywords: normalizeResourceDisplayKeywords(plan.displayKeywords).length > 0
          ? normalizeResourceDisplayKeywords(plan.displayKeywords)
          : (searchPayload.isGenericRecommendation ? getGenericResourceDisplayKeywords(plan.type || 'all') : normalizeResourceSearchQueries(plan.searchQueries)),
        plannerReason: plan.reason || '',
        usedModelPlanner: Boolean(plan.usedModel),
        isGenericRecommendation: Boolean(searchPayload.isGenericRecommendation || plan.isGenericRecommendation),
        requestedAt: Date.now()
      };
      if (payload.results.length === 0 && intent.query && !payload.queries.includes(intent.query)) {
        const fallbackPayload = await searchResourcesByPlan({
          ...plan,
          searchQueries: [intent.query]
        }, requestController.signal);
        payload.results = fallbackPayload.results;
        payload.totalHits += Number(fallbackPayload.totalHits || 0);
        payload.searchedQueries = [...new Set([...(payload.searchedQueries || []), ...(fallbackPayload.searchedQueries || [])])];
      }
      if (payload.results.length === 0 && payload.isGenericRecommendation) {
        const popularPayload = await searchResourcesByPlan({
          ...plan,
          searchQueries: [],
          sort: 'downloads'
        }, requestController.signal);
        payload.results = popularPayload.results;
        payload.totalHits += Number(popularPayload.totalHits || 0);
        payload.searchedQueries = [...new Set([...(payload.searchedQueries || []), ...(popularPayload.searchedQueries || [])])];
      }
      payload.query = payload.searchedQueries?.[0] || payload.query;
      payload.queries = payload.searchedQueries || payload.queries;
      payload.typeLabel = getResourceTypeLabel(payload.type);

      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession?.messages?.[messageIndex]) return true;
      targetSession.messages[messageIndex].content = buildResourceSearchReply(payload);
      mergeAssistantMessageMeta(sessionIndex, messageIndex, {
        kind: 'resource_search_results',
        resourceSearch: payload
      });
      nextTick(scrollToBottom);
      void refreshConversationSummaryCache(sessionIndex);
      return true;
    } catch (error) {
      const targetSession = getSessionByIndex(sessionIndex);
      if (error?.name === 'AbortError') {
        if (targetSession?.messages?.[messageIndex]) {
          targetSession.messages[messageIndex].content = '资源搜索已停止。';
        }
        return true;
      }
      logger.warn('boh-ai', 'Resource search failed', error);
      if (targetSession?.messages?.[messageIndex]) {
        targetSession.messages[messageIndex].content = `资源搜索暂时失败：${error?.message || '网络请求异常'}。你也可以先打开资源中心手动搜索。`;
        mergeAssistantMessageMeta(sessionIndex, messageIndex, {
          kind: 'resource_search_results',
          resourceSearch: {
            ok: false,
            query: intent.query,
            rawQuery: userText,
            type: intent.type,
            typeLabel: getResourceTypeLabel(intent.type),
            loader: intent.loader,
            version: intent.version,
            totalHits: 0,
            results: [],
            errorMessage: error?.message || '网络请求异常'
          }
        });
      }
      return true;
    } finally {
      cleanupGenerationState(sessionIndex, requestController);
    }
  };

  const runSimpleChatTurn = async ({ sessionIndex, session, userText }) => {
    appendUserMessageWithTitle(sessionIndex, userText);
    resetComposerInput();
    scrollToBottom(true);
    await ensureContextCompression(sessionIndex);

    session.isLoading = true;
    session.isThinking = true;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();

    const requestController = new AbortController();
    abortController.value = requestController;
    const targetSessionRef = session;
    const assistantMessage = { role: 'assistant', content: '' };
    session.messages.push(assistantMessage);
    const messageIndex = session.messages.length - 1;
    await nextTick();
    scrollToBottom();

    const updateContent = (text) => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession || targetSession !== targetSessionRef) return;
      if (!targetSession.messages.includes(assistantMessage)) return;
      assistantMessage.content = String(text || '');
      scrollToBottom();
    };

    try {
      const activeModeId = runtimeChatModes.value.some((mode) => mode.id === currentModeId.value)
        ? currentModeId.value
        : BOH_DEFAULT_MODE_ID;
      lastRoutedMode.value = activeModeId;
      mergeAssistantMessageMeta(sessionIndex, messageIndex, { routedMode: activeModeId });

      let webEvidenceContext = '';
      if (isSearching.value) {
        setThinkingStatus('正在联网搜索...');
        const WEB_SEARCH_TIMEOUT_MS = 30_000;
        const webSearchSignal = typeof AbortSignal.any === 'function'
          ? AbortSignal.any([requestController.signal, AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS)])
          : requestController.signal;
        const webSearchResult = await searchWebForPrompt(userText, webSearchSignal).catch((error) => ({
          ok: false,
          disabled: false,
          count: 0,
          context: '',
          results: [],
          error,
          message: error?.message || '未知错误'
        }));

        if (webSearchResult?.disabled) {
          isSearching.value = false;
          if (!webSearchDisabledNoticeShownFor.has(sessionIndex)) {
            webSearchDisabledNoticeShownFor.add(sessionIndex);
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索未配置，已跳过外部检索。']);
          }
        } else if (webSearchResult?.ok) {
          const results = Array.isArray(webSearchResult.results) ? webSearchResult.results : [];
          webEvidenceContext = truncateText(webSearchResult.context || '', MAX_PROMPT_EXTRA_CHARS);
          updateAssistantActionNotes(
            sessionIndex,
            messageIndex,
            [results.length > 0 ? `搜索了 ${results.length} 个内容。` : '搜索了 0 个内容。']
          );
        } else {
          if (webSearchResult?.error && webSearchResult.error?.name !== 'AbortError') {
            logger.error('boh-ai', 'Search failed', webSearchResult.error);
          }
          updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索失败，已尝试继续回答。']);
        }
      }

      setThinkingStatus('正在生成回答...');
      const generationModel = getModelForModeId(activeModeId, { userText })
        || currentModel.value
        || runtimeAvailableModels.value[0];
      if (!generationModel?.id) {
        throw new Error('未找到可用模型配置');
      }

      const modeAppendix = String(
        runtimeChatModes.value.find((mode) => mode.id === activeModeId)?.promptAppendix || ''
      ).trim();
      const systemPromptContent = [
        BASE_SYSTEM_PROMPT,
        modeAppendix,
        '当前 BOH AI 只保留通用对话、五种模式选择与用户主动开启的联网搜索。不要执行站内业务动作，不要创建帖子/页面/笔记，不要读取论坛、Cloud+、公共记忆、私域数据或资源库。一次用户输入只输出一条完整回答。'
      ].filter(Boolean).join('\n');

      const historyMessages = buildHistoryMessagesWithCachedSummary({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages.slice(0, -2) : []
      }, {
        maxChars: MAX_HISTORY_CONTEXT_CHARS,
        maxMessages: MAX_CONTEXT_MESSAGES,
        maxPerMessage: MAX_HISTORY_MESSAGE_CHARS
      });
      const prompt = webEvidenceContext
        ? [
          truncateText(userText, MAX_USER_INPUT_CHARS),
          '',
          '【联网搜索结果】',
          webEvidenceContext,
          '',
          '请结合搜索结果回答；如果搜索结果不足，请明确说明不确定。'
        ].join('\n')
        : truncateText(userText, MAX_USER_INPUT_CHARS);
      const generationProfile = getGenerationProfile(activeModeId, {
        factualQuestion: Boolean(webEvidenceContext),
        operationQuestion: false
      });

      let streamedReply = '';
      await callModelStream(
        generationModel.id,
        prompt,
        systemPromptContent,
        historyMessages,
        (chunk) => {
          streamedReply += chunk;
          updateContent(streamedReply);
        },
        generationProfile,
        requestController.signal
      );
      let finalContent = cleanAssistantVisibleReply(filterThinkingContent(streamedReply));
      if (isDegenerateAssistantReply(finalContent)) {
        finalContent = '回答内容出现异常，请重新发送一次。';
      }
      const safeFinalContent = finalContent || '我暂时没有生成到有效内容，请再试一次。';
      if (safeFinalContent !== streamedReply) {
        updateContent(safeFinalContent);
      }
      void refreshConversationSummaryCache(sessionIndex);
    } catch (error) {
      if (error?.name === 'AbortError') {
        const targetSession = getSessionByIndex(sessionIndex);
        const currentContent = targetSession === targetSessionRef && targetSession?.messages?.includes(assistantMessage)
          ? assistantMessage.content
          : '';
        updateContent(currentContent ? `${currentContent}\n\n（已停止生成）` : '已停止生成。');
      } else {
        logger.error('boh-ai', 'Simple generation error', error);
        updateContent(`服务暂时繁忙，请稍后重试。`);
      }
    } finally {
      cleanupGenerationState(sessionIndex, requestController);
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

  const sendMessage = async () => {
    if (!inputMessage.value.trim() || isLoading.value || abortController.value) return;

    const now = Date.now();

    if (isRateLimited.value) {
      if (now - lastMessageTime.value > BLOCK_DURATION_MS) {
        isRateLimited.value = false;
        messageCount.value = 0;
        windowStartTime.value = now;
        rateLimitMessage.value = '';
      } else {
        const remainingSeconds = Math.ceil((lastMessageTime.value + BLOCK_DURATION_MS - now) / 1000);
        rateLimitMessage.value = `发送频率过高，请休息 ${remainingSeconds} 秒后再试。`;
        return;
      }
    }

    if (now - lastMessageTime.value < MIN_INTERVAL_MS) {
      rateLimitMessage.value = '请勿频繁发送消息，请稍后再试。';
      setTimeout(() => {
        if (!isRateLimited.value) rateLimitMessage.value = '';
      }, 2000);
      return;
    }

    if (now - windowStartTime.value > RATE_LIMIT_WINDOW_MS) {
      messageCount.value = 1;
      windowStartTime.value = now;
    } else {
      messageCount.value++;
    }

    if (messageCount.value > MAX_MESSAGES_PER_WINDOW) {
      isRateLimited.value = true;
      lastMessageTime.value = now;
      rateLimitMessage.value = `发送频率过高，请休息 1 分钟后再试。`;
      return;
    }

    lastMessageTime.value = now;
    rateLimitMessage.value = '';

    if (isCommandMode.value) {
      await handleCommandModeGeneration();
      return;
    }

    const sessionIndex = currentSessionIndex.value;
    const session = getSessionByIndex(sessionIndex);
    if (!session) return;
    const userText = inputMessage.value.trim();

    if (await tryStartActionDraftFromUserInput(userText, sessionIndex)) return;
    if (await tryStartPageCreationFromUserInput(userText, sessionIndex)) return;
    if (await handleResourceSearchRequest(userText)) return;

    if (isAgentClusterMode(currentModeId.value)) {
      appendUserMessageWithTitle(sessionIndex, userText);
      resetComposerInput();
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
            if (error?.name === 'AbortError') {
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
        if (clusterError?.name !== 'AbortError') {
          logger.error('boh-ai', 'Agent cluster branch failed', clusterError);
        }
        applyAgentClusterEvent({
          type: clusterError?.name === 'AbortError' ? 'cancelled' : 'error',
          payload: { message: clusterError?.message || String(clusterError || '') },
          createdAt: Date.now()
        });
        const target = getSessionByIndex(sessionIndex);
        if (target?.messages?.[clusterMessageIndex]) {
          target.messages[clusterMessageIndex].content = clusterError?.name === 'AbortError'
            ? '已停止生成。'
            : `多任务处理失败，请重试。`;
        }
        return;
      } finally {
        session.isLoading = false;
        session.isThinking = false;
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
    scrollToBottom(true);

    session.isLoading = true;
    session.isThinking = true;
    activeGenerationSessionIndex.value = sessionIndex;
    // 上下文窗口接近上限时，先把会话历史压成摘要，再让模型拿到真正"压缩后"的上下文。
    // 摘要生成失败/无更新会快速 no-op 退出，不会阻塞发送。
    const compressionPromise = ensureContextCompression(sessionIndex);
    const preflightController = new AbortController();
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
    const contextualQuery = buildContextualFollowUpQuery(userText, historyMessagesForCurrentTurn, {
      maxChars: MAX_USER_INPUT_CHARS
    });
    const shouldUseContextualQuery = contextualQuery && contextualQuery !== userText;
    const routingQueryText = shouldUseContextualQuery ? contextualQuery : userText;

    // 4 模式不再做"自动路由"，但 capability 决策（联网/Cloud+ 引用/保存/指令）仍统一由
    // resolveAutoModeDecisionLocally 提供，本地纯函数判定，不再调 LLM 二次校验。
    const autoDecision = resolveAutoModeDecisionLocally(routingQueryText, {
      isAutoMode: currentModeId.value === 'auto',
      cloudReferenceEnabled: Boolean(isTreeholeMemoryEnabled.value || cloudReferenceConsent.value === 'granted'),
      isLoggedIn: Boolean(isLoggedIn.value && userInfo.value?.id),
      helpers: { isPostDraftRequest }
    });

    if (autoDecision?.minecraftCommand) {
      removePreflightLoader();
      finishPreflightOnly();
      await handleCommandModeGeneration(userText, { appendUser: false });
      return;
    }

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
    // 联网：仅由用户手动开关控制，自动决策不再越权触发搜索
    const enableSearch = isSearching.value;
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
    let generationTimeoutTimer = null;

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
        ? searchWebForPrompt(routingQueryText, webSearchSignal).catch((error) => ({
          ok: false,
          disabled: false,
          count: 0,
          context: '',
          results: [],
          error,
          message: error?.message || '未知错误'
        }))
        : Promise.resolve({ ok: true, disabled: false, count: 0, context: '', results: [] });

      if (enableSearch) {
        markGenerationProgress('正在并行搜索网络资料...');
        setProgressContent(`正在搜索"${routingQueryText}"...\n\n`);
      }

      // C1 fix: 知识检索与联网搜索并行启动，减少串行等待时间
      const knowledgePromise = (async () => {
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

          const visibleRetrievalNote = successfulConnectorResults.length > 0
            ? (buildBohAIConnectorActionNote(successfulConnectorResults) || buildVisibleRetrievalActionNote(retrievalPlan, {
              treeholeTotal,
              sharedMemoryTotal,
              userPrivateLabels
            }))
            : '';
          if (visibleRetrievalNote) {
            updateAssistantActionNotes(sessionIndex, messageIndex, [visibleRetrievalNote]);
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

      if (enableSearch) {
        try {
          const webSearchResult = await webSearchPromise;
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
            updateAssistantActionNotes(
              sessionIndex,
              messageIndex,
              [results.length > 0 ? `搜索了 ${results.length} 个内容。` : '搜索了 0 个内容。']
            );
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

      const shouldEnforceGrounding = factualQuestion || operationQuestion || enableSearch || communityNeedsEvidence || bohInternalFactualQuestion;

      const latestForumSummaryMode = isLatestForumSummaryQuery(routingQueryText);
      const personalSupportMode = isLikelyPersonalSupportRequest(userText);

      // 模式选择（4 模式下不再做自动路由）：
      // 1) 当前模式 (currentModeId.value)
      // 2) isPlanModeEnabled 开启时强制 plan（不覆盖 agent 自身）
      // 3) 兜底 fast
      let activeModeId = currentModeId.value;
      if (isPlanModeEnabled.value && activeModeId !== 'agent-cluster') {
        activeModeId = 'plan';
      }
      // 暴露给 UI：本轮路由到的具体模式（含 plan 模式提升）
      lastRoutedMode.value = activeModeId;
      // 在消息 meta 中记录 routedMode：供后续追问场景做"沿用上一轮模式"判断
      mergeAssistantMessageMeta(sessionIndex, messageIndex, { routedMode: activeModeId });
      const isPlanMode = activeModeId === 'plan';
      if (isPlanModeEnabled.value) {
        updateAssistantActionNotes(sessionIndex, messageIndex, ['Plan 模式已开启，显示实时进度。']);
      }
      const hasForumEvidence = Array.isArray(groundingEvidenceRefs)
        && groundingEvidenceRefs.some((ref) => /^F\d+$/i.test(String(ref)));

      const responseRules = `【回答要求】：
1. 涉及社区事实时，优先依据检索内容回答。
2. 涉及用户个人复盘时，优先结合 BOH Cloud+ 私有内容给出总结和建议。
3. 优先用自然表达，不强制套用固定模板。
4. 追问时保持对话连贯，不要重复已说过的内容，直接推进。
5. 对于通用知识问题（非方块之家站内内容），直接给出最佳回答，不确定的部分标注不确定即可；不要建议用户去论坛搜索、不要提供搜索步骤，也不要问“你是想了解 X 还是想在论坛查帖子”。
${hasForumEvidence ? `9. 总结论坛帖子时，用检索资料中的发帖者信息指代，不要泛称“有人提到”。
10. 不要编造论坛用户、帖子或链接；没有检索到论坛资料时，不要提及论坛内容。` : ''}
${personalSupportMode ? '- 用户在表达自己的困扰、情绪或身体状态时，先用 1-2 句接住他的处境和感受，再给最多 2-3 个低压力、今晚就能做的小动作；不要上来就列长清单，不要把普通困扰写成医学建议。结尾可以轻轻问一句具体情况，让用户愿意继续说。' : ''}
${isPlanMode ? '- Plan 模式下必须给出可继续接力的“小步计划/下一步行动”，并把缺少依据的内容标成不确定，不要编造成已确认事实。' : ''}
${latestForumSummaryMode ? '- 用户要求总结论坛最新内容时，必须严格按 [F1]、[F2]、[F3]、[F4]、[F5] 的顺序输出；[F1] 是最新发布，后面依次更早。不得按热度、重要性或主题重排；若不足 5 条，只输出已检索到的条目。' : ''}`;

      let communityRules = '';
      if (bohInternalFactualQuestion) {
        communityRules = `【社群内容规则】
1. 涉及方块之家、BOH、论坛帖子、成员、活动、历史等内容时，依据检索到的资料回答。
2. 不要凭印象补全人物、事件、时间线或统计数字。
3. 资料没有覆盖的点，直接说“未检索到相关依据”即可。`;
      }

      let evidenceRules = '';
      if (shouldEnforceGrounding) {
        evidenceRules = `【回答参考】：
1. 优先基于检索到的资料回答，不确定的部分直接说明不确定。
2. 回答要自然流畅，不需要标注来源编号。`;
      }

      let operationRules = '';
      if (operationQuestion) {
        operationRules = `【操作类问题】
- 给出入口路径和操作步骤；简单操作用自然段落说明，复杂操作用编号步骤。
- 如果无法从已检索资料确认路径，直接说“无法确认该功能的准确路径”。
- 禁止猜测未出现过的页面路径或按钮文案。`;
      }

      const actualExtraChars = (internalEvidenceContext.length || 0) + (webEvidenceContext.length || 0) + (communityRules.length || 0) + (evidenceRules.length || 0) + (operationRules.length || 0);
      updateLastActualExtraChars(actualExtraChars);

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
        evidenceContext: sharedContext.evidenceContext,
        searchContext: sharedContext.searchContext,
        responseRules,
        communityRules,
        evidenceRules,
        operationRules,
        availableEvidenceRefs: shouldEnforceGrounding ? groundingEvidenceRefs : []
      });

      const preferAccuracyModel = factualQuestion || operationQuestion || enableSearch || communityNeedsEvidence;
      const preferredModel = runtimeAvailableModels.value.find((item) => item.id === ACCURACY_PREFERRED_MODEL_ID);
      const ragPreferredModel = runtimeAvailableModels.value.find((item) => item.id === RAG_PREFERRED_MODEL_ID);
      const routedModeModel = getModelForModeId(activeModeId, { userText });
      const generationModel = preferAccuracyModel && preferredModel
        ? preferredModel
        : (hasKnowledgeContext && ragPreferredModel ? ragPreferredModel : routedModeModel);
      markGenerationProgress('正在生成回答...');

      let url = generationModel.url;
      let headers = {
        'Content-Type': 'application/json'
      };
      let requestBody = {};
      const stylePromptAppendix = String(currentResponseStyle.value?.promptAppendix || '').trim();
      const systemPromptContent = [
        BASE_SYSTEM_PROMPT,
        isPlanMode ? PLAN_MODE_PROMPT_APPENDIX : '',
        stylePromptAppendix
      ].filter((section) => String(section || '').trim()).join('\n');
      const generationProfile = getGenerationProfile(activeModeId, {
        factualQuestion: factualQuestion || communityNeedsEvidence,
        operationQuestion
      });

      await compressionPromise;
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
            `${systemPromptContent}\n你必须严格基于用户提供的论坛帖子资料写总结。禁止编造，禁止输出链接，禁止输出列表。`,
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
              `${systemPromptContent}\n你正在修正论坛总结。必须严格基于资料，优先准确，其次自然。禁止编造，禁止输出链接，禁止输出列表。`,
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
        void refreshConversationSummaryCache(sessionIndex);
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
        if (noInternalEvidence && safeReply) {
          return safeReply + '\n\n（未检索到相关站内资料，以上回答基于通用知识）';
        }
        if (!safeReply) return safeReply;
        if (!shouldEnforceGrounding) return safeReply;
        if (totalGroundingRefCount <= 0) {
          if (needsInternalEvidence) {
            return '未检索到明确依据，无法确认这部分 BOH 内部内容。为了避免编造，我不能凭印象补全答案；可以换个更具体的关键词，或开启联网搜索后再试。';
          }
          return safeReply;
        }
        return safeReply;
      };

      requestBody = {
        model: generationModel.id,
        messages: [
          { role: 'system', content: systemPromptContent },
          ...recentMessages,
          { role: 'user', content: finalPrompt }
        ],
        stream: true,
        temperature: generationProfile.temperature,
        top_p: generationProfile.top_p,
        frequency_penalty: generationProfile.frequency_penalty,
        max_tokens: generationProfile.max_tokens
      };

      // C1 fix: 发送前裁剪 messages 数组，防止静默超出模型上下文窗口
      requestBody.messages = trimMessagesToBudget(requestBody.messages, MAX_MESSAGES_TOTAL_TOKENS);

      const STREAM_FETCH_TIMEOUT_MS = 120_000; // 2 min stream timeout
      markGenerationProgress('正在请求模型生成回答...');
      const streamFetchSignal = typeof AbortSignal.any === 'function'
        ? AbortSignal.any([requestController.signal, AbortSignal.timeout(STREAM_FETCH_TIMEOUT_MS)])
        : requestController.signal;

      // 重置思考过滤状态
      resetThinkingState();
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
        apiUrl: url,
        timeoutMs: STREAM_FETCH_TIMEOUT_MS,
        signal: streamFetchSignal,
        payload: requestBody
      });

      // B9 fix: callVaultSiliconChatStream 已在内部对 !response.ok 抛出错误，
      // 此处 response 必定 ok 且 body 为可读流，移除不可达的 !response.ok 检查。
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamIdleTimer = null;
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
            const filteredContent = filterThinkingContentStream(content);
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
        const remainingContent = flushThinkingBuffer();
        if (remainingContent) {
          assistantMessage += remainingContent;
          const visibleStreamContent = cleanAssistantVisibleReply(filterThinkingContent(assistantMessage));
          if (visibleStreamContent) {
            lastVisibleStreamContent = visibleStreamContent;
            updateContent(assistantMessage);
            nextTick(scrollToBottom);
          }
        }
      } else {
        resetThinkingState();
      }

      if (shouldRepairDegenerateStream) {
        const retryPrompt = appendPromptSection(
          finalPrompt,
          `\n\n【稳定性约束】
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 输出必须是正常中文句子，结构清晰，不要输出长串符号。
- 若信息不足，请直接说明“我暂时无法确认”，不要输出占位符。`,
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
        void refreshConversationSummaryCache(sessionIndex);
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
              '\n\n【补答要求】\n上一轮流式输出没有生成可见正文。请直接给出最终回答，不要输出思考过程、检索日志或空内容。',
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
          `\n\n【稳定性约束】
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 若信息不足，请直接说明“我暂时无法确认”，不要输出占位符。`,
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
        finalFilteredContent = lastVisibleStreamContent || '我暂时没有生成到有效内容，请再试一次。';
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
      void refreshConversationSummaryCache(sessionIndex);
    } catch (error) {
      const targetSession = getSessionByIndex(sessionIndex);
      const currentContent = targetSession?.messages?.[messageIndex]?.content || '';

      if (error.name === 'AbortError') {
        logger.debug('boh-ai', 'Generation stopped');
        const filteredStoppedContent = cleanAssistantVisibleReply(filterThinkingContent(currentContent));
        if (generationTimedOut) {
          updateContent(`生成超时已自动停止，请重试。`);
        } else if (isDegenerateAssistantReply(filteredStoppedContent)) {
          updateContent('回答出现异常已自动停止，请重试。');
        } else {
          updateContent(`${filteredStoppedContent}\n\n（已停止生成）`);
        }
      } else {
        logger.error('boh-ai', 'Generation error', error);
        updateContent(`服务暂时繁忙，请稍后重试。`);
      }

      if (targetSession) {
        targetSession.isThinking = false;
      }
      stopThinkingTimer();
      nextTick(scrollToBottom);
    } finally {
      clearTimeout(generationTimeoutTimer);
      isStreamingGeneration.value = false;
      cleanupGenerationState(sessionIndex, requestController);
      scheduleSaveSessions();
    }
  };

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
    onScrollToBottom,
    // Auto 路由相关：让 UI 能看到本轮路由结果
    lastRoutedMode,
    startNewChat,
    deleteSession,
    switchSession,
    sendMessage,
    toggleMemoryCapture,
    toggleTreeholeMemory,
    toggleQuickNoteMode,
    togglePlanMode,
    setResponseStyle,
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
    clearCache
  };
}
