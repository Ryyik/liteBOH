<template>
  <Transition name="bohai-island-fade">
    <div
      v-if="isExpanded"
      class="bohai-island"
      :data-theme="theme"
      :class="{ 'is-thinking': isThinking, 'is-empty': isEmpty }"
      role="dialog"
      aria-label="BOH AI 灵动岛"
    >
      <!-- 顶部 header：状态 + 全屏按钮 -->
      <div class="bohai-island-header">
        <span class="bohai-island-header-icon" aria-hidden="true">
          <Sparkles v-if="!isThinking" :size="16" :stroke-width="2.1" />
          <LoaderCircle v-else class="spin" :size="16" :stroke-width="2.1" />
        </span>
        <span class="bohai-island-header-text">
          <template v-if="isEmpty"><strong>BOH AI</strong> 已就绪</template>
          <template v-else-if="isThinking"><strong>BOH AI</strong> 正在思考...</template>
          <template v-else><strong>BOH AI</strong> 对话中</template>
        </span>
        <div class="bohai-island-header-actions">
          <button
            type="button"
            class="bohai-island-icon-btn"
            title="新对话"
            aria-label="新对话"
            @click="onNewChat"
          >
            <Plus :size="15" :stroke-width="2.1" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="bohai-island-icon-btn"
            title="在完整页面打开"
            aria-label="在完整页面打开"
            @click="openFullscreen"
          >
            <Maximize2 :size="14" :stroke-width="2.1" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="bohai-island-icon-btn"
            title="关闭"
            aria-label="关闭"
            @click="collapse"
          >
            <X :size="14" :stroke-width="2.1" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- 中间：BOHAIMain 内嵌消息流（去气泡化） -->
      <div class="bohai-island-chat">
        <BOHAIMain
          ref="bohaiMainRef"
          embedded
          :overlay-mode="true"
          :quick-active="false"
          :quick-suggestions="[]"
          @island-message="onIslandMessage"
          @overlay-state="onOverlayState"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { LoaderCircle, Maximize2, Plus, Sparkles, X } from 'lucide-vue-next'
import { defineAsyncComponent } from 'vue'
import { useBohaiIsland } from '@/composables/useBohaiIsland'

const BOHAIMain = defineAsyncComponent(() => import('@/views/BOHAI/BOHAI/BOHAIMain.vue'))

const { isExpanded, collapse, openFullscreen } = useBohaiIsland()

const theme = computed(() => {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
})

const bohaiMainRef = ref(null)
const isThinking = ref(false)
const isEmpty = ref(true)

// 监听展开：聚焦输入框
watch(isExpanded, async (val) => {
  if (!val) return
  await nextTick()
  // 等 BOHAIMain 异步加载完成
  requestAnimationFrame(() => {
    bohaiMainRef.value?.focusComposer?.()
  })
})

function onIslandMessage(payload) {
  // 预留：BOHAIMain 主动发的岛消息
  if (payload?.type === 'thinking') {
    isThinking.value = payload.value
  }
  if (payload?.type === 'empty') {
    isEmpty.value = payload.value
  }
}

function onOverlayState(state) {
  // overlayMode 下 BOHAIMain 会 emit 状态变化
  if (state?.thinking !== undefined) isThinking.value = state.thinking
  if (state?.empty !== undefined) isEmpty.value = state.empty
}

function onNewChat() {
  bohaiMainRef.value?.startNewChat?.()
}

onMounted(() => {})
onUnmounted(() => {})
</script>

<style scoped>
/* ============================================
   BOHAI 灵动岛样式（纯 CSS，用 :global() 穿透 scoped 覆盖 BOHAIMain）
   ============================================ */

/* ---- Transition 包裹层：进场/退场与 surface 高度过渡同步 500ms ---- */
.bohai-island-fade-enter-active,
.bohai-island-fade-leave-active {
  transition:
    opacity 420ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 500ms cubic-bezier(0.16, 1, 0.3, 1),
    clip-path 500ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* 进场起始：在顶栏缝隙里缩成一条线，透明 */
.bohai-island-fade-enter-from {
  opacity: 0;
  transform: translateY(-18px) scale(0.9);
  clip-path: inset(0 0 100% 0 round 24px);
}

/* 进场结束：正常形态（与 leave-from 对称） */
.bohai-island-fade-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
  clip-path: inset(0 round 24px);
}

/* 退场起始：正常形态 */
.bohai-island-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
  clip-path: inset(0 round 24px);
}

/* 退场结束：缩回顶栏缝隙，从底部向上收 */
.bohai-island-fade-leave-to {
  opacity: 0;
  transform: translateY(-18px) scale(0.9);
  clip-path: inset(0 0 100% 0 round 24px);
}

