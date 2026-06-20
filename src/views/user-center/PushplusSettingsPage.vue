<template>
  <div class="pushplus-settings-page">

    <div class="page-container">
      <UserCenterPageHeader title="推送设置" @back="goBack" />

      <div class="page-description">
        <p>配置离线消息推送，随时随地接收通知</p>
      </div>

      <PushplusSettings />
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import PushplusSettings from '@/components/PushplusSettings/index.vue';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';

const router = useRouter();
const route = useRoute();

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};
</script>

<style scoped>
.pushplus-settings-page {
  min-height: 100vh;
  background-color: #f8f9fa;
}

.page-container {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 72px 0 60px;
}

/* X-Style Header */
.x-sub-header {
  position: sticky;
  top: 72px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #eff3f4;
}

.x-header-content {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.x-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.x-header-title {
  font-size: 20px;
  font-weight: 800;
  color: #0f1419;
  margin: 0;
}

.page-description {
  margin-bottom: 32px;
}

.page-description p {
  font-size: 15px;
  color: #86868b;
  margin: 0;
}

@media (max-width: 768px) {
  .page-container {
    padding: 56px 16px 40px;
  }

  .x-sub-header {
    margin: -60px -16px 16px;
  }
}
</style>
