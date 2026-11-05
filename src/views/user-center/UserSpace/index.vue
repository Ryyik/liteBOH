<script setup>
/**
 * 「我」页入口。
 *
 * ⚠️ `defineOptions({ name })` 不能删：App.vue 的 <KeepAlive :include> 按**组件名**
 * 放行缓存，本名必须与路由表 `/user-space` 的 `meta.keepAliveName` 逐字一致
 * （否则「我」与「图库」的往返会退回整页重挂）。
 */
import UserSpaceMain from './UserSpaceMain.vue';

defineOptions({ name: 'UserSpacePage' });
</script>

<template>
  <UserSpaceMain v-bind="$attrs" />
</template>
