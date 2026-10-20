import { ref, computed } from 'vue';
import {
  BOH_DEFAULT_MODE_ID,
  BOH_GUEST_FALLBACK_MODE_ID,
  MEMORY_CAPTURE_SETTING_KEY,
  TREEHOLE_MEMORY_SYNC_SETTING_KEY,
  LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY,
  RESPONSE_STYLE_SETTING_KEY,
  RESPONSE_STYLE_OPTIONS,
  PLAN_MODE_SETTING_KEY,
  KNOWLEDGE_BASE_SETTING_KEY,
  MODE_SETTING_KEY,
  THINKING_SPEED_SETTING_KEY,
  THINKING_SPEED_OPTIONS,
  BOH_DEFAULT_THINKING_SPEED_ID,
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

  // 当前选中项。2026-10-20 起列表是「3 个策略 + 6 个模型」的混合列表，
  // 选中项的语义只剩"这次用哪一行"，不再有"模式之间自动切换"的概念。
  //
  // ⚠️ 默认值分两条路：
  //   · 登录用户 / 无 localStorage ⇒ BOH_DEFAULT_MODE_ID（'balance'）
  //   · 未登录（游客）           ⇒ BOH_GUEST_FALLBACK_MODE_ID（'fast' / GLM4）
  //   游客不能落在 balance 上 —— 它的 min_tier='free'，选中会在发消息时被 EF 拒绝。
  //   这里读不到登录态（本 composable 不依赖 authStore，避免循环依赖 + 单测负担），
  //   所以只处理"无 localStorage"这一半；**登录态变化时的校正由 useBohShell 的 watch 负责**
  //   （它已有 `!loggedIn && currentModeId !== 'fast'` 那条，本次补上 immediate）。
  const resolveInitialModeId = () => {
    if (typeof window === 'undefined') return BOH_DEFAULT_MODE_ID;
    try {
      const saved = localStorage.getItem(MODE_SETTING_KEY);
      if (saved && getChatModes().some((m) => m.id === saved)) return saved;
    } catch {
      /* 隐私模式下 localStorage 读取会抛。读不到就用默认模式，不是错误。 */
    }
    return BOH_DEFAULT_MODE_ID;
  };
  const currentModeId = ref(resolveInitialModeId());
  const currentMode = computed(
    () =>
      getChatModes().find((m) => m.id === currentModeId.value) ||
      getChatModes()[0] ||
        // ⚠️ 兜底对象只在「模式表还没加载 / 加载失败」时出现（实测症状：pill 显示
        //    "Fast" 但菜单是"暂无可用模式"）。2026-10-20 修正了它的三重自相矛盾：
        //    原先是 id=BOH_DEFAULT_MODE_ID('balance') 却 name='Fast'、model='fast' ——
        //    同一个对象里三个标识各说各话，用户看到的名字与真正会调用的模型对不上。
        //    现在 id/name/model 一律指向**游客回落模式**（GLM4），因为能走到这条兜底的
        //    绝大多数是"加载失败"的会话，此时给一个游客可用的值最不容易出错；
        //    登录用户若加载成功会立刻被真实列表覆盖，不会停在这里。
        {
          id: BOH_GUEST_FALLBACK_MODE_ID,
          name: 'GLM4',
          tagline: '轻量模型',
          description: '轻量模型，响应快',
          model: BOH_GUEST_FALLBACK_MODE_ID,
        },
  );
  const currentModelId = computed(() => currentMode.value.model);
  const currentModel = computed(
    () =>
      getAvailableModels().find((m) => m.id === currentModelId.value) || getAvailableModels()[0],
  );

  // ─── Feature toggle refs ───────────────────────────────────────────────────────

  const isSearching = ref(false);

  const isMemoryCaptureEnabled = ref(false);

  const isTreeholeMemoryEnabled = ref(
    readBooleanSetting(
      TREEHOLE_MEMORY_SYNC_SETTING_KEY,
      readBooleanSetting(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY, false),
    ),
  );

  const isTreeholeMemoryToggling = ref(false);

  const isPlanModeEnabled = ref(false);

  // 站内知识总开关（2026-10-19 合并）：原先「官方记忆」（本开关）、「社区搜索」
  // （`isForumSearchEnabled`）、「社区知识」（`isSharedMemoryEnabled`）是三个独立开关，
  // 现合并为**一个**持久化偏好，沿用「官方记忆」这个名字。ON ⇒ 官方事实/知识库/论坛记忆 +
  // 社区帖子 + AI 公共记忆每条消息必查（见 knowledge-plan-switches.js）；OFF ⇒ 全关。
  //
  // 默认**开**：内容是维护者手写的社区事实 + 站内公开内容，属于产品自带知识，
  // 关掉只会让 AI 答不出自己的事。⚠️ 2026-10-16 前这里是 `ref(false)` 且
  // `persistKnowledgeBaseSetting` 恒写 '0' —— 硬编码关闭导致「官方事实 + 知识库」
  // 两条检索源从未生效（线上 28 条事实一条没被用过）。
  const isKnowledgeBaseEnabled = ref(readBooleanSetting(KNOWLEDGE_BASE_SETTING_KEY, true));

  // ─── Style state ───────────────────────────────────────────────────────────────

  const normalizeResponseStyleId = (styleId) => {
    const safeId = String(styleId || '').trim();
    return RESPONSE_STYLE_OPTIONS.some((item) => item.id === safeId) ? safeId : 'default';
  };

  const currentResponseStyleId = ref(
    normalizeResponseStyleId(
      typeof window === 'undefined' ? 'default' : localStorage.getItem(RESPONSE_STYLE_SETTING_KEY),
    ),
  );

  const currentResponseStyle = computed(
    () =>
      RESPONSE_STYLE_OPTIONS.find((item) => item.id === currentResponseStyleId.value) ||
      RESPONSE_STYLE_OPTIONS[0],
  );

  // ─── Thinking speed state ──────────────────────────────────────────────────────

  const normalizeThinkingSpeedId = (speedId) => {
    const safeId = String(speedId || '').trim();
    return THINKING_SPEED_OPTIONS.some((item) => item.id === safeId)
      ? safeId
      : BOH_DEFAULT_THINKING_SPEED_ID;
  };

  const currentThinkingSpeedId = ref(
    normalizeThinkingSpeedId(
      typeof window === 'undefined'
        ? BOH_DEFAULT_THINKING_SPEED_ID
        : localStorage.getItem(THINKING_SPEED_SETTING_KEY),
    ),
  );

  const currentThinkingSpeed = computed(
    () =>
      THINKING_SPEED_OPTIONS.find((item) => item.id === currentThinkingSpeedId.value) ||
      THINKING_SPEED_OPTIONS[1],
  );

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
    const mode =
      modes.find((item) => item.id === modeId) ||
      modes.find((item) => item.id === BOH_DEFAULT_MODE_ID) ||
      modes[0];
    const targetModelId = mode?.model;
    return models.find((item) => item.id === targetModelId) || currentModel.value || models[0];
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
    localStorage.setItem(
      TREEHOLE_MEMORY_SYNC_SETTING_KEY,
      isTreeholeMemoryEnabled.value ? '1' : '0',
    );
    localStorage.removeItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY);
  };

  const persistKnowledgeBaseSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(KNOWLEDGE_BASE_SETTING_KEY, isKnowledgeBaseEnabled.value ? '1' : '0');
  };

  return {
    // Mode state
    currentModeId,
    currentMode,
    currentModelId,
    currentModel,

    // Feature toggles
    isSearching,
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isTreeholeMemoryToggling,
    isPlanModeEnabled,
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
    persistKnowledgeBaseSetting,
  };
}
