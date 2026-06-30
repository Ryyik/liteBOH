/**
 * 边缘滑动手势检测
 * 用于从屏幕右侧边缘向左滑动唤起AI面板
 */

import { ref, onMounted, onUnmounted } from 'vue'

export function useEdgeSwipeGesture(options = {}) {
  const {
    edgeWidth = 20, // 触发区域宽度（右侧边缘20px）
    minSwipeDistance = 80, // 最小滑动距离
    maxSwipeTime = 800, // 最大滑动时间（ms）
    velocityThreshold = 0.08, // 最小滑动速度（px/ms），与 minSwipeDistance/maxSwipeTime 联动
    onTrigger = () => { } // 触发回调
  } = options

  const isSwiping = ref(false)
  const startX = ref(0)
  const startY = ref(0)
  const startTime = ref(0)
  const currentX = ref(0)
  const edgeIndicatorVisible = ref(false)

  let touchStartX = 0
  let touchStartTime = 0

  function handleTouchStart(e) {
    const touch = e.touches[0]
    const screenWidth = window.innerWidth

// 检查是否在右侧边缘区域内
    if (touch.clientX >= screenWidth - edgeWidth) {
      touchStartX = touch.clientX
      touchStartY = touch.clientY
      touchStartTime = Date.now()

      startX.value = touch.clientX
      startY.value = touch.clientY
      startTime.value = touchStartTime
      currentX.value = touch.clientX

      isSwiping.value = true
      edgeIndicatorVisible.value = true

      // 阻止默认行为（如返回手势）
      e.preventDefault()
    }
  }

  function handleTouchMove(e) {
    if (!isSwiping.value) return

    const touch = e.touches[0]
    currentX.value = touch.clientX

    // 计算滑动距离（向左滑动，所以是负值）
    const swipeDistance = touch.clientX - touchStartX

    // 如果向右滑动（正值），取消手势
    if (swipeDistance > 10) {
      cancelSwipe()
      return
    }

    // 阻止默认行为
    e.preventDefault()
  }

  function handleTouchEnd(e) {
    if (!isSwiping.value) return

    const touchEndTime = Date.now()
    const touch = e.changedTouches[0]
    const swipeDistance = touch.clientX - touchStartX
    const swipeTime = touchEndTime - touchStartTime
    const velocity = Math.abs(swipeDistance) / swipeTime

    // 检查是否满足触发条件
    const shouldTrigger =
      Math.abs(swipeDistance) >= minSwipeDistance &&
      swipeTime <= maxSwipeTime &&
      velocity >= velocityThreshold

    if (shouldTrigger) {
      onTrigger()
    }

    cancelSwipe()
  }

  function cancelSwipe() {
    isSwiping.value = false
    edgeIndicatorVisible.value = false
    startX.value = 0
    startY.value = 0
    startTime.value = 0
    currentX.value = 0
  }

  onMounted(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: false })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: false })
  })

  onUnmounted(() => {
    document.removeEventListener('touchstart', handleTouchStart, { passive: false })
    document.removeEventListener('touchmove', handleTouchMove, { passive: false })
    document.removeEventListener('touchend', handleTouchEnd, { passive: false })
  })

  return {
    isSwiping,
    startX,
    startY,
    currentX,
    edgeIndicatorVisible,
    cancelSwipe
  }
}