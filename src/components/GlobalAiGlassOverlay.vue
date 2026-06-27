<template>
  <Teleport to="body">
    <div ref="overlayRef" class="global-ai-glass-overlay" :class="{
      'is-open': isOpen || isDragging,
      'is-dragging': isDragging,
      'is-snapping': isSnapping,
      'is-fullscreen': isFullscreen,
      'keyboard-visible': keyboardVisible
    }" :data-theme="theme" :style="overlayStyle" role="dialog" aria-modal="true" aria-label="BOH AI 快速对话">

      <div v-if="isMobile" class="global-ai-glass-handle" @touchstart="onHandleTouchStart"
        @touchmove="onHandleTouchMove" @touchend="onHandleTouchEnd">
        <div class="global-ai-glass-handle-bar"></div>
      </div>

      <button v-if="isOpen" class="global-ai-glass-close" type="button" aria-label="关闭 BOH AI" @click="close">
        <X :size="19" :stroke-width="2" aria-hidden="true" />
      </button>

      <div v-if="mountedOnce" class="global-ai-glass-chat" ref="chatRef">
        <BOHAIChat :embedded="true" :overlay-mode="true" @island-message="$emit('island-message', $event)" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import AiChatSkeleton from '@/views/user-center/UserSpace/components/AiChatSkeleton.vue'
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay'

const BOHAIChat = defineAsyncComponent({
  loader: () => import('@/views/BOHAI/BOHAI/BOHAIMain.vue'),
  loadingComponent: AiChatSkeleton,
  errorComponent: {
    name: 'BOHAILoadError',
    setup() {
      return () => h('div', { class: 'ai-load-fallback' }, [
        h('h3', 'BOH AI 加载失败'),
        h('p', '请刷新页面后重试，或稍后再打开 AI。')
      ])
    }
  },
  delay: 120,
  timeout: 15000
})

defineProps({
  theme: { type: String, default: '' },
  show: { type: Boolean, default: true }
})

defineEmits(['close', 'island-message'])

const {
  isOpen, isDragging, dragProgress,
  close, setOverlayHeight, startDrag, moveDrag, endDrag
} = useGlobalAiOverlay()

const overlayRef = ref(null)
const chatRef = ref(null)
const isSnapping = ref(false)
const isMobile = ref(false)
const mountedOnce = ref(false)
const keyboardVisible = ref(false)
const keyboardHeight = ref(0)
let snapTimer = null

function checkMobile() {
  isMobile.value = window.innerWidth <= 1023
}

const isFullscreen = computed(() => dragProgress.value >= 1.9)

function translateYPercent(p) {
  // 半屏状态：确保面板高度足够显示输入框（至少60%屏幕高度）
  // 增加面板可见高度，确保输入框在可见区域内
  if (p <= 1) return 100 - 60 * p  // 当p=1时，返回40%，面板可见高度为60%
  // 全屏状态：平滑过渡到0%
  return 40 - 40 * (p - 1)
}

const overlayStyle = computed(() => {
  if (!isMobile.value) {
    // 桌面端也需要基础样式，确保面板正确显示
    return {
      '--panel-height': `${window.innerHeight}px`,
      '--panel-visible-bottom': '0px',
      '--kbd-height': `${keyboardHeight.value}px`
    }
  }
  const ty = translateYPercent(dragProgress.value)
  const tyPx = (ty / 100) * window.innerHeight

  // 面板可见高度
  const panelHeight = window.innerHeight - tyPx

  // 计算面板可见区域的底部位置（相对于视口）
  // 面板向上移动tyPx距离，所以面板底部在视口底部向上tyPx的位置
  const panelVisibleBottom = tyPx

  return {
    transform: `translate3d(0, ${ty}%, 0)`,
    '--panel-height': `${panelHeight}px`,
    '--panel-visible-bottom': `${panelVisibleBottom}px`,
    '--kbd-height': `${keyboardHeight.value}px`,
    borderRadius: ty <= 0 ? '0' : '24px 24px 0 0'
  }
})

function onHandleTouchStart(e) {
  e.stopPropagation()
  if (isSnapping.value) return
  const touch = e.touches[0]
  startDrag(touch.clientY)
}

function onHandleTouchMove(e) {
  e.preventDefault()
  if (!isDragging.value) return
  const touch = e.touches[0]
  moveDrag(touch.clientY)
}

function onHandleTouchEnd() {
  if (!isDragging.value) return
  endDrag()
}

watch(isDragging, (val) => {
  if (!val && isOpen.value) {
    isSnapping.value = true
    clearTimeout(snapTimer)
    snapTimer = setTimeout(() => {
      isSnapping.value = false
    }, 600)
  }
})

