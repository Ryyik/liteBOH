<script setup>
import { watch } from "vue";
import { useRoute } from "vue-router";
import Footer from "./components/Footer.vue";

const route = useRoute();

// 根据当前路由为body添加对应的class
const updateBodyClass = () => {
  // 移除所有页面相关的class
  document.body.className = document.body.className.replace(/page-\w+/g, "");

  // 根据路由添加对应的class，确保route.name存在
  if (route.name) {
    const pageClass = `page-${route.name.toLowerCase()}`;
    document.body.classList.add(pageClass);
  }
};

// 初始化
updateBodyClass();

// 监听路由变化
watch(() => route.name, updateBodyClass);
</script>

<template>
  <router-view />
  <Footer />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 移除全局平滑滚动，它会干扰路由跳转的回顶逻辑 */
html {
  scroll-behavior: auto !important;
}
</style>
