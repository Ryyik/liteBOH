<template>
  <div class="detail-action-bar">
    <span class="detail-action-hint">只读详情（D1）· 编辑走既有抽屉</span>
    <button type="button" class="btn btn-primary" @click="$emit('edit')">编辑</button>
  </div>
</template>

<script setup>
defineEmits(['edit']);
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
</style>
