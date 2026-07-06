import { nextTick } from 'vue';
import { isAbortError } from '../utils/chatErrorMessages.js';
import { createPost } from '@/utils/api/forum-api.js';
import { createMyCloudEntry } from '@/utils/api/boh-cloud-api.js';
import { createSharedAIMemory } from '@/utils/api/treehole-api.js';
import {
  BOHAI_ACTION_IDS,
  createBohAIAction,
  runBohAIAction
} from '@/utils/bohai-connectors.js';
import {
  appendBohAIActionAudit,
  createBohAIActionAuditEntry
} from '@/utils/bohai-action-audit.js';
import {
  formatPageDraftPreview as buildPageDraftPreview,
  formatPostDraftPreview as buildPostDraftPreview
} from './action-draft-formatters.js';
import {
  updatePostDraftFromText
} from './action-draft-updaters.js';
import {
  normalizePromptLine,
  isLikelyMemoryDuplicate,
  truncateText,
  buildPageDraftFromText
} from './bohai-engine-helpers.js';
import {
  isActionDraftCancelIntent,
  isPostDraftConfirmIntent,
  isPostDraftRequest,
  isCreatePageRequest
} from '@/utils/bohai-action-draft-intent.js';
import {
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS,
  BASE_SYSTEM_PROMPT,
  PAGE_CREATION_PROMPT_APPENDIX,
  QUICK_NOTE_TITLE_MAX_CHARS
} from './chat-engine-config.js';
import { logger } from '@/utils/logger.js';

/**
 * useActionDraft — Action 草稿解析、注册与执行
 *
 * 依赖注入参数（deps）：
 * @param {Object} deps
 * @param {Ref<Array>}   deps.chatSessions
 * @param {Ref<number>}  deps.currentSessionIndex
 * @param {Object}       deps.pendingActionDraft       — 响应式 reactive 对象
 * @param {Ref<Array>}   deps.actionAuditLog
 * @param {Object}       deps.treeholeMemoryCache
 * @param {Object}       deps.sharedMemoryCache
 * @param {Function}     deps.resetSharedMemorySearchCache
 * @param {Function}     deps.appendSessionMessage
 * @param {Function}     deps.appendUserMessageWithTitle
 * @param {Function}     deps.resetComposerInput
 * @param {Function}     deps.resetPendingActionDraft
 * @param {Function}     deps.scrollToBottom
 * @param {Function}     deps.getSessionByIndex
 * @param {Ref<boolean>} deps.isLoggedIn
 * @param {Ref<Object>}  deps.userInfo
 * @param {Ref<Object>}  deps.abortController
 * @param {Ref<number|null>} deps.activeGenerationSessionIndex
 * @param {Function}     deps.startThinkingTimer
 * @param {Function}     deps.stopThinkingTimer
 * @param {Function}     deps.setThinkingStatus
 * @param {Function}     deps.clearThinkingStatus
 * @param {Function}     deps.getGenerationProfile
 * @param {Function}     deps.getModelForModeId
 * @param {Ref<Object>}  deps.currentModel
 * @param {Ref<Array>}   deps.runtimeAvailableModels
 * @param {Function}     deps.callModelInternal
 * @param {Function}     deps.extractQuickNoteContent
 * @param {Function}     deps.buildQuickNoteTitle
 * @param {Function}     deps.getSharedMemoriesCached
 */
export function useActionDraft(deps) {
  const {
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
    scrollToBottom,
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
  } = deps;

  // ------------------------------------------------------------------
  // 工具函数
  // ------------------------------------------------------------------
  const getLocalDateKey = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ------------------------------------------------------------------
  // 草稿预览函数
  // ------------------------------------------------------------------
  const formatPostDraftPreview = () => buildPostDraftPreview(pendingActionDraft);
  const formatPageDraftPreview = () => buildPageDraftPreview(pendingActionDraft);

  const updatePostDraftByUserInput = (text) => updatePostDraftFromText(pendingActionDraft, text);

  // ------------------------------------------------------------------
  // Action 认证上下文
  // ------------------------------------------------------------------
  const getActionAuthContext = () => ({
    isLoggedIn: Boolean(isLoggedIn.value),
    userId: String(userInfo.value?.id || '').trim(),
    username: normalizePromptLine(userInfo.value?.username, 40)
  });

  // ------------------------------------------------------------------
  // Action 注册表
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Action 执行
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // 发帖草稿提交
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // 处理待定草稿回复
  // ------------------------------------------------------------------
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
          updateDraftMessage(isAbortError(error) ? '已停止整理发帖草稿。' : '发帖草稿生成失败，请稍后再试。');
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
        appendSessionMessage(currentSession, 'assistant', isAbortError(error) ? '已停止生成网页。' : '网页修改失败，请稍后再试。');
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

  // ------------------------------------------------------------------
  // 从用户输入启动 Action 草稿
  // ------------------------------------------------------------------
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
        updateDraftMessage(isAbortError(error) ? '已停止整理发帖草稿。' : '发帖草稿生成失败，请稍后再试。');
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

  // ------------------------------------------------------------------
  // 从用户输入启动页面创建
  // ------------------------------------------------------------------
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
      updateDraftMessage(isAbortError(error) ? '已停止生成网页。' : '网页生成失败，请稍后再试。');
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

  // ------------------------------------------------------------------
  // AI 生成页面 HTML
  // ------------------------------------------------------------------
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
      if (isAbortError(error)) throw error;
      throw new Error('AI 生成网页失败：' + (error.message || '未知错误'));
    }
  };

  const generatePostDraftFromUserIdea = async (ideaText, requestSignal = undefined) => {
    const safeIdea = normalizePromptLine(ideaText, ACTION_DRAFT_CONTENT_MAX_CHARS);
    if (!safeIdea) {
      return { needsIdea: true, title: '', content: '' };
    }

    const response = await callAIToGenerate({
      systemPrompt: [
        BASE_SYSTEM_PROMPT,
        '<role>你是 BOH 方块社区的发帖草稿助手。</role>\n<constraints>\n- 只根据用户给出的想法整理论坛帖子\n- 绝对不能编造用户没有提供的事实\n</constraints>\n<output_format>\n标题: ...\n正文: ...（可换行，不要 Markdown 代码块）\n</output_format>'
      ].join('\n'),
      userInput: [
        '请把下面的原始想法整理成一个社区帖子草稿。',
        `原始想法：${safeIdea}`,
        '',
        `标题不超过 ${ACTION_DRAFT_TITLE_MAX_CHARS} 字，正文不超过 ${ACTION_DRAFT_CONTENT_MAX_CHARS} 字。`
      ].join('\n'),
      modeId: 'pro',
      signal: requestSignal
    });

    const text = String(response || '').trim();
    const titleMatch = text.match(/标题[:：]\s*([^\n]+)/);
    const contentMatch = text.match(/正文[:：]\s*([\s\S]*)/);
    const title = normalizePromptLine(titleMatch?.[1] || safeIdea, ACTION_DRAFT_TITLE_MAX_CHARS);
    const content = normalizePromptLine(contentMatch?.[1] || text || safeIdea, ACTION_DRAFT_CONTENT_MAX_CHARS);

    return {
      needsIdea: !content,
      title,
      content
    };
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
      if (isAbortError(error)) throw error;
      throw new Error('AI 生成失败：' + (error.message || '未知错误'));
    }
  };

  return {
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
  };
}
