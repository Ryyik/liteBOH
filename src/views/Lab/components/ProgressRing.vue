<template>
  <div class="progress-ring" :class="{ 'is-small': size === 'small' }">
    <svg :width="sizeMap[size]" :height="sizeMap[size]" viewBox="0 0 44 44">
      <circle
        cx="22" cy="22" :r="radius"
        fill="none"
        :stroke="trackColor"
        :stroke-width="strokeWidth"
      />
      <circle
        cx="22" cy="22" :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        stroke-linecap="round"
        class="ring-progress"
        :style="{ '--progress': progress }"
      />
    </svg>
    <span v-if="showPercent" class="ring-label">{{ Math.round(progress * 100) }}%</span>
    <span v-if="!showPercent && indeterminate" class="ring-spinner-dot"></span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  progress: { type: Number, default: 0 },       // 0-1
  size: { type: String, default: 'medium' },      // small(28) medium(40) large(56)
  color: { type: String, default: '#C96442' },
  trackColor: { type: String, default: '#dad9d4' },
  showPercent: { type: Boolean, default: false },
  indeterminate: { type: Boolean, default: false },
})

const sizeMap = { small: 28, medium: 40, large: 56 }
const strokeWidth = computed(() => props.size === 'small' ? 3 : 4)
const radius = computed(() => (sizeMap[props.size] - strokeWidth.value * 2) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const dashOffset = computed(() => circumference.value * (1 - Math.min(1, Math.max(0, props.progress))))
</script>

<style scoped>
.progress-ring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.progress-ring.is-small {
  --ring-size: 28px;
}
.ring-progress {
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dashoffset 0.6s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #3d3929;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.progress-ring:has(.ring-spinner-dot) svg {
  animation: ring-spin 1s linear infinite;
}
.ring-spinner-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #C96442;
}
@keyframes ring-spin {
  to { transform: rotate(360deg); }
}
</style>
