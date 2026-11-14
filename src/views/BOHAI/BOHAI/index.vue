<script setup>
/**
 * BOHAI 对话页入口。
 *
 * ⚠️ `defineOptions({ name })` 不能删：App.vue 的 <KeepAlive :include> 按**组件名**
 * 放行缓存，本名必须与路由表 `/ai-chat` 的 `meta.keepAliveName` 逐字一致。
 * 它直接决定「切页不再掐流」（离开去首页时实例只 deactivated、不卸载）。
 */
import BOHAIMain from './BOHAIMain.vue';

/* 横屏左栏页面级规则（body.page-aichat 段）：必须全局 —— body 前缀的选择器
   会被 scoped 属性选择器作废。与 UserSpaceMain / ProfileMain / Home 引入同一份文件，
   断点与栏宽档位只在那一个文件里定义。
   ⚠️ 用 JS import 而不是 `<style src>`：后者会让同一个外部 CSS 在
   vite-plugin-pwa 的构建阶段拿到 undefined descriptor
   （`Cannot read properties of undefined (reading 'scoped')`）直接崩构建。
   2026-11-14 实测：加 `<style src>` 时 `vite build` exit 1，改成 import 后通过。 */
import '@/views/user-center/UserSpace/styles/landscape-rail.css';

defineOptions({ name: 'BohAiChatPage' });
</script>

<template>
  <BOHAIMain v-bind="$attrs" />
</template>

<!-- 知识库调试模式的边缘彩虹光（仅 `.knowledge-debug-mode` 生效）。
     非 scoped —— 伪元素铺满视口，不参与组件的 scoped 属性推导。 -->
<style src="./styles/debug-rainbow.css"></style>
