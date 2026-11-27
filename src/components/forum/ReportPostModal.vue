<script setup>
/**
 * ReportPostModal — 帖子举报弹层唯一真源（plans/051 批 2 抽出）。
 *
 * 收敛前只有 PostDetailMain 内嵌一份；卡片 ⋯ 菜单新增「举报」后升为共享组件。
 * 分工：本组件只管 UI 与表单状态（原因五选一 + 补充说明），API 调用与结果
 * 提示归宿主 —— 宿主监听 confirm({ reason, detail }) 调 reportPost。
 * 原因清单是真源：详情页与卡片必须同一份（改文案只改这里）。
 */
import { ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'confirm']);

const REASONS = [
  { value: 'spam', label: '垃圾广告', description: '重复刷屏、广告推广或无关内容' },
  { value: 'harass', label: '骚扰攻击', description: '辱骂、人身攻击、恶意挑衅' },
  { value: 'porn', label: '不适内容', description: '色情、血腥或其他不宜展示内容' },
  { value: 'false', label: '虚假误导', description: '造谣、误导或冒充他人' },
  { value: 'other', label: '其他问题', description: '无法归类，但需要管理员查看' },
];

const reason = ref('other');
const detail = ref('');

// 每次打开重置表单（上次未提交的输入不留存）
watch(
  () => props.open,
  (next) => {
    if (next) {
      reason.value = 'other';
      detail.value = '';
    }
  },
);

const submit = () => {
  if (props.submitting) return;
  emit('confirm', { reason: reason.value, detail: detail.value.trim() });
};
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="report-modal-overlay" @click.self="emit('close')">
      <div
        class="report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <div class="report-modal-head">
          <div>
            <h3 id="report-modal-title">举报帖子</h3>
            <p class="report-modal-subtitle">
              选择最接近的问题类型，管理员会结合帖子内容一起查看。
            </p>
          </div>
          <button class="report-modal-close" :disabled="submitting" @click="emit('close')">
            ×
          </button>
        </div>

        <div class="report-reason-grid">
          <button
            v-for="item in REASONS"
            :key="item.value"
            type="button"
            class="report-reason-option"
            :class="{ 'is-selected': reason === item.value }"
            :disabled="submitting"
            @click="reason = item.value"
          >
            <span class="report-reason-label">{{ item.label }}</span>
            <span class="report-reason-description">{{ item.description }}</span>
          </button>
        </div>

        <label class="report-detail-field">
          <span>补充说明</span>
          <textarea
            v-model="detail"
            class="report-detail-textarea"
            rows="4"
            maxlength="500"
            placeholder="可以补充具体问题、相关上下文或希望管理员注意的地方（选填）"
            :disabled="submitting"
          ></textarea>
          <small>{{ detail.length }}/500</small>
        </label>

        <div class="report-modal-foot">
          <button class="report-btn-cancel" :disabled="submitting" @click="emit('close')">
            取消
          </button>
          <button class="report-btn-submit" :disabled="submitting" @click="submit">
            {{ submitting ? '提交中…' : '提交举报' }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.report-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147482400;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.report-modal {
  width: min(440px, 100%);
  background: var(--appl-card);
  border-radius: var(--appl-radius-card);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100vh - 48px);
  overflow: auto;
}

.report-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.report-modal-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--appl-text-1);
}

.report-modal-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--appl-text-3);
}

.report-modal-close {
  border: none;
  background: var(--appl-subtle);
  color: var(--appl-text-2);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.report-reason-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-reason-option {
  text-align: left;
  border: 1px solid var(--appl-hairline);
  background: none;
  border-radius: var(--appl-radius-inner);
  padding: 10px 12px;
  cursor: pointer;
  font: inherit;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: border-color 0.15s var(--ease-standard, ease);
}

.report-reason-option.is-selected {
  border-color: var(--appl-blue);
  background: color-mix(in srgb, var(--appl-blue) 6%, transparent);
}

.report-reason-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--appl-text-1);
}

.report-reason-description {
  font-size: 12px;
  color: var(--appl-text-3);
}

.report-detail-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--appl-text-2);
}

.report-detail-textarea {
  border: 1px solid var(--appl-hairline);
  border-radius: var(--appl-radius-inner);
  background: var(--appl-subtle);
  font: inherit;
  font-size: 14px;
  color: var(--appl-text-1);
  padding: 10px 12px;
  resize: vertical;
  min-height: 88px;
  outline: none;
}

.report-detail-field small {
  color: var(--appl-text-4);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.report-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.report-btn-cancel,
.report-btn-submit {
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  border-radius: 12px;
  padding: 9px 18px;
  cursor: pointer;
  border: none;
}

.report-btn-cancel {
  background: var(--appl-subtle);
  color: var(--appl-text-1);
}

.report-btn-submit {
  background: var(--appl-blue);
  color: #ffffff;
}

.report-btn-submit:disabled,
.report-btn-cancel:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
