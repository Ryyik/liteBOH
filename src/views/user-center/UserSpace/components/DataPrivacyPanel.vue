<template>
  <div class="profile-subpage-shell">
    <UserCenterPageHeader title="数据与隐私" back-label="返回设置" max-width="650px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <div class="apple-card">
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('navigate', 'shared-memories')">
            <div class="item-left">
              <div class="icon-wrapper bg-indigo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                  <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                  <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"></path>
                </svg>
              </div>
              <span class="item-label">公共记忆管理</span>
            </div>
            <div class="item-right">
              <span class="chevron">›</span>
            </div>
          </div>
          <div v-if="isAdmin" class="apple-item clickable" @click="$emit('navigate', 'admin')">
            <div class="item-left">
              <div class="icon-wrapper bg-gray">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
              </div>
              <span class="item-label">后台数据管理</span>
            </div>
            <div class="item-right">
              <span class="chevron">›</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-subpage-shell {
  padding-top: 0;
}
</style>

<script setup>
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';

defineProps({
  isAdmin: { type: Boolean, default: false }
});

defineEmits(['back', 'navigate']);
</script>
