<script setup>
/**
 * Forum 页面入口 — 异步懒加载 ForumMain，减少首屏 JS 体积。
 */
import { defineAsyncComponent } from 'vue';

const ForumMain = defineAsyncComponent(() => import('./ForumMain.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <ForumMain v-bind="$attrs" />
    </template>
    <template #fallback>
      <div class="suspense-fallback">加载中...</div>
    </template>
  </Suspense>
</template>