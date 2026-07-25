<template>
  <Teleport to="body">
    <div ref="overlayRef" class="global-ai-glass-overlay" :class="{
      'is-open': isOpen || isDragging,
      'is-dragging': isDragging,
      'is-snapping': isSnapping,
      'is-fullscreen': isFullscreen,
      'is-history-open': panelState.sidebarOpen,
      'reduce-motion': !preferences.animationsEnabled,
      'keyboard-visible': keyboardVisible
    }" :data-theme="resolvedTheme" :data-density="preferences.density" :data-font-scale="preferences.fontScale" :style="overlayStyle" role="dialog" aria-modal="true" aria-label="BOH AI 快速对话">

      <div v-if="isMobile" class="global-ai-glass-handle" role="button" aria-label="拖动调整面板高度"
        @pointerdown="onHandlePointerDown" @pointermove="onHandlePointerMove"
        @pointerup="onHandlePointerUp" @pointercancel="onHandlePointerUp">
        <div class="global-ai-glass-handle-bar"></div>
      </div>

      <header v-if="isOpen && !panelState.settingsOpen" class="global-ai-quick-header">
        <button class="global-ai-header-btn" type="button" :aria-label="panelState.sidebarOpen ? '关闭历史记录' : '打开历史记录'" title="历史记录"
          @click="toggleHistory">
          <PanelLeft :size="19" aria-hidden="true" />
        </button>
        <div class="global-ai-header-copy">
          <strong>{{ panelState.title || 'BOH AI' }}</strong>
          <span>{{ panelState.temporary ? '临时对话 · 不保存' : '快捷对话' }}</span>
        </div>
        <button v-if="pageContext.available && !pageContext.attached" class="global-ai-context-btn" type="button" title="附加当前页面上下文" @click="toggleContextPreview">
          <Paperclip :size="16" />
          <span>{{ pageContext.label }}</span>
        </button>
        <button v-if="pageContext.attached" class="global-ai-context-btn attached" type="button" title="已附加 — 点击移除" @click="detachPageContext">
          <Paperclip :size="16" />
          <span>已附加</span>
        </button>
        <div class="global-ai-header-actions">
          <button class="global-ai-header-btn global-ai-settings-button" type="button" title="设置" aria-label="打开设置" @click="openSettings">
            <SlidersHorizontal :size="18" aria-hidden="true" />
          </button>
          <button v-if="isMobile" class="global-ai-header-btn global-ai-fullscreen-button" type="button"
            :title="isFullscreen ? '恢复面板高度' : '全屏'" :aria-label="isFullscreen ? '恢复面板高度' : '全屏'"
            @click="toggleFullscreen">
            <Minimize2 v-if="isFullscreen" :size="18" aria-hidden="true" />
            <Maximize2 v-else :size="18" aria-hidden="true" />
          </button>
          <button class="global-ai-header-btn global-ai-full-page-button" type="button" title="在完整页面打开" aria-label="在完整页面打开"
            @click="openFullPage">
            <ExternalLink :size="18" aria-hidden="true" />
          </button>
          <button class="global-ai-header-btn" type="button" aria-label="关闭 BOH AI" title="关闭 (Esc)" @click="close">
            <X :size="19" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div v-if="showContextPreview && previewContext" class="global-ai-context-preview" @click.stop>
        <div class="context-preview-header">
          <strong>附加页面内容</strong>
          <button type="button" class="context-preview-close" @click="showContextPreview = false">
            <X :size="16" />
          </button>
        </div>
        <div class="context-preview-body">
          <div class="context-preview-field"><span class="cp-label">页面</span><span class="cp-value">{{ previewContext.title || '无标题' }}</span></div>
          <div class="context-preview-field"><span class="cp-label">字符</span><span class="cp-value">{{ previewContext.charCount }} (~{{ previewContext.tokenEstimate }} tokens)</span></div>
          <div v-if="previewContext.selection" class="context-preview-section">
            <div class="cp-section-label">选中文本</div>
            <div class="cp-section-content">{{ previewContext.selection.slice(0, 200) }}{{ previewContext.selection.length > 200 ? '…' : '' }}</div>
          </div>
          <div v-if="previewContext.content" class="context-preview-section">
            <div class="cp-section-label">页面正文 ({{ previewContext.content.length }} 字符)</div>
            <div class="cp-section-content">{{ previewContext.content.slice(0, 300) }}{{ previewContext.content.length > 300 ? '…' : '' }}</div>
          </div>
          <div class="context-preview-options">
            <label class="cp-option" :class="{ active: contextMode === CONTEXT_MODE_TITLE_URL }">
              <input type="radio" v-model="contextMode" :value="CONTEXT_MODE_TITLE_URL" />
              <span>仅标题+URL</span>
            </label>
            <label class="cp-option" :class="{ active: contextMode === CONTEXT_MODE_SELECTION }">
              <input type="radio" v-model="contextMode" :value="CONTEXT_MODE_SELECTION" />
              <span>包含选中文本</span>
            </label>
            <label class="cp-option" :class="{ active: contextMode === CONTEXT_MODE_FULL }">
              <input type="radio" v-model="contextMode" :value="CONTEXT_MODE_FULL" />
              <span>完整页面</span>
            </label>
          </div>
        </div>
        <div class="context-preview-footer">
          <button type="button" class="cp-btn cp-btn-secondary" @click="showContextPreview = false">取消</button>
          <button type="button" class="cp-btn cp-btn-primary" @click="confirmAttachContext">附加到对话</button>
        </div>
      </div>

      <div v-if="mountedOnce" class="global-ai-glass-chat" ref="chatRef">
        <BOHAIChat ref="chatApiRef" :embedded="true" :overlay-mode="true" :quick-active="isOpen"
          :quick-suggestions="pageContext.suggestions"
          @overlay-state="handleOverlayState" @island-message="$emit('island-message', $event)" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X, PanelLeft, ExternalLink, SlidersHorizontal, Paperclip, Maximize2, Minimize2, Eye } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import AiChatSkeleton from '@/components/AiChatLoadingSkeleton.vue'
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay'
import { extractPageContext, CONTEXT_MODE_FULL, CONTEXT_MODE_SELECTION, CONTEXT_MODE_TITLE_URL } from '@/utils/page-context-extractor.js'
import { useGlobalAiPreferences } from '@/composables/useGlobalAiPreferences.js'

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

