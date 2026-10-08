<template>
  <div
    ref="bohaiPageRoot"
    class="bohai-page"
    :class="{
      'embedded-mode': props.embedded,
      'overlay-mode': props.overlayMode,
      'standalone-mode': isStandalone,
      'empty-chat-mode': messages.length === 0,
      'sidebar-open': isSidebarOpen,
      'work-open': workPanelOpen,
      'reduce-motion': !globalAiPreferences.animationsEnabled,
    }"
    :data-ui-style="currentUiStyle"
    :data-theme="resolvedAiTheme"
    :data-density="globalAiPreferences.density"
    :data-font-scale="globalAiPreferences.fontScale"
  >
    <!-- 横屏左栏（电脑 + 平板横屏）：与 UserSpace / 首页 / 他人空间共用同一组件与 navItems 单源，
         current-tab 传 'ai' —— 进 AI 后左栏仍高亮「AI」席，跨页跳转不丢上下文。
         竖屏 / 手机横屏由 side-rail.css 的媒体查询隐藏，不渲染任何可见内容。
         ⚠️ 页面级规则在 `landscape-rail.css`（本文件末尾按页引入）——不引则左栏渲染但定位/让位全不生效。 -->
    <UserSpaceSideRail
      v-if="isStandalone && !settingsOpen"
      :nav-items="userSpaceNavItems"
      current-tab="ai"
      :has-unread-messages="railUnreadCount > 0"
      :unread-count="railUnreadCount"
      :current-theme="currentSiteTheme"
      :is-logged-in="isLoggedIn"
      @nav-click="handleRailNavClick"
      @action="handleRailAction"
    />

    <div
      class="boh-shell"
      :class="{ 'sidebar-open': isSidebarOpen && !props.overlayMode }"
      :data-surface="surface"
    >
      <BohSidebar
        v-if="!props.overlayMode && !settingsOpen"
        :open="isSidebarOpen"
        :visible="isComponentVisible"
        :sessions="chatSessions"
        :current-index="currentSessionIndex"
        :standalone="isStandalone"
        :surface="surface"
        :quota="sidebarQuota"
        :account="sidebarAccount"
        :plan="sidebarPlan"
        @update:open="isSidebarOpen = $event"
        @new-chat="startNewChat"
        @switch-session="switchSession"
        @delete-session="requestDeleteSession"
        @rename-session="renameSession"
        @toggle-pin="togglePinSession"
        @open-settings="openSettings"
        @upgrade="goUpgradePlan"
        @update:surface="setSurface"
      />

      <div
        v-if="!props.overlayMode"
        class="boh-backdrop"
        aria-hidden="true"
        @click="isSidebarOpen = false"
      ></div>

      <main class="boh-main">
        <!-- 2026-10-08（用户口径：整体布局参考 Codex 那种感觉）：删掉整条顶栏。
             Codex 式布局的主区没有横条，入口收成右上角一组浮动小按钮：
               · 「打开侧栏」只在侧栏收起时出现 —— 展开时侧栏自带收起键（`.boh-sb-close`），
                 所以这条**不会**留下「收起后打不开」的坑（plans/023 步骤③踩过的那次）；
               · 「工作台」仅桌面档出现（与 Work 形态联动，见 `setSurface`）。
             会话名不再顶栏展示 —— 侧栏会话列表的高亮项就是它（删顶栏时重复了一遍）。
             岛形态不渲染（岛自带 header，见 `BOHAIIsland.vue`）。 -->
        <div v-if="!props.overlayMode" class="boh-float-actions">
          <button
            v-if="!isSidebarOpen"
            type="button"
            class="boh-icon-btn"
            title="打开侧栏"
            aria-label="打开侧栏"
            @click="toggleSidebar"
          >
            <PanelLeft :size="18" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="boh-icon-btn is-work"
            :class="{ 'is-on': workPanelOpen }"
            title="工作台"
            aria-label="工作台"
            @click="toggleWorkPanel"
          >
            <PanelRight :size="17" aria-hidden="true" />
          </button>
        </div>

        <BohChatStream
          ref="streamRef"
          :messages="visibleMessageItems"
          :hidden-count="hiddenMessageCount"
          :is-thinking="isThinking"
          :is-loading="isLoading"
          :web-search-active="webSearchActive"
          :web-search-results="webSearchResults"
          :community-search-active="communitySearchActive"
          :plan-card="planCard"
          :inline-question="activeInlineQuestion"
          v-model:inline-answer="aiQuestionAnswer"
          :feedback="messageFeedbackByIndex"
          :details-open="expandedMessageDetails"
          :show-details="globalAiPreferences.showDetails"
          :nav-items="userMessageNavItems"
          :active-nav-index="activeUserMessageIndex"
          :surface="surface"
          :standalone="isStandalone"
          :overlay-mode="props.overlayMode"
          :standalone-suggestions="fullPageSuggestions"
          :quick-suggestions="quickSuggestions"
          @pick-suggestion="useQuickSuggestion"
          @show-more="showMoreMessages"
          @scroll="updateActiveUserMessageFromScroll"
          @jump="scrollToMessage"
          @delete-message="deleteMessage"
          @copy-message="copyMessage"
          @feedback="setMessageFeedback"
          @toggle-details="toggleMessageDetails"
          @inline-select="selectInlineOption"
          @inline-submit="submitInlineAnswer"
          @inline-enter="onInlineEnter"
          @toggle-plan="taskPanelExpanded = !taskPanelExpanded"
          @stop-plan="stopTaskPanel"
          @retry-plan="retryTaskPanel"
        />

        <BohComposer
          ref="composerRef"
          v-model="inputMessage"
          :is-loading="isLoading"
          :is-compressing="isCompressingContext"
          :is-searching="isSearching"
          :placeholder="composerPlaceholder"
          :overlay-mode="props.overlayMode"
          :modes="filteredChatModes"
          :modes-loading="chatModesLoading"
          :current-mode="currentMode"
          :current-mode-id="currentModeId"
          :thinking-speed-options="thinkingSpeedOptions"
          :current-thinking-speed-id="currentThinkingSpeedId"
          :current-thinking-speed="currentThinkingSpeed"
          :tools="composerTools"
          :attached-context="attachedContext"
          :usage="composerUsage"
          :slash-open="slashMenuOpen"
          :slash-commands="filteredSlashCommands"
          :slash-active-index="slashActiveIndex"
          :rate-limit-message="rateLimitMessage"
          :notice="uiNotice"
          :context-warning-text="showContextWarning ? contextWarningText : ''"
          @input="handleComposerInput"
          @keydown="handleComposerKeydown"
          @send="sendMessage"
          @stop="stopGeneration"
          @toggle-search="toggleSearch"
          @toggle-tool="toggleTool"
          @start-psych="startPsychAnalysis"
          @select-mode="selectMode"
          @select-thinking-speed="selectThinkingSpeed"
          @run-slash-command="runSlashCommand"
          @update:slash-active-index="slashActiveIndex = $event"
          @clear-context="clearAttachedContext"
          @compress="handleManualCompress"
          @open-usage="openUsageInSettings"
        />
      </main>

      <BohWorkPanel
        v-if="!props.overlayMode"
        :open="workPanelOpen"
        :artifacts="workArtifacts"
        :sources="workSources"
        :steps="workSteps"
        @close="workPanelOpen = false"
        @download="handleArtifactDownload"
      />
    </div>

    <!-- 2026-10-03（plans/023 步骤 ④）：AiQuotaSidePanel 已退役 —— 用量信息整体
         搬进设置面板的「用量」卡；用量浮层的两个入口改为打开设置面板并滚到那张卡。
         2026-10-08 重写为**全屏设置页**（左导航 + 右内容）：
           · `:fullscreen` —— 独立页铺满视口，岛形态铺满宿主；
           · 打开期间壳把会话侧栏（上面 v-if）与横屏左栏一起撤掉 —— 这正是修掉
             「打开设置后侧边栏依然压在设置上面」的那一处：旧实现遮罩 z-index 300、
             会话侧栏 2147483450，层级根本不在一个量级。 -->
    <BohaiSettingsPanel
      v-model="settingsOpen"
      :embedded="props.overlayMode || isStandalone"
      :fullscreen="isStandalone"
      :focus-section="settingsFocusSection"
      :current-mode="currentMode"
      :current-mode-id="currentModeId"
      :chat-modes="chatModes"
      :current-response-style-id="currentResponseStyleId"
      :response-style-options="responseStyleOptions"
      :is-treehole-memory-enabled="isTreeholeMemoryEnabled"
      :is-shared-memory-enabled="isSharedMemoryEnabled"
      :is-treehole-memory-toggling="isTreeholeMemoryToggling"
      :memory-status-text="memorySettingsStatus"
      :resolved-theme="resolvedAiTheme"
      @select-mode="selectMode"
      @select-response-style="setResponseStyle"
      @toggle-treehole-memory="handleTreeholeMemoryToggle"
      @toggle-shared-memory="handleSharedMemoryToggle"
      @clear-current-chat="clearCurrentChat"
      @export-chat-data="exportChatData"
      @clear-all-chat-data="clearAllChatData"
    />

    <CommonAlertModal
      v-model:visible="confirmState.show"
      :type="confirmState.type"
      :title="confirmState.title"
      :message="confirmState.message"
      @confirm="handleConfirm"
      @close="handleClose"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PanelLeft, PanelRight } from 'lucide-vue-next';