watch(isOpen, (val) => {
  if (val) {
    if (!mountedOnce.value) mountedOnce.value = true
    isSnapping.value = true
    clearTimeout(snapTimer)
    snapTimer = setTimeout(() => {
      isSnapping.value = false
    }, 600)
    
    // 调试日志：显示层级信息
    setTimeout(() => {
      const glassOverlay = document.querySelector('.global-ai-glass-overlay');
      const quotaBackdrop = document.querySelector('.quota-backdrop');
      console.log('===== GlobalAiGlassOverlay 层级调试 =====');
      console.log('GlobalAiGlassOverlay (.global-ai-glass-overlay):', {
        存在: !!glassOverlay,
        computedZIndex: glassOverlay ? getComputedStyle(glassOverlay).zIndex : 'N/A',
        DOM位置: glassOverlay ? Array.from(document.body.children).indexOf(glassOverlay) : 'N/A'
      });
      console.log('AiQuotaSidePanel (.quota-backdrop):', {
        存在: !!quotaBackdrop,
        computedZIndex: quotaBackdrop ? getComputedStyle(quotaBackdrop).zIndex : 'N/A',
        DOM位置: quotaBackdrop ? Array.from(document.body.children).indexOf(quotaBackdrop) : 'N/A'
      });
      console.log('==========================================');
    }, 100);
  }
})

function updateKeyboard() {
  if (window.visualViewport) {
    const diff = window.innerHeight - window.visualViewport.height
    keyboardVisible.value = diff > 120
    keyboardHeight.value = diff

    // 键盘弹出时，自动滚动到输入框附近
    if (diff > 120 && chatRef.value) {
      setTimeout(() => {
        const chatContainer = chatRef.value.querySelector('.chat-container')
        if (chatContainer) {
          chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
          })
        }
      }, 150)
    }
  }
}

onMounted(() => {
  // 组件挂载时立即设置 mountedOnce，确保 BOHAIChat 可以渲染
  mountedOnce.value = true
  document.body.classList.add('global-ai-glass-open')

  // iOS键盘弹出时，阻止viewport自动调整
  // 添加临时meta标签，阻止iOS缩放和调整viewport
  const viewportMeta = document.querySelector('meta[name="viewport"]')
  if (viewportMeta) {
    const originalContent = viewportMeta.getAttribute('content')
    viewportMeta.setAttribute('content', originalContent + ', viewport-fit=cover')
  }

  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.visualViewport?.addEventListener('resize', updateKeyboard)
  updateKeyboard()
  const el = overlayRef.value
  if (el) {
    setOverlayHeight(() => window.innerHeight)
  }
})

onUnmounted(() => {
  document.body.classList.remove('global-ai-glass-open')
  window.removeEventListener('resize', checkMobile)
  window.visualViewport?.removeEventListener('resize', updateKeyboard)
  clearTimeout(snapTimer)
})
</script>

<style scoped>
.global-ai-glass-overlay {
  --global-ai-bottom-nav-clearance: max(8px, env(safe-area-inset-bottom, 0px));
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483646; /* 略低于限额面板，确保限额面板可以覆盖 */
  display: flex;
  flex-direction: column;
  padding: 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)); /* ✨ 新增：基础安全边距 */
  /* iOS键盘弹出时，阻止面板被推上去 */
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.3), rgba(226, 232, 240, 0.2)),
    rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #0f172a;
  isolation: isolate;
  will-change: transform, opacity;
  opacity: 0;
  pointer-events: none;
}

.global-ai-glass-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
}

.global-ai-glass-overlay.is-snapping {
  transition: transform 520ms cubic-bezier(0.16, 1, 0.3, 1), opacity 360ms ease, border-radius 300ms ease;
}

.global-ai-glass-overlay.is-dragging {
  transition: none;
}

@media (max-width: 1023px) {
  .global-ai-glass-overlay {
    /* 移动端：确保面板始终占满屏幕，不被键盘推上去 */
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    height: 100vh;
    max-height: 100vh;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -8px 40px rgba(15, 23, 42, 0.12);
    padding-bottom: calc(
      var(--global-ai-bottom-nav-clearance)
      + max(12px, env(safe-area-inset-bottom, 0px))
    ); /* ✨ 新增：移动端竖屏增强安全边距 */
  }

  .global-ai-glass-overlay.is-fullscreen {
    border-radius: 0;
  }
}

@media (min-width: 1024px) {
  .global-ai-glass-overlay {
    top: 0;
    left: auto;
    right: 0;
    width: 460px;
    height: 100dvh;
    border-left: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: -8px 0 40px rgba(15, 23, 42, 0.1);
    transform: translate3d(100%, 0, 0);
  }

  .global-ai-glass-overlay.is-open {
    transform: translate3d(0, 0, 0);
  }
}

.global-ai-glass-overlay.keyboard-visible {
  --kbd-clearance: max(8px, env(safe-area-inset-bottom, 0px));
}

