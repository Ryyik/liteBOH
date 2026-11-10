<template>
  <!-- 通知设置页（2026-11-10 换新）
       旧壳：居中大标题「通知设置」+ 副标题 + 顶部 72px 硬内边距 + 24px 容器内边距
       ⇒ 标题离屏幕顶部一大截（用户截图里的「顶部空隙过大」就是它）。
       新壳：与设置二级页**完全同构** —— 一条 gs-inline-bar（‹ 设置 + 标题）+ 卡片。
       进入时实测导航岛在不在：邮件直链进来时有岛（78px），没有就归零。 -->
  <div
    class="settings-page notification-settings-page"
    :style="{ '--userspace-nav-h': navTopOffset + 'px', paddingTop: navTopOffset + 'px' }"
  >
    <div class="ns-shell">
      <div class="gs-inline-bar">
        <button type="button" class="gs-inline-back" @click="goBack">
          <ChevronLeft :size="17" :stroke-width="2.2" aria-hidden="true" />
          <span>设置</span>
        </button>
        <h2 class="gs-inline-title">通知设置</h2>
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
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronLeft } from 'lucide-vue-next';
import NotificationSettings from '@/components/NotificationSettings/index.vue';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';

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

onMounted(() => {
  syncNavTopOffset();
  window.addEventListener('resize', syncNavTopOffset, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncNavTopOffset);
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
