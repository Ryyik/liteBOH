<template>
  <div class="activities-list-page">
    <!-- 页头（2026-10-20 内容页合并后：默认不再渲染 —— 页头由宿主 Newsroom 统一提供。
         保留 showHeader 开关是为了「将来若还有独立活动页」时能一处复用，而不是再抄一份页头。） -->
    <header v-if="showHeader" class="activities-header">
      <div class="activities-header-copy">
        <p class="page-kicker">方块之家 · BOH EVENTS</p>
        <h1 class="page-title-text">活动列表</h1>
        <p class="page-subtitle-text">报名中的活动在最上方，往期活动按月份回看</p>
      </div>
      <button
        v-if="isAdmin"
        type="button"
        class="activity-admin-publish-btn"
        @click="showPublishModal = true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>投稿活动</span>
      </button>
    </header>

    <!-- ① 顶部活动报名卡（数据源 activity_campaigns，与下方历史区互不相干） -->
    <ActivitySignupSection
      v-if="showCampaigns"
      :campaigns="campaigns"
      :loading="campaignLoading"
      :is-logged-in="authStore.isLoggedIn"
      @signup="signupCampaign"
    />

    <!-- ② 按月份分组的历史活动，每月一条横向滚动轨道 -->
    <div v-if="showPast" class="activities-timeline">
      <div v-if="activitiesLoading" class="activities-skeleton" aria-hidden="true">
        <div v-for="n in 3" :key="`sk-${n}`" class="activities-skeleton__group">
          <div class="activities-skeleton__head"></div>
          <div class="activities-skeleton__card"></div>
        </div>
      </div>

      <template v-else-if="visibleGroups.length || visibleUndated.length">
        <ActivityMonthRail
          v-for="group in visibleGroups"
          :key="group.monthKey"
          :month-label="group.monthLabel"
          :month-key="group.monthKey"
          :items="group.items"
          @open="openDetail"
        />
        <!-- 日期无法解析的记录不丢弃，单独成组垫底 -->
        <ActivityMonthRail
          v-if="visibleUndated.length"
          month-label="未排期"
          month-key="undated"
          :items="visibleUndated"
          @open="openDetail"
        />
      </template>

      <EmptyState
        v-else
        variant="inbox"
        :title="searchQuery ? '没有匹配的活动' : '还没有活动记录'"
        :description="searchQuery ? '换个关键词试试。' : '往期活动会按月份归档在这里。'"
      />
    </div>

    <!-- 管理员投稿活动（可选「新建报名活动」或「新建活动」）
         2026-10-20 合并后按钮可能在宿主页头（Newsroom），但弹窗与发布链路只有这一处：
         宿主通过 ref 调 openPublish()，别在宿主里再写第二份。 -->
    <AdminContentPublishModal
      :visible="showPublishModal"
      type="activity"
      @close="showPublishModal = false"
      @published="onPublished"
    />
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { resolveDbDetailImage } from '@/utils/db-image-url.js';
import { formatActivityDate } from '@/utils/activity-date.js';
import {
  groupedActivities,
  undatedActivities,
  initActivities,
  loading as activitiesLoading,
} from '@/composables/useActivities';
import { useCampaigns } from '@/composables/useCampaigns.js';
import { useAuthStore } from '@/stores/auth';
import AdminContentPublishModal from '@/components/AdminContentPublishModal.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ContentDetailIsland from '@/components/UnifiedNavbar/ContentDetailIsland.vue';
import { showIsland } from '@/composables/useIsland.js';
import ActivitySignupSection from './components/ActivitySignupSection.vue';
import ActivityMonthRail from './components/ActivityMonthRail.vue';

const props = defineProps({
  /** 是否渲染自身页头。2026-10-20 起宿主 Newsroom 统一提供页头 ⇒ 默认 false */
  showHeader: { type: Boolean, default: false },
  /** 筛选值域：all | campaign（只看报名中）| past（只看往期） */
  filter: { type: String, default: 'all' },
  /** 搜索词（筛选往期标题/描述；报名卡不参与搜索） */
  searchQuery: { type: String, default: '' },
});

const authStore = useAuthStore();
const { isAdmin } = storeToRefs(authStore);
const showPublishModal = ref(false);
const remountWallIsland = inject('remountWallIsland', null);

/** 供宿主页头的「投稿活动」按钮调用（发布链路只有本组件这一份） */
const openPublish = () => {
  showPublishModal.value = true;
};
defineExpose({ openPublish });

// ===== 报名区（activity_campaigns）=====
const {
  campaigns,
  loading: campaignLoading,
  loadOngoingCampaigns,
  signupCampaign,
} = useCampaigns();

// ===== 历史活动（activities，按月分组）=====
const groups = computed(() => groupedActivities.value);
const undated = computed(() => undatedActivities.value);

