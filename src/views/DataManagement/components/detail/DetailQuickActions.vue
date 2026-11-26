<template>
  <div class="detail-pop-card" role="dialog" :aria-label="panelTitle">
    <header class="detail-pop-head">
      <strong>{{ panelTitle }}</strong>
      <button type="button" class="detail-pop-close" aria-label="关闭" @click="$emit('close')">
        关闭
      </button>
    </header>

    <!-- 礼品状态：草图口径 = 浮层点选，点中即暂存，由底部「保存」落库 -->
    <div v-if="actionType === 'edit-status'" class="detail-pop-list">
      <button
        v-for="opt in statusOptions"
        :key="opt.value"
        type="button"
        class="detail-pop-option"
        :class="{ 'is-active': opt.value === currentStatus }"
        @click="pickStatus(opt.value)"
      >
        <span>{{ opt.label }}</span>
        <span v-if="opt.value === currentStatus" class="detail-pop-check" aria-hidden="true"
          >✓</span
        >
      </button>
    </div>

    <!-- 积分：发放 / 扣除 / 直接改为某个值（RPC 只吃增减量，直接改算差值） -->
    <div v-else-if="actionType === 'edit-points'" class="detail-pop-body">
      <div class="detail-pop-modes" role="tablist" aria-label="积分操作">
        <button
          type="button"
          :class="{ 'is-active': pointsMode === 'grant' }"
          @click="pointsMode = 'grant'"
        >
          发放
        </button>
        <button
          type="button"
          :class="{ 'is-active': pointsMode === 'deduct' }"
          @click="pointsMode = 'deduct'"
        >
          扣除
        </button>
        <button
          type="button"
          :class="{ 'is-active': pointsMode === 'set' }"
          @click="pointsMode = 'set'"
        >
          改为
        </button>
      </div>
      <label class="detail-pop-field">
        <span>{{ pointsMode === 'set' ? '目标积分' : '数量' }}</span>
        <input
          v-model.number="pointsAmount"
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          :placeholder="pointsMode === 'set' ? String(currentPoints) : ''"
        />
      </label>
      <p class="detail-pop-preview">
        当前 {{ currentPoints }} → <strong>{{ pointsAfter }}</strong>
        <span v-if="pointsMode !== 'set'"
          >（{{ signedPoints > 0 ? '+' : '' }}{{ signedPoints }}）</span
        >
      </p>
      <label class="detail-pop-field">
        <span>备注</span>
        <input
          v-model.trim="pointsRemark"
          type="text"
          maxlength="80"
          placeholder="写入流水的原因（可空）"
        />
      </label>
      <div class="detail-pop-actions">
        <button
          type="button"
          class="detail-pop-primary"
          :disabled="saving || !canSubmitPoints"
          @click="savePoints"
        >
          {{ saving ? '提交中…' : submitPointsLabel }}
        </button>
      </div>
    </div>

    <!-- 订阅层级：发放订阅（年月日可调）/ 修改订阅（去订阅页签，那里有起止日全字段） -->
    <div v-else-if="actionType === 'edit-tier'" class="detail-pop-body">
      <p class="detail-pop-preview">
        当前层级：<strong>{{ tierLabel || 'Standard' }}</strong>
      </p>
      <label class="detail-pop-field">
        <span>发放档位</span>
        <select v-model="tierPlan">
          <option v-for="opt in planOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <div class="detail-pop-duration">
        <label class="detail-pop-field">
          <span>年</span>
          <input v-model.number="tierYears" type="number" min="0" max="5" step="1" />
        </label>
        <label class="detail-pop-field">
          <span>月</span>
          <input v-model.number="tierMonths" type="number" min="0" max="11" step="1" />
        </label>
        <label class="detail-pop-field">
          <span>日</span>
          <input v-model.number="tierDays" type="number" min="0" max="30" step="1" />
        </label>
      </div>
      <div class="detail-pop-actions">
        <button type="button" class="detail-pop-text" @click="openTierTab">修改现有订阅 ›</button>
        <button
          type="button"
          class="detail-pop-primary"
          :disabled="saving || !canGrantTier"
          @click="grantTier"
        >
          {{ saving ? '发放中…' : '发放订阅' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { bohtoast } from '@/components/ui/boh-toast-controller.js';
import { grantPoints } from '@/utils/api/points-admin-api.js';
import { grantSubscriptions } from '@/utils/api/subscription-admin-api.js';
import { dataConfig } from '../../config/tables.js';
import { SUBSCRIPTION_PLAN_OPTIONS, SUBSCRIPTION_PLAN_NAMES } from '../../config/fields.js';

const props = defineProps({
  // { field, section, record } —— 来自 DetailFields 的 field-action
  action: { type: Object, required: true },
  tabId: { type: String, default: '' },
  tierLabel: { type: String, default: '' },
  // 暂存值（页面即编辑器）：状态点选先改这里，底部「保存」才落库
  currentStatus: { type: String, default: '' },
});
const emit = defineEmits(['close', 'saved', 'stage-status', 'open-tab']);

const dialog = useConfirmDialog();
const saving = ref(false);

const actionType = computed(() => props.action?.field?.action || '');
const record = computed(() => props.action?.record || {});

const panelTitle = computed(() => {
  if (actionType.value === 'edit-status') return '修改进度';
  if (actionType.value === 'edit-points') return '调整积分';
  if (actionType.value === 'edit-tier') return '订阅层级';
  return '操作';
});

/* ---------- 礼品状态 ---------- */
// 选项与编辑抽屉的 select 同源（data-config tables.js gifts.fields[gift_status].options）
const statusOptions = computed(
  () => dataConfig.gifts?.fields?.find((f) => f.key === 'gift_status')?.options || [],
);
const currentStatus = computed(() =>
  String(props.currentStatus || record.value?.gift_status || 'preparing'),
);

const pickStatus = (value) => {
  if (String(value) === currentStatus.value) return emit('close');
  emit('stage-status', String(value));
  emit('close');
};

/* ---------- 积分 ---------- */
const pointsMode = ref('grant');
const pointsAmount = ref(null);
const pointsRemark = ref('');
const currentPoints = computed(() => Number(record.value?.points) || 0);

const normalizedAmount = computed(() => {
  const n = Math.trunc(Number(pointsAmount.value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
});

const signedPoints = computed(() => {
  if (pointsMode.value === 'set') return normalizedAmount.value - currentPoints.value;
  return pointsMode.value === 'deduct' ? -normalizedAmount.value : normalizedAmount.value;
});

const pointsAfter = computed(() => Math.max(0, currentPoints.value + signedPoints.value));

// 前端先拦「扣超余额」：RPC 的 greatest(0,…) 会静默截断，
// 不拦的话用户以为扣了 500、实际只扣了余额那些。
const canSubmitPoints = computed(() => {
  if (pointsMode.value === 'set') return normalizedAmount.value !== currentPoints.value;
  if (normalizedAmount.value <= 0) return false;
  if (pointsMode.value === 'deduct' && normalizedAmount.value > currentPoints.value) return false;
  return true;
});

const submitPointsLabel = computed(() => {
  if (pointsMode.value === 'deduct') return '确认扣除';
  if (pointsMode.value === 'set') return '确认修改';
  return '确认发放';
});

const savePoints = async () => {
  const userId = String(record.value?.id || '').trim();
  if (!userId) return bohtoast.show('warning', '缺少用户 ID，无法调整积分');
  if (!canSubmitPoints.value) {
    if (pointsMode.value === 'deduct') {
      return bohtoast.show('warning', '扣除数量不能超过当前积分');
    }
    if (pointsMode.value === 'set') return bohtoast.show('warning', '目标积分与当前相同');
    return bohtoast.show('warning', '请输入大于 0 的数量');
  }

  const signed = signedPoints.value;
  const ok = await dialog.confirm({
    title: submitPointsLabel.value,
    message: `积分：${currentPoints.value} → ${pointsAfter.value}（${signed > 0 ? '+' : ''}${signed}）\n备注：${pointsRemark.value || '（无）'}`,
    tone: signed < 0 ? 'warning' : 'default',
    confirmText: submitPointsLabel.value,
  });
  if (!ok) return;

  saving.value = true;
  try {
    await grantPoints({
      userIds: [userId],
      amount: signed,
      remark: pointsRemark.value || (signed < 0 ? '后台扣除' : '后台发放'),
      reason: signed < 0 ? 'admin_deduct' : 'admin_grant',
    });
    bohtoast.show('success', '积分已更新');
    emit('saved');
  } catch (error) {
    bohtoast.show('error', String(error?.message || '积分调整失败'));
  } finally {
    saving.value = false;
  }
};

/* ---------- 订阅层级 ---------- */
const planOptions = SUBSCRIPTION_PLAN_OPTIONS;
const tierPlan = ref('pro');
const tierYears = ref(0);
const tierMonths = ref(1);
const tierDays = ref(0);

const canGrantTier = computed(
  () => Number(tierYears.value) * 12 + Number(tierMonths.value) + Number(tierDays.value) > 0,
);

const grantTier = async () => {
  const userId = String(record.value?.id || '').trim();
  if (!userId) return bohtoast.show('warning', '缺少用户 ID，无法发放订阅');
  if (!canGrantTier.value) return bohtoast.show('warning', '时长不能为 0');
  const label = SUBSCRIPTION_PLAN_NAMES[tierPlan.value] || tierPlan.value;
  const ok = await dialog.confirm({
    title: '发放订阅',
    message: `为 ${record.value?.username || '该用户'} 发放 ${label}，时长 ${tierYears.value} 年 ${tierMonths.value} 月 ${tierDays.value} 日。`,
    confirmText: '确认发放',
  });
  if (!ok) return;

  saving.value = true;
  try {
    await grantSubscriptions({
      userIds: [userId],
      planCode: tierPlan.value,
      planName: label,
      durationMonths: Number(tierYears.value) * 12 + Number(tierMonths.value),
      durationDays: Number(tierDays.value),
    });
    bohtoast.show('success', '订阅已发放');
    emit('saved');
  } catch (error) {
    bohtoast.show('error', String(error?.message || '发放订阅失败'));
  } finally {
    saving.value = false;
  }
};

const openTierTab = () => {
  emit('open-tab', {
    tab: 'subscriptions-grant',
    user: {
      id: String(record.value?.id || '').trim(),
      username: String(record.value?.username || '').trim(),
    },
  });
};

watch(
  () => props.action?.field?.key,
  () => {
    pointsMode.value = 'grant';
    pointsAmount.value = null;
    pointsRemark.value = '';
  },
);
</script>

<style scoped>
.detail-pop-card {
  min-width: 240px;
  padding: 12px 14px 14px;
  border: 1px solid var(--liquid-border, var(--border));
  border-radius: var(--liquid-radius-md, 14px);
  background: var(--card);
  box-shadow: var(--liquid-shadow-md, 0 12px 32px rgb(0 0 0 / 0.16));
}

.detail-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.detail-pop-head strong {
  font-size: 13.5px;
  color: var(--foreground);
}

.detail-pop-close {
  border: 0;
  background: transparent;
  padding: 4px 6px;
  font-size: 12.5px;
  color: var(--muted-foreground);
  cursor: pointer;
}

.detail-pop-list {
  display: flex;
  flex-direction: column;
}

.detail-pop-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
}

.detail-pop-option:last-child {
  border-bottom: 0;
}

.detail-pop-option.is-active {
  color: var(--primary);
}

.detail-pop-check {
  font-size: 13px;
}

.detail-pop-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-pop-modes {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px;
  border-radius: 10px;
  background: var(--liquid-bg-subtle);
}

.detail-pop-modes button {
  min-width: 56px;
  padding: 5px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--muted-foreground);
  cursor: pointer;
}

.detail-pop-modes button.is-active {
  background: var(--card);
  color: var(--foreground);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.detail-pop-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  color: var(--muted-foreground);
}

.detail-pop-field input,
.detail-pop-field select {
  width: 120px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background, transparent);
  color: var(--foreground);
  font: inherit;
  font-size: 14px;
  text-align: right;
}

.detail-pop-duration {
  display: flex;
  gap: 8px;
}

.detail-pop-duration .detail-pop-field {
  flex: 1 1 0;
}

.detail-pop-duration .detail-pop-field input {
  width: 100%;
}

.detail-pop-preview {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted-foreground);
}

.detail-pop-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}

.detail-pop-primary {
  border: 0;
  background: transparent;
  padding: 6px 0;
  font: inherit;
  font-size: 14px;
  color: var(--primary);
  cursor: pointer;
}

.detail-pop-primary:disabled {
  color: var(--muted-foreground);
  cursor: default;
}

.detail-pop-text {
  border: 0;
  background: transparent;
  padding: 6px 0;
  margin-right: auto;
  font: inherit;
  font-size: 13px;
  color: var(--muted-foreground);
  cursor: pointer;
}
</style>
