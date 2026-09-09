<template>
  <div class="settings-page pushplus-settings-page"
    :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">

    <div class="settings-page-container">
      <UserCenterPageHeader v-if="isFromUserSpace" title="推送设置" max-width="680px" @back="goBack" />

      <div class="settings-page-desc">
        <p>配置离线消息推送，随时随地接收通知</p>
      </div>

      <PushplusSettings />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import PushplusSettings from '@/components/PushplusSettings/index.vue';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';

const router = useRouter();
const route = useRoute();
const isFromUserSpace = computed(() => String(route.query.from || '').startsWith('userspace'));

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};
</script>

<style scoped>
@import '../../views/user-center/UserSpace/styles/settings-glass.css';

.pushplus-settings-page {
  /* 液态玻璃底色由 .settings-page 提供（settings-glass.css 单一源） */
}
</style>
