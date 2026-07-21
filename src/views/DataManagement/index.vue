<script setup>
/**
 * DataManagement 页面入口 — 异步懒加载，减少首屏 JS 体积。
 */
import { defineAsyncComponent } from 'vue';

const DataAdmin = defineAsyncComponent(() => import('./DataAdmin.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <DataAdmin v-bind="$attrs" />
    </template>
    <template #fallback>
      <div class="dm-suspense" aria-hidden="true">
        <div class="dm-suspense-head">
          <div class="dm-suspense-bar animate-skeleton-wave"></div>
          <div class="dm-suspense-bar short animate-skeleton-wave"></div>
        </div>
        <div class="dm-suspense-tabs">
          <div v-for="i in 5" :key="`dm-suspense-tab-${i}`" class="dm-suspense-tab animate-skeleton-wave"></div>
        </div>
        <div class="dm-suspense-table glass-panel">
          <div class="dm-suspense-table-head">
            <div class="dm-suspense-cell check animate-skeleton-wave"></div>
            <div class="dm-suspense-cell head animate-skeleton-wave"></div>
            <div class="dm-suspense-cell head animate-skeleton-wave"></div>
            <div class="dm-suspense-cell head short animate-skeleton-wave"></div>
            <div class="dm-suspense-cell action animate-skeleton-wave"></div>
          </div>
          <div v-for="row in 8" :key="`dm-suspense-row-${row}`" class="dm-suspense-table-row">
            <div class="dm-suspense-cell check animate-skeleton-wave"></div>
            <div class="dm-suspense-cell title animate-skeleton-wave"></div>
            <div class="dm-suspense-cell animate-skeleton-wave"></div>
            <div class="dm-suspense-cell short animate-skeleton-wave"></div>
            <div class="dm-suspense-cell badge animate-skeleton-wave"></div>
            <div class="dm-suspense-cell animate-skeleton-wave"></div>
            <div class="dm-suspense-cell action animate-skeleton-wave"></div>
          </div>
        </div>
      </div>
    </template>
  </Suspense>
</template>

<style scoped>
.dm-suspense {
  padding: 16px;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dm-suspense-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dm-suspense-bar {
  width: 240px;
  height: 28px;
  border-radius: 8px;
}

.dm-suspense-bar.short {
  width: 160px;
  height: 16px;
}

.dm-suspense-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.dm-suspense-tab {
  width: 110px;
  height: 36px;
  border-radius: 10px;
}

.dm-suspense-table {
  padding: 16px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dm-suspense-table-head,
.dm-suspense-table-row {
  display: grid;
  grid-template-columns: 40px 1.4fr 1fr 0.8fr 100px 0.8fr 90px;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
}

.dm-suspense-table-head {
  border-bottom: 1px solid var(--glass-border, rgba(0, 0, 0, 0.06));
}

.dm-suspense-cell {
  height: 14px;
  border-radius: 6px;
}

.dm-suspense-cell.check {
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

.dm-suspense-cell.head {
  width: 80%;
}

.dm-suspense-cell.head.short {
  width: 50%;
}

.dm-suspense-cell.title {
  width: 70%;
}

.dm-suspense-cell.short {
  width: 50%;
}

.dm-suspense-cell.badge {
  width: 60px;
  height: 22px;
  border-radius: 11px;
}

.dm-suspense-cell.action {
  width: 60px;
  height: 28px;
  border-radius: 8px;
}

@media (max-width: 900px) {
  .dm-suspense-table-head,
  .dm-suspense-table-row {
    grid-template-columns: 32px 1fr 90px;
  }

  .dm-suspense-table-row > .dm-suspense-cell:nth-child(n+4):not(.action) {
    display: none;
  }
}
</style>