import { useChatEngine } from '../composables/useChatEngine';
import { createExpertState } from '../expert-roles/interview-engine.js';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import BohSidebar from './components/BohSidebar.vue';
import BohChatStream from './components/BohChatStream.vue';
import BohComposer from './components/BohComposer.vue';
import BohWorkPanel from './components/BohWorkPanel.vue';
import BohaiSettingsPanel from './components/BohaiSettingsPanel.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import { clearMarkdownCache } from './components/boh-markdown.js';
import { sourcePrefix } from './components/boh-sources.js';
import { logger } from '@/utils/logger.js';
import { getAiQuotaStatus } from '@/utils/api/api-key-runtime-api.js';
import { resolveAiQuotaDisplay } from '@/utils/ai-quota-display.js';
import { TIER_DISPLAY_LABELS } from '@/utils/subscription-benefits.js';
import { themeManager } from '@/utils/theme-manager.js';
/* 横屏左栏（2026-10-03）：AI 是全屏落点（/ai-chat），原来是「一进 AI 左栏就消失」——
   同一个横屏电脑上，从「我」页点 AI 席过去，导航栏整条没了，只剩一个返回键。
   这里复用 UserSpace 的同一份左栏组件与同一份 navItems 单源（和首页 / 他人空间同构），
   可见性仍由 side-rail.css 的媒体查询决定（竖屏 / 手机横屏零副作用），
   定位与内容让位见 UserSpace/styles/landscape-rail.css 的 body.page-aichat 段。 */
import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue';
import { userSpaceNavItems } from '@/views/user-center/UserSpace/composables/useUserSpaceTabs.js';
import { ensureNotificationStore, getNotificationStoreRef } from '@/stores/notification-loader';
import { useGlobalAiPreferences } from '@/composables/useGlobalAiPreferences.js';

// 获取用户信息
const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);
const router = useRouter();

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
  overlayMode: {
    type: Boolean,
    default: false,
  },
  quickActive: { type: Boolean, default: false },
  quickSuggestions: { type: Array, default: () => [] },
});

const emit = defineEmits(['island-message', 'overlay-state']);
const { preferences: globalAiPreferences } = useGlobalAiPreferences();
const isStandalone = computed(() => !props.embedded && !props.overlayMode);

/* ---------- 横屏左栏（2026-10-03） ----------
   只在 standalone（= /ai-chat 整页）挂载：embedded / overlayMode 下宿主自己已经有左栏
   （UserSpace 的 tab-page 内嵌实例、BOH AI 灵动岛浮层），再挂一份就是两条左栏。
   竖屏与手机横屏不渲染任何可见内容 —— 可见性由 side-rail.css 的媒体查询兜住。 */
const railNotificationStore = getNotificationStoreRef();
const railUnreadCount = computed(() => railNotificationStore.value?.unreadCount || 0);

const handleRailNavClick = (itemId) => {
  const item = userSpaceNavItems.find((entry) => entry.id === itemId);
  if (!item) return;
  // 左栏里的「AI」席指向当前页：跳同路由只会白跑一次导航（并可能清掉 query 里的模式）
  if (router.resolve(item.route).name === 'AiChat') return;
  router.push(item.route);
};

const handleRailAction = (actionId) => {
  switch (actionId) {
    case 'compose':
    case 'search':
      // 发布 / 搜索的宿主是论坛（挂在首页）→ 带意图跳到首页论坛区，与 UserSpace / 他人空间同口径
      router.push({ path: '/', query: { view: 'latest', [actionId]: '1' } });
      break;
    case 'theme':
      // themeManager 内部派发 theme-changed，本组件的 handleThemeChange 已监听并同步 ref
      themeManager.toggle();
      break;
    case 'home':
      router.push('/');
      break;
    case 'logout':
      authStore.logout();
      router.push('/');
      break;
    default:
      break;
  }
};

onMounted(() => {
  // 未读徽标的数据源：懒加载通知 store（与 ProfileMain 同一手法），失败不阻断页面
  void ensureNotificationStore();
});

const isSidebarOpen = ref(
  isStandalone.value && typeof window !== 'undefined' && window.innerWidth >= 1024,
);
const isComponentVisible = ref(true);
let visibilityObserver = null;
// ✅ 性能优化 P0-2：可见性检测改用 ResizeObserver（display:none 折叠为 0 会触发回调），
// 取代每秒 offsetHeight 轮询；仅古旧浏览器降级为低频轮询。
const bohaiPageRoot = ref(null);
let visibilityResizeObserver = null;
let visibilityFallbackIntervalId = null;
const currentUiStyle = ref(themeManager.getUiStyle?.() || 'glass');
const currentSiteTheme = ref(themeManager.isDark?.() ? 'dark' : 'light');
const resolvedAiTheme = computed(() => {
  if (globalAiPreferences.appearance === 'dark' || globalAiPreferences.appearance === 'light') {
    return globalAiPreferences.appearance;
  }
  return currentSiteTheme.value;
});
const uiNotice = ref('');
const route = useRoute();
const visibleMessageLimit = ref(80);
const expandedMessageDetails = ref(new Set());
const messageFeedbackByIndex = ref({});
const settingsOpen = ref(false);
// '' | 'usage'：设置面板打开时是否直接滚到「用量」卡（用量浮层的入口用）
const settingsFocusSection = ref('');
const todayTokenUsage = ref(null);
const taskPanelExpanded = ref(true);
const taskLifecycleOverride = ref('');
const fullPageSuggestions = [
  '帮我梳理今天要做的事',
  '总结一段内容并提取重点',
  '搜索 BOH 社区里的相关讨论',
  '制定一个可以执行的计划',
];

/* ---------- 大模式 = 形态（Chat / Work），DESIGN §7.1 ----------
   形态是**产品维度**（有哪些工具、产物落到哪），与「对话模式」（模型档位）正交。
   落点：前端设置 `boh_ai_surface_v1`（仿现有 MODE_SETTING_KEY 口径）。
   ⚠️ 不要塞进 `bohai_model_configs` —— 那会把两个正交维度压成一维。 */
const SURFACE_SETTING_KEY = 'boh_ai_surface_v1';
const readStoredSurface = () => {
  try {
    const value = localStorage.getItem(SURFACE_SETTING_KEY);
    return value === 'work' ? 'work' : 'chat';
  } catch {
    return 'chat';
  }
};
const surface = ref(readStoredSurface());
const workPanelOpen = ref(false);

const isWideEnoughForWork = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(orientation: landscape) and (min-width: 1024px) and (min-height: 600px)')
    ?.matches;

const setSurface = (next) => {
  const value = next === 'work' ? 'work' : 'chat';
  surface.value = value;
  try {
    localStorage.setItem(SURFACE_SETTING_KEY, value);
  } catch {
    /* localStorage 不可用时只影响下次进入的默认值，不影响本次使用 */
  }
  // 切到 Work：桌面档自动展开工作台；切回 Chat：收起（DESIGN §7.1）
  workPanelOpen.value = value === 'work' && isWideEnoughForWork();
};

const toggleWorkPanel = () => {
  workPanelOpen.value = !workPanelOpen.value;
};

const filteredChatModes = computed(() => {
  if (!authStore.isLoggedIn) {
    return chatModes.value.filter((m) => m.id === 'fast');
  }
  return chatModes.value;
});

watch(
  () => authStore.isLoggedIn,
  (loggedIn) => {
    if (!loggedIn && currentModeId.value !== 'fast') {
      currentModeId.value = 'fast';
    }
    fetchTodayQuota();
  },
);
const confirmState = reactive({
  show: false,
  type: 'warning',
  title: '',
  message: '',
  resolve: null,
});

const aiQuestionAnswer = ref('');
const slashActiveIndex = ref(0);
const slashDismissed = ref(false);

const activeInlineQuestion = ref(null);

/* 子组件句柄 */
const streamRef = ref(null);
const composerRef = ref(null);
/** 消息流滚动容器（在子组件里，用 `defineExpose` 暴露出来） */
const streamEl = () => streamRef.value?.scrollEl || null;

const openSettings = () => {
  if (!isStandalone.value || window.innerWidth < 1024) isSidebarOpen.value = false;
  settingsFocusSection.value = '';
  settingsOpen.value = true;
};

// 用量浮层的「完整用量 / 用量详情」：不再开第二层抽屉（AiQuotaSidePanel 已退役），
// 改为打开设置面板并定位到用量卡。
const openUsageInSettings = () => {
  if (!isStandalone.value || window.innerWidth < 1024) isSidebarOpen.value = false;
  settingsFocusSection.value = 'usage';
  settingsOpen.value = true;
};

let quotaRefreshTimer = null;
let quotaRefreshing = false;

// 今日已用 Token 额度：与服务端"使用情况"面板同源（quota-status），保证数字一致
const fetchTodayQuota = async () => {
  if (quotaRefreshing) return;
  quotaRefreshing = true;
  try {
    const result = await getAiQuotaStatus({ timeoutMs: 6000 });
    if (result?.ok && result.data) {
      todayTokenUsage.value = {
        used: Math.max(0, Number(result.data.usedTokens ?? result.data.used ?? 0)),
        limit: Number(result.data.tokenLimit ?? result.data.limit ?? 0),
        // 2026-10-08 百分比口径：基础额度（不含附加包）与包加成必须分开留着 ——
        // 百分比 = 档位百分比 × (used / base)，附加包在同尺相加。
        // 老版本 EF 不返回这两个字段时，resolveAiQuotaDisplay 会自动降级
        // （总量当分母、包归零），不会算出「不存在的附加包」。
        // ⚠️ 字段名必须与 resolveAiQuotaDisplay 的入参名一致（baseTokenLimit）——
        // 这里曾写成 baseLimit，类型不报错、页面不报错，只是分母悄悄退回总量，
        // 靠探针才抓到。
        baseTokenLimit: Number(result.data.baseTokenLimit ?? 0),
        bonusTokens: Math.max(0, Number(result.data.bonusTokens ?? 0)),
        // 档位一并留住，而且**新口径必需**：尺子（Plus = 100% ⇒ Max 625%）就是按它选的。
        // 侧栏账号浮层也要用它显示「订阅计划」。
        // （设置面板的用量卡另用订阅接口覆盖一次 tier，见 sidebarPlan 的注释。）
        tier: String(result.data.tier || ''),
      };
    }
  } catch {
    // 拉取失败保留原值，不打断聊天界面
  } finally {
    quotaRefreshing = false;
  }
};

