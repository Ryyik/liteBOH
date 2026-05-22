<template>
  <div class="activities-photo-wall-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 页面标题 -->
    <header class="activities-header">
      <h1 class="page-title-text">方块之家照片墙</h1>
      <p class="page-subtitle-text">记录我们共同度过的美好时光</p>
    </header>

    <!-- 竖屏提示信息 -->
    <div class="rotate-device-message" ref="rotateMessage">
      <div class="rotate-content">
        <div class="rotate-icon">🔄</div>
        <h2>请将手机横过来查看照片墙</h2>
        <p>横屏模式下可以获得最佳浏览体验</p>
      </div>
    </div>

    <!-- 照片墙容器 -->
    <div class="container photo-wall-container">
      <!-- 加载状态 -->
      <div v-if="loading" class="photo-wall photo-wall-skeleton" aria-hidden="true">
        <div v-for="item in 8" :key="`photo-wall-loading-${item}`" class="photo-card">
          <div class="photo-frame">
            <div class="photo-skeleton-image"></div>
            <div class="photo-info">
              <div class="photo-skeleton-line date"></div>
              <div class="photo-skeleton-line title"></div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="photo-wall">
        <!-- 活动照片卡片 -->
        <div v-for="(activity, index) in activities" :key="activity.id" class="photo-card"
          :style="getPhotoStyle(index)">
          <div class="photo-frame">
            <div class="photo">
              <img :src="getImageUrl(activity.image)" :alt="activity.title" class="img-responsive" loading="lazy" />
            </div>
            <div class="photo-info">
              <h4>{{ activity.date }}</h4>
              <p>{{ activity.title }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import UnifiedNavbar from "@/components/UnifiedNavbar/index.vue";
import { getImageUrl } from "@/utils/asset-helper.js";
// 导入活动 composable
import { initActivities, getAllActivities } from "@/composables/useActivities";

const loading = ref(true);

// 使用 Supabase 数据
const activities = ref([]);

// 加载活动数据
const loadActivities = async () => {
  loading.value = true;
  await initActivities();
  activities.value = getAllActivities();
  loading.value = false;
};

// 为照片生成随机样式，实现更杂乱的歪歪扭扭和重叠效果
const getPhotoStyle = (_index) => {
  // 生成-15到15度之间的随机旋转角度，增加杂乱感
  const rotate = Math.random() * 30 - 15;
  // 生成-5到5度之间的随机倾斜角度
  const skew = Math.random() * 6 - 3;
  // 生成随机的z-index
  const zIndex = Math.floor(Math.random() * activities.value.length);
  // 生成随机位置偏移
  const translateX = Math.random() * 60 - 30;
  const translateY = Math.random() * 60 - 30;
  // 生成随机大小
  const scale = Math.random() * 0.2 + 0.9;

  return {
    transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) skew(${skew}deg) scale(${scale})`,
    zIndex: zIndex,
    position: "relative",
    margin: "30px",
  };
};

onMounted(async () => {
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
  min-height: 60vh;
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
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.loading-text {
  margin-top: 24px;
  font-size: 16px;
  color: #86868b;
  font-weight: 500;
}

.photo-wall-skeleton {
  pointer-events: none;
}

.photo-skeleton-image,
.photo-skeleton-line {
  position: relative;
  overflow: hidden;
  background: #edf0f4;
}

.photo-skeleton-image::after,
.photo-skeleton-line::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.78), transparent);
  animation: photoSkeletonShimmer 1.35s ease-in-out infinite;
}

.photo-skeleton-image {
  width: 100%;
  height: 220px;
  border-radius: 6px;
}

.photo-skeleton-line {
  height: 14px;
  border-radius: 999px;
  margin: 8px auto;
}

.photo-skeleton-line.date {
  width: 76px;
}

.photo-skeleton-line.title {
  width: 140px;
}

@keyframes photoSkeletonShimmer {
  100% {
    transform: translateX(100%);
  }
}

/* 视图切换器 */
.view-switcher {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 40px;
}

.switcher-btn {
  padding: 12px 24px;
  border-radius: 100px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: transparent;
  color: #86868b;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  gap: 8px;
}

.switcher-btn:hover {
  background: #f5f5f7;
  color: #1d1d1f;
  transform: translateY(-2px);
}

.switcher-btn.active {
  background: #1d1d1f;
  color: #ffffff;
  border-color: #1d1d1f;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 页面基础样式 */
.activities-photo-wall-page {
  width: 100%;
  background-color: #ffffff;
  /* 纯白背景 */
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1d1d1f;
  min-height: 100vh;
  overflow-x: hidden;
}

/* 头部区域 */
.activities-header {
  text-align: center;
  padding: 160px 20px 100px;
  /* 增加留白 */
  max-width: 1000px;
  margin: 0 auto;
}

.page-title-text {
  font-size: 72px;
  /* 更大的标题 */
  font-weight: 800;
  /* 醒目的粗体 */
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

/* 竖屏提示信息样式 */
.rotate-device-message {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  transition: opacity 0.5s ease;
}

.rotate-content {
  text-align: center;
  background: #ffffff;
  padding: 60px;
  border-radius: 40px;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.1);
}

.rotate-icon {
  font-size: 60px;
  margin-bottom: 24px;
  animation: rotate 2s infinite linear;
  display: inline-block;
  color: #1d1d1f;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.rotate-device-message h2 {
  font-size: 24px;
  margin-bottom: 16px;
  color: #1d1d1f;
  font-weight: 800;
}

.rotate-device-message p {
  font-size: 16px;
  color: #86868b;
  margin: 0;
}

/* 照片墙容器 */
.photo-wall-container {
  max-width: 100%;
  margin: 0 auto;
  padding: 0 40px 160px;
}

.photo-wall {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  padding: 60px 0;
  min-height: 80vh;
}

/* 照片卡片样式 */
.photo-card {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  /* 初始为相对定位，由JS控制transform */
}

.photo-card:hover {
  z-index: 1000 !important;
  transform: scale(1.15) rotate(0deg) !important;
}

.photo-frame {
  width: 300px;
  /* 稍微加大相框 */
  background: #ffffff;
  padding: 20px 20px 24px 20px;
  border-radius: 4px;
  /* 保持拍立得直角风格 */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  transform: rotate(0deg);
}

.photo-card:hover .photo-frame {
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.2);
}

.photo {
  width: 100%;
  height: 300px;
  overflow: hidden;
  margin-bottom: 20px;
  background-color: #f5f5f7;
}

.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: sepia(0%);
  /* 移除复古滤镜，保持清晰专业 */
  transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.photo-card:hover .photo img {
  transform: scale(1.1);
}

.photo-info {
  text-align: center;
}

.photo-info h4 {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.01em;
  font-family: "Inter", sans-serif;
  /* 统一字体 */
}

.photo-info p {
  margin: 0;
  font-size: 13px;
  color: #86868b;
  font-family: "Inter", sans-serif;
  /* 统一字体 */
}

/* 响应式设计 */
@media (max-width: 768px) {
  .activities-header {
    padding: 100px 20px 60px;
  }

  .page-title-text {
    font-size: 40px;
  }

  .page-subtitle-text {
    font-size: 18px;
  }

  .photo-frame {
    width: 240px;
    padding: 16px 16px 20px 16px;
  }

  .photo {
    height: 240px;
  }
}
</style>
