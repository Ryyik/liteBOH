<template>
  <div class="activities-list-page">
    <!-- 活动列表标题区域 -->
    <header class="activities-header">
      <h1 class="page-title-text">方块之家活动列表</h1>
      <p class="page-subtitle-text">回顾我们曾经举办的精彩活动</p>
    </header>

    <!-- 活动列表容器 -->
    <div class="activities-container">
      <!-- 加载状态 -->
      <template v-if="loading">
        <div v-for="item in 6" :key="`activity-loading-${item}`" class="activity-card activity-card-skeleton liquid-glass"
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
        <div
          v-for="activity in activities"
          :key="activity.id"
          class="activity-card"
          @click="openDetail(activity)"
        >
          <!-- 活动图片 -->
          <div class="activity-card-image">
            <img :src="getImageUrl(activity.image)" :alt="activity.title" class="activity-image" width="400" height="280" loading="lazy" />
            <div class="activity-date-badge">{{ activity.date }}</div>
          </div>

          <!-- 活动信息 -->
          <div class="activity-card-content">
            <h3 class="activity-title">{{ activity.title }}</h3>
            <p class="activity-description clamp">{{ activity.description }}</p>
            <span class="activity-hint">点击查看详情</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 活动详情弹窗 -->
    <Transition name="modal">
      <div v-if="selectedActivity" class="detail-overlay" @click="selectedActivity = null">
        <article class="detail-modal" role="dialog" aria-modal="true" :aria-label="selectedActivity.title" @click.stop>
          <button type="button" class="detail-close" aria-label="关闭" @click="selectedActivity = null">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="detail-image-wrap">
            <img :src="getImageUrl(selectedActivity.image)" :alt="selectedActivity.title" class="detail-image" />
          </div>
          <div class="detail-content">
            <span class="detail-date">{{ selectedActivity.date }}</span>
            <h2 class="detail-title">{{ selectedActivity.title }}</h2>
            <p class="detail-desc">{{ selectedActivity.description }}</p>
          </div>
        </article>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { getImageUrl } from "@/utils/asset-helper.js";
import { initActivities, getAllActivities } from "@/composables/useActivities";

const activities = ref([]);
const loading = ref(true);
const selectedActivity = ref(null);

const openDetail = (activity) => {
  selectedActivity.value = activity;
  document.body.style.overflow = 'hidden';
};

const closeDetail = () => {
  selectedActivity.value = null;
  document.body.style.overflow = '';
};

const loadActivities = async () => {
  loading.value = true;
  await initActivities();
  activities.value = getAllActivities();
  loading.value = false;
};

onMounted(async () => {
  document.body.classList.add("is-loaded");
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
  background: #ffffff;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  min-height: 100vh;
  color: #1d1d1f;
}

.activities-header {
  text-align: center;
  padding: 160px 20px 100px;
  max-width: 1000px;
  margin: 0 auto;
}

.page-title-text {
  font-size: 72px;
  font-weight: 800;
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

.activities-container {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 48px;
  padding: 0 40px 160px;
}

/* 活动卡片（液态玻璃外观由全局 .liquid-glass 提供） */
.activity-card {
  border-radius: 32px;
  overflow: hidden;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.04);
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
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

.activity-card-image {
  width: 100%;
  height: 280px;
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

.activity-card-content {
  padding: 40px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.activity-title {
  font-size: 24px;
  font-weight: 800;
  color: #1d1d1f;
  margin-bottom: 16px;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.activity-description {
  font-size: 16px;
  color: #86868b;
  line-height: 1.7;
  flex: 1;
  margin-bottom: 16px;
}

.activity-description.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-hint {
  font-size: 13px;
  color: #aeaeaf;
  font-weight: 500;
}

/* ===== 详情弹窗 ===== */
.detail-overlay {
  position: fixed;
  z-index: 10002;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.detail-modal {
  width: min(720px, 100%);
  max-height: calc(100dvh - 48px);
  position: relative;
  border-radius: 28px;
  overflow: auto;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.18);
  scrollbar-width: thin;
}

.detail-modal::-webkit-scrollbar { width: 4px; }
.detail-modal::-webkit-scrollbar-thumb { border-radius: 2px; background: rgba(0,0,0,0.1); }

.detail-close {
  position: absolute;
  z-index: 2;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  color: #1d1d1f;
  transition: transform 150ms ease;
}

.detail-close:active { transform: scale(0.92); }

.detail-image-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #f5f5f7;
}

.detail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-content {
  padding: 36px 40px 44px;
}

.detail-date {
  display: inline-block;
  margin-bottom: 12px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #1d1d1f;
  background: #f5f5f7;
}

.detail-title {
  margin: 0 0 18px;
  padding-right: 48px;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: #1d1d1f;
}

.detail-desc {
  margin: 0;
  font-size: 16px;
  color: #86868b;
  line-height: 1.8;
}

/* ===== Motion ===== */
.modal-enter-active { transition: opacity 300ms cubic-bezier(0.32, 0.72, 0, 1); }
.modal-leave-active { transition: opacity 250ms cubic-bezier(0.55, 0, 1, 0.45); }
.modal-enter-active .detail-modal { transition: transform 450ms cubic-bezier(0.22, 0.95, 0.36, 1), opacity 300ms ease; }
.modal-leave-active .detail-modal { transition: transform 250ms cubic-bezier(0.55, 0, 1, 0.45), opacity 200ms ease; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .detail-modal { transform: scale(0.94) translateY(16px); opacity: 0; }
.modal-leave-to { opacity: 0; }
.modal-leave-to .detail-modal { transform: scale(0.96) translateY(8px); opacity: 0; }

/* ===== 响应式 ===== */
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

  .detail-overlay {
    padding: 0;
    align-items: end;
  }

  .detail-modal {
    width: calc(100% - 16px);
    max-height: 92dvh;
    margin: 0 8px 8px;
    border-radius: 24px;
  }

  .detail-content {
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
  }

  .detail-title {
    font-size: 26px;
    padding-right: 40px;
  }
}
</style>