const clearAllChatData = () => {
  confirmState.type = 'warning';
  confirmState.title = '清除所有对话';
  confirmState.message = '确定要清除所有对话数据吗？此操作不可撤销。';
  confirmState.show = true;
  confirmState.resolve = (ok) => {
    confirmState.show = false;
    if (ok) {
      stopGeneration();
      clearAllSessions();
      settingsOpen.value = false;
    }
  };
};

const clearCurrentChat = () => {
  confirmState.type = 'warning';
  confirmState.title = '清除当前对话';
  confirmState.message = '确定要清除当前对话吗？此操作不可撤销。';
  confirmState.show = true;
  confirmState.resolve = (ok) => {
    confirmState.show = false;
    if (ok) {
      stopGeneration();
      clearCurrentSession();
      settingsOpen.value = false;
    }
  };
};

const handleConfirm = () => {
  if (confirmState.resolve) {
    confirmState.resolve(true);
    confirmState.resolve = null;
  }
};

const handleClose = () => {
  if (confirmState.resolve) {
    confirmState.resolve(false);
    confirmState.resolve = null;
  }
};

const exportChatData = () => {
  try {
    const data = {
      sessions: chatSessions.value,
      exportedAt: new Date().toISOString(),
      version: '2.5',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boh-ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
};

let uiNoticeTimer = null;

const emitIslandMessage = (payload = {}) => {
  emit('island-message', payload);
};

const {
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
  isCommandMode,
  isSearching,
  webSearchActive,
  webSearchResults,
  communitySearchActive,
  isForumSearchEnabled,
  isHealthAnalysisEnabled,
  isTreeholeMemoryEnabled,
  isPlanModeEnabled,
  isSharedMemoryEnabled,
  rateLimitMessage,
  chatModes,
  chatModesLoading,
  messages,
  contextBudgetUsage,
  isCompressingContext,
  compressContextManually,
  onScrollToBottom,
  startNewChat: startNewChatEngine,
  clearCurrentSession,
  clearAllSessions,
  deleteSession,
  switchSession,
  sendMessage,
  stopGeneration,
  attachedContext,
  setAttachedContext,
  clearAttachedContext,
  agentClusterState,
  currentResponseStyleId,
  setResponseStyle,
  responseStyleOptions,
  currentThinkingSpeedId,
  // ⚠️ 必须一起解构：胶囊强度段 / 推理强度行 / trigger title 都读
  // `currentThinkingSpeed?.name || '中'`。漏掉它会静默退化成「永远是 中」——
  // 状态其实切换成功（子菜单 active 会跟着动、localStorage 也落盘），只是不回显。
  // 2026-10-01 由 probe-bohai-composer.mjs 的 A5 抓到。
  currentThinkingSpeed,
  thinkingSpeedOptions,
  setThinkingSpeed,
  persistModeSetting,
  persistSharedMemorySetting,
  toggleTreeholeMemory,
  isTreeholeMemoryToggling,
  memoryCaptureTip,
} = useChatEngine();

/* 输入框元素现在长在 `BohComposer` 里，但引擎（`useChatEngine` / `useMessageManager` /
   `useMemoryCapture`）都按 `textareaRef` 直接操作它（聚焦 / 重置高度）⇒ 必须把子组件的
   textarea 元素回填给引擎的 ref，否则「发送后聚焦」「清空后回弹」会静默失效。 */
watch(
  composerRef,
  (instance) => {
    textareaRef.value = instance?.textareaEl || null;
  },
  { flush: 'post' },
);

// useChatEngine 初始化完成后再订阅回答状态，避免 setup 阶段访问暂时性死区。
watch(isThinking, (thinking, wasThinking) => {
  if (wasThinking && !thinking) {
    clearTimeout(quotaRefreshTimer);
    quotaRefreshTimer = setTimeout(fetchTodayQuota, 1500);
  }
});

const startNewChat = () => {
  startNewChatEngine();
  isSearching.value = Boolean(globalAiPreferences.defaultWebSearch);
};

const startTemporaryChat = () => {
  startNewChat();
  const session = chatSessions[currentSessionIndex.value];
  if (session) {
    session.temporary = true;
    session.title = '临时对话';
  }
};

const memorySettingsStatus = computed(() => {
  const liveStatus = String(memoryCaptureTip.value || '');
  if (/请先登录|登录后可/.test(liveStatus)) return liveStatus;
  return `个人记忆${isTreeholeMemoryEnabled.value ? '已开启' : '已关闭'}；社区知识${isSharedMemoryEnabled.value ? '已开启' : '已关闭'}。`;
});

const handleTreeholeMemoryToggle = async () => {
  await toggleTreeholeMemory();
};

const handleSharedMemoryToggle = () => {
  isSharedMemoryEnabled.value = !isSharedMemoryEnabled.value;
  persistSharedMemorySetting();
  emitIslandMessage({
    title: isSharedMemoryEnabled.value ? '社区知识已开启' : '社区知识已关闭',
    message: isSharedMemoryEnabled.value ? '回答可检索社区共享知识' : '回答将不再读取社区共享知识',
    icon: 'ai',
    type: 'notification',
    actionLabel: '知道了',
    durationMs: 3200,
  });
};

const renameSession = ({ index, title }) => {
  const session = chatSessions[index];
  const nextTitle = String(title || '')
    .trim()
    .slice(0, 48);
  if (session && nextTitle) session.title = nextTitle;
};

const togglePinSession = (index) => {
  const session = chatSessions[index];
  if (session) session.pinned = !session.pinned;
};

const requestDeleteSession = (index) => {
  const session = chatSessions[index];
  if (!session) return;
  confirmState.type = 'warning';
  confirmState.title = '删除对话';
  confirmState.message = `确定删除“${session.title || '新对话'}”吗？此操作不可撤销。`;
  confirmState.show = true;
  confirmState.resolve = (ok) => {
    confirmState.show = false;
    if (ok) deleteSession(index);
  };
};

const focusComposer = () => nextTick(() => composerRef.value?.focus());

const appendToComposer = (text) => {
  const content = String(text || '').trim();
  if (!content) return;
  inputMessage.value = `${inputMessage.value ? `${inputMessage.value}\n\n` : ''}${content}`;
  nextTick(() => {
    composerRef.value?.autoResize();
    composerRef.value?.focus();
  });
};

// 供外部（灵动岛/健康页种子提问）直接预填并立即发送。
// 上一轮改动只在 defineExpose 里引用了该函数却未定义，导致 setup 抛
// ReferenceError，整个 AI 聊天入口（/ai-chat 与灵动岛）无法挂载。
const appendAndSend = (text) => {
  const content = String(text || '').trim();
  if (!content) return;
  appendToComposer(content);
  nextTick(() => {
    Promise.resolve(sendMessage()).catch((err) =>
      logger.error('bohai', 'Seed prompt send failed', err),
    );
  });
};

const useQuickSuggestion = (suggestion) => {
  inputMessage.value = String(suggestion || '');
  focusComposer();
};

const toggleSidebar = () => {
  if (settingsOpen.value) {
    settingsOpen.value = false;
  }
  isSidebarOpen.value = !isSidebarOpen.value;
};

const syncStandaloneViewport = () => {
  if (isStandalone.value && window.innerWidth < 1024) isSidebarOpen.value = false;
};

const closeOverlayPanels = () => {
  isSidebarOpen.value = false;
  settingsOpen.value = false;
  composerRef.value?.closePanel();
  if (chatSessions[currentSessionIndex.value]?.temporary) {
    deleteSession(currentSessionIndex.value);
  }
};

const resetQuickNavigation = () => {
  isSidebarOpen.value = false;
  settingsOpen.value = false;
  composerRef.value?.closePanel();
};

watch(
  () => props.quickActive,
  (active) => {
    if (active && props.overlayMode) resetQuickNavigation();
  },
  { immediate: true },
);

const AI_QUESTION_MARKER = '【追问】';

const parseAiQuestion = (content) => {
  if (!content) return null;
  const markerIndex = content.indexOf(AI_QUESTION_MARKER);
  if (markerIndex === -1) return null;

  const afterMarker = content.slice(markerIndex + AI_QUESTION_MARKER.length).trim();
  const lines = afterMarker
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const question = lines[0] || '';
  const options = lines
    .slice(1)
    .filter((l) => /^[-•*\d]+[.)]?\s/.test(l))
    .map((l) => l.replace(/^[-•*\d]+[.)]?\s+/, '').trim());
  if (!question || options.length < 2) return null;

  return { question, options };
};

watch(
  () => {
    const msgs = Array.isArray(messages.value) ? messages.value : [];
    return msgs.length > 0 ? msgs[msgs.length - 1]?.content : '';
  },
  (content) => {
    const msgs = Array.isArray(messages.value) ? messages.value : [];
    if (!msgs.length) {
      activeInlineQuestion.value = null;
      return;
    }
    const last = msgs[msgs.length - 1];
    if (last.role !== 'assistant') {
      activeInlineQuestion.value = null;
      return;
    }
    const parsed = parseAiQuestion(content || '');
    activeInlineQuestion.value = parsed
      ? { question: parsed.question, options: parsed.options, messageIndex: msgs.length - 1 }
      : null;
  },
  { immediate: true },
);

const isInitialScrollReady = ref(false);
const activeUserMessageIndex = ref(-1);

