<template>
  <div class="detail-quick-panel" role="region" :aria-label="panelTitle">
    <header class="detail-quick-head">
      <strong>{{ panelTitle }}</strong>
      <button type="button" class="detail-quick-close" aria-label="关闭" @click="$emit('close')">
        关闭
      </button>
    </header>

    <!-- 礼品状态：四档就地切换（不弹浮层，延续 plans/049 口径） -->
    <div v-if="actionType === 'edit-status'" class="detail-quick-body">
      <label class="detail-quick-field">
        <span>状态</span>
        <select v-model="nextStatus" :disabled="saving">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <div class="detail-quick-actions">
        <button type="button" class="detail-quick-primary" :disabled="saving" @click="saveStatus">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <!-- 积分：发放 / 扣除（后端 admin_grant_points 本就支持负数） -->
    <div v-else-if="actionType === 'edit-points'" class="detail-quick-body">
      <div class="detail-quick-modes" role="tablist" aria-label="积分操作">
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
      </div>
      <div class="detail-quick-row">
        <label class="detail-quick-field">
          <span>数量</span>
          <input v-model.number="pointsAmount" type="number" min="1" step="1" inputmode="numeric" />
        </label>
        <div class="detail-quick-preview">
          {{ currentPoints }} → <strong>{{ pointsAfter }}</strong>
        </div>
      </div>
      <label class="detail-quick-field">
        <span>备注</span>
        <input
          v-model.trim="pointsRemark"
          type="text"
          maxlength="80"
          placeholder="记录原因（写入流水）"
        />
      </label>
      <div class="detail-quick-actions">
        <button
          type="button"
          class="detail-quick-primary"
          :disabled="saving || !canSubmitPoints"
          @click="savePoints"
        >
          {{ saving ? '提交中…' : pointsMode === 'grant' ? '确认发放' : '确认扣除' }}
        </button>
      </div>
    </div>

    <!-- 订阅层级：改订阅是有生命周期的完整表单，跳已有页签并预填该用户 -->
    <div v-else-if="actionType === 'edit-tier'" class="detail-quick-body">
      <p class="detail-quick-note">
        当前层级：<strong>{{ tierLabel || 'Standard' }}</strong>
        。发放与修改订阅需要起止日等字段，将在订阅页签里完成。
      </p>
      <div class="detail-quick-actions">
        <button type="button" class="detail-quick-primary" @click="openTierTab">
          去订阅页签修改
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { bohtoast } from '@/components/ui/boh-toast-controller.js';
import { SAVE_STRATEGIES } from '../../config/saveStrategies.js';
import { patchAdminRow } from '@/utils/api/data-admin-table-api.js';
import { grantPoints } from '@/utils/api/points-admin-api.js';

