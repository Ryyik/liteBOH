<template>
  <div ref="pageRef" class="activities-wall-page">
    <!-- 双面板：切换与操作全部由全局导航栏灵动岛（WallIslandCard）承载 -->
    <div class="aw-body">
      <div v-show="activeTab === 'activities'" class="aw-pane aw-pane--activities">
        <ActivitiesList />
      </div>
      <div v-show="activeTab === 'wall'" class="aw-pane aw-pane--wall">
        <BlockWall ref="wallInstance" embedded />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ActivitiesList from "@/views/activities/ActivitiesList.vue";
import BlockWall from "@/views/BlockWall/index.vue";
import WallIslandCard from "./WallIslandCard.vue";
import { showIsland } from "@/composables/useIsland.js";

const route = useRoute();
const router = useRouter();

// tab 与路由查询参数双向同步：?tab=wall 直达方块墙，默认展示活动
const activeTab = computed(() => (String(route.query.tab || "") === "wall" ? "wall" : "activities"));

const setTab = (tab) => {
  if (activeTab.value === tab) return;
  const query = { ...route.query };
  if (tab === "wall") query.tab = "wall";
  else delete query.tab;
  router.replace({ query });
};

// ---- 方块墙状态：来自 BlockWall defineExpose，驱动灵动岛展示 ----
const wallInstance = ref(null);
const wallLoading = computed(() => Boolean(wallInstance.value?.isLoading));
const wallCount = computed(() => Number(wallInstance.value?.total) || wallInstance.value?.items?.length || 0);
const refreshWall = () => wallInstance.value?.loadItems(1);
const openWallComposer = () => wallInstance.value?.openComposer?.();

// ---- 全局导航栏灵动岛：进入页面即挂载（切换居中），
//      切到方块墙时岛内布局自动左移并展开操作区，离开页面注销 ----
let islandHandle = null;

const mountIsland = () => {
  if (islandHandle) return;
  islandHandle = showIsland.custom(WallIslandCard, {
    tab: activeTab.value,
    count: wallCount.value,
    loading: wallLoading.value,
    changeTab: setTab,
    refresh: refreshWall,
    compose: openWallComposer
  });
};

const syncIslandProps = () => {
  if (!islandHandle) return;
  islandHandle.update({
    tab: activeTab.value,
    count: wallCount.value,
    loading: wallLoading.value
  });
};

watch(activeTab, syncIslandProps);
watch([wallCount, wallLoading], syncIslandProps);

// ---- 导航栏实际高度同步：灵动岛展开时页面吸附位随之避让（同新闻&节目的做法） ----
const pageRef = ref(null);
let navResizeObserver = null;

const syncNavHeight = () => {
  const nav = document.getElementById("unified-nav-container");
  const page = pageRef.value;
  if (!nav || !page) return;
  const height = Math.ceil(nav.getBoundingClientRect().height);
  if (height > 0) page.style.setProperty("--aw-nav-h", `${height}px`);
};

onMounted(() => {
  mountIsland();
  syncNavHeight();
  const nav = document.getElementById("unified-nav-container");
  if (nav && typeof ResizeObserver !== "undefined") {
    navResizeObserver = new ResizeObserver(syncNavHeight);
    navResizeObserver.observe(nav);
  }
});

onBeforeUnmount(() => {
  islandHandle?.close();
  islandHandle = null;
  navResizeObserver?.disconnect();
  navResizeObserver = null;
});
</script>

<style scoped>
.activities-wall-page {
  min-height: 100vh;
  /* 顶部为固定导航栏预留空间；灵动岛展开时由 JS 测量值接管 */
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

/* 活动面板：嵌入态收敛原本为独立页面设计的留白 */
.aw-pane--activities :deep(.activities-list-page) {
  background: transparent;
  min-height: auto;
}

.aw-pane--activities :deep(.activities-header) {
  padding: 52px 20px 40px;
}

.aw-pane--activities :deep(.activities-container) {
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
</style>
