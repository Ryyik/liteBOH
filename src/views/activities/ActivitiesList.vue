<template>
  <div class="activities-list-page">
    <!-- 页头（对齐 Newsroom 设计语言：kicker + 左对齐大标题 + 右下角动作区） -->
    <header class="activities-header">
      <div class="activities-header-copy">
        <p class="page-kicker">方块之家 · BOH EVENTS</p>
        <h1 class="page-title-text">活动列表</h1>
        <p class="page-subtitle-text">报名中的活动在最上方，往期活动按月份回看</p>
      </div>
      <button v-if="isAdmin" type="button" class="activity-admin-publish-btn" @click="showPublishModal = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>投稿活动</span>
      </button>
    </header>

    <!-- ① 顶部活动报名卡（数据源 activity_campaigns，与下方历史区互不相干） -->
    <ActivitySignupSection
      :campaigns="campaigns"
      :loading="campaignLoading"
      :is-logged-in="authStore.isLoggedIn"
      @signup="signupCampaign"
    />

    <!-- ② 按月份分组的历史活动，每月一条横向滚动轨道 -->
    <div class="activities-timeline">
      <div v-if="activitiesLoading" class="activities-skeleton" aria-hidden="true">
        <div v-for="n in 3" :key="`sk-${n}`" class="activities-skeleton__group">
          <div class="activities-skeleton__head"></div>
          <div class="activities-skeleton__card"></div>
        </div>
      </div>

      <template v-else-if="groups.length || undated.length">
        <ActivityMonthRail
          v-for="group in groups"
          :key="group.monthKey"
          :month-label="group.monthLabel"
          :month-key="group.monthKey"
          :items="group.items"
          @open="openDetail"
        />
        <!-- 日期无法解析的记录不丢弃，单独成组垫底 -->
        <ActivityMonthRail
          v-if="undated.length"
          month-label="未排期"
          month-key="undated"
          :items="undated"
          @open="openDetail"
        />
      </template>

      <EmptyState
        v-else
        variant="inbox"
        title="还没有活动记录"
        description="往期活动会按月份归档在这里。"
      />
    </div>

    <!-- 管理员投稿活动（可选「新建报名活动」或「新建活动」） -->
    <AdminContentPublishModal
      :visible="showPublishModal"
      type="activity"
      @close="showPublishModal = false"
      @published="onPublished"
    />
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { getImageUrl } from "@/utils/asset-helper.js";
import { formatActivityDate } from "@/utils/activity-date.js";
import { groupedActivities, undatedActivities, initActivities, loading as activitiesLoading } from "@/composables/useActivities";
import { useCampaigns } from "@/composables/useCampaigns.js";
import { useAuthStore } from "@/stores/auth";
import AdminContentPublishModal from "@/components/AdminContentPublishModal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ContentDetailIsland from "@/components/UnifiedNavbar/ContentDetailIsland.vue";
import { showIsland } from "@/composables/useIsland.js";
import ActivitySignupSection from "./components/ActivitySignupSection.vue";
import ActivityMonthRail from "./components/ActivityMonthRail.vue";

const authStore = useAuthStore();
const { isAdmin } = storeToRefs(authStore);
const showPublishModal = ref(false);
const remountWallIsland = inject("remountWallIsland", null);

// ===== 报名区（activity_campaigns）=====
const { campaigns, loading: campaignLoading, loadOngoingCampaigns, signupCampaign } = useCampaigns();

// ===== 历史活动（activities，按月分组）=====
const groups = computed(() => groupedActivities.value);
const undated = computed(() => undatedActivities.value);

// 详情灵动岛：详情以导航栏延伸卡呈现（替代页面内模态框）
let detailIsland = null;

