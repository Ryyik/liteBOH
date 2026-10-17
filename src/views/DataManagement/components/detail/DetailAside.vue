<template>
  <aside class="detail-aside">
    <div class="detail-aside-card">
      <h3>关联记录</h3>
      <p v-if="!relatedLabels.length" class="detail-aside-empty">无关联记录</p>
      <ul v-else class="detail-aside-list">
        <li v-for="label in relatedLabels" :key="label">{{ label }}</li>
      </ul>
    </div>

    <div class="detail-aside-card">
      <h3>最近修改</h3>
      <p class="detail-aside-meta">更新于：{{ formatTime(record?.updated_at) }}</p>
      <p class="detail-aside-meta">创建于：{{ formatTime(record?.created_at) }}</p>
    </div>

    <div class="detail-aside-card is-danger">
      <h3>Danger zone</h3>
      <p class="detail-aside-empty">删除 / 批量危险操作在批次 E（审计 + 权限矩阵）上线。</p>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  record: { type: Object, default: null },
  relatedLabels: { type: Array, default: () => [] },
});

const formatTime = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString();
};
</script>

<style scoped>
.detail-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-aside-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--card);
}

.detail-aside-card h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.detail-aside-card.is-danger {
  border-color: var(--destructive, #e5484d);
}

.detail-aside-list {
  margin: 0;
  padding: 0 0 0 16px;
  font-size: 13px;
  color: var(--foreground);
}

.detail-aside-meta {
  margin: 0 0 4px;
  font-size: 12.5px;
  color: var(--muted-foreground);
}

.detail-aside-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted-foreground);
}
</style>
