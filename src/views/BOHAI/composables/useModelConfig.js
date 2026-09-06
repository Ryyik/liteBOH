import { ref, computed } from 'vue';
import {
  BOH_DEFAULT_MODE_ID,
  CLOUD_REFERENCE_CONSENT_KEY,
  MEMORY_CAPTURE_SETTING_KEY,
  TREEHOLE_MEMORY_SYNC_SETTING_KEY,
  LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY,
  QUICK_NOTE_SETTING_KEY,
  RESPONSE_STYLE_SETTING_KEY,
  RESPONSE_STYLE_OPTIONS,
  PLAN_MODE_SETTING_KEY,
  SHARED_MEMORY_SETTING_KEY,
  KNOWLEDGE_BASE_SETTING_KEY,
  MODE_SETTING_KEY,
  THINKING_SPEED_SETTING_KEY,
  THINKING_SPEED_OPTIONS,
  BOH_DEFAULT_THINKING_SPEED_ID
} from './chat-engine-config.js';

export function useModelConfig({ availableModels = [], chatModes = [] } = {}) {
  const readBooleanSetting = (key, fallback = false) => {
    if (typeof window === 'undefined') return fallback;
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) return fallback;
      return saved === '1' || saved === 'true';
    } catch {
      return fallback;
    }
  };

  // 处理 ref 参数：如果是 ref，使用 .value；否则直接使用
  const getAvailableModels = () => {
    return availableModels && typeof availableModels === 'object' && 'value' in availableModels
      ? availableModels.value
      : availableModels;
  };

  const getChatModes = () => {
    return chatModes && typeof chatModes === 'object' && 'value' in chatModes
      ? chatModes.value
      : chatModes;
  };

  // ─── Mode state ────────────────────────────────────────────────────────────────

  // 当前模式 - 默认 Fast（极速响应）。4 模式之间不自动切换；
  // 用户主动选择什么就走什么（语义：Fast=极速 / Pro=质量 / Plan=超级高质量 / Agent=工作）。
  const resolveInitialModeId = () => {
    if (typeof window === 'undefined') return BOH_DEFAULT_MODE_ID;
    try {
      const saved = localStorage.getItem(MODE_SETTING_KEY);
      if (saved && getChatModes().some((m) => m.id === saved)) return saved;
    } catch {}
    return BOH_DEFAULT_MODE_ID;
  };
  const currentModeId = ref(resolveInitialModeId());
  const currentMode = computed(() => getChatModes().find((m) => m.id === currentModeId.value) || getChatModes()[0] || { id: BOH_DEFAULT_MODE_ID, name: 'Fast', tagline: '极速响应', description: '轻量模型，秒回', model: 'fast' });
  const currentModelId = computed(() => currentMode.value.model);
  const currentModel = computed(() => getAvailableModels().find((m) => m.id === currentModelId.value) || getAvailableModels()[0]);

  // 本轮 Auto 路由到的具体模式：在 sendMessage 中赋值，UI 可读。
  // 当用户手动点击 chip 重置或新会话时清空。
  const lastRoutedMode = ref('');

  // ─── Feature toggle refs ───────────────────────────────────────────────────────

  const isCommandMode = ref(false);
  const isSearching = ref(false);
  const isForumSearchEnabled = ref(false);
  // 健康分析：开启后，本轮回答会读取用户本机的 BOH Health 数据。
  // 数据来源是 localStorage，不要求登录。
  const isHealthAnalysisEnabled = ref(false);
  // 用户显式关闭过健康分析：此后即使消息命中健康关键词也不再读取健康数据；
  // 未动过开关（默认）时保留按关键词自动触发的设计
  const isHealthAnalysisDismissed = ref(false);

  const isMemoryCaptureEnabled = ref(false);

  const isTreeholeMemoryEnabled = ref(
    readBooleanSetting(TREEHOLE_MEMORY_SYNC_SETTING_KEY, readBooleanSetting(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY, false))
  );

  const isTreeholeMemoryToggling = ref(false);

  const isQuickNoteEnabled = ref(false);

  const isPlanModeEnabled = ref(false);

  const isSharedMemoryEnabled = ref(readBooleanSetting(SHARED_MEMORY_SETTING_KEY, false));

  const isKnowledgeBaseEnabled = ref(false);

  // ─── Style state ───────────────────────────────────────────────────────────────

  const normalizeResponseStyleId = (styleId) => {
    const safeId = String(styleId || '').trim();
    return RESPONSE_STYLE_OPTIONS.some((item) => item.id === safeId) ? safeId : 'default';
  };

  const currentResponseStyleId = ref(
    normalizeResponseStyleId(typeof window === 'undefined' ? 'default' : localStorage.getItem(RESPONSE_STYLE_SETTING_KEY))
  );

  const currentResponseStyle = computed(() => (
    RESPONSE_STYLE_OPTIONS.find((item) => item.id === currentResponseStyleId.value)
    || RESPONSE_STYLE_OPTIONS[0]
  ));

  // ─── Thinking speed state ──────────────────────────────────────────────────────

  const normalizeThinkingSpeedId = (speedId) => {
    const safeId = String(speedId || '').trim();
    return THINKING_SPEED_OPTIONS.some((item) => item.id === safeId) ? safeId : BOH_DEFAULT_THINKING_SPEED_ID;
  };

  const currentThinkingSpeedId = ref(
    normalizeThinkingSpeedId(typeof window === 'undefined' ? BOH_DEFAULT_THINKING_SPEED_ID : localStorage.getItem(THINKING_SPEED_SETTING_KEY))
  );

  const currentThinkingSpeed = computed(() => (
    THINKING_SPEED_OPTIONS.find((item) => item.id === currentThinkingSpeedId.value)
    || THINKING_SPEED_OPTIONS[1]
  ));

  const persistThinkingSpeedSetting = () => {
    if (typeof window === 'undefined') return;
    const speedId = currentThinkingSpeedId.value;
    if (speedId && speedId !== BOH_DEFAULT_THINKING_SPEED_ID) {
      localStorage.setItem(THINKING_SPEED_SETTING_KEY, speedId);
    } else {
      localStorage.removeItem(THINKING_SPEED_SETTING_KEY);
    }
  };

  const setThinkingSpeed = (speedId) => {
    currentThinkingSpeedId.value = normalizeThinkingSpeedId(speedId);
    persistThinkingSpeedSetting();
  };

  // ─── Other state ───────────────────────────────────────────────────────────────

  // cloudReferenceConsent 初始化：
  // 此处 userInfo 尚未加载（authStore 异步恢复会话），无法直接构造 per-user key。
  // 扫描 localStorage 中所有 per-user key（boh_ai_cloud_reference_consent_v1:<userId>），
  // 若任一为 'granted' 则初始即为 'granted'，避免页面加载后短暂为 'unknown' 触发重复弹窗。
  // refreshCloudReferenceConsent 会在 userInfo 就绪后精确修正为当前用户的值。
  const cloudReferenceConsent = ref((() => {
    if (typeof window === 'undefined') return 'unknown';
    try {
      // 1. 扫描 per-user key（当前实现唯一持久化方式）
      const prefix = `${CLOUD_REFERENCE_CONSENT_KEY}:`;
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          const v = localStorage.getItem(k);
          if (v === 'granted') return 'granted';
          if (v === 'denied') return 'denied';
        }
      }
      // 2. 兜底：legacy 全局 key（兼容旧版本，首次升级场景）
      const saved = localStorage.getItem(CLOUD_REFERENCE_CONSENT_KEY);
      return saved === 'granted' || saved === 'denied' ? saved : 'unknown';
    } catch {
      return 'unknown';
    }
  })());

  // 会话级"联网搜索未配置"提示去重：避免每轮都刷一条。
  const webSearchDisabledNoticeShownFor = new Set();

  // ─── Functions ─────────────────────────────────────────────────────────────────

  /**
   * getModelForModeId - 根据模式 ID 获取对应的模型对象。
   * 使用传入的 availableModels 参数（而非模块级导入），兼容外部覆盖。
   */
  const getModelForModeId = (modeId, _context = {}) => {
    const modes = getChatModes();
    const models = getAvailableModels();
    const mode = modes.find((item) => item.id === modeId)
      || modes.find((item) => item.id === BOH_DEFAULT_MODE_ID)
      || modes[0];
    const targetModelId = mode?.model;
    return models.find((item) => item.id === targetModelId)
      || currentModel.value
      || models[0];
  };

  const persistPlanModeSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(PLAN_MODE_SETTING_KEY);
  };

  const togglePlanMode = () => {
    isPlanModeEnabled.value = false;
    persistPlanModeSetting();
  };

  const persistResponseStyleSetting = () => {
    if (typeof window === 'undefined') return;
    const styleId = currentResponseStyleId.value === 'default' ? '' : currentResponseStyleId.value;
    if (styleId) {
      localStorage.setItem(RESPONSE_STYLE_SETTING_KEY, styleId);
    } else {
      localStorage.removeItem(RESPONSE_STYLE_SETTING_KEY);
    }
  };

  const setResponseStyle = (styleId) => {
    currentResponseStyleId.value = normalizeResponseStyleId(styleId);
    persistResponseStyleSetting();
  };

  const persistModeSetting = () => {
    if (typeof window === 'undefined') return;
    const modeId = currentModeId.value;
    if (modeId && modeId !== BOH_DEFAULT_MODE_ID) {
      localStorage.setItem(MODE_SETTING_KEY, modeId);
    } else {
      localStorage.removeItem(MODE_SETTING_KEY);
    }
  };

  const persistMemoryCaptureSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MEMORY_CAPTURE_SETTING_KEY);
  };

  const persistTreeholeMemorySetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY, isTreeholeMemoryEnabled.value ? '1' : '0');
    localStorage.removeItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY);
  };

  const persistQuickNoteSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(QUICK_NOTE_SETTING_KEY);
  };

  const persistSharedMemorySetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SHARED_MEMORY_SETTING_KEY, isSharedMemoryEnabled.value ? '1' : '0');
  };

  const persistKnowledgeBaseSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(KNOWLEDGE_BASE_SETTING_KEY, '0');
  };

  return {
    // Mode state
    currentModeId,
    currentMode,
    currentModelId,
    currentModel,
    lastRoutedMode,

    // Feature toggles
    isCommandMode,
    isSearching,
    isForumSearchEnabled,
    isHealthAnalysisEnabled,
    isHealthAnalysisDismissed,
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isTreeholeMemoryToggling,
    isQuickNoteEnabled,
    isPlanModeEnabled,
    isSharedMemoryEnabled,
    isKnowledgeBaseEnabled,

    // Style state
    currentResponseStyleId,
    currentResponseStyle,
    responseStyleOptions: RESPONSE_STYLE_OPTIONS,

    // Thinking speed state
    currentThinkingSpeedId,
    currentThinkingSpeed,
    thinkingSpeedOptions: THINKING_SPEED_OPTIONS,

    // Other state
    cloudReferenceConsent,
    webSearchDisabledNoticeShownFor,

    // Functions
    normalizeResponseStyleId,
    getModelForModeId,
    togglePlanMode,
    setResponseStyle,
    setThinkingSpeed,
    persistModeSetting,
    persistPlanModeSetting,
    persistMemoryCaptureSetting,
    persistTreeholeMemorySetting,
    persistQuickNoteSetting,
    persistSharedMemorySetting,
    persistKnowledgeBaseSetting
  };
}
