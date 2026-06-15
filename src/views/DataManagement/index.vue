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
      <div class="suspense-fallback">加载中...</div>
    </template>
  </Suspense>
</template>