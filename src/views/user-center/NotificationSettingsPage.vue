<template>
  <!-- 通知设置页（2026-11-10 换新，2026-11-24 页头改极简）
       旧壳：居中大标题「通知设置」+ 副标题 + 顶部 72px 硬内边距 + 24px 容器内边距
       ⇒ 标题离屏幕顶部一大截（用户截图里的「顶部空隙过大」就是它）。
       新壳：与设置二级页**完全同构** —— SettingsSubpageHeader（圆形返回 + 居中标题）+ 卡片。
       进入时实测导航岛在不在：邮件直链进来时有岛（78px），没有就归零。
       2026-11-24：竖屏下本页也进入沉浸态（不挂导航岛、占满整屏），留白随之归零；
       横屏保留导航岛。 -->
  <div
    class="settings-page notification-settings-page"
    :style="{ '--userspace-nav-h': shellTop + 'px', paddingTop: shellTop + 'px' }"
  >
    <div class="ns-shell">
      <SettingsSubpageHeader title="通知设置" @back="goBack" />

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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NotificationSettings from '@/components/NotificationSettings/index.vue';
import SettingsSubpageHeader from './UserSpace/components/SettingsSubpageHeader.vue';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import { setSettingsImmersive, settingsWideViewport } from '@/composables/useSettingsChrome.js';

const router = useRouter();
const route = useRoute();

/* 顶部留白 = 导航岛实测高度；岛不渲染（深链 / 全屏子页）时归零，不留白档。 */
const navTopOffset = ref(78);
const syncNavTopOffset = () => {
  const el = document.getElementById('unified-nav-container');
  if (!el) {
    navTopOffset.value = 0;
    return;
  }
  const h = Math.round(el.getBoundingClientRect().height);
  const minH = Math.round(Number.parseFloat(getComputedStyle(el).minHeight) || 0);
  navTopOffset.value = minH > 0 ? Math.min(h, minH) : h;
};

/* 多媒体查询（竖屏）才沉浸：横屏照挂导航岛（用户口径「横屏还是挂导航栏的」）。
   ⚠️ 本页是**独立路由**（/user-space/pushplus-settings），路由判据里已经把它当子页隐藏了，
      但那条只管"有没有 view 参数"，横屏时同样会隐藏 —— 所以这里必须按视口自己判一次，
      与设置壳内那套（ProfileSettingsPanel 的 immersiveSubpage）同口径。 */
const immersive = computed(() => !settingsWideViewport.value);
const shellTop = computed(() => (immersive.value ? 0 : navTopOffset.value));

onMounted(() => {
  syncNavTopOffset();
  window.addEventListener('resize', syncNavTopOffset, { passive: true });
  setSettingsImmersive(immersive.value);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncNavTopOffset);
  setSettingsImmersive(false);
});

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};
</script>

<style scoped>
@import '../../views/user-center/UserSpace/styles/settings-glass.css';

.notification-settings-page {
  /* 底色 / 暗色翻转由 .settings-page 提供（settings-glass.css 单一源） */
}

/* 与设置页右栏同宽同边距：卡片左边线在竖屏上与「设置」子页对齐 */
.ns-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
  padding: 8px 12px 60px;
  box-sizing: border-box;
}

@media (max-width: 767px) {
  .ns-shell {
    padding: 6px 0 48px;
  }
}
</style>
