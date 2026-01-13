<template>
  <div class="user-center-nav">
    <!-- 个人信息 -->
    <router-link
      to="/user-center/info"
      class="nav-link"
      :class="{ active: currentRoute.includes('/user-center/info') }"
    >
      <div class="nav-item">个人信息</div>
    </router-link>
    <!-- 周边信息 -->
    <router-link
      to="/user-center/address"
      class="nav-link"
      :class="{ active: currentRoute.includes('/user-center/address') }"
    >
      <div class="nav-item">周边信息</div>
    </router-link>
    <!-- 消息中心 -->
    <router-link
      to="/user-center/messages"
      class="nav-link"
      :class="{ active: currentRoute.includes('/user-center/messages') }"
    >
      <div class="nav-item">消息中心</div>
    </router-link>
    <!-- 订阅与积分 -->
    <router-link
      to="/user-center/points"
      class="nav-link"
      :class="{
        active:
          currentRoute.includes('/user-center/points') ||
          currentRoute.includes('/user-center/subscriptions'),
      }"
    >
      <div class="nav-item">订阅与积分</div>
    </router-link>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const currentRoute = computed(() => route.path);
</script>

<style scoped>
.user-center-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

/* 玻璃UI样式 - 导航链接 */
.nav-link {
  display: block;
  text-decoration: none;
  color: #4a4a4a;
  padding: 14px 20px;
  /* 玻璃效果 */
  background-color: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  /* 边框和阴影 */
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-link:hover {
  background-color: rgba(255, 255, 255, 0.5);
  transform: translateX(4px);
  border-color: rgba(255, 255, 255, 0.4);
  color: #1a1a1a;
}

.nav-link.active {
  background-color: rgba(0, 123, 255, 0.15);
  border-color: rgba(0, 123, 255, 0.3);
  color: #007bff;
  font-weight: 600;
  box-shadow: 0 4px 15px rgba(0, 123, 255, 0.1);
}

.nav-item {
  font-size: 15px;
  display: flex;
  align-items: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .user-center-nav {
    gap: 0;
  }

  .nav-link {
    padding: 16px;
  }

  .nav-item {
    font-size: 15px;
  }

  .nav-link::after {
    left: 16px;
    right: 16px;
  }
}

/* 竖屏模式特殊样式 */
@media (max-width: 768px) and (orientation: portrait) {
  .nav-link {
    padding: 18px 20px;
    font-size: 16px;
  }

  .nav-item {
    font-size: 16px;
  }
}
</style>