const openDetail = (activity) => {
  if (!activity) return;
  detailIsland?.close();
  detailIsland = showIsland.custom(ContentDetailIsland, {
    type: "activity",
    title: String(activity.title || ""),
    // 详情卡走 formatActivityDate：缺「日」的记录显示「2025年10月」而不是原始 '2025/10'
    meta: formatActivityDate(activity.date),
    image: getImageUrl(activity.image),
    paragraphs: String(activity.description || "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean),
    onClose: () => {
      // × / Esc 都走这里：必须真正清掉岛槽位，仅置空句柄岛不会消失
      detailIsland?.close();
      detailIsland = null;
      // 详情卡占用了活动墙常驻岛的槽位，关闭后让宿主重挂载
      remountWallIsland?.();
    }
  });
};

const loadActivities = async () => {
  await initActivities();
};

// 投稿弹窗的两种活动写的是两张不同的表：报名活动 → activity_campaigns，
// 往期活动 → activities。只刷新被写的那条链，不做无谓的全量重查。
const onPublished = (payload) => {
  if (payload?.kind === 'campaign') loadOngoingCampaigns();
  else loadActivities();
};

// 全局导航是 position:fixed，其实际高度（灵动岛卡展开后会变高）与声明值不一致。
// 实测导航真实高度写回页面根节点 --nav-h，页头 padding-top 用它做吸顶避让（Newsroom 先例）。
let navResizeObserver = null;
const syncNavHeight = () => {
  const nav = document.getElementById("unified-nav-container");
  const page = document.querySelector(".activities-list-page");
  if (!nav || !page) return;
  const h = nav.getBoundingClientRect().height;
  if (h > 0) page.style.setProperty("--nav-h", `${Math.ceil(h)}px`);
};

onMounted(async () => {
  document.body.classList.add("is-loaded");
  syncNavHeight();
  const nav = document.getElementById("unified-nav-container");
  if (nav && typeof ResizeObserver !== "undefined") {
    navResizeObserver = new ResizeObserver(syncNavHeight);
    navResizeObserver.observe(nav);
  }
  await loadActivities();
  loadOngoingCampaigns();
});

onBeforeUnmount(() => {
  // 详情岛随页面卸载（showIsland.custom 约定：宿主必须负责 close）
  detailIsland?.close();
  detailIsland = null;
  navResizeObserver?.disconnect();
  navResizeObserver = null;
});
</script>

<style scoped>
/* 页头：对齐 Newsroom 设计语言（kicker + 左对齐大标题 + 右下角投稿按钮） */
.activities-header {
  max-width: 1180px;
  margin: 0 auto;
  padding: calc(var(--nav-h, 64px) + 78px) 32px 26px;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  text-align: left;
}
.activities-header-copy { min-width: 0; }
.page-kicker {
  margin: 0 0 12px;
  color: #667085;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.activity-admin-publish-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 18px;
  flex-shrink: 0;
  border: 1px solid rgba(0, 113, 227, 0.35);
  border-radius: 999px;
  color: #0071e3;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  font: inherit;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 113, 227, 0.12);
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}
.activity-admin-publish-btn:hover {
  color: #ffffff;
  background: #0071e3;
  transform: translateY(-1px);
}
.activity-admin-publish-btn:active { transform: scale(0.97); }
html[data-theme="dark"] .activity-admin-publish-btn {
  color: #6cb2ff;
  background: rgba(28, 28, 30, 0.7);
  border-color: rgba(10, 132, 255, 0.45);
}
html[data-theme="dark"] .activity-admin-publish-btn:hover {
  color: #ffffff;
  background: #0a84ff;
}

/* 页面基础样式 */
.activities-list-page {
  --nav-h: var(--bohai-standalone-nav-height, 64px);
  width: 100%;
  background: #ffffff;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  min-height: 100vh;
  color: #1d1d1f;
}

.page-title-text {
  margin: 0 0 12px;
  font-size: clamp(34px, 5vw, 48px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.08;
  color: var(--text-1, #1d1d1f);
}

.page-subtitle-text {
  margin: 0;
  font-size: 17px;
  color: #667085;
  font-weight: 400;
  line-height: 1.5;
  max-width: 600px;
}

/* 月份轨道区：--activity-rail-gutter 必须等于本容器的水平 padding，
   轨道靠它做负 margin 露边；两值不一致会让首卡与月份标题错位。 */
.activities-timeline {
  --activity-rail-gutter: 40px;
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 40px;
}

/* ---- 加载骨架 ---- */
.activities-skeleton__group { margin-bottom: 34px; }

.activities-skeleton__head {
  width: 108px;
  height: 18px;
  margin-bottom: 14px;
  border-radius: 8px;
  background: #edf0f4;
}

.activities-skeleton__card {
  width: clamp(230px, 27%, 300px);
  height: 218px;
  border-radius: 24px;
  background: #edf0f4;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .activities-header {
    display: block;
    padding: calc(var(--nav-h, 64px) + 48px) 20px 20px;
  }

  /* 移动端投稿按钮回流到标题下方（镜像 Newsroom 移动端行为） */
  .activity-admin-publish-btn {
    margin-top: 16px;
  }

  .page-subtitle-text {
    font-size: 15px;
  }

  .activities-timeline {
    --activity-rail-gutter: 20px;
    padding: 0 20px;
  }
}

/* ---- 暗色主题 ---- */
html[data-theme="dark"] .activities-list-page {
  background: #0d0f14;
  color: #f5f5f7;
}
html[data-theme="dark"] .page-kicker { color: #8d99a8; }
html[data-theme="dark"] .page-title-text { color: #f5f5f7; }
html[data-theme="dark"] .page-subtitle-text { color: #a1a1a6; }
html[data-theme="dark"] .activities-skeleton__head,
html[data-theme="dark"] .activities-skeleton__card { background: #1a1e26; }
</style>
