<template>
  <div ref="pageRef" class="activities-wall-page">
    <!-- 2026-10-19：方块墙退场，本页由「活动&方块墙」双面板收编为纯活动页。
         活动详情岛（ActivitiesList 的 ContentDetailIsland）仍走全局岛槽位，无常驻岛。 -->
    <div class="aw-body">
      <div class="aw-pane aw-pane--activities">
        <ActivitiesList />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import ActivitiesList from '@/views/activities/ActivitiesList.vue';

// ---- 导航栏实际高度同步：页面吸附位随之避让（同新闻&节目的做法） ----
const pageRef = ref(null);
let navResizeObserver = null;

const syncNavHeight = () => {
  const nav = document.getElementById('unified-nav-container');
  const page = pageRef.value;
  if (!nav || !page) return;
  const height = Math.ceil(nav.getBoundingClientRect().height);
  if (height > 0) page.style.setProperty('--aw-nav-h', `${height}px`);
};

onMounted(() => {
  syncNavHeight();
  const nav = document.getElementById('unified-nav-container');
  if (nav && typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(syncNavHeight);
    navResizeObserver.observe(nav);
  }
});

onBeforeUnmount(() => {
  navResizeObserver?.disconnect();
  navResizeObserver = null;
});
</script>

<style scoped>
.activities-wall-page {
  min-height: 100vh;
  /* 顶部为固定导航栏预留空间；导航栏高度变化时由 JS 测量值接管 */
  padding-top: var(--aw-nav-h, 72px);
  background:
    radial-gradient(circle at 18% 0%, rgba(226, 232, 240, 0.55), transparent 42%),
    radial-gradient(circle at 85% 8%, rgba(254, 243, 222, 0.5), transparent 38%),
    linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

/* ---- 面板 ---- */
.aw-body {
  width: 100%;
}

/* 活动面板：收敛原本为独立页面设计的留白 */
.aw-pane--activities :deep(.activities-list-page) {
  background: transparent;
  min-height: auto;
}

.aw-pane--activities :deep(.activities-header) {
  padding: 52px 20px 40px;
}

.aw-pane--activities :deep(.activities-timeline) {
  padding-bottom: 96px;
}

@media (max-width: 768px) {
  .activities-wall-page {
    padding-top: var(--aw-nav-h, 58px);
  }

  .aw-pane--activities :deep(.activities-header) {
    padding: 36px 20px 28px;
  }
}

/* ---- 暗色主题（dark audit 2026-09-08） ---- */
html[data-theme='dark'] .activities-wall-page {
  background:
    radial-gradient(circle at 18% 0%, rgba(38, 52, 74, 0.4), transparent 42%),
    radial-gradient(circle at 85% 8%, rgba(64, 50, 30, 0.32), transparent 38%),
    linear-gradient(180deg, #0d0f14 0%, #12151c 100%);
}
</style>
