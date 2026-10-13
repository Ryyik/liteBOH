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

      <!-- `is-empty`（2026-10-11）：空态时整组（虚影字 + 输入框）垂直居中，
           第一条消息发出后由壳把输入框 FLIP 到底部。判据与动画见 `animateComposerHome`。 -->
      <main class="boh-main" :class="{ 'is-empty': isEmptySession }">
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
          @send="handleSend"
          @stop="stopGeneration"
          @toggle-search="toggleSearch"
          @toggle-tool="toggleTool"
          @attach-page="handleAttachPage"
          @start-psych="startPsychAnalysis"
          @select-mode="selectMode"
          @run-slash-command="executeSlashCommand"
          @update:slash-active-index="slashActiveIndex = $event"
          @clear-context="clearAttachedContext"
          @compress="handleManualCompress"
          @open-usage="openUsageInSettings"
          @open-settings="openSettingsFromComposer"
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
import BohSidebar from './components/BohSidebar.vue';
import BohChatStream from './components/BohChatStream.vue';
import BohComposer from './components/BohComposer.vue';
import BohWorkPanel from './components/BohWorkPanel.vue';
import BohaiSettingsPanel from './components/BohaiSettingsPanel.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue';
import { PanelLeft, PanelRight } from 'lucide-vue-next';
import { useBohShell } from '../composables/useBohShell.js';

/* 形态开关由宿主（路由 / BOHAIIsland 灵动岛 / 首页种子提问）传入；defineProps / defineEmits 是编译宏，必须留在壳里，composable 只拿实例。 */
const props = defineProps({
  embedded: { type: Boolean, default: false },
  overlayMode: { type: Boolean, default: false },
  quickActive: { type: Boolean, default: false },
  quickSuggestions: { type: Array, default: () => [] },
});

const emit = defineEmits(['island-message', 'overlay-state']);

/* BOHAIMain 薄壳（plans/025 v2 · Step 7）：本文件只做布局装配 + 形态切换，
   状态与接线全在 useBohShell（../composables/useBohShell.js）；
   下面按模板引用顺序原样解构 —— 模板的绑定一个都不用改。 */
const {
  isStandalone,
  currentUiStyle,
  resolvedAiTheme,
  currentSiteTheme,
  globalAiPreferences,
  railUnreadCount,
  userSpaceNavItems,
  handleRailNavClick,
  handleRailAction,
  isLoggedIn,
  isSidebarOpen,
  settingsOpen,
  isComponentVisible,
  chatSessions,
  currentSessionIndex,
  sidebarQuota,
  sidebarAccount,
  sidebarPlan,
  startNewChat,
  switchSession,
  requestDeleteSession,
  renameSession,
  togglePinSession,
  openSettings,
  openUsageInSettings,
  openSettingsFromComposer,
  goUpgradePlan,
  setSurface,
  toggleSidebar,
  toggleWorkPanel,
  surface,
  workPanelOpen,
  streamRef,
  composerRef,
  bohaiPageRoot,
  messages,
  visibleMessageItems,
  hiddenMessageCount,
  isEmptySession,
  isThinking,
  isLoading,
  webSearchActive,
  webSearchResults,
  communitySearchActive,
  planCard,
  activeInlineQuestion,
  aiQuestionAnswer,
  messageFeedbackByIndex,
  expandedMessageDetails,
  userMessageNavItems,
  activeUserMessageIndex,
  fullPageSuggestions,
  useQuickSuggestion,
  showMoreMessages,
  updateActiveUserMessageFromScroll,
  scrollToMessage,
  deleteMessage,
  copyMessage,
  setMessageFeedback,
  toggleMessageDetails,
  selectInlineOption,
  submitInlineAnswer,
  onInlineEnter,
  taskPanelExpanded,
  stopTaskPanel,
  retryTaskPanel,
  inputMessage,
  isCompressingContext,
  isSearching,
  composerPlaceholder,
  filteredChatModes,
  chatModes,
  chatModesLoading,
  currentMode,
  currentModeId,
  composerTools,
  attachedContext,
  composerUsage,
  slashMenuOpen,
  filteredSlashCommands,
  slashActiveIndex,
  rateLimitMessage,
  uiNotice,
  showContextWarning,
  contextWarningText,
  handleComposerInput,
  handleComposerKeydown,
  handleSend,
  stopGeneration,
  toggleSearch,
  toggleTool,
  handleAttachPage,
  startPsychAnalysis,
  selectMode,
  executeSlashCommand,
  clearAttachedContext,
  handleManualCompress,
  workArtifacts,
  workSources,
  workSteps,
  handleArtifactDownload,
  settingsFocusSection,
  currentResponseStyleId,
  setResponseStyle,
  responseStyleOptions,
  isTreeholeMemoryEnabled,
  isSharedMemoryEnabled,
  isTreeholeMemoryToggling,
  memorySettingsStatus,
  handleTreeholeMemoryToggle,
  handleSharedMemoryToggle,
  clearCurrentChat,
  exportChatData,
  clearAllChatData,
  confirmState,
  handleConfirm,
  handleClose,
  exposedApi,
} = useBohShell(props, emit);

/* 对外 API：名单定义在 composable 的 exposedApi，这里原样转发。 */
defineExpose(exposedApi);
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
