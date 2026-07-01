<template>
  <div class="g-donut-wrap">
    <div
      :class="['g-donut', toneClass, sizeClass]"
      :style="{ '--p': clampedPercent + '%' }"
      role="img"
      :aria-label="`${label || ''} ${value || ''}`"
    >
      <div class="g-donut-center">
        <span v-if="value" class="g-donut-center-value">{{ value }}</span>
        <span v-if="label" class="g-donut-center-label">{{ label }}</span>
      </div>
    </div>
    <div v-if="legend.length" class="g-donut-legend">
      <div v-for="row in legend" :key="row.label" class="g-donut-legend-row">
        <span class="g-donut-legend-dot" :style="{ background: row.color || 'var(--primary)' }" />
        <span class="g-donut-legend-label">{{ row.label }}</span>
        <span class="g-donut-legend-value">{{ row.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  percent: { type: Number, default: 0 },
  value: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  tone: { type: String, default: 'primary' }, // primary | success | warn | danger
  size: { type: String, default: 'md' }, // sm | md | lg
  legend: { type: Array, default: () => [] } // [{ label, value, color? }]
});

const clampedPercent = computed(() => {
  if (Number.isNaN(props.percent)) return 0;
  return Math.max(0, Math.min(100, props.percent));
});

const toneClass = computed(() => `is-${props.tone}`);
const sizeClass = computed(() => (props.size === 'sm' ? 'is-sm' : props.size === 'lg' ? 'is-lg' : ''));
</script>
