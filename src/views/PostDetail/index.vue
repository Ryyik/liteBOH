<script setup>
/**
 * PostDetail 页面入口 — 异步懒加载，减少首屏 JS 体积。
 * Suspense fallback 使用与主组件同构的轻量骨架，避免空白与简陋的"加载中..."文字。
 */
import { defineAsyncComponent } from 'vue';

const PostDetailMain = defineAsyncComponent(() => import('./PostDetailMain.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <PostDetailMain v-bind="$attrs" />
    </template>
    <template #fallback>
      <div class="pd-suspense" aria-hidden="true">
        <div class="pd-suspense-main glass-panel">
          <div class="pd-suspense-header">
            <div class="pd-suspense-avatar animate-skeleton-wave"></div>
            <div class="pd-suspense-author">
              <div class="pd-suspense-line name animate-skeleton-wave"></div>
              <div class="pd-suspense-line time animate-skeleton-wave"></div>
            </div>
          </div>
          <div class="pd-suspense-title animate-skeleton-wave"></div>
          <div class="pd-suspense-line full animate-skeleton-wave"></div>
          <div class="pd-suspense-line wide animate-skeleton-wave"></div>
          <div class="pd-suspense-line medium animate-skeleton-wave"></div>
          <div class="pd-suspense-actions">
            <div class="pd-suspense-pill animate-skeleton-wave"></div>
            <div class="pd-suspense-pill animate-skeleton-wave"></div>
            <div class="pd-suspense-pill short animate-skeleton-wave"></div>
          </div>
        </div>
        <div class="pd-suspense-side glass-panel">
          <div class="pd-suspense-heading animate-skeleton-wave"></div>
          <div v-for="i in 4" :key="`pd-suspense-comment-${i}`" class="pd-suspense-comment">
            <div class="pd-suspense-avatar small animate-skeleton-wave"></div>
            <div class="pd-suspense-comment-body">
              <div class="pd-suspense-line name animate-skeleton-wave"></div>
              <div class="pd-suspense-line wide animate-skeleton-wave"></div>
              <div class="pd-suspense-line medium animate-skeleton-wave"></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Suspense>
</template>

<style scoped>
.pd-suspense {
  padding: 16px;
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .pd-suspense {
    grid-template-columns: 1fr;
  }
}

.pd-suspense-main,
.pd-suspense-side {
  padding: 24px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pd-suspense-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pd-suspense-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.pd-suspense-avatar.small {
  width: 32px;
  height: 32px;
}

.pd-suspense-author {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.pd-suspense-line {
  height: 14px;
  border-radius: 6px;
}

.pd-suspense-line.name {
  width: 120px;
  height: 14px;
}

.pd-suspense-line.time {
  width: 80px;
  height: 12px;
}

.pd-suspense-line.full {
  width: 100%;
}

.pd-suspense-line.wide {
  width: 85%;
}

.pd-suspense-line.medium {
  width: 55%;
}

.pd-suspense-title {
  width: 60%;
  height: 24px;
  border-radius: 8px;
  margin-top: 8px;
}

.pd-suspense-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.pd-suspense-pill {
  width: 72px;
  height: 28px;
  border-radius: 14px;
}

.pd-suspense-pill.short {
  width: 48px;
}

.pd-suspense-heading {
  width: 100px;
  height: 18px;
  border-radius: 6px;
  margin-bottom: 4px;
}

.pd-suspense-comment {
  display: flex;
  gap: 10px;
  padding: 10px 0;
}

.pd-suspense-comment-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>