// BOH AI 实际可见上下文窗口：与 useChatEngine 中送入模型的预算口径保持一致
const contextBudgetPercentText = computed(() => {
  const usage = contextBudgetUsage.value;
  const pct = usage?.historyPercent ?? usage?.percent ?? 0;
  // 99.x% 仍显示 99%，避免界面先显示 100% 但自动整理尚未触发。
  return `${Math.floor(Math.max(0, Math.min(100, pct)))}%`;
});

// 顶层模式（Fast / Air / Code / Ultra / Gemini）运行时从 DB 读，前端不硬编码。

/* ── 今日额度：**只显示百分比**，且主指标是**剩余**（2026-10-08 用户口径第二版）────
   不再展示「你还有多少 Token」。尺子是**唯一的**：最低付费档 Plus = 100%
   ⇒ Plus 100% / Pro 250% / Max 625% / Ultra 1250%，附加包在同一把尺子上相加。
   所以 Max 刚过 0 点、没消耗 ⇒ 「今日剩余 625%」（用户点名的口径）。
   全部折算在 utils/ai-quota-display.js，本文件与两个子组件都不再自己算除法、
   更不再格式化 Token 数。
   ⚠️ 第一版把分母设成「自己档位的基础额度」（恒 100%），用户连问两次
   「我是 Max，为什么显示 100%」—— 那种「自洽但反直觉」的口径已废弃。 */
const quotaDisplay = computed(() => resolveAiQuotaDisplay(todayTokenUsage.value || {}));

const todayTokenTitle = computed(() =>
  todayTokenUsage.value ? quotaDisplay.value.titleLabel : '',
);

// 额度压力分档：< 85% 正常 / 85–94% 琥珀 / >= 95% 红。
// ⚠️ 判据是 `meterPercent`（**已用占总额**的比例），不是「剩余百分比」——
// 主指标换成「剩余」之后，压力仍然由消耗量决定，别跟着反过来。
const quotaLevelClass = computed(() => {
  if (!todayTokenUsage.value) return '';
  const pct = quotaDisplay.value.meterPercent;
  if (pct >= 95) return 'is-danger';
  if (pct >= 85) return 'is-warn';
  return '';
});

const lastAssistantMessageIndex = computed(() => {
  const list = Array.isArray(messages.value) ? messages.value : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.role === 'assistant') return i;
  }
  return -1;
});

const showContextWarning = computed(() => {
  const usage = contextBudgetUsage.value;
  if (!usage) return false;
  const pct = usage?.historyPercent ?? 0;
  return pct >= 80;
});

const contextWarningText = computed(() => {
  const pct = contextBudgetUsage.value?.historyPercent ?? 0;
  return pct >= 100
    ? '上下文已到 100%，下次发送时会先自动整理早期对话'
    : '上下文接近 100%，到达后会自动整理早期对话';
});

// ─── 用量：单环 = 对话上下文，额度收进浮层 ────────────────────────────
// 「主动压缩」可用条件：
// - 上下文预算级别 >= mid（55%），说明历史窗口开始紧张，有压缩价值
// - 当前未在压缩
// 压缩成功后 level 会降到 low，按钮自然消失；消息增加 level 再次升到 mid 时按钮再现
const canCompressContext = computed(() => {
  const usage = contextBudgetUsage.value;
  if (!usage) return false;
  return usage.level !== 'low' && !isCompressingContext.value;
});

// 压缩成功反馈：在按钮位置显示"✓ 上下文已压缩"3 秒，比 Island Message 更直接
const showCompressSuccess = ref(false);
let compressSuccessTimer = null;
const triggerCompressSuccess = () => {
  showCompressSuccess.value = true;
  if (compressSuccessTimer) clearTimeout(compressSuccessTimer);
  compressSuccessTimer = setTimeout(() => {
    showCompressSuccess.value = false;
  }, 3000);
};

const handleManualCompress = async () => {
  if (isCompressingContext.value) return;
  // 压缩期间 isCompressingContext=true，预算环位置会显示"正在压缩上下文"+ 旋转图标
  // 输入框和发送按钮已通过 :disabled="isCompressingContext" 禁用
  try {
    const ok = await compressContextManually();
    if (ok) {
      triggerCompressSuccess();
    } else {
      emitIslandMessage({
        title: '无需整理',
        message: '当前对话还不足以生成有效摘要，多聊几轮后再试。',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 3000,
      });
    }
  } catch {
    emitIslandMessage({
      title: '整理失败',
      message: '上下文压缩未完成，请稍后重试。',
      icon: 'ai',
      type: 'notification',
      actionLabel: '知道了',
      durationMs: 3000,
    });
  }
};

const hiddenMessageCount = computed(() => {
  const total = Array.isArray(messages.value) ? messages.value : [];
  return Math.max(0, total.length - visibleMessageLimit.value);
});

const visibleMessageItems = computed(() => {
  const list = Array.isArray(messages.value) ? messages.value : [];
  const start = Math.max(0, list.length - visibleMessageLimit.value);
  return list.slice(start).map((message, offset) => ({
    message,
    index: start + offset,
  }));
});

const showMoreMessages = () => {
  visibleMessageLimit.value += 60;
  nextTick(updateActiveUserMessageFromScroll);
};

const compactPlanText = (content, maxLength = 72) => {
  if (content === null || content === undefined) return '';
  const raw = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  const text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text === '""' || text === "''" || text === 'null' || text === 'undefined') return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const isPlanText = (content) =>
  /(plan\s*模式|计划模式|制定.{0,12}计划|(?:三|四|五|\d+)步计划|行动计划|执行计划|持续推进|不断推进|长期推进|分步推进|一步步推进|阶段|里程碑|路线图|拆成步骤|下一步行动|风险跟踪|降低幻觉|减少幻觉)/i.test(
    String(content || ''),
  );

const latestUserPlanMessage = computed(() => {
  const list = Array.isArray(messages.value) ? messages.value : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (item?.role === 'user') return item;
  }
  return null;
});

const latestAssistantPlanMessage = computed(() => {
  const list = Array.isArray(messages.value) ? messages.value : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (item?.role === 'assistant') return item;
  }
  return null;
});

const getMessageActionNotes = (msg) => {
  if (!msg || msg.role !== 'assistant') return [];
  const notes = Array.isArray(msg?.meta?.actionNotes) ? msg.meta.actionNotes : [];
  return notes
    .map((note) => String(note || '').trim())
    .filter((note) => note && !/^(?:检索了|搜索了)/u.test(note))
    .slice(0, 4);
};

const latestAssistantPlanNotes = computed(() =>
  getMessageActionNotes(latestAssistantPlanMessage.value),
);

const isPlanExperienceActive = computed(() => {
  if (isPlanModeEnabled.value) return true;
  if (currentModeId.value === 'plan') return true;
  if (latestAssistantPlanNotes.value.some((note) => /Plan 模式|分步推进/.test(note))) return true;
  if (isPlanText(latestUserPlanMessage.value?.content)) return true;
  return false;
});

const isAgentClusterModeActive = computed(() => currentModeId.value === 'agent-cluster');

const AGENT_CLUSTER_LABEL_MAP = {
  orchestrator: '编排',
  synthesizer: '合成',
  'chat-engine': '对话',
  retriever: '检索',
  memory: '记忆',
  ops: '操作',
  code: '代码',
  creative: '创作',
  analyst: '推理',
};

