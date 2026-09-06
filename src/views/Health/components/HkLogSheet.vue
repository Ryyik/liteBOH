<template>
  <HkSheet title="今日记录" done-text="保存" @close="$emit('close')" @save="$emit('save', snapshot())">
    <HkNumberField
      v-model="draft.sleepHours"
      label="睡眠"
      unit="h"
      :min="0"
      :max="12"
      :step="0.5"
      :digits="1"
      inputmode="decimal"
    />

    <HkNumberField
      v-model="draft.steps"
      label="步数"
      unit="步"
      :min="0"
      :max="20000"
      :step="500"
      :digits="0"
      inputmode="numeric"
    />

    <HkNumberField
      v-model="draft.waterCups"
      label="饮水"
      unit="杯"
      :min="0"
      :max="16"
      :step="1"
      :digits="0"
      inputmode="numeric"
    />

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
import HkNumberField from './HkNumberField.vue'

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

// 未记录的字段用 null（界面显示"—"），不再用 7.5h/8000步/8杯 假默认值冒充数据——
// 此前打开弹层直接点"保存"就会写入一条假记录
const draft = reactive({
  sleepHours: props.log?.sleepHours ?? null,
  steps: props.log?.steps ?? null,
  waterCups: props.log?.waterCups ?? null,
  mood: props.log?.mood ?? ''
})

const toNumOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

const snapshot = () => ({
  sleepHours: toNumOrNull(draft.sleepHours),
  steps: toNumOrNull(draft.steps),
  waterCups: toNumOrNull(draft.waterCups),
  mood: draft.mood
})
</script>
