<template>
  <div class="activities-wrapper">
    <!-- 嵌套路由出口 -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<script setup>
import { onMounted } from "vue";

// 组件挂载时添加页面类
onMounted(() => {
  document.body.classList.add("page-activities");
});
</script>

<style scoped>
.activities-wrapper {
  width: 100%;
  min-height: 100vh;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<style>
/* 全局样式 */
.page-activities {
  background-color: #ffffff !important;
}

/* 修复导航栏下方黑色区块问题 */
.page__style,
.full__portfolio {
  background-color: #ffffff !important;
  padding-top: 80px;
  visibility: visible !important;
  opacity: 1 !important;
}

#portfolio {
  position: relative;
  padding: 50px 0;
  visibility: visible !important;
  opacity: 1 !important;
  background-color: #ffffff !important;
}

/* 容器样式 */
.container {
  width: 100%;
  padding-right: 15px;
  padding-left: 15px;
  margin-right: auto;
  margin-left: auto;
}

/* 响应式容器 */
@media (min-width: 576px) {
  .container {
    max-width: 540px;
  }
}

@media (min-width: 768px) {
  .container {
    max-width: 720px;
  }
}

@media (min-width: 992px) {
  .container {
    max-width: 960px;
  }
}

@media (min-width: 1200px) {
  .container {
    max-width: 1140px;
  }
}
</style>
