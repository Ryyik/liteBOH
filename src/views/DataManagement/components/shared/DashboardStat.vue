<template>
  <article class="g-card stat-card-wrap" :class="{ interactive, disabled }">
    <div v-if="eyebrow" class="g-eyebrow">{{ eyebrow }}</div>
    <div :class="['g-metric', { 'is-mono': mono }]">{{ value }}</div>
    <span v-if="trend" :class="['g-trend', trendTone]">
      <span v-if="trendIcon" aria-hidden="true">{{ trendIcon }}</span>
      <span>{{ trend }}</span>
    </span>
    <p v-if="detail" class="g-stat-detail">{{ detail }}</p>
    <slot />
  </article>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  eyebrow: { type: String, default: '' },
  value: { type: [String, Number], required: true },
  trend: { type: String, default: '' },
  trendDirection: { type: String, default: 'up' }, // up | down | warn
  detail: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  mono: { type: Boolean, default: true }
});

const trendTone = computed(() => {
  if (props.trendDirection === 'down') return 'down';
  if (props.trendDirection === 'warn') return 'warn';
  return 'up';
});

const trendIcon = computed(() => {
  if (!props.trend) return '';
  if (props.trendDirection === 'down') return '↓';
  if (props.trendDirection === 'warn') return '!';
  return '↑';
});
</script>

<style scoped>
.stat-card-wrap {
  display: grid;
  gap: 2px;
}
.g-stat-detail {
  margin: calc(var(--spacing) * 1) 0 0;
  font-size: 0.74rem;
  color: var(--muted-foreground);
}
</style>
