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
  availableModels as _availableModels,
  chatModes as _chatModes
} from './chat-engine-config.js';

/**
 * useModelConfig - 管理当前模式/样式/功能开关状态。
 *
 * @param {Object} options
 * @param {Array}  [options.availableModels] - 可用模型列表，默认导入 chat-engine-config 中的值
 * @param {Array}  [options.chatModes]       - 模式列表，默认导入 chat-engine-config 中的值
 */
export function useModelConfig({ availableModels = _availableModels, chatModes = _chatModes } = {}) {
  // ─── Mode state ────────────────────────────────────────────────────────────────

  // 当前模式 - 默认 Fast（极速响应）。4 模式之间不自动切换；
  // 用户主动选择什么就走什么（语义：Fast=极速 / Pro=质量 / Plan=超级高质量 / Agent=工作）。
  const currentModeId = ref(BOH_DEFAULT_MODE_ID);
  const currentMode = computed(() => chatModes.find((m) => m.id === currentModeId.value) || chatModes[0]);
  const currentModelId = computed(() => currentMode.value.model);
  const currentModel = computed(() => availableModels.find((m) => m.id === currentModelId.value) || availableModels[0]);

  // 本轮 Auto 路由到的具体模式：在 sendMessage 中赋值，UI 可读。
  // 当用户手动点击 chip 重置或新会话时清空。
  const lastRoutedMode = ref('');

  // ─── Feature toggle refs ───────────────────────────────────────────────────────

  const isCommandMode = ref(false);
  const isSearching = ref(false);
  const isForumSearchEnabled = ref(false);

  const isMemoryCaptureEnabled = ref(
    typeof window === 'undefined' ? false : localStorage.getItem(MEMORY_CAPTURE_SETTING_KEY) === '1'
  );

  const isTreeholeMemoryEnabled = ref(
    typeof window === 'undefined'
      ? false
      : (
        localStorage.getItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
        || localStorage.getItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
      )
  );

  const isTreeholeMemoryToggling = ref(false);

  const isQuickNoteEnabled = ref(
    typeof window === 'undefined' ? false : localStorage.getItem(QUICK_NOTE_SETTING_KEY) === '1'
  );

  const isPlanModeEnabled = ref(
    typeof window === 'undefined' ? false : localStorage.getItem(PLAN_MODE_SETTING_KEY) === '1'
  );

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

  // ─── Other state ───────────────────────────────────────────────────────────────

  const cloudReferenceConsent = ref(
    typeof window === 'undefined'
      ? 'unknown'
      : (
        localStorage.getItem(CLOUD_REFERENCE_CONSENT_KEY)
        || (
          localStorage.getItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
            || localStorage.getItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
            ? 'granted'
            : 'unknown'
        )
      )
  );

  // 会话级"联网搜索未配置"提示去重：避免每轮都刷一条。
  const webSearchDisabledNoticeShownFor = new Set();

  // ─── Functions ─────────────────────────────────────────────────────────────────

  /**
   * getModelForModeId - 根据模式 ID 获取对应的模型对象。
   * 使用传入的 availableModels 参数（而非模块级导入），兼容外部覆盖。
   */
  const getModelForModeId = (modeId, _context = {}) => {
    const mode = chatModes.find((item) => item.id === modeId)
      || chatModes.find((item) => item.id === BOH_DEFAULT_MODE_ID)
      || chatModes[0];
    const targetModelId = mode?.model;
    return availableModels.find((item) => item.id === targetModelId)
      || currentModel.value
      || availableModels[0];
  };

  const persistPlanModeSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PLAN_MODE_SETTING_KEY, isPlanModeEnabled.value ? '1' : '0');
  };

  const togglePlanMode = () => {
    isPlanModeEnabled.value = !isPlanModeEnabled.value;
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

  const persistMemoryCaptureSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MEMORY_CAPTURE_SETTING_KEY, isMemoryCaptureEnabled.value ? '1' : '0');
  };

  const persistTreeholeMemorySetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY, isTreeholeMemoryEnabled.value ? '1' : '0');
    localStorage.removeItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY);
  };

  const persistQuickNoteSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(QUICK_NOTE_SETTING_KEY, isQuickNoteEnabled.value ? '1' : '0');
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
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isTreeholeMemoryToggling,
    isQuickNoteEnabled,
    isPlanModeEnabled,

    // Style state
    currentResponseStyleId,
    currentResponseStyle,
    responseStyleOptions: RESPONSE_STYLE_OPTIONS,

    // Other state
    cloudReferenceConsent,
    webSearchDisabledNoticeShownFor,

    // Functions
    normalizeResponseStyleId,
    getModelForModeId,
    togglePlanMode,
    setResponseStyle,
    persistPlanModeSetting,
    persistMemoryCaptureSetting,
    persistTreeholeMemorySetting,
    persistQuickNoteSetting
  };
}