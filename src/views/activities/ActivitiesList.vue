<template>
  <div class="activities-list-page">
    <!-- 活动列表标题区域 -->
    <header class="activities-header">
      <div class="activities-header-copy">
        <h1 class="page-title-text">方块之家活动列表</h1>
        <p class="page-subtitle-text">回顾我们曾经举办的精彩活动</p>
      </div>
      <button v-if="isAdmin" type="button" class="activity-admin-publish-btn" @click="showPublishModal = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>投稿活动</span>
      </button>
    </header>

    <!-- 进行中活动（活动平台 campaigns，BETA 6 P1-3） -->
    <section v-if="ongoingCampaigns.length" class="campaign-section" aria-label="进行中活动">
      <div class="campaign-section-head">
        <h2 class="campaign-section-title">进行中活动</h2>
        <span class="campaign-section-hint">来自活动平台 · 可直接报名</span>
      </div>
      <div class="campaign-grid">
        <article v-for="camp in ongoingCampaigns" :key="camp.id" class="campaign-card liquid-glass">
          <div class="campaign-card-top">
            <span class="campaign-stage-chip" :data-stage="camp.stage">{{ campaignStageLabel(camp.stage) }}</span>
            <span v-if="campaignWindow(camp)" class="campaign-window">{{ campaignWindow(camp) }}</span>
          </div>
          <h3 class="campaign-title">{{ camp.title }}</h3>
          <p v-if="camp.description" class="campaign-desc">{{ camp.description }}</p>
          <button type="button" class="campaign-signup-btn"
            :disabled="camp.signingUp || camp.signedUp"
            @click="signupCampaign(camp)">
            {{ camp.signedUp ? '已报名' : (camp.signingUp ? '报名中…' : '立即报名') }}
          </button>
        </article>
      </div>
    </section>

    <!-- 活动列表容器 -->
    <div class="activities-container">
      <!-- 加载状态 -->
      <template v-if="loading">
        <div v-for="item in 6" :key="`activity-loading-${item}`" class="activity-card activity-card-skeleton liquid-glass"
          aria-hidden="true">
          <div class="activity-skeleton-image">
            <div class="activity-skeleton-block activity-skeleton-date"></div>
          </div>
          <div class="activity-card-content">
            <div class="activity-skeleton-block activity-skeleton-title"></div>
            <div class="activity-skeleton-block activity-skeleton-line wide"></div>
            <div class="activity-skeleton-block activity-skeleton-line"></div>
          </div>
        </div>
      </template>
      <template v-else>
        <!-- 活动卡片 -->
        <div
          v-for="activity in activities"
          :key="activity.id"
          class="activity-card"
          @click="openDetail(activity)"
        >
          <!-- 活动图片 -->
          <div class="activity-card-image">
            <img :src="getImageUrl(activity.image)" :alt="activity.title" class="activity-image" width="400" height="280" loading="lazy" />
            <div class="activity-date-badge">{{ activity.date }}</div>
          </div>

          <!-- 活动信息 -->
          <div class="activity-card-content">
            <h3 class="activity-title">{{ activity.title }}</h3>
            <p class="activity-description clamp">{{ activity.description }}</p>
            <span class="activity-hint">点击查看详情</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 管理员投稿活动 -->
    <AdminContentPublishModal :visible="showPublishModal" type="activity" @close="showPublishModal = false" @published="loadActivities" />
  </div>
</template>

<script setup>
import { ref, inject, onMounted, onBeforeUnmount } from "vue";
import { getImageUrl } from "@/utils/asset-helper.js";
import { initActivities, getAllActivities } from "@/composables/useActivities";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import AdminContentPublishModal from "@/components/AdminContentPublishModal.vue";
import { showIsland } from "@/composables/useIsland.js";
import ContentDetailIsland from "@/components/UnifiedNavbar/ContentDetailIsland.vue";
import { listActivityCampaigns, getMyCampaignEntries, signupCampaignEntry } from "@/utils/api/activities-platform-api.js";

const authStore = useAuthStore();
const { isAdmin } = storeToRefs(authStore);
const showPublishModal = ref(false);
const remountWallIsland = inject("remountWallIsland", null);

// ===== 进行中活动（campaigns） =====
const ONGOING_STAGES = new Set(["signup", "submission", "judging"]);
const CAMPAIGN_STAGE_LABELS = {
  draft: "草稿", signup: "报名中", submission: "投稿中",
  judging: "评审中", result: "结果公示", fulfilled: "已完结"
};
const ongoingCampaigns = ref([]);

const campaignStageLabel = (stage) => CAMPAIGN_STAGE_LABELS[stage] || stage;

