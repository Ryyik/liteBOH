<template>
  <div class="forum-section-shell" :class="{ 'feed-switching': feedSwitchPulse }">
    <!-- 分区页签行：左侧签到 + 中间「官方/最新/关注/资讯/成员」+ 右侧搜索
         （plans/052 追加拍板 16:43：签到与搜索**不再另起一行**，直接并进这一行） -->
    <SegmentTabs
      :sections="FORUM_SECTION_ITEMS"
      :model-value="section"
      aria-label="方块分区"
      @update:model-value="selectSection"
    >
      <template #actions-start>
        <button
          v-if="isLoggedIn"
          type="button"
          class="section-checkin"
          :class="{ 'is-done': weeklyCheckinStatus.hasSignedThisWeek }"
          :disabled="isWeeklyCheckinSubmitting"
          :title="weeklyCheckinStatus.hasSignedThisWeek ? '本周已签到（点击再看一遍）' : '每周签到'"
          @click="handleCheckinClick"
        >
          <span class="section-checkin-icon">
            <CalendarDays :size="15" :stroke-width="2" aria-hidden="true" />
          </span>
          <span>{{ weeklyCheckinStatus.hasSignedThisWeek ? '已签' : '签到' }}</span>
        </button>
      </template>
      <!-- 右侧：**整页搜索入口**（2026-11-26 21:45 用户线框图口径，恢复）
           线框：首屏「tab 区」最右一颗放大镜 → 点它进新的全屏搜索页
           （搜索页顶部搜索框 + 帖子/博莱克/资讯/周边/活动 分类 chips）。
           ⚠️ 这是嵌入论坛时**唯一**的搜索入口：竖屏下不再渲染下方那条搜索框
             （见 ForumToolbar 的 .is-embedded 档），否则同屏两个搜索框 = 同一个壳两份。
           跳转复用既有链路 focusSearch（→ ForumMain.focusForumSearch → /search），
           不在这里再写一份 router.push —— 那样两处跳转迟早分叉。 -->
      <template #actions-end>
        <button
          type="button"
          class="section-search"
          aria-label="搜索"
          title="搜索"
          @pointerenter="prefetchSearchPage"
          @pointerdown="prefetchSearchPage"
          @focus="prefetchSearchPage"
          @click="openFullSearch"
        >
          <Search :size="17" :stroke-width="2.2" aria-hidden="true" />
        </button>
      </template>
    </SegmentTabs>

    <!-- 签到成功舞台：卡面 3D 旋转 + 极简到账提示。
         v-if 而不是 v-show —— 组件挂载即起播，资源就绪的判断在派发前已完成 -->
    <Teleport to="body">
      <CheckinRewardStage
        v-if="checkinReward.open"
        :points-after="checkinReward.pointsAfter"
        :award-amount="checkinReward.awardAmount"
        :already-signed="checkinReward.alreadySigned"
        :assets-ready="checkinReward.assetsReady"
        :username="userInfo?.username || '未命名用户'"
        :skin="userInfo?.pointsCardSkin || 'blank'"
        :image-url="userInfo?.pointsCardImageUrl || ''"
        @dismiss="closeCheckinReward"
      />
    </Teleport>

    <!-- 最新/关注/新闻/活动：ForumMain 承载（embedded），KeepAlive 保住滚动与已加载列表 -->
    <div v-show="isFeedSection" class="forum-section-feed">
      <KeepAlive>
        <AsyncForum
          v-if="isFeedSection"
          ref="forumViewRef"
          :show-navbar="false"
          :show-header="false"
          :embedded="true"
          :external-feed="externalFeed"
          :has-signed-this-week="weeklyCheckinStatus.hasSignedThisWeek"
          @island-message="emit('island-message', $event)"
          @composer-state="emit('composer-state', $event)"
          @open-weekly-checkin="handleCheckinClick"
        >
          <template v-if="forumTopCards.length" #top-cards>
            <ForumTopCards
              :cards="forumTopCards"
              :checkin-submitting="isWeeklyCheckinSubmitting"
              @checkin="handleCheckinClick"
              @dismiss="dismissForumTopCard"
            />
          </template>
        </AsyncForum>
      </KeepAlive>
    </div>

    <!-- 官方：首次切到才挂载（slot 由页面注入，内含异步加载的英雄区舞台） -->
    <div v-if="officialVisited" v-show="section === 'official'" class="forum-section-official">
      <slot name="official" />
    </div>

    <!-- 成员：独立面板，切走即卸载（与改版前 UserSpace 行为一致）
         ⚠️ 印象席已于 2026-10-01 移出论坛（plans/022 §4.5）——
         它现在是「我」页的第三个分段，见 components/ProfileImpressionsSection.vue。
         不要在这里把它加回来：那会让「印象」重新变成两个入口、两份数据层。 -->
    <AsyncCommunity
      v-if="section === 'members'"
      @switch-tab="emit('switch-tab', $event)"
      @open-follow-modal="(user, type) => emit('open-follow-modal', user, type)"
    />
  </div>
</template>

<script setup>
/* 方块（论坛）分区壳 —— 归属 UserSpace，2026-09-23 起由两处共用：
     · views/user-center/UserSpace/UserSpaceMain.vue（底栏「方块」分区）
     · views/Home/index.vue（首页 `/` 街景 Hero 下滑直达的论坛）
   单源：分区定义来自 @/config/forum-sections，不再各写一份。
   七席 = 官方 / 最新 / 关注 / 新闻 / 活动 / 成员 / 印象，官方居首但默认落点仍是「最新」。

   承载分流：
     · 最新/关注/新闻/活动 → AsyncForum（ForumMain，embedded，30s 轮询原样）
     · 官方              → #official 插槽（页面注入惰性加载的英雄区舞台）
     · 成员              → AsyncCommunity（CommunityTab）
     · 印象              → **已移出**（2026-10-01），现为「我」页第三分段，
                           见 components/ProfileImpressionsSection.vue

   过渡动画复用既有的 userspace-tab-in/out 体系（由外层页面提供类名）。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { CalendarDays, Search } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { useWeeklyCheckin } from '@/views/Forum/composables/useWeeklyCheckin.js';
import { useForumTopCards } from '@/views/Forum/composables/useForumTopCards.js';
import CheckinRewardStage from '@/views/Forum/components/CheckinRewardStage.vue';
import ForumTopCards from '@/views/Forum/components/ForumTopCards.vue';
import SegmentTabs from './SegmentTabs.vue';
import { AsyncCommunity, AsyncForum } from '../async-loaders.js';
import {
  FORUM_DEFAULT_SECTION,
  FORUM_SECTION_ITEMS,
  isForumFeedSection,
  resolveExternalFeed,
  resolveForumSection,
} from '@/config/forum-sections';
import { prefetchForumFirstPage } from '@/views/Forum/forum-feed-prefetch.js';

const props = defineProps({
  /** 当前分区（v-model:section） */
  section: { type: String, default: FORUM_DEFAULT_SECTION },
});

const emit = defineEmits([
  'update:section',
  'island-message',
  // 发布会话开关（ForumMain 的 isMobileComposerOpen → 外层左栏用）
  'composer-state',
  'switch-tab',
  'open-follow-modal',
  'section-change',
]);

const section = computed(() => resolveForumSection(props.section));
const isFeedSection = computed(() => isForumFeedSection(section.value));
const externalFeed = computed(() => resolveExternalFeed(section.value));

const authStore = useAuthStore();
const router = useRouter();
const { isLoggedIn } = storeToRefs(authStore);
const userInfo = computed(() => authStore.userInfo);

/* 周签到：**全站唯一实例就在这一处**（composable 与 ForumMain 曾用的那份同源，
   事故纪律见其头注释）。两处 UI 共用它：
     · 分区 tab 行左侧「签到」按钮（本文件模板）
     · ForumMain 工具栏里的签到入口（经 props 拿状态、经 emit 把点击转回来）
   ⚠️ 不要在 ForumMain 里再 useWeeklyCheckin() 一次：两层各持一份 ref 会出现
   「shell 显示已签、工具栏还显示签到」的双状态（2026-11-26）。
   失败提示走「弹给论坛宿主」的既有通道（island-message → 外层弹层）。 */
const {
  weeklyCheckinStatus,
  isWeeklyCheckinLoading,
  isWeeklyCheckinSubmitting,
  checkinReward,
  closeCheckinReward,
  handleCheckinClick,
} = useWeeklyCheckin({
  onSyncProfile: (payload) => {
    window.dispatchEvent(
      new CustomEvent('boh_profile_sync', {
        detail: { ...payload, reason: payload?.reason || 'forum_update', at: Date.now() },
      }),
    );
  },
  onError: (title, message) => {
    emit('island-message', { type: 'error', title, message });
  },
});

const { cards: forumTopCards, dismiss: dismissForumTopCard } = useForumTopCards({
  section,
  isLoggedIn,
  weeklyCheckinStatus,
  isWeeklyCheckinLoading,
});

const forumViewRef = ref(null);
// 官方分区惰性挂载：访问过才渲染插槽（英雄区渲染层因此不进首屏）
const officialVisited = ref(false);

/* 首屏 feed 预发（A1，2026-11-16）：本壳是首页 `/` 与 user-space「方块」两个宿主的
   **共同父级**，在这里（setup 同步体）发，等于「宿主 chunk 一到就发」，比等
   AsyncForum chunk 下载 + 解析完、ForumMain 挂载之后才发，早一整段。
   实测第一条数据请求与 ForumMain chunk 完成只差 30–40ms ⇒ 提前的正是那段空窗。
   只在默认分区（最新）预发：关注 / 新闻 / 活动 / 影集会带不同筛选参数，key 不一致，
   预发等于白打一笔（`buildForumFeedParams` 的默认值只覆盖默认分区）。 */
if (section.value === FORUM_DEFAULT_SECTION) prefetchForumFirstPage();

