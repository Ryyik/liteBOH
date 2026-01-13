<template>
  <div class="activities-list-page">
    <!-- 页面标题 -->
    <div class="page-title">
      <h1>方块之家活动列表</h1>
      <p>回顾我们曾经举办的精彩活动</p>
    </div>

    <!-- 活动列表容器 -->
    <div class="activities-container">
      <!-- 活动卡片 -->
      <div
        v-for="activity in activities"
        :key="activity.id"
        class="activity-card glass-ui"
      >
        <!-- 活动图片 -->
        <div class="activity-card-image">
          <img
            :src="getImageUrl(activity.image)"
            :alt="activity.title"
            class="activity-image"
            loading="lazy"
          />
        </div>

        <!-- 活动信息 -->
        <div class="activity-card-content">
          <div class="activity-date">{{ activity.date }}</div>
          <h3 class="activity-title">{{ activity.title }}</h3>
          <p class="activity-description">{{ activity.description }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
// 导入本地活动数据
import { activitiesData } from "../../data/activities.js";
import { getImageUrl } from "../../utils/asset-helper.js";

// 使用本地数据
const activities = ref(activitiesData);

onMounted(() => {
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
});
</script>

<style scoped>
/* 页面基础样式 */
.activities-list-page {
  width: 100%;
  padding: 0 20px;
  background-color: #ffffff;
}

/* 页面标题 */
.page-title {
  text-align: center;
  margin-bottom: 40px;
  padding: 20px 0;
}

.page-title h1 {
  font-size: 3rem;
  font-weight: 700;
  color: #333333;
  margin-bottom: 10px;
}

.page-title p {
  font-size: 1.2rem;
  color: rgba(0, 0, 0, 0.7);
}

/* 活动列表容器 */
.activities-container {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 30px;
  padding: 20px 0;
}

/* 玻璃UI样式 */
.glass-ui {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

/* 活动卡片 */
.activity-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.activity-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  border-color: rgba(100, 108, 255, 0.3);
}

/* 活动卡片图片 */
.activity-card-image {
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.activity-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.activity-card:hover .activity-image {
  transform: scale(1.05);
}

/* 活动卡片内容 */
.activity-card-content {
  padding: 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 活动日期 */
.activity-date {
  font-size: 0.9rem;
  color: #646cff;
  font-weight: 600;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 活动标题 */
.activity-title {
  font-size: 1.4rem;
  font-weight: 600;
  color: #333333;
  margin-bottom: 12px;
  line-height: 1.3;
}

/* 活动描述 */
.activity-description {
  font-size: 1rem;
  color: rgba(0, 0, 0, 0.7);
  line-height: 1.5;
  flex: 1;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .activities-container {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 24px;
  }
}

@media (max-width: 768px) {
  .page-title h1 {
    font-size: 2rem;
  }

  .page-title p {
    font-size: 1rem;
  }

  .activities-container {
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 10px 0;
  }

  .activity-card-content {
    padding: 20px;
  }

  .activity-title {
    font-size: 1.2rem;
  }
}

@media (max-width: 480px) {
  .page-title {
    margin-bottom: 30px;
  }

  .page-title h1 {
    font-size: 1.8rem;
  }

  .activity-card-image {
    height: 180px;
  }

  .activity-card-content {
    padding: 16px;
  }
}
</style>
