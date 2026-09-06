<template>
  <div class="hk-field hk-number-field">
    <div class="hk-field-head">
      <span class="hk-field-name">{{ label }}</span>
      <button
        type="button"
        class="hk-field-val hk-field-val-tap"
        :aria-label="`编辑 ${label}`"
        @click="openInput"
        @keydown.enter.prevent="openInput"
        @keydown.space.prevent="openInput"
      >
        <span class="hk-field-val-num">{{ displayValue }}</span>
        <span v-if="unit" class="hk-field-val-unit">{{ unit }}</span>
        <Pencil :size="12" class="hk-field-val-icon" aria-hidden="true" />
      </button>
    </div>
    <input
      ref="sliderEl"
      class="hk-slider"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="sliderValue"
      :aria-label="label"
      @input="onSliderInput"
      @change="emitUpdate"
    />

    <input
      ref="numEl"
      class="hk-num-hidden"
      type="number"
      :inputmode="inputmode"
      :min="min"
      :max="max"
      :step="step"
      :value="sliderValue"
      :aria-label="`输入 ${label}`"
      @input="onNumberInput"
      @blur="onNumberBlur"
      @keydown.enter.prevent="commitNumber"
    />
  </div>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import { Pencil } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: [Number, null], default: null },
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  step: { type: Number, default: 1 },
  digits: { type: Number, default: 0 },
  inputmode: { type: String, default: 'decimal' }
})
const emit = defineEmits(['update:modelValue', 'change'])

const sliderEl = ref(null)
const numEl = ref(null)

const isUnset = (v) => v === null || v === undefined || Number.isNaN(Number(v))

// 滑杆位置：未设置时停在中点（仅视觉占位，不代表数据）
const sliderValue = computed(() => {
  if (isUnset(props.modelValue)) return Math.round((props.min + props.max) / 2)
  const v = Number(props.modelValue)
  if (v < props.min) return props.min
  if (v > props.max) return props.max
  return v
})

// 展示值：未设置显示"—"，绝不显示假中点值；越界时显示真实值而不是钳制后的假象
const displayValue = computed(() => {
  if (isUnset(props.modelValue)) return '—'
  const v = Number(props.modelValue)
  if (props.digits > 0) return v.toFixed(props.digits)
  if (Number.isInteger(props.step)) return Math.round(v).toLocaleString()
  return v.toFixed(1)
})

const roundToStep = (v) => {
  if (!props.step) return v
  const inv = 1 / props.step
  return Math.round(v * inv) / inv
}

// 越界值钳回合法区间（失焦/提交时执行，键入中间态不干扰）
const clampToStep = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const clamped = Math.min(props.max, Math.max(props.min, n))
  return roundToStep(clamped)
}

const onSliderInput = (e) => {
  const v = Number(e.target.value)
  if (Number.isFinite(v)) {
    emit('update:modelValue', roundToStep(v))
  }
}

const emitUpdate = () => {
  emit('change', sliderValue.value)
}

const openInput = async () => {
  await nextTick()
  const el = numEl.value
  if (!el) return
  el.value = isUnset(props.modelValue) ? '' : String(props.modelValue)
  el.focus()
  el.select?.()
}

const onNumberInput = (e) => {
  // 清空输入框是中间态：不 emit 0，等失焦/提交再处理
  if (e.target.value === '') return
  const v = Number(e.target.value)
  if (!Number.isFinite(v)) return
  emit('update:modelValue', roundToStep(v))
}

const onNumberBlur = () => {
  // 失焦以输入框当前文本为准（而非旧 modelValue）：
  // - 空串 = 用户想清空 → emit null（父组件用 null 表示"未记录"，界面回显"—"）
  // - 非空 = 钳回合法区间并写回，保证"显示值 = 实际存储值"
  const raw = numEl.value ? String(numEl.value).trim() : ''
  if (raw === '') {
    if (!isUnset(props.modelValue)) emit('update:modelValue', null)
    emit('change', null)
    return
  }
  const clamped = clampToStep(raw)
  if (clamped !== null && clamped !== props.modelValue) {
    emit('update:modelValue', clamped)
  }
  emit('change', clamped)
}

const commitNumber = () => {
  onNumberBlur()
  numEl.value?.blur()
}
</script>

<style scoped>
.hk-number-field { padding: 12px 0; border-top: 0.5px solid var(--hk-hair); }
.hk-number-field:first-child { border-top: none; }
.hk-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}
.hk-field-name { font-size: 14px; font-weight: 500; }
.hk-field-val-tap {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 10px;
  margin: -4px -10px -4px 0;
  border: none;
  background: rgba(255, 255, 255, 0.7);
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  border-radius: 10px;
  color: var(--hk-text);
  font: inherit;
  font-size: 15px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: transform 140ms ease, background-color 160ms ease;
}
.hk-field-val-tap:hover { background: rgba(255, 255, 255, 0.95); }
.hk-field-val-tap:active { transform: scale(0.96); background: rgba(255, 255, 255, 0.85); }
.hk-field-val-unit { font-size: 12px; color: var(--hk-text-2); font-weight: 500; }
.hk-field-val-icon {
  margin-left: 2px;
  color: var(--hk-text-3);
  align-self: center;
  transition: color 160ms ease;
}
.hk-field-val-tap:hover .hk-field-val-icon { color: var(--hk-blue); }
.hk-num-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  opacity: 0;
}
.hk-num-hidden:focus {
  position: fixed;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 44px;
  padding: 0 14px;
  clip: auto;
  opacity: 1;
  z-index: 9999;
  border: none;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.95);
  -webkit-backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  color: var(--hk-text);
  outline: none;
}

html[data-theme="dark"] .hk-field-val-tap {
  background: rgba(255, 255, 255, 0.12);
  color: #f5f5f7;
}
html[data-theme="dark"] .hk-field-val-tap:hover { background: rgba(255, 255, 255, 0.2); }
html[data-theme="dark"] .hk-field-val-unit { color: rgba(235, 235, 245, 0.6); }
</style>
