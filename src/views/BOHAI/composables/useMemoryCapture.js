import { computed, watch } from 'vue';
import { createMyTreeholeSpace } from '@/utils/api/treehole-api.js';
import {
  normalizeActionDecisionText
} from '@/utils/bohai-action-draft-intent.js';
import {
  BOHAI_ACTION_IDS
} from '@/utils/bohai-connectors.js';
import {
  CLOUD_REFERENCE_CONSENT_KEY,
  QUICK_NOTE_TITLE_MAX_CHARS
} from './chat-engine-config.js';
import {
  isTreeholeCreateConfirm,
  isTreeholeCreateReject,
  isSharedMemorySaveConfirm,
  isSharedMemorySaveReject,
  resolveMemorySaveDestinationFromText,
  formatMemorySavePrompt
} from './useIntentDetection.js';

const dispatchGlobalNavStatus = (payload = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('boh_global_nav_status', { detail: payload }));
};

export function useMemoryCapture(deps) {
  const {
    // Reactive state
    chatSessions,
    currentSessionIndex,
    pendingTreeholeCreation,
    pendingCloudReferenceConsent,
    pendingSharedMemoryCapture,
    pendingQuickNote,
    memoryCaptureStatusMessage,

    // Auth
    isLoggedIn,
    userInfo,

    // Settings refs
    isTreeholeMemoryEnabled,
    isMemoryCaptureEnabled,
    isQuickNoteEnabled,
    isTreeholeMemoryToggling,
    cloudReferenceConsent,

    // Message operations
    appendSessionMessage,
    resetComposerInput,
    scrollToBottom,

    // Status message
    setMemoryCaptureStatusMessage,

    // Persistence
    persistMemoryCaptureSetting,
    persistTreeholeMemorySetting,
    persistQuickNoteSetting,

    // Session utility
    getSessionByIndex,
    nextTick,

    // Reset helpers
    resetPendingTreeholeCreation,
    resetPendingCloudReferenceConsent,
    resetPendingSharedMemoryCapture,
    resetPendingQuickNote,

    // Action runner
    runRegisteredAction,

    // Text utilities
    normalizePromptLine,
    extractQuickNoteContent,
    buildQuickNoteTitle,

    // Composer state
    inputMessage,
    textareaRef
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
      pendingTreeholeCreation.awaitingConfirmation
      && pendingTreeholeCreation.userId === userId
      && pendingTreeholeCreation.sessionIndex === sessionIndex
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
      { kind: 'treehole_create_confirm' }
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
    if (!pendingUserId || !isLoggedIn.value || String(userInfo.value?.id || '').trim() !== pendingUserId) {
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('登录状态已变化，请重新开启树洞记忆。');
      appendSessionMessage(sessionIndex, 'assistant', '登录状态发生变化，请重新点击"树洞记忆"后再试。');
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

  // ── Cloud+ 参考同意持久化 ─────────────────────────────────────
  const getCloudReferenceConsentKey = (userId = userInfo.value?.id) => {
    const safeUserId = String(userId || '').trim();
    return safeUserId ? `${CLOUD_REFERENCE_CONSENT_KEY}:${safeUserId}` : '';
  };

  const refreshCloudReferenceConsent = () => {
    const key = getCloudReferenceConsentKey();
    if (!key || typeof window === 'undefined') {
      cloudReferenceConsent.value = 'unknown';
      return cloudReferenceConsent.value;
    }
    try {
      let saved = localStorage.getItem(key);
      const legacySaved = localStorage.getItem(CLOUD_REFERENCE_CONSENT_KEY);
      if (saved === null && (legacySaved === 'granted' || legacySaved === 'denied')) {
        saved = legacySaved;
        localStorage.setItem(key, legacySaved);
        localStorage.removeItem(CLOUD_REFERENCE_CONSENT_KEY);
      }
      cloudReferenceConsent.value = saved === 'granted' || saved === 'denied' ? saved : 'unknown';
    } catch {
      cloudReferenceConsent.value = 'unknown';
    }
    return cloudReferenceConsent.value;
  };

  const persistCloudReferenceConsent = () => {
    const key = getCloudReferenceConsentKey();
    if (!key || typeof window === 'undefined') return;
    localStorage.setItem(key, String(cloudReferenceConsent.value || 'unknown'));
    localStorage.removeItem(CLOUD_REFERENCE_CONSENT_KEY);
  };

  // ── 公共记忆开关 ──────────────────────────────────────────────
  const toggleMemoryCapture = () => {
    isMemoryCaptureEnabled.value = !isMemoryCaptureEnabled.value;
    persistMemoryCaptureSetting();
    setMemoryCaptureStatusMessage(
      isMemoryCaptureEnabled.value
        ? '公共记忆已开启：将写入 BOH AI 公共记忆库。'
        : '公共记忆已关闭：本轮不会写入 BOH AI 公共记忆库。'
    );
  };

  // ── 随手记开关 ────────────────────────────────────────────────
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
    dispatchGlobalNavStatus({
      title: isQuickNoteEnabled.value ? '随手记已开启' : '随手记已关闭',
      message: isQuickNoteEnabled.value ? 'AI 回答后可记录到 Cloud+' : '本轮不再生成随手记提示',
      icon: 'ai',
      type: 'notification',
      actionLabel: '知道了',
      durationMs: 3600
    });
  };

  // ── 随手记草稿操作 ────────────────────────────────────────────
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
    dispatchGlobalNavStatus({
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

  // ── Cloud+ 参考同意流程 ───────────────────────────────────────
  const requestCloudReferenceConsent = () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      setMemoryCaptureStatusMessage('请先登录，再开启 Cloud+ 参考。');
      return;
    }

    if (refreshCloudReferenceConsent() === 'granted') {
      isTreeholeMemoryEnabled.value = true;
      persistTreeholeMemorySetting();
      setMemoryCaptureStatusMessage('Cloud+ 参考已开启，将继续使用你此前的隐私授权。');
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

    appendSessionMessage(sessionIndex, 'assistant', '请点击"同意"或"拒绝"，也可以直接回复"同意"或"拒绝"。');
    setMemoryCaptureStatusMessage('等待你的选择：同意或拒绝 Cloud+ 参考。');
    return true;
  };

  // ── 共享记忆保存确认 ──────────────────────────────────────────
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
      appendSessionMessage(sessionIndex, 'assistant', '请回复"Cloud+"、"公共记忆"、"两者都保存"，或回复"不保存"。');
      return true;
    }

    if (!['cloud', 'shared', 'both'].includes(destination)) {
      appendSessionMessage(sessionIndex, 'assistant', '请回复"Cloud+"、"公共记忆"、"两者都保存"，或回复"不保存"。');
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
        durationMs: 3600
      });
      return;
    }

    if (!isLoggedIn.value || !userInfo.value?.id) {
      setMemoryCaptureStatusMessage('请先登录，再开启 Cloud+ 参考。');
      return;
    }

    isTreeholeMemoryToggling.value = true;
    try {
      refreshCloudReferenceConsent();
      if (cloudReferenceConsent.value !== 'granted') {
        requestCloudReferenceConsent();
        return;
      }
      isTreeholeMemoryEnabled.value = true;
      persistTreeholeMemorySetting();
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('Cloud+ 参考已开启：AI 将可查看你的全部 Cloud+ 内容作为私有参考。');
      dispatchGlobalNavStatus({
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

  // ── 状态回显抑制 ──────────────────────────────────────────────
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

  // ── 记忆状态提示 computed ─────────────────────────────────────
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

  // 修复：用户登录态变化或 userInfo 加载完成后，自动刷新 Cloud+ 同意状态
  // 解决"已同意但每次刷新都重新提示"的问题：useModelConfig 初始化时 userInfo 未就绪，
  // cloudReferenceConsent 为 'unknown'，此处watcher 在 userInfo 就绪后自动读取 per-user 值
  if (isLoggedIn) {
    watch(
      [isLoggedIn, () => userInfo.value?.id],
      ([loggedIn, userId]) => {
        if (loggedIn && userId) {
          refreshCloudReferenceConsent();
        }
      },
      { immediate: true }
    );
  }

  return {
    toggleMemoryCapture,
    toggleTreeholeMemory,
    toggleQuickNoteMode,
    updatePendingQuickNoteDraft,
    dismissQuickNoteDraft,
    confirmQuickNoteDraft,
    requestCloudReferenceConsent,
    refreshCloudReferenceConsent,
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
  };
}
