<template>
  <div class="forum-section-shell" :class="{ 'feed-switching': feedSwitchPulse }">
    <SegmentTabs :sections="FORUM_SECTION_ITEMS" :model-value="section" aria-label="方块分区"
      @update:model-value="selectSection" />

    <!-- 最新/关注/新闻/活动：ForumMain 承载（embedded），KeepAlive 保住滚动与已加载列表 -->
    <div v-show="isFeedSection" class="forum-section-feed">
      <KeepAlive>
        <AsyncForum v-if="isFeedSection" ref="forumViewRef" :show-navbar="false" :show-header="false"
          :embedded="true" :external-feed="externalFeed" @island-message="emit('island-message', $event)" />
      </KeepAlive>
    </div>

    <!-- 官方：首次切到才挂载（slot 由页面注入，内含异步加载的英雄区舞台） -->
    <div v-if="officialVisited" v-show="section === 'official'" class="forum-section-official">
      <slot name="official" />
    </div>

    <!-- 成员 / 印象：独立面板，切走即卸载（与改版前 UserSpace 行为一致） -->
    <AsyncCommunity v-if="section === 'members'" @switch-tab="emit('switch-tab', $event)"
      @open-follow-modal="(user, type) => emit('open-follow-modal', user, type)" />

    <div v-else-if="section === 'impressions'" class="forum-section-impressions">
      <ProfileImpressionsPanel :show-back="false" :is-impressions-loading="impressionsLoading"
        :impressions="profileImpressions" :has-more="impressionsHasMore" :is-loading-more="isLoadingMoreImpressions"
        @delete-impression="handleDeleteImpression" @load-more-impressions="loadMoreImpressions" />
    </div>

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />
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
     · 印象              → ProfileImpressionsPanel（数据层随本组件自持缓存/取消）

   过渡动画复用既有的 userspace-tab-in/out 体系（由外层页面提供类名）。 */
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import SegmentTabs from './SegmentTabs.vue';
import ProfileImpressionsPanel from './ProfileImpressionsPanel.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import { AsyncCommunity, AsyncForum } from '../async-loaders.js';
import { createMemoryTtlCache } from '../composables/useMemoryTtlCache.js';
import { deleteUserImpression, getUserImpressions } from '@/utils/api/profile-api.js';
import { useAuthStore } from '@/stores/auth';
import { logger } from '@/utils/logger.js';
import {
  FORUM_DEFAULT_SECTION,
  FORUM_SECTION_ITEMS,
  isForumFeedSection,
  resolveExternalFeed,
  resolveForumSection
} from '@/config/forum-sections';

const props = defineProps({
  /** 当前分区（v-model:section） */
  section: { type: String, default: FORUM_DEFAULT_SECTION }
});

const emit = defineEmits(['update:section', 'island-message', 'switch-tab', 'open-follow-modal', 'section-change']);

const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);

const section = computed(() => resolveForumSection(props.section));
const isFeedSection = computed(() => isForumFeedSection(section.value));
const externalFeed = computed(() => resolveExternalFeed(section.value));

const forumViewRef = ref(null);
// 官方分区惰性挂载：访问过才渲染插槽（英雄区渲染层因此不进首屏）
const officialVisited = ref(false);

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
// 印象面板数据层（自持缓存 / 取消 / 分页）
// ============================================
const IMPRESSIONS_PAGE_SIZE = 30;
const USERSPACE_CACHE_TTL_IMPRESSIONS = 60 * 1000;

const impressionsCache = createMemoryTtlCache();
const profileImpressions = shallowRef([]);
const impressionsLoading = ref(false);
const impressionsHasMore = ref(false);
const isLoadingMoreImpressions = ref(false);
const impressionsPage = ref(1);
let lastImpressionsFetchAt = 0;
let impressionsFetchToken = 0;
let impressionsAbortController = null;

const alertState = reactive({ visible: false, type: 'info', title: '', message: '' });
const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const impressionsCacheKey = (userId) => `profile-impressions:${userId}`;

const abortImpressions = () => {
  if (impressionsAbortController) {
    impressionsAbortController.abort();
    impressionsAbortController = null;
  }
};

