<template>
  <button type="button" class="hk-card hk-ring hk-tappable" @click="$emit('edit')">
    <svg width="52" height="52" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r="25" fill="none" stroke="var(--hk-fill)" stroke-width="6"></circle>
      <circle
        v-if="hasValue"
        cx="30" cy="30" r="25" fill="none"
        :stroke="color" stroke-width="6" stroke-linecap="round"
        :stroke-dasharray="CIRC"
        :stroke-dashoffset="offset"
        transform="rotate(-90 30 30)"
        style="transition: stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)"
      ></circle>
      <text
        v-if="showGlyph"
        x="30" y="31" text-anchor="middle" dominant-baseline="middle"
        :fill="color" font-size="18" font-weight="700"
        font-family="-apple-system, BlinkMacSystemFont, sans-serif"
      >{{ glyph }}</text>
    </svg>
    <div style="min-width:0">
      <div class="hk-ring-val" :style="{ color: color }">{{ display }}</div>
      <div class="hk-ring-sub">{{ label }}</div>
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  display: { type: String, default: '—' },
  value: { type: Number, default: null },
  goal: { type: Number, default: 1 },
  color: { type: String, default: 'var(--hk-red)' },
  glyph: { type: String, default: '' }
})
defineEmits(['edit'])

const CIRC = 2 * Math.PI * 25
const hasValue = computed(() => props.value !== null && Number.isFinite(props.value))
const showGlyph = computed(() => Boolean(props.glyph))
const offset = computed(() => {
  const v = props.value
  const g = props.goal || 1
  if (v === null || !Number.isFinite(v)) return CIRC
  const p = Math.max(0, Math.min(1, v / g))
  return CIRC * (1 - p)
})
</script>