const agentClusterEntries = computed(() => {
  const agents =
    agentClusterState?.agents && typeof agentClusterState.agents === 'object'
      ? agentClusterState.agents
      : {};
  const entries = Object.entries(agents).map(([key, info]) => ({
    key,
    label: info?.label || AGENT_CLUSTER_LABEL_MAP[key] || key,
    status: info?.status || 'pending',
    ms: info?.ms || 0,
  }));
  const priority = [
    'orchestrator',
    'retriever',
    'memory',
    'ops',
    'chat-engine',
    'analyst',
    'creative',
    'code',
    'synthesizer',
  ];
  entries.sort((a, b) => {
    const ai = priority.indexOf(a.key);
    const bi = priority.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return entries;
});

const agentClusterPanelTitle = computed(() => {
  if (agentClusterState?.isRunning) return 'Agent 集群运行中…';
  if (agentClusterState?.degraded) return 'Agent 集群已降级';
  if (agentClusterState?.answer) return 'Agent 集群已完成';
  return 'Agent 集群';
});

const agentClusterPanelSubtitle = computed(() => {
  const total = agentClusterEntries.value.length;
  if (total === 0) {
    return '选择此模式后，下次发送会自动编排多 Agent 并行处理。';
  }
  const finished = agentClusterEntries.value.filter(
    (entry) =>
      entry.status === 'ok' ||
      entry.status === 'failed' ||
      entry.status === 'skipped' ||
      entry.status === 'cancelled',
  ).length;
  const tokens = Number(agentClusterState?.usage?.total || agentClusterState?.tokenEstimate || 0);
  const tokensHint = tokens > 0 ? ` · ${formatAgentClusterTokens(tokens)}` : '';
  if (agentClusterState?.isRunning) {
    return `${finished}/${total} 个 Agent 已完成 · ${agentClusterState.clusterMode || 'auto'}${tokensHint}`;
  }
  if (agentClusterState?.strategy) {
    return `${total} 个 Agent · 策略 ${agentClusterState.strategy} · ${agentClusterState.totalMs || 0}ms${tokensHint}`;
  }
  return `${total} 个 Agent · ${finished} 已完成${tokensHint}`;
});

const formatAgentClusterMs = (ms) => {
  const value = Number(ms) || 0;
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
};

const formatAgentClusterTokens = (tokens) => {
  const value = Number(tokens) || 0;
  if (value < 1000) return `${value} tok`;
  if (value < 10000) return `${(value / 1000).toFixed(1)}k tok`;
  return `${Math.round(value / 1000)}k tok`;
};

const currentPlanGoal = computed(() => {
  const goal = compactPlanText(latestUserPlanMessage.value?.content, 96);
  return goal || '等待你给出一个要持续推进的目标。';
});

const planPanelTitle = computed(() => {
  if (isLoading.value) return '正在推进计划';
  if (latestAssistantPlanNotes.value.some((note) => /Plan 模式|分步推进/.test(note)))
    return '计划推进已就绪';
  return 'Plan 工作台';
});

const planPanelSubtitle = computed(() => {
  const status = String(thinkingStatus.value || '').trim();
  if (isLoading.value && status) return status;
  if (isLoading.value) return getGrokLoadingLabel();
  return compactPlanText(currentPlanGoal.value, 54);
});

const planEvidenceSummary = computed(() => {
  const trace = getMessageRetrievalTrace(latestAssistantPlanMessage.value);
  const sources = Array.isArray(trace?.connectors)
    ? trace.connectors.filter((item) => item?.ok)
    : [];
  if (sources.length > 0) {
    return `已参考 ${sources
      .map((item) => item.label || item.source)
      .filter(Boolean)
      .slice(0, 4)
      .join('、')}。`;
  }
  if (isSearching.value || isForumSearchEnabled.value || isTreeholeMemoryEnabled.value) {
    return '已开启检索/参考能力，生成时会优先使用可获得的资料。';
  }
  return '当前主要依据本轮对话；需要事实核实时会标注不确定或提示补充资料。';
});

const planNextAction = computed(() => {
  if (isLoading.value) return '等待当前回复完成，然后从输出的下一步行动继续。';
  if (latestAssistantPlanMessage.value?.content)
    return '按最近一次回复中的下一步行动继续，或补充新的约束让我更新计划。';
  return '输入目标后，我会先拆阶段，再逐步推进。';
});

const extractPlanSegments = (content) => {
  const text = compactPlanText(content, 180);
  const cleaned = text
    .replace(/^(请你|请|帮我|我想|我希望|需要|把|给我)\s*/i, '')
    .replace(/[。.!！?？]+$/g, '')
    .trim();
  if (!cleaned) {
    return {
      first: '确认目标和约束',
      later: '拆解步骤并给出下一步行动',
    };
  }

  const firstThenMatch = cleaned.match(/先(.{2,60}?)(?:再|然后|之后)(.{2,80})/);
  if (firstThenMatch) {
    return {
      first: compactPlanText(firstThenMatch[1], 42),
      later: compactPlanText(firstThenMatch[2], 52),
    };
  }

  const stageMatch = cleaned.match(/(.{2,60}?)(?:，|,|；|;|并|和)(.{2,80})/);
  if (stageMatch && cleaned.length > 24) {
    return {
      first: compactPlanText(stageMatch[1], 42),
      later: compactPlanText(stageMatch[2], 52),
    };
  }

  return {
    first: compactPlanText(cleaned, 54),
    later: '形成可执行步骤并保留下一步行动',
  };
};

const getPlanTodoState = (index) => {
  const hasAnswer = Boolean(compactPlanText(latestAssistantPlanMessage.value?.content, 8));
  if (hasAnswer && !isLoading.value) {
    return 'done';
  }
  if (!isLoading.value) {
    return index === 0 ? 'active' : 'pending';
  }
  const seconds = Number(thinkingTime.value || 0);
  if (index === 0) return 'done';
  if (index === 1) return seconds >= 2.4 ? 'done' : 'active';
  if (index === 2) return seconds >= 5.2 ? 'done' : seconds >= 2.4 ? 'active' : 'pending';
  return seconds >= 5.2 ? 'active' : 'pending';
};

const parseTaskListFromContent = (content) => {
  if (!content) return [];
  const items = [];
  const regex = /-\s*\[([ x])\]\s*(.+?)(?:\s*[-—]\s*(.+?))?(?=\n|$)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    items.push({
      id: `task-${items.length}`,
      title: match[2].trim(),
      detail: (match[3] || '').trim(),
      state: match[1] === 'x' ? 'done' : 'pending',
    });
  }
  return items;
};

const planTodoItems = computed(() => {
  if (isAgentClusterModeActive.value && agentClusterEntries.value.length > 0) {
    return agentClusterEntries.value.map((entry) => {
      const statusMap = {
        ok: 'done',
        failed: 'failed',
        skipped: 'done',
        cancelled: 'cancelled',
        running: 'active',
      };
      const detailMap = {
        ok: '完成',
        failed: '失败',
        skipped: '已跳过',
        cancelled: '已取消',
        running: '执行中…',
      };
      return {
        id: entry.key,
        title: entry.label,
        detail: detailMap[entry.status] || '等待中',
        state: statusMap[entry.status] || 'pending',
      };
    });
  }
  if (currentModeId.value === 'plan') {
    const assistantMsg = latestAssistantPlanMessage.value;
    const parsed = parseTaskListFromContent(assistantMsg?.content);
    if (parsed.length > 0) return parsed;
    if (assistantMsg?.content) {
      return [
        {
          id: 'plan-goal',
          title: compactPlanText(assistantMsg.content, 80),
          detail: 'Plan 模式 · 正在推进',
          state: isLoading.value ? 'active' : 'done',
        },
      ];
    }
    return [
      {
        id: 'plan-start',
        title: '分析目标并拆解步骤',
        detail: String(thinkingStatus.value || '').trim() || '等待开始执行',
        state: isLoading.value ? 'active' : 'pending',
      },
    ];
  }
  const segments = extractPlanSegments(latestUserPlanMessage.value?.content);
  const statusLabel = String(thinkingStatus.value || '').trim() || getGrokLoadingLabel();
  return [
    {
      id: 'first',
      title: '先做',
      detail: segments.first,
      state: getPlanTodoState(0),
    },
    {
      id: 'evidence',
      title: '核对依据',
      detail: planEvidenceSummary.value,
      state: getPlanTodoState(1),
    },
    {
      id: 'later',
      title: '后做',
      detail: segments.later,
      state: getPlanTodoState(2),
    },
    {
      id: 'finish',
      title: isLoading.value ? '正在执行' : '完成当前轮次',
      detail: isLoading.value ? statusLabel : planNextAction.value,
      state: getPlanTodoState(3),
    },
  ];
});

const planTodoSummary = computed(() => {
  const done = planTodoItems.value.filter((item) => item.state === 'done').length;
  return `${done}/${planTodoItems.value.length} 已完成`;
});

const taskPanelStatus = computed(() => {
  if (taskLifecycleOverride.value === 'cancelled') return { id: 'cancelled', label: '已停止' };
  if (isLoading.value || agentClusterState?.isRunning) return { id: 'running', label: '执行中' };

  const assistantText = String(latestAssistantPlanMessage.value?.content || '').trim();
  const failed =
    Boolean(rateLimitMessage.value) ||
    /^(?:服务暂时繁忙|请求失败|发生错误|连接失败|无法连接|API Key 管理服务异常)/u.test(
      assistantText,
    );
  if (failed) return { id: 'failed', label: '需要处理' };
  if (assistantText) return { id: 'completed', label: '已完成' };
  return { id: 'pending', label: '待开始' };
});

const taskPanelTitle = computed(() => {
  if (isAgentClusterModeActive.value) return agentClusterPanelTitle.value;
  if (taskPanelStatus.value.id === 'waiting') return '任务等待你的确认';
  if (taskPanelStatus.value.id === 'cancelled') return '任务已停止';
  if (taskPanelStatus.value.id === 'failed') return '任务未能完成';
  return planPanelTitle.value;
});

const taskPanelSubtitle = computed(() => {
  if (taskPanelStatus.value.id === 'waiting') return '确认授权后将从当前步骤继续。';
  if (taskPanelStatus.value.id === 'cancelled') return '已保留当前对话和完成的步骤。';
  if (taskPanelStatus.value.id === 'failed')
    return String(rateLimitMessage.value || '可以从当前目标重新尝试。');
  return isAgentClusterModeActive.value ? agentClusterPanelSubtitle.value : planPanelSubtitle.value;
});

const taskPanelProgress = computed(() => {
  const items = planTodoItems.value;
  if (items.length === 0) return taskPanelStatus.value.id === 'completed' ? 100 : 0;
  const score = items.reduce((total, item) => {
    if (item.state === 'done') return total + 1;
    if (item.state === 'active') return total + 0.45;
    return total;
  }, 0);
  return Math.max(0, Math.min(100, Math.round((score / items.length) * 100)));
});

const taskPanelElapsed = computed(() => {
  const totalMs = Number(agentClusterState?.totalMs || 0);
  if (!isLoading.value && totalMs > 0) return `${formatAgentClusterMs(totalMs)}`;
  const seconds = Number(thinkingTime.value || 0);
  if (!isLoading.value || seconds <= 0) return '';
  return seconds < 60
    ? `${Math.max(1, Math.round(seconds))} 秒`
    : `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒`;
});

const stopTaskPanel = () => {
  taskLifecycleOverride.value = 'cancelled';
  stopGeneration();
};

const retryTaskPanel = async () => {
  const prompt = String(latestUserPlanMessage.value?.content || '').trim();
  if (!prompt || isLoading.value) return;
  taskLifecycleOverride.value = '';
  inputMessage.value = prompt;
  await nextTick();
  sendMessage().catch((error) => logger.error('bohai', 'Task retry failed', error));
};

watch(isLoading, (loading) => {
  if (loading) {
    taskLifecycleOverride.value = '';
    taskPanelExpanded.value = true;
  }
});

const hasTaskListMarkers = (msg) => {
  if (!msg || msg.role !== 'assistant') return false;
  return /-\s*\[[ x]\]/.test(String(msg.content || ''));
};

/* 任务面板是否显示在**最后一条 AI 消息**上（壳算好，消息流只负责渲染） */
const planCard = computed(() => {
  const idx = lastAssistantMessageIndex.value;
  let visible = false;
  if (idx >= 0) {
    const msg = messages.value[idx];
    visible =
      (isAgentClusterModeActive.value && agentClusterEntries.value.length > 0) ||
      (isPlanExperienceActive.value && planTodoItems.value.length > 0) ||
      (currentModeId.value === 'plan' && hasTaskListMarkers(msg));
  }
  return {
    visible,
    statusId: taskPanelStatus.value.id,
    statusLabel: taskPanelStatus.value.label,
    title: taskPanelTitle.value,
    subtitle: taskPanelSubtitle.value,
    progress: taskPanelProgress.value,
    elapsed: taskPanelElapsed.value,
    summary: planTodoSummary.value,
    items: planTodoItems.value,
    expanded: taskPanelExpanded.value,
  };
});

const onInlineEnter = (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.shiftKey) return;
  e.preventDefault();
  submitInlineAnswer();
};

