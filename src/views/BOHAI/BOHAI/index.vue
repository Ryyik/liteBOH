<script setup>
/**
 * BOHAI 页面入口 — 异步懒加载，减少首屏 JS 体积。
 */
import { defineAsyncComponent } from 'vue';

const BOHAIMain = defineAsyncComponent(() => import('./BOHAIMain.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <BOHAIMain v-bind="$attrs" />
    </template>
    <template #fallback>
      <div class="suspense-fallback">加载中...</div>
    </template>
  </Suspense>
</template>