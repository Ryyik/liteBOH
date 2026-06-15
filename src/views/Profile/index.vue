<script setup>
/**
 * Profile 页面入口 — 异步懒加载，减少首屏 JS 体积。
 */
import { defineAsyncComponent } from 'vue';

const ProfileMain = defineAsyncComponent(() => import('./ProfileMain.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <ProfileMain v-bind="$attrs" />
    </template>
    <template #fallback>
      <div class="suspense-fallback">加载中...</div>
    </template>
  </Suspense>
</template>