const selectInlineOption = (option) => {
  aiQuestionAnswer.value = option;
  submitInlineAnswer();
};

const submitInlineAnswer = () => {
  const answer = aiQuestionAnswer.value.trim();
  if (!answer || isLoading.value) return;
  inputMessage.value = answer;
  aiQuestionAnswer.value = '';
  nextTick(() => {
    sendMessage().catch((err) => logger.error('bohai', 'Inline answer send failed', err));
  });
};

const getMessageRetrievalTrace = (msg) => {
  if (!msg || msg.role !== 'assistant') return null;
  return msg?.meta?.ragTrace || null;
};

const getRetrievalTraceSources = (msg) => {
  const trace = getMessageRetrievalTrace(msg);
  return Array.isArray(trace?.connectors) ? trace.connectors : [];
};

const toggleMessageDetails = (index) => {
  const next = new Set(expandedMessageDetails.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  expandedMessageDetails.value = next;
};

const setMessageFeedback = (index, value) => {
  const next = { ...messageFeedbackByIndex.value };
  next[index] = next[index] === value ? '' : value;
  messageFeedbackByIndex.value = next;
  notifyUnavailable(next[index] ? '反馈已记录' : '已取消反馈');
};

const getGrokLoadingLabel = () => {
  const liveStatus = String(thinkingStatus.value || '').trim();
  if (liveStatus) return liveStatus;
  const seconds = Number(thinkingTime.value || 0);
  if (seconds < 1.2) return '正在理解问题';
  if (seconds < 3.2) return '正在探索上下文';
  if (seconds < 6.5) return '正在组织内容';
  return '正在生成回复';
};

const normalizeNavLabel = (content) => {
  const raw = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  return raw.replace(/\s+/g, ' ').trim();
};

const userMessageNavItems = computed(() => {
  const list = Array.isArray(messages.value) ? messages.value : [];
  return list
    .map((msg, index) => {
      if (msg?.role !== 'user') return null;
      const fullText = normalizeNavLabel(msg.content);
      if (!fullText) return null;
      const label = fullText.length > 16 ? `${fullText.slice(0, 16)}...` : fullText;
      return { index, label, fullText };
    })
    .filter(Boolean);
});

const updateActiveUserMessageFromScroll = () => {
  const container = streamEl();
  if (!container || userMessageNavItems.value.length === 0) {
    activeUserMessageIndex.value = -1;
    return;
  }

  const containerTop = container.getBoundingClientRect().top;
  const anchorOffset = Math.min(220, Math.max(96, container.clientHeight * 0.28));
  let nextActive = userMessageNavItems.value[0].index;

  for (const item of userMessageNavItems.value) {
    const node = container.querySelector(`[data-message-index="${item.index}"]`);
    if (!node) continue;
    const top = node.getBoundingClientRect().top - containerTop;
    if (top <= anchorOffset) {
      nextActive = item.index;
    } else {
      break;
    }
  }

  activeUserMessageIndex.value = nextActive;
};

const scrollToMessage = async (index) => {
  const container = streamEl();
  if (!container) return;
  const total = Array.isArray(messages.value) ? messages.value.length : 0;
  const firstVisibleIndex = Math.max(0, total - visibleMessageLimit.value);
  if (index < firstVisibleIndex) {
    visibleMessageLimit.value = Math.max(visibleMessageLimit.value, total - index);
    await nextTick();
  }
  const node = container.querySelector(`[data-message-index="${index}"]`);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  activeUserMessageIndex.value = index;
};

/* 回车语义（2026-09-24）：触屏键盘没有 Shift / Cmd / Ctrl，原逻辑在
   enterToSend=true 时换行被物理封死、=false 时发送被物理封死（两条路必断一条）。
   移动端固定「Enter 换行 + 发送按钮发送」，桌面行为不变。
   短路即可：textarea 的 Enter 默认行为就是换行。 */
const isCoarsePointer =
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);

