<template>
  <HkSheet title="今日记录" done-text="保存" @close="$emit('close')" @save="$emit('save', snapshot())">
    <div class="hk-field">
      <div class="hk-field-head">
        <span class="hk-field-name">睡眠</span>
        <span class="hk-field-val">{{ draft.sleepHours.toFixed(1) }} h</span>
      </div>
      <input class="hk-slider" type="range" min="0" max="12" step="0.5" v-model.number="draft.sleepHours" />
    </div>

    <div class="hk-field">
      <div class="hk-field-head">
        <span class="hk-field-name">步数</span>
        <span class="hk-field-val">{{ draft.steps.toLocaleString() }}</span>
      </div>
      <input class="hk-slider" type="range" min="0" max="20000" step="500" v-model.number="draft.steps" />
    </div>

    <div class="hk-field">
      <div class="hk-field-head">
        <span class="hk-field-name">饮水</span>
        <span class="hk-field-val">{{ draft.waterCups }} 杯</span>
      </div>
      <input class="hk-slider" type="range" min="0" max="16" step="1" v-model.number="draft.waterCups" />
    </div>

    <div class="hk-field">
      <div class="hk-field-head"><span class="hk-field-name">心情</span></div>
      <div class="hk-seg cols-5" style="grid-template-columns:repeat(5,minmax(0,1fr))">
        <button
          v-for="m in MOODS"
          :key="m.value"
          type="button"
          class="hk-seg-item"
          :class="{ 'is-on': draft.mood === m.value }"
          @click="draft.mood = m.value"
        >{{ m.label }}</button>
      </div>
    </div>
  </HkSheet>
</template>

<script setup>
import { reactive } from 'vue'
import HkSheet from './HkSheet.vue'

const props = defineProps({
  log: { type: Object, default: null }
})
const emit = defineEmits(['close', 'save'])

const MOODS = [
  { value: 'great', label: '很好' },
  { value: 'good', label: '不错' },
  { value: 'ok', label: '一般' },
  { value: 'low', label: '低落' },
  { value: 'bad', label: '很差' }
]

const draft = reactive({
  sleepHours: props.log?.sleepHours ?? 7.5,
  steps: props.log?.steps ?? 8000,
  waterCups: props.log?.waterCups ?? 8,
  mood: props.log?.mood ?? 'good'
})

const snapshot = () => ({
  sleepHours: Number(draft.sleepHours),
  steps: Number(draft.steps),
  waterCups: Number(draft.waterCups),
  mood: draft.mood
})
</script>
