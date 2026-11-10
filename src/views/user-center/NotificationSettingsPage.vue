<template>
  <div
    class="settings-page notification-settings-page"
    :style="{
      '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px',
      paddingTop: isFromUserSpace ? '0px' : '72px',
    }"
  >
    <div class="settings-page-container">
      <UserCenterPageHeader
        v-if="isFromUserSpace"
        title="通知设置"
        max-width="680px"
        @back="goBack"
      />

      <div class="settings-page-desc">
        <p>应用内提醒与邮件通知，随时开或关</p>
      </div>

      <NotificationSettings />
    </div>
  </div>
</template>

<script setup>
/**
 * 通知设置页。
 *
 * ⚠️ 路由路径仍是 `/user-space/pushplus-settings`（2026-11-10 删除 Pushplus 时刻意没改）：
 *    这个 slug 已经写进了**已发出的邮件**里（生日 / 关注动态 / 审核结果三封的页脚
 *    「去关闭」都指它），改路径会让历史邮件里的链接 404。
 *    对外名（页面标题、入口文案、组件名）已全部改成「通知设置」，路径属于兼容层，
 *    与 `router/routes/compat.ts` 里的 `/pushplus` 旧链同性质。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import NotificationSettings from '@/components/NotificationSettings/index.vue';
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

.notification-settings-page {
  /* 液态玻璃底色由 .settings-page 提供（settings-glass.css 单一源） */
}
</style>