const handleEnter = (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (isCoarsePointer) return;
  if (globalAiPreferences.enterToSend ? e.shiftKey : !(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  sendMessage();
};

const scrollToBottom = (force = false) => {
  nextTick(() => {
    const container = streamEl();
    if (container) {
      const { scrollHeight, clientHeight, scrollTop } = container;
      if (force || scrollHeight - clientHeight - scrollTop < 300) {
        container.scrollTo({ top: scrollHeight, behavior: force ? 'auto' : 'smooth' });
      }
    }
  });
};

const jumpToBottomNow = () => {
  const container = streamEl();
  if (!container) return;
  container.scrollTop = container.scrollHeight;
};

const settleInitialScrollPosition = async () => {
  if (!props.overlayMode) {
    isInitialScrollReady.value = true;
    scrollToBottom(true);
    nextTick(updateActiveUserMessageFromScroll);
    return;
  }

  isInitialScrollReady.value = false;
  await nextTick();
  jumpToBottomNow();

  requestAnimationFrame(() => {
    jumpToBottomNow();
    requestAnimationFrame(() => {
      jumpToBottomNow();
      isInitialScrollReady.value = true;
      updateActiveUserMessageFromScroll();
    });
  });
};

// 选完强度与 selectMode 行为一致：整个面板收起（由 `BohComposer` 内部完成）。
const selectThinkingSpeed = (id) => {
  setThinkingSpeed(id);
};

const selectMode = (modeId) => {
  const mode = chatModes.value?.find((item) => item.id === modeId);
  if (!mode) {
    return;
  }

  currentModeId.value = modeId;
  persistModeSetting();
  const multiplierHint =
    mode.quotaMultiplier > 1
      ? `消耗倍率 ${mode.quotaMultiplier}x，会使用更多 Token`
      : mode.description || mode.tagline || 'BOH AI 模式已更新';
  emitIslandMessage({
    title: `已切换 ${mode.name}`,
    message: multiplierHint,
    icon: 'ai',
    type: 'notification',
    actionLabel: '知道了',
    durationMs: 3600,
  });
};

// 外部种子提问（论坛问BOHAI等）指定的默认模型：静默切换，不弹模式通知。
// 与 selectMode 的差异仅在无 UI 反馈 —— 岛刚被打开，用户没动过模式菜单。
const applySeedMode = (modeId) => {
  const mode = chatModes.value?.find((item) => item.id === modeId);
  if (!mode || currentModeId.value === mode.id) {
    return;
  }
  currentModeId.value = mode.id;
  persistModeSetting();
};

const toggleSearch = () => {
  isSearching.value = !isSearching.value;
  if (isSearching.value) {
    isCommandMode.value = false;
  }
};

const toggleForumSearch = () => {
  isForumSearchEnabled.value = !isForumSearchEnabled.value;
};

// 健康分析：开启后本轮回答会带上用户本机的 BOH Health 数据（localStorage，无需登录）
const toggleHealthAnalysis = () => {
  isHealthAnalysisEnabled.value = !isHealthAnalysisEnabled.value;
};

/** 面板「高级」四工具的统一入口（`BohComposer` 只发 kind） */
const toggleTool = (kind) => {
  if (kind === 'forum') toggleForumSearch();
  if (kind === 'health') toggleHealthAnalysis();
  if (kind === 'cloud') handleTreeholeMemoryToggle();
};

/**
 * 心理分析：输入框右侧展开面板 → 工具组里的一键入口。
 *
 * 做三件事：
 * 1. 切到「心理专家」角色 —— 访谈协议、不给选项、认识论分层都挂在这个角色的提示附录里
 *    （见 src/views/BOHAI/expert-roles/psychologist.js），不切角色就不会访谈。
 * 2. 空会话时填入一句启动语，交给现有 sendMessage 链路发出去 —— 于是 AI 直接主动开口提问。
 *    已有内容的会话只切角色、不代发，避免重复点击叠出多条「开始」。
 * 3. 不新增任何 UI：入口复用展开面板工具组的行样式，输出复用消息渲染。
 */
const startPsychAnalysis = () => {
  if (currentResponseStyleId.value !== 'psychologist') {
    setResponseStyle('psychologist');
  }
  // 访谈是「多规则 + 精细追问」的任务，轻量模型跟不上这套协议（实测 fast 会退化成问卷）。
  // 能升就升；未登录时 pro 不在可选列表里，保持原样不报错。
  const strongerMode = chatModes.value?.find((item) => item.id === 'pro');
  if (strongerMode && currentModeId.value === 'fast') {
    selectMode('pro');
  }
  const session = chatSessions[currentSessionIndex.value];
  const hasHistory = (session?.messages?.length || 0) > 0;
  if (hasHistory) return;
  // 初始化访谈状态。三件事全靠它：
  // ① 封闭域判定（不读站内数据、不写记忆）② 每轮注入状态块 ③ 输出守门。
  // 默认轨道用「人生模式审计」——用户没选轨道，AI 会在对话里自然聚焦方向。
  session.expertState = createExpertState({ trackId: 'pattern' });
  inputMessage.value = '我想做一次心理分析，你直接开始问我吧。';
  Promise.resolve(sendMessage()).catch((err) =>
    logger.error('bohai', 'Psych analysis start failed', err),
  );
};

const slashQuery = computed(() => {
  const value = String(inputMessage.value || '');
  if (!value.startsWith('/') || value.includes('\n') || /\s/.test(value)) return null;
  return value.slice(1).toLowerCase();
});

const slashCommands = computed(() => [
  {
    id: 'web',
    keyword: 'web',
    label: '联网搜索',
    description: '为下一条消息获取最新网络信息',
    action: 'web',
  },
  {
    id: 'community',
    keyword: 'community',
    label: '社区搜索',
    description: '为下一条消息查找 BOH 社区内容',
    action: 'community',
  },
  {
    id: 'cloud',
    keyword: 'cloud',
    label: '个人 Cloud+',
    description: '允许下一条回答参考你的 Cloud+ 内容',
    action: 'cloud',
  },
  {
    id: 'health',
    keyword: 'health',
    label: '健康分析',
    description: '让下一条回答参考你的 BOH Health 数据',
    action: 'health',
  },
  ...(chatModes.value || []).map((mode) => ({
    id: `mode-${mode.id}`,
    keyword: String(mode.name || mode.id)
      .toLowerCase()
      .replace(/\s+/g, '-'),
    label: `切换到 ${mode.name}`,
    description: mode.tagline || '更改当前响应模式',
    action: 'mode',
    modeId: mode.id,
  })),
]);

const filteredSlashCommands = computed(() => {
  const query = slashQuery.value;
  if (query === null) return [];
  if (!query) return slashCommands.value;
  return slashCommands.value.filter(
    (command) => command.keyword.includes(query) || command.label.toLowerCase().includes(query),
  );
});

const slashMenuOpen = computed(
  () => !slashDismissed.value && slashQuery.value !== null && !isLoading.value,
);

const runSlashCommand = async (command) => {
  if (!command) return;
  if (command.action === 'web') isSearching.value = true;
  if (command.action === 'community') isForumSearchEnabled.value = true;
  if (command.action === 'mode' && command.modeId) selectMode(command.modeId);
  inputMessage.value = '';
  slashDismissed.value = false;
  slashActiveIndex.value = 0;
  nextTick(() => {
    composerRef.value?.autoResize();
    composerRef.value?.focus();
  });
  if (command.action === 'cloud') {
    if (isTreeholeMemoryEnabled.value) {
      emitIslandMessage({
        title: '个人 Cloud+ 已开启',
        message: '下一条回答可以参考你的 Cloud+ 内容',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 3000,
      });
    } else {
      await toggleTreeholeMemory();
    }
  }
  if (command.action === 'health') {
    isHealthAnalysisEnabled.value = true;
    emitIslandMessage({
      title: '已开启健康分析',
      message: '接下来的回答会带上你的 BOH Health 数据，点输入框上的「健康分析」标签可关闭',
      icon: 'ai',
      type: 'notification',
      actionLabel: '知道了',
      durationMs: 3600,
    });
  }
};

const handleComposerInput = () => {
  slashDismissed.value = false;
  slashActiveIndex.value = 0;
};

const handleComposerKeydown = (event) => {
  if (slashMenuOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = filteredSlashCommands.value.length;
      if (count > 0) {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        slashActiveIndex.value = (slashActiveIndex.value + delta + count) % count;
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      slashDismissed.value = true;
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && filteredSlashCommands.value.length > 0) {
      event.preventDefault();
      runSlashCommand(
        filteredSlashCommands.value[slashActiveIndex.value] || filteredSlashCommands.value[0],
      );
      return;
    }
  }
  if (event.key === 'Enter') handleEnter(event);
};

const deleteMessage = (index) => {
  if (index >= 0 && index < chatSessions[currentSessionIndex.value].messages.length) {
    chatSessions[currentSessionIndex.value].messages.splice(index, 1);
  }
};

const notifyUnavailable = (message) => {
  uiNotice.value = String(message || '').trim();
  if (uiNoticeTimer) {
    clearTimeout(uiNoticeTimer);
    uiNoticeTimer = null;
  }
  if (uiNotice.value) {
    uiNoticeTimer = setTimeout(() => {
      uiNotice.value = '';
      uiNoticeTimer = null;
    }, 1800);
  }
  if (uiNotice.value) {
    emitIslandMessage({
      title: uiNotice.value,
      message: '',
      icon: 'notification',
      type: 'notification',
      actionLabel: '知道了',
      durationMs: 2600,
    });
  }
};

const copyMessage = async (content) => {
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
  notifyUnavailable('已复制');
};

/**
 * 把「有效主题」写到 `<html data-boh-theme>`，供 tokens.css 的
 * `:root[data-boh-theme='dark']` 切换整套语义别名。
 *
 * ⚠️ **必须读 `resolvedAiTheme`，不能读 `currentSiteTheme`**（2026-10-08 修，阻断级）
 * 暗色 token 的唯一入口是 tokens.css:112 的 `:root[data-boh-theme='dark']`，而 Step 6
 * 重绘后的组件树里 `boh-*.css` / `layout.css` 的 `[data-theme]` 暗色规则**全为 0**
 * （HEAD 时代是由 `bohai-dark.css` 里 139 行 `.bohai-page[data-theme="dark"]` 兜的底，
 * 已随旧 CSS 一并删除）。原先这里只看站点主题，于是触发条件
 * 「站点浅色 + 设置→外观→深色」时：页面级 `:data-theme="resolvedAiTheme"` 已是 dark，
 * 但 `data-boh-theme` 没置位 ⇒ 整页 BOHAI 保持浅色底 + 深色字。
 */
const syncThemeAttribute = () => {
  currentSiteTheme.value = themeManager.isDark?.() ? 'dark' : 'light';
  if (resolvedAiTheme.value === 'dark') {
    document.documentElement.setAttribute('data-boh-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-boh-theme');
  }
};

// 外观偏好在设置面板里改，**不经过 themeManager** —— 原先只有 onMounted 与站点主题
// 切换两条路径能重跑上面那段，改成深色后不会立即生效。这里补一条依赖。
watch(resolvedAiTheme, syncThemeAttribute);

const handleThemeChange = (
  _theme,
  _preference,
  uiStyle = themeManager.getUiStyle?.() || currentUiStyle.value,
) => {
  currentUiStyle.value = uiStyle;
  syncThemeAttribute();
};

/* ---------- 传给子组件的展示模型（壳算，子组件只渲染） ---------- */

const composerPlaceholder = computed(() => {
  if (isCompressingContext.value) return '正在整理上下文，请稍候…';
  return surface.value === 'work'
    ? '描述要做的活儿，或输入 / 使用命令'
    : '问点什么，或输入 / 使用命令';
});

const composerTools = computed(() => ({
  forum: Boolean(isForumSearchEnabled.value),
  cloud: Boolean(isTreeholeMemoryEnabled.value),
  health: Boolean(isHealthAnalysisEnabled.value),
}));

const composerUsage = computed(() => ({
  // 空对话时用量环不显示（沿用旧口径：`messages.length > 0` 才渲染）
  visible: messages.value.length > 0,
  percent: Math.max(0, Math.min(100, Math.floor(contextBudgetUsage.value?.historyPercent || 0))),
  percentText: contextBudgetPercentText.value,
  levelClass: quotaLevelClass.value,
  windowUsed: contextBudgetUsage.value?.windowUsed || 0,
  windowMax: contextBudgetUsage.value?.windowMax || 0,
  includedMessageCount: contextBudgetUsage.value?.includedMessageCount || 0,
  hasSummary: Boolean(contextBudgetUsage.value?.hasSummary),
  quotaVisible: Boolean(todayTokenUsage.value),
  // 主指标 = **剩余**（Plus 尺子）：Max 没消耗就是 625%。
  quotaRemainingText: quotaDisplay.value.remainingLabel,
  // ⚠️ 进度条宽度必须用归一后的 meterPercent：它是「已用 ÷ 总额」，天然落在 0–100。
  // 不能把 remainingLabel 拿来当宽度 —— 625% 会把条撑到容器外。
  quotaMeterText: quotaDisplay.value.meterText,
  quotaDetailText: quotaDisplay.value.detailLabel,
  canCompress: canCompressContext.value,
  compressSuccess: showCompressSuccess.value,
}));

const sidebarQuota = computed(() => {
  const usage = todayTokenUsage.value;
  if (!usage) return null;
  const display = quotaDisplay.value;
  return {
    // 主指标 = 剩余（Plus 尺子），与设置页、输入区浮层同一份折算
    remainingLabel: display.remainingLabel,
    // 进度条宽度走归一值（见 composerUsage 的注释）
    meterPercent: Math.max(0, Math.min(100, Math.floor(display.meterPercent))),
    // 满量程 > 100% 即「本档带了附加包」，浮层里补一句说明
    hasPack: display.hasPack,
    packLabel: display.packLabel,
    detail: display.detailLabel,
    title: todayTokenTitle.value,
  };
});

/* 左下角账号（2026-10-08）：头像 + 名称由壳从 auth store 取，侧栏组件不发网络请求。
   字段做多路兜底 —— auth store 的 UserInfo 在历史上有 `avatarUrl` / `avatar_url` 两种写法
   （见 stores/auth.ts 的 `avatarUrl` 与 `avatar_url` 解构），名称同理（nickname / username / 手机号）。 */
const sidebarAccount = computed(() => {
  const info = authStore.userInfo || {};
  const name = String(info.nickname || info.username || info.phone || info.email || '未登录');
  return {
    name,
    avatarUrl: String(info.avatarUrl || info.avatar_url || ''),
    initial: name.slice(0, 1).toUpperCase() || '?',
  };
});

/* 订阅计划文案：档位取自 quota-status（`fetchTodayQuota` 落的 tier）。
   ⚠️ 设置面板的用量卡还会用订阅接口**覆盖**一次 tier（订阅刚变更时更准）；
   侧栏这里只读 quota-status，接受「刚续费后可能滞后一拍」——
   点开设置面板即可看到权威值，不值得为它多打一次接口。 */
const sidebarPlan = computed(() => {
  const fallbackTier = isLoggedIn.value ? 'free' : 'guest';
  const tier = String(todayTokenUsage.value?.tier || fallbackTier);
  return {
    tier,
    label: TIER_DISPLAY_LABELS[tier] || tier,
    isFree: tier === 'free' || tier === 'guest',
  };
});

const goUpgradePlan = () => {
  router.push('/user-center/subscriptions');
};

const workSources = computed(() => {
  const idx = lastAssistantMessageIndex.value;
  if (idx < 0) return [];
  return getRetrievalTraceSources(messages.value[idx])
    .filter((source) => source.ok)
    .slice(0, 6)
    .map((source) => ({
      key: source.connectorId || source.label,
      prefix: sourcePrefix(source),
      label: source.label || source.source,
      total: Number(source.total || 0),
    }));
});

const AGENT_STEP_STATE = {
  ok: 'done',
  skipped: 'done',
  failed: 'failed',
  cancelled: 'failed',
  running: 'run',
};
const AGENT_STEP_LABEL = {
  ok: '完成',
  skipped: '已跳过',
  failed: '失败',
  cancelled: '已取消',
  running: '进行中',
};

const workSteps = computed(() =>
  agentClusterEntries.value.map((entry) => ({
    id: entry.key,
    label: `${entry.label} · ${AGENT_STEP_LABEL[entry.status] || '等待中'}`,
    state: AGENT_STEP_STATE[entry.status] || 'pending',
  })),
);

/* 产物（docx / pptx / xlsx）目前恒为空 —— BOH AI 还没有 generator。
   面板先把位置与形状落下，接入 generator 时只填 `workArtifacts`。 */
const workArtifacts = ref([]);

const handleArtifactDownload = (artifact) => {
  if (!artifact?.blobUrl) return;
  const a = document.createElement('a');
  a.href = artifact.blobUrl;
  a.download = artifact.name || 'artifact';
  a.click();
};

onMounted(() => {
  currentUiStyle.value = themeManager.getUiStyle?.() || 'glass';
  themeManager.addListener(handleThemeChange);
  syncThemeAttribute();
  onScrollToBottom(scrollToBottom);
  settleInitialScrollPosition();
  window.addEventListener('resize', syncStandaloneViewport);
  fetchTodayQuota();

  // 支持其他页面带种子提问跳转过来（例如 BOH Health 的「用 BOH AI 分析」）：
  // /ai-chat?ask=... 仅在独立页面模式生效，全局浮层不参与路由。
  const seedAsk = String(route.query?.ask || '').trim();
  if (seedAsk && isStandalone.value) {
    // 注意：这里必须用 history.replaceState，不能用 router.replace。
    // App.vue 的 RouterView 用 activeRoute.fullPath 作为组件 :key，
    // router.replace 会把 fullPath 从 /ai-chat?ask=... 改成 /ai-chat，
    // 导致本组件被销毁重建，下面预填进输入框的内容会连同组件一起丢失。
    // replaceState 只改地址栏、不通知 vue-router，因此不会触发重建。
    if (window.history?.replaceState) {
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${window.location.search}#/ai-chat`,
      );
    }
    inputMessage.value = seedAsk;
    nextTick(() => {
      composerRef.value?.autoResize();
      composerRef.value?.focus();
    });
    // 等配额与会话初始化完成后自动发出，完成无缝接力；
    // 若用户在这期间改动了输入框，则不再自动发送。
    window.setTimeout(() => {
      if (!isLoading.value && inputMessage.value === seedAsk) {
        sendMessage();
      }
    }, 700);
  }

  // Detect component visibility for Teleported elements (sidebar/overlay).
  // When the parent tab switches away (v-show="false"), the .bohai-page
  // becomes display:none and its size collapses to 0. ResizeObserver fires
  // exactly on that transition (IntersectionObserver does not fire for
  // display:none elements), so we observe the page root directly instead of
  // polling offsetHeight every second.
  const pageEl = bohaiPageRoot.value || document.querySelector('.bohai-page');
  const checkVisibility = (el) => {
    const target = el || pageEl;
    if (target) {
      const visible = target.offsetHeight > 0;
      if (isComponentVisible.value !== visible) {
        isComponentVisible.value = visible;
        if (!visible) isSidebarOpen.value = false;
      }
    }
  };
  // OS/browser tab switches do not resize the element; keep the visibilitychange hook.
  // Wrap in a stable arrow so the Event object is never mistaken for the target element.
  const onVisibilityChange = () => checkVisibility();
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (pageEl && typeof ResizeObserver === 'function') {
    visibilityResizeObserver = new ResizeObserver((entries) => {
      checkVisibility(entries?.[0]?.target);
    });
    visibilityResizeObserver.observe(pageEl);
  } else {
    // Legacy fallback: lightweight poll only when ResizeObserver is unavailable
    visibilityFallbackIntervalId = setInterval(() => checkVisibility(), 1000);
  }
  checkVisibility();

  // Store cleanup references
  visibilityObserver = {
    cleanup: () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (visibilityResizeObserver) {
        visibilityResizeObserver.disconnect();
        visibilityResizeObserver = null;
      }
      if (visibilityFallbackIntervalId) {
        clearInterval(visibilityFallbackIntervalId);
        visibilityFallbackIntervalId = null;
      }
    },
  };
});

