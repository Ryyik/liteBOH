<template>
  <div class="g-line-chart">
    <svg class="g-line-chart-svg" :viewBox="`0 0 ${vbW} ${vbH}`" preserveAspectRatio="none" role="img" :aria-label="ariaLabel">
      <!-- Grid lines (4 horizontal) -->
      <line v-for="(y, i) in gridLines" :key="`grid-${i}`" :x1="0" :x2="vbW" :y1="y" :y2="y" class="g-line-chart-baseline" />
      <!-- Area -->
      <path v-if="areaPath" :d="areaPath" class="g-line-chart-area" />
      <!-- Line -->
      <path v-if="linePath" :d="linePath" :class="['g-line-chart-line', toneClass]" />
      <!-- Points -->
      <circle
        v-for="(p, i) in points"
        :key="`pt-${i}`"
        :cx="p.x"
        :cy="p.y"
        r="3.5"
        class="g-line-chart-point"
      >
        <title>{{ p.tooltip }}</title>
      </circle>
      <!-- X axis labels -->
      <text
        v-for="(p, i) in xLabels"
        :key="`xl-${i}`"
        :x="p.x"
        :y="vbH + 14"
        text-anchor="middle"
        class="g-line-chart-axis"
      >{{ p.text }}</text>
    </svg>
    <div v-if="legend" class="g-line-chart-legend">
      <div v-for="item in legend" :key="item.label" class="g-line-chart-legend-item">
        <span :class="['g-line-chart-legend-dot', toneClass]" />
        <span>{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  series: { type: Array, required: true }, // [{ label: 'Mon', value: 10 }, ...]
  tone: { type: String, default: 'primary' }, // primary | success | warn | danger
  ariaLabel: { type: String, default: 'Line chart' },
  legend: { type: Array, default: null } // [{ label: 'This week' }]
});

const vbW = 600;
const vbH = 200;
const padX = 18;
const padTop = 16;
const padBottom = 28;

const toneClass = computed(() => (props.tone ? `is-${props.tone}` : 'is-primary'));

const values = computed(() => props.series.map((p) => p.value));
const minVal = computed(() => {
  const v = Math.min(...values.value);
  return v < 0 ? v : Math.min(0, v);
});
const maxVal = computed(() => Math.max(...values.value, 1));
const range = computed(() => Math.max(1, maxVal.value - minVal.value));

const points = computed(() => {
  const n = props.series.length;
  if (n === 0) return [];
  return props.series.map((p, i) => {
    const x = padX + (i * (vbW - padX * 2)) / Math.max(1, n - 1);
    const ratio = (p.value - minVal.value) / range.value;
    const y = padTop + (1 - ratio) * (vbH - padTop - padBottom);
    return { x, y, value: p.value, tooltip: `${p.label}: ${p.value}` };
  });
});

const linePath = computed(() => {
  if (points.value.length === 0) return '';
  return points.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
});

const areaPath = computed(() => {
  if (points.value.length === 0) return '';
  const pts = points.value;
  const baseY = padTop + (1 - (0 - minVal.value) / range.value) * (vbH - padTop - padBottom);
  const start = `M ${pts[0].x.toFixed(1)} ${baseY.toFixed(1)}`;
  const line = pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const end = `L ${pts[pts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
  return `${start} ${line} ${end}`;
});

const gridLines = computed(() => {
  const lines = [];
  for (let i = 0; i <= 4; i++) {
    const y = padTop + (i * (vbH - padTop - padBottom)) / 4;
    lines.push(y);
  }
  return lines;
});

const xLabels = computed(() => {
  const n = props.series.length;
  if (n === 0) return [];
  // show 7 evenly-spaced labels max
  const target = Math.min(n, 7);
  const result = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.round((i * (n - 1)) / Math.max(1, target - 1));
    const p = points.value[idx];
    if (p) {
      result.push({ x: p.x, text: props.series[idx]?.label || '' });
    }
  }
  return result;
});
</script>
