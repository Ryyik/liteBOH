<script setup>
/**
 * UserSpace 页面入口 — 异步懒加载，减少首屏 JS 体积。
 */
import { defineAsyncComponent } from 'vue';
import UserSpaceSkeleton from './components/UserSpaceSkeleton.vue';

const UserSpaceMain = defineAsyncComponent(() => import('./UserSpaceMain.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <UserSpaceMain v-bind="$attrs" />
    </template>
    <template #fallback>
      <UserSpaceSkeleton />
    </template>
  </Suspense>
</template>