const props = defineProps({
  // { field, section, record } —— 来自 DetailFields 的 field-action
  action: { type: Object, required: true },
  tabId: { type: String, default: '' },
  tierLabel: { type: String, default: '' },
});
const emit = defineEmits(['close', 'saved', 'open-tab']);

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
// 四档与 gift 编辑抽屉的 select 同源（data-config tables.js gifts.fields）。
const STATUS_OPTIONS = [
  { value: 'preparing', label: '准备中' },
  { value: 'shipped', label: '已发货' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
];
const statusOptions = STATUS_OPTIONS;
const nextStatus = ref(String(record.value?.gift_status || 'preparing'));

watch(
  () => props.action?.field?.key,
  () => {
    nextStatus.value = String(record.value?.gift_status || 'preparing');
    pointsMode.value = 'grant';
    pointsAmount.value = null;
    pointsRemark.value = '';
  },
);

const saveStatus = async () => {
  const id = String(record.value?.id || '').trim();
  const target = String(nextStatus.value || '').trim();
  if (!id) return bohtoast.show('warning', '缺少记录 ID，无法修改');
  if (target === String(record.value?.gift_status || ''))
    return bohtoast.show('info', '状态未变化');
  if (target === 'cancelled') {
    const ok = await dialog.confirm({
      title: '取消这份礼物？',
      message: '取消后不可再从履约台推进，且不会自动退还积分。',
      tone: 'warning',
      confirmText: '取消礼物',
    });
    if (!ok) return;
  }

  saving.value = true;
  try {
    // 复用整条编辑抽屉的归一化（completed_at 随状态置空/置位），
    // 不在这里写第二份状态规则。
    const patch = await SAVE_STRATEGIES.gifts({
      editingItem: { ...record.value, gift_status: target },
    });
    await patchAdminRow('user_gifts', id, patch);
    bohtoast.show('success', '状态已更新');
    emit('saved');
  } catch (error) {
    bohtoast.show('error', String(error?.message || '状态更新失败'));
  } finally {
    saving.value = false;
  }
};

/* ---------- 积分 ---------- */
const pointsMode = ref('grant');
const pointsAmount = ref(null);
const pointsRemark = ref('');
const currentPoints = computed(() => Number(record.value?.points) || 0);

const normalizedAmount = computed(() => {
  const n = Math.trunc(Number(pointsAmount.value));
  return Number.isFinite(n) && n > 0 ? n : 0;
});

const pointsAfter = computed(() =>
  pointsMode.value === 'deduct'
    ? Math.max(0, currentPoints.value - normalizedAmount.value)
    : currentPoints.value + normalizedAmount.value,
);

// 前端先拦「扣超余额」：RPC 的 greatest(0,…) 会静默截断，
// 不拦的话用户以为扣了 500、实际只扣了余额那些。
const canSubmitPoints = computed(() => {
  if (normalizedAmount.value <= 0) return false;
  if (pointsMode.value === 'deduct' && normalizedAmount.value > currentPoints.value) return false;
  return true;
});

const savePoints = async () => {
  const userId = String(record.value?.id || '').trim();
  if (!userId) return bohtoast.show('warning', '缺少用户 ID，无法调整积分');
  if (!canSubmitPoints.value) {
    return bohtoast.show(
      'warning',
      pointsMode.value === 'deduct' ? '扣除数量不能超过当前积分' : '请输入大于 0 的数量',
    );
  }

  const signed = pointsMode.value === 'deduct' ? -normalizedAmount.value : normalizedAmount.value;
  const ok = await dialog.confirm({
    title: pointsMode.value === 'deduct' ? '确认扣除积分' : '确认发放积分',
    message: `积分：${currentPoints.value} → ${currentPoints.value + signed}（${signed > 0 ? '+' : ''}${signed}）\n备注：${pointsRemark.value || '（无）'}`,
    tone: pointsMode.value === 'deduct' ? 'warning' : 'default',
    confirmText: pointsMode.value === 'deduct' ? '确认扣除' : '确认发放',
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
const openTierTab = () => {
  emit('open-tab', {
    tab: 'subscriptions-grant',
    user: {
      id: String(record.value?.id || '').trim(),
      username: String(record.value?.username || '').trim(),
    },
  });
};
</script>

<style scoped>
.detail-quick-panel {
  margin-top: 14px;
  padding: 14px 16px 16px;
  border: 1px solid var(--liquid-border, var(--border));
  border-radius: var(--liquid-radius-md, 16px);
  background: var(--liquid-bg-strong, var(--card));
  box-shadow: var(--liquid-shadow-sm, none);
}

.detail-quick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-quick-head strong {
  font-size: 14px;
  color: var(--foreground);
}

.detail-quick-close {
  border: 0;
  background: transparent;
  padding: 4px 6px;
  font-size: 13px;
  color: var(--muted-foreground);
  cursor: pointer;
}

.detail-quick-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-quick-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.detail-quick-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--muted-foreground);
}

.detail-quick-field input,
.detail-quick-field select {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--background, transparent);
  color: var(--foreground);
  font: inherit;
}

.detail-quick-modes {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px;
  border-radius: 10px;
  background: var(--liquid-bg-subtle);
}

.detail-quick-modes button {
  min-width: 64px;
  padding: 6px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--muted-foreground);
  cursor: pointer;
}

.detail-quick-modes button.is-active {
  background: var(--card);
  color: var(--foreground);
  box-shadow: var(--liquid-shadow-sm);
}

.detail-quick-preview {
  padding-bottom: 9px;
  font-size: 13px;
  color: var(--muted-foreground);
  white-space: nowrap;
}

.detail-quick-preview strong {
  color: var(--foreground);
}

.detail-quick-actions {
  display: flex;
  justify-content: flex-end;
}

.detail-quick-primary {
  padding: 8px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--foreground);
  color: var(--background);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.detail-quick-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detail-quick-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.detail-quick-note strong {
  color: var(--foreground);
}
</style>
