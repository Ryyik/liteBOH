<template>
  <div class="detail-fields">
    <div v-for="f in fields" :key="f.key" class="detail-field">
      <span class="detail-field-label">{{ f.label }}</span>
      <span class="detail-field-value">{{ formatValue(record?.[f.key]) }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  fields: { type: Array, default: () => [] },
  record: { type: Object, default: null },
});

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

@media (max-width: 768px) {
  .detail-fields {
    grid-template-columns: 1fr;
  }
}
</style>
