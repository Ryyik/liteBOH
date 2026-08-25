<template>
  <Transition name="drawer">
    <div v-if="modelValue" class="drawer-overlay" role="dialog" aria-modal="true" aria-labelledby="sub-edit-title"
      @click.self="close" @keydown.esc.stop="close" tabindex="-1">
      <div class="drawer" @keydown.esc.stop="close">
        <div class="drawer-header">
          <div class="drawer-title-group">
            <h3 id="sub-edit-title">编辑订阅</h3>
            <p>{{ subscription?.username || '已有订阅用户' }}</p>
          </div>
          <button class="drawer-close" type="button" aria-label="关闭编辑" @click="close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="drawer-body">
          <form class="sub-edit-form" @submit.prevent="save">
            <div class="sub-edit-grid">
              <label class="sub-edit-field">
                <span>订阅层级</span>
                <select v-model="planCode" aria-label="订阅层级" @change="onPlanCodeChange">
                  <option v-for="opt in planOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
              <label class="sub-edit-field">
                <span>层级名称（展示名）</span>
                <input v-model="planName" type="text" maxlength="60" placeholder="例如：Pro" aria-label="层级名称" />
              </label>
              <label class="sub-edit-field">
                <span>订阅周期</span>
                <select v-model="billingCycle" aria-label="订阅周期">
                  <option v-for="opt in billingOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
              <label class="sub-edit-field">
                <span>订阅月数</span>
                <input v-model.number="durationMonths" type="number" :min="1" :max="120" step="1" placeholder="例如 1" aria-label="订阅月数" />
              </label>
              <label class="sub-edit-field">
                <span>积分成本</span>
                <input v-model.number="pointsCost" type="number" :min="0" step="1" placeholder="例如 0" aria-label="积分成本" />
              </label>
              <label class="sub-edit-field">
                <span>状态</span>
                <select v-model="status" aria-label="状态">
                  <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
              <label class="sub-edit-field">
                <span>订阅时间</span>
                <input v-model="startedAt" type="datetime-local" aria-label="订阅时间" @change="onStartedAtChange" />
              </label>
              <label class="sub-edit-field">
                <span>到期时间</span>
                <input v-model="expiresAt" type="datetime-local" aria-label="到期时间" @change="onExpiresAtChange" />
              </label>
            </div>
            <div v-if="errorText" class="sub-edit-error" role="alert">{{ errorText }}</div>
          </form>
        </div>
        <div class="drawer-footer">
          <span class="drawer-footer-hint">修改后立即生效</span>
          <div class="drawer-footer-actions">
            <button class="btn btn-secondary" type="button" @click="close">取消</button>
            <button class="btn btn-primary" type="button" :disabled="saving || !canSave" @click="save">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { updateSubscription } from '@/utils/api/subscription-admin-api.js';
import {
  SUBSCRIPTION_BILLING_OPTIONS,
  SUBSCRIPTION_PLAN_NAMES,
  SUBSCRIPTION_PLAN_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS
} from '../config/fields.js';
import { logger } from '@/utils/logger.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  subscription: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue', 'saved']);

const planOptions = SUBSCRIPTION_PLAN_OPTIONS;
const billingOptions = SUBSCRIPTION_BILLING_OPTIONS;
const statusOptions = SUBSCRIPTION_STATUS_OPTIONS;

const planCode = ref('');
const planName = ref('');
const billingCycle = ref('monthly');
const durationMonths = ref(1);
const pointsCost = ref(0);
const status = ref('active');
const startedAt = ref('');
const expiresAt = ref('');
let expiresAtTouched = false;

const saving = ref(false);
const errorText = ref('');

const pad = (n) => String(n).padStart(2, '0');
const toDatetimeLocal = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toISO = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

watch(() => props.modelValue, (visible) => {
  if (visible && props.subscription) {
    planCode.value = props.subscription.plan_code || 'pro';
    planName.value = props.subscription.plan_name || SUBSCRIPTION_PLAN_NAMES[planCode.value] || planCode.value;
    billingCycle.value = props.subscription.billing_cycle || 'monthly';
    durationMonths.value = Number(props.subscription.duration_months) || 1;
    pointsCost.value = Number(props.subscription.points_cost) || 0;
    status.value = props.subscription.status || 'active';
    startedAt.value = toDatetimeLocal(props.subscription.started_at);
    expiresAt.value = toDatetimeLocal(props.subscription.expires_at);
    expiresAtTouched = false;
    errorText.value = '';
  }
});

const canSave = computed(() => {
  if (!planCode.value || !String(planName.value || '').trim()) return false;
  if (!Number.isInteger(durationMonths.value) || durationMonths.value <= 0 || durationMonths.value > 120) return false;
  if (!Number.isFinite(pointsCost.value) || pointsCost.value < 0) return false;
  if (!toISO(startedAt.value)) return false;
  if (!toISO(expiresAt.value)) return false;
  if (Date.parse(toISO(expiresAt.value)) <= Date.parse(toISO(startedAt.value))) return false;
  return true;
});

const onPlanCodeChange = () => {
  planName.value = SUBSCRIPTION_PLAN_NAMES[planCode.value] || planCode.value;
};

const computeExpiresAt = () => {
  const startIso = toISO(startedAt.value);
  if (!startIso) return;
  const months = Number(durationMonths.value);
  if (!Number.isInteger(months) || months <= 0) return;
  const end = new Date(startIso);
  end.setUTCMonth(end.getUTCMonth() + months);
  expiresAt.value = toDatetimeLocal(end);
};

const onStartedAtChange = () => {
  if (!expiresAtTouched) computeExpiresAt();
};

const onExpiresAtChange = () => {
  expiresAtTouched = true;
};

const close = () => emit('update:modelValue', false);

const save = async () => {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  errorText.value = '';
  try {
    await updateSubscription({
      subscriptionId: props.subscription.id,
      planCode: planCode.value,
      planName: planName.value,
      billingCycle: billingCycle.value,
      pointsCost: pointsCost.value,
      durationMonths: durationMonths.value,
      startedAt: toISO(startedAt.value),
      expiresAt: toISO(expiresAt.value),
      status: status.value
    });
    emit('saved');
    close();
  } catch (error) {
    logger.error('SubscriptionEditModal', '编辑订阅失败:', error);
    errorText.value = error?.message || '编辑订阅失败';
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.sub-edit-form { display: grid; gap: 16px; }
.sub-edit-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (max-width: 560px) { .sub-edit-grid { grid-template-columns: 1fr; } }
.sub-edit-field { display: grid; gap: 6px; }
.sub-edit-field > span { color: var(--muted-foreground); font-size: 12px; }
.sub-edit-field input,
.sub-edit-field select {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
  color: var(--foreground);
  outline: none;
  box-sizing: border-box;
  font-size: 13px;
}
.sub-edit-field input:focus,
.sub-edit-field select:focus { border-color: var(--foreground); }
.sub-edit-error {
  padding: 10px 12px;
  border-radius: 9px;
  background: #fff1f0;
  color: #b42318;
  font-size: 13px;
}
</style>
