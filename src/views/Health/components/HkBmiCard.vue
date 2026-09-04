<template>
  <button type="button" class="hk-card hk-bmi hk-tappable" @click="$emit('edit')">
    <div class="hk-bmi-head">
      <span class="hk-label">BMI</span>
      <span class="hk-chip" :style="{ background: tier.chipBg, color: tier.chipFg }">{{ tier.name }}</span>
    </div>
    <div class="hk-bmi-value" :class="valueClass">
      {{ hasValue ? value.toFixed(1) : '—' }}<span class="u">kg/m²</span>
    </div>
    <HkBmiScale :value="value" />
  </button>
</template>

<script setup>
import { computed } from 'vue'
import HkBmiScale from './HkBmiScale.vue'
import { bmiTier } from '../bmi'

const props = defineProps({
  value: { type: Number, default: null }
})
defineEmits(['edit'])

const hasValue = computed(() => props.value !== null && Number.isFinite(props.value))
const tier = computed(() => bmiTier(props.value))
const valueClass = computed(() => {
  if (!hasValue.value) return 'is-empty'
  if (tier.value.key === 'thin') return 'is-thin'
  if (tier.value.key === 'normal') return 'is-normal'
  if (tier.value.key === 'over') return 'is-over'
  if (tier.value.key === 'obese') return 'is-obese'
  return ''
})
</script>
