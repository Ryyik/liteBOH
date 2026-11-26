<template>
  <div v-if="resolvedSections" class="detail-sections">
    <section v-for="section in resolvedSections" :key="section.id" class="detail-section">
      <h3 v-if="section.label" class="detail-section-title">{{ section.label }}</h3>
      <div class="detail-section-card">
        <component
          :is="item.action || item.copyValue ? 'button' : 'div'"
          v-for="item in section.items"
          :key="item.key"
          class="detail-section-row"
          :class="{ 'is-action': item.action || item.copyValue, 'is-editing': isEditable(item) }"
          :type="item.action || item.copyValue ? 'button' : undefined"
          @click="onRowClick(item, section, $event)"
        >
          <span class="detail-row-label">{{ labelFor(item) }}</span>
          <template v-if="isEditable(item)">
            <input
              v-if="item.custom === 'birthday'"
              class="detail-inline-input"
              :value="birthdayValue()"
              inputmode="numeric"
              placeholder="MM-DD"
              @input="onBirthdayInput($event.target.value)"
            />
            <input
              v-else
              class="detail-inline-input"
              :value="model?.[item.key] ?? ''"
              @input="onTextInput(item, $event)"
            />
          </template>
          <span v-else-if="!item.hideValue" class="detail-row-value">
            <span class="detail-row-text" :class="{ 'is-chip': item.chip }">{{
              valueFor(item)
            }}</span>
            <span v-if="item.copyValue" class="detail-row-copy">复制</span>
            <span
              v-if="item.action && !item.copyValue"
              class="detail-row-chevron"
              aria-hidden="true"
              >›</span
            >
          </span>
          <span v-else-if="item.copyValue" class="detail-row-copy">复制</span>
          <span v-else-if="item.action" class="detail-row-chevron" aria-hidden="true">›</span>
        </component>
      </div>
    </section>
  </div>

  <div v-else class="detail-fields">
    <div v-for="f in fields" :key="f.key" class="detail-field">
      <span class="detail-field-label">{{ f.label }}</span>
      <span class="detail-field-value">{{ formatValue(record?.[f.key]) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { formatDate, formatDateTime } from '../../composables/useDataAdminHelpers.js';

const props = defineProps({
  fields: { type: Array, default: () => [] },
  record: { type: Object, default: null },
  sections: { type: Array, default: null },
  // 合成值（订阅层级等不在 record 上的展示列）；键优先于 record
  overrides: { type: Object, default: () => ({}) },
  // 详情页即编辑器（plans/050 期 5）：editable 行渲染输入框，值来自 model
  editing: { type: Boolean, default: false },
  model: { type: Object, default: null },
});
const emit = defineEmits(['field-action', 'update-field']);

const labelMap = computed(() => {
  const map = {};
  for (const f of props.fields || []) {
    if (f?.key) map[f.key] = f.label || f.key;
  }
  return map;
});

const columnMap = computed(() => {
  const map = {};
  for (const f of props.fields || []) {
    if (f?.key) map[f.key] = f;
  }
  return map;
});

const resolvedSections = computed(() => {
  if (!Array.isArray(props.sections) || props.sections.length === 0) return null;
  return props.sections.map((section) => ({
    ...section,
    items: (section.fields || []).map((item) =>
      typeof item === 'string' ? { key: item } : { ...item },
    ),
  }));
});

const labelFor = (item) => item.label || labelMap.value[item.key] || item.key;

const valueFor = (item) => {
  if (Object.prototype.hasOwnProperty.call(props.overrides, item.key)) {
    return formatValue(props.overrides[item.key]);
  }
  const raw = props.record?.[item.key];
  // 日期列按列表同一口径格式化，避免详情页露出 ISO 串
  const type = columnMap.value[item.key]?.type;
  if (raw !== null && raw !== undefined && raw !== '') {
    if (type === 'date') return formatDate(raw) || formatValue(raw);
    if (type === 'datetime') return formatDateTime(raw) || formatValue(raw);
  }
  return formatValue(raw);
};

const onRowClick = (item, section, event) => {
  if (!item.action && !item.copyValue) return;
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  emit('field-action', {
    field: item,
    section,
    record: props.record,
    anchor: rect
      ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
      : null,
  });
};

// ---------- 详情页即编辑器（plans/050 期 5） ----------
const isEditable = (item) => Boolean(props.editing && item.editable);

const onTextInput = (item, event) => {
  emit('update-field', { key: item.key, value: event?.target?.value });
};

const birthdayDraft = ref(null);
watch(
  () => [props.model?.birth_month, props.model?.birth_day],
  () => {
    birthdayDraft.value = null;
  },
);

const birthdayValue = () => {
  if (birthdayDraft.value !== null) return birthdayDraft.value;
  const month = Number(props.model?.birth_month) || 0;
  const day = Number(props.model?.birth_day) || 0;
  if (month > 0 && day > 0) {
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
};

// 单一「MM-DD」输入落到 birth_month / birth_day 两个真实列（校验仍走 saveData）
const onBirthdayInput = (raw) => {
  birthdayDraft.value = raw;
  const match = String(raw || '')
    .trim()
    .match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})$/);
  if (!match) return;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return;
  emit('update-field', { key: 'birth_month', value: month });
  emit('update-field', { key: 'birth_day', value: day });
};

const formatValue = (val) => {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? '是' : '否';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return '—';
    }
  }
  return String(val);
};
</script>

<style scoped>
.detail-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 24px;
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.detail-field-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.detail-field-value {
  font-size: 14px;
  color: var(--foreground);
  word-break: break-all;
  white-space: pre-wrap;
}

/* ---------- 分段卡片（设置页口径：plans/050 §2.3） ---------- */
.detail-sections {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.detail-section-title {
  margin: 0;
  padding: 0 4px 7px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--muted-foreground);
}

.detail-section-card {
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
}

.detail-section-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 44px;
  padding: 9px 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  text-align: left;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

.detail-section-row.is-action {
  cursor: pointer;
  transition: background 0.15s ease;
}

.detail-section-row.is-action:hover {
  background: var(--liquid-bg-subtle);
}

.detail-section-row.is-action:active {
  background: var(--liquid-bg-nested);
}

.detail-row-label {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--muted-foreground);
}

.detail-row-value {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 14px;
  color: var(--foreground);
}

.detail-row-text {
  overflow-wrap: anywhere;
  text-align: right;
  white-space: pre-wrap;
}

.detail-row-chevron {
  flex: 0 0 auto;
  font-size: 16px;
  line-height: 1;
  color: var(--muted-foreground);
  opacity: 0.5;
}

/* 行本身不再变成按钮（页面即编辑器） */
.detail-section-row.is-editing {
  cursor: default;
}

/* 地址行的一键复制提示（草图：地址支持一键复制） */
.detail-row-copy {
  flex: 0 0 auto;
  font-size: 12.5px;
  color: var(--primary);
}

/* 状态 chip（草图：状态是一个可见的胶囊，不是一段文字） */
.detail-row-text.is-chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--muted);
  font-size: 12.5px;
  color: var(--foreground);
}

/* 行内输入（详情页即编辑器）：标签左 / 值右、只留下划线 */
.detail-inline-input {
  flex: 1 1 120px;
  min-width: 0;
  width: auto;
  padding: 6px 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--foreground);
  text-align: right;
}

.detail-inline-input:focus {
  outline: none;
  border-bottom-color: var(--primary);
}

@media (max-width: 768px) {
  .detail-fields {
    grid-template-columns: 1fr;
  }
}
</style>
