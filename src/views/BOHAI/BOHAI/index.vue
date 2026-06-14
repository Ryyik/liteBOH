<script setup>
/**
 * BOHAI 页面入口 — 异步懒加载，减少首屏 JS 体积。
 * 原始组件备份：index.backup.vue
 */
import { defineAsyncComponent } from 'vue';

const BOHAIMain = defineAsyncComponent(() => import('./BOHAIMain.vue'));
</script>

<template>
  <Suspense>
    <BOHAIMain v-bind="$attrs" />
  </Suspense>
</template>