@media (prefers-reduced-motion: reduce) {
  .bohai-island-fade-enter-active,
  .bohai-island-fade-leave-active {
    transition-duration: 160ms;
  }
}

/* ============================================
   顶栏 surface 形态联动
   ============================================ */
:global(.unified-nav-surface.has-bohai-island) {
  --bohai-island-top: var(--global-nav-rest-height, 72px);
  --bohai-island-bottom-gap: 12px;
  --bohai-island-height: min(50vh, 520px);
  height: calc(var(--bohai-island-top) + var(--bohai-island-height) + var(--bohai-island-bottom-gap)) !important;
  border-radius: 30px !important;
  background-color: rgba(255, 255, 255, 0.56);
  box-shadow:
    0 18px 48px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(22px) saturate(165%);
  -webkit-backdrop-filter: blur(22px) saturate(165%);
  /* transition 沿用 surface 默认 500ms cubic-bezier(0.16,1,0.3,1)，
     与岛的 Vue Transition 严格同步，进出节奏一致 */
}

:global(.unified-nav-surface.has-bohai-island) > :global(.nav-container) {
  position: relative;
  z-index: 3;
  height: var(--global-nav-rest-height, 72px);
}

/* ============================================
   岛本体
   ============================================ */
:global(.bohai-island) {
  position: absolute;
  z-index: 2;
  top: var(--bohai-island-top);
  right: 7px;
  left: 7px;
  display: flex;
  flex-direction: column;
  gap: 0;
  height: var(--bohai-island-height);
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 24px;
  color: #1e2938;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.30));
  box-shadow:
    0 14px 32px rgba(29, 41, 56, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(28px) saturate(175%);
  -webkit-backdrop-filter: blur(28px) saturate(175%);
  overflow: hidden;
  transform-origin: center top;
  will-change: transform, opacity;
}

/* 注：钻出动画完全由 Vue <Transition name="bohai-island-fade"> 接管，
   与 surface 的 height 过渡（380ms, cubic-bezier(0.16,1,0.3,1)）严格同步。
   不再用元素自身 keyframes，避免进场双动画叠加。 */

/* ============================================
   顶部 header
   ============================================ */
:global(.bohai-island-header) {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  color: #334155;
}

:global(.bohai-island-header-icon) {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  color: #6d38c8;
  background: linear-gradient(135deg, #eee4ff, #f6efff);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

:global(.bohai-island-header-icon .spin) {
  animation: bohaiIslandSpin 1.2s linear infinite;
}

@keyframes bohaiIslandSpin {
  to { transform: rotate(360deg); }
}

:global(.bohai-island-header-text) {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 560;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(.bohai-island-header-text strong) {
  color: #1d2938;
  font-weight: 700;
}

:global(.bohai-island-header-actions) {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

:global(.bohai-island-icon-btn) {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.34);
  color: #465569;
  cursor: pointer;
  transition: transform 140ms ease, background-color 160ms ease, color 160ms ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

:global(.bohai-island-icon-btn:hover) {
  background: rgba(255, 255, 255, 0.6);
  color: #1d2938;
  transform: translateY(-1px);
}

:global(.bohai-island-icon-btn:active) {
  transform: scale(0.94);
}

/* ============================================
   聊天区域（内嵌 BOHAIMain）
   ============================================ */
:global(.bohai-island-chat) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

/* 隐藏 BOHAIMain 的 sidebar */
:global(.bohai-island-chat .sidebar) {
  display: none !important;
}

/* 隐藏 BOHAIMain 的顶部 toolbar（岛自己有 header） */
:global(.bohai-island-chat .full-ai-toolbar),
:global(.bohai-island-chat .full-ai-toolbar-actions),
:global(.bohai-island-chat .full-ai-header) {
  display: none !important;
}

/* 调整 chat-container 高度：占满中间区域，不带顶部 padding */
:global(.bohai-island-chat .chat-container) {
  padding-top: 12px !important;
  padding-bottom: 8px !important;
  padding-left: 18px !important;
  padding-right: 18px !important;
}

/* ============================================
   去气泡化：把消息气泡变成纯文字流
   ============================================ */
:global(.bohai-island-chat .message-wrapper) {
  padding: 6px 0 !important;
}

:global(.bohai-island-chat .message-content-inner) {
  max-width: 100% !important;
  width: 100% !important;
  padding: 0 !important;
}

:global(.bohai-island-chat .message.user),
:global(.bohai-island-chat .message.assistant) {
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
  color: inherit !important;
  font-size: 14px !important;
  line-height: 1.65 !important;
}

/* 用户消息：右对齐，无气泡 */
:global(.bohai-island-chat .message.user) {
  text-align: right;
  color: #1d2938;
}

/* AI 消息：左对齐，无气泡 */
:global(.bohai-island-chat .message.assistant) {
  text-align: left;
  color: #334155;
}

/* 消息 header：只留 BOH AI 名字小字，去掉气泡感 */
:global(.bohai-island-chat .message-header) {
  padding: 0 0 4px 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border: 0 !important;
}

:global(.bohai-island-chat .message-role) {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #6d38c8 !important;
  letter-spacing: 0.02em !important;
  text-transform: none !important;
  background: transparent !important;
  padding: 0 !important;
  border: 0 !important;
}

/* 空态：居中，简化 */
:global(.bohai-island-chat .empty-state) {
  padding: 20px 10px 10px !important;
}

:global(.bohai-island-chat .empty-brand) {
  font-size: 22px !important;
  margin-bottom: 6px !important;
}

:global(.bohai-island-chat .empty-state h2) {
  font-size: 16px !important;
  margin-bottom: 4px !important;
}

:global(.bohai-island-chat .empty-subtitle) {
  font-size: 12.5px !important;
}

/* 隐藏 standalone 模式的建议按钮（岛太小放不下） */
:global(.bohai-island-chat .full-ai-suggestions) {
  display: none !important;
}

/* 隐藏"显示更早"按钮（岛模式下从第一条开始即可） */
:global(.bohai-island-chat .load-earlier-btn) {
  display: none !important;
}

/* 输入区域：去掉气泡感，融入岛底部 */
:global(.bohai-island-chat .composer-wrapper) {
  padding: 8px 14px 12px !important;
  background: transparent !important;
  border-top: 1px solid rgba(148, 163, 184, 0.14) !important;
  box-shadow: none !important;
}

:global(.bohai-island-chat .composer-input-wrapper) {
  background: rgba(255, 255, 255, 0.34) !important;
  border: 1px solid rgba(255, 255, 255, 0.46) !important;
  border-radius: 100px !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.42),
    0 4px 12px rgba(29, 41, 56, 0.045) !important;
  backdrop-filter: blur(14px) saturate(145%) !important;
}

:global(.bohai-island-chat .composer-textarea) {
  color: #1d2938 !important;
  font-size: 14px !important;
}

:global(.bohai-island-chat .composer-textarea::placeholder) {
  color: #94a3b8 !important;
}

:global(.bohai-island-chat .composer-send-btn) {
  background: linear-gradient(135deg, #d8f4e9, #c5eee0) !important;
  color: #057857 !important;
  border: 1px solid rgba(255, 255, 255, 0.6) !important;
}

:global(.bohai-island-chat .composer-send-btn:hover) {
  background: linear-gradient(135deg, #b9ecd7, #a5e5cb) !important;
}

/* ============================================
   暗色模式
   ============================================ */
:global(#unified-nav-container[data-theme="dark"]) .bohai-island {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(35, 39, 49, 0.78), rgba(22, 25, 33, 0.58));
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
  color: rgba(226, 232, 240, 0.86);
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-header-text strong {
  color: #f8fafc;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-header-icon {
  background: linear-gradient(135deg, rgba(109, 56, 200, 0.32), rgba(79, 70, 229, 0.22));
  color: #c4b5fd;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-icon-btn {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(226, 232, 240, 0.85);
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .message.user {
  color: #f8fafc;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .message.assistant {
  color: rgba(226, 232, 240, 0.86);
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .message-role {
  color: #c4b5fd !important;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .composer-wrapper {
  border-top-color: rgba(255, 255, 255, 0.06) !important;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .composer-input-wrapper {
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .composer-textarea {
  color: #f8fafc !important;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .composer-textarea::placeholder {
  color: rgba(148, 163, 184, 0.7) !important;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .composer-send-btn {
  background: linear-gradient(135deg, rgba(5, 120, 87, 0.4), rgba(5, 120, 87, 0.28)) !important;
  color: #6ee7b7 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

:global(#unified-nav-container[data-theme="dark"]) .bohai-island-chat .composer-send-btn:hover {
  background: linear-gradient(135deg, rgba(5, 120, 87, 0.55), rgba(5, 120, 87, 0.4)) !important;
}

/* ============================================
   响应式
   ============================================ */
@media (max-width: 768px) {
  :global(.unified-nav-surface.has-bohai-island) {
    --bohai-island-height: min(54vh, 460px);
  }

  :global(.bohai-island) {
    right: 5px;
    left: 5px;
  }

  :global(.bohai-island-chat .chat-container) {
    padding-left: 14px !important;
    padding-right: 14px !important;
  }
}

@media (max-width: 480px) {
  :global(.bohai-island-header-icon) {
    width: 26px;
    height: 26px;
  }

  :global(.bohai-island-icon-btn) {
    width: 26px;
    height: 26px;
  }
}
</style>
