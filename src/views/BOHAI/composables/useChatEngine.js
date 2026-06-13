import { ref, computed, nextTick, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { createPost, getPosts, getUserPosts } from '@/utils/api/forum-api.js';
import {
  createMyTreeholeSpace,
  getSharedAIMemoriesForAI,
  searchSharedAIMemoriesForAI,
  searchBohAIKnowledgeForAI,
  createSharedAIMemory,
  createTreeholeMemory,
  captureTreeholeMemoriesFromDialogue
} from '@/utils/api/treehole-api.js';
import { createMyCloudEntry, getMyCloudEntriesForAI } from '@/utils/api/boh-cloud-api.js';
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
  shouldRepairUngroundedReply,
  sanitizeUnsupportedCommunityEvidenceClaims,
  resolveKnowledgeRoutingPlanCore
} from '@/utils/ai-chat-grounding.js';
import { useAuthStore } from '@/stores/auth.js';
import { supabase } from '@/utils/supabase-client.js';
import {
  normalizeActionDecisionText,
  isActionDraftCancelIntent,
  isPostDraftConfirmIntent,
  isPostDraftRequest,
  isCreatePageRequest
} from '@/utils/bohai-action-draft-intent.js';
import { isLikelyPersonalSupportRequest } from '@/utils/bohai-auto-router.js';
import { resolveAutoModeDecisionLocally } from '@/utils/bohai-auto-decision.js';
import {
  BOHAI_ACTION_IDS,
  BOHAI_CONNECTOR_IDS,
  buildBohAIConnectorActionNote,
  createBohAIAction,
  createBohAIConnector,
  runBohAIAction,
  runBohAIReadConnectors,
  summarizeBohAIConnectorResults
} from '@/utils/bohai-connectors.js';
import {
  appendBohAIActionAudit,
  createBohAIActionAuditEntry
} from '@/utils/bohai-action-audit.js';