.global-ai-glass-overlay.keyboard-visible .global-ai-glass-chat :deep(.chat-container) {
  /* 键盘弹出时，调整聊天容器padding，确保输入框可见 */
  padding-bottom: calc(var(--global-ai-bottom-nav-clearance) + 96px + var(--kbd-height, 0px));
}

/* 半屏状态下，确保输入框在面板内可见 */
.global-ai-glass-chat :deep(.bohai-page.overlay-mode .input-area) {
  width: min(calc(100% - 32px), 860px);
  /* 输入框相对于视口定位，固定在面板可见区域的底部 */
  position: fixed !important;
  /* 输入框位置 = 面板底部位置 + 安全距离 + 键盘高度 */
  bottom: calc(var(--panel-visible-bottom, 0px) + max(8px, env(safe-area-inset-bottom, 0px)) + var(--kbd-height, 0px)) !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  padding-bottom: 0;
  opacity: 1 !important;
  visibility: visible !important;
  z-index: 10 !important;
}

.global-ai-glass-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  cursor: grab;
  touch-action: none;
}

.global-ai-glass-handle:active {
  cursor: grabbing;
}

.global-ai-glass-handle-bar {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.5);
  transition: background 0.2s ease, width 0.2s ease;
}

.global-ai-glass-handle:hover .global-ai-glass-handle-bar {
  background: rgba(148, 163, 184, 0.7);
  width: 40px;
}

.global-ai-glass-close {
  position: fixed;
  top: max(14px, env(safe-area-inset-top, 0px));
  right: max(14px, env(safe-area-inset-right, 0px));
  z-index: 2147482100;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: #111827;
  cursor: pointer;
  transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
}

.global-ai-glass-close:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.86);
  border-color: rgba(255, 255, 255, 0.92);
}