const fetchImpressions = async ({ force = false, loadMore = false } = {}) => {
  const userId = String(userInfo.value?.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    profileImpressions.value = [];
    impressionsHasMore.value = false;
    return;
  }

  const cacheKey = impressionsCacheKey(userId);
  const now = Date.now();

  // 「加载更多」：追加下一页，不读缓存、不受节流限制
  if (loadMore) {
    if (isLoadingMoreImpressions.value || !impressionsHasMore.value) return;
    const loadMoreToken = ++impressionsFetchToken;
    abortImpressions();
    impressionsAbortController = new AbortController();
    const { signal } = impressionsAbortController;
    isLoadingMoreImpressions.value = true;
    try {
      const nextPage = impressionsPage.value + 1;
      const { data, error } = await getUserImpressions(userId, {
        signal,
        page: nextPage,
        pageSize: IMPRESSIONS_PAGE_SIZE
      });
      if (loadMoreToken !== impressionsFetchToken || signal.aborted) return;
      if (error) {
        logger.warn('forum-section-shell', '加载更多印象失败:', error);
        return;
      }
      const rows = data || [];
      impressionsPage.value = nextPage;
      profileImpressions.value = [...profileImpressions.value, ...rows];
      impressionsHasMore.value = rows.length >= IMPRESSIONS_PAGE_SIZE;
    } catch (error) {
      if (error.name !== 'AbortError') logger.warn('forum-section-shell', '加载更多印象异常:', error);
    } finally {
      if (loadMoreToken === impressionsFetchToken) isLoadingMoreImpressions.value = false;
    }
    return;
  }

  // 5s 内重复进入不重复取数：先吃内存缓存（与改版前 lastFetchTime 节流同口径）
  if (!force && now - lastImpressionsFetchAt < 5000) {
    const cached = impressionsCache.get(cacheKey, USERSPACE_CACHE_TTL_IMPRESSIONS);
    if (cached) {
      profileImpressions.value = cached;
      impressionsHasMore.value = cached.length >= IMPRESSIONS_PAGE_SIZE;
      impressionsLoading.value = false;
      return;
    }
  }

  if (!force) {
    const cached = impressionsCache.get(cacheKey, USERSPACE_CACHE_TTL_IMPRESSIONS);
    if (cached) {
      profileImpressions.value = cached;
      impressionsHasMore.value = cached.length >= IMPRESSIONS_PAGE_SIZE;
      impressionsLoading.value = false;
      return;
    }
  }

  const fetchToken = ++impressionsFetchToken;
  abortImpressions();
  impressionsAbortController = new AbortController();
  const { signal } = impressionsAbortController;
  impressionsLoading.value = true;
  try {
    const { data, error } = await getUserImpressions(userId, {
      signal,
      page: 1,
      pageSize: IMPRESSIONS_PAGE_SIZE
    });
    if (fetchToken !== impressionsFetchToken || signal.aborted) return;
    if (error) {
      logger.warn('forum-section-shell', '读取我的印象失败:', error);
      profileImpressions.value = [];
      return;
    }
    const rows = data || [];
    profileImpressions.value = rows;
    impressionsPage.value = 1;
    impressionsHasMore.value = rows.length >= IMPRESSIONS_PAGE_SIZE;
    impressionsCache.set(cacheKey, rows);
    lastImpressionsFetchAt = now;
  } catch (error) {
    if (error.name === 'AbortError') return;
    logger.warn('forum-section-shell', '读取我的印象异常:', error);
    profileImpressions.value = [];
  } finally {
    if (fetchToken === impressionsFetchToken) impressionsLoading.value = false;
  }
};

const loadMoreImpressions = () => {
  void fetchImpressions({ loadMore: true });
};

const handleDeleteImpression = async (impressionId) => {
  const userId = String(userInfo.value?.id || '').trim();
  if (!userId) {
    showAlert('error', '删除失败', '当前登录状态异常，请刷新后重试');
    return;
  }
  try {
    const { error } = await deleteUserImpression(impressionId, userId);
    if (error) {
      showAlert('error', '删除失败', error.message || '请稍后重试');
      return;
    }
    profileImpressions.value = profileImpressions.value.filter((imp) => imp.id !== impressionId);
    impressionsCache.set(impressionsCacheKey(userId), profileImpressions.value);
    showAlert('success', '删除成功', '该印象已被移除');
  } catch (error) {
    logger.warn('forum-section-shell', '删除我的印象异常:', error);
    showAlert('error', '删除失败', '网络错误');
  }
};

// ============================================
// 分区副作用（必须放在数据层之后：immediate 会立即求值）
// ============================================
const selectSection = (next) => {
  const target = resolveForumSection(next);
  if (target === section.value) return;
  emit('update:section', target);
};

watch(section, (next) => {
  if (next === 'official') officialVisited.value = true;
  if (next === 'impressions') void fetchImpressions();
  if (isForumFeedSection(next)) pulseFeed();
  emit('section-change', next);
}, { immediate: true });

/** 供外层使用的嵌入论坛入口（ForumMain 通过 defineExpose 暴露这些方法） */
const callForumView = (method) => {
  const view = forumViewRef.value;
  if (!view || typeof view[method] !== 'function') return false;
  view[method]();
  return true;
};

defineExpose({
  refreshEmbeddedScroll: () => forumViewRef.value?.refreshEmbeddedScroll?.(),
  reloadImpressions: (options) => fetchImpressions(options),
  openComposer: () => callForumView('openComposer'),
  focusSearch: () => callForumView('focusSearch'),
  // closeComposer 是异步的（有改动内容时要先弹「保存草稿」确认），故单独转发
  closeComposer: () => {
    const view = forumViewRef.value;
    if (!view || typeof view.closeComposer !== 'function') return Promise.resolve();
    return view.closeComposer();
  }
});

onBeforeUnmount(() => {
  if (feedPulseTimer) {
    clearTimeout(feedPulseTimer);
    feedPulseTimer = null;
  }
  abortImpressions();
});
</script>

<style scoped>
.forum-section-shell {
  width: 100%;
}

.forum-section-feed,
.forum-section-official,
.forum-section-impressions {
  width: 100%;
}

/* 分区切换轻淡入脉冲（原 UserSpace 社区壳同款） */
.forum-section-shell.feed-switching .forum-section-feed {
  animation: forumSectionFeedPulse 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes forumSectionFeedPulse {
  from { opacity: 0.72; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .forum-section-shell.feed-switching .forum-section-feed {
    animation: none;
  }
}
</style>