import { createBohAIRetrievalTrace } from '@/utils/bohai-observability.js';
import {
  formatPageDraftPreview as buildPageDraftPreview,
  formatPostDraftPreview as buildPostDraftPreview
} from './action-draft-formatters.js';
import {
  updatePostDraftFromText
} from './action-draft-updaters.js';
import { SITE_OPERATION_MEMORY } from '@/data/ai-site-guide.js';
import { logger } from '@/utils/logger.js';
import {
  ACCURACY_PREFERRED_MODEL_ID,
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS,
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
  PAGE_CREATION_PROMPT_APPENDIX,
  QUICK_NOTE_TITLE_MAX_CHARS,
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
import { useConversationManager } from './useConversationManager.js';
import { useGenerationPipeline } from './useGenerationPipeline.js';
import { useModelConfig } from './useModelConfig.js';
import { useMessageManager } from './useMessageManager.js';
import {
  CONVERSATION_SUMMARY_RECENT_MESSAGES,
  CONVERSATION_SUMMARY_MIN_MESSAGES,
  CONVERSATION_SUMMARY_MAX_CHARS,
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
  buildPageDraftFromText,
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

const TYPEWRITER_FRAME_MS = 30;
const TYPEWRITER_CHARS_PER_FRAME = 1;

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

  watch(chatSessions, scheduleSaveSessions, { deep: true });

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
    scrollToBottom: () => { if (typeof _scrollToBottom === 'function') _scrollToBottom(); },
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

  const getLocalDateKey = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ============================================================
  // 草稿预览函数（仍在 useChatEngine 中，依赖 pendingActionDraft）
  // ============================================================
  const formatPostDraftPreview = () => buildPostDraftPreview(pendingActionDraft);
  const formatPageDraftPreview = () => buildPageDraftPreview(pendingActionDraft);

  const updatePostDraftByUserInput = (text) => updatePostDraftFromText(pendingActionDraft, text);

  const getActionAuthContext = () => ({
    isLoggedIn: Boolean(isLoggedIn.value),
    userId: String(userInfo.value?.id || '').trim(),
    username: normalizePromptLine(userInfo.value?.username, 40)
  });

  const createActionRegistry = () => ({
    [BOHAI_ACTION_IDS.createPost]: createBohAIAction({
      id: BOHAI_ACTION_IDS.createPost,
      label: '发布论坛帖子',
      source: '论坛',
      validate: ({ title = '', content = '' } = {}, { auth } = {}) => {
        if (!normalizePromptLine(auth?.username, 40)) {
          return { ok: false, error: { message: '请先登录后再发布帖子。' } };
        }
        if (!normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS)) {
          return { ok: false, error: { message: '草稿还不完整，请先补充标题和正文再确认发布。' } };
        }
        const safeContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS);
        if (!safeContent || safeContent === '（请在这里填写帖子正文）') {
          return { ok: false, error: { message: '草稿还不完整，请先补充标题和正文再确认发布。' } };
        }
        return { ok: true };
      },
      execute: async ({ title = '', content = '' } = {}, { auth } = {}) => {
        const result = await createPost(
          normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS),
          auth.userId,
          auth.username,
          'approved',
          normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS)
        );
        if (!result.ok || result.error) {
          return { ok: false, error: result.error || { message: '请稍后重试。' } };
        }
        const createdRow = Array.isArray(result.data) ? result.data[0] : null;
        const createdPostId = String(createdRow?.id || '');
        return {
          ok: true,
          message: createdPostId
            ? `帖子已发布成功（ID: ${createdPostId}），系统将异步完成内容审查。`
            : '帖子已发布成功，系统将异步完成内容审查。',
          data: { id: createdPostId }
        };
      }
    }),
    [BOHAI_ACTION_IDS.saveCloud]: createBohAIAction({
      id: BOHAI_ACTION_IDS.saveCloud,
      label: '保存到 BOH Cloud+',
      source: 'BOH Cloud+',
      validate: ({ content = '' } = {}) => {
        if (!normalizePromptLine(content, 320)) {
          return { ok: false, error: { message: '保存内容不能为空。' } };
        }
        return { ok: true };
      },
      execute: async ({ content = '', title = '' } = {}, { auth } = {}) => {
        const safeContent = normalizePromptLine(content, 320);
        const cloudResult = await createMyCloudEntry(auth.userId, {
          entryDate: getLocalDateKey(),
          title: normalizePromptLine(title, QUICK_NOTE_TITLE_MAX_CHARS) || buildQuickNoteTitle(safeContent),
          contentText: safeContent,
          contentBlocks: [{ type: 'text', text: safeContent }],
          mood: '',
          source: 'ai'
        });
        if (!cloudResult.ok) {
          return { ok: false, error: cloudResult.error || { message: '保存失败' } };
        }
        treeholeMemoryCache.userId = '';
        treeholeMemoryCache.fetchedAt = 0;
        treeholeMemoryCache.items = [];
        return { ok: true, message: '已记录到 BOH Cloud+。', data: cloudResult.data };
      }
    }),
    [BOHAI_ACTION_IDS.quickNote]: createBohAIAction({
      id: BOHAI_ACTION_IDS.quickNote,
      label: '保存随手记到 BOH Cloud+',
      source: 'BOH Cloud+',
      validate: ({ content = '' } = {}) => {
        if (!extractQuickNoteContent(content)) {
          return { ok: false, error: { message: '摘录内容不能为空。' } };
        }
        return { ok: true };
      },
      execute: async ({ content = '', title = '' } = {}, { auth } = {}) => {
        const safeContent = extractQuickNoteContent(content);
        const cloudResult = await createMyCloudEntry(auth.userId, {
          entryDate: getLocalDateKey(),
          title: normalizePromptLine(title, QUICK_NOTE_TITLE_MAX_CHARS) || buildQuickNoteTitle(safeContent),
          contentText: safeContent,
          contentBlocks: [{ type: 'text', text: safeContent }],
          mood: '',
          source: 'ai'
        });
        if (!cloudResult.ok) {
          return { ok: false, error: cloudResult.error || { message: '记录失败，请稍后重试。' } };
        }
        treeholeMemoryCache.userId = '';
        treeholeMemoryCache.fetchedAt = 0;
        treeholeMemoryCache.items = [];
        return { ok: true, message: '已记录到 BOH Cloud+。', data: cloudResult.data };
      }
    }),
    [BOHAI_ACTION_IDS.saveSharedMemory]: createBohAIAction({
      id: BOHAI_ACTION_IDS.saveSharedMemory,
      label: '写入 BOH AI 公共记忆库',
      source: 'BOH AI 公共记忆库',
      validate: ({ content = '' } = {}) => {
        if (!normalizePromptLine(content, 320)) {
          return { ok: false, error: { message: '公共记忆内容不能为空。' } };
        }
        return { ok: true };
      },
      execute: async ({ content = '' } = {}, { auth } = {}) => {
        const safeContent = normalizePromptLine(content, 320);
        const existingShared = await getSharedMemoriesCached();
        if (isLikelyMemoryDuplicate(safeContent, existingShared)) {
          return { ok: false, error: { message: '公共记忆库已有相近内容，已跳过重复写入。' }, metadata: { duplicate: true } };
        }
        const saveResult = await createSharedAIMemory(auth.userId, {
          content: safeContent,
          mood: '',
          tags: ['Auto确认', '社群记忆'],
          confidence: 0.9,
          evidence: [{ messageId: 'auto_confirmed', quote: truncateText(safeContent, 240) }],
          source: 'auto_confirmed',
          status: 'active'
        });
        if (!saveResult.ok) {
          return { ok: false, error: saveResult.error || { message: '写入失败' } };
        }
        sharedMemoryCache.fetchedAt = 0;
        sharedMemoryCache.items = [];
        resetSharedMemorySearchCache();
        return { ok: true, message: '已写入 BOH AI 公共记忆库。', data: saveResult.data };
      }
    })
  });

  const runRegisteredAction = async (actionId, payload = {}) => {
    const registry = createActionRegistry();
    const auth = getActionAuthContext();
    const result = await runBohAIAction({
      action: registry[actionId],
      payload,
      auth,
      logger
    });
    const audit = createBohAIActionAuditEntry({ result, payload, auth });
    actionAuditLog.value = appendBohAIActionAudit({
      audits: actionAuditLog.value,
      entry: audit
    });
    return {
      ...result,
      metadata: {
        ...(result.metadata && typeof result.metadata === 'object' ? result.metadata : {}),
        audit
      }
    };
  };

  const submitPostDraft = async (sessionIndex) => {
    const title = normalizePromptLine(pendingActionDraft.postTitle, ACTION_DRAFT_TITLE_MAX_CHARS);
    const content = normalizePromptLine(pendingActionDraft.postContent, ACTION_DRAFT_CONTENT_MAX_CHARS);
    const result = await runRegisteredAction(BOHAI_ACTION_IDS.createPost, { title, content });
    if (!result.ok) {
      appendSessionMessage(sessionIndex, 'assistant', result.errorMessage || '发布失败：请稍后重试。');
      if (result.metadata?.reason === 'login_required') {
        resetPendingActionDraft();
        return;
      }
      appendSessionMessage(sessionIndex, 'assistant', formatPostDraftPreview(), { kind: 'action_draft_preview' });
      return;
    }

    resetPendingActionDraft();
    appendSessionMessage(
      sessionIndex,
      'assistant',
      result.message || '帖子已发布成功，系统将异步完成内容审查。',
      { kind: 'action_committed', actionAudit: result.metadata?.audit || null }
    );

  };

  const handlePendingActionDraftReply = async (rawText) => {
    if (!pendingActionDraft.active) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const currentSession = currentSessionIndex.value;
    if (pendingActionDraft.sessionIndex !== currentSession) {
      resetPendingActionDraft();
      return false;
    }

    const targetSession = getSessionByIndex(currentSession);
    if (!targetSession) {
      resetPendingActionDraft();
      return false;
    }

    appendUserMessageWithTitle(currentSession, safeText);
    resetComposerInput();

    if (isActionDraftCancelIntent(safeText)) {
      const draftTypeLabel = pendingActionDraft.type === 'page' ? '网页草稿' : '发帖';
      resetPendingActionDraft();
      appendSessionMessage(currentSession, 'assistant', `好的，已取消本次${draftTypeLabel}草稿。`);
      return true;
    }

    if (pendingActionDraft.type === 'post') {
      if (pendingActionDraft.awaitingIdea) {
        targetSession.isLoading = true;
        targetSession.isThinking = true;
        activeGenerationSessionIndex.value = currentSession;
        startThinkingTimer();
        setThinkingStatus('正在根据你的想法整理发帖草稿...');

        const draftController = new AbortController();
        abortController.value = draftController;
        const draftMessageIndex = targetSession.messages.length;
        targetSession.messages.push({
          role: 'assistant',
          content: '正在整理发帖草稿...'
        });
        await nextTick();
        scrollToBottom();

        const updateDraftMessage = (content, meta = null) => {
          const latestSession = getSessionByIndex(currentSession);
          const targetMessage = latestSession?.messages?.[draftMessageIndex];
          if (!targetMessage || targetMessage.role !== 'assistant') return;
          targetMessage.content = String(content || '').trim();
          if (meta && typeof meta === 'object') {
            targetMessage.meta = meta;
          } else if (targetMessage.meta) {
            delete targetMessage.meta;
          }
          nextTick(() => scrollToBottom());
        };

        try {
          const draft = await generatePostDraftFromUserIdea(safeText, draftController.signal);
          if (draft.needsIdea) {
            pendingActionDraft.awaitingIdea = true;
            updateDraftMessage('我还需要一点具体想法，比如想吐槽什么、分享什么、问大家什么。你可以直接发一句原始想法，我会只按你的内容整理成标题和正文，不联网搜索。');
            return true;
          }

          pendingActionDraft.awaitingIdea = false;
          pendingActionDraft.postTitle = draft.title;
          pendingActionDraft.postContent = draft.content;
          updateDraftMessage(formatPostDraftPreview(), { kind: 'action_draft_preview' });
        } catch (error) {
          resetPendingActionDraft();
          updateDraftMessage(error?.name === 'AbortError' ? '已停止整理发帖草稿。' : '发帖草稿生成失败，请稍后再试。');
        } finally {
          const latestSession = getSessionByIndex(currentSession);
          if (latestSession) {
            latestSession.isLoading = false;
            latestSession.isThinking = false;
          }
          if (activeGenerationSessionIndex.value === currentSession) {
            activeGenerationSessionIndex.value = null;
          }
          if (abortController.value === draftController) {
            abortController.value = null;
          }
          clearThinkingStatus();
          stopThinkingTimer();
        }
        return true;
      }

      if (isPostDraftConfirmIntent(safeText)) {
        await submitPostDraft(currentSession);
        return true;
      }

      const changed = updatePostDraftByUserInput(safeText);
      if (changed) {
        appendSessionMessage(currentSession, 'assistant', formatPostDraftPreview(), { kind: 'action_draft_preview' });
      } else {
        appendSessionMessage(currentSession, 'assistant', '我没识别到可更新字段。你可以直接发来新的标题或正文。');
      }
      return true;
    }

    if (pendingActionDraft.type === 'page') {
      const safeText = String(rawText || '').trim();
      pendingActionDraft.pageDescription = safeText;
      pendingActionDraft.pageHtml = '';

      const targetSession = getSessionByIndex(currentSession);
      if (targetSession) {
        targetSession.isLoading = true;
        targetSession.isThinking = true;
        activeGenerationSessionIndex.value = currentSession;
        startThinkingTimer();
        setThinkingStatus('正在根据你的修改要求重新生成网页...');
      }

      const draftController = new AbortController();
      abortController.value = draftController;

      try {
        const generatedHtml = await generatePageHtmlFromUserIdea({
          pageType: pendingActionDraft.pageType,
          description: pendingActionDraft.pageDescription
        }, draftController.signal);
        pendingActionDraft.pageHtml = generatedHtml;
        appendSessionMessage(currentSession, 'assistant', formatPageDraftPreview(), { kind: 'action_draft_preview' });
      } catch (error) {
        appendSessionMessage(currentSession, 'assistant', error?.name === 'AbortError' ? '已停止生成网页。' : '网页修改失败，请稍后再试。');
      } finally {
        if (targetSession) {
          targetSession.isLoading = false;
          targetSession.isThinking = false;
        }
        if (activeGenerationSessionIndex.value === currentSession) {
          activeGenerationSessionIndex.value = null;
        }
        if (abortController.value === draftController) {
          abortController.value = null;
        }
        clearThinkingStatus();
        stopThinkingTimer();
      }
      return true;
    }

    resetPendingActionDraft();
    return false;
  };

  const tryStartActionDraftFromUserInput = async (rawText, sessionIndex) => {
    const safeText = String(rawText || '').trim();
    if (!safeText) return false;
    if (pendingActionDraft.active) return false;

    const wantsPostDraft = isPostDraftRequest(safeText);
    const wantsMailDraft = /(发邮件|发私信|写邮件|写信|寄信|私信|收件箱)/.test(safeText);
    if (!wantsPostDraft && !wantsMailDraft) return false;

    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;

    appendUserMessageWithTitle(sessionIndex, safeText);
    resetComposerInput();

    if (wantsMailDraft) {
      appendSessionMessage(sessionIndex, 'assistant', wantsPostDraft
        ? '私信功能已下架，我不能再起草或发送私信。你可以继续让我帮你整理论坛发帖草稿。'
        : '私信功能已下架，BOH AI 不再支持起草、发送或读取私信。');
      return true;
    }

    if (!isLoggedIn.value || !userInfo.value?.id) {
      appendSessionMessage(sessionIndex, 'assistant', '请先登录，登录后我就可以帮你起草并发布论坛帖子。');
      return true;
    }

    const userId = String(userInfo.value?.id || '').trim();
    pendingActionDraft.active = true;
    pendingActionDraft.userId = userId;
    pendingActionDraft.sessionIndex = sessionIndex;

    if (wantsPostDraft) {
      pendingActionDraft.type = 'post';
      targetSession.isLoading = true;
      targetSession.isThinking = true;
      activeGenerationSessionIndex.value = sessionIndex;
      startThinkingTimer();
      setThinkingStatus('正在根据你的想法整理发帖草稿...');

      const draftController = new AbortController();
      abortController.value = draftController;
      const draftMessageIndex = targetSession.messages.length;
      targetSession.messages.push({
        role: 'assistant',
        content: '正在整理发帖草稿...'
      });
      await nextTick();
      scrollToBottom();

      const updateDraftMessage = (content, meta = null) => {
        const latestSession = getSessionByIndex(sessionIndex);
        const targetMessage = latestSession?.messages?.[draftMessageIndex];
        if (!targetMessage || targetMessage.role !== 'assistant') return;
        targetMessage.content = String(content || '').trim();
        if (meta && typeof meta === 'object') {
          targetMessage.meta = meta;
        } else if (targetMessage.meta) {
          delete targetMessage.meta;
        }
        nextTick(() => scrollToBottom());
      };

      try {
        const draft = await generatePostDraftFromUserIdea(safeText, draftController.signal);
        if (draft.needsIdea) {
          pendingActionDraft.awaitingIdea = true;
          updateDraftMessage('可以，先把你想发布到论坛的想法发给我；我会自动整理成标题和正文，然后弹出可编辑的发帖草稿框。');
          return true;
        }

        pendingActionDraft.awaitingIdea = false;
        pendingActionDraft.postTitle = draft.title;
        pendingActionDraft.postContent = draft.content;
        updateDraftMessage(formatPostDraftPreview(), { kind: 'action_draft_preview' });
      } catch (error) {
        resetPendingActionDraft();
        updateDraftMessage(error?.name === 'AbortError' ? '已停止整理发帖草稿。' : '发帖草稿生成失败，请稍后再试。');
      } finally {
        const latestSession = getSessionByIndex(sessionIndex);
        if (latestSession) {
          latestSession.isLoading = false;
          latestSession.isThinking = false;
        }
        if (activeGenerationSessionIndex.value === sessionIndex) {
          activeGenerationSessionIndex.value = null;
        }
        if (abortController.value === draftController) {
          abortController.value = null;
        }
        clearThinkingStatus();
        stopThinkingTimer();
      }
      return true;
    }

    return false;
  };

  const tryStartPageCreationFromUserInput = async (rawText, sessionIndex) => {
    const safeText = String(rawText || '').trim();
    if (!safeText) return false;
    if (pendingActionDraft.active) return false;
    if (!isCreatePageRequest(safeText)) return false;

    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;

    appendUserMessageWithTitle(sessionIndex, safeText);
    resetComposerInput();

    if (!isLoggedIn.value || !userInfo.value?.id) {
      appendSessionMessage(sessionIndex, 'assistant', '请先登录，登录后我就可以帮你生成网页代码。');
      return true;
    }

    const pageDraft = buildPageDraftFromText(safeText);
    const userId = String(userInfo.value?.id || '').trim();
    pendingActionDraft.active = true;
    pendingActionDraft.userId = userId;
    pendingActionDraft.sessionIndex = sessionIndex;
    pendingActionDraft.type = 'page';
    pendingActionDraft.pageType = pageDraft.pageType;
    pendingActionDraft.pageDescription = pageDraft.description;
    pendingActionDraft.pageHtml = '';

    targetSession.isLoading = true;
    targetSession.isThinking = true;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();
    setThinkingStatus('正在根据你的描述生成网页...');

    const draftController = new AbortController();
    abortController.value = draftController;
    const draftMessageIndex = targetSession.messages.length;
    targetSession.messages.push({
      role: 'assistant',
      content: '正在生成网页代码...'
    });
    await nextTick();
    scrollToBottom();

    const updateDraftMessage = (content, meta = null) => {
      const latestSession = getSessionByIndex(sessionIndex);
      const targetMessage = latestSession?.messages?.[draftMessageIndex];
      if (!targetMessage || targetMessage.role !== 'assistant') return;
      targetMessage.content = String(content || '').trim();
      if (meta && typeof meta === 'object') {
        targetMessage.meta = meta;
      } else if (targetMessage.meta) {
        delete targetMessage.meta;
      }
      nextTick(() => scrollToBottom());
    };

    try {
      const generatedHtml = await generatePageHtmlFromUserIdea(pageDraft, draftController.signal);
      pendingActionDraft.pageHtml = generatedHtml;
      updateDraftMessage(formatPageDraftPreview(), { kind: 'action_draft_preview' });
    } catch (error) {
      resetPendingActionDraft();
      updateDraftMessage(error?.name === 'AbortError' ? '已停止生成网页。' : '网页生成失败，请稍后再试。');
    } finally {
      const latestSession = getSessionByIndex(sessionIndex);
      if (latestSession) {
        latestSession.isLoading = false;
        latestSession.isThinking = false;
      }
      if (activeGenerationSessionIndex.value === sessionIndex) {
        activeGenerationSessionIndex.value = null;
      }
      if (abortController.value === draftController) {
        abortController.value = null;
      }
      clearThinkingStatus();
      stopThinkingTimer();
    }
    return true;
  };

  const generatePageHtmlFromUserIdea = async (pageDraft, requestSignal = undefined) => {
    try {
      const htmlResponse = await callAIToGenerate({
        systemPrompt: [
          BASE_SYSTEM_PROMPT,
          PAGE_CREATION_PROMPT_APPENDIX
        ].filter(Boolean).join('\n'),
        userInput: [
          `请帮我生成一个${pageDraft.pageType}的网页HTML代码。`,
          `要求：${pageDraft.description}`,
          '',
          '请直接输出完整可用的 HTML 片段（含内联 CSS），不包含 <html>/<head>/<body> 标签。',
          '使用 BOH Creator Studio 兼容的样式风格。'
        ].join('\n'),
        modeId: 'pro',
        signal: requestSignal
      });
      const code = extractHtmlBlock(htmlResponse);
      return code || htmlResponse;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new Error('AI 生成网页失败：' + (error.message || '未知错误'));
    }
  };

  const extractHtmlBlock = (text) => {
    const match = String(text || '').match(/```html\n([\s\S]*?)```/);
    if (match) return match[1].trim();
    const styleMatch = text.match(/<section[\s\S]*?(?:<\/section>\s*)*<style>[\s\S]*?<\/style>/);
    if (styleMatch) return styleMatch[0].trim();
    const sectionMatch = text.match(/<section[\s\S]*?(?:<\/section>[\s\S]*?)*(?:<\/style>)?/);
    if (sectionMatch) return sectionMatch[0].trim();
    return text.trim();
  };

  const callAIToGenerate = async ({ systemPrompt, userInput, modeId = 'pro', signal = undefined }) => {
    const profile = getGenerationProfile(modeId);
    // 使用当前模式的模型而非 profile.defaultModel（该字段不存在于 GENERATION_PROFILE_BY_MODE 中）
    const genModel = getModelForModeId(modeId) || currentModel.value || runtimeAvailableModels.value[0];
    if (!genModel?.id) throw new Error('No available model for generation');
    try {
      const response = await callModelInternal(
        genModel.id,
        userInput,
        systemPrompt,
        [],
        signal,
        0,
        {
          temperature: profile.temperature ?? 0.22,
          top_p: profile.top_p ?? 0.75,
          frequency_penalty: profile.frequency_penalty ?? 0.08,
          max_tokens: 2048
        }
      );
      return response;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new Error('AI 生成失败：' + (error.message || '未知错误'));
    }
  };

  const isTreeholeCreateConfirm = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    const allowList = new Set([
      '是', '是的', '好', '好的', '可以', '行', '确认', '同意', '需要',
      '创建', '创建树洞', '帮我创建', '帮我创建树洞', 'ok', 'yes', 'y'
    ]);
    return allowList.has(normalized);
  };

  const isTreeholeCreateReject = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    const denyList = new Set([
      '否', '不用', '不需要', '取消', '算了', '暂不', '不要', 'no', 'n'
    ]);
    return denyList.has(normalized);
  };

  const _requestTreeholeCreationConfirmation = () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      setMemoryCaptureStatusMessage('请先登录，再开启树洞记忆同步。');
      return;
    }

    const sessionIndex = currentSessionIndex.value;
    if (
      pendingTreeholeCreation.awaitingConfirmation
      && pendingTreeholeCreation.userId === userId
      && pendingTreeholeCreation.sessionIndex === sessionIndex
    ) {
      setMemoryCaptureStatusMessage('请在对话中回复“是”或“否”，确认是否由我代你创建树洞。');
      return;
    }

    pendingTreeholeCreation.awaitingConfirmation = true;
    pendingTreeholeCreation.userId = userId;
    pendingTreeholeCreation.sessionIndex = sessionIndex;
    appendSessionMessage(
      sessionIndex,
      'assistant',
      '你还没有创建树洞。要我现在帮你创建并开启树洞记忆吗？\n请回复“是”确认，回复“否”取消。',
      { kind: 'treehole_create_confirm' }
    );
    setMemoryCaptureStatusMessage('请在对话中回复“是”确认创建树洞，回复“否”取消。');
  };

  const handlePendingTreeholeCreationReply = async (rawText) => {
    if (!pendingTreeholeCreation.awaitingConfirmation) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const sessionIndex = Number.isInteger(pendingTreeholeCreation.sessionIndex)
      ? pendingTreeholeCreation.sessionIndex
      : currentSessionIndex.value;
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) {
      resetPendingTreeholeCreation();
      return false;
    }

    appendSessionMessage(sessionIndex, 'user', safeText);
    if (targetSession.messages.length === 1) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }

    inputMessage.value = '';
    if (textareaRef.value) textareaRef.value.style.height = 'auto';

    if (isTreeholeCreateReject(safeText)) {
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('已取消创建树洞。');
      appendSessionMessage(sessionIndex, 'assistant', '好的，已取消。本次不会开启树洞记忆。');
      return true;
    }

    if (!isTreeholeCreateConfirm(safeText)) {
      appendSessionMessage(sessionIndex, 'assistant', '请回复“是”来创建树洞，或回复“否”取消。');
      setMemoryCaptureStatusMessage('等待你的确认：回复“是”创建树洞，回复“否”取消。');
      return true;
    }

    const pendingUserId = String(pendingTreeholeCreation.userId || '').trim();
    if (!pendingUserId || !isLoggedIn.value || String(userInfo.value?.id || '').trim() !== pendingUserId) {
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('登录状态已变化，请重新开启树洞记忆。');
      appendSessionMessage(sessionIndex, 'assistant', '登录状态发生变化，请重新点击“树洞记忆”后再试。');
      return true;
    }

    setMemoryCaptureStatusMessage('正在为你创建树洞...');
    const createResult = await createMyTreeholeSpace(pendingUserId);
    if (!createResult.ok) {
      resetPendingTreeholeCreation();
      const message = createResult.error?.message || '创建树洞失败，请稍后重试。';
      setMemoryCaptureStatusMessage(message);
      appendSessionMessage(sessionIndex, 'assistant', `创建树洞失败：${message}`);
      return true;
    }

    isTreeholeMemoryEnabled.value = true;
    persistTreeholeMemorySetting();
    resetPendingTreeholeCreation();
    setMemoryCaptureStatusMessage('已为你创建树洞，并开启树洞记忆（私密）。');
    appendSessionMessage(
      sessionIndex,
      'assistant',
      createResult.alreadyExists
        ? '已检测到你的树洞，已帮你开启树洞记忆（私密）。'
        : '已帮你创建树洞，并开启树洞记忆（私密）。'
    );
    return true;
  };

  const persistCloudReferenceConsent = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CLOUD_REFERENCE_CONSENT_KEY, String(cloudReferenceConsent.value || 'unknown'));
  };

  const toggleMemoryCapture = () => {
    isMemoryCaptureEnabled.value = !isMemoryCaptureEnabled.value;
    persistMemoryCaptureSetting();
    setMemoryCaptureStatusMessage(
      isMemoryCaptureEnabled.value
        ? '公共记忆已开启：将写入 BOH AI 公共记忆库。'
        : '公共记忆已关闭：本轮不会写入 BOH AI 公共记忆库。'
    );
  };

  const toggleQuickNoteMode = () => {
    if (!isLoggedIn.value || !userInfo.value?.id) {
      isQuickNoteEnabled.value = false;
      persistQuickNoteSetting();
      resetPendingQuickNote();
      setMemoryCaptureStatusMessage('请先登录，再开启随手记。');
      return;
    }

    isQuickNoteEnabled.value = !isQuickNoteEnabled.value;
    persistQuickNoteSetting();
    if (!isQuickNoteEnabled.value) {
      resetPendingQuickNote();
    }
    setMemoryCaptureStatusMessage(
      isQuickNoteEnabled.value
        ? '随手记已开启：AI 回答后可选择记录到 Cloud+。'
        : '随手记已关闭。'
    );
    dispatchUserSpaceIslandMessage({
      title: isQuickNoteEnabled.value ? '随手记已开启' : '随手记已关闭',
      message: isQuickNoteEnabled.value ? 'AI 回答后可记录到 Cloud+' : '本轮不再生成随手记提示',
      icon: 'ai',
      type: 'notification',
      actionLabel: '知道了',
      durationMs: 3600
    });
  };

  const updatePendingQuickNoteDraft = ({ title, content } = {}) => {
    if (!pendingQuickNote.visible || pendingQuickNote.busy) return false;
    if (typeof title === 'string') {
      pendingQuickNote.title = normalizePromptLine(title, QUICK_NOTE_TITLE_MAX_CHARS);
    }
    if (typeof content === 'string') {
      pendingQuickNote.content = extractQuickNoteContent(content);
    }
    pendingQuickNote.error = '';
    return true;
  };

  const dismissQuickNoteDraft = () => {
    if (pendingQuickNote.busy) return false;
    const sessionIndex = Number.isInteger(pendingQuickNote.sessionIndex)
      ? pendingQuickNote.sessionIndex
      : currentSessionIndex.value;
    resetPendingQuickNote();
    setMemoryCaptureStatusMessage('已跳过本条随手记。');
    appendSessionMessage(sessionIndex, 'assistant', '好的，本条随手记不记录到 Cloud+。');
    return true;
  };

  const confirmQuickNoteDraft = async () => {
    if (!pendingQuickNote.visible || pendingQuickNote.busy) return false;

    const userId = String(userInfo.value?.id || '').trim();
    if (!isLoggedIn.value || !userId || userId !== String(pendingQuickNote.userId || '').trim()) {
      pendingQuickNote.error = '登录状态已变化，请重新发送后再记录。';
      isQuickNoteEnabled.value = false;
      persistQuickNoteSetting();
      return false;
    }

    const content = extractQuickNoteContent(pendingQuickNote.content);
    const title = normalizePromptLine(pendingQuickNote.title, QUICK_NOTE_TITLE_MAX_CHARS) || buildQuickNoteTitle(content);
    if (!content) {
      pendingQuickNote.error = '摘录内容不能为空。';
      return false;
    }

    pendingQuickNote.busy = true;
    pendingQuickNote.error = '';
    const result = await runRegisteredAction(BOHAI_ACTION_IDS.quickNote, { title, content });

    if (!result.ok) {
      pendingQuickNote.busy = false;
      pendingQuickNote.error = result.errorMessage || '记录失败，请稍后重试。';
      return false;
    }

    const sessionIndex = Number.isInteger(pendingQuickNote.sessionIndex)
      ? pendingQuickNote.sessionIndex
      : currentSessionIndex.value;
    resetPendingQuickNote();
    setMemoryCaptureStatusMessage('已记录到 BOH Cloud+。');
    dispatchUserSpaceIslandMessage({
      title: '已记录到 Cloud+',
      message: title,
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'profile',
      durationMs: 5200
    });
    appendSessionMessage(sessionIndex, 'assistant', '已记录到 BOH Cloud+。');
    return true;
  };

  const requestCloudReferenceConsent = () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      setMemoryCaptureStatusMessage('请先登录，再开启 Cloud+ 参考。');
      return;
    }

    const sessionIndex = currentSessionIndex.value;
    if (
      pendingCloudReferenceConsent.awaitingConfirmation
      && pendingCloudReferenceConsent.userId === userId
      && pendingCloudReferenceConsent.sessionIndex === sessionIndex
    ) {
      setMemoryCaptureStatusMessage('请先选择是否同意 BOH AI 读取你的 Cloud+ 全部内容。');
      return;
    }

    pendingCloudReferenceConsent.awaitingConfirmation = true;
    pendingCloudReferenceConsent.userId = userId;
    pendingCloudReferenceConsent.sessionIndex = sessionIndex;
    appendSessionMessage(
      sessionIndex,
      'assistant',
      '请问是否同意 BOH AI 在回答时查看你的 Cloud+ 全部内容？这只会用于当前账号的私有参考，不会公开给其他人。',
      { kind: 'cloud_reference_consent' }
    );
    setMemoryCaptureStatusMessage('请先确认是否同意 Cloud+ 全量参考。');
  };

  const applyCloudReferenceConsent = (allowed) => {
    const sessionIndex = Number.isInteger(pendingCloudReferenceConsent.sessionIndex)
      ? pendingCloudReferenceConsent.sessionIndex
      : currentSessionIndex.value;

    cloudReferenceConsent.value = allowed ? 'granted' : 'denied';
    persistCloudReferenceConsent();
    isTreeholeMemoryEnabled.value = Boolean(allowed);
    persistTreeholeMemorySetting();
    resetPendingCloudReferenceConsent();

    if (allowed) {
      setMemoryCaptureStatusMessage('Cloud+ 参考已开启：AI 将可查看你的全部 Cloud+ 内容作为私有参考。');
      appendSessionMessage(sessionIndex, 'assistant', '已收到你的同意。Cloud+ 参考已开启，后续回答可以结合你的全部 Cloud+ 内容。');
      return;
    }

    setMemoryCaptureStatusMessage('已拒绝 Cloud+ 参考，本次不会读取你的 Cloud+ 内容。');
    appendSessionMessage(sessionIndex, 'assistant', '已收到你的选择。Cloud+ 参考保持关闭，后续不会读取你的 Cloud+ 内容。');
  };

  const approveCloudReferenceConsent = () => {
    if (!pendingCloudReferenceConsent.awaitingConfirmation) return;
    applyCloudReferenceConsent(true);
  };

  const rejectCloudReferenceConsent = () => {
    if (!pendingCloudReferenceConsent.awaitingConfirmation) return;
    applyCloudReferenceConsent(false);
  };

  const handlePendingCloudReferenceConsentReply = async (rawText) => {
    if (!pendingCloudReferenceConsent.awaitingConfirmation) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const normalized = normalizeActionDecisionText(safeText);
    if (!normalized) return false;

    const sessionIndex = Number.isInteger(pendingCloudReferenceConsent.sessionIndex)
      ? pendingCloudReferenceConsent.sessionIndex
      : currentSessionIndex.value;
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) {
      resetPendingCloudReferenceConsent();
      return false;
    }

    appendSessionMessage(sessionIndex, 'user', safeText);
    if (targetSession.messages.length === 1) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }

    inputMessage.value = '';
    if (textareaRef.value) textareaRef.value.style.height = 'auto';

    const allowList = new Set(['是', '是的', '好', '好的', '可以', '行', '确认', '确定', '同意', '允许', 'ok', 'yes', 'y']);
    const denyList = new Set(['否', '不用', '不需要', '取消', '算了', '暂不', '不要', '拒绝', '不同意', 'no', 'n']);

    if (denyList.has(normalized)) {
      applyCloudReferenceConsent(false);
      return true;
    }

    if (allowList.has(normalized)) {
      applyCloudReferenceConsent(true);
      return true;
    }

    appendSessionMessage(sessionIndex, 'assistant', '请点击“同意”或“拒绝”，也可以直接回复“同意”或“拒绝”。');
    setMemoryCaptureStatusMessage('等待你的选择：同意或拒绝 Cloud+ 参考。');
    return true;
  };

  const isSharedMemorySaveConfirm = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    return new Set(['是', '是的', '好', '好的', '可以', '行', '确认', '确定', '同意', '写入', '保存', '记录', '加入记忆库', 'ok', 'yes', 'y']).has(normalized);
  };

  const isSharedMemorySaveReject = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    return new Set(['否', '不用', '不需要', '取消', '算了', '暂不', '不要', '不写入', '不保存', '不记录', 'no', 'n']).has(normalized);
  };

  const resolveMemorySaveDestinationFromText = (text, fallback = 'ask') => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return fallback;
    if (/(两者|两个都|都存|都保存|都写入|同时|一起|cloud\+和公共|公共记忆和cloud)/i.test(normalized)) return 'both';
    if (/(cloud\+|cloud|随手记|日记|私有|私人|个人记录)/i.test(normalized)) return 'cloud';
    if (/(公共记忆|公共|共享记忆|社群记忆|记忆库)/i.test(normalized)) return 'shared';
    if (isSharedMemorySaveConfirm(text) && ['cloud', 'shared', 'both'].includes(fallback)) return fallback;
    return fallback;
  };

  const formatMemorySavePrompt = (content, destination = 'ask') => {
    const safeContent = normalizePromptLine(content, 320);
    if (destination === 'cloud') {
      return `要把这条内容记录到 BOH Cloud+ 吗？\n\n${safeContent}\n\n回复“确认”保存，回复“取消”跳过。`;
    }
    if (destination === 'shared') {
      return `要把这条内容写入 BOH AI 公共记忆库吗？\n\n${safeContent}\n\n回复“确认”写入，回复“取消”跳过。`;
    }
    if (destination === 'both') {
      return `要把这条内容同时保存到 BOH Cloud+ 和 BOH AI 公共记忆库吗？\n\n${safeContent}\n\n回复“确认”保存到两处，回复“取消”跳过。`;
    }
    return `这条内容要保存到哪里？\n\n${safeContent}\n\n可以回复 Cloud+、公共记忆、两者都保存，或“不保存”。`;
  };

  const requestSharedMemorySaveConfirmation = ({ content, sessionIndex, destination = 'ask' } = {}) => {
    const safeContent = normalizePromptLine(content, 320);
    if (!safeContent) return false;

    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      appendSessionMessage(
        sessionIndex,
        'assistant',
        '保存到 BOH Cloud+ 或公共记忆库需要先登录；我这次先不保存。',
        { kind: 'shared_memory_login_required' }
      );
      return true;
    }

    pendingSharedMemoryCapture.awaitingConfirmation = true;
    pendingSharedMemoryCapture.userId = userId;
    pendingSharedMemoryCapture.sessionIndex = sessionIndex;
    pendingSharedMemoryCapture.content = safeContent;
    pendingSharedMemoryCapture.destination = ['cloud', 'shared', 'both', 'ask'].includes(destination) ? destination : 'ask';
    appendSessionMessage(
      sessionIndex,
      'assistant',
      formatMemorySavePrompt(safeContent, pendingSharedMemoryCapture.destination),
      { kind: 'shared_memory_capture_confirm' }
    );
    return true;
  };

  const saveConfirmedAutoMemory = async ({ userId, content, destination, sessionIndex } = {}) => {
    const safeUserId = String(userId || '').trim();
    const safeContent = normalizePromptLine(content, 320);
    if (!safeUserId || safeUserId !== String(userInfo.value?.id || '').trim()) {
      appendSessionMessage(sessionIndex, 'assistant', '登录状态已变化，本次保存已取消，请重新发送后再试。');
      return;
    }
    const targetDestination = ['cloud', 'shared', 'both'].includes(destination) ? destination : 'shared';
    const shouldSaveCloud = targetDestination === 'cloud' || targetDestination === 'both';
    const shouldSaveShared = targetDestination === 'shared' || targetDestination === 'both';
    const savedTargets = [];
    const errors = [];

    if (shouldSaveCloud) {
      const cloudResult = await runRegisteredAction(BOHAI_ACTION_IDS.saveCloud, {
        title: buildQuickNoteTitle(safeContent),
        content: safeContent
      });
      if (cloudResult.ok) {
        savedTargets.push('BOH Cloud+');
      } else {
        errors.push(`Cloud+：${cloudResult.errorMessage || '保存失败'}`);
      }
    }

    if (shouldSaveShared) {
      const saveResult = await runRegisteredAction(BOHAI_ACTION_IDS.saveSharedMemory, {
        content: safeContent
      });
      if (saveResult.ok) {
        savedTargets.push('BOH AI 公共记忆库');
      } else if (saveResult.metadata?.duplicate) {
        errors.push('公共记忆库：已有相近内容，已跳过重复写入');
      } else {
        errors.push(`公共记忆库：${saveResult.errorMessage || '写入失败'}`);
      }
    }

    if (savedTargets.length > 0) {
      const savedText = `已保存到 ${savedTargets.join(' 和 ')}。`;
      setMemoryCaptureStatusMessage(savedText);
      appendSessionMessage(sessionIndex, 'assistant', savedText, { kind: 'memory_saved_notice' });
      if (errors.length > 0) {
        appendSessionMessage(sessionIndex, 'assistant', errors.join('\n'));
      }
      return true;
    }

    appendSessionMessage(sessionIndex, 'assistant', errors.length > 0 ? errors.join('\n') : '保存失败，请稍后重试。');
    return true;
  };

  const handlePendingSharedMemoryCaptureReply = async (rawText) => {
    if (!pendingSharedMemoryCapture.awaitingConfirmation) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const sessionIndex = Number.isInteger(pendingSharedMemoryCapture.sessionIndex)
      ? pendingSharedMemoryCapture.sessionIndex
      : currentSessionIndex.value;
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) {
      resetPendingSharedMemoryCapture();
      return false;
    }

    appendSessionMessage(sessionIndex, 'user', safeText);
    if (targetSession.messages.length === 1) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }
    resetComposerInput();

    if (isSharedMemorySaveReject(safeText)) {
      resetPendingSharedMemoryCapture();
      appendSessionMessage(sessionIndex, 'assistant', '好的，这条社群记忆不写入公共记忆库。');
      return true;
    }

    let destination = resolveMemorySaveDestinationFromText(safeText, pendingSharedMemoryCapture.destination);
    if (destination === 'ask') {
      appendSessionMessage(sessionIndex, 'assistant', '请回复“Cloud+”、“公共记忆”、“两者都保存”，或回复“不保存”。');
      return true;
    }

    if (!['cloud', 'shared', 'both'].includes(destination)) {
      appendSessionMessage(sessionIndex, 'assistant', '请回复“Cloud+”、“公共记忆”、“两者都保存”，或回复“不保存”。');
      return true;
    }

    const pendingUserId = String(pendingSharedMemoryCapture.userId || '').trim();
    const content = normalizePromptLine(pendingSharedMemoryCapture.content, 320);
    if (!pendingUserId || !content || !isLoggedIn.value || String(userInfo.value?.id || '').trim() !== pendingUserId) {
      resetPendingSharedMemoryCapture();
      appendSessionMessage(sessionIndex, 'assistant', '登录状态发生变化，这条记忆暂时没有写入。请重新发送后再确认。');
      return true;
    }

    resetPendingSharedMemoryCapture();
    await saveConfirmedAutoMemory({
      userId: pendingUserId,
      content,
      destination,
      sessionIndex
    });
    return true;
  };

  const toggleTreeholeMemory = async () => {
    if (isTreeholeMemoryToggling.value) return;

    if (!isLoggedIn.value || !userInfo.value?.id) {
      setMemoryCaptureStatusMessage('请先登录，再开启 Cloud+ 参考。');
      return;
    }

    if (isTreeholeMemoryEnabled.value) {
      isTreeholeMemoryEnabled.value = false;
      persistTreeholeMemorySetting();
      setMemoryCaptureStatusMessage('Cloud+ 参考已关闭。');
      dispatchUserSpaceIslandMessage({
        title: 'Cloud+ 参考已关闭',
        message: '本轮不会读取你的 Cloud+ 内容',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 3600
      });
      return;
    }

    isTreeholeMemoryToggling.value = true;
    try {
      if (cloudReferenceConsent.value !== 'granted') {
        requestCloudReferenceConsent();
        return;
      }
      isTreeholeMemoryEnabled.value = true;
      persistTreeholeMemorySetting();
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('Cloud+ 参考已开启：AI 将可查看你的全部 Cloud+ 内容作为私有参考。');
      dispatchUserSpaceIslandMessage({
        title: 'Cloud+ 参考已开启',
        message: 'AI 可参考你的 Cloud+ 私有内容',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 4200
      });
    } finally {
      isTreeholeMemoryToggling.value = false;
    }
  };

  const shouldSuppressMemoryStatusEcho = (baseText, statusText) => {
    const base = String(baseText || '').trim();
    const status = String(statusText || '').trim();
    if (!base || !status) return false;

    const normalizeForCompare = (text) => String(text || '')
      .replace(/[：:；;，,。.\s]/g, '')
      .replace(/默认|同步/g, '')
      .trim();
    const normalizedBase = normalizeForCompare(base);
    const normalizedStatus = normalizeForCompare(status);
    if (!normalizedBase || !normalizedStatus) return false;
    if (normalizedBase.includes(normalizedStatus) || normalizedStatus.includes(normalizedBase)) return true;

    const stateEchoRules = [
      /^公共记忆已开启/u,
      /^公共记忆已关闭/u,
      /^Cloud\+ 参考已开启/u,
      /^Cloud\+ 参考已关闭/u,
      /^随手记已开启/u,
      /^随手记已关闭/u
    ];
    if (!stateEchoRules.some((rule) => rule.test(status))) return false;

    if (status.includes('公共记忆') && base.includes('公共记忆已')) return true;
    if (status.includes('Cloud+') && base.includes('Cloud+ 参考')) return true;
    if (status.includes('随手记') && base.includes('随手记已')) return true;
    return false;
  };

  const memoryCaptureTip = computed(() => {
    const base = (() => {
      if (!isLoggedIn.value) return '登录后可开启公共记忆、Cloud+ 参考与随手记。';
      const parts = [
        isMemoryCaptureEnabled.value
          ? '公共记忆已开启：写入 BOH AI 公共记忆库'
          : '公共记忆已关闭',
        isTreeholeMemoryEnabled.value
          ? 'Cloud+ 参考已开启：回答可参考你的全部 Cloud+ 内容'
          : 'Cloud+ 参考已关闭',
        isQuickNoteEnabled.value
          ? '随手记已开启'
          : '随手记已关闭'
      ];
      return `${parts.join('；')}。`;
    })();
    const status = String(memoryCaptureStatusMessage.value || '').trim();
    if (!status) return base;
    if (shouldSuppressMemoryStatusEcho(base, status)) return base;
    return `${base} ${status}`;
  });

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

  const animateAssistantContent = async (text, updateContent, {
    requestSignal = undefined,
    charDelayMs = 30,
    chunkSize = 1
  } = {}) => {
    const content = String(text || '');
    if (!content) {
      updateContent('');
      return;
    }

    const chars = Array.from(content);
    let visible = '';
    for (let index = 0; index < chars.length; index += chunkSize) {
      if (requestSignal?.aborted) {
        throw new DOMException('Animation aborted', 'AbortError');
      }
      visible += chars.slice(index, index + chunkSize).join('');
      updateContent(visible);
      await sleep(charDelayMs);
    }
  };

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

  // 检测是否是社群相关问题
  const isCommunityQuestion = (text) => {
    const communityKeywords = [
      '方块之家', 'boh', '社区', '成员', 'ryyik', 'lf', '小牛', '橙子', 'eleven',
      '论坛', '帖子', '公告', '活动', '周年庆', '内战', '服务器', '联机',
      '雨芙蕖', '白烨', '丁老师', '汉堡', 'end', '百城', '小天光', '小仙',
      'hypixel', '我的世界', 'minecraft', 'mc', '英雄联盟', 'lol', '王者荣耀'
    ];
    const normalized = normalizeText(text);
    return communityKeywords.some(keyword => normalized.includes(keyword));
  };

  const isCommunityCreativeRequest = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return /(写|生成|创作|改写|润色|设计|起草|文案|口号|标题|祝福|海报|宣传语|故事|诗|歌词|设定|梗图)/.test(normalized);
  };

  const shouldUseMemoryContext = (text) => {
    if (isOperationQuestion(text)) return false;
    return isCommunityQuestion(text);
  };

  const buildKnowledgeContextBlock = (title, chunks, { citationPrefix = 'K' } = {}) => {
    if (!chunks || chunks.length === 0) return '';
    const body = chunks
      .map((chunk, index) => `[${citationPrefix}${index + 1}] ${trimKnowledgeChunk(chunk)}`)
      .join('\n\n');
    return `【${title}】\n${body}`;
  };

  const getVectorKnowledgeChunks = async (queryText, {
    sourceTypes = ['shared_memory'],
    limit = 8,
    syncLimit = 40,
    minSimilarity = 0.18
  } = {}) => {
    const safeQuery = normalizePromptLine(queryText, 220);
    if (!safeQuery) return [];

    const result = await searchBohAIKnowledgeForAI({
      query: safeQuery,
      sourceTypes,
      limit,
      syncLimit,
      minSimilarity,
      ensureIndexed: true
    });

    if (!result.ok) {
      logger.warn('boh-ai', '向量检索失败，回退关键词检索', result.error?.message || result.error);
      return [];
    }

    const chunks = Array.isArray(result.data?.chunks) ? result.data.chunks : [];
    return chunks.filter((chunk) => normalizePromptLine(chunk?.content, 20));
  };

  const buildVectorKnowledgeContext = (title, chunks, {
    citationPrefix = 'V',
    maxItems = 8,
    maxContentChars = 320
  } = {}) => {
    const source = Array.isArray(chunks) ? chunks.slice(0, maxItems) : [];
    if (source.length === 0) return '';

    const body = source.map((chunk, index) => {
      const metadata = chunk?.metadata && typeof chunk.metadata === 'object' ? chunk.metadata : {};
      const content = normalizePromptLine(chunk?.content, maxContentChars);
      const chunkTitle = normalizePromptLine(chunk?.title, 80);
      const time = normalizePromptLine(metadata.updatedAt || metadata.entryDate || chunk?.updated_at, 40) || '未知';
      const mood = normalizePromptLine(metadata.mood, 24);
      const tags = Array.isArray(metadata.tags) && metadata.tags.length > 0
        ? metadata.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '';
      const similarity = Number(chunk?.similarity);
      const retrievalMethod = normalizePromptLine(
        metadata.retrievalMethod || chunk?.retrievalMethod,
        20
      );
      const scoreText = Number.isFinite(similarity) && similarity > 0
        ? `\n相关度: ${Math.round(similarity * 100)}%`
        : '';
      const methodText = retrievalMethod ? `\n检索: ${retrievalMethod}` : '';
      const titleText = chunkTitle ? `\n标题: ${chunkTitle}` : '';
      const moodText = mood ? `\n心情: ${mood}` : '';
      const tagsText = tags ? `\n标签: ${tags}` : '';
      return `[${citationPrefix}${index + 1}] 时间: ${time}${titleText}${moodText}${tagsText}${scoreText}${methodText}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return `【${title}】\n${body}`;
  };

  const getMemoryContext = async (queryText) => {
    const vectorChunks = await getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['core_memory', 'knowledge_base'],
      limit: Math.max(MEMORY_MAX_CHUNKS, 8),
      syncLimit: 60,
      minSimilarity: 0.1
    });
    if (vectorChunks.length > 0) {
      return buildVectorKnowledgeContext('官方事实与导入知识库语义检索结果', vectorChunks, {
        citationPrefix: 'K',
        maxItems: MEMORY_MAX_CHUNKS,
        maxContentChars: 520
      });
    }

    const memory = await getAIMemory();
    if (!memory) return '';
    const chunks = selectRelevantChunks(memory, queryText, MEMORY_MAX_CHUNKS);
    return buildKnowledgeContextBlock('核心记忆库检索结果', chunks, { citationPrefix: 'K' });
  };

  const shouldUseSharedMemoryContext = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    if (isOperationQuestion(normalized)) return false;

    // 先做关键词判断：只有“可能涉及公共记忆事实”的问题才触发共享记忆检索。
    if (containsAnyKeyword(normalized, SHARED_MEMORY_TRIGGER_KEYWORDS)) {
      return true;
    }

    if (!isCommunityQuestion(normalized)) {
      return false;
    }

    const memoryJudgementPattern = /(谁|什么|发生|提到|记得|之前|曾经|最近|历史|往事|来源|细节|介绍)/;
    return memoryJudgementPattern.test(normalized);
  };

  const getSharedMemoriesCached = async () => {
    const now = Date.now();
    const shouldUseCache = (now - sharedMemoryCache.fetchedAt) < SHARED_MEMORY_CACHE_TTL_MS
      && Array.isArray(sharedMemoryCache.items);

    if (shouldUseCache) {
      return sharedMemoryCache.items;
    }

    const result = await getSharedAIMemoriesForAI({ limit: SHARED_MEMORY_LIMIT });
    if (!result.ok) {
      logger.warn('boh-ai', '读取 AI 公共记忆失败', result.error?.message || result.error);
      sharedMemoryCache.fetchedAt = now;
      sharedMemoryCache.items = [];
      return [];
    }

    const items = Array.isArray(result.data) ? result.data : [];
    sharedMemoryCache.fetchedAt = now;
    sharedMemoryCache.items = items;
    return items;
  };

  const selectSharedMemoriesByQuery = (memories, queryText, maxItems = SHARED_MEMORY_CONTEXT_MAX_ITEMS) => {
    const source = Array.isArray(memories) ? memories : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    const scored = source.map((item) => {
      const content = normalizePromptLine(item?.content, SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24);
      const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
      const merged = `${content}\n${mood}\n${tags}`;
      return {
        item,
        score: scoreChunk(merged, keywords)
      };
    });

    const matched = scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map((entry) => entry.item);

    if (matched.length > 0) return matched;
    return [];
  };

  const getSharedMemoriesByQuery = async (queryText = '', { limit = SHARED_MEMORY_SEARCH_FETCH_LIMIT } = {}) => {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(60, Math.trunc(limit)))
      : SHARED_MEMORY_SEARCH_FETCH_LIMIT;
    const safeQuery = normalizePromptLine(queryText, 220);
    const cacheKey = normalizeText(safeQuery) || '__empty_query__';
    const now = Date.now();
    const cached = sharedMemorySearchCache.get(cacheKey);
    if (cached && (now - cached.fetchedAt) < SHARED_MEMORY_CACHE_TTL_MS && Array.isArray(cached.items)) {
      return cached.items;
    }

    if (safeQuery) {
      const searchResult = await searchSharedAIMemoriesForAI({
        query: safeQuery,
        limit: safeLimit
      });
      if (searchResult.ok && Array.isArray(searchResult.data)) {
        if (sharedMemorySearchCache.size >= SHARED_MEMORY_SEARCH_CACHE_MAX) {
          const firstKey = sharedMemorySearchCache.keys().next().value;
          sharedMemorySearchCache.delete(firstKey);
        }
        sharedMemorySearchCache.set(cacheKey, {
          fetchedAt: now,
          items: searchResult.data
        });
        return searchResult.data;
      }
      if (!searchResult.ok) {
        logger.warn('boh-ai', '共享记忆搜索 RPC 失败，回退本地筛选', searchResult.error?.message || searchResult.error);
      }
    }

    const fallbackSource = await getSharedMemoriesCached();
    const fallbackItems = safeQuery
      ? selectSharedMemoriesByQuery(fallbackSource, safeQuery, safeLimit)
      : fallbackSource.slice(0, safeLimit);
    if (sharedMemorySearchCache.size >= SHARED_MEMORY_SEARCH_CACHE_MAX) {
      const firstKey = sharedMemorySearchCache.keys().next().value;
      sharedMemorySearchCache.delete(firstKey);
    }
    sharedMemorySearchCache.set(cacheKey, {
      fetchedAt: now,
      items: fallbackItems
    });
    return fallbackItems;
  };

  const getSharedMemoryContext = async (queryText) => {
    const vectorChunks = await getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['shared_memory'],
      limit: SHARED_MEMORY_CONTEXT_MAX_ITEMS,
      syncLimit: SHARED_MEMORY_SEARCH_FETCH_LIMIT,
      minSimilarity: 0.12
    });
    if (vectorChunks.length > 0) {
      return {
        context: buildVectorKnowledgeContext('AI公共记忆库语义检索结果', vectorChunks, {
          citationPrefix: 'S',
          maxItems: SHARED_MEMORY_CONTEXT_MAX_ITEMS,
          maxContentChars: SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS
        }),
        total: vectorChunks.length
      };
    }

    const memories = await getSharedMemoriesByQuery(queryText, { limit: SHARED_MEMORY_SEARCH_FETCH_LIMIT });
    if (!Array.isArray(memories) || memories.length === 0) {
      return { context: '', total: 0 };
    }

    const selected = selectSharedMemoriesByQuery(memories, queryText, SHARED_MEMORY_CONTEXT_MAX_ITEMS);
    if (selected.length === 0) {
      return { context: '', total: 0 };
    }

    const body = selected.map((item, index) => {
      const content = normalizePromptLine(item?.content, SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24) || '未标注';
      const tags = Array.isArray(item?.tags) && item.tags.length > 0
        ? item.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '无';
      const time = normalizePromptLine(item?.updatedAt || item?.createdAt, 40) || '未知';
      return `[S${index + 1}] 时间: ${time}\n心情: ${mood}\n标签: ${tags}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【AI公共记忆库检索结果】\n${body}`,
      total: selected.length
    };
  };

  const getSiteGuideContext = (queryText) => {
    const chunks = selectRelevantChunks(SITE_OPERATION_MEMORY, queryText, SITE_GUIDE_MAX_CHUNKS);
    return buildKnowledgeContextBlock('站点操作与路径知识库', chunks, { citationPrefix: 'G' });
  };

  const isTreeholeReflectionQuestion = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    if (isOperationQuestion(normalized)) return false;

    const explicitKeywords = [
      'note', '日记', '笔记', '记录', '记忆', '复盘', '回顾', '总结我', '我的情况', '我的状态',
      '我的情绪', '我的习惯', '我最近', '我一直', '我总是', '给我建议', '我的计划'
    ];
    if (explicitKeywords.some((keyword) => normalized.includes(keyword))) {
      return true;
    }

    const reflectivePattern = /(我|我的|自己).*(最近|一直|总是|复盘|回顾|习惯|情绪|状态|变化|记录|记忆|总结|日记|笔记)/;
    return reflectivePattern.test(normalized);
  };

  const shouldUseTreeholeContext = (text) => {
    if (!isTreeholeMemoryEnabled.value) return false;
    if (!isLoggedIn.value || !userInfo.value?.id) return false;
    return isTreeholeReflectionQuestion(text);
  };

  const resolveKnowledgeRoutingPlan = (queryText) => {
    const normalized = normalizeText(queryText);
    const operation = isOperationQuestion(normalized);
    const community = isCommunityQuestion(normalized);
    const forumRealtime = community && ROUTING_FORUM_REALTIME_PATTERN.test(normalized);
    const communityHistory = community && ROUTING_HISTORY_FACT_PATTERN.test(normalized);
    const userPrivatePlan = resolveUserPrivateRetrievalPlan(normalized);
    const hasSharedMemoryTrigger = containsAnyKeyword(normalized, SHARED_MEMORY_TRIGGER_KEYWORDS);

    const basePlan = {
      treehole: shouldUseTreeholeContext(normalized),
      sharedMemory: shouldUseSharedMemoryContext(normalized),
      memory: shouldUseMemoryContext(normalized),
      siteGuide: shouldUseSiteGuide(normalized),
      // forum 仅由用户手动开关控制，不再自动判定
      forum: false,
      userPrivate: userPrivatePlan.shouldUse
    };

    return resolveKnowledgeRoutingPlanCore({
      basePlan,
      operation,
      community,
      forumRealtime,
      communityHistory,
      hasSharedMemoryTrigger
    });
  };

  const summarizeThinkingSubject = (text) => {
    const normalized = normalizePromptLine(text, 28);
    if (!normalized) return '这个问题';
    return normalized.length >= 28 ? `${normalized.slice(0, 25)}...` : normalized;
  };

  const getRetrievalTargetLabels = (plan = {}) => {
    const labels = [];
    if (plan.forum) labels.push('社区帖子');
    if (plan.memory) labels.push('核心记忆库/导入知识库');
    if (plan.sharedMemory) labels.push('AI 公共记忆');
    if (plan.siteGuide) labels.push('站点操作手册');
    if (plan.treehole) labels.push('BOH Cloud+');
    if (plan.userPrivate) labels.push('当前账号资料');
    return labels;
  };

  const buildVisibleRetrievalActionNote = (retrievalPlan = {}, {
    treeholeTotal = 0,
    sharedMemoryTotal = 0,
    userPrivateLabels = []
  } = {}) => {
    const parts = [];
    if (retrievalPlan.treehole) {
      parts.push(treeholeTotal > 0 ? `看了你的 BOH Cloud+ ${treeholeTotal} 条内容` : '看了你的 BOH Cloud+');
    }
    if (retrievalPlan.memory) parts.push('查看了 BOH 历史背景与导入知识库');
    if (retrievalPlan.sharedMemory) {
      parts.push(sharedMemoryTotal > 0 ? `查看了公共记忆库 ${sharedMemoryTotal} 条内容` : '查看了公共记忆库');
    }
    if (retrievalPlan.forum) parts.push('浏览了社区帖子');
    if (retrievalPlan.siteGuide) parts.push('查看了站点操作手册');
    if (retrievalPlan.userPrivate) {
      const labelText = Array.isArray(userPrivateLabels) && userPrivateLabels.length > 0
        ? userPrivateLabels.slice(0, 2).join('、')
        : '当前账号资料';
      parts.push(`查看了${labelText}`);
    }
    if (parts.length === 0) return '';
    return `${parts.join('，')}。`;
  };

  const getTreeholeMemoriesCached = async () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      treeholeMemoryCache.userId = '';
      treeholeMemoryCache.fetchedAt = 0;
      treeholeMemoryCache.items = [];
      return [];
    }

    const now = Date.now();
    const shouldUseCache = treeholeMemoryCache.userId === userId
      && (now - treeholeMemoryCache.fetchedAt) < TREEHOLE_MEMORY_CACHE_TTL_MS
      && Array.isArray(treeholeMemoryCache.items);

    if (shouldUseCache) {
      return treeholeMemoryCache.items;
    }

    const result = await getMyCloudEntriesForAI(userId, { limit: TREEHOLE_MEMORY_LIMIT });
    if (!result.ok) {
      logger.warn('boh-ai', '读取 BOH Cloud+ 上下文失败', result.error?.message || result.error);
      treeholeMemoryCache.userId = userId;
      treeholeMemoryCache.fetchedAt = now;
      treeholeMemoryCache.items = [];
      return [];
    }

    const items = Array.isArray(result.data) ? result.data : [];
    treeholeMemoryCache.userId = userId;
    treeholeMemoryCache.fetchedAt = now;
    treeholeMemoryCache.items = items;
    return items;
  };

  const selectTreeholeMemoriesByQuery = (memories, queryText) => {
    const source = Array.isArray(memories) ? memories : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    if (keywords.length === 0) {
      return source.slice(0, TREEHOLE_CONTEXT_MAX_ITEMS);
    }

    const scored = source
      .map((item, index) => {
        const content = normalizePromptLine(item?.content, TREEHOLE_CONTEXT_MAX_ITEM_CHARS);
        const mood = normalizePromptLine(item?.mood, 24);
        const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
        const title = normalizePromptLine(item?.title, 80);
        return {
          item,
          index,
          score: scoreChunk(`${title}\n${content}\n${mood}\n${tags}`, keywords)
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, TREEHOLE_CONTEXT_MAX_ITEMS)
      .map((entry) => entry.item);

    return scored.length > 0 ? scored : source.slice(0, TREEHOLE_CONTEXT_MAX_ITEMS);
  };

  const getTreeholeContext = async (queryText) => {
    const vectorChunks = await getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['cloud_entry'],
      limit: Math.min(12, TREEHOLE_CONTEXT_MAX_ITEMS),
      syncLimit: Math.min(80, TREEHOLE_MEMORY_LIMIT)
    });
    if (vectorChunks.length > 0) {
      return {
        context: buildVectorKnowledgeContext('用户 BOH Cloud+ 语义检索结果', vectorChunks, {
          citationPrefix: 'T',
          maxItems: Math.min(12, TREEHOLE_CONTEXT_MAX_ITEMS),
          maxContentChars: TREEHOLE_CONTEXT_MAX_ITEM_CHARS
        }),
        total: vectorChunks.length
      };
    }

    const memories = await getTreeholeMemoriesCached();
    if (!Array.isArray(memories) || memories.length === 0) {
      return { context: '', total: 0 };
    }

    const selected = selectTreeholeMemoriesByQuery(memories, queryText);
    if (selected.length === 0) {
      return { context: '', total: memories.length };
    }

    const body = selected.map((item, index) => {
      const content = normalizePromptLine(item?.content, TREEHOLE_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24) || '未标注';
      const tags = Array.isArray(item?.tags) && item.tags.length > 0
        ? item.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '无';
      const time = normalizePromptLine(item?.updatedAt || item?.createdAt, 40) || '未知';
      return `[T${index + 1}] 时间: ${time}\n心情: ${mood}\n标签: ${tags}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【用户 BOH Cloud+ 全部内容】\n${body}`,
      total: memories.length
    };
  };

  const rankForumPostsByQuery = (posts, queryText) => {
    const keywords = extractQueryKeywords(queryText);
    return [...posts]
      .map((post) => {
        const parsed = getPostTitleAndBody(post);
        const merged = [
          parsed.title,
          parsed.body,
          post?.author_username,
          post?.tagLabel,
          post?.tag
        ].join('\n');
        return {
          post,
          score: scoreChunk(merged, keywords) + Number(post?.search_rank || 0) * 10
        };
      })
      .sort((a, b) => b.score - a.score || new Date(b.post?.created_at || 0) - new Date(a.post?.created_at || 0))
      .map((item) => item.post);
  };

  const getForumTagFilterFromQuery = (queryText = '') => {
    const normalized = normalizeText(queryText);
    if (/(服务器|server|服主|开服|联机)/.test(normalized)) return 'server';
    if (/(活动|报名|赛事|周年|庆典|event)/.test(normalized)) return 'activity';
    if (/(提问|问题|求助|怎么|如何|为什么|question)/.test(normalized)) return 'question';
    if (/(日常|生活|闲聊|daily)/.test(normalized)) return 'daily';
    return '';
  };

  const getForumSortModeFromQuery = (queryText = '') => {
    const normalized = normalizeText(queryText);
    if (/(热帖|热门|最热|最多赞|点赞最多|评论最多|火)/.test(normalized)) return 'hottest';
    return 'latest';
  };

  const isLatestForumSummaryQuery = (queryText = '') => {
    const normalized = normalizeText(queryText);
    const forumIntent = /(论坛|帖子|社区|社群|方块之家|boh)/.test(normalized);
    const summaryIntent = /(总结|复盘|回顾|梳理|概括|整理|看看|近况|动态|发生了什么|大家在聊)/.test(normalized);
    const latestIntent = /(最新|最近|近期|近况|今天|当前|刚刚|发布|往下|前\s*5|五条|5\s*条)/.test(normalized);
    return forumIntent && summaryIntent && (latestIntent || /(总结|整理|概括).{0,8}(论坛|帖子|社区|社群)/.test(normalized));
  };

  const sortForumPostsByCreatedAtDesc = (posts = []) => {
    return [...(Array.isArray(posts) ? posts : [])].sort((a, b) => {
      const timeDiff = new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
      if (timeDiff !== 0) return timeDiff;
      return String(b?.id || '').localeCompare(String(a?.id || ''));
    });
  };

  const normalizeForumSummaryText = (text = '', maxChars = 260) => {
    const normalized = String(text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '这条帖子没有可直接读取的文字正文，可能主要是图片或附件内容。';
    return truncateText(normalized, maxChars);
  };

  const buildForumPostNaturalSummary = ({ title = '', body = '' } = {}) => {
    const safeTitle = normalizePromptLine(title, 80);
    const content = normalizeForumSummaryText(body, 220);
    if (!body || content.startsWith('这条帖子没有可直接读取')) {
      return safeTitle
        ? `这条帖子主要围绕《${safeTitle}》展开，但当前没有可读取的正文细节，所以只能确认它是一条以标题为主的社区动态。`
        : '这条帖子没有可读取的正文细节，只能确认它是一条较轻量的社区动态。';
    }

    const source = `${safeTitle} ${content}`;
    const hasQuestionTone = /[?？]|请问|求助|怎么|如何|为什么|有没有|能不能|可以吗/.test(source);
    const hasReminderTone = /(提醒|注意|千万|不要|别|小心|避开|记得)/.test(source);
    const hasShareTone = /(分享|记录|今天|刚刚|发现|看到|觉得|感觉|喜欢|萌|可爱|喵|哈哈|hhh|！|!)/i.test(source);
    const hasEventTone = /(活动|报名|更新|公告|上线|发布|安排|通知|时间|规则)/.test(source);

    const cleanedContent = content
      .replace(/[“”"']/g, '')
      .replace(/[!?！？。~～…]+/g, '，')
      .replace(/\s+/g, ' ')
      .trim();
    const detail = truncateText(cleanedContent, 96);
    const topic = safeTitle ? `《${safeTitle}》` : '这条动态';

    if (hasQuestionTone) {
      return `这条帖子更像是在围绕 ${topic} 提问或征求看法，作者想讨论的核心内容是：${detail}`;
    }
    if (hasReminderTone) {
      return `这条帖子主要是在做一个轻量提醒，作者围绕 ${topic} 表达了需要注意或避免的事情：${detail}`;
    }
    if (hasEventTone) {
      return `这条帖子偏向社区信息更新，重点和 ${topic} 有关，正文提到的关键信息是：${detail}`;
    }
    if (hasShareTone) {
      return `这是一条偏日常的社区分享，作者围绕 ${topic} 表达了即时感受或小发现，整体语气比较轻松：${detail}`;
    }
    return `这条帖子主要围绕 ${topic} 展开，正文核心内容可以概括为：${detail}`;
  };

  const buildExtractiveForumSummaryAnswer = (posts = []) => {
    const source = Array.isArray(posts) ? posts.slice(0, FORUM_MAX_POSTS) : [];
    if (source.length === 0) {
      return '未检索到论坛帖子，无法生成最新 5 条总结。';
    }

    const lines = [`我按发布时间从新到旧看了最新 ${source.length} 条论坛帖子。下面是基于标题、正文和互动数据整理出的自然概括，不补充帖子里没有写到的背景。`];

    source.forEach((post, index) => {
      const parsed = getPostTitleAndBody(post);
      const title = parsed.title || '无标题';
      const author = normalizePromptLine(post?.author_username, 40) || '未知作者';
      const authorIdLabel = author === '未知作者' ? '未知作者' : `@${author.replace(/^@+/, '')}`;
      const time = formatPromptDateTime(post?.created_at, '未知');
      const postId = String(post?.id || '').trim();
      const url = postId ? `#/forum/post/${postId}` : '#/forum';
      const body = parsed.body || post?.content || '';
      const summary = buildForumPostNaturalSummary({ title, body });
      const likes = Number(post?.like_count || post?.likes_count || 0);
      const comments = Number(post?.comment_count || 0);
      const interaction = likes > 0 || comments > 0
        ? `目前有 ${likes} 个赞、${comments} 条评论`
        : '目前还没有明显互动';

      lines.push([
        '',
        `${index + 1}. ${authorIdLabel} 在 ${time} 发布了《${title}》。`,
        `${summary}`,
        `${interaction}。`,
        `链接：${url}`
      ].join('\n'));
    });

    return lines.join('\n');
  };

  const buildForumNarrativeSummaryPrompt = (posts = []) => {
    const source = Array.isArray(posts) ? posts.slice(0, FORUM_MAX_POSTS) : [];
    const body = source.map((post, index) => {
      const parsed = getPostTitleAndBody(post);
      const title = normalizePromptLine(parsed.title || '无标题', 90);
      const author = normalizePromptLine(post?.author_username, 40) || '未知作者';
      const time = formatPromptDateTime(post?.created_at, '未知');
      const tag = normalizePromptLine(post?.tagLabel || post?.tag, 24) || '未标注';
      const likes = Number(post?.like_count || post?.likes_count || 0);
      const comments = Number(post?.comment_count || 0);
      const content = normalizeForumSummaryText(parsed.body || post?.content || '', 700);
      return [
        `P${index + 1}`,
        `标题：${title}`,
        `作者：${author}`,
        `发布时间：${time}`,
        `标签：${tag}`,
        `互动：${likes}赞，${comments}评论`,
        `正文：${content}`
      ].join('\n');
    }).join('\n\n');

    return `你是 BOH 社区动态整理助手。请基于下面按发布时间从新到旧排列的真实论坛帖子，写一段自然语言总结。

【真实帖子资料】
${body || '无'}

【输出要求】
1. 只输出一个自然语言段落，不要分条、不要列表、不要表格、不要字段名。
2. 必须覆盖每条资料中的帖子，且按 P1、P2、P3、P4、P5 的顺序叙述；P1 是最新发布，后面依次更早。
3. 每条帖子都要明确写出“用户「作者名」”发了什么，并紧跟对应帖子内容的准确概括；作者名必须逐字来自资料中的“作者”，不能替换、猜测或混淆。
4. 像给朋友讲社区刚刚发生了什么一样自然概括，语气克制、清楚、有一点叙事感。
5. 可以概括、改写、合并语气相近的表达，但不能合并错作者，不能添加资料中没有的事件、人物关系、动机、背景、结论或情绪。
6. 不要直接复制原文句子；尽量用自己的话概括每条帖子在表达什么。
7. 不输出查看链接、URL、证据编号、帖子 ID。
8. 如果某条帖子正文很短或只有标题，只能说它是一条简短动态，不要扩写细节。
9. 在输出前自检：每一个“用户「作者名」”后面的概括必须来自同一个 P 条目，不得串帖。
10. 必须保留原文的语义方向，尤其是“大/小、太多/太少、喜欢/不喜欢、要/不要、能/不能、已经/还没”等极性表达，绝不能改成相反意思。
11. 控制在 260-560 个中文字符。`;
  };

  const removeForumSummaryLinks = (text = '') => String(text || '')
    .replace(/#\/forum\/post\/[a-z0-9-]+/gi, '')
    .replace(/\[[FP]\d+\]/g, '')
    .replace(/查看(?:帖子)?[：:]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const getForumSummarySourceText = (posts = []) => {
    return (Array.isArray(posts) ? posts : [])
      .slice(0, FORUM_MAX_POSTS)
      .map((post) => {
        const parsed = getPostTitleAndBody(post);
        return `${parsed.title || ''} ${parsed.body || post?.content || ''}`;
      })
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const FORUM_SUMMARY_POLARITY_RULES = [
    { source: ['太小', '偏小', '小了', '很小', '太迷你'], forbidden: ['太大', '偏大', '大了', '很大', '过大'] },
    { source: ['太大', '偏大', '大了', '很大', '过大'], forbidden: ['太小', '偏小', '小了', '很小', '太迷你'] },
    { source: ['太少', '偏少', '少了', '不够多'], forbidden: ['太多', '偏多', '多了', '过多'] },
    { source: ['太多', '偏多', '多了', '过多'], forbidden: ['太少', '偏少', '少了', '不够多'] },
    { source: ['不喜欢', '不太喜欢', '没那么喜欢', '讨厌'], forbidden: ['喜欢', '很喜欢', '挺喜欢'] },
    { source: ['不要', '别 ', '别去', '别拿', '千万不要'], forbidden: ['要去', '要拿', '应该去', '应该拿'] },
    { source: ['不能', '不可以', '无法'], forbidden: ['能 ', '可以', '能够'] },
    { source: ['还没', '没有', '未完成'], forbidden: ['已经', '完成了', '已完成'] }
  ];

  const detectForumSummaryPolarityConflicts = (sourceText = '', summaryText = '') => {
    const source = String(sourceText || '');
    const summary = String(summaryText || '');
    if (!source || !summary) return [];

    return FORUM_SUMMARY_POLARITY_RULES.flatMap((rule) => {
      const sourceHits = rule.source.filter((term) => source.includes(term));
      if (sourceHits.length === 0) return [];
      const sourceHasForbidden = rule.forbidden.some((term) => source.includes(term));
      if (sourceHasForbidden) return [];
      const forbiddenHits = rule.forbidden.filter((term) => summary.includes(term));
      if (forbiddenHits.length === 0) return [];
      return [`原文出现「${sourceHits.join(' / ')}」，总结却出现相反表达「${forbiddenHits.join(' / ')}」`];
    });
  };

  const buildForumSearchQueries = (queryText = '') => {
    const raw = normalizePromptLine(queryText, 120);
    const keywords = extractQueryKeywords(raw)
      .filter((keyword) => ![
        '论坛', '帖子', '发帖', '搜索', '检索', '查看', '社区', '动态', '最近', '最新',
        '今天', '近期', '本周', '本月', '有没有', '哪些', '什么', '大家', '有人'
      ].includes(keyword))
      .filter((keyword) => keyword.length >= 2)
      .sort((a, b) => b.length - a.length);

    const candidates = [
      raw,
      keywords.slice(0, 3).join(' '),
      ...keywords.slice(0, 4)
    ]
      .map((item) => normalizePromptLine(item, 80))
      .filter(Boolean);

    return [...new Set(candidates)].slice(0, 5);
  };

  const mergeForumPosts = (target = [], nextPosts = []) => {
    const seen = new Set(target.map((post) => String(post?.id || '').trim()).filter(Boolean));
    for (const post of Array.isArray(nextPosts) ? nextPosts : []) {
      const id = String(post?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      target.push(post);
    }
    return target;
  };

  // 获取论坛数据
  const getForumContext = async (queryText = '') => {
    try {
      const latestSummaryMode = isLatestForumSummaryQuery(queryText);
      const sortMode = latestSummaryMode ? 'latest' : getForumSortModeFromQuery(queryText);
      const tagFilter = getForumTagFilterFromQuery(queryText);
      const candidateQueries = latestSummaryMode ? [] : buildForumSearchQueries(queryText);
      const mergedPosts = [];

      for (const searchQuery of candidateQueries) {
        const { data: searchPosts } = await getPosts(null, {
          page: 1,
          pageSize: 8,
          limit: 8,
          sortMode,
          searchQuery,
          tagFilter
        });
        mergeForumPosts(mergedPosts, searchPosts);
        if (mergedPosts.length >= Math.max(FORUM_MAX_POSTS, 6)) break;
      }

      if (mergedPosts.length < FORUM_MAX_POSTS) {
        const { data: fallbackPosts } = await getPosts(null, {
          page: 1,
          pageSize: latestSummaryMode ? FORUM_MAX_POSTS : 10,
          limit: latestSummaryMode ? FORUM_MAX_POSTS : 10,
          sortMode,
          tagFilter
        });
        mergeForumPosts(mergedPosts, fallbackPosts);
      }

      const posts = mergedPosts;
      if (!Array.isArray(posts) || posts.length === 0) return '';

      const rankedPosts = latestSummaryMode
        ? sortForumPostsByCreatedAtDesc(posts)
        : rankForumPostsByQuery(posts, queryText);
      const selectedPosts = rankedPosts.slice(0, FORUM_MAX_POSTS);
      const forumContext = selectedPosts.map((post, index) => {
        const parsed = getPostTitleAndBody(post);
        const title = parsed.title || '无标题';
        const author = normalizePromptLine(post?.author_username, 40) || '未知作者';
        const authorIdLabel = author === '未知作者' ? '未知作者' : `@${author.replace(/^@+/, '')}`;
        const preview = String(parsed.body || '').slice(0, FORUM_MAX_CHARS_PER_POST);
        const likes = Number(post?.like_count || post?.likes_count || 0);
        const comments = Number(post?.comment_count || 0);
        const tag = normalizePromptLine(post?.tagLabel || post?.tag, 24) || '未标注';
        const time = formatPromptDate(post?.created_at, '未知');
        const postId = String(post?.id || '').trim();
        const url = postId ? `#/forum/post/${postId}` : '#/forum';
        const excerpt = normalizePromptLine(post?.search_excerpt, FORUM_MAX_CHARS_PER_POST);
        return [
          `[F${index + 1}] 【论坛帖子】${title}`,
          `发帖ID：${authorIdLabel} ｜ 标签：${tag} ｜ 时间：${time}`,
          `查看：${url}`,
          `内容：${excerpt || preview}${!excerpt && parsed.body.length > FORUM_MAX_CHARS_PER_POST ? '...' : ''}`,
          `互动：点赞 ${likes}，评论 ${comments}`
        ].join('\n');
      }).join('\n\n');

      return {
        context: `【社区帖子检索结果】\n检索词：${candidateQueries.join(' / ') || '最新社区帖子'}\n排序：${sortMode === 'hottest' ? '热门优先' : '最新优先'}${tagFilter ? `\n标签过滤：${tagFilter}` : ''}${latestSummaryMode ? `\n输出约束：必须严格按 [F1] 到 [F${selectedPosts.length}] 的顺序总结；[F1] 是当前检索到的最新发布帖子，后续依次按发布时间从新到旧排列。不要按热度、重要性或相关性重排。` : ''}\n\n${forumContext}`,
        total: selectedPosts.length,
        evidenceRefs: selectedPosts.map((_, index) => `F${index + 1}`),
        labels: [`社区帖子(${selectedPosts.length}条)`],
        confidence: selectedPosts.length > 0 ? 0.86 : 0,
        metadata: {
          sortMode,
          tagFilter,
          query: candidateQueries[0] || '',
          latestSummaryMode,
          posts: selectedPosts
        }
      };
    } catch (error) {
      logger.error('boh-ai', '获取论坛数据失败', error);
      return { context: '', total: 0 };
    }
  };

  const resolveUserPrivateRetrievalPlan = (queryText = '') => {
    const normalized = normalizeText(queryText);
    if (!normalized) {
      return {
        shouldUse: false,
        overview: false,
        posts: false,
        gifts: false,
        birthday: false,
        pushplus: false,
        subscriptions: false
      };
    }

    const hasPersonalPronoun = USER_PRIVATE_PERSONAL_PATTERN.test(normalized);
    const asksSummary = containsAnyKeyword(normalized, USER_PRIVATE_SUMMARY_KEYWORDS)
      || (hasPersonalPronoun && /(信息|资料|状态|情况|数据|内容|账户|账号)/.test(normalized));
    const asksAll = (asksSummary || hasPersonalPronoun)
      && containsAnyKeyword(normalized, USER_PRIVATE_ALL_KEYWORDS);

    const posts = containsAnyKeyword(normalized, USER_PRIVATE_POST_KEYWORDS)
      || (hasPersonalPronoun && /(帖子|发帖|论坛)/.test(normalized));
    const gifts = containsAnyKeyword(normalized, USER_PRIVATE_GIFT_KEYWORDS)
      || (hasPersonalPronoun && /(礼物|礼品)/.test(normalized));
    const birthday = containsAnyKeyword(normalized, USER_PRIVATE_BIRTHDAY_KEYWORDS)
      || (hasPersonalPronoun && /生日/.test(normalized));
    const pushplus = containsAnyKeyword(normalized, USER_PRIVATE_PUSHPLUS_KEYWORDS)
      || (hasPersonalPronoun && /推送/.test(normalized));
    const subscriptions = containsAnyKeyword(normalized, USER_PRIVATE_SUBSCRIPTION_KEYWORDS)
      || (hasPersonalPronoun && /(订阅|会员|积分|套餐)/.test(normalized));

    const shouldUseByIntent = asksSummary || asksAll || posts || gifts || birthday || pushplus || subscriptions;
    if (!shouldUseByIntent) {
      return {
        shouldUse: false,
        overview: false,
        posts: false,
        gifts: false,
        birthday: false,
        pushplus: false,
        subscriptions: false
      };
    }

    // “如何发帖”等纯操作问题优先走站点操作知识，不触发用户私域读库。
    if (
      isOperationQuestion(normalized)
      && !asksSummary
      && !asksAll
      && !gifts
      && !birthday
      && !pushplus
      && !subscriptions
      && !containsAnyKeyword(normalized, ['我的帖子', '我发的帖子', '我的发帖'])
    ) {
      return {
        shouldUse: false,
        overview: false,
        posts: false,
        gifts: false,
        birthday: false,
        pushplus: false,
        subscriptions: false
      };
    }

    return {
      shouldUse: true,
      overview: asksSummary || asksAll || posts || gifts || birthday || pushplus || subscriptions,
      posts: asksAll || posts,
      gifts: asksAll || gifts,
      birthday: asksAll || birthday,
      pushplus: asksAll || pushplus,
      subscriptions: asksAll || subscriptions
    };
  };

  const getUserPrivateSnapshotCached = async () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      resetUserPrivateContextCache();
      return null;
    }

    const now = Date.now();
    const shouldUseCache = userPrivateContextCache.userId === userId
      && (now - userPrivateContextCache.fetchedAt) < USER_PRIVATE_CONTEXT_CACHE_TTL_MS
      && userPrivateContextCache.snapshot;
    if (shouldUseCache) {
      return userPrivateContextCache.snapshot;
    }

    const [
      profileResult,
      postResult,
      giftResult,
      subscriptionResult
    ] = await Promise.allSettled([
      supabase
        .from('profiles')
        .select(`
          id,
          username,
          role,
          points,
          join_date,
          birth_month,
          birth_day,
          pushplus_enabled,
          gift_status,
          gift_content,
          gift_no,
          gift_price
        `)
        .eq('id', userId)
        .maybeSingle(),
      getUserPosts(userId, userId, { page: 1, pageSize: USER_PRIVATE_POSTS_FETCH_LIMIT, limit: USER_PRIVATE_POSTS_FETCH_LIMIT }),
      supabase
        .from('user_gifts')
        .select(`
          id,
          user_id,
          gift_no,
          gift_content,
          gift_price,
          gift_status,
          is_active,
          completed_at,
          created_at,
          updated_at
        `)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(USER_PRIVATE_GIFTS_FETCH_LIMIT),
      getMySubscriptions(userId, { includeExpired: true })
    ]);

    const profileValue = profileResult.status === 'fulfilled' ? profileResult.value : null;
    if (profileValue?.error && !isMissingRelationError(profileValue.error, 'profiles')) {
      logger.warn('boh-ai', '读取当前用户档案失败', profileValue.error?.message || profileValue.error);
    }

    const postValue = postResult.status === 'fulfilled' ? postResult.value : null;
    if (postValue?.error && !isMissingRelationError(postValue.error, 'posts')) {
      logger.warn('boh-ai', '读取当前用户帖子失败', postValue.error?.message || postValue.error);
    }

    const giftValue = giftResult.status === 'fulfilled' ? giftResult.value : null;
    if (giftValue?.error && !isMissingRelationError(giftValue.error, 'user_gifts')) {
      logger.warn('boh-ai', '读取当前用户礼物失败', giftValue.error?.message || giftValue.error);
    }

    const subscriptionValue = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
    if (subscriptionValue?.error && !isMissingRelationError(subscriptionValue.error, 'user_subscriptions')) {
      logger.warn('boh-ai', '读取当前用户订阅失败', subscriptionValue.error?.message || subscriptionValue.error);
    }

    const mergedProfile = {
      id: userId,
      username: String(userInfo.value?.username || ''),
      role: String(userInfo.value?.role || 'user'),
      points: Number(userInfo.value?.points || 0),
      join_date: userInfo.value?.joinDate || null,
      birth_month: userInfo.value?.birthMonth || '',
      birth_day: userInfo.value?.birthDay || '',
      pushplus_enabled: false,
      gift_status: '',
      gift_content: '',
      gift_no: '',
      gift_price: 0,
      ...(profileValue?.data || {})
    };
    mergedProfile.points = Number(mergedProfile.points || 0);
    mergedProfile.gift_price = Number(mergedProfile.gift_price || 0);
    mergedProfile.pushplus_enabled = Boolean(mergedProfile.pushplus_enabled);

    const snapshot = {
      userId,
      profile: mergedProfile,
      posts: Array.isArray(postValue?.data) ? postValue.data : [],
      gifts: Array.isArray(giftValue?.data) ? giftValue.data : [],
      subscriptions: Array.isArray(subscriptionValue?.data) ? subscriptionValue.data : []
    };

    userPrivateContextCache.userId = userId;
    userPrivateContextCache.fetchedAt = now;
    userPrivateContextCache.snapshot = snapshot;
    return snapshot;
  };

  const selectItemsByQuery = (items, queryText, projector, maxItems = USER_PRIVATE_CONTEXT_MAX_ITEMS) => {
    const source = Array.isArray(items) ? items : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    if (keywords.length === 0) {
      return source.slice(0, maxItems);
    }

    const scored = source.map((item) => ({
      item,
      score: scoreChunk(String(projector(item) || ''), keywords)
    }));

    const matched = scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map((entry) => entry.item);

    if (matched.length > 0) return matched;
    return source.slice(0, maxItems);
  };

  const getUserOverviewContext = (snapshot) => {
    const profile = snapshot?.profile || {};
    const username = normalizePromptLine(profile?.username, 32) || '未知';
    const role = normalizePromptLine(profile?.role, 16) || 'user';
    const points = Number(profile?.points || 0);
    const joinDate = formatPromptDate(profile?.join_date, '未知');

    return {
      context: `【当前登录用户概览】\n用户名: ${username}\n角色: ${role}\n当前积分: ${points}\n加入时间: ${joinDate}`,
      label: '当前用户概览'
    };
  };

  const getUserPostsPrivateContext = (snapshot, queryText) => {
    const posts = Array.isArray(snapshot?.posts) ? snapshot.posts : [];
    const selected = selectItemsByQuery(
      posts,
      queryText,
      (post) => {
        const parsed = parsePostTitleAndBody(post?.content);
        return `${parsed.title}\n${parsed.body}`;
      }
    );

    if (posts.length === 0) {
      return {
        context: '【当前用户发帖记录】\n当前账号暂无发帖记录。',
        total: 0,
        label: '我的帖子(0条)'
      };
    }

    const body = selected.map((post, index) => {
      const parsed = parsePostTitleAndBody(post?.content);
      const preview = normalizePromptLine(parsed.body, USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS);
      const time = formatPromptDate(post?.created_at, '未知');
      const likes = Number(post?.like_count || post?.likes_count || 0);
      const comments = Number(post?.comment_count || 0);
      const status = normalizePromptLine(post?.status, 12) || 'approved';
      return `[${index + 1}] ${parsed.title}\n时间: ${time}  状态: ${status}\n互动: 点赞 ${likes} / 评论 ${comments}\n内容: ${preview || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【当前用户发帖记录】\n总帖数: ${posts.length}\n${body}`,
      total: posts.length,
      label: `我的帖子(${posts.length}条)`
    };
  };

  const getUserGiftPrivateContext = (snapshot) => {
    const gifts = Array.isArray(snapshot?.gifts) ? snapshot.gifts : [];
    const profile = snapshot?.profile || {};
    let source = gifts;

    if (source.length === 0 && profile?.gift_content) {
      source = [{
        id: 'profile_fallback',
        gift_no: profile?.gift_no || '未知',
        gift_content: profile?.gift_content || '',
        gift_price: profile?.gift_price || 0,
        gift_status: profile?.gift_status || 'preparing',
        is_active: true,
        updated_at: null,
        created_at: null
      }];
    }

    if (source.length === 0) {
      return {
        context: '【当前用户礼物状态】\n当前账号暂无礼物记录。',
        total: 0,
        activeCount: 0,
        label: '礼物(0条)'
      };
    }

    const active = source.filter((gift) => Boolean(gift?.is_active));
    const ordered = [
      ...active,
      ...source.filter((gift) => !gift?.is_active)
    ].slice(0, USER_PRIVATE_CONTEXT_MAX_ITEMS);

    const body = ordered.map((gift, index) => {
      const content = normalizePromptLine(gift?.gift_content, 42) || '未命名礼物';
      const statusKey = String(gift?.gift_status || 'preparing').toLowerCase();
      const status = GIFT_STATUS_LABELS[statusKey] || statusKey || '未知';
      const price = Number(gift?.gift_price || 0);
      const updatedAt = formatPromptDate(gift?.updated_at || gift?.created_at || gift?.completed_at, '未知');
      const stage = gift?.is_active ? '进行中' : '历史';
      const giftNo = normalizePromptLine(gift?.gift_no, 24) || '未知';
      return `[${index + 1}] ${content}\n编号: ${giftNo}\n状态: ${status} (${stage})  金额: ${price}\n更新时间: ${updatedAt}`;
    }).join('\n\n');

    return {
      context: `【当前用户礼物状态】\n总记录: ${source.length}\n进行中: ${active.length}\n${body}`,
      total: source.length,
      activeCount: active.length,
      label: active.length > 0 ? `礼物(进行中${active.length})` : `礼物(${source.length}条)`
    };
  };

  const getUserBirthdayPrivateContext = (snapshot) => {
    const profile = snapshot?.profile || {};
    const countdown = getBirthdayCountdown(profile?.birth_month, profile?.birth_day);

    if (!countdown) {
      return {
        context: '【当前用户生日会信息】\n当前账号尚未设置生日（月/日），可前往个人资料补充后启用生日会提醒。',
        label: '生日会(未设置)'
      };
    }

    const daysHint = countdown.daysUntil === 0
      ? '就是今天'
      : `${countdown.daysUntil} 天后`;

    return {
      context: `【当前用户生日会信息】\n生日: ${countdown.month} 月 ${countdown.day} 日\n下一个生日: ${countdown.nextDate}（${daysHint}）`,
      label: countdown.daysUntil === 0 ? '生日会(今天)' : '生日会'
    };
  };

  const getUserPushplusPrivateContext = (snapshot) => {
    const profile = snapshot?.profile || {};
    const enabled = Boolean(profile?.pushplus_enabled);
    return {
      context: `【当前用户 Pushplus 状态】\nPushplus 离线推送: ${enabled ? '已开启' : '未开启'}`,
      enabled,
      label: enabled ? 'Pushplus(已开启)' : 'Pushplus(未开启)'
    };
  };

  const getUserSubscriptionPrivateContext = (snapshot) => {
    const subscriptions = Array.isArray(snapshot?.subscriptions) ? snapshot.subscriptions : [];
    const nowTs = Date.now();
    const active = subscriptions.filter((item) => {
      if (String(item?.status || '') !== 'active') return false;
      if (!item?.expiresAt) return true;
      const expiresTs = new Date(item.expiresAt).getTime();
      return Number.isFinite(expiresTs) ? expiresTs > nowTs : true;
    });

    const preferred = (active.length > 0 ? active : subscriptions).slice(0, USER_PRIVATE_CONTEXT_MAX_ITEMS);
    const points = Number(snapshot?.profile?.points || 0);

    if (subscriptions.length === 0) {
      return {
        context: `【当前用户订阅与积分】\n当前积分: ${points}\n当前无付费订阅记录。`,
        activeCount: 0,
        label: '订阅(0项)'
      };
    }

    const body = preferred.map((item, index) => {
      const planName = normalizePromptLine(item?.planName || item?.plan_name, 40) || '未知套餐';
      const cycle = formatBillingCycleLabel(item?.billingCycle || item?.billing_cycle);
      const expiresAt = formatPromptDate(item?.expiresAt || item?.expires_at, '未知');
      const statusKey = String(item?.status || '').toLowerCase();
      const status = SUBSCRIPTION_STATUS_LABELS[statusKey] || statusKey || '未知';
      const pointsCost = Number(item?.pointsCost || item?.points_cost || 0);
      return `[${index + 1}] ${planName}\n周期: ${cycle}\n状态: ${status}\n到期: ${expiresAt}\n积分消耗: ${pointsCost}`;
    }).join('\n\n');

    return {
      context: `【当前用户订阅与积分】\n当前积分: ${points}\n订阅记录: ${subscriptions.length} 项（生效中 ${active.length}）\n${body}`,
      activeCount: active.length,
      label: active.length > 0 ? `订阅(生效${active.length}项)` : `订阅(${subscriptions.length}项)`
    };
  };

  const getUserPrivateContext = async (queryText) => {
    const plan = resolveUserPrivateRetrievalPlan(queryText);
    if (!plan.shouldUse) {
      return {
        context: '',
        labels: []
      };
    }

    if (!isLoggedIn.value || !userInfo.value?.id) {
      return {
        context: '【用户私域证据 [U1]】\n未检测到登录用户。若需要查询“我的帖子/礼物/生日会/Pushplus/订阅积分”，请先登录账号。',
        labels: ['登录状态(未登录)']
      };
    }

    const snapshot = await getUserPrivateSnapshotCached();
    if (!snapshot) {
      return {
        context: '',
        labels: []
      };
    }

    const blocks = [];
    const labels = [];

    if (plan.overview) {
      const result = getUserOverviewContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.posts) {
      const result = getUserPostsPrivateContext(snapshot, queryText);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.gifts) {
      const result = getUserGiftPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.birthday) {
      const result = getUserBirthdayPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.pushplus) {
      const result = getUserPushplusPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.subscriptions) {
      const result = getUserSubscriptionPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    const wrappedBlocks = blocks
      .map((block, index) => `【用户私域证据 [U${index + 1}]】\n${block}`)
      .filter(Boolean);

    return {
      context: wrappedBlocks.join('\n\n'),
      labels
    };
  };

  const createReadConnectors = () => [
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.cloud,
      planKey: 'treehole',
      label: 'BOH Cloud+',
      source: 'BOH Cloud+ 私有内容',
      evidencePrefix: 'T',
      requiresLogin: true,
      read: getTreeholeContext,
      describeAction: (result) => (
        Number(result?.total || 0) > 0
          ? `看了你的 BOH Cloud+ ${Number(result.total)} 条内容`
          : '看了你的 BOH Cloud+'
      )
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.sharedMemory,
      planKey: 'sharedMemory',
      label: 'AI 公共记忆',
      source: 'AI 公共记忆库',
      evidencePrefix: 'S',
      read: getSharedMemoryContext,
      describeAction: (result) => (
        Number(result?.total || 0) > 0
          ? `查看了公共记忆库 ${Number(result.total)} 条内容`
          : '查看了公共记忆库'
      )
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.knowledge,
      planKey: 'memory',
      label: '核心记忆库/导入知识库',
      source: 'BOH 历史背景与导入知识库',
      evidencePrefix: 'K',
      read: getMemoryContext,
      describeAction: () => '查看了 BOH 历史背景与导入知识库'
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.siteGuide,
      planKey: 'siteGuide',
      label: '站点操作手册',
      source: '站点操作与路径知识库',
      evidencePrefix: 'G',
      read: (queryText) => getSiteGuideContext(queryText),
      describeAction: () => '查看了站点操作手册'
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.forum,
      planKey: 'forum',
      label: '社区帖子',
      source: '社区帖子',
      evidencePrefix: 'F',
      read: getForumContext,
      describeAction: (result) => {
        const total = Number(result?.total || 0);
        return total > 0 ? `检索了社区帖子 ${total} 条` : '检索了社区帖子';
      }
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.userPrivate,
      planKey: 'userPrivate',
      label: '当前账号资料',
      source: '当前登录用户私域数据',
      evidencePrefix: 'U',
      requiresLogin: true,
      read: getUserPrivateContext,
      describeAction: (result) => {
        const labels = Array.isArray(result?.labels) ? result.labels : [];
        const labelText = labels.length > 0 ? labels.slice(0, 2).join('、') : '当前账号资料';
        return `查看了${labelText}`;
      }
    })
  ];

  const buildAutoKnowledgeContext = async (queryText, { forceTreehole = false } = {}) => {
    const routingDecision = resolveKnowledgeRoutingPlan(queryText);
    const retrievalPlan = routingDecision.plan;
    if (forceTreehole && isLoggedIn.value && userInfo.value?.id && isTreeholeMemoryEnabled.value) {
      retrievalPlan.treehole = true;
    }
    if (isForumSearchEnabled.value) {
      retrievalPlan.forum = true;
    }
    // 统一开关过滤：未开启的知识源强制关闭
    if (!isSharedMemoryEnabled.value) {
      retrievalPlan.sharedMemory = false;
    }
    if (!isKnowledgeBaseEnabled.value) {
      retrievalPlan.memory = false;
      retrievalPlan.siteGuide = false;
    }
    const routingReasons = Array.isArray(routingDecision.reasons) ? routingDecision.reasons : [];
    const connectorResults = await runBohAIReadConnectors({
      connectors: createReadConnectors(),
      plan: retrievalPlan,
      queryText,
      logger
    });
    const connectorSummary = summarizeBohAIConnectorResults(connectorResults);
    const rankedContextBlocks = rankEvidenceContextBlocks(connectorResults, queryText).map((item) => item.context);

    const contextText = compressKnowledgeContextBlocks(rankedContextBlocks.length > 0 ? rankedContextBlocks : connectorSummary.contextBlocks, {
      maxChars: KNOWLEDGE_CONTEXT_MAX_CHARS,
      maxPerBlock: KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS
    });
    const evidenceRefs = connectorSummary.evidenceRefs.length > 0
      ? connectorSummary.evidenceRefs
      : extractCitationIdsFromText(contextText);
    const retrievalTrace = createBohAIRetrievalTrace({
      queryText,
      retrievalPlan,
      routingReasons,
      connectorResults
    });

    return {
      retrievalPlan,
      routingReasons,
      connectorResults,
      retrievalTrace,
      treeholeTotal: Number(connectorSummary.totalsById[BOHAI_CONNECTOR_IDS.cloud] || 0),
      sharedMemoryTotal: Number(connectorSummary.totalsById[BOHAI_CONNECTOR_IDS.sharedMemory] || 0),
      userPrivateLabels: connectorSummary.labelsById[BOHAI_CONNECTOR_IDS.userPrivate] || [],
      evidenceRefs,
      contextText
    };
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

    const summaryModel = runtimeAvailableModels.value.find(m => m.id === 'Qwen/Qwen2.5-7B-Instruct') || runtimeAvailableModels.value[0];
    if (!summaryModel?.id) return;
    const summarySignal = requestSignal || (typeof AbortController !== 'undefined' ? new AbortController().signal : undefined);

    try {
      // 摘要容量已从 220 中文字 / max_tokens 420 提到 500 中文字 / max_tokens 1100，
      // 与 CONVERSATION_SUMMARY_MAX_CHARS=2000 对齐，让早期对话细节尽量保留。
      const summaryPrompt = [
        '请把以下 BOH AI 对话历史压缩成一段可复用上下文摘要。',
        '要求：',
        '- 最多 500 中文字。',
        '- 保留用户目标、偏好、已确认事实、当前任务状态。',
        '- 删除寒暄、重复内容、无效报错和已解决细节。',
        '- 不要添加原文没有的信息。',
        '',
        olderMessages.map((message) => `${message.role}: ${message.content}`).join('\n')
      ].join('\n');

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
      const parsed = _safeJsonParse(String(raw || '').trim());
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
    } finally {
      window.clearTimeout(plannerTimeout);
      if (requestSignal) requestSignal.removeEventListener('abort', handleParentAbort);
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

      const rawReply = await callModelInternal(
        generationModel.id,
        prompt,
        systemPromptContent,
        historyMessages,
        requestController.signal,
        0,
        generationProfile
      );
      let finalContent = cleanAssistantVisibleReply(filterThinkingContent(rawReply));
      if (isDegenerateAssistantReply(finalContent)) {
        finalContent = '这次生成内容异常，我没有把异常内容展示出来。请重新发送一次，我会用当前模式重新回答。';
      }
      const safeFinalContent = finalContent || '我暂时没有生成到有效内容，请再试一次。';
      await animateAssistantContent(safeFinalContent, updateContent, {
        requestSignal: requestController.signal,
        charDelayMs: activeModeId === 'fast' ? 12 : 30,
        chunkSize: activeModeId === 'fast' ? 2 : 1
      });
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
        updateContent(`抱歉，我遇到了一些问题: ${error?.message || '未知错误'}，请稍后再试。`);
      }
    } finally {
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
    }
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
    await runSimpleChatTurn({ sessionIndex, session, userText });
    return;

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
            const content = await callModelInternal(
              activeModelId.value,
              String(query || ''),
              activeModeSystemPrompt.value || '',
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
          onStream: (text) => {
            const target = getSessionByIndex(sessionIndex);
            const message = target?.messages?.[clusterMessageIndex];
            if (message) {
              message.content = String(text || '');
              scrollToBottom();
            }
          }
        });
        if (result?.degraded) {
          const target = getSessionByIndex(sessionIndex);
          const message = target?.messages?.[clusterMessageIndex];
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
            : `Agent 集群运行失败：${String(clusterError?.message || clusterError).slice(0, 200)}`;
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
    startThinkingTimer();
    // 上下文窗口接近上限时，先把会话历史压成摘要，再让模型拿到真正"压缩后"的上下文。
    // 摘要生成失败/无更新会快速 no-op 退出，不会阻塞发送。
    await ensureContextCompression(sessionIndex);
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
    const waitTypewriterFrame = () => new Promise((resolve) => setTimeout(resolve, TYPEWRITER_FRAME_MS));
    const appendContentTypewriter = async (baseText, appendText) => {
      const base = String(baseText || '');
      const append = String(appendText || '');
      if (!append) return base;
      const finalText = `${base}${append}`;
      let pos = base.length;
      while (pos < finalText.length) {
        if (requestController.signal.aborted) break;
        const tail = finalText.slice(pos, pos + TYPEWRITER_CHARS_PER_FRAME + 2);
        const step = /[。！？!?\n]\s*$/.test(tail)
          ? TYPEWRITER_CHARS_PER_FRAME + 1
          : TYPEWRITER_CHARS_PER_FRAME;
        pos = Math.min(finalText.length, pos + step);
        updateContent(finalText.slice(0, pos));
        if (pos < finalText.length) {
          await waitTypewriterFrame();
        }
      }
      return finalText;
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
        setProgressContent(`> **正在搜索**: "${routingQueryText}"...\n\n`);
      }

      // 自动知识路由：回答前先做关键词判断，再决定是否检索对应知识源
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
          appendProgressContent(`> **自动检索中**: ${retrievalTargets.join('、')}...\n\n`);
        }

        if (Array.isArray(routingReasons) && routingReasons.length > 0) {
          appendProgressContent(`> **知识路由**: ${routingReasons.slice(0, 4).join('；')}\n\n`);
        }

        if (contextText) {
          hasKnowledgeContext = true;
          internalEvidenceContext = truncateText(contextText, MAX_PROMPT_EXTRA_CHARS);
          groundingEvidenceRefs = Array.isArray(evidenceRefs) ? evidenceRefs.slice(0, 32) : [];
          if (retrievalTargets.length > 0) {
            appendProgressContent('> ✅ **已完成内部检索**\n\n');
            markGenerationProgress('已找到相关资料，正在整理回答依据...');
          }
        } else if (retrievalTargets.length > 0) {
          appendProgressContent('> ⚠️ **未检索到匹配内部资料**\n\n');
          markGenerationProgress('未找到明确资料，正在分析问题本身...');
        }
      } catch (knowledgeError) {
        logger.error('boh-ai', 'Knowledge retrieval failed', knowledgeError);
        appendProgressContent(`> ❌ **内部检索失败**: ${knowledgeError.message}\n\n`);
        markGenerationProgress('资料检索失败，正在尝试直接回答...');
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
            setProgressContent(`> ⚠️ **${webSearchResult.message}**，已跳过网络检索。\n\n`);
          } else if (webSearchResult?.ok) {
            searchResultCount = Number(webSearchResult.count || 0);
            if (webSearchResult.context) {
              webEvidenceContext = truncateText(webSearchResult.context, MAX_PROMPT_EXTRA_CHARS);
            }
            const results = Array.isArray(webSearchResult.results) ? webSearchResult.results : [];
            updateAssistantActionNotes(
              sessionIndex,
              messageIndex,
              [results.length > 0 ? `搜索了 ${results.length} 个内容。` : '搜索了 0 个内容。']
            );
            if (results.length > 0) {
              setProgressContent(`> ✅ **找到 ${results.length} 个结果**:\n${results.map((r, i) => `> ${i + 1}. [${r.title}](${r.url})`).join('\n')}\n\n`);
            } else {
              setProgressContent('> ⚠️ **未找到相关结果**\n\n');
            }
          } else {
            if (webSearchResult?.error && webSearchResult.error?.name !== 'AbortError') {
              logger.error('boh-ai', 'Search failed', webSearchResult.error);
            }
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索失败，已尝试继续回答。']);
            appendProgressContent(`> ⚠️ **搜索服务异常**: ${webSearchResult?.message || '未知错误'}\n\n`);
          }
        } catch (searchError) {
          if (searchError?.name !== 'AbortError') {
            logger.error('boh-ai', 'Search failed', searchError);
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索失败，已尝试继续回答。']);
            appendProgressContent(`> ❌ **搜索失败**: ${searchError.message}\n\n`);
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
      const responseRules = `【回答要求】：
1. 涉及网站操作时，优先给出“入口路径 + 步骤”。
2. 涉及社区事实时，优先依据检索内容回答。
3. 不确定时请直接说明不确定，不要编造。
4. 涉及用户个人复盘时，优先结合 BOH Cloud+ 私有内容给出总结和建议。
5. 不要复述或粘贴“内部检索资料”的原文段落。
6. 如果引用论坛帖子证据 [F1]、[F2] 等，可以给出“查看帖子”链接，链接必须来自检索资料中的“查看”字段。
7. 总结论坛帖子时，若检索资料提供了“发帖ID”，必须用该 ID（如 @name）指代发帖者；不要泛称“用户分享/用户提到/有人提到”。
8. 优先用自然表达，除非用户要求，不强制套用固定模板。
9. 严禁编造 BOH 论坛用户、帖子、@用户名、帖子 ID、帖子链接或“论坛里有人分享/提到”的说法；只有 <available_internal_refs> 中存在 [F] 证据，且资料字段明确给出时，才可引用这些社区证据。没有 [F] 证据时，不要提 BOH 论坛证据。
${personalSupportMode ? '10. 用户在表达自己的困扰、情绪或身体状态时，先用 1-2 句接住他的处境和感受，再给最多 2-3 个低压力、今晚就能做的小动作；不要上来就列长清单，不要把普通困扰写成医学建议。结尾可以轻轻问一句具体情况，让用户愿意继续说。' : ''}
${isPlanMode ? '- Plan 模式下必须给出可继续接力的“小步计划/下一步行动”，并把缺少依据的内容标成不确定，不要编造成已确认事实。' : ''}
${latestForumSummaryMode ? '- 用户要求总结论坛最新内容时，必须严格按 [F1]、[F2]、[F3]、[F4]、[F5] 的顺序输出；[F1] 是最新发布，后面依次更早。不得按热度、重要性或主题重排；若不足 5 条，只输出已检索到的条目。' : ''}`;

      let communityRules = '';
      if (communityQuestion || bohInternalFactualQuestion) {
        communityRules = `【社群内容防编造规则】
1. 涉及方块之家、BOH、论坛帖子、成员、活动、历史、服务器、社群动态等内容时，只能依据本轮检索到的资料或联网搜索结果回答。
2. 禁止凭印象补全人物、事件、时间线、动机、关系、帖子内容、活动细节或统计数字。
3. 如果资料没有覆盖用户问到的点，必须明确说“未检索到明确依据，无法确认”，不要给出猜测版答案。
4. 如果用户要求创作、改写或生成文案，可以创作，但必须说明“以下是创作内容，不代表社群事实”。`;
      }

      let evidenceRules = '';
      if (shouldEnforceGrounding) {
        evidenceRules = `【证据要求】：
1. 若引用内部资料中的事实，请在对应句尾标注证据编号（如 [S2]、[T1]、[F3]）。
2. 若引用联网搜索结果，请使用 [W1]、[W2]。
3. 若某结论缺乏证据，请明确写“未检索到明确依据”。
4. 引用内部证据时仅可使用 <available_internal_refs> 中的编号，不可自造编号。`;
      }

      let operationRules = '';
      if (operationQuestion) {
        operationRules = `【操作类问题专用格式】
- 入口路径：给出最相关路径（例如 /user-space、/profile/:username）
- 操作步骤：用 1-${OPERATION_MAX_STEPS} 条编号步骤说明
- 注意事项：仅在必要时给出

【强约束】
- 如果无法从已检索资料确认路径，直接说“我目前无法确认该功能的准确路径”。
- 禁止猜测未出现过的页面路径或按钮文案。`;
      }

      finalPrompt = buildStructuredUserPrompt({
        userText: shouldUseContextualQuery
          ? `${userText}\n\n【上下文理解提示】这是一条追问；请结合最近对话理解，不要把它当成脱离上下文的新问题。\n${contextualQuery}`
          : userText,
        evidenceContext: internalEvidenceContext,
        searchContext: webEvidenceContext,
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
            const repairedConflicts = detectForumSummaryPolarityConflicts(forumSummarySourceText, repairedAnswer);
            narrativeAnswer = repairedAnswer && repairedConflicts.length === 0
              ? repairedAnswer
              : '';
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
        await animateAssistantContent(finalNarrativeAnswer, updateContent, {
          requestSignal: requestController.signal
        });
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
      const minRequiredGroundingCitations = shouldEnforceGrounding
        ? (factualQuestion ? Math.min(2, Math.max(1, totalGroundingRefCount)) : Math.min(1, Math.max(1, totalGroundingRefCount)))
        : 0;

      const needsInternalEvidence = communityNeedsEvidence || bohInternalFactualQuestion;
      if (needsInternalEvidence && totalGroundingRefCount <= 0) {
        updateContent('未检索到明确依据，无法确认这部分 BOH 内部内容。为了避免编造，我不能凭印象补全答案；可以换个更具体的关键词，或开启联网搜索后再试。');
        nextTick(scrollToBottom);
        return;
      }

      const sanitizeCommunityEvidenceClaims = (reply) => sanitizeUnsupportedCommunityEvidenceClaims(reply, {
        availableEvidenceRefs: groundingEvidenceRefs,
        fallbackText: '我没有检索到对应的 BOH 论坛帖子或用户，不能把这件事说成社区里有人分享过。'
      });

      const ensureGroundedReply = async (rawReply, { allowModelRepair = true } = {}) => {
        const safeReply = String(rawReply || '').trim();
        if (!safeReply) return safeReply;
        if (!shouldEnforceGrounding) return safeReply;
        if (totalGroundingRefCount <= 0) {
          if (needsInternalEvidence) {
            return '未检索到明确依据，无法确认这部分 BOH 内部内容。为了避免编造，我不能凭印象补全答案；可以换个更具体的关键词，或开启联网搜索后再试。';
          }
          return safeReply;
        }
        if (!shouldRepairUngroundedReply(safeReply, {
          evidenceRefSet: groundingRefSet,
          maxSearchRef: maxSearchCitationRef,
          minRequiredCitations: minRequiredGroundingCitations
        })) {
          return safeReply;
        }
        if (!allowModelRepair) {
          return `${safeReply}\n\n（提示：部分结论未检索到明确依据）`;
        }

        appendProgressContent('> ⚙️ **正在核验回答依据并自动修复...**\n\n');
        markGenerationProgress('正在核验回答依据并修正引用...');

        const groundedRepairPrompt = appendPromptSection(
          finalPrompt,
          `\n\n【依据核验重写任务】\n你刚才的回答引用依据不足，请重写整条回答并严格遵守：\n1) 若使用内部资料事实，句尾必须带证据编号（如 [S1] / [T2] / [K3] / [G1] / [F2] / [U1]）。\n2) 若使用联网搜索结果，引用格式为 [W1]、[W2]（仅可引用实际检索结果编号）。\n3) 仅可使用“本轮可用证据编号”中的内部编号，不可自造。\n4) 没有证据支持的结论必须写“未检索到明确依据”。\n5) 禁止新增未检索到的事实。\n6) 保持答案简洁、可执行。`,
          MAX_FINAL_PROMPT_CHARS
        );

        try {
          const repaired = await callModelInternal(
            generationModel.id,
            groundedRepairPrompt,
            systemPromptContent,
            recentMessages,
            requestController.signal,
            0,
            generationProfile
          );
          const filtered = filterThinkingContent(repaired);
          if (!String(filtered || '').trim()) return safeReply;

          if (shouldRepairUngroundedReply(filtered, {
            evidenceRefSet: groundingRefSet,
            maxSearchRef: maxSearchCitationRef,
            minRequiredCitations: minRequiredGroundingCitations
          })) {
            return `${filtered}\n\n（提示：部分结论未检索到明确依据）`;
          }
          return filtered;
        } catch (repairError) {
          logger.warn('boh-ai', 'Grounded repair failed', repairError);
          return safeReply;
        }
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

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errText}`);
      }

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
                appendProgressContent('> ⚠️ **生成内容异常，正在自动修复...**\n\n');
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
          : '抱歉，本轮生成内容异常。你可以切到“思考/专业”模式重试，我也可以继续帮你完成这个问题。';

        const groundedRepairedContent = cleanAssistantVisibleReply(await ensureGroundedReply(repairedContent))
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
        appendProgressContent('> ⚠️ **生成内容异常，正在自动重试...**\n\n');

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

      finalFilteredContent = await ensureGroundedReply(finalFilteredContent, {
        allowModelRepair: shouldEnforceGrounding && totalGroundingRefCount > 0
      });
      finalFilteredContent = cleanAssistantVisibleReply(finalFilteredContent);
      finalFilteredContent = sanitizeCommunityEvidenceClaims(finalFilteredContent);
      if (!finalFilteredContent) {
        finalFilteredContent = lastVisibleStreamContent || '我暂时没有生成到有效内容，请再试一次。';
        finalFilteredContent = sanitizeCommunityEvidenceClaims(finalFilteredContent);
      }

      const typedVisibleContent = cleanAssistantVisibleReply(filterThinkingContent(assistantMessage));
      if (finalFilteredContent !== typedVisibleContent) {
        if (finalFilteredContent.startsWith(typedVisibleContent)) {
          assistantMessage = await appendContentTypewriter(typedVisibleContent, finalFilteredContent.slice(typedVisibleContent.length));
        } else if (!typedVisibleContent) {
          assistantMessage = await appendContentTypewriter('', finalFilteredContent);
        } else {
          assistantMessage = finalFilteredContent;
          updateContent(finalFilteredContent);
        }
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
          updateContent(`这次生成长时间没有新进展，我已自动停止（${generationTimeoutReason}）。你可以重试；如果是论坛最新总结，我会优先使用真实帖子做抽取式总结。`);
        } else if (isDegenerateAssistantReply(filteredStoppedContent)) {
          updateContent('检测到生成内容异常，本次已停止。你可以重试，我会自动使用更稳的参数。');
        } else {
          updateContent(`${filteredStoppedContent}\n\n（已停止生成）`);
        }
      } else {
        logger.error('boh-ai', 'Generation error', error);
        updateContent(`抱歉，我遇到了一些问题: ${error.message}，请稍后再试。`);
      }

      if (targetSession) {
        targetSession.isThinking = false;
      }
      stopThinkingTimer();
      nextTick(scrollToBottom);
    } finally {
      clearTimeout(generationTimeoutTimer);
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
