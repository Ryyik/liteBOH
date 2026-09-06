import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'

const isOpen = ref(false)
const theme = ref('light')

const dragProgress = ref(1)
const isDragging = ref(false)
const openRequestId = ref(0)
// Prompt passed by another view is held until the overlay has mounted its chat API.
const pendingPrompt = ref('')

let resolveOverlayHeight = () => {
  if (typeof window !== 'undefined') return window.innerHeight
  return 800
}
let dragStartY = 0
let dragProgressBefore = 0
let closeTimeout = null

function useSharedState() {
  const route = useRoute()

  const canOpen = computed(() => {
    if (route.name === 'AiChat') return false
    // 岛体挂在 UnifiedNavbar 内：导航栏被隐藏的路由（admin/user-space 子页等）
    // 没有宿主容器，不能打开（调用方可据此回退到 /ai-chat 全页）
    if (route.meta?.hideNavbar) return false
    return true
  })

  function open(options = {}) {
    if (!canOpen.value) return
    if (typeof options.prompt === 'string' && options.prompt.trim()) {
      pendingPrompt.value = options.prompt
    }
    cancelScheduledClose()
    isOpen.value = true
    dragProgress.value = Number(options.snap) === 2 ? 2 : 1
    isDragging.value = false
    openRequestId.value += 1
  }

  function close() {
    cancelScheduledClose()
    isOpen.value = false
    dragProgress.value = 1
    isDragging.value = false
  }

  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  function consumePendingPrompt() {
    const prompt = pendingPrompt.value
    pendingPrompt.value = ''
    return prompt
  }

  function syncTheme() {
    const html = document.documentElement
    theme.value = html.getAttribute('data-theme') || 'light'
  }

  function setOverlayHeight(fn) {
    resolveOverlayHeight = fn
  }

  function startDrag(clientY) {
    if (!canOpen.value) return
    cancelScheduledClose()
    dragProgressBefore = isOpen.value ? dragProgress.value : 0
    if (!isOpen.value) {
      isOpen.value = true
    }
    isDragging.value = true
    dragStartY = clientY
  }

  function moveDrag(clientY) {
    if (!isDragging.value) return
    const maxHeight = resolveOverlayHeight()
    const distance = dragStartY - clientY
    const target = dragProgressBefore + distance / (maxHeight * 0.5)
    dragProgress.value = Math.max(0, Math.min(2, target))
  }

  function endDrag() {
    if (!isDragging.value) return
    isDragging.value = false
    if (dragProgress.value > 1.25) {
      dragProgress.value = 2
    } else if (dragProgress.value > 0.25) {
      dragProgress.value = 1
    } else {
      dragProgress.value = 0
      scheduleClose(600)
    }
  }

  function scheduleClose(delay) {
    cancelScheduledClose()
    closeTimeout = setTimeout(() => {
      isOpen.value = false
      closeTimeout = null
    }, delay)
  }

  function cancelScheduledClose() {
    if (closeTimeout) {
      clearTimeout(closeTimeout)
      closeTimeout = null
    }
  }

  watch(isOpen, (val) => {
    if (val) syncTheme()
  })

  return {
    isOpen, theme, canOpen, openRequestId,
    dragProgress, isDragging,
    pendingPrompt,
    open, close, toggle, syncTheme,
    setOverlayHeight, startDrag, moveDrag, endDrag,
    consumePendingPrompt
  }
}

let singleton = null

export function useGlobalAiOverlay() {
  if (!singleton) {
    singleton = useSharedState()
  }
  return singleton
}