const props = defineProps({
  theme: { type: String, default: '' },
  show: { type: Boolean, default: true }
})

defineEmits(['close', 'island-message'])

const {
  isOpen, isDragging, dragProgress,
  close, setOverlayHeight, startDrag, moveDrag, endDrag
} = useGlobalAiOverlay()
const { preferences } = useGlobalAiPreferences()
const router = useRouter()

const overlayRef = ref(null)
const chatRef = ref(null)
const chatApiRef = ref(null)
const isSnapping = ref(false)
const isMobile = ref(false)
const isPortrait = ref(false)
const mountedOnce = ref(false)
const keyboardVisible = ref(false)
const keyboardHeight = ref(0)
// iOS Safari 视觉视口跟踪
const visualHeight = ref(0)
const visualOffsetTop = ref(0)
// iOS Safari 底部工具栏（URL/标签栏）高度：layoutH - visualHeight - kbdHeight
const safariBarHeight = ref(0)
// 上一次"非键盘态"的视觉视口高度，用于精确测出键盘高度（排除 URL 栏变化）
let baselineVisualHeight = 0
let snapTimer = null
// 焦点是否在遮罩内的可编辑控件
let isEditingFocused = false
const panelState = ref({ sidebarOpen: false, title: 'BOH AI', temporary: false, settingsOpen: false })
const pageContext = ref({ available: false, attached: false, label: '当前页面', text: '', suggestions: [] })
const showContextPreview = ref(false)
const contextMode = ref(CONTEXT_MODE_FULL)
const previewContext = ref(null)

const resolvedTheme = computed(() => {
  if (preferences.appearance === 'light' || preferences.appearance === 'dark') return preferences.appearance
  return props.theme || 'light'
})

function checkMobile() {
  const wasPortrait = isPortrait.value
  isMobile.value = window.innerWidth <= 1023
  isPortrait.value = isMobile.value && window.innerHeight >= window.innerWidth
  if (!wasPortrait && isPortrait.value && isOpen.value) {
    nextTick(() => {
      chatApiRef.value?.resetQuickNavigation?.()
      panelState.value = { ...panelState.value, sidebarOpen: false, settingsOpen: false }
    })
  }
}

