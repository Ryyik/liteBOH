<template>
  <div class="g-progress" :aria-valuenow="ariaValueNow" :aria-valuemin="min" :aria-valuemax="max" role="progressbar">
    <div
      :class="['g-progress-fill', { 'is-unlimited': unlimited, 'is-warm': clampedValue >= 60 && clampedValue < 85, 'is-red': clampedValue >= 85, 'is-green': clampedValue < 30 }]"
      :style="{ width: fillWidth }"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  value: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  unlimited: { type: Boolean, default: false },
  // 当数值极小时设置最小可见宽度，避免进度条消失
  minVisibleWidth: { type: Number, default: 4 }
});

const clampedValue = computed(() => {
  if (props.unlimited) return 100;
  if (Number.isNaN(props.value)) return 0;
  if (props.value < 0) return 0;
  return props.value;
});

// 封顶到 max，避免 aria-valuenow 超过 aria-valuemax
const ariaValueNow = computed(() => Math.min(clampedValue.value, props.max));

const fillWidth = computed(() => {
  if (props.unlimited) return '100%';
  const ratio = (clampedValue.value - props.min) / (props.max - props.min);
  const percent = Math.max(ratio * 100, clampedValue.value > 0 ? props.minVisibleWidth : 0);
  return `${Math.min(percent, 100)}%`;
});
</script>
