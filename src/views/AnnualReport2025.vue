<template>
  <div class="annual-report-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 报告内容区域 - 根据类型加载不同的html -->
    <main class="report-content">
      <iframe
        :src="`/${reportPath}${
          username ? '?username=' + encodeURIComponent(username) : ''
        }`"
        frameborder="0"
        width="100%"
        height="100%"
        class="annual-report-iframe"
      ></iframe>
    </main>

    <!-- 页脚 -->
    <Footer />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";

const route = useRoute();

// 根据路由参数 type 决定加载哪个页面，默认为 cartoon
const reportPath = computed(() => {
  const type = route.query.type;
  if (type === "best") {
    return "annual-report-2025/best.html";
  }
  return "annual-report-2025/cartoon.html";
});

// 从localStorage获取登录用户名
const savedUsername = localStorage.getItem("username");
const username = ref(savedUsername || "");

onMounted(() => {
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
});
</script>

<style scoped>
.annual-report-page {
  margin: 0;
  padding: 0;
  background: #000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei",
    Arial, sans-serif;
  position: relative;
  opacity: 0;
  animation: fadeIn 0.8s forwards;
  color: #333;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 报告内容区域 */
.report-content {
  flex: 1;
  width: 100%;
  min-height: calc(100vh - 120px); /* 减去导航栏和页脚的高度 */
  position: relative;
  overflow: hidden;
}

/* iframe样式 */
.annual-report-iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

/* 动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
