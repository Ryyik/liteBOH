<template>
  <div class="batch-job-result" :class="{ 'is-error': error }" role="status">
    <template v-if="error">
      <span class="batch-job-result-text">批量删除失败：{{ error }}</span>
      <button type="button" class="btn btn-secondary btn-sm" @click="$emit('retry')">重试</button>
    </template>
    <template v-else>
      <span class="batch-job-result-text">
        ✓ 服务端已删除 <strong>{{ deleted }}</strong> 条（按当前筛选，原子执行，无部分失败）
      </span>
    </template>
  </div>
</template>

<script setup>
defineProps({
  deleted: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  error: { type: String, default: '' },
});
defineEmits(['retry']);
</script>

<style scoped>
.batch-job-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  font-size: 13px;
  color: var(--foreground);
}

.batch-job-result.is-error {
  border-color: var(--destructive);
  background: color-mix(in srgb, var(--destructive) 8%, transparent);
}

.batch-job-result-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
