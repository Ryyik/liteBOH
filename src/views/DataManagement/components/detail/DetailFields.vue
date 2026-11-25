<template>
  <div v-if="resolvedSections" class="detail-sections">
    <section v-for="section in resolvedSections" :key="section.id" class="detail-section">
      <h3 v-if="section.label" class="detail-section-title">{{ section.label }}</h3>
      <div class="detail-section-card">
        <component
          :is="item.action ? 'button' : 'div'"
          v-for="item in section.items"
          :key="item.key"
          class="detail-section-row"
          :class="{ 'is-action': item.action }"
          :type="item.action ? 'button' : undefined"
          @click="onRowClick(item, section)"
        >
          <span class="detail-row-label">{{ labelFor(item) }}</span>
          <span v-if="!item.hideValue" class="detail-row-value">
            <span class="detail-row-text">{{ valueFor(item) }}</span>
            <span v-if="item.action" class="detail-row-chevron" aria-hidden="true">›</span>
          </span>
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
import { computed } from 'vue';
import { formatDate, formatDateTime } from '../../composables/useDataAdminHelpers.js';

const props = defineProps({
  fields: { type: Array, default: () => [] },
  record: { type: Object, default: null },
  sections: { type: Array, default: null },
  // 合成值（订阅层级等不在 record 上的展示列）；键优先于 record
  overrides: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['field-action']);

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

const onRowClick = (item, section) => {
  if (!item.action) return;
  emit('field-action', { field: item, section, record: props.record });
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

@media (max-width: 768px) {
  .detail-fields {
    grid-template-columns: 1fr;
  }
}
</style>
