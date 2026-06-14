<script setup>
/**
 * UserSpace 页面入口 — 异步懒加载，减少首屏 JS 体积。
 * 原始组件备份：index.backup.vue
 */
import { defineAsyncComponent } from 'vue';

const UserSpaceMain = defineAsyncComponent(() => import('./UserSpaceMain.vue'));
</script>

<template>
  <Suspense>
    <UserSpaceMain v-bind="$attrs" />
  </Suspense>
</template>