const isFullscreen = computed(() => dragProgress.value >= 1.9)

function translateYPercent(p) {
  // 默认舒适高度为 72%，保留上方页面语境；继续上拉可进入全屏。
  if (p <= 1) return 100 - 72 * p
  // 全屏状态：平滑过渡到0%
  return 28 - 28 * (p - 1)
}

// 取当前可见高度作为参考（iOS Safari 中视觉视口高度 = URL 栏/工具栏之间的可见区域）
function getReferenceHeight() {
  if (typeof window === 'undefined') return 800
  if (visualHeight.value > 0) return visualHeight.value
  return window.innerHeight
}

const overlayStyle = computed(() => {
  if (!isMobile.value) {
    // 桌面端也需要基础样式，确保面板正确显示
    return {
      '--panel-height': `${window.innerHeight}px`,
      '--panel-visible-bottom': '0px',
      '--kbd-height': `${keyboardHeight.value}px`,
      '--safari-bar-height': `${safariBarHeight.value}px`,
      '--vv-height': `${visualHeight.value || window.innerHeight}px`,
      '--vv-top': `${visualOffsetTop.value}px`
    }
  }
  const refH = getReferenceHeight()
  const ty = translateYPercent(dragProgress.value)
  const tyPx = (ty / 100) * refH

  // 面板可见高度（按视觉视口计算，避免 iOS URL 栏覆盖）
  const panelHeight = refH - tyPx

  // 面板向上平移的距离（用于输入框定位的换算）
  // 关键：面板 100dvh = 视觉视口，transform 平移 tyPx
  // 输入框 bottom = safe-area - tyPx 即可保证始终贴在视觉视口底部
  const panelVisibleBottom = tyPx

  return {
    transform: `translate3d(0, ${ty}%, 0)`,
    '--panel-height': `${panelHeight}px`,
    '--panel-visible-bottom': `${panelVisibleBottom}px`,
    '--kbd-height': `${keyboardHeight.value}px`,
    '--safari-bar-height': `${safariBarHeight.value}px`,
    '--vv-height': `${refH}px`,
    '--vv-top': `${visualOffsetTop.value}px`,
    borderRadius: ty <= 0 ? '0' : '24px 24px 0 0'
  }
})

function onHandlePointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return
  e.stopPropagation()
  if (isSnapping.value) return
  e.currentTarget?.setPointerCapture?.(e.pointerId)
  startDrag(e.clientY)
}

function onHandlePointerMove(e) {
  e.preventDefault()
  if (!isDragging.value) return
  moveDrag(e.clientY)
}

function onHandlePointerUp(e) {
  if (!isDragging.value) return
  e.currentTarget?.releasePointerCapture?.(e.pointerId)
  endDrag()
}

function toggleFullscreen() {
  dragProgress.value = isFullscreen.value ? 1 : 2
  isSnapping.value = true
  clearTimeout(snapTimer)
  snapTimer = setTimeout(() => { isSnapping.value = false }, 320)
}

function handleOverlayState(nextState = {}) {
  panelState.value = { ...panelState.value, ...nextState }
}

function toggleHistory() {
  chatApiRef.value?.toggleSidebar?.()
}

function openSettings() {
  chatApiRef.value?.openSettings?.()
}

function openFullPage() {
  close()
  router.push('/ai-chat')
}

function capturePageContext() {
  const mode = preferences.selectionContextEnabled ? CONTEXT_MODE_FULL : CONTEXT_MODE_TITLE_URL
  const ctx = extractPageContext({ maxContentChars: 4000, mode })
  pageContext.value = {
    available: Boolean(ctx.title || ctx.selection || ctx.content),
    attached: false,
    label: ctx.selection ? '选中文本' : '当前页面',
    text: ctx.text,
    suggestions: ctx.suggestions
  }
  previewContext.value = ctx
}

function toggleContextPreview() {
  capturePageContext()
  showContextPreview.value = !showContextPreview.value
}