.global-ai-glass-chat {
  position: relative;
  z-index: 2;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.global-ai-glass-chat :deep(.bohai-page) {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.global-ai-glass-chat :deep(.bohai-page),
.global-ai-glass-chat :deep(.bohai-container),
.global-ai-glass-chat :deep(.main-content) {
  height: 100%;
  min-height: 0;
  background: transparent !important;
}

.global-ai-glass-chat :deep(.bohai-page) {
  --bohai-bg: transparent;
  --bohai-chat-rail-width: min(calc(100% - 28px), 920px);
  --bohai-composer: 860px;
}

.global-ai-glass-chat :deep(.sidebar),
.global-ai-glass-chat :deep(.sidebar-overlay) {
  top: 0;
  bottom: 0;
}

.global-ai-glass-chat :deep(.main-content) {
  margin-left: 0;
}

.global-ai-glass-chat :deep(.sidebar-open-btn) {
  top: max(14px, env(safe-area-inset-top, 0px));
  left: max(14px, env(safe-area-inset-left, 0px));
  background: rgba(255, 255, 255, 0.62);
  border-color: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
}

.global-ai-glass-chat :deep(.chat-container) {
  padding-top: max(126px, calc(118px + env(safe-area-inset-top, 0px)));
  padding-bottom: calc(var(--global-ai-bottom-nav-clearance) + 96px);
}

/* 拖拽和吸附动画过渡 */
.global-ai-glass-overlay.is-snapping .global-ai-glass-chat :deep(.bohai-page.overlay-mode .input-area) {
  transition: bottom 520ms cubic-bezier(0.16, 1, 0.3, 1);
}

.global-ai-glass-overlay.is-dragging .global-ai-glass-chat :deep(.bohai-page.overlay-mode .input-area) {
  transition: none;
}

.global-ai-glass-chat :deep(.input-box) {
  background: rgba(255, 255, 255, 0.74);
  border-color: rgba(255, 255, 255, 0.78);
  box-shadow:
    0 18px 50px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
  transition: transform 520ms cubic-bezier(0.16, 1, 0.3, 1), opacity 360ms ease;
}

.global-ai-glass-chat :deep(.empty-state) {
  min-height: auto;
  justify-content: center;
  padding-top: 0;
  padding-bottom: 0;
}

.global-ai-glass-chat :deep(.input-box),
.global-ai-glass-chat :deep(.sidebar-inner),
.global-ai-glass-chat :deep(.sidebar-item),
.global-ai-glass-chat :deep(.message-actions),
.global-ai-glass-chat :deep(.scroll-to-bottom),
.global-ai-glass-chat :deep(.message.user .message-content),
.global-ai-glass-chat :deep(.conversation-jump-nav),
.global-ai-glass-chat :deep(.message-tile),
.global-ai-glass-chat :deep(.empty-suggestion-card),
.global-ai-glass-chat :deep(.features-menu),
.global-ai-glass-chat :deep(.header-glass),
.global-ai-glass-chat :deep(.sidebar-toggle),
.global-ai-glass-chat :deep(.settings-btn),
.global-ai-glass-chat :deep(.share-btn),
.global-ai-glass-chat :deep(.search-box),
.global-ai-glass-chat :deep(.model-selector-content),
.global-ai-glass-chat :deep(.knowledge-btn),
.global-ai-glass-chat :deep(.compact-input),
.global-ai-glass-chat :deep(.compact-popup),
.global-ai-glass-chat :deep(.ai-settings-drawer),
.global-ai-glass-chat :deep(.sidebar-open-btn),
.global-ai-glass-chat :deep(.conversation-header) {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.global-ai-glass-chat :deep(.input-box) {
  background: rgba(255, 255, 255, 0.82);
}

:global(body.global-ai-glass-open .sidebar.is-embedded),
:global(body.global-ai-glass-open .sidebar.open.is-embedded) {
  z-index: 2147483655 !important; /* 高于玻璃面板(2147483646) */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: rgba(255, 255, 255, 0.96) !important;
}

:global([data-boh-theme="dark"] body.global-ai-glass-open .sidebar.is-embedded),
:global([data-boh-theme="dark"] body.global-ai-glass-open .sidebar.open.is-embedded) {
  background: rgba(15, 23, 42, 0.96) !important;
}

:global(body.global-ai-glass-open .sidebar-overlay.is-embedded) {
  z-index: 2147483650 !important; /* 高于玻璃面板但低于侧栏 */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: transparent !important;
  pointer-events: none !important;
}

:global(body.global-ai-glass-open .sidebar-open-btn) {
  z-index: 2147482100 !important;
}

:global(body.global-ai-glass-open .ai-settings-backdrop) {
  z-index: 2147483656 !important; /* 高于侧栏(2147483655) */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  isolation: isolate;
  will-change: transform;
}

:global(body.global-ai-glass-open .ai-settings-drawer) {
  z-index: 2147483657 !important; /* 高于遮罩层 */
  position: relative !important;
}

.global-ai-glass-overlay[data-theme="dark"] {
  color: #f8fafc;
  background:
    linear-gradient(180deg, rgba(15, 18, 24, 0.62), rgba(15, 18, 24, 0.48)),
    rgba(2, 6, 23, 0.28);
}

.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-close {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.58);
}

.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-chat :deep(.input-box),
.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-chat :deep(.sidebar-open-btn) {
  background: rgba(15, 23, 42, 0.72);
  border-color: rgba(255, 255, 255, 0.12);
}

.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-chat :deep(.bohai-page.embedded-mode .sidebar) {
  background: rgba(15, 23, 42, 0.72);
  border-right-color: rgba(255, 255, 255, 0.12);
  box-shadow: 18px 0 44px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

@media (max-width: 767px) {
  .global-ai-glass-close {
    top: max(14px, env(safe-area-inset-top, 0px));
  }

  .global-ai-glass-chat :deep(.bohai-page) {
    --bohai-chat-rail-width: min(calc(100% - 24px), 860px);
    --bohai-composer: 860px;
  }

  .global-ai-glass-chat :deep(.input-area),
  .global-ai-glass-chat :deep(.conversation-jump-nav) {
    width: min(calc(100% - 24px), 860px);
  }

  .global-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav) {
    display: none !important;
  }
}

/* ===== 底部扫光效果（仅移动端入场一次性） ===== */
@media (max-width: 1023px) {
  .global-ai-glass-overlay::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(0deg,
        rgba(140, 200, 255, 0.22) 0%,
        rgba(140, 200, 255, 0.12) 18%,
        rgba(180, 150, 255, 0.06) 38%,
        transparent 55%);
    pointer-events: none;
    will-change: clip-path, opacity;
    clip-path: inset(100% 0 0 0);
    opacity: 0;
  }

  .global-ai-glass-overlay[data-theme="dark"]::after {
    background: linear-gradient(0deg,
        rgba(80, 200, 255, 0.25) 0%,
        rgba(80, 200, 255, 0.14) 18%,
        rgba(140, 100, 255, 0.08) 38%,
        transparent 55%);
  }

  @keyframes lightSweep {
    0% {
      clip-path: inset(100% 0 0 0);
      opacity: 0;
    }

    10% {
      opacity: 1;
    }

    40% {
      clip-path: inset(0% 0 0 0);
      opacity: 1;
    }

    70% {
      opacity: 0.6;
    }

    100% {
      clip-path: inset(0% 0 0 0);
      opacity: 0;
    }
  }

  .global-ai-glass-overlay.is-snapping.is-open::after {
    animation: lightSweep 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
}

@media (prefers-reduced-motion: reduce) {
  .global-ai-glass-overlay.is-snapping {
    transition-duration: 1ms !important;
  }

  .global-ai-glass-overlay.is-snapping.is-open::after {
    animation: none;
  }
}
</style>
