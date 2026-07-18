<template>
  <div v-if="show" class="ai-edge-trigger" :class="[`side-${side}`, { 'reduce-motion': !animations }]">
    <div class="ai-edge-hint"></div>
    <div v-if="tutorialVisible" class="ai-edge-tutorial">从{{ side === 'right' ? '右' : '左' }}侧滑出 BOH AI</div>
    <div v-if="active" class="ai-edge-indicator" :style="{ '--edge-progress': progress }"></div>
    <div
      ref="zoneRef"
      class="ai-edge-zone"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
    ></div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: true
  },
  side: { type: String, default: 'right' },
  sensitivity: { type: String, default: 'medium' },
  haptics: { type: Boolean, default: true },
  animations: { type: Boolean, default: true }
})

const emit = defineEmits(['trigger'])

const active = ref(false)
const progress = ref(0)
const tutorialVisible = ref(false)
let startX = 0
let startY = 0
let startTime = 0
let horizontalIntent = false

const triggerDistance = computed(() => ({ high: 42, medium: 58, low: 76 }[props.sensitivity] || 58))

function onTouchStart(e) {
  const touch = e.touches[0]
  startX = touch.clientX
  startY = touch.clientY
  startTime = Date.now()
  active.value = true
  progress.value = 0
  horizontalIntent = false
}

function onTouchMove(e) {
  const touch = e.touches[0]
  const dx = props.side === 'right' ? startX - touch.clientX : touch.clientX - startX
  const dy = Math.abs(touch.clientY - startY)
  if (!horizontalIntent && dx > 8 && dx > dy * 1.6) horizontalIntent = true
  if (!horizontalIntent) return
  if (e.cancelable) e.preventDefault()
  progress.value = Math.max(0, Math.min(1, dx / triggerDistance.value))
}

function onTouchEnd() {
  const elapsed = Date.now() - startTime
  if (horizontalIntent && (progress.value >= 0.72 || (progress.value >= 0.42 && elapsed < 260))) {
    if (props.haptics && navigator.vibrate) navigator.vibrate(8)
    emit('trigger')
    try { localStorage.setItem('boh_ai_edge_tutorial_seen', '1') } catch { /* ignore */ }
    tutorialVisible.value = false
  }
  active.value = false
  progress.value = 0
  horizontalIntent = false
}

function onTouchCancel() {
  active.value = false
  progress.value = 0
  horizontalIntent = false
}

onMounted(() => {
  try {
    if (!localStorage.getItem('boh_ai_edge_tutorial_seen') && window.matchMedia('(pointer: coarse)').matches) {
      window.setTimeout(() => { tutorialVisible.value = true }, 900)
      window.setTimeout(() => { tutorialVisible.value = false }, 4800)
    }
  } catch { /* ignore */ }
})
</script>

<style scoped>
.ai-edge-trigger {
  position: fixed;
  top: 0;
  bottom: 0;
  width: 16px;
  z-index: 2147483645;
}

.ai-edge-trigger.side-right { right: 0; }
.ai-edge-trigger.side-left { left: 0; }

.ai-edge-zone {
  position: absolute;
  inset: 0;
  touch-action: pan-y;
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

.side-left .ai-edge-hint { left: 1px; right: auto; }

.ai-edge-indicator {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: calc(3px + (var(--edge-progress) * 13px));
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
  opacity: calc(0.35 + (var(--edge-progress) * 0.65));
  transform-origin: right center;
}

.side-left .ai-edge-indicator { left: 0; right: auto; transform-origin: left center; }

.ai-edge-tutorial {
  position: absolute;
  top: 50%;
  right: 22px;
  width: max-content;
  transform: translateY(-50%);
  padding: 8px 11px;
  border-radius: 9px;
  background: rgba(23, 23, 23, 0.92);
  color: #fff;
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  pointer-events: none;
  animation: edgeTutorialIn 220ms ease both;
}

.side-left .ai-edge-tutorial { left: 22px; right: auto; }
.reduce-motion *, .reduce-motion *::before, .reduce-motion *::after { animation: none !important; transition: none !important; }

@keyframes edgeTutorialIn {
  from { opacity: 0; transform: translate(8px, -50%); }
  to { opacity: 1; transform: translate(0, -50%); }
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