function confirmAttachContext() {
  const mode = contextMode.value || preferences.contextMode || CONTEXT_MODE_FULL
  preferences.contextMode = mode
  const ctx = extractPageContext({ maxContentChars: 4000, mode })
  const contextForPrompt = {
    title: ctx.title,
    url: ctx.url,
    selection: ctx.selection,
    content: mode === CONTEXT_MODE_FULL ? ctx.content : '',
    description: ctx.description,
    tokenEstimate: ctx.tokenEstimate,
    charCount: ctx.charCount
  }
  chatApiRef.value?.setAttachedContext?.(contextForPrompt)
  pageContext.value.attached = true
  showContextPreview.value = false
}

function detachPageContext() {
  chatApiRef.value?.clearAttachedContext?.()
  pageContext.value.attached = false
}

async function applyOpenPreferences() {
  capturePageContext()
  await nextTick()
  // Quick chat always opens in the compact conversation view. History and
  // settings are explicit, per-open navigation choices.
  chatApiRef.value?.resetQuickNavigation?.()
  panelState.value = { ...panelState.value, sidebarOpen: false, settingsOpen: false }
  if (preferences.openBehavior === 'new') chatApiRef.value?.startNewChat?.()
  if (preferences.openBehavior === 'temporary') chatApiRef.value?.startTemporaryChat?.()
  if (preferences.pageContextEnabled) confirmAttachContext()
  if (preferences.autoFocus) chatApiRef.value?.focusComposer?.()
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
  document.body.classList.toggle('global-ai-glass-open', val)
  if (!val) {
    chatApiRef.value?.closeOverlayPanels?.()
    panelState.value = { ...panelState.value, sidebarOpen: false, settingsOpen: false }
    return
  }

  if (!mountedOnce.value) mountedOnce.value = true
  void applyOpenPreferences()
  isSnapping.value = true
  clearTimeout(snapTimer)
  snapTimer = setTimeout(() => {
    isSnapping.value = false
  }, 600)
}, { immediate: true })

function isEditableElement(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT'
}

function isOverlayEditable(target) {
  if (!overlayRef.value || !target) return false
  return overlayRef.value.contains(target)
}

// 焦点进入：标记可能弹出键盘的输入控件
function onOverlayFocusIn(e) {
  if (!isOverlayEditable(e.target)) return
  if (!isEditableElement(e.target)) return
  isEditingFocused = true
  // 记录键盘弹起前的视觉视口高度（用于精确测出键盘本身的高度）
  baselineVisualHeight = visualHeight.value || 0
  // 等待键盘动画完成再测量（iOS 弹出/收起约 250-400ms）
  setTimeout(updateViewport, 350)
  // 立即刷新一次以缩短空白
  setTimeout(updateViewport, 60)
}

function onOverlayFocusOut(e) {
  if (!isEditableElement(e.target)) return
  isEditingFocused = false
  setTimeout(updateViewport, 350)
}

// 全面更新视觉视口与键盘状态
function updateViewport() {
  if (typeof window === 'undefined') return

  const vv = window.visualViewport
  const layoutH = window.innerHeight

  if (vv) {
    visualHeight.value = vv.height
    visualOffsetTop.value = vv.offsetTop || 0
  } else {
    visualHeight.value = layoutH
    visualOffsetTop.value = 0
  }

  // 对不支持 dvh 的浏览器，通过内联 style 兜底
  if (overlayRef.value) {
    let supportsDvh = false
    try {
      supportsDvh = typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh')
    } catch (_) {
      supportsDvh = false
    }
    if (!supportsDvh && isMobile.value) {
      const refH = getReferenceHeight()
      overlayRef.value.style.height = `${refH}px`
      overlayRef.value.style.maxHeight = `${refH}px`
      overlayRef.value.style.minHeight = `${refH}px`
    }
  }

  // ========== 键盘检测（精确版）==========
  // 用"焦点进入时的 visualHeight"作 baseline，
  // keyboardHeight = max(0, baseline - current) 即可得到纯键盘高度（不含 URL 栏变化）
  if (isEditingFocused && baselineVisualHeight > 0) {
    const kbdH = Math.max(0, baselineVisualHeight - visualHeight.value)
    if (kbdH > 80) {
      // 80px 是 iOS 工具栏 URL 栏的最大值，超过则视为键盘
      if (!keyboardVisible.value || keyboardHeight.value !== kbdH) {
        keyboardVisible.value = true
        keyboardHeight.value = kbdH
      }
    } else {
      if (keyboardVisible.value || keyboardHeight.value !== 0) {
        keyboardVisible.value = false
        keyboardHeight.value = 0
      }
    }
  } else {
    if (keyboardVisible.value || keyboardHeight.value !== 0) {
      keyboardVisible.value = false
      keyboardHeight.value = 0
    }
    // 非编辑态：刷新 baseline（用于下一次焦点）
    baselineVisualHeight = visualHeight.value
  }

  // ========== Safari 底部工具栏高度 ==========
  // 总占用 = layoutH - visualHeight - keyboardHeight
  // 剩余部分就是 URL 栏/标签栏
  const totalDiff = Math.max(0, layoutH - visualHeight.value)
  const barH = Math.max(0, totalDiff - keyboardHeight.value)
  if (barH !== safariBarHeight.value) {
    safariBarHeight.value = barH
  }

  // 键盘弹出时，自动滚动到输入框附近
  if (keyboardVisible.value && chatRef.value) {
    setTimeout(() => {
      const chatContainer = chatRef.value?.querySelector('.chat-container')
      if (chatContainer) {
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior: 'smooth'
        })
      }
    }, 150)
  }

  // 拖拽距离计算使用视觉视口高度，避免 iOS URL 栏影响拖拽手感
  setOverlayHeight(() => Math.max(visualHeight.value, layoutH - 200))
}

// 键盘弹出时，自动把面板展开为全屏
// 这样 panel 100dvh == 视觉视口，input 在 panel 底部 = 视觉视口底部 = 键盘上方
// 避免半屏状态 + 键盘时 input 被推到 panel 顶部外
watch(keyboardVisible, (val) => {
  if (!isMobile.value) return
  if (val) {
    if (dragProgress.value < 1.9) {
      // 立即全屏，避免半屏底部被键盘覆盖
      dragProgress.value = 2
      // 不要动画（拖拽 snap 动画）以免闪烁
      isSnapping.value = false
    }
  }
})

function focusComposerFromShortcut() {
  if (isOpen.value) chatApiRef.value?.focusComposer?.()
}

function handleOverlayKeydown(event) {
  if (!isOpen.value || event.key !== 'Escape') return
  event.preventDefault()
  if (!chatApiRef.value?.handleEscapeLayer?.()) close()
}

onMounted(() => {
  // iOS键盘弹出时，阻止viewport自动调整
  // 添加临时meta标签，阻止iOS缩放和调整viewport
  const viewportMeta = document.querySelector('meta[name="viewport"]')
  if (viewportMeta) {
    const originalContent = viewportMeta.getAttribute('content') || ''
    if (!originalContent.includes('viewport-fit=cover')) {
      viewportMeta.setAttribute('content', `${originalContent}${originalContent ? ', ' : ''}viewport-fit=cover`)
    }
  }

  checkMobile()
  window.addEventListener('resize', checkMobile)

  // 监听 visualViewport 的变化（iOS URL 栏/键盘/工具栏）
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewport)
    window.visualViewport.addEventListener('scroll', updateViewport)
  }

  // 监听焦点进出（仅在遮罩内的可编辑元素）
  document.addEventListener('focusin', onOverlayFocusIn)
  document.addEventListener('focusout', onOverlayFocusOut)
  window.addEventListener('boh-ai-focus-composer', focusComposerFromShortcut)
  window.addEventListener('keydown', handleOverlayKeydown)

  updateViewport()
  const el = overlayRef.value
  if (el) {
    setOverlayHeight(() => {
      if (window.visualViewport && window.visualViewport.height > 0) {
        return window.visualViewport.height
      }
      return window.innerHeight
    })
  }
})

onUnmounted(() => {
  document.body.classList.remove('global-ai-glass-open')
  window.removeEventListener('resize', checkMobile)
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateViewport)
    window.visualViewport.removeEventListener('scroll', updateViewport)
  }
  document.removeEventListener('focusin', onOverlayFocusIn)
  document.removeEventListener('focusout', onOverlayFocusOut)
  window.removeEventListener('boh-ai-focus-composer', focusComposerFromShortcut)
  window.removeEventListener('keydown', handleOverlayKeydown)
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
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  padding: 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)); /* ✨ 新增：基础安全边距 */
  /* iOS键盘弹出时，阻止面板被推上去 */
  /* 使用 dvh 让面板贴合视觉视口（iOS 15.4+ 自动避开 URL 栏/工具栏/键盘） */
  height: 100dvh;
  max-height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  background: #ffffff;
  color: #171717;
  isolation: isolate;
  will-change: transform, opacity;
  opacity: 0;
  pointer-events: none;
}

.global-ai-quick-header {
  position: relative;
  z-index: 20;
  flex: 0 0 auto;
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: max(9px, env(safe-area-inset-top, 0px)) 12px 9px;
  border-bottom: 1px solid #e8e8e8;
  background: rgba(255, 255, 255, 0.96);
  animation: global-ai-header-enter 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.global-ai-header-btn {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #525252;
  cursor: pointer;
  transition: transform 140ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}

.global-ai-header-btn:hover { background: #f2f2f2; border-color: #e5e5e5; color: #171717; }
.global-ai-header-btn:hover { transform: translateY(-1px); }
.global-ai-header-btn:active { transform: scale(0.94); }

.global-ai-header-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.global-ai-header-copy strong,
.global-ai-header-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.global-ai-header-copy strong { font-size: 14px; font-weight: 650; }
.global-ai-header-copy span { font-size: 11px; color: #737373; }

.global-ai-header-actions { display: flex; align-items: center; gap: 2px; }

.global-ai-context-btn {
  min-width: 0;
  max-width: 132px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid #dedede;
  border-radius: 8px;
  background: #fafafa;
  color: #525252;
  font-size: 12px;
  cursor: pointer;
  animation: global-ai-context-enter 300ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
  transition: transform 140ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}

.global-ai-context-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.global-ai-context-btn.attached { color: #087f5b; border-color: #a7d9c9; background: #effaf6; }
.global-ai-context-btn:hover { transform: translateY(-1px); }
.global-ai-context-btn:active { transform: scale(0.97); }

@keyframes global-ai-header-enter {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes global-ai-context-enter {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}

/* 不支持 dvh 的浏览器（如旧版 iOS Safari）由 JS 通过内联 style 兜底高度 */

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
    /* 移动端：dvh 让面板始终贴合视觉视口，键盘/URL 栏变化时面板自然收缩 */
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    height: 100dvh;
    max-height: 100dvh;
    min-height: 100dvh;
    border-radius: 12px 12px 0 0;
    border-top: 1px solid #e5e5e5;
    box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.12);
    /* 移动端竖屏：底部预留 = 基础安全边距 + iOS Safari URL/标签栏 + 物理安全区
     * 关键：必须包含 --safari-bar-height，否则 panel 底部内容会被 Safari 底部 URL 栏遮挡
     */
    padding-bottom: calc(
      var(--global-ai-bottom-nav-clearance)
      + var(--safari-bar-height, 0px)
      + max(12px, env(safe-area-inset-bottom, 0px))
    ) !important;
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
    width: min(520px, 100vw);
    height: 100dvh;
    border-left: 1px solid #e5e5e5;
    box-shadow: -12px 0 36px rgba(0, 0, 0, 0.1);
    transform: translate3d(100%, 0, 0);
    transition: width 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .global-ai-glass-overlay.is-history-open { width: min(780px, 100vw); }
  .global-ai-glass-overlay.is-history-open .global-ai-glass-chat {
    width: 100%;
    margin-left: 0;
  }
  .global-ai-glass-overlay.is-history-open .global-ai-glass-chat :deep(.bohai-page.overlay-mode .input-area) {
    left: calc(260px + (100% - 260px) / 2) !important;
    width: min(calc(100% - 292px), 488px) !important;
  }

  .global-ai-glass-overlay.is-open {
    transform: translate3d(0, 0, 0);
  }
}

.global-ai-glass-overlay.keyboard-visible {
  --kbd-clearance: max(8px, env(safe-area-inset-bottom, 0px));
}

.global-ai-glass-overlay.keyboard-visible .global-ai-glass-chat :deep(.chat-container) {
  /* 键盘时 panel 自动全屏，input 在 panel 底部（视觉视口底部），
   * 这里只需要预留 input 自身高度 + 缓冲，让最后消息能滚到 input 上方
   */
  padding-bottom: calc(140px + env(safe-area-inset-bottom, 0px));
}

/* 输入框定位（关键修复版）
 *
 * 历史问题：之前用 `bottom: --panel-visible-bottom + safe + --kbd-height`，
 * ① panel 的 `transform: translate3d` 创建了新的 containing block，
 *    `position: fixed` 实际变成相对 panel 自身而非 viewport；
 * ② 在 panel 坐标系内，bottom 越大越靠上，叠加后把 input 推到 panel 顶部外。
 * ③ --kbd-height 同时包含 URL 栏变化，数值偏大约 80px。
 *
 * 修复方案：
 * 1. 键盘弹起时自动把 panel 展开为全屏（dragProgress = 2）
 *    → panel 100dvh == 视觉视口，input 在 panel 底部 = 视觉视口底部 = 键盘上方
 * 2. 半屏状态用 --panel-visible-bottom 抵消整个 panel 的 translateY，
 *    让输入框保持在当前可见区域底部
 * 3. 用 env(safe-area-inset-bottom) 处理物理安全距离
 * 4. 键盘全屏时 dragProgress = 2，panel-visible-bottom 自动回到 0
 */
.global-ai-glass-chat :deep(.bohai-page.overlay-mode .input-area) {
  width: min(calc(100% - 32px), 860px);
  /* fixed 定位在 panel 坐标系内（panel 有 transform），bottom 相对 panel 边界 */
  position: fixed !important;
  /* 半屏时抵消 panel 位移；全屏/键盘态该变量为 0。 */
  bottom: calc(var(--panel-visible-bottom, 0px) + max(8px, env(safe-area-inset-bottom, 0px))) !important;
  left: 50% !important;
  transform: translateX(-50%) translateZ(0) !important;
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
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.global-ai-glass-handle:active {
  cursor: grabbing;
}

.global-ai-glass-handle-bar {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: #d1d1d1;
  transition: background 0.2s ease, width 0.2s ease;
}

.global-ai-glass-handle:hover .global-ai-glass-handle-bar {
  background: #a3a3a3;
  width: 40px;
}

.global-ai-glass-close {
  position: fixed;
  top: max(14px, env(safe-area-inset-top, 0px));
  right: max(14px, env(safe-area-inset-right, 0px));
  z-index: 2147482100;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #525252;
  cursor: pointer;
  transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
}

.global-ai-glass-close:hover {
  background: #f2f2f2;
  border-color: #e5e5e5;
  color: #171717;
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
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.global-ai-glass-chat :deep(.chat-container) {
  padding-top: 28px;
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
  background: #f4f4f4;
  border-color: #e5e5e5;
  border-radius: 8px;
  box-shadow: none;
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
  background: #f4f4f4;
}

:global(body.global-ai-glass-open .sidebar.is-embedded),
:global(body.global-ai-glass-open .sidebar.open.is-embedded) {
  z-index: 2147483450 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: #f9f9f9 !important;
}

:global([data-boh-theme="dark"] body.global-ai-glass-open .sidebar.is-embedded),
:global([data-boh-theme="dark"] body.global-ai-glass-open .sidebar.open.is-embedded) {
  background: rgba(15, 23, 42, 0.96) !important;
}

:global(body.global-ai-glass-open .sidebar-overlay.is-embedded) {
  z-index: 2147483400 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: transparent !important;
  pointer-events: none !important;
}

:global(body.global-ai-glass-open .sidebar-open-btn) {
  z-index: 2147482100 !important;
}

:global(body.global-ai-glass-open .ai-settings-backdrop) {
  z-index: 2147483600 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  isolation: isolate;
  will-change: transform;
}

:global(body.global-ai-glass-open .ai-settings-drawer) {
  z-index: 1 !important;
  position: relative !important;
}

.global-ai-glass-overlay[data-theme="dark"] {
  color: #f8fafc;
  background: #212121;
}

.global-ai-glass-overlay[data-theme="dark"] .global-ai-quick-header {
  background: rgba(33, 33, 33, 0.97);
  border-bottom-color: #383838;
}

.global-ai-glass-overlay[data-theme="dark"] .global-ai-header-btn { color: #d4d4d4; }
.global-ai-glass-overlay[data-theme="dark"] .global-ai-header-btn:hover { background: #303030; border-color: #424242; color: #fff; }
.global-ai-glass-overlay[data-theme="dark"] .global-ai-header-copy span { color: #a3a3a3; }
.global-ai-glass-overlay[data-theme="dark"] .global-ai-context-btn { background: #303030; border-color: #424242; color: #d4d4d4; }
.global-ai-glass-overlay.reduce-motion,
.global-ai-glass-overlay.reduce-motion * { transition-duration: 1ms !important; animation-duration: 1ms !important; }

.global-ai-glass-overlay[data-density="compact"] .global-ai-glass-chat :deep(.message-wrapper) { margin-bottom: 12px; }
.global-ai-glass-overlay[data-font-scale="small"] .global-ai-glass-chat { font-size: 13px; }
.global-ai-glass-overlay[data-font-scale="large"] .global-ai-glass-chat { font-size: 16px; }

.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-close {
  color: #f8fafc;
  border-color: transparent;
  background: transparent;
}

.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-chat :deep(.input-box),
.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-chat :deep(.sidebar-open-btn) {
  background: #303030;
  border-color: #424242;
}

.global-ai-glass-overlay[data-theme="dark"] .global-ai-glass-chat :deep(.bohai-page.embedded-mode .sidebar) {
  background: rgba(15, 23, 42, 0.72);
  border-right-color: rgba(255, 255, 255, 0.12);
  box-shadow: 18px 0 44px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

@media (max-width: 767px) {
  .global-ai-quick-header { min-height: 66px; padding: 20px 8px 7px; }
  .global-ai-context-btn { max-width: 44px; padding: 0 9px; }
  .global-ai-context-btn span { display: none; }
  .global-ai-header-actions { gap: 0; }
  .global-ai-header-actions .global-ai-full-page-button { display: none; }
  .global-ai-glass-chat :deep(.ai-settings-header),
  .global-ai-glass-chat :deep(.quota-header) { padding-top: 24px; }
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

.global-ai-context-preview {
  position: absolute;
  z-index: 30;
  top: 50px;
  left: 12px;
  right: 12px;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  overflow: hidden;
  font-size: 13px;
}
.global-ai-glass-overlay[data-theme="dark"] .global-ai-context-preview {
  background: #1a1a2e;
  border-color: #2a2a3e;
}
.context-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #e5e5e5;
  font-size: 14px;
}
.global-ai-glass-overlay[data-theme="dark"] .context-preview-header {
  border-color: #2a2a3e;
}
.context-preview-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: #666;
  display: flex;
}
.context-preview-body {
  padding: 10px 14px;
  max-height: 260px;
  overflow-y: auto;
}
.context-preview-field {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.cp-label {
  color: #888;
  min-width: 36px;
  flex-shrink: 0;
}
.cp-value {
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.global-ai-glass-overlay[data-theme="dark"] .cp-value {
  color: #ccc;
}
.context-preview-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee;
}
.global-ai-glass-overlay[data-theme="dark"] .context-preview-section {
  border-color: #2a2a3e;
}
.cp-section-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.cp-section-content {
  color: #555;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.global-ai-glass-overlay[data-theme="dark"] .cp-section-content {
  color: #999;
}
.context-preview-options {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #eee;
}
.global-ai-glass-overlay[data-theme="dark"] .context-preview-options {
  border-color: #2a2a3e;
}
.cp-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e5e5e5;
  cursor: pointer;
  font-size: 12px;
  color: #555;
}
.cp-option.active {
  border-color: #10a37f;
  color: #10a37f;
  background: rgba(16,163,127,0.06);
}
.cp-option input { display: none; }
.context-preview-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #e5e5e5;
}
.global-ai-glass-overlay[data-theme="dark"] .context-preview-footer {
  border-color: #2a2a3e;
}
.cp-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  cursor: pointer;
  font-size: 13px;
  background: #fff;
  color: #333;
}
.cp-btn-primary {
  background: #10a37f;
  color: #fff;
  border-color: #10a37f;
}
.cp-btn-secondary:hover {
  background: #f5f5f5;
}
.global-ai-glass-overlay[data-theme="dark"] .cp-btn {
  background: #2a2a3e;
  color: #ccc;
  border-color: #3a3a4e;
}
.global-ai-glass-overlay[data-theme="dark"] .cp-btn-primary {
  background: #10a37f;
  color: #fff;
  border-color: #10a37f;
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