onUnmounted(() => {
  themeManager.removeListener(handleThemeChange);
  window.removeEventListener('resize', syncStandaloneViewport);
  if (quotaRefreshTimer) {
    clearTimeout(quotaRefreshTimer);
    quotaRefreshTimer = null;
  }
  if (visibilityObserver) {
    visibilityObserver.cleanup();
    visibilityObserver = null;
  }
  if (uiNoticeTimer) {
    clearTimeout(uiNoticeTimer);
    uiNoticeTimer = null;
  }
  if (compressSuccessTimer) {
    clearTimeout(compressSuccessTimer);
    compressSuccessTimer = null;
  }
  if (deepWatchScrollRafId) {
    cancelAnimationFrame(deepWatchScrollRafId);
    deepWatchScrollRafId = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (confirmState.resolve) {
    confirmState.resolve(false);
    confirmState.resolve = null;
  }
  confirmState.show = false;
});

watch(currentSessionIndex, () => {
  visibleMessageLimit.value = 80;
  expandedMessageDetails.value = new Set();
  messageFeedbackByIndex.value = {};
  clearMarkdownCache();
  settleInitialScrollPosition();
});

watch(
  [
    isSidebarOpen,
    settingsOpen,
    currentSessionIndex,
    () => chatSessions[currentSessionIndex.value]?.title,
    () => chatSessions[currentSessionIndex.value]?.temporary,
  ],
  () => {
    if (!props.overlayMode) return;
    emit('overlay-state', {
      sidebarOpen: isSidebarOpen.value,
      settingsOpen: settingsOpen.value,
      title: chatSessions[currentSessionIndex.value]?.title || 'BOH AI',
      temporary: Boolean(chatSessions[currentSessionIndex.value]?.temporary),
    });
  },
  { immediate: true },
);

const handleEscapeLayer = () => {
  if (composerRef.value?.panelOpen) {
    composerRef.value.closePanel();
    return true;
  }
  if (settingsOpen.value) {
    settingsOpen.value = false;
    return true;
  }
  if (isSidebarOpen.value) {
    isSidebarOpen.value = false;
    return true;
  }
  return false;
};

defineExpose({
  toggleSidebar,
  openSettings,
  startNewChat,
  startTemporaryChat,
  focusComposer,
  appendToComposer,
  appendAndSend,
  applySeedMode,
  setAttachedContext,
  clearAttachedContext,
  handleEscapeLayer,
  closeOverlayPanels,
  resetQuickNavigation,
  setSurface,
  toggleWorkPanel,
});

// 消息列表深度监听的滚动节流
let deepWatchScrollRafId = null;
watch(
  () => messages.value.length,
  () => {
    if (props.overlayMode && !isInitialScrollReady.value) {
      return;
    }
    if (deepWatchScrollRafId) return;
    deepWatchScrollRafId = requestAnimationFrame(() => {
      deepWatchScrollRafId = null;
      scrollToBottom();
      nextTick(updateActiveUserMessageFromScroll);
    });
  },
);

// 注：手动压缩的"压缩中/已完成"提示由 handleManualCompress 统一管理。
// 自动压缩的"压缩中"状态通过用量浮层里的提示显示，不再通过 emitIslandMessage 弹出提示。
</script>

<!-- BOH AI 设计令牌单一真源（plans/025 v2 · Step 1，零行为变更）。
     必须是**非 scoped**：`:root` 若被加上 `[data-v-*]` 属性选择器就永远匹配不到 <html>。 -->
<style src="./styles/tokens.css"></style>

<!-- 壳级布局（`.bohai-page` / `.boh-shell` / `.boh-main` / `.boh-float-actions` / `.boh-backdrop`）。
     各区域组件的基座与断点在各自的 scoped CSS 里 —— 理由见 layout.css 文件头纪律 2。 -->
<style scoped src="./styles/layout.css"></style>

<!-- 横屏左栏页面级规则（body.page-aichat 段）：必须非 scoped —— body 前缀的选择器
     会被 scoped 属性选择器作废。与 UserSpaceMain / ProfileMain / Home 引入同一份文件，
     断点与栏宽档位只在那一个文件里定义。 -->
<style src="@/views/user-center/UserSpace/styles/landscape-rail.css"></style>
