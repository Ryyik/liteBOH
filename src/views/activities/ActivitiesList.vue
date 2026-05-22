<template>
  <div class="activities-list-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 活动列表标题区域 -->
    <header class="activities-header">
      <h1 class="page-title-text">方块之家活动列表</h1>
      <p class="page-subtitle-text">回顾我们曾经举办的精彩活动</p>
    </header>

    <!-- 活动列表容器 -->
    <div class="activities-container">
      <!-- 加载状态 -->
      <template v-if="loading">
        <div v-for="item in 6" :key="`activity-loading-${item}`" class="activity-card activity-card-skeleton"
          aria-hidden="true">
          <div class="activity-skeleton-image">
            <div class="activity-skeleton-block activity-skeleton-date"></div>
          </div>
          <div class="activity-card-content">
            <div class="activity-skeleton-block activity-skeleton-title"></div>
            <div class="activity-skeleton-block activity-skeleton-line wide"></div>
            <div class="activity-skeleton-block activity-skeleton-line"></div>
          </div>
        </div>
      </template>
      <template v-else>
        <!-- 活动卡片 -->
        <div v-for="activity in activities" :key="activity.id" class="activity-card">
          <!-- 活动图片 -->
          <div class="activity-card-image">
            <img :src="getImageUrl(activity.image)" :alt="activity.title" class="activity-image" loading="lazy" />
            <div class="activity-date-badge">{{ activity.date }}</div>
          </div>

          <!-- 活动信息 -->
          <div class="activity-card-content">
            <h3 class="activity-title">{{ activity.title }}</h3>
            <p class="activity-description">{{ activity.description }}</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import UnifiedNavbar from "@/components/UnifiedNavbar/index.vue";
import { getImageUrl } from "@/utils/asset-helper.js";
// 导入活动 composable
import { initActivities, getAllActivities } from "@/composables/useActivities";

// 活动数据
const activities = ref([]);
const loading = ref(true);

// 加载活动数据
const loadActivities = async () => {
  loading.value = true;
  await initActivities();
  activities.value = getAllActivities();
  loading.value = false;
};

onMounted(async () => {
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
  
  // 加载活动数据
  await loadActivities();
});
</script>

<style scoped>
/* 加载状态容器 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 20px;
  min-height: 400px;
  grid-column: 1 / -1;
  width: 100%;
}

.loading-spinner {
  width: 60px;
  height: 60px;
  border: 4px solid #f5f5f7;
  border-top: 4px solid #1d1d1f;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  margin-top: 24px;
  font-size: 16px;
  color: #86868b;
  font-weight: 500;
}

.activity-card-skeleton {
  cursor: default;
  pointer-events: none;
}

.activity-skeleton-block,
.activity-skeleton-image {
  position: relative;
  overflow: hidden;
  background: #edf0f4;
}

.activity-skeleton-block::after,
.activity-skeleton-image::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.78), transparent);
  animation: activitySkeletonShimmer 1.35s ease-in-out infinite;
}

.activity-skeleton-image {
  width: 100%;
  height: 280px;
}

.activity-skeleton-date {
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: 112px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
}

.activity-skeleton-title {
  width: 76%;
  height: 28px;
  border-radius: 12px;
  margin-bottom: 18px;
}

.activity-skeleton-line {
  width: 68%;
  height: 15px;
  border-radius: 999px;
  margin-top: 12px;
}

.activity-skeleton-line.wide {
  width: 100%;
}

@keyframes activitySkeletonShimmer {
  100% {
    transform: translateX(100%);
  }
}

/* 页面基础样式 */
.activities-list-page {
  width: 100%;
  background: #ffffff; /* 纯白背景 */
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  min-height: 100vh;
  color: #1d1d1f;
}

/* 头部区域 */
.activities-header {
  text-align: center;
  padding: 160px 20px 100px; /* 增加留白 */
  max-width: 1000px;
  margin: 0 auto;
}

.page-title-text {
  font-size: 72px; /* 更大的标题 */
  font-weight: 800; /* 醒目的粗体 */
  margin-bottom: 24px;
  letter-spacing: -0.03em;
  color: #1d1d1f;
  line-height: 1.05;
}

.page-subtitle-text {
  font-size: 24px;
  color: #86868b;
  font-weight: 400;
  line-height: 1.4;
  max-width: 600px;
  margin: 0 auto;
}

/* 活动列表容器 */
.activities-container {
  max-width: 1400px; /* 更宽的容器 */
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 48px; /* 更大的间距 */
  padding: 0 40px 160px;
}

/* 活动卡片 */
.activity-card {
  background-color: #ffffff;
  border-radius: 32px; /* 更大的圆角 */
  overflow: hidden;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.04); /* 柔和阴影 */
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid rgba(0, 0, 0, 0.03); /* 极细边框 */
  display: flex;
  flex-direction: column;
  height: 100%;
  cursor: pointer;
}

.activity-card.activity-card-skeleton {
  cursor: default;
  pointer-events: none;
}

.activity-card:hover {
  transform: translateY(-12px);
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.12);
}

/* 活动卡片图片 */
.activity-card-image {
  width: 100%;
  height: 280px; /* 更高的图片区域 */
  position: relative;
  overflow: hidden;
  background-color: #f5f5f7;
}

.activity-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.activity-card:hover .activity-image {
  transform: scale(1.08);
}

.activity-date-badge {
  position: absolute;
  top: 24px;
  left: 24px;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  color: #1d1d1f;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  letter-spacing: -0.01em;
}

/* 活动卡片内容 */
.activity-card-content {
  padding: 40px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 活动标题 */
.activity-title {
  font-size: 24px;
  font-weight: 800; /* 醒目的粗体 */
  color: #1d1d1f;
  margin-bottom: 16px;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

/* 活动描述 */
.activity-description {
  font-size: 16px;
  color: #86868b;
  line-height: 1.7;
  flex: 1;
  margin-bottom: 32px;
}

.activity-action {
  font-size: 15px;
  font-weight: 700;
  color: #1d1d1f;
  display: flex;
  align-items: center;
  gap: 8px;
}

.activity-action span {
  transition: transform 0.2s ease;
}

.activity-card:hover .activity-action span {
  transform: translateX(4px);
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .activities-container {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 32px;
  }
}

@media (max-width: 768px) {
  .activities-header {
    padding: 100px 20px 40px;
  }

  .page-title-text {
    font-size: 36px;
    margin-bottom: 16px;
  }

  .page-subtitle-text {
    font-size: 16px;
  }
  
  .view-switcher {
    margin-top: 32px;
  }
  
  .switcher-btn {
    padding: 10px 20px;
    font-size: 14px;
  }

  .activities-container {
    grid-template-columns: 1fr;
    gap: 32px;
    padding: 0 20px 80px;
  }

  .activity-card-content {
    padding: 24px;
  }
  
  .activity-card-image {
    height: 240px;
  }
}
</style>
