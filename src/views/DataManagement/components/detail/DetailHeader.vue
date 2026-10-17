<template>
  <div class="detail-header">
    <nav class="detail-crumbs" aria-label="面包屑">
      <template v-for="(crumb, idx) in crumbs" :key="`${crumb}-${idx}`">
        <button
          v-if="idx < crumbs.length - 1"
          type="button"
          class="detail-crumb"
          @click="$emit('crumb', idx)"
        >
          {{ crumb }}
        </button>
        <span v-else class="detail-crumb is-current" aria-current="page">{{ crumb }}</span>
        <span v-if="idx < crumbs.length - 1" class="detail-crumb-sep" aria-hidden="true">›</span>
      </template>
    </nav>
    <div class="detail-header-row">
      <h1 class="detail-title">{{ title }}</h1>
      <button type="button" class="btn btn-secondary" @click="$emit('back')">返回列表</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  crumbs: { type: Array, default: () => [] },
  title: { type: String, default: '' },
});
defineEmits(['back', 'crumb']);
</script>

<style scoped>
.detail-header {
  margin-bottom: 14px;
}

.detail-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12.5px;
  color: var(--muted-foreground);
}

.detail-crumb {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 12.5px;
}

.detail-crumb:hover {
  color: var(--primary);
}

.detail-crumb.is-current {
  color: var(--foreground);
  cursor: default;
}

.detail-crumb-sep {
  color: var(--muted-foreground);
}

.detail-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
}

.detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
