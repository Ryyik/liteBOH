<template>
  <div class="hk-scale">
    <div class="hk-scale-track">
      <i
        v-for="t in tiers"
        :key="t.key"
        class="seg"
        :style="{ width: (((t.to - t.from) / span) * 100).toFixed(2) + '%', background: t.raw }"
      ></i>
      <i v-if="hasValue" class="hk-scale-knob" :style="{ left: pct + '%' }"></i>
    </div>
    <div class="hk-scale-labels">
      <span v-for="t in tiers" :key="t.key">{{ t.name }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { BMI_TIERS, bmiPercent, BMI_MIN, BMI_MAX } from '../bmi'

const props = defineProps({
  value: { type: Number, default: null }
})

const span = BMI_MAX - BMI_MIN
const tiers = BMI_TIERS
const hasValue = computed(() => props.value !== null && Number.isFinite(props.value))
const pct = computed(() => bmiPercent(props.value))
</script>
