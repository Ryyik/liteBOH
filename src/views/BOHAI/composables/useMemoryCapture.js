import { computed } from 'vue';
import { createMyTreeholeSpace } from '@/utils/api/treehole-api.js';
import { BOHAI_ACTION_IDS } from '@/utils/bohai-connectors.js';
import {
  isTreeholeCreateConfirm,
  isTreeholeCreateReject,
  isSharedMemorySaveReject,
  isSharedMemorySaveConfirm,
  formatMemorySavePrompt,
} from './useIntentDetection.js';

const dispatchGlobalNavStatus = (payload = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('boh_global_nav_status', { detail: payload }));
};

export function useMemoryCapture(deps) {
  const {
    // Reactive state
    currentSessionIndex,
    pendingTreeholeCreation,
    pendingSharedMemoryCapture,
    memoryCaptureStatusMessage,

    // Auth
    isLoggedIn,
    userInfo,

    // Settings refs
    isTreeholeMemoryEnabled,
    isMemoryCaptureEnabled,
    isTreeholeMemoryToggling,

    // Message operations
    appendSessionMessage,
    resetComposerInput,

    // Status message
    setMemoryCaptureStatusMessage,

    // Persistence
    persistMemoryCaptureSetting,
    persistTreeholeMemorySetting,

    // Session utility
    getSessionByIndex,

    // Reset helpers
    resetPendingTreeholeCreation,
    resetPendingSharedMemoryCapture,

    // Action runner
    runRegisteredAction,

    // Text utilities
    normalizePromptLine,

    // Composer state
    inputMessage,
    textareaRef,
  } = deps;

  // ── 树洞创建确认请求 ──────────────────────────────────────────
  const _requestTreeholeCreationConfirmation = () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      setMemoryCaptureStatusMessage('请先登录，再开启树洞记忆同步。');
      return;
    }

    const sessionIndex = currentSessionIndex.value;
    if (
      pendingTreeholeCreation.awaitingConfirmation &&
      pendingTreeholeCreation.userId === userId &&
      pendingTreeholeCreation.sessionIndex === sessionIndex
    ) {
      setMemoryCaptureStatusMessage('请在对话中回复"是"或"否"，确认是否由我代你创建树洞。');
      return;
    }

    pendingTreeholeCreation.awaitingConfirmation = true;
    pendingTreeholeCreation.userId = userId;
    pendingTreeholeCreation.sessionIndex = sessionIndex;
    appendSessionMessage(
      sessionIndex,
      'assistant',
      '你还没有创建树洞。要我现在帮你创建并开启树洞记忆吗？\n请回复"是"确认，回复"否"取消。',
      { kind: 'treehole_create_confirm' },
    );
    setMemoryCaptureStatusMessage('请在对话中回复"是"确认创建树洞，回复"否"取消。');
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
      appendSessionMessage(sessionIndex, 'assistant', '请回复"是"来创建树洞，或回复"否"取消。');
      setMemoryCaptureStatusMessage('等待你的确认：回复"是"创建树洞，回复"否"取消。');
      return true;
    }

    const pendingUserId = String(pendingTreeholeCreation.userId || '').trim();
    if (
      !pendingUserId ||
      !isLoggedIn.value ||
      String(userInfo.value?.id || '').trim() !== pendingUserId
    ) {
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('登录状态已变化，请重新开启树洞记忆。');
      appendSessionMessage(
        sessionIndex,
        'assistant',
        '登录状态发生变化，请重新点击"树洞记忆"后再试。',
      );
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
        : '已帮你创建树洞，并开启树洞记忆（私密）。',
    );
    return true;
  };

  // ── 公共记忆开关 ──────────────────────────────────────────────
  const toggleMemoryCapture = () => {
    isMemoryCaptureEnabled.value = !isMemoryCaptureEnabled.value;
    persistMemoryCaptureSetting();
    setMemoryCaptureStatusMessage(
      isMemoryCaptureEnabled.value
        ? '公共记忆已开启：将写入 BOH AI 公共记忆库。'
        : '公共记忆已关闭：本轮不会写入 BOH AI 公共记忆库。',
    );
  };

  // ── 共享记忆保存确认 ──────────────────────────────────────────
  // 2026-10-04：写入目的地不再需要用户选择 —— Cloud+ 写入已下线，只剩公共记忆库一条路径，
  // 所以不再解析 destination，提示语固定为「是否写入公共记忆库」。
  const requestSharedMemorySaveConfirmation = ({ content, sessionIndex } = {}) => {
    const safeContent = normalizePromptLine(content, 320);
    if (!safeContent) return false;

    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      appendSessionMessage(
        sessionIndex,
        'assistant',
        '写入公共记忆库需要先登录；我这次先不保存。',
        { kind: 'shared_memory_login_required' },
      );
      return true;
    }

    pendingSharedMemoryCapture.awaitingConfirmation = true;
    pendingSharedMemoryCapture.userId = userId;
    pendingSharedMemoryCapture.sessionIndex = sessionIndex;
    pendingSharedMemoryCapture.content = safeContent;
    appendSessionMessage(sessionIndex, 'assistant', formatMemorySavePrompt(safeContent), {
      kind: 'shared_memory_capture_confirm',
    });
    return true;
  };

  // 2026-10-04：Cloud+ 写入已下线（saveCloud / quickNote 两个动作已删），本函数现在只负责
  // 「写入 BOH AI 公共记忆库」这一条路径 —— destination 不再需要，调用方也不必再解析目的地。
  const saveConfirmedAutoMemory = async ({ userId, content, sessionIndex } = {}) => {
    const safeUserId = String(userId || '').trim();
    const safeContent = normalizePromptLine(content, 320);
    if (!safeUserId || safeUserId !== String(userInfo.value?.id || '').trim()) {
      appendSessionMessage(
        sessionIndex,
        'assistant',
        '登录状态已变化，本次保存已取消，请重新发送后再试。',
      );
      return;
    }

    const saveResult = await runRegisteredAction(BOHAI_ACTION_IDS.saveSharedMemory, {
      content: safeContent,
    });

    if (saveResult.ok) {
      const savedText = '已保存到 BOH AI 公共记忆库。';
      setMemoryCaptureStatusMessage(savedText);
      appendSessionMessage(sessionIndex, 'assistant', savedText, { kind: 'memory_saved_notice' });
      return true;
    }

    appendSessionMessage(
      sessionIndex,
      'assistant',
      saveResult.metadata?.duplicate
        ? '公共记忆库：已有相近内容，已跳过重复写入。'
        : `公共记忆库：${saveResult.errorMessage || '写入失败'}`,
    );
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

    if (!isSharedMemorySaveConfirm(safeText)) {
      appendSessionMessage(
        sessionIndex,
        'assistant',
        '回复"确认"写入公共记忆库，或回复"不保存"跳过。',
      );
      return true;
    }

    const pendingUserId = String(pendingSharedMemoryCapture.userId || '').trim();
    const content = normalizePromptLine(pendingSharedMemoryCapture.content, 320);
    if (
      !pendingUserId ||
      !content ||
      !isLoggedIn.value ||
      String(userInfo.value?.id || '').trim() !== pendingUserId
    ) {
      resetPendingSharedMemoryCapture();
      appendSessionMessage(
        sessionIndex,
        'assistant',
        '登录状态发生变化，这条记忆暂时没有写入。请重新发送后再确认。',
      );
      return true;
    }

    resetPendingSharedMemoryCapture();
    await saveConfirmedAutoMemory({
      userId: pendingUserId,
      content,
      sessionIndex,
    });
    return true;
  };

  // ── Cloud+ 参考（树洞记忆）开关 ──────────────────────────────
  const toggleTreeholeMemory = async () => {
    if (isTreeholeMemoryToggling.value) return;

    if (isTreeholeMemoryEnabled.value) {
      isTreeholeMemoryEnabled.value = false;
      persistTreeholeMemorySetting();
      setMemoryCaptureStatusMessage('Cloud+ 参考已关闭。');
      dispatchGlobalNavStatus({
        title: 'Cloud+ 参考已关闭',
        message: '本轮不会读取你的 Cloud+ 内容',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 3600,
      });
      return;
    }

    if (!isLoggedIn.value || !userInfo.value?.id) {
      setMemoryCaptureStatusMessage('请先登录，再开启 Cloud+ 参考。');
      return;
    }

    isTreeholeMemoryToggling.value = true;
    try {
      // 2026-10-04：不再有「首次授权」环节 —— 打开开关即生效（读 Cloud+ 的同意闸门已移除）。
      isTreeholeMemoryEnabled.value = true;
      persistTreeholeMemorySetting();
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage(
        'Cloud+ 参考已开启：AI 将可查看你的全部 Cloud+ 内容作为私有参考。',
      );
      dispatchGlobalNavStatus({
        title: 'Cloud+ 参考已开启',
        message: 'AI 可参考你的 Cloud+ 私有内容',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 4200,
      });
    } finally {
      isTreeholeMemoryToggling.value = false;
    }
  };

  // ── 状态回显抑制 ──────────────────────────────────────────────
  const shouldSuppressMemoryStatusEcho = (baseText, statusText) => {
    const base = String(baseText || '').trim();
    const status = String(statusText || '').trim();
    if (!base || !status) return false;

    const normalizeForCompare = (text) =>
      String(text || '')
        .replace(/[：:；;，,。.\s]/g, '')
        .replace(/默认|同步/g, '')
        .trim();
    const normalizedBase = normalizeForCompare(base);
    const normalizedStatus = normalizeForCompare(status);
    if (!normalizedBase || !normalizedStatus) return false;
    if (normalizedBase.includes(normalizedStatus) || normalizedStatus.includes(normalizedBase))
      return true;

    const stateEchoRules = [
      /^公共记忆已开启/u,
      /^公共记忆已关闭/u,
      /^Cloud\+ 参考已开启/u,
      /^Cloud\+ 参考已关闭/u,
    ];
    if (!stateEchoRules.some((rule) => rule.test(status))) return false;

    if (status.includes('公共记忆') && base.includes('公共记忆已')) return true;
    if (status.includes('Cloud+') && base.includes('Cloud+ 参考')) return true;
    return false;
  };

  // ── 记忆状态提示 computed ─────────────────────────────────────
  const memoryCaptureTip = computed(() => {
    const base = (() => {
      if (!isLoggedIn.value) return '登录后可开启公共记忆与 Cloud+ 参考。';
      const parts = [
        isMemoryCaptureEnabled.value ? '公共记忆已开启：写入 BOH AI 公共记忆库' : '公共记忆已关闭',
        isTreeholeMemoryEnabled.value
          ? 'Cloud+ 参考已开启：回答可参考你的全部 Cloud+ 内容'
          : 'Cloud+ 参考已关闭',
      ];
      return `${parts.join('；')}。`;
    })();
    const status = String(memoryCaptureStatusMessage.value || '').trim();
    if (!status) return base;
    if (shouldSuppressMemoryStatusEcho(base, status)) return base;
    return `${base} ${status}`;
  });

  return {
    toggleMemoryCapture,
    toggleTreeholeMemory,
    handlePendingTreeholeCreationReply,
    handlePendingSharedMemoryCaptureReply,
    requestSharedMemorySaveConfirmation,
    saveConfirmedAutoMemory,
    shouldSuppressMemoryStatusEcho,
    memoryCaptureTip,
    _requestTreeholeCreationConfirmation,
  };
}
