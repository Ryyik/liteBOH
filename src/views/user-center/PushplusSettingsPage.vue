<template>
  <div class="pushplus-settings-page">

    <div class="page-container">
      <UserCenterPageHeader title="推送设置" max-width="650px" @back="goBack" />

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
  background-color: #f5f5f7;
}

:global([data-theme="dark"]) .pushplus-settings-page {
  background-color: #181a20;
}

.page-container {
  width: 100%;
  max-width: 650px;
  margin: 0 auto;
  padding: 24px clamp(16px, 4vw, 24px) 60px;
  box-sizing: border-box;
}

.page-description {
  margin: 8px 0 20px;
}

.page-description p {
  font-size: 14px;
  color: #86868b;
  margin: 0;
}

@media (max-width: 768px) {
  .page-container {
    padding: 16px 16px 40px;
  }
}
</style>
