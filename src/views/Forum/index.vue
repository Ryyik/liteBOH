<script setup>
/**
 * Forum 页面入口 — 异步懒加载 ForumMain，减少首屏 JS 体积。
 * 原始组件备份：index.backup.vue
 */
import { defineAsyncComponent } from 'vue';

const ForumMain = defineAsyncComponent(() => import('./ForumMain.vue'));
</script>

<template>
  <Suspense>
    <ForumMain v-bind="$attrs" />
  </Suspense>
</template>