const campaignWindow = (camp) => {
  const fmt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}.${d.getDate()}`;
  };
  const s = fmt(camp.startAt || camp.signupStartAt);
  const e = fmt(camp.endAt || camp.signupEndAt);
  if (!s && !e) return "";
  return `${s || "…"} - ${e || "…"}`;
};

const loadOngoingCampaigns = async () => {
  try {
    const res = await listActivityCampaigns({ limit: 12 });
    if (!res.ok) {
      ongoingCampaigns.value = [];
      return;
    }
    ongoingCampaigns.value = res.data.filter((camp) => ONGOING_STAGES.has(camp.stage));
    // 登录用户标记已报名
    const uid = authStore.userInfo?.id;
    if (uid && ongoingCampaigns.value.length) {
      await Promise.all(ongoingCampaigns.value.map(async (camp) => {
        const mine = await getMyCampaignEntries(camp.id, uid);
        camp.signedUp = mine.ok && mine.data.some((entry) => entry.kind === "signup");
      }));
    }
  } catch {
    ongoingCampaigns.value = [];
  }
};

const signupCampaign = async (camp) => {
  const uid = authStore.userInfo?.id;
  if (!authStore.isLoggedIn || !uid) {
    showIsland.notify({ title: "请先登录", message: "登录后即可报名活动", icon: "info" });
    return;
  }
  if (camp.signingUp || camp.signedUp) return;
  camp.signingUp = true;
  try {
    const res = await signupCampaignEntry(camp.id, uid);
    if (!res.ok) {
      const duplicated = String(res.error?.code || "") === "23505";
      showIsland.notify({
        title: duplicated ? "你已报名过啦" : "报名失败",
        message: duplicated ? "无需重复报名" : (res.error?.message || "请稍后重试"),
        icon: duplicated ? "info" : "warning"
      });
      if (duplicated) camp.signedUp = true;
      return;
    }
    camp.signedUp = true;
    showIsland.notify({ title: "报名成功", message: `已在「${camp.title}」为你登记`, icon: "success" });
  } finally {
    camp.signingUp = false;
  }
};

const activities = ref([]);
const loading = ref(true);
// 详情灵动岛：详情以导航栏延伸卡呈现（替代原页面内模态框）
let detailIsland = null;

const openDetail = (activity) => {
  if (!activity) return;
  detailIsland?.close();
  detailIsland = showIsland.custom(ContentDetailIsland, {
    type: "activity",
    title: String(activity.title || ""),
    meta: String(activity.date || ""),
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
  loading.value = true;
  await initActivities();
  activities.value = getAllActivities();
  loading.value = false;
};

onMounted(async () => {
  document.body.classList.add("is-loaded");
  await loadActivities();
  loadOngoingCampaigns();
});

onBeforeUnmount(() => {
  // 详情岛随页面卸载（showIsland.custom 约定：宿主必须负责 close）
  detailIsland?.close();
  detailIsland = null;
});
</script>

<style scoped>
/* 页头：标题 + 管理员投稿按钮 */
.activities-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.activity-admin-publish-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
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


/* 加载状态容器 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 20px;
  min-height: 400px;
  grid-column: 1 / -1;
  width: 100%;
}

.loading-spinner {
  width: 60px;
  height: 60px;
  border: 4px solid #f5f5f7;
  border-top: 4px solid #1d1d1f;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  margin-top: 24px;
  font-size: 16px;
  color: #86868b;
  font-weight: 500;
}

.activity-card-skeleton {
  cursor: default;
  pointer-events: none;
}

.activity-skeleton-block,
.activity-skeleton-image {
  position: relative;
  overflow: hidden;
  background: #edf0f4;
}

.activity-skeleton-block::after,
.activity-skeleton-image::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.78), transparent);
  animation: activitySkeletonShimmer 1.35s ease-in-out infinite;
}

.activity-skeleton-image {
  width: 100%;
  height: 280px;
}

.activity-skeleton-date {
  position: absolute;
  right: 24px;
  bottom: 24px;
  width: 112px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
}

.activity-skeleton-title {
  width: 76%;
  height: 28px;
  border-radius: 12px;
  margin-bottom: 18px;
}

.activity-skeleton-line {
  width: 68%;
  height: 15px;
  border-radius: 999px;
  margin-top: 12px;
}

.activity-skeleton-line.wide {
  width: 100%;
}

@keyframes activitySkeletonShimmer {
  100% {
    transform: translateX(100%);
  }
}

/* 页面基础样式 */
.activities-list-page {
  width: 100%;
  background: #ffffff;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  min-height: 100vh;
  color: #1d1d1f;
}

.activities-header {
  text-align: center;
  padding: 160px 20px 100px;
  max-width: 1000px;
  margin: 0 auto;
}

.page-title-text {
  font-size: 72px;
  font-weight: 800;
  margin-bottom: 24px;
  letter-spacing: -0.03em;
  color: #1d1d1f;
  line-height: 1.05;
}

.page-subtitle-text {
  font-size: 24px;
  color: #86868b;
  font-weight: 400;
  line-height: 1.4;
  max-width: 600px;
  margin: 0 auto;
}

.activities-container {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 48px;
  padding: 0 40px 160px;
}

/* 活动卡片（液态玻璃外观由全局 .liquid-glass 提供） */
.activity-card {
  border-radius: 32px;
  overflow: hidden;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.04);
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  height: 100%;
  cursor: pointer;
}

.activity-card.activity-card-skeleton {
  cursor: default;
  pointer-events: none;
}

.activity-card:hover {
  transform: translateY(-12px);
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.12);
}

.activity-card-image {
  width: 100%;
  height: 280px;
  position: relative;
  overflow: hidden;
  background-color: #f5f5f7;
}

.activity-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.activity-card:hover .activity-image {
  transform: scale(1.08);
}

.activity-date-badge {
  position: absolute;
  top: 24px;
  left: 24px;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: var(--liquid-filter-sm);
  color: #1d1d1f;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  letter-spacing: -0.01em;
}

.activity-card-content {
  padding: 40px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.activity-title {
  font-size: 24px;
  font-weight: 800;
  color: #1d1d1f;
  margin-bottom: 16px;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.activity-description {
  font-size: 16px;
  color: #86868b;
  line-height: 1.7;
  flex: 1;
  margin-bottom: 16px;
}

.activity-description.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-hint {
  font-size: 13px;
  color: #aeaeaf;
  font-weight: 500;
}
/* ===== 响应式 ===== */
@media (max-width: 1200px) {
  .activities-container {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 32px;
  }
}

@media (max-width: 768px) {
  .activities-header {
    padding: 100px 20px 40px;
  }

  .page-title-text {
    font-size: 36px;
    margin-bottom: 16px;
  }

  .page-subtitle-text {
    font-size: 16px;
  }

  .activities-container {
    grid-template-columns: 1fr;
    gap: 32px;
    padding: 0 20px 80px;
  }

  .activity-card-content {
    padding: 24px;
  }

  .activity-card-image {
    height: 240px;
  }}

/* ========== 进行中活动（campaigns，BETA 6 P1-3） ========== */
.campaign-section {
  margin: 0 0 30px;
  padding: 22px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%));
  border: 1px solid rgba(0, 113, 227, 0.14);
  box-shadow: 0 10px 34px rgba(0, 113, 227, 0.08);
}
.campaign-section-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}
.campaign-section-title {
  font-size: 19px;
  font-weight: 700;
  color: #1d1d1f;
  margin: 0;
}
.campaign-section-hint {
  font-size: 12px;
  color: #86868b;
}
.campaign-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 14px;
}
.campaign-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
}
.campaign-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.campaign-stage-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #0071e3;
  background: rgba(0, 113, 227, 0.1);
}
.campaign-stage-chip[data-stage="judging"] { color: #854f0b; background: rgba(250, 238, 218, 0.9); }
.campaign-stage-chip[data-stage="result"] { color: #3b6d11; background: rgba(234, 243, 222, 0.9); }
.campaign-window { font-size: 12px; color: #86868b; font-variant-numeric: tabular-nums; }
.campaign-title { margin: 0; font-size: 16px; font-weight: 700; color: #1d1d1f; }
.campaign-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #515154;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.campaign-signup-btn {
  margin-top: auto;
  height: 36px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: #ffffff;
  background: #0071e3;
  cursor: pointer;
  transition: transform 0.16s ease, background-color 0.16s ease, opacity 0.16s ease;
}
.campaign-signup-btn:hover:not(:disabled) { background: #0077ed; transform: translateY(-1px); }
.campaign-signup-btn:active:not(:disabled) { transform: scale(0.97); }
.campaign-signup-btn:disabled { opacity: 0.55; cursor: default; }

html[data-theme="dark"] .campaign-section {
  background: rgba(28, 28, 30, 0.62);
  border-color: rgba(10, 132, 255, 0.22);
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.35);
}
html[data-theme="dark"] .campaign-card { background: rgba(44, 44, 46, 0.72); }
html[data-theme="dark"] .campaign-section-title { color: #f5f5f7; }
html[data-theme="dark"] .campaign-section-hint,
html[data-theme="dark"] .campaign-window { color: #98989d; }
html[data-theme="dark"] .campaign-title { color: #f5f5f7; }
html[data-theme="dark"] .campaign-desc { color: #a1a1a6; }
html[data-theme="dark"] .campaign-stage-chip { color: #6cb2ff; background: rgba(10, 132, 255, 0.16); }
html[data-theme="dark"] .campaign-stage-chip[data-stage="judging"] { color: #ffd60a; background: rgba(255, 214, 10, 0.12); }
html[data-theme="dark"] .campaign-stage-chip[data-stage="result"] { color: #32d74b; background: rgba(50, 215, 75, 0.12); }
html[data-theme="dark"] .campaign-signup-btn { background: #0a84ff; }

</style>
