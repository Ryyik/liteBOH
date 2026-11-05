<script setup>
/**
 * BOHAI 对话页入口。
 *
 * ⚠️ `defineOptions({ name })` 不能删：App.vue 的 <KeepAlive :include> 按**组件名**
 * 放行缓存，本名必须与路由表 `/ai-chat` 的 `meta.keepAliveName` 逐字一致。
 * 它直接决定「切页不再掐流」（离开去首页时实例只 deactivated、不卸载）。
 */
import BOHAIMain from './BOHAIMain.vue';

defineOptions({ name: 'BohAiChatPage' });
</script>

<template>
  <BOHAIMain v-bind="$attrs" />
</template>
