import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'

const isOpen = ref(false)
const theme = ref('light')

const dragProgress = ref(1)
const isDragging = ref(false)

let resolveOverlayHeight = () => window.innerHeight
let dragStartY = 0
let dragProgressBefore = 0
let closeTimeout = null

function useSharedState() {
  const route = useRoute()

  const canOpen = computed(() => {
    return route.name !== 'AiChat'
  })

  function open() {
    if (!canOpen.value) return
    cancelScheduledClose()
    isOpen.value = true
    dragProgress.value = 1
    isDragging.value = false
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
    isOpen, theme, canOpen,
    dragProgress, isDragging,
    open, close, toggle, syncTheme,
    setOverlayHeight, startDrag, moveDrag, endDrag
  }
}

let singleton = null

export function useGlobalAiOverlay() {
  if (!singleton) {
    singleton = useSharedState()
  }
  return singleton
}
