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

<!-- 横屏左栏页面级规则（body.page-aichat 段）：必须非 scoped —— body 前缀的选择器
     会被 scoped 属性选择器作废。与 UserSpaceMain / ProfileMain / Home 引入同一份文件，
     断点与栏宽档位只在那一个文件里定义。
     2026-11-12 从 BOHAIMain 挪到页面入口：它是页面级规则，且壳有 400 行薄壳阈值。 -->
<style src="@/views/user-center/UserSpace/styles/landscape-rail.css"></style>

<!-- 知识库调试模式的边缘彩虹光（仅 `.knowledge-debug-mode` 生效）。
     非 scoped —— 伪元素铺满视口，不参与组件的 scoped 属性推导。 -->
<style src="./styles/debug-rainbow.css"></style>