// 最新/关注/新闻/活动互切：内容做一次轻淡入脉冲（配合页签弹性指示条）
const feedSwitchPulse = ref(false);
let feedPulseTimer = null;
const pulseFeed = () => {
  feedSwitchPulse.value = true;
  if (feedPulseTimer) clearTimeout(feedPulseTimer);
  feedPulseTimer = setTimeout(() => {
    feedSwitchPulse.value = false;
  }, 360);
};

// ============================================
// 分区副作用
// ============================================
const selectSection = (next) => {
  const target = resolveForumSection(next);
  if (target === section.value) return;
  emit('update:section', target);
};

watch(
  section,
  (next) => {
    if (next === 'official') officialVisited.value = true;
    if (isForumFeedSection(next)) pulseFeed();
    emit('section-change', next);
  },
  { immediate: true },
);

/** 供外层使用的嵌入论坛入口（ForumMain 通过 defineExpose 暴露这些方法） */
const callForumView = (method) => {
  const view = forumViewRef.value;
  if (!view || typeof view[method] !== 'function') return false;
  view[method]();
  return true;
};

/* 整页搜索入口：复用既有链路（ForumMain.focusForumSearch → router.push('/search')）。
   ⚠️ 不要在模板里直接 router.push('/search') —— 那会让「跳搜索页」出现第二处实现，
     将来改跳转目标（比如带上当前分区/关键词）就得改两个地方。 */
const openFullSearch = () => {
  if (callForumView('focusSearch')) return;
  router.push('/search');
};

const prefetchSearchPage = () => {
  void import('@/views/Search/SearchPage.vue').catch(() => {});
};

defineExpose({
  refreshEmbeddedScroll: () => forumViewRef.value?.refreshEmbeddedScroll?.(),
  openComposer: () => callForumView('openComposer'),
  focusSearch: () => callForumView('focusSearch'),
  // closeComposer 是异步的（有改动内容时要先弹「保存草稿」确认），故单独转发
  closeComposer: () => {
    const view = forumViewRef.value;
    if (!view || typeof view.closeComposer !== 'function') return Promise.resolve();
    return view.closeComposer();
  },
});

onBeforeUnmount(() => {
  if (feedPulseTimer) {
    clearTimeout(feedPulseTimer);
    feedPulseTimer = null;
  }
});
</script>

<style scoped>
.forum-section-shell {
  width: 100%;
}

/* 页签行两侧的动作按钮（签到 / 搜索）—— 与 051 极简语言一致：浅底胶囊，无边框 */
/* 整页搜索入口（2026-11-26 21:45）：页签行最右一颗圆形放大镜。
   与左侧 .section-checkin 同一基线、同一套颜色语言（appl-* token，不写裸色）。
   刻意**做成纯图标圆钮**而不是「图标 + 文字」：页签行已经有 5 个文字项，
    再来一个文字按钮会把这一行的视觉重心拉散；线框图里也是一颗孤立的放大镜。
   尺寸 32px 与签到钮同高，圆角 50% —— 与旁边 999px 胶囊、圆形按钮同类曲率，
    不会像 14px 那种卡片圆角一样「混进一堆胶囊里显眼」。 */
.section-search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--appl-text-2, #3a3a3c);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    transform 0.15s ease;
}

.section-search:hover {
  background: var(--appl-subtle, rgba(120, 120, 128, 0.1));
}

.section-search:active {
  transform: scale(0.94);
}

.section-checkin {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: var(--appl-subtle, rgba(120, 120, 128, 0.1));
  color: var(--appl-text-2, #3a3a3c);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.15s ease;
}

.section-checkin:hover:not(:disabled) {
  background: color-mix(
    in srgb,
    var(--appl-text-1, #1d1d1f) 8%,
    var(--appl-subtle, rgba(120, 120, 128, 0.1))
  );
}

.section-checkin:active:not(:disabled) {
  transform: scale(0.96);
}

.section-checkin:disabled {
  opacity: 0.6;
  cursor: wait;
}

.section-checkin.is-done {
  color: var(--appl-text-4, #86868b);
}

.section-checkin-icon {
  display: inline-flex;
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .section-checkin {
    gap: 0;
    padding: 0 10px;
    font-size: 12.5px;
  }

  .section-checkin-icon {
    display: none;
  }

  .forum-section-shell :deep(.segment-tabs) {
    gap: 12px;
  }
}

@media (max-width: 360px) {
  .section-checkin {
    padding: 0 7px;
  }

  .forum-section-shell :deep(.segment-tabs) {
    gap: 8px;
  }

  .forum-section-shell :deep(.segment-tabs-action.is-start) {
    left: 10px;
  }
}

.forum-section-feed,
.forum-section-official {
  width: 100%;
}

/* 分区切换轻淡入脉冲（原 UserSpace 社区壳同款） */
.forum-section-shell.feed-switching .forum-section-feed {
  animation: forumSectionFeedPulse 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes forumSectionFeedPulse {
  from {
    opacity: 0.72;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .forum-section-shell.feed-switching .forum-section-feed {
    animation: none;
  }
}
</style>
