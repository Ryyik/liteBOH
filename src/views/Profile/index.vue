<script setup>
/**
 * Profile 页面入口 — 异步懒加载，减少首屏 JS 体积。
 */
import { defineAsyncComponent } from 'vue';

const ProfileMain = defineAsyncComponent(() => import('./ProfileMain.vue'));
</script>

<template>
  <Suspense>
    <template #default>
      <ProfileMain v-bind="$attrs" />
    </template>
    <template #fallback>
      <div class="profile-suspense" aria-hidden="true">
        <div class="profile-suspense-banner glass-panel"></div>
        <div class="profile-suspense-body">
          <div class="profile-suspense-avatar animate-skeleton-wave"></div>
          <div class="profile-suspense-meta">
            <div class="profile-suspense-line name animate-skeleton-wave"></div>
            <div class="profile-suspense-line medium animate-skeleton-wave"></div>
            <div class="profile-suspense-line long animate-skeleton-wave"></div>
          </div>
          <div class="profile-suspense-cards">
            <div v-for="i in 4" :key="`profile-suspense-card-${i}`" class="profile-suspense-card glass-panel animate-skeleton-wave"></div>
          </div>
        </div>
      </div>
    </template>
  </Suspense>
</template>

<style>
@import '../user-center/UserSpace/styles/profile-base.css';
@import '../user-center/UserSpace/styles/profile-panels.css';
@import '../user-center/UserSpace/styles/shell-community.css';
@import '../user-center/UserSpace/styles/responsive-integrations.css';
</style>

<style scoped>
.profile-suspense {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-suspense-banner {
  width: 100%;
  height: 140px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--glass-bg, rgba(255, 255, 255, 0.6)) 0%, var(--glass-bg-2, rgba(255, 255, 255, 0.4)) 100%);
}

.profile-suspense-body {
  position: relative;
  padding: 56px 24px 24px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-suspense-avatar {
  position: absolute;
  top: -40px;
  left: 24px;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 4px solid var(--glass-bg, rgba(255, 255, 255, 0.7));
}

.profile-suspense-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.profile-suspense-line {
  height: 14px;
  border-radius: 6px;
}

.profile-suspense-line.name {
  width: 140px;
  height: 22px;
}

.profile-suspense-line.medium {
  width: 100px;
  height: 14px;
}

.profile-suspense-line.long {
  width: 220px;
  height: 14px;
}

.profile-suspense-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 8px;
}

@media (max-width: 640px) {
  .profile-suspense-cards {
    grid-template-columns: 1fr;
  }
}

.profile-suspense-card {
  height: 120px;
  border-radius: 16px;
}
</style>