// ===== 两段的可见性由 filter 决定（filter 真源在宿主，经 query 派生）=====
const showCampaigns = computed(() => props.filter !== 'past');
const showPast = computed(() => props.filter !== 'campaign');

// 搜索与筛选叠加：搜索只作用于往期（报名卡是「有就显示」的一整块，无法逐条过滤）
const matchesQuery = (activity) => {
  const q = String(props.searchQuery || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  return [activity?.title, activity?.description, activity?.location]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(q));
};

const visibleGroups = computed(() =>
  groups.value
    .map((group) => ({ ...group, items: group.items.filter(matchesQuery) }))
    .filter((group) => group.items.length),
);
const visibleUndated = computed(() => undated.value.filter(matchesQuery));

// 详情灵动岛：详情以导航栏延伸卡呈现（替代页面内模态框）
let detailIsland = null;

const openDetail = (activity) => {
  if (!activity) return;
  detailIsland?.close();
  detailIsland = showIsland.custom(ContentDetailIsland, {
    type: 'activity',
    title: String(activity.title || ''),
    // 详情卡走 formatActivityDate：缺「日」的记录显示「2025年10月」而不是原始 '2025/10'
    meta: formatActivityDate(activity.date),
    // 详情卡图与卡片图同源解析（Cloudinary 绝对地址需改写到自建 CDN，见 utils/db-image-url.js）
    image: resolveDbDetailImage(activity.image),
    paragraphs: String(activity.description || '')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean),
    onClose: () => {
      // × / Esc 都走这里：必须真正清掉岛槽位，仅置空句柄岛不会消失
      detailIsland?.close();
      detailIsland = null;
      // 详情卡占用了活动墙常驻岛的槽位，关闭后让宿主重挂载
      remountWallIsland?.();
    },
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

// 导航高度避让（2026-10-20 合并时收敛）：
// 本组件原先自己测一遍 --nav-h，而宿主 Newsroom 也测一遍 —— 同一件事测两遍。
// 现在由宿主（Newsroom 的 syncNavHeight）统一写 --nav-h，子面板一律读它；
// 仅当本组件脱离 Newsroom 独立挂载（showHeader=true，即未来若还有独立活动页）时才自测。
let navResizeObserver = null;
const syncNavHeight = () => {
  if (!props.showHeader) return;
  const nav = document.getElementById('unified-nav-container');
  const page = document.querySelector('.activities-list-page');
  if (!nav || !page) return;
  const h = nav.getBoundingClientRect().height;
  if (h > 0) page.style.setProperty('--nav-h', `${Math.ceil(h)}px`);
};

onMounted(async () => {
  syncNavHeight();
  if (props.showHeader) {
    const nav = document.getElementById('unified-nav-container');
    if (nav && typeof ResizeObserver !== 'undefined') {
      navResizeObserver = new ResizeObserver(syncNavHeight);
      navResizeObserver.observe(nav);
    }
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
.activities-header-copy {
  min-width: 0;
}
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
  transition:
    background-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}
.activity-admin-publish-btn:hover {
  color: #ffffff;
  background: #0071e3;
  transform: translateY(-1px);
}
.activity-admin-publish-btn:active {
  transform: scale(0.97);
}
html[data-theme='dark'] .activity-admin-publish-btn {
  color: #6cb2ff;
  background: rgba(28, 28, 30, 0.7);
  border-color: rgba(10, 132, 255, 0.45);
}
html[data-theme='dark'] .activity-admin-publish-btn:hover {
  color: #ffffff;
  background: #0a84ff;
}

/* 面板基础样式
   2026-10-20 合并：本组件现在是 Newsroom 里的**子面板**，不再是独立页面 ⇒
   · 去掉 `background: #ffffff` 与 `min-height: 100vh`（否则会在宿主页里刷出整屏白底、
     把 Newsroom 的页面背景盖掉）；
   · 不再自声明 `--nav-h`（由宿主统一写，见 script 里 syncNavHeight 的注释）；
   · 保留字体与文字色的兜底，因为它仍可能被别处单独引用。 */
.activities-list-page {
  width: 100%;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
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
.activities-skeleton__group {
  margin-bottom: 34px;
}

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
/* 背景色随 2026-10-20 合并一起去掉：宿主 Newsroom 已有自己的暗色底，
   子面板再刷一层 #0d0f14 会把宿主的底色盖掉。 */
html[data-theme='dark'] .activities-list-page {
  color: #f5f5f7;
}
html[data-theme='dark'] .page-kicker {
  color: #8d99a8;
}
html[data-theme='dark'] .page-title-text {
  color: #f5f5f7;
}
html[data-theme='dark'] .page-subtitle-text {
  color: #a1a1a6;
}
html[data-theme='dark'] .activities-skeleton__head,
html[data-theme='dark'] .activities-skeleton__card {
  background: #1a1e26;
}
</style>
