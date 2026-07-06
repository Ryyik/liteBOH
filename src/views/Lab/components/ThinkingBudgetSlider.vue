<template>
  <div class="thinking-slider-wrap" @click.stop>
    <div class="thinking-slider-header">
      <span class="thinking-slider-label">思考预算</span>
      <span class="thinking-slider-value">{{ levelLabel }}</span>
    </div>
    <div class="thinking-slider-track" ref="trackRef" @mousedown="startDrag">
      <div class="thinking-slider-fill" :style="{ width: fillPercent + '%' }"></div>
      <div
        class="thinking-slider-thumb"
        :style="{ left: fillPercent + '%' }"
      ></div>
    </div>
    <div class="thinking-slider-marks">
      <span>低</span>
      <span>中</span>
      <span>高</span>
    </div>
    <div class="thinking-slider-details">
      <div class="detail-row">
        <span>Temperature</span>
        <code>{{ displayTemperature }}</code>
      </div>
      <div class="detail-row">
        <span>Top P</span>
        <code>{{ displayTopP }}</code>
      </div>
      <div class="detail-row">
        <span>Max Tokens</span>
        <code>{{ displayMaxTokens }}</code>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: { type: Number, default: 0.5 },
  baseTemperature: { type: Number, default: 0.5 },
  baseTopP: { type: Number, default: 0.7 },
  baseMaxTokens: { type: Number, default: 4096 }
});

const emit = defineEmits(['update:modelValue']);

const levels = [
  { threshold: 0, label: '低', tempDelta: 0.15, topPDelta: 0.15, tokenScale: 0.5 },
  { threshold: 0.25, label: '偏低', tempDelta: 0.08, topPDelta: 0.08, tokenScale: 0.7 },
  { threshold: 0.45, label: '中', tempDelta: 0, topPDelta: 0, tokenScale: 1.0 },
  { threshold: 0.65, label: '偏高', tempDelta: -0.05, topPDelta: -0.05, tokenScale: 1.3 },
  { threshold: 0.85, label: '高', tempDelta: -0.1, topPDelta: -0.1, tokenScale: 1.6 }
];

const fillPercent = computed(() => Math.round(props.modelValue * 100));

const currentLevel = computed(() => {
  let match = levels[0];
  for (const l of levels) {
    if (props.modelValue >= l.threshold) match = l;
  }
  return match;
});

const levelLabel = computed(() => currentLevel.value.label);

const displayTemperature = computed(() => {
  const val = props.baseTemperature + currentLevel.value.tempDelta;
  return Math.max(0, Math.min(2, val)).toFixed(2);
});

const displayTopP = computed(() => {
  const val = props.baseTopP + currentLevel.value.topPDelta;
  return Math.max(0, Math.min(1, val)).toFixed(2);
});

const displayMaxTokens = computed(() => {
  return Math.round(props.baseMaxTokens * currentLevel.value.tokenScale);
});

const trackRef = ref(null);
const isDragging = ref(false);

function startDrag(e) {
  isDragging.value = true;
  updateValue(e);
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

function onDrag(e) {
  if (!isDragging.value) return;
  updateValue(e);
}

function stopDrag() {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function updateValue(e) {
  const track = trackRef.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  let pct = (e.clientX - rect.left) / rect.width;
  pct = Math.max(0, Math.min(1, pct));
  emit('update:modelValue', pct);
}

function setLevel(levelIndex) {
  const l = levels[levelIndex];
  if (l) emit('update:modelValue', l.threshold + 0.1);
}
</script>

<style scoped>
.thinking-slider-wrap {
  min-width: 220px;
  padding: 12px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.thinking-slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.thinking-slider-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.thinking-slider-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}
.thinking-slider-track {
  position: relative;
  height: 6px;
  background: var(--muted);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
}
.thinking-slider-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--brand-400), var(--brand-600));
  border-radius: 999px;
  pointer-events: none;
}
.thinking-slider-thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  background: var(--popover);
  border: 2px solid var(--brand-500);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: var(--shadow-sm);
}
.thinking-slider-marks {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: var(--muted-foreground);
}
.thinking-slider-details {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}
.detail-row span {
  color: var(--muted-foreground);
}
.detail-row code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--foreground);
}
</style>
