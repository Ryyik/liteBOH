<script setup>
/**
 * DataManagement 页面入口 — 异步懒加载，减少首屏 JS 体积。
 * 原始组件备份：index.backup.vue
 */
import { defineAsyncComponent } from 'vue';

const DataAdmin = defineAsyncComponent(() => import('./DataAdmin.vue'));
</script>

<template>
  <Suspense>
    <DataAdmin v-bind="$attrs" />
  </Suspense>
</template>