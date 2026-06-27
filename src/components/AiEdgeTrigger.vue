<template>
  <div v-if="show" class="ai-edge-trigger">
    <div class="ai-edge-hint"></div>
    <div v-if="active" class="ai-edge-indicator"></div>
    <div
      ref="zoneRef"
      class="ai-edge-zone"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    ></div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  show: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['trigger'])

const active = ref(false)
let startX = 0
let startY = 0
let startTime = 0

function onTouchStart(e) {
  const touch = e.touches[0]
  startX = touch.clientX
  startY = touch.clientY
  startTime = Date.now()
  active.value = true
}

function onTouchMove(e) {
  const touch = e.touches[0]
  const dx = startX - touch.clientX
  const dy = Math.abs(touch.clientY - startY)

  if (dx >= 60 && dy < 50) {
    const elapsed = Date.now() - startTime
    if (elapsed <= 1000) {
      emit('trigger')
      active.value = false
    }
  }
}

function onTouchEnd() {
  active.value = false
}
</script>

<style scoped>
.ai-edge-trigger {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 32px;
  z-index: 2147483645;
}

.ai-edge-zone {
  position: absolute;
  inset: 0;
  touch-action: none;
}

.ai-edge-hint {
  position: absolute;
  right: 1px;
  top: 20%;
  bottom: 20%;
  width: 2px;
  border-radius: 1px;
  background: linear-gradient(
    180deg,
    rgba(16, 163, 127, 0.0) 0%,
    rgba(16, 163, 127, 0.06) 25%,
    rgba(16, 163, 127, 0.10) 50%,
    rgba(16, 163, 127, 0.06) 75%,
    rgba(16, 163, 127, 0.0) 100%
  );
  pointer-events: none;
  transition: opacity 0.4s;
}

.ai-edge-indicator {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(
    180deg,
    rgba(16, 163, 127, 0.15) 0%,
    rgba(16, 163, 127, 0.85) 50%,
    rgba(16, 163, 127, 0.15) 100%
  );
  pointer-events: none;
  box-shadow:
    0 0 10px rgba(16, 163, 127, 0.5),
    0 0 20px rgba(16, 163, 127, 0.3);
  animation: aiEdgePulse 1.8s ease-in-out infinite;
}

@keyframes aiEdgePulse {
  0%, 100% {
    opacity: 0.6;
    width: 3px;
    box-shadow:
      0 0 6px rgba(16, 163, 127, 0.3),
      0 0 12px rgba(16, 163, 127, 0.15);
  }
  50% {
    opacity: 1;
    width: 5px;
    box-shadow:
      0 0 14px rgba(16, 163, 127, 0.7),
      0 0 28px rgba(16, 163, 127, 0.4);
  }
}
</style>
