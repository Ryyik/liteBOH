import { ref, nextTick } from 'vue';
import {
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS,
} from './chat-engine-config.js';
import { normalizePromptLine as _normalizePromptLine } from './bohai-engine-helpers.js';

/**
 * @template T
 * @typedef {import('vue').Ref<T>} Ref
 * @template T
 * @typedef {import('vue').ComputedRef<T>} ComputedRef
 */

/**
 * 消息 CRUD 与随手记管理 composable。
 *
 * 从 useChatEngine 中提取，通过依赖注入解耦。
 *
 * @param {Object} options
 * @param {Function} options.getSessionByIndex - 根据索引获取会话对象
 * @param {import('vue').Ref<boolean>} options.isLoggedIn - 登录状态
 * @param {import('vue').Ref} options.userInfo - 用户信息
 * @param {Function} options.scrollToBottom - 滚动到底部
 * @param {Function} [options.normalizePromptLineFn] - 文本归一化函数（默认从 helpers 导入）
 * @param {import('vue').Ref<number>} options.currentSessionIndex - 当前会话索引
 * @param {Function} [options.submitPostDraft] - 提交帖子草稿回调
 * @param {Object} [options.logger] - 日志记录器
 * @param {Object} [options.pendingActionDraft] - 外部注入的 pendingActionDraft（useConversationManager）
 * @param {Function} [options.resetPendingActionDraft] - 外部注入的 resetPendingActionDraft
 */
export function useMessageManager({
  getSessionByIndex,
  scrollToBottom,
  normalizePromptLineFn,
  currentSessionIndex,
  submitPostDraft,
  // 从 useConversationManager 注入的 pending 状态
  pendingActionDraft,
  resetPendingActionDraft,
} = {}) {
  const normalize =
    typeof normalizePromptLineFn === 'function' ? normalizePromptLineFn : _normalizePromptLine;

  // --------------------------------------------------------------
  // 输入状态
  // --------------------------------------------------------------

  /** 输入框内容 */
  const inputMessage = ref('');

  /** 输入框 DOM 引用 */
  const textareaRef = ref(null);

  // --------------------------------------------------------------
  // 消息工具
  // --------------------------------------------------------------

  // --------------------------------------------------------------
  // 消息 CRUD
  // --------------------------------------------------------------

  /**
   * 向指定会话追加一条消息。
   * @param {number} sessionIndex - 会话索引
   * @param {string} role - 角色（'user' | 'assistant'）
   * @param {string} content - 消息内容
   * @param {Object|null} [meta] - 可选元数据
   * @returns {boolean} 是否成功追加
   */
  const appendSessionMessage = (sessionIndex, role, content, meta = null) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;
    const safeContent = String(content || '').trim();
    if (!safeContent) return false;
    const payload = { role, content: safeContent };
    if (meta && typeof meta === 'object') payload.meta = meta;
    targetSession.messages.push(payload);
    nextTick(() => scrollToBottom());
    return true;
  };

  /**
   * 归一化操作笔记列表：去重、截断、限制最多 4 条。
   * @param {Array|string} notes
   * @returns {string[]}
   */
  const normalizeActionNotes = (notes = []) => {
    const source = Array.isArray(notes) ? notes : [notes];
    return [...new Set(source.map((item) => normalize(item, 120)).filter(Boolean))].slice(0, 4);
  };

  /**
   * 合并 assistant 消息的 meta 字段。
   * @param {number} sessionIndex
   * @param {number} messageIndex
   * @param {Object} metaPatch - 要合并的 meta 片段
   * @returns {boolean}
   */
  const mergeAssistantMessageMeta = (sessionIndex, messageIndex, metaPatch = {}) => {
    const targetSession = getSessionByIndex(sessionIndex);
    const targetMessage = targetSession?.messages?.[messageIndex];
    if (!targetMessage || targetMessage.role !== 'assistant') return false;
    if (!metaPatch || typeof metaPatch !== 'object') return false;
    targetMessage.meta = {
      ...(targetMessage.meta && typeof targetMessage.meta === 'object' ? targetMessage.meta : {}),
      ...metaPatch,
    };
    return true;
  };

  /**
   * 更新 assistant 消息的 actionNotes：合并去重后写入 meta。
   * @param {number} sessionIndex
   * @param {number} messageIndex
   * @param {string[]} notes - 待追加的笔记
   */
  const updateAssistantActionNotes = (sessionIndex, messageIndex, notes = []) => {
    const targetSession = getSessionByIndex(sessionIndex);
    const targetMessage = targetSession?.messages?.[messageIndex];
    if (!targetMessage || targetMessage.role !== 'assistant') return;
    const currentNotes = Array.isArray(targetMessage.meta?.actionNotes)
      ? targetMessage.meta.actionNotes
      : [];
    const nextNotes = normalizeActionNotes([...currentNotes, ...normalizeActionNotes(notes)]);
    if (nextNotes.length === 0) return;
    mergeAssistantMessageMeta(sessionIndex, messageIndex, { actionNotes: nextNotes });
  };

  /**
   * 追加用户消息，如果是首条消息则自动初始化会话标题。
   * @param {number} sessionIndex
   * @param {string} text
   * @returns {boolean}
   */
  const appendUserMessageWithTitle = (sessionIndex, text) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;
    const safeText = String(text || '').trim();
    if (!safeText) return false;
    const shouldInitTitle = targetSession.messages.length === 0;
    const appended = appendSessionMessage(sessionIndex, 'user', safeText);
    if (appended && shouldInitTitle) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }
    return appended;
  };

  /**
   * 重置输入框内容，并将 textarea 高度恢复为 auto。
   */
  const resetComposerInput = () => {
    inputMessage.value = '';
    if (textareaRef.value) textareaRef.value.style.height = 'auto';
  };

  // --------------------------------------------------------------
  // 操作草稿 UI 交互
  // --------------------------------------------------------------

  /**
   * 从 UI 更新帖子草稿的标题/正文。
   * @param {Object} options
   * @param {string} [options.title] - 新标题
   * @param {string} [options.content] - 新正文
   * @returns {boolean}
   */
  const updatePendingPostDraftFromUI = ({ title, content } = {}) => {
    if (!pendingActionDraft.active || pendingActionDraft.type !== 'post') return false;
    if (pendingActionDraft.sessionIndex !== currentSessionIndex?.value) return false;
    if (typeof title === 'string') {
      pendingActionDraft.postTitle = normalize(title, ACTION_DRAFT_TITLE_MAX_CHARS);
    }
    if (typeof content === 'string') {
      pendingActionDraft.postContent = normalize(content, ACTION_DRAFT_CONTENT_MAX_CHARS);
    }
    return true;
  };

  /**
   * 从 UI 取消当前激活的操作草稿。
   * @returns {boolean}
   */
  const cancelPendingActionDraftFromUI = () => {
    if (!pendingActionDraft.active) return false;
    const sessionIndex = currentSessionIndex?.value;
    if (pendingActionDraft.sessionIndex !== sessionIndex) return false;
    const draftTypeLabel = pendingActionDraft.type === 'page' ? '网页' : '发帖';
    resetPendingActionDraft();
    appendSessionMessage(sessionIndex, 'assistant', `好的，已取消本次${draftTypeLabel}草稿。`);
    return true;
  };

  /**
   * 从 UI 确认当前激活的操作草稿并提交。
   * @returns {Promise<boolean>}
   */
  const confirmPendingActionDraftFromUI = async () => {
    if (!pendingActionDraft.active) return false;
    const sessionIndex = currentSessionIndex?.value;
    if (pendingActionDraft.sessionIndex !== sessionIndex) return false;
    if (pendingActionDraft.type === 'post') {
      if (typeof submitPostDraft === 'function') {
        await submitPostDraft(sessionIndex);
      }
      return true;
    }
    if (pendingActionDraft.type === 'page') {
      resetPendingActionDraft();
      return true;
    }
    return false;
  };

  return {
    inputMessage,
    textareaRef,
    appendSessionMessage,
    normalizeActionNotes,
    mergeAssistantMessageMeta,
    updateAssistantActionNotes,
    appendUserMessageWithTitle,
    resetComposerInput,
    cancelPendingActionDraftFromUI,
    confirmPendingActionDraftFromUI,
    updatePendingPostDraftFromUI,
  };
}
