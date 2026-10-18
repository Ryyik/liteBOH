<template>
  <div class="detail-action-bar">
    <template v-if="editing">
      <span class="detail-action-hint"
        >页内编辑中 · 保存走既有保存管线（校验 / 审计 / 缓存一致）</span
      >
      <div class="detail-action-btns">
        <button type="button" class="btn btn-secondary" :disabled="saving" @click="$emit('cancel')">
          取消
        </button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="$emit('save')">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </template>
    <template v-else>
      <span class="detail-action-hint">只读详情（D1）· 编辑在页内完成</span>
      <button v-if="canEdit" type="button" class="btn btn-primary" @click="$emit('edit')">
        编辑
      </button>
    </template>
  </div>
</template>

<script setup>
defineProps({
  editing: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
});
defineEmits(['edit', 'save', 'cancel']);
</script>

<style scoped>
.detail-action-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
}

.detail-action-hint {
  font-size: 12.5px;
  color: var(--muted-foreground);
}

.detail-action-btns {
  display: flex;
  gap: 8px;
}
</style>
