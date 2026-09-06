<template>
  <HkSheet :title="isFirstRun ? '先填三项数据' : '编辑身体测量'" done-text="完成" @close="$emit('close')" @save="$emit('save', snapshot())">
      <div class="hk-field">
        <div class="hk-label" style="margin-bottom:8px">性别</div>
        <div class="hk-seg cols-4">
          <button
            v-for="s in SEX_OPTIONS"
            :key="s.value"
            type="button"
            class="hk-seg-item"
            :class="{ 'is-on': draft.sex === s.value }"
            @click="draft.sex = s.value"
          >{{ s.label }}</button>
        </div>
      </div>

    <div class="hk-field">
      <div class="hk-field-head">
        <span class="hk-field-name">年龄</span>
        <div class="hk-stepper">
          <button type="button" class="hk-step-btn" @click="step('birthYear', 1)" aria-label="减一岁">−</button>
          <span class="hk-field-val">{{ age === null ? '—' : age }} <small style="font-size:11px">岁</small></span>
          <button type="button" class="hk-step-btn" @click="step('birthYear', -1)" aria-label="加一岁">+</button>
        </div>
      </div>
      <div class="hk-hint" style="margin-top:0">出生年 {{ draft.birthYear || '—' }}</div>
    </div>

    <HkNumberField
      v-model="draft.heightCm"
      label="身高"
      unit="cm"
      :min="120"
      :max="220"
      :step="0.5"
      :digits="1"
      inputmode="decimal"
    />

    <HkNumberField
      v-model="draft.weightKg"
      label="体重"
      unit="kg"
      :min="30"
      :max="180"
      :step="0.1"
      :digits="1"
      inputmode="decimal"
    />

    <div class="hk-field">
      <div class="hk-field-head">
        <span class="hk-field-name">活动量</span>
      </div>
      <div class="hk-seg cols-4">
        <button
          v-for="a in ACTIVITY_OPTIONS"
          :key="a.value"
          type="button"
          class="hk-seg-item"
          :class="{ 'is-on': draft.activityLevel === a.value }"
          @click="draft.activityLevel = a.value"
        >{{ a.label }}</button>
      </div>
    </div>

    <div class="hk-live">
      <div class="hk-bmi-head">
        <span class="hk-label">BMI</span>
        <span class="hk-chip" :style="{ background: tier.chipBg, color: tier.chipFg }">{{ tier.name }}</span>
      </div>
      <div class="hk-bmi-value" :class="valueClass">
        {{ live === null ? '—' : live.toFixed(1) }}<span class="u">kg/m²</span>
      </div>
      <HkBmiScale :value="live" />
    </div>

    <div class="hk-hint">{{ syncHint }}</div>
  </HkSheet>
</template>

<script setup>
import { computed, reactive } from 'vue'
import HkSheet from './HkSheet.vue'
import HkBmiScale from './HkBmiScale.vue'
import HkNumberField from './HkNumberField.vue'
import { calcBmi, bmiTier } from '../bmi'
import { useHealthStore } from '@/stores/health'

const healthStore = useHealthStore()

const props = defineProps({
  profile: { type: Object, required: true },
  isFirstRun: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'save'])

// 底部文案与实际同步状态一致：未登录/失败时不再宣称"已保存到云端"
const syncHint = computed(() => {
  if (healthStore.cloudSynced) return '数据已加密保存到云端 · 仅供参考，不构成医疗建议'
  if (healthStore.cloudSyncError) return '云端同步失败 · 数据已存本机，联网后重试'
  return '数据已保存 · 仅供参考，不构成医疗建议'
})

const SEX_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'prefer_not_to_say', label: '不愿透露' }
]
const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: '久坐' },
  { value: 'light', label: '轻度' },
  { value: 'moderate', label: '中度' },
  { value: 'active', label: '高度' }
]

const currentYear = new Date().getFullYear()
const draft = reactive({
  sex: props.profile.sex || 'male',
  birthYear: props.profile.birthYear || currentYear - 22,
  heightCm: props.profile.heightCm ?? 170,
  weightKg: props.profile.weightKg ?? 60,
  targetWeightKg: props.profile.targetWeightKg ?? null,
  activityLevel: props.profile.activityLevel || 'moderate'
})

const age = computed(() => {
  const y = Number(draft.birthYear)
  if (!y || y < 1900 || y > currentYear) return null
  return currentYear - y
})
const live = computed(() => calcBmi(draft.heightCm, draft.weightKg))
const tier = computed(() => bmiTier(live.value))
const valueClass = computed(() => {
  if (live.value === null) return 'is-empty'
  if (tier.value.key === 'thin') return 'is-thin'
  if (tier.value.key === 'normal') return 'is-normal'
  if (tier.value.key === 'over') return 'is-over'
  if (tier.value.key === 'obese') return 'is-obese'
  return ''
})

const step = (key, delta) => {
  const next = Number(draft[key]) + delta
  if (key === 'birthYear') draft[key] = Math.max(1900, Math.min(currentYear, next))
}

const snapshot = () => ({
  sex: draft.sex,
  birthYear: Number(draft.birthYear) || null,
  heightCm: Number(draft.heightCm) || null,
  weightKg: Number(draft.weightKg) || null,
  targetWeightKg: draft.targetWeightKg === null ? null : Number(draft.targetWeightKg),
  activityLevel: draft.activityLevel
})
</script>
