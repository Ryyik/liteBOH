<script setup>
/**
 * Cloud+ 页面入口 — 异步懒加载，减少首屏 JS 体积。
 */
import { defineAsyncComponent } from 'vue';

const CloudPlusMain = defineAsyncComponent(() => import('./CloudPlusMain.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <CloudPlusMain v-bind="$attrs" />
    </template>
    <template #fallback>
      <div class="cp-suspense" aria-hidden="true">
        <div class="cp-suspense-head">
          <div class="cp-suspense-title animate-skeleton-wave"></div>
          <div class="cp-suspense-action animate-skeleton-wave"></div>
        </div>
        <div class="cp-suspense-grid">
          <article v-for="i in 6" :key="`cp-suspense-card-${i}`" class="cp-suspense-card glass-panel">
            <div class="cp-suspense-visual animate-skeleton-wave"></div>
            <div class="cp-suspense-card-body">
              <div class="cp-suspense-line date animate-skeleton-wave"></div>
              <div class="cp-suspense-line title animate-skeleton-wave"></div>
              <div class="cp-suspense-line text animate-skeleton-wave"></div>
              <div class="cp-suspense-line text short animate-skeleton-wave"></div>
              <div class="cp-suspense-footer animate-skeleton-wave"></div>
            </div>
          </article>
        </div>
      </div>
    </template>
  </Suspense>
</template>

<style scoped>
.cp-suspense {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cp-suspense-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cp-suspense-title {
  width: 200px;
  height: 26px;
  border-radius: 8px;
}

.cp-suspense-action {
  width: 110px;
  height: 36px;
  border-radius: 10px;
}

.cp-suspense-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 960px) {
  .cp-suspense-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .cp-suspense-grid {
    grid-template-columns: 1fr;
  }
}

.cp-suspense-card {
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cp-suspense-visual {
  width: 100%;
  height: 140px;
}

.cp-suspense-card-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-suspense-line {
  height: 12px;
  border-radius: 6px;
}

.cp-suspense-line.date {
  width: 70px;
  height: 10px;
}

.cp-suspense-line.title {
  width: 75%;
  height: 16px;
}

.cp-suspense-line.text {
  width: 90%;
}

.cp-suspense-line.text.short {
  width: 60%;
}

.cp-suspense-footer {
  width: 100%;
  height: 32px;
  border-radius: 8px;
  margin-top: 6px;
}
</style>