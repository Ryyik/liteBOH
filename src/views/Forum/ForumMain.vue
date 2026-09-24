<script setup>
import { ref, shallowRef, computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, watch, triggerRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Check,
  Heart,
  MessageCircle,
  Reply,
  Share2,
  ArrowUpRight,
  BookOpen,
  Newspaper,
  X
} from 'lucide-vue-next';
import PostComposer from './components/PostComposer.vue';
import PostCard from './components/PostCard.vue';
import { resolveFrameForAuthor } from '@/composables/useAvatarFrame.js';
import ShareIsland from '@/components/UnifiedNavbar/ShareIsland.vue';
import AdSlot from './components/AdSlot.vue';
import ForumToolbar from './components/ForumToolbar.vue';
import ForumImageViewer from './components/ForumImageViewer.vue';
import WeeklyCheckinCalendar from './components/WeeklyCheckinCalendar.vue';
import { useForumPublishQueueStore } from '@/stores/forumPublishQueue.js';import { useForumImageModerationPreload } from './composables/useForumImageModerationPreload.js';
import { useForumPostDraftStorage } from './composables/useForumPostDraftStorage.js';
import { useForumVirtualFeed } from './composables/useForumVirtualFeed.js';
import { useActiveAds } from './composables/useActiveAds.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { getAvatarUrl } from '@/utils/avatar.js';
import { getImageUrl } from '@/utils/asset-helper.js';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader';
import { isForumLandscape, isForumPortraitComposer, onForumPortraitComposerChange } from '@/utils/forum-viewport.js';
import { isForumFeedSection } from '@/config/forum-sections';
import { openForumPost } from '@/composables/usePostDetailModal.js';

// Props
const props = defineProps({
  showHeader: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
  // 外部接管「最新/关注/新闻/活动」筛选（用户空间社区段控驱动）：非空时隐藏内部筛选钮并跟随
  externalFeed: { type: String, default: '' }
});
const emit = defineEmits(['island-message']);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const notificationStoreRef = ref(getNotificationStoreSync());
const currentUiStyle = ref('glass');
const currentTheme = ref(themeManager.getTheme());
const isAnniversaryMcTheme = computed(() => currentTheme.value === 'anniversary-mc');
const showAnniversaryBg = ref(false);
let anniversaryObserver = null;
const anniversaryForumStyle = computed(() => (isAnniversaryMcTheme.value && showAnniversaryBg.value)
  ? { '--forum-anniversary-image': `url(${anniversaryForumImage})` }
  : undefined);

const readActiveForumTheme = () => {
  if (typeof document === 'undefined') return themeManager.getTheme();
  const selectors = ['.forum-page', '.user-space-page', 'html'];
  for (const selector of selectors) {
    const theme = document.querySelector(selector)?.getAttribute('data-theme');
    if (isHomeCatTheme(theme)) return theme;
  }
  return themeManager.getTheme();
};

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

const setUnreadCount = async (count) => {
  const notificationStore = await ensureNotificationStore();
  notificationStore.setUnreadCount(count);
};

const refreshUnreadCount = async () => {
  const notificationStore = await ensureNotificationStore();
  await notificationStore.refreshUnreadCount();
};

import CommonAlertModal from '../../components/CommonAlertModal.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import {
  getPosts,
  createPost,
  deleteUploadedForumImage,
  getComments,
  createComment,
  toggleLike,
  createQuoteRepost,
  getUserPosts,
  deleteComment,
  getLatestForumWeeklyReport,
  getPostEngagementStats,
  getWeeklyCheckinStatus,
  submitWeeklyCheckin,
  claimPostPublishReward,
  getForumPostDraft,
  upsertForumPostDraft,
  deleteForumPostDraft,
  moderateForumImage,
  preloadForumImageModeration,
  getForumPostImages,
  fetchQuotedPostsByIds
} from '../../utils/api/forum-api.js';
import { uploadApprovedForumImageQueued } from '../../utils/api/forum-api.js';
import { showIsland } from '@/composables/useIsland.js';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';
import {
  compressImageFileToUploadLimit,
  formatImageFileSize,
  getImageCompressionPlan
} from '@/utils/image-compression.js';
import {
  clearForumReturnState,
  getForumReturnKeyFromQuery,
  readForumReturnState,
  saveForumReturnState
} from '@/utils/forum-return-state.js';
import {
  buildForumFeedSnapshotKey,
  clearForumFeedSnapshots,
  readForumFeedSnapshot,
  writeForumFeedSnapshot
} from '@/utils/forum-feed-cache.js';
import { buildReplyDraft, escapeHtml, resolveReplyUsername, calculateOptimisticLikeCount, restoreImageAtPosition, shouldFallbackReplyPreview, buildFallbackReplyPreviewOptions, getLikeErrorToast } from '@/utils/forum-helpers.js';
import { supabase } from '../../utils/supabase-client.js';
import { themeManager } from '@/utils/theme-manager.js';
import { getHomeCatAsset, getHomeCatTypeBySeed, isHomeCatTheme } from '@/utils/home-cat-theme.js';
import anniversaryForumImage from '@/assets/images/blockschool.webp';
import { addExperience, XP_REWARDS } from '../../utils/xp.js';
import DOMPurify from '@/utils/dompurify.js';
import { logger } from '@/utils/logger.js';
import { getFollowing } from '@/utils/api/profile-api.js';
import {
  FORUM_DETAIL_IMAGE_TRANSFORM,
  FORUM_LIST_IMAGE_TRANSFORM,
  FORUM_LIST_IMAGE_TRANSFORM_MD,
  FORUM_LIST_IMAGE_TRANSFORM_SM,
  FORUM_LIST_LQIP_TRANSFORM,
  FORUM_POST_DRAFT_PREFIX,
  FORUM_POST_DRAFT_VERSION_LIMIT,
  FORUM_POST_IMAGE_MAX_COUNT,
  FORUM_TAG_MAP,
  FORUM_TAG_OPTIONS,
  LIST_REPLY_PREVIEW_COUNT,
  POSTS_PER_PAGE,
  SEARCH_DEBOUNCE_MS,
  WEEKLY_CHECKIN_REWARD_POINTS,
  AUTO_SAVE_DRAFT_INTERVAL_MS
} from './forum-config.js';
import { getBohAIModelStatus } from '@/utils/bohai-model-client.js';

// 论坛数据
const forumData = shallowRef([]);
const isLoading = ref(true);
const isLoadingMore = ref(false);
const hasMoreData = ref(true);
const forumLoadError = ref('');
const currentPage = ref(1);
const nextPageCursor = ref('');
const viewMode = ref('all'); // 'all' | 'my'
const sortMode = ref('latest'); // 'latest' | 'hottest'
const searchQuery = ref('');
const searchKeyword = ref('');
const selectedTagFilter = ref('');
const selectedContentType = ref('');
const showFollowingOnly = ref(false);
const feedMode = ref('posts');
const highlightedPostIds = ref(new Set());
const likePulsePostIds = ref(new Set());
const replySuccessPostIds = ref(new Set());
const shareCopiedPostIds = ref(new Set());
const loadedForumImageKeys = ref(new Set());
const loadMoreSentinelRef = ref(null);
const uiAnimationTimers = new Map();
const forumWeeklyReport = ref(null);
const isWeeklyReportLoading = ref(false);
const isWeeklyReportOpen = ref(false);
const forumPageRef = ref(null);
const {
  clearForumImageModerationPreloadTask,
  scheduleForumImageModerationPreload
} = useForumImageModerationPreload(preloadForumImageModeration);

// 批量预取帖子作者的订阅等级：把原先 PostCard 挂载时各自发起的单发
// get_user_subscription_tier RPC 合并为一次 get_user_subscription_tiers 批量请求。
// useUserTier 内部预注册 in-flight，PostCard 并发的 fetchUserTier 会命中而不再发 RPC。
const { fetchUserTiersBatch: prefetchPostAuthorTiers } = useUserTier();
const prefetchAuthorTiersFor = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return;
  const authorIds = [...new Set(rows.map((p) => p?.author_id).filter(Boolean))];
  if (authorIds.length) void prefetchPostAuthorTiers(authorIds);
};

const normalizeForumTagValue = (tag = '') => {
  const safeTag = String(tag || '').trim().toLowerCase();
  return FORUM_TAG_MAP[safeTag] ? safeTag : '';
};
const getForumTagLabel = (tag = '') => FORUM_TAG_MAP[normalizeForumTagValue(tag)]?.label || '';
const normalizeForumSortMode = (mode = '', fallback = 'latest') => {
  const safeMode = String(mode || '').trim().toLowerCase();
  return ['latest', 'hottest'].includes(safeMode) ? safeMode : fallback;
};
const getQueryString = (value) => String(Array.isArray(value) ? value[0] || '' : value || '').trim();
const getForumReturnKey = () => getForumReturnKeyFromQuery(route.query, props.embedded ? 'user-space' : 'forum');
const isHistoryReturnFromPostDetail = () => {
  if (typeof window === 'undefined') return false;
  const forwardPath = getQueryString(window.history.state?.forward);
  return forwardPath.startsWith('/forum/post/');
};
const shouldRestoreForumReturnState = () => {
  if (getQueryString(route.query.restore) === '1') return true;
  if (!isHistoryReturnFromPostDetail()) return false;
  return Boolean(readForumReturnState(getForumReturnKey()));
};
const getForumScrollContainer = () => {
  if (typeof window === 'undefined') return null;
  if (!props.embedded) return window;
  const tabPage = forumPageRef.value?.closest?.('.tab-page.posts-tab');
  if (!tabPage) return window;

  // Phones use document scrolling because nested viewport-height scrollers are
  // unreliable in WebKit. IntersectionObserver must use the same scroll root.
  const overflowY = window.getComputedStyle(tabPage).overflowY;
  return ['auto', 'scroll', 'overlay'].includes(overflowY) ? tabPage : window;
};
const {
  activeForumWindowIndex,
  shouldVirtualizeForumFeed,
  visibleForumPosts,
  virtualFeedTopSpacerHeight,
  virtualFeedBottomSpacerHeight,
  getVisiblePostIndex,
  setupForumLoadMoreObserver,
  setupForumWindowObserver,
  setupForumWindowObserverOnce,
  cleanupForumLoadMoreObserver,
  cleanupForumWindowObserver,
  stop: stopForumVirtualFeed
} = useForumVirtualFeed({
  feedMode,
  forumData,
  forumPageRef,
  loadMoreSentinelRef,
  isLoading,
  isLoadingMore,
  hasMoreData,
  getScrollContainer: getForumScrollContainer,
  onLoadMore: () => fetchForumData(true)
});

// ===== 广告：列表信息流（当前落地订阅计划广告）=====
const {
  ads: activeAds,
  load: loadActiveAds
} = useActiveAds('list_feed');

// 在可见帖子流中按 feed_interval 间隔插入广告卡片；广告项不带 data-forum-virtual-index，
// 因此不影响虚拟滚动的窗口观测与滚动位置对齐
const feedWithAds = computed(() => {
  const posts = visibleForumPosts.value;
  const list = activeAds.value;
  if (!list.length) {
    return posts.map((post, visIndex) => ({ isAd: false, key: post.id, post, visIndex }));
  }
  const interval = Math.max(2, Number(list[0].feed_interval) || 5);
  const out = [];
  let adCursor = 0;
  posts.forEach((post, visIndex) => {
    out.push({ isAd: false, key: post.id, post, visIndex });
    if ((visIndex + 1) % interval === 0) {
      const ad = list[adCursor % list.length];
      out.push({ isAd: true, key: `ad-${ad.id}-${visIndex}`, ad });
      adCursor += 1;
    }
  });
  return out;
});

const getForumScrollMetrics = () => {
  const scroller = getForumScrollContainer();
  if (scroller && scroller !== window) {
    return {
      scrollTop: scroller.scrollTop || 0,
      clientHeight: scroller.clientHeight || 0,
      scrollHeight: scroller.scrollHeight || 0
    };
  }
  return {
    scrollTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
    clientHeight: window.innerHeight || document.documentElement.clientHeight || 0,
    scrollHeight: Math.max(
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0
    )
  };
};
const scrollForumTo = (top = 0) => {
  const scroller = getForumScrollContainer();
  if (scroller && scroller !== window) {
    scroller.scrollTo({ top, behavior: 'auto' });
    return;
  }
  window.scrollTo({ top, behavior: 'auto' });
};
const refreshEmbeddedScroll = async () => {
  if (!props.embedded) return;
  await nextTick();
  setupForumLoadMoreObserver();
};
defineExpose({
  refreshEmbeddedScroll,
  // 横屏左栏等外部入口：延迟到调用时求值 —— openMobileComposer / closeMobileComposer /
  // focusForumSearch 定义在本文件更靠后的位置，直接引用会撞 TDZ
  openComposer: () => openMobileComposer(),
  closeComposer: () => closeMobileComposer(),
  focusSearch: () => focusForumSearch()
});
const getCurrentPageScrollY = () => {
  if (typeof window === 'undefined') return 0;
  return getForumScrollMetrics().scrollTop;
};

const buildForumReturnState = (postId = '') => ({
  source: props.embedded ? 'user-space' : 'forum',
  postId: String(postId || '').trim(),
  scrollY: getCurrentPageScrollY(),
  viewMode: viewMode.value,
  sortMode: sortMode.value,
  searchQuery: searchQuery.value,
  searchKeyword: searchKeyword.value,
  selectedTagFilter: selectedTagFilter.value,
  selectedContentType: selectedContentType.value,
  feedMode: feedMode.value,
  currentPage: currentPage.value,
  hasMoreData: hasMoreData.value
});

const applyForumReturnStateFilters = (state = {}) => {
  viewMode.value = state.viewMode === 'my' ? 'my' : 'all';
  sortMode.value = normalizeForumSortMode(state.sortMode, 'latest');
  searchQuery.value = String(state.searchQuery ?? state.searchKeyword ?? '');
  searchKeyword.value = String(state.searchKeyword ?? state.searchQuery ?? '').trim();
  selectedTagFilter.value = normalizeForumTagValue(state.selectedTagFilter || '');
  const savedContentType = String(state.selectedContentType || '').trim().toLowerCase();
  selectedContentType.value = ['news', 'activity', 'post'].includes(savedContentType) ? savedContentType : '';
  feedMode.value = 'posts';
};

const restoreForumScrollPosition = async (state = {}) => {
  if (typeof window === 'undefined') return;
  const targetScrollY = Math.max(0, Number(state.scrollY || 0));
  const targetPostId = String(state.postId || '').trim();
  await nextTick();

  const runRestore = () => {
    if (targetScrollY > 0) {
      scrollForumTo(targetScrollY);
    }
    if (!targetPostId) return;
    window.requestAnimationFrame(() => {
      const escapedPostId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(targetPostId)
        : targetPostId.replace(/"/g, '\\"');
      const selector = `[data-forum-post-id="${escapedPostId}"]`;
      const postEl = document.querySelector(selector);
      if (!postEl) return;
      const rect = postEl.getBoundingClientRect();
      const isVisible = rect.top >= 80 && rect.top <= window.innerHeight * 0.72;
      if (!isVisible) {
        postEl.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    });
  };

  window.requestAnimationFrame(runRestore);
};

const initializeForumData = async () => {
  if (!shouldRestoreForumReturnState()) {
    const snapshot = readForumFeedSnapshot(getForumFeedSnapshotKey());
    if (snapshot?.posts?.length) {
      forumData.value = prepareForumPosts(snapshot.posts);
      currentPage.value = snapshot.currentPage;
      nextPageCursor.value = snapshot.nextPageCursor;
      hasMoreData.value = snapshot.hasMoreData;
      prefetchAuthorTiersFor(snapshot.posts);
      void ensureQuotedPostsForReposts();
      isLoading.value = false;
      void fetchForumData(false, { background: true });
      return;
    }
    await fetchForumData();
    return;
  }

  const returnKey = getForumReturnKey();
  const savedState = readForumReturnState(returnKey);
  if (!savedState) {
    await fetchForumData();
    return;
  }

  applyForumReturnStateFilters(savedState);
  await fetchForumData();

  const desiredPage = Math.max(1, Math.min(12, Number(savedState.currentPage || 1)));
  while (currentPage.value < desiredPage && hasMoreData.value) {
    await fetchForumData(true);
  }

  await restoreForumScrollPosition(savedState);
  clearForumReturnState(returnKey);
};
const forumMentionUsers = computed(() => {
  const seen = new Set();
  const users = [];
  const MAX_USERS = 40;
  const addUser = (username) => {
    const safeUsername = String(username || '').trim();
    if (!safeUsername || seen.has(safeUsername)) return;
    seen.add(safeUsername);
    users.push({ username: safeUsername });
  };
  forumData.value.forEach((post) => {
    if (users.length >= MAX_USERS) return;
    addUser(post?.author_username);
    if (Array.isArray(post?.replies)) {
      for (const reply of post.replies) {
        if (users.length >= MAX_USERS) break;
        addUser(reply?.author_username);
      }
    }
  });
  if (users.length < MAX_USERS && userInfo.username) addUser(userInfo.username);
  return users;
});

// 本周签到 / 问BOHAI 状态
const isWeeklyCheckinLoading = ref(false);
const isWeeklyCheckinSubmitting = ref(false);
const isWeeklyCheckinCalendarOpen = ref(false);
const isAiSearchLoading = ref(false);
const aiSearchHint = ref('');

const createDefaultWeeklyCheckinStatus = () => ({
  hasSignedThisWeek: false,
  streakTotal: 0,
  currentStreak: 0,
  cycleProgress: 0,
  cycleSize: 4,
  rewardCompletedThisWeek: false,
  pointsAwarded: 0,
  currentPoints: Number(userInfo.points || 0),
  nextRewardIn: 4,
  currentWeekStart: null
});
const weeklyCheckinStatus = ref(createDefaultWeeklyCheckinStatus());

// 当前轮内已连续周数（到 cycleSize 即触发奖励并重置，故上限为 cycleSize - 1）。
// 上游缺失 cycleProgress 时从连签周数推导；定义曾在 5ee30b0c 重构中被误删，此处恢复。
const getWeeklyCheckinCycleProgress = (status) => {
  const cycleSize = Math.max(1, Number(status?.cycleSize || 4));
  const explicitProgress = Number(status?.cycleProgress);
  if (Number.isFinite(explicitProgress)) {
    return Math.min(Math.max(0, explicitProgress), cycleSize - 1);
  }
  const normalizedStreak = Math.max(0, Number(status?.currentStreak || status?.streakTotal || 0));
  return normalizedStreak === 0 ? 0 : ((normalizedStreak - 1) % cycleSize) + 1;
};
const weeklyCheckinCardPoints = computed(() => {
  const statusPoints = Number(weeklyCheckinStatus.value.currentPoints);
  return Number.isFinite(statusPoints) ? statusPoints : (Number(userInfo.points) || 0);
});

const newPost = ref({ title: '', content: '' });
const selectedPostTag = ref('daily');
const isSubmitting = ref(false);
const postImages = ref([]);
const postLocation = ref(null);
const isUploadingPostImage = ref(false);
const postImageUploadStatus = ref('');
const createSubmissionId = () => (
  globalThis.crypto?.randomUUID?.()
  || `00000000-0000-4000-8000-${`${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(-12).padStart(12, '0')}`
);
// ===== 即发即走：后台发布队列（与灵动岛/顶部常驻条联动，简化进度不暴露压缩/检测细节） =====
const publishQueueStore = useForumPublishQueueStore();
const publishQueueItems = computed(() => publishQueueStore.items);
let publishWorkerRunning = false;
const publishAbortControllers = new Map();
const showPublishIsland = (payload) => {
  // 统一走灵动岛调度中心；导航栏不存在时（嵌入模式）fallback 到外层 UserSpace 的 island-message
  showIsland.notify({
    ...payload,
    at: Date.now(),
    fallback: () => showEmbeddedSuccessIsland(payload)
  });
};

// ===== 发布队列 → 统一任务岛（showIsland.task）同步 =====
// 常驻进度岛：进行中显示进度环，成功自动收起，失败常驻并带操作按钮
let publishTaskHandle = null;
let publishTaskHandleId = '';
const PUBLISH_TASK_ACTIONS = {
  moderation: [
    { id: 'fix', label: '移除该图', kind: 'danger' },
    { id: 'edit', label: '编辑', kind: 'ghost' },
    { id: 'cancel', label: '取消', kind: 'ghost' }
  ],
  network: [
    { id: 'retry', label: '重试', kind: 'primary' },
    { id: 'edit', label: '编辑', kind: 'ghost' },
    { id: 'cancel', label: '取消', kind: 'ghost' }
  ]
};
watch(publishQueueItems, (items) => {
  const active = items.find(i => ['queued','uploading','publishing'].includes(i.state))
    || items.find(i => i.state === 'failed')
    || items[0]
    || null;
  if (!active) {
    publishTaskHandle?.close();
    publishTaskHandle = null;
    publishTaskHandleId = '';
    return;
  }
  const queueId = String(active.id);
  if (publishTaskHandleId !== queueId || !publishTaskHandle) {
    publishTaskHandle?.close();
    publishTaskHandle = showIsland.task({
      id: `forum-publish-${queueId}`,
      onAction: (actionId) => {
        if (actionId === 'retry') retryPublish(queueId);
        else if (actionId === 'fix') fixModerationPublish(queueId);
        else if (actionId === 'edit') editFailedPublish(queueId);
        else if (actionId === 'cancel') cancelPublish(queueId);
      }
    });
    publishTaskHandleId = queueId;
  }

  const progress = Math.round(active.progress || 0);
  const thumbs = (active.images || [])
    .map(i => String(i.localPreviewUrl || i.url || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  if (active.state === 'success') {
    publishTaskHandle.success({ title: '发帖成功', message: '已发布', durationMs: 900 });
  } else if (active.state === 'failed') {
    const isModeration = active.failType === 'moderation';
    const detail = String(active.errorMessage || '').trim();
    publishTaskHandle.fail({
      tone: isModeration ? 'warning' : 'danger',
      title: isModeration ? '审核未通过' : '发布失败',
      message: detail ? detail.slice(0, 60) : (isModeration ? '点击处理' : '点击重试'),
      actions: isModeration ? PUBLISH_TASK_ACTIONS.moderation : PUBLISH_TASK_ACTIONS.network
    });
  } else if (active.state === 'queued') {
    publishTaskHandle.update({ title: '已提交，后台处理中', message: '系统会继续处理', progress, thumbs });
  } else {
    publishTaskHandle.update({
      title: '正在处理',
      message: active.images?.length ? `正在处理图片 · ${progress}%` : `正在发布 · ${progress}%`,
      progress,
      thumbs
    });
  }
}, { deep: true });
onUnmounted(() => {
  publishTaskHandle?.close();
  publishTaskHandle = null;
  publishTaskHandleId = '';
});
const buildOptimisticPost = (queueItem) => {
  const nowIso = new Date().toISOString();
  // 上传队列快照全量图（≤ FORUM_POST_IMAGE_MAX_COUNT=6），经 prepare 进入 allImages 单一来源
  const queuedImages = (queueItem.images || []).slice(0, FORUM_POST_IMAGE_MAX_COUNT).map((img, idx) => ({
    id: img.uploadId || `optimistic-img-${queueItem.id}-${idx}`,
    url: img.localPreviewUrl || img.url || '',
    originalUrl: img.localPreviewUrl || img.url || '',
    detailUrl: img.localPreviewUrl || img.url || '',
    width: img.width || 0,
    height: img.height || 0,
    sortOrder: idx,
    _optimistic: true,
    _failed: queueItem.state==='failed' && queueItem.failedImageIndex===idx
  })).filter(i=>i.url);
  const titleText = String(queueItem.title||'').trim();
  const bodyText = String(queueItem.body||'').trim();
  const combined = titleText && bodyText ? `【${titleText}】\n${bodyText}` : (titleText || bodyText);
  // 头像自动加载：使用队列快照中的头像，失败时回退到当前 userInfo
  const rawAvatar = String(queueItem.authorAvatarUrl || userInfo.avatarUrl || userInfo.avatar_url || '').trim();
  return prepareForumPostForDisplay({
    id: queueItem.id,
    title: titleText,
    body: bodyText,
    content: combined,
    author_id: queueItem.authorId,
    author_username: queueItem.authorUsername,
    author_avatar_url: rawAvatar,
    author_avatar_frame_url: resolveFrameForAuthor('', queueItem.authorId)?.url || '',
    created_at: nowIso,
    tag: queueItem.tag,
    location_name: queueItem.location?.name || queueItem.location?.cityName || '',
    images: queuedImages,
    cover_image_url: queuedImages[0]?.url || '',
    like_count: 0,
    comment_count: 0,
    isLiked: false,
    status: 'approved',
    // 乐观扩展字段
    _optimistic: true,
    _queueId: queueItem.id,
    _publishState: queueItem.state,
    _progress: queueItem.progress,
    _failType: queueItem.failType,
    _failMessage: queueItem.errorMessage || '',
    _failedImageIndex: queueItem.failedImageIndex
  }, 0);
};
const insertOptimisticPost = (queueItem) => {
  const optimistic = buildOptimisticPost(queueItem);
  // 去重：若已存在同 queueId 乐观卡则替换
  const existsIdx = forumData.value.findIndex(p=> p._queueId===queueItem.id);
  if (existsIdx>=0) {
    const next = [...forumData.value];
    next[existsIdx]=optimistic;
    forumData.value = next;
  } else {
    forumData.value = [optimistic, ...forumData.value];
  }
  addUiMarker(highlightedPostIds, queueItem.id, 2600, 'new-post');
  triggerRef(forumData);
};
const updateOptimisticPost = (queueId, patch={}) => {
  const idx = forumData.value.findIndex(p=> p._queueId===queueId || p.id===queueId);
  if (idx<0) return;
  const cur = forumData.value[idx];
  const next = { ...cur, ...patch, _queueId: queueId };
  // 若传了 queueItem 整体则重建 allImages 失败标记
  if (patch._publishState || patch._progress!==undefined || patch._failType!==undefined) {
    const q = publishQueueStore.items.find(i=>i.id===queueId);
    if (q) {
      const rebuilt = buildOptimisticPost(q);
      // 保留已有的 display 字段但更新状态相关
      Object.assign(next, {
        _publishState: q.state,
        _progress: q.progress,
        _failType: q.failType,
        _failMessage: q.errorMessage || '',
        _failedImageIndex: q.failedImageIndex,
        allImages: rebuilt.allImages,
        hasImages: rebuilt.hasImages,
        imageCount: rebuilt.imageCount,
        hiddenImageCount: rebuilt.hiddenImageCount,
        hasMultipleImages: rebuilt.hasMultipleImages
      });
    }
  }
  const arr = [...forumData.value];
  arr[idx]=next;
  forumData.value=arr;
  triggerRef(forumData);
};
const removeOptimisticPost = (queueId) => {
  const beforeLen = forumData.value.length;
  forumData.value = forumData.value.filter(p=> p._queueId!==queueId && p.id!==queueId);
  if (forumData.value.length!==beforeLen) triggerRef(forumData);
};
const replaceOptimisticWithReal = (queueId, realPost) => {
  const idx = forumData.value.findIndex(p=> p._queueId===queueId || p.id===queueId);
  const queueItem = publishQueueStore.items.find(i=>i.id===queueId);
  // 真实接口仅返回 id，头像/用户名需用队列快照或当前用户信息回填，否则会显示 R
  const merged = {
    ...realPost,
    author_id: realPost.author_id || queueItem?.authorId || userInfo.id,
    author_username: realPost.author_username || queueItem?.authorUsername || userInfo.username,
    author_avatar_url: realPost.author_avatar_url || queueItem?.authorAvatarUrl || userInfo.avatarUrl || '',
    title: realPost.title || queueItem?.title || '',
    body: realPost.body || queueItem?.body || '',
    content: realPost.content || (queueItem ? `【${queueItem.title}】\n${queueItem.body}` : ''),
    tag: realPost.tag || queueItem?.tag || 'daily',
    location_name: realPost.location_name || queueItem?.location?.name || queueItem?.location?.cityName || '',
    // 若真实返回未含图片，使用队列最终上传结果
    images: Array.isArray(realPost.images) && realPost.images.length ? realPost.images : (queueItem?.images || []),
    cover_image_url: realPost.cover_image_url || queueItem?.images?.[0]?.url || queueItem?.images?.[0]?.localPreviewUrl || ''
  };
  const prepared = prepareForumPostForDisplay(merged, 0);
  if (idx>=0) {
    const arr=[...forumData.value];
    arr[idx]=prepared;
    forumData.value=arr;
  } else {
    forumData.value=[prepared, ...forumData.value];
  }
  addUiMarker(highlightedPostIds, String(realPost.id||queueId), 2600, 'new-post');
  triggerRef(forumData);
};
const getQueueItemErrorType = (error) => {
  const msg = String(error?.message||'').toLowerCase();
  const code = String(error?.code||'').toUpperCase();
  // 审核类：仅限真正的判定未通过（本地关键词、同步审核、NSFW 判定失败）
  if (['LOCAL_KEYWORD_BLOCK','SYNC_MODERATION_BLOCK','BETA5_IMAGE_PIPELINE_FAILED'].includes(code)) return 'moderation';
  if (msg.includes('未通过') || msg.includes('敏感') || msg.includes('审核')) return 'moderation';
  // 检测环境不可用（模型加载失败/超时/WebGL 挂起）按网络类处理，允许直接重试
  if (['IMAGE_MODERATION_UNAVAILABLE','IMAGE_MODERATION_TIMEOUT'].includes(code)) return 'network';
  if (isLikelyNetworkError(error)) return 'network';
  return 'network';
};
const processPublishImagesForQueue = async (queueItem, signal) => {
  // 全部已就绪（预热已完成）：直接返回
  const allApproved = (queueItem.images||[]).length > 0
    && (queueItem.images||[]).every(img=> img?.uploadStatus==='approved' && (img?.url || img?.originalUrl));
  if (allApproved) {
    publishQueueStore.setProgress(queueItem.id, 82);
    return queueItem.images;
  }

  const pending = (queueItem.images||[]).filter(img=> img?.file && img.uploadStatus!=='approved');
  const total = pending.length;
  publishQueueStore.setProgress(queueItem.id, 2);
  const setProg = (v) => {
    publishQueueStore.setProgress(queueItem.id, v);
    updateOptimisticPost(queueItem.id, { _progress: v });
  };
  const replaceUploadedImage = (uploadId, data) => {
    const qIdx = publishQueueStore.items.findIndex(i=>i.id===queueItem.id);
    if (qIdx<0) return;
    const curItem = publishQueueStore.items[qIdx];
    const imgIdx = curItem.images.findIndex(x=> x.uploadId===uploadId);
    if (imgIdx<0) return;
    const nextImages=[...curItem.images];
    nextImages[imgIdx]={ ...data, uploadStatus:'approved', sortOrder: imgIdx, file: null, localPreviewUrl: data.url || nextImages[imgIdx].localPreviewUrl };
    publishQueueStore.updateItem(queueItem.id, { images: nextImages });
  };
  const markImageFailure = (img, failIdx, error) => {
    const failType = getQueueItemErrorType(error);
    publishQueueStore.updateItem(queueItem.id, {
      failType: failType==='moderation' ? 'moderation' : 'network',
      failedImageIndex: failIdx,
      failedImageId: img?.uploadId || null,
      errorMessage: error?.message || '图片处理失败'
    });
    updateOptimisticPost(queueItem.id, { _publishState:'failed', _failType: failType==='moderation'?'moderation':'network', _failMessage: error?.message || '图片处理失败', _failedImageIndex: failIdx });
    const wrapped = new Error(error?.message || '图片处理失败');
    wrapped.code = error?.code || (failType==='moderation' ? 'BETA5_IMAGE_PIPELINE_FAILED' : 'IMAGE_UPLOAD_FAILED');
    wrapped.failType = failType;
    return wrapped;
  };

  // 消费预热管线：等待每张图的「压缩→检测→上传」结果，成功则落库替换
  let resolvedCount = 0;
  const recalcProgress = () => {
    setProg(2 + (resolvedCount/total)*80);
  };
  recalcProgress();
  let pipelineError = null; // { img, failIdx, error }

  // 细粒度进度：轮询聚合各图管线进度（压缩 0-0.35 / 检测 0.35-0.5 / 上传 0.5-1.0）。
  // 旧模型只有整张图 resolved 才跳格（+80/total），点发送后第一张未完成时进度死停 2%。
  const resolvedUploadIds = new Set();
  let progressTicker = null;
  const stopProgressTicker = () => {
    if (progressTicker) { clearInterval(progressTicker); progressTicker = null; }
  };
  const startProgressTicker = () => {
    if (total <= 0) return;
    stopProgressTicker();
    progressTicker = setInterval(() => {
      let agg = 0;
      pending.forEach((img) => {
        if (resolvedUploadIds.has(img.uploadId)) { agg += 1; return; }
        const entry = draftImagePipelines.get(img.uploadId);
        agg += entry ? Math.min(1, Math.max(0, Number(entry.progress || 0))) : 0;
      });
      setProg(2 + (agg / total) * 80);
    }, 300);
  };
  startProgressTicker();

  const releaseSlot = (img) => {
    // 仅在编辑器未持有该图（已发布清空）时释放管线槽位；编辑器仍持有时（编辑失败重发）保留给下一轮
    const stillInEditor = postImages.value.some(x=> x.uploadId===img?.uploadId);
    if (!stillInEditor) draftImagePipelines.delete(img?.uploadId);
  };

  try {
    for (let idx=0; idx<pending.length; idx++) {
      if (signal?.aborted) throw Object.assign(new Error('已取消'), { code:'PUBLISH_CANCELLED' });
      const img = pending[idx];
      const imgFailIdx = (queueItem.images||[]).findIndex(x=> x.uploadId===img.uploadId);
      let entry = draftImagePipelines.get(img.uploadId);
      // 无预热管线（模型不可用/会话失效/边界场景）：现场补建一条，走同一套等待逻辑
      if (!entry && img.file) {
        scheduleDraftImagePipeline(img, idx, total);
        entry = draftImagePipelines.get(img.uploadId);
      }
      if (!entry) {
        pipelineError = { img, failIdx: imgFailIdx>=0? imgFailIdx : idx, error: new Error('图片处理失败') };
        break;
      }
      try {
        await entry.promise;
      } catch {
        // 失败态已在管线内记录，下面统一归因
      }
      if (signal?.aborted) throw Object.assign(new Error('已取消'), { code:'PUBLISH_CANCELLED' });
      if (entry.cancelled) {
        pipelineError = { img, failIdx: imgFailIdx>=0? imgFailIdx : idx, error: Object.assign(new Error('已取消'), { code:'PUBLISH_CANCELLED' }) };
        break;
      }
      if (entry.state==='done' && entry.data) {
        replaceUploadedImage(img.uploadId, entry.data);
        resolvedUploadIds.add(img.uploadId);
        releaseSlot(img);
        resolvedCount += 1;
        recalcProgress();
      } else {
        const rawError = entry.error || new Error('图片处理失败');
        // 会话级失败：标记并取消后续图的预热（仍在等待的会被跳过/中止）
        (queueItem.images||[]).forEach(other=> {
          if (other?.uploadId && other.uploadId!==img.uploadId) cancelDraftImagePipeline(other.uploadId);
        });
        // 失败图自身的 entry 同样必须清除：否则残留在 map 中，
        // retryPublish 的 scheduleDraftImagePipeline 会因「已存在」拒绝重建 → 重试永远立即失败
        cancelDraftImagePipeline(img.uploadId);
        pipelineError = { img, failIdx: imgFailIdx>=0? imgFailIdx : idx, error: rawError };
        break;
      }
    }
  } finally {
    stopProgressTicker();
  }

  if (pipelineError) {
    if (pipelineError.error?.code==='PUBLISH_CANCELLED') throw pipelineError.error;
    throw markImageFailure(pipelineError.img, pipelineError.failIdx, pipelineError.error);
  }

  setProg(82);
  const finalItem = publishQueueStore.items.find(i=>i.id===queueItem.id);
  return finalItem ? finalItem.images : queueItem.images;
};
const runPublishQueue = async () => {
  if (publishWorkerRunning) return;
  publishWorkerRunning = true;
  try {
    while (true) {
      const next = publishQueueStore.items.find(i=> i.state==='queued');
      if (!next) break;
      publishQueueStore.setState(next.id, 'uploading');
      updateOptimisticPost(next.id, { _publishState:'uploading' });
      const controller = new AbortController();
      publishAbortControllers.set(next.id, controller);
      try {
        // 图片流水线（只要有图就走消费逻辑：内部判断全就绪则秒过，等待中则等剩余部分）
        let finalImages = next.images;
        if ((next.images||[]).length > 0) {
          finalImages = await processPublishImagesForQueue(next, controller.signal);
        }
        if (controller.signal.aborted) throw Object.assign(new Error('已取消'), { code:'PUBLISH_CANCELLED' });
        // 发布阶段 82->96
        publishQueueStore.setProgress(next.id, 88);
        updateOptimisticPost(next.id, { _progress: 88, _publishState:'publishing' });
        publishQueueStore.setState(next.id, 'publishing');
        const result = await createPost(
          next.body,
          next.authorId,
          next.authorUsername,
          'approved',
          next.title,
          finalImages,
          next.tag,
          next.location,
          { submissionId: next.submissionId }
        );
        if (controller.signal.aborted) throw Object.assign(new Error('已取消'), { code:'PUBLISH_CANCELLED' });
        if (result.error) throw result.error;
        const realPost = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!realPost || !realPost.id) throw new Error('发布返回异常，请刷新后查看');
        // 成功
        publishQueueStore.setProgress(next.id, 100);
        publishQueueStore.setState(next.id, 'success');
        updateOptimisticPost(next.id, { _progress:100, _publishState:'success' });
        // 清理预览 URL
        (next.images||[]).forEach(img=> { if (img.localPreviewUrl) { try{ URL.revokeObjectURL(img.localPreviewUrl);}catch{} } });
        // 替换乐观卡为真实卡
        replaceOptimisticWithReal(next.id, realPost);
        // 经验与奖励
        void addExperience(supabase, next.authorId, XP_REWARDS.POST).catch(err=> logger.error('forum','经验值增加失败:',err));
        if (realPost.id) {
          claimPostPublishReward(supabase, String(realPost.id)).then(reward=>{
            if (reward && reward.ok && Number(reward.awarded)>0) {
              if (Number.isFinite(Number(reward.currentPoints))) userInfo.points = Number(reward.currentPoints);
              const tip = reward.campaignTitle ? `「${reward.campaignTitle}」` : '';
              // 奖励用瞬时岛（队列成功岛 900ms 后已收起，不冲突）
              showPublishIsland({ title:'发帖得积分', message:`获得 ${reward.awarded} 积分${tip}`, icon:'gift', type:'success' });
            }
          }).catch(err=> logger.error('forum','发帖奖励发放失败:',err));
        }
        emitProfileSync({ userId: next.authorId, username: next.authorUsername, reason:'post_created' });
        // 成功态由常驻 Airdrop 岛展示（isSuccess），不再发瞬时岛避免重叠
        // 刷新周报但不整页重拉（避免覆盖刚插入的帖子）；后台静默刷新快照
        void loadForumWeeklyReport();
        persistForumFeedSnapshot();
        // 成功后短暂保留再移除队列项
        await new Promise(r=> setTimeout(r, 900));
        publishQueueStore.removeItem(next.id);
        publishAbortControllers.delete(next.id);
      } catch (error) {
        publishAbortControllers.delete(next.id);
        if (error?.code==='PUBLISH_CANCELLED' || controller.signal.aborted) {
          // 已在 cancel 分支处理移除
          continue;
        }
        logger.error('forum','后台发帖失败', error);
        // 限流
        applyRateLimitCooldown(error,'post');
        const failType = error?.failType || getQueueItemErrorType(error);
        const isMod = failType==='moderation';
        const code = String(error?.code||'').toUpperCase();
        // 若为不可重试的本地校验类，直接清理图片但保留卡片供用户编辑
        const shouldCleanup = shouldCleanupImagesAfterPostError(error);
        if (shouldCleanup && !isMod) {
          // 对审核失败不清理，后续可移除单图重试
        }
        publishQueueStore.setState(next.id, 'failed', {
          failType: isMod ? 'moderation' : 'network',
          errorMessage: error?.message || (isMod ? '图片未通过审核' : '网络异常，发送失败'),
          failedImageIndex: publishQueueStore.items.find(i=>i.id===next.id)?.failedImageIndex ?? null
        });
        publishQueueStore.setProgress(next.id, Math.max(12, Number(publishQueueStore.items.find(i=>i.id===next.id)?.progress||62)));
        updateOptimisticPost(next.id, { _publishState:'failed', _failType: isMod?'moderation':'network', _failMessage: error?.message || (isMod ? '图片未通过审核' : '网络异常，发送失败') });
        // 失败态由常驻岛展示（橙/红常驻需操作），不再发瞬时岛
        break; // 中断队列，等待用户操作后继续
      }
    }
  } finally {
    publishWorkerRunning=false;
  }
};
const retryPublish = async (queueId) => {
  const item = publishQueueStore.items.find(i=>i.id===queueId);
  if (!item) return;
  publishQueueStore.incrementRetry(queueId);
  // 重置进度与失败标记，但保留已成功上传的图；未完成的图需重启预热管线（重试时可能已被取消）
  (item.images||[]).forEach((img, idx)=> {
    if (img?.file && img.uploadStatus!=='approved') {
      scheduleDraftImagePipeline(img, idx, item.images.length);
    }
  });
  publishQueueStore.updateItem(queueId, {
    state:'queued',
    failType:null,
    failedImageIndex:null,
    failedImageId:null,
    errorMessage:'',
    progress: Math.max(8, Number(item.progress||0)-12)
  });
  updateOptimisticPost(queueId, { _publishState:'queued', _failType:null, _progress: Math.max(8, Number(item.progress||0)-12) });
  // 隐藏失败提示，乐观卡回到发送中
  const elFailMsg = document.querySelector(`[data-queue-failmsg="${queueId}"]`);
  if (elFailMsg) elFailMsg.style.display='none';
  // 重试由常驻岛环恢复为发送态
  void runPublishQueue();
};

// E1 网络恢复自动重试：弱网/断网失败的帖子在网络恢复后自动重发（2s 节流防抖），
// 地铁/电梯场景「发送失败」自动变成功，用户无需手动点重试
let lastOnlineRecoveryAt = 0;
const handleNetworkOnline = () => {
  const now = Date.now();
  if (now - lastOnlineRecoveryAt < 2000) return;
  lastOnlineRecoveryAt = now;
  const failedItems = publishQueueStore.items.filter((i) => i.state === 'failed' && i.failType === 'network');
  failedItems.forEach((item) => retryPublish(item.id));
};
onMounted(() => window.addEventListener('online', handleNetworkOnline));
onUnmounted(() => window.removeEventListener('online', handleNetworkOnline));

const cancelPublish = async (queueId) => {
  const controller = publishAbortControllers.get(queueId);
  if (controller) { try{ controller.abort(); }catch{} publishAbortControllers.delete(queueId); }  const item = publishQueueStore.items.find(i=>i.id===queueId);
  if (item) {
    // 取消未完成的预热管线；正在上传的让其自然完成并登记 pending（由云端兜底清理），不再主动删除
    (item.images||[]).forEach(img=> { if (img?.uploadId) cancelDraftImagePipeline(img.uploadId); });
    // 清理已上传但未落库的云端图（跳过仍被编辑器持有的管线图，避免误删）
    const toCleanup = (item.images||[]).filter(img=> (img.publicId || img.deleteToken) && !postImages.value.some(x=> x.uploadId===img.uploadId));
    if (toCleanup.length) {
      toCleanup.forEach(img=> { void cleanupUploadedForumImage(img, { silent:true }); if (img.localPreviewUrl) try{ URL.revokeObjectURL(img.localPreviewUrl);}catch{} });
    } else {
      (item.images||[]).forEach(img=> { if (img.localPreviewUrl) try{ URL.revokeObjectURL(img.localPreviewUrl);}catch{} });
    }
  }
  publishQueueStore.removeItem(queueId);
  removeOptimisticPost(queueId);
  // 取消后常驻岛自动收起（无瞬时岛）
  // 若还有队列则继续
  if (publishQueueStore.items.some(i=>i.state==='queued')) void runPublishQueue();
};
const fixModerationPublish = async (queueId) => {
  const item = publishQueueStore.items.find(i=>i.id===queueId);
  if (!item) return;
  const failedIdx = Number(item.failedImageIndex);
  const hasFailed = Number.isInteger(failedIdx) && failedIdx>=0 && failedIdx < (item.images||[]).length;
  let nextImages;
  if (hasFailed) {
    const failedImg = item.images[failedIdx];
    if (failedImg?.uploadId) cancelDraftImagePipeline(failedImg.uploadId);
    if (failedImg?.localPreviewUrl) try{ URL.revokeObjectURL(failedImg.localPreviewUrl);}catch{}
    // 若已上传到云端但未落库，需删除
    if (failedImg?.publicId || failedImg?.deleteToken) void cleanupUploadedForumImage(failedImg, { silent:true });
    nextImages = item.images.filter((_,i)=> i!==failedIdx).map((img,i)=> ({...img, sortOrder:i}));
    // 若移除后无图，则保留纯文
  } else {
    nextImages = item.images;
  }
  // 重启剩余未完成图的预热管线（失败时可能已被取消）
  (nextImages||[]).forEach((img, idx)=> {
    if (img?.file && img.uploadStatus!=='approved') {
      scheduleDraftImagePipeline(img, idx, nextImages.length);
    }
  });
  publishQueueStore.updateItem(queueId, {
    images: nextImages,
    state:'queued',
    failType:null,
    failedImageIndex:null,
    failedImageId:null,
    errorMessage:'',
    progress: Math.max(18, Number(item.progress||0)-10)
  });
  updateOptimisticPost(queueId, { _publishState:'queued', _failType:null, _progress: Math.max(18, Number(item.progress||0)-10) });
  // 移除后由常驻岛恢复发送态
  void runPublishQueue();
};
// 发布失败后取回内容重新编辑：快照（含未上传的本地图片）交还编辑器，队列项与乐观卡移除
const editFailedPublish = (queueId) => {
  const item = publishQueueStore.items.find(i=>i.id===queueId);
  if (!item) return;
  const controller = publishAbortControllers.get(queueId);
  if (controller) { try{ controller.abort(); }catch{} publishAbortControllers.delete(queueId); }
  newPost.value.title = String(item.title || '');
  newPost.value.content = String(item.body || '');
  selectedPostTag.value = item.tag || 'daily';
  postLocation.value = item.location ? { ...item.location } : null;
  // 已上传成功的图保留 approved 状态（带云端 url，重发时跳过上传），
  // 未完成的图保留 file + 本地预览，重发时由队列重新走压缩/检测/上传
  postImages.value = normalizePostImageSortState((item.images || []).map((img, idx) => ({ ...img, sortOrder: idx })));
  postImageUploadStatus.value = '';
  publishQueueStore.removeItem(queueId);
  removeOptimisticPost(queueId);
  // 未完成的图重启预热管线（回到编辑器期间继续后台处理，再次发布时接近秒发）
  postImages.value.forEach((img, idx) => {
    if (img?.file && img.uploadStatus !== 'approved') {
      scheduleDraftImagePipeline(img, idx, postImages.value.length);
    }
  });
  // 打开编辑器（移动端）
  if (isMobileComposerMode.value) {
    isMobileComposerOpen.value = true;
  }
};
const isForumImageViewerOpen = ref(false);
const forumImageViewerImages = ref([]);
const forumImageViewerIndex = ref(0);
const showPostImageSourceMenu = ref(false);
// 竖屏编辑器形态：单源判据初始化，变化由 onForumPortraitComposerChange 订阅驱动（见下方 updateMobileStatus 区块）
const isMobileComposerMode = ref(typeof window !== 'undefined' ? isForumPortraitComposer() : false);
const isMobileComposerOpen = ref(false);
const isMobileDraftPanelOpen = ref(false);
const savedPostDraft = ref(null);
const postImageCleanupLocks = new Set();
const cooldownNow = ref(Date.now());
const postCooldownUntil = ref(0);
const replyCooldownUntil = ref(0);
const imageUploadCooldownUntil = ref(0);
let cooldownTimer = null;
let forumFetchSeq = 0;
let forumFetchAbortController = null;
let searchDebounceTimer = null;
let postDraftSaveTimer = null;
let postDraftSyncQueue = Promise.resolve(null);
// ✨ 移除：autoSaveDraftTimer定时器（改为手动保存）
// let autoSaveDraftTimer = null;
let postDraftRestoreSeq = 0;
const {
  postDraftVersions,
  normalizeDraftPayload,
  readDraftClearedAt,
  clearDraftClearedMarker,
  readPostDraft,
  writeLocalPostDraft,
  readPostDraftVersions,
  writePostDraftVersions,
  rememberPostDraftVersion
} = useForumPostDraftStorage({
  getUserId: () => userInfo.id,
  normalizeTag: normalizeForumTagValue,
  prefix: FORUM_POST_DRAFT_PREFIX,
  versionLimit: FORUM_POST_DRAFT_VERSION_LIMIT,
  logger
});

const refreshPostDraftState = () => {
  savedPostDraft.value = readPostDraft();
  postDraftVersions.value = readPostDraftVersions();
};

const savePostDraftToDatabase = (draft) => {
  const userId = String(userInfo.id || '').trim();
  if (!isLoggedIn.value || !userId) return Promise.resolve(null);

  // 云端草稿写入必须串行。否则旧的 upsert 可能在后发的 delete 之后才落库，
  // 导致用户明明选了“不保存/清空”，旧字符却又被恢复成草稿。
  const syncTask = async () => {
    try {
      if (!draft) {
        const result = await deleteForumPostDraft(userId);
        if (!result.ok) throw result.error;
        clearDraftClearedMarker(userId);
        return null;
      }
      const result = await upsertForumPostDraft(userId, draft);
      if (!result.ok) throw result.error;
      if (Number(draft.savedAt || 0) > readDraftClearedAt(userId)) {
        clearDraftClearedMarker(userId);
      }
      return result.data;
    } catch (error) {
      logger.warn('forum', '同步发帖草稿失败:', error);
      return null;
    }
  };

  const result = postDraftSyncQueue.then(syncTask, syncTask);
  postDraftSyncQueue = result.catch(() => null);
  return result;
};

const clearPostDraftSaveTimer = () => {
  if (postDraftSaveTimer) {
    clearTimeout(postDraftSaveTimer);
    postDraftSaveTimer = null;
  }
};

const schedulePostDraftDatabaseSync = (draft) => {
  clearPostDraftSaveTimer();
  postDraftSaveTimer = setTimeout(() => {
    postDraftSaveTimer = null;
    void savePostDraftToDatabase(draft);
  }, 900);
};

const restorePostDraft = async () => {
  const restoreSeq = ++postDraftRestoreSeq;
  const localDraft = readPostDraft();
  const localClearedAt = readDraftClearedAt();
  postDraftVersions.value = readPostDraftVersions();
  savedPostDraft.value = localDraft;
  if (localDraft) {
    newPost.value = { title: localDraft.title, content: localDraft.content };
    selectedPostTag.value = localDraft.tag;
  }

  const editorSnapshot = {
    title: String(newPost.value.title || ''),
    content: String(newPost.value.content || ''),
    tag: normalizeForumTagValue(selectedPostTag.value) || 'daily'
  };

  const userId = String(userInfo.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  try {
    const result = await getForumPostDraft(userId);
    if (restoreSeq !== postDraftRestoreSeq) return;
    if (String(userInfo.id || '').trim() !== userId) return;
    if (
      String(newPost.value.title || '') !== editorSnapshot.title
      || String(newPost.value.content || '') !== editorSnapshot.content
      || (normalizeForumTagValue(selectedPostTag.value) || 'daily') !== editorSnapshot.tag
    ) return;
    if (!result.ok) throw result.error;

    const remoteDraft = result.data;
    if (!remoteDraft) {
      if (localDraft) {
        void savePostDraftToDatabase(localDraft);
      } else {
        clearDraftClearedMarker(userId);
      }
      return;
    }

    // 如果上次云端删除因断网失败，用本地清空标记拦截旧草稿，
    // 并在恢复网络后继续删除，不让那个旧字符再次回填。
    if (localClearedAt && Number(remoteDraft.savedAt || 0) <= localClearedAt) {
      void savePostDraftToDatabase(null);
      return;
    }

    if (localDraft && Number(localDraft.savedAt || 0) > Number(remoteDraft.savedAt || 0)) {
      void savePostDraftToDatabase(localDraft);
      return;
    }

    savedPostDraft.value = remoteDraft;
    writeLocalPostDraft(remoteDraft);
    newPost.value = { title: remoteDraft.title, content: remoteDraft.content };
    selectedPostTag.value = remoteDraft.tag;
  } catch (error) {
    logger.warn('forum', '恢复发帖草稿失败:', error);
  }
};

const persistPostDraft = () => {
  try {
    const title = String(newPost.value.title || '');
    const content = String(newPost.value.content || '');
    const tag = normalizeForumTagValue(selectedPostTag.value) || 'daily';
    const hasContent = Boolean(title.trim() || content.trim());
    if (!hasContent) {
      writeLocalPostDraft(null);
      savedPostDraft.value = null;
      schedulePostDraftDatabaseSync(null);
      lastAutoSaveTime.value = null;
      return;
    }
    const draft = { title, content, tag, savedAt: Date.now() };
    writeLocalPostDraft(draft);
    savedPostDraft.value = draft;
    rememberPostDraftVersion(draft);
    schedulePostDraftDatabaseSync(draft);
    lastAutoSaveTime.value = draft.savedAt;
  } catch (error) {
    logger.warn('forum', '保存发帖草稿失败:', error);
  }
};

const lastAutoSaveTime = ref(null);

const formatAutoSaveTime = (timestamp) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const autoSaveDraftLabel = computed(() => {
  if (!lastAutoSaveTime.value) return '';
  return `已自动保存 ${formatAutoSaveTime(lastAutoSaveTime.value)}`;
});

// ✨ 移除：clearAutoSaveDraftTimer和startAutoSaveDraftTimer函数（改为手动保存）
// const clearAutoSaveDraftTimer = () => { ... };
// const startAutoSaveDraftTimer = () => { ... };

// ✨ 新增：hasUnsavedChanges函数（判断是否有未保存的编辑内容）
const hasUnsavedChanges = () => {
  const hasTitle = Boolean(String(newPost.value.title || '').trim());
  const hasContent = Boolean(String(newPost.value.content || '').trim());
  const hasImages = postImages.value.length > 0;
  return hasTitle || hasContent || hasImages;
};

// ✨ 新增：beforeunload事件处理（刷新页面时提示保存草稿 + 队列发送中提示）
const handleBeforeUnload = (e) => {
  const hasPendingPublish = publishQueueStore.items.some(i=> ['queued','uploading','publishing'].includes(i.state));
  if (hasPendingPublish) {
    e.preventDefault();
    e.returnValue = '有内容正在发送，离开将中断发送';
    return e.returnValue;
  }
  if (!isMobileComposerOpen.value || !hasUnsavedChanges()) return;

  e.preventDefault();
  e.returnValue = '编辑内容尚未保存，是否保存为草稿？';

  return e.returnValue;
};

const clearPostDraft = () => {
  try {
    // 让已经发出、但尚未返回的恢复请求立即失效，避免远端旧草稿回填。
    postDraftRestoreSeq += 1;
    if (postDraftSaveTimer) {
      clearTimeout(postDraftSaveTimer);
      postDraftSaveTimer = null;
    }
    // ✨ 移除：clearAutoSaveDraftTimer()调用
    // clearAutoSaveDraftTimer();
    writeLocalPostDraft(null);
    savedPostDraft.value = null;
    lastAutoSaveTime.value = null;
    writePostDraftVersions([]);
    return savePostDraftToDatabase(null);
  } catch (error) {
    logger.warn('forum', '清理发帖草稿失败:', error);
    return Promise.resolve(null);
  }
};

const formatDraftSavedTime = (savedAt = 0) => {
  if (!savedAt) return '尚未保存';
  return new Date(savedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const draftPreviewText = computed(() => {
  const draft = savedPostDraft.value;
  if (!draft) return '还没有保存的草稿';
  return draft.title || draft.content || '未命名草稿';
});

const savedDraftTagLabel = computed(() => getForumTagLabel(savedPostDraft.value?.tag || '') || '#日常');

const openMobileDraftPanel = async () => {
  // 打开面板不触发自动保存（已改为手动保存，保存在 saveDraftManually 里）
  refreshPostDraftState();
  isMobileDraftPanelOpen.value = true;
};

const closeMobileDraftPanel = () => {
  isMobileDraftPanelOpen.value = false;
};

const saveMobileDraft = async () => {
  persistPostDraft(); // 手动保存时调用
  clearPostDraftSaveTimer();
  const draftToSync = savedPostDraft.value;
  const syncedDraft = await savePostDraftToDatabase(draftToSync);
  if (syncedDraft && savedPostDraft.value === draftToSync) {
    savedPostDraft.value = syncedDraft;
    writeLocalPostDraft(syncedDraft);
  }
  refreshPostDraftState();
};

const restoreMobileDraft = () => {
  restorePostDraft();
  closeMobileDraftPanel();
};

const restorePostDraftVersion = (draft) => {
  const normalizedDraft = normalizeDraftPayload(draft);
  if (!normalizedDraft) return;
  savedPostDraft.value = normalizedDraft;
  newPost.value = { title: normalizedDraft.title, content: normalizedDraft.content };
  selectedPostTag.value = normalizedDraft.tag;
  writeLocalPostDraft(normalizedDraft);
  closeMobileDraftPanel();
};

const clearMobileDraft = () => {
  void clearPostDraft();
  writePostDraftVersions([]);
  newPost.value = { title: '', content: '' };
  selectedPostTag.value = 'daily';
  closeMobileDraftPanel();
};

const getCooldownSeconds = (until) => Math.max(0, Math.ceil((Number(until || 0) - cooldownNow.value) / 1000));

const postCooldownSeconds = computed(() => getCooldownSeconds(postCooldownUntil.value));
const replyCooldownSeconds = computed(() => getCooldownSeconds(replyCooldownUntil.value));
const imageUploadCooldownSeconds = computed(() => getCooldownSeconds(imageUploadCooldownUntil.value));

const replySubmitLabel = computed(() => (
  replyCooldownSeconds.value > 0 ? `${replyCooldownSeconds.value}s 后发送` : '发送'
));
const imageUploadCooldownLabel = computed(() => (
  imageUploadCooldownSeconds.value > 0 ? `${imageUploadCooldownSeconds.value}s 后上传` : ''
));

const ensureCooldownTimer = () => {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(() => {
    cooldownNow.value = Date.now();
    if (postCooldownSeconds.value <= 0 && replyCooldownSeconds.value <= 0 && imageUploadCooldownSeconds.value <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
};

const startActionCooldown = (target, seconds) => {
  const safeSeconds = Math.max(1, Number(seconds || 0));
  if (target === 'post') {
    postCooldownUntil.value = Date.now() + safeSeconds * 1000;
  } else if (target === 'reply') {
    replyCooldownUntil.value = Date.now() + safeSeconds * 1000;
  } else if (target === 'imageUpload') {
    imageUploadCooldownUntil.value = Date.now() + safeSeconds * 1000;
  }
  cooldownNow.value = Date.now();
  ensureCooldownTimer();
};

const getRetryAfterSeconds = (error, fallbackSeconds) => {
  const hintedSeconds = Number(error?.hint || 0);
  if (Number.isFinite(hintedSeconds) && hintedSeconds > 0) return Math.ceil(hintedSeconds);
  return Math.max(1, Number(fallbackSeconds || 1));
};

const getSecondsUntilNextShanghaiDay = () => {
  const now = new Date();
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const nextDay = new Date(shanghaiNow);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((nextDay.getTime() - shanghaiNow.getTime()) / 1000));
};

const applyRateLimitCooldown = (error, fallbackTarget = 'post') => {
  if (error?.code !== 'FORUM_RATE_LIMIT') return false;
  const ruleCode = String(error.details || '').trim();
  if (ruleCode === 'POST_COOLDOWN') {
    startActionCooldown('post', getRetryAfterSeconds(error, 30));
  } else if (ruleCode === 'IMAGE_POST_COOLDOWN') {
    startActionCooldown('post', getRetryAfterSeconds(error, 180));
  } else if (ruleCode === 'IMAGE_10M_LIMIT') {
    startActionCooldown('post', getRetryAfterSeconds(error, 120));
  } else if (ruleCode === 'DAILY_IMAGE_POST_LIMIT') {
    startActionCooldown('post', getRetryAfterSeconds(error, getSecondsUntilNextShanghaiDay()));
  } else if (ruleCode === 'COMMENT_COOLDOWN') {
    startActionCooldown('reply', getRetryAfterSeconds(error, 10));
  } else if (ruleCode.startsWith('POST_')) {
    startActionCooldown('post', getRetryAfterSeconds(error, 60));
  } else if (ruleCode.startsWith('COMMENT_')) {
    startActionCooldown('reply', getRetryAfterSeconds(error, 30));
  } else {
    startActionCooldown(fallbackTarget, fallbackTarget === 'reply' ? 10 : 30);
  }
  return true;
};

const applyImageUploadRateLimitCooldown = (error) => {
  if (error?.code !== 'CLOUDINARY_UPLOAD_RATE_LIMIT') return false;
  startActionCooldown('imageUpload', getRetryAfterSeconds(error, 600));
  return true;
};

const ensureCanAddPostImage = () => {
  if (postImages.value.length >= FORUM_POST_IMAGE_MAX_COUNT) {
    showModal('warning', '图片已满', `每个帖子最多发布 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片`);
    return false;
  }
  if (imageUploadCooldownSeconds.value > 0) {
    showModal('warning', '图片上传太频繁', `请 ${imageUploadCooldownLabel.value}`);
    return false;
  }
  if (isUploadingPostImage.value || isSubmitting.value) return false;
  return true;
};

const togglePostImageSourceMenu = () => {
  if (!ensureCanAddPostImage()) {
    showPostImageSourceMenu.value = false;
    return;
  }
  showPostImageSourceMenu.value = !showPostImageSourceMenu.value;
};

const closePostImageSourceMenu = () => {
  showPostImageSourceMenu.value = false;
};

const openPostImagePicker = (triggerPicker) => {
  if (!ensureCanAddPostImage()) return;
  showPostImageSourceMenu.value = false;
  if (typeof triggerPicker === 'function') {
    triggerPicker();
  }
};

const openPostCamera = (triggerCamera) => {
  if (!ensureCanAddPostImage()) return;
  showPostImageSourceMenu.value = false;
  if (typeof triggerCamera === 'function') {
    triggerCamera();
  }
};

const revokePostImagePreview = (image) => {
  const previewUrl = String(image?.localPreviewUrl || '').trim();
  if (!previewUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  try { URL.revokeObjectURL(previewUrl); } catch { /* ignore */ }
};

const updatePendingPostImage = (uploadId, patch = {}) => {
  const index = postImages.value.findIndex((image) => image.uploadId === uploadId);
  if (index < 0) return null;
  const current = postImages.value[index];
  const next = { ...current, ...patch, sortOrder: index };
  const images = [...postImages.value];
  images[index] = next;
  postImages.value = images;
  return next;
};

const handlePostImageSelection = async (payload) => {
  const files = Array.from(payload?.files || payload?.event?.target?.files || payload?.target?.files || []);
  if (!files.length) return;

  const remaining = Math.max(0, FORUM_POST_IMAGE_MAX_COUNT - postImages.value.length);
  if (remaining <= 0) {
    showModal('warning', '图片已满', `每个帖子最多发布 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片`);
    return;
  }

  const selectedFiles = files.slice(0, remaining);
  if (files.length > remaining) {
    showModal('warning', '图片数量已限制', `每个帖子最多发布 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片，多余图片未处理`);
  }

  const batchKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pendingImages = selectedFiles.map((file, fileIndex) => {
    let localPreviewUrl = '';
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try { localPreviewUrl = URL.createObjectURL(file); } catch { /* ignore */ }
    }
    return {
      id: `uploading-${batchKey}-${fileIndex}`,
      uploadId: `uploading-${batchKey}-${fileIndex}`,
      name: String(file?.name || `第 ${fileIndex + 1} 张图片`).trim(),
      file,
      url: localPreviewUrl,
      localPreviewUrl,
      uploadStatus: 'staged',
      uploadStatusLabel: '',
      sortOrder: postImages.value.length + fileIndex
    };
  });
  postImages.value = normalizePostImageSortState([...postImages.value, ...pendingImages]);

  // 选图后立刻后台预热「压缩 → 检测(串行) → 上传(并发)」，点发布时多半已就绪
  postImageUploadStatus.value = '';
  // 模型预载与压缩并行（幂等），避免第一张图检测时阻塞等待 NSFW 模型 CDN 下载
  scheduleForumImageModerationPreload({ immediate: true });
  // D2：预热推迟 300ms 启动，躲开相册关闭动画与主线程峰值；批次内过滤已移除的图
  if (draftPipelineDebounceTimer) clearTimeout(draftPipelineDebounceTimer);
  const batchImages = pendingImages;
  draftPipelineDebounceTimer = setTimeout(() => {
    draftPipelineDebounceTimer = null;
    batchImages.forEach((img, idx) => {
      if (!postImages.value.some((x) => x.uploadId === img.uploadId)) return;
      scheduleDraftImagePipeline(img, idx, batchImages.length);
    });
  }, 300);
};

const retryPostImageUpload = async (image, index) => {
  const retryFile = image?.file;
  if (!retryFile) {
    showModal('warning', '无法重试', '这张图片缺少本地文件，请重新选择');
    return;
  }
  // 临时移除失败图片，保留原位置信息
  revokePostImagePreview(image);
  const before = postImages.value.slice(0, index);
  const after = postImages.value.slice(index + 1);
  postImages.value = normalizePostImageSortState([...before, ...after]);
  // 重试上传并插入回原位置
  const previousCount = postImages.value.length;
  await handlePostImageSelection({ files: [retryFile] });
  // 将新上传的图片移回原位置
  if (postImages.value.length > previousCount) {
    const newImages = postImages.value.slice(previousCount);
    postImages.value = normalizePostImageSortState(
      restoreImageAtPosition(postImages.value.slice(0, previousCount), newImages, index)
    );
  }
};

// ===== 边选边传：选图后立刻后台预热「压缩 → 检测(全局串行) → 上传(网络层并发)」 =====
// 用户打字期间图片往往已传完，点发布时只需等待剩余部分 + 一次发帖 RPC，感知接近秒发。
// 取消发帖/移除图片时中断对应预热；已传完但未发帖的图由 cloudinary_pending_uploads 兜底清理。
const DRAFT_PIPELINE_FAILED = 'DRAFT_IMAGE_PIPELINE_FAILED';
const draftImagePipelines = new Map(); // uploadId -> { state, file, moderation, data, error, promise, signal, controller, cleanupPending, cancelled }
let draftPipelineChain = Promise.resolve(); // 检测锁：仅检测（WebGL classify）串行，避免移动端 GPU/内存并发崩溃
let draftPipelineDebounceTimer = null; // D2：选图预热 300ms debounce

// A2 压缩并发池：压缩跑在 browser-image-compression 的 Web Worker 里，天然可并行；
// 与检测解耦后，第 N 张的压缩可与第 N-1 张的检测重叠执行，多图总耗时从「压缩+检测之和」
// 变为「两者取 max」。检测仍严格串行。低端机（deviceMemory<4）降回 1 路保内存。
const COMPRESSION_CONCURRENCY = (() => {
  try { return Number(navigator.deviceMemory || 8) < 4 ? 1 : 2; } catch { return 2; }
})();
let activeCompressions = 0;
const compressionWaitQueue = [];
const acquireCompressionSlot = () => new Promise((resolve) => {
  if (activeCompressions < COMPRESSION_CONCURRENCY) { activeCompressions += 1; resolve(); return; }
  compressionWaitQueue.push(resolve);
});
const releaseCompressionSlot = () => {
  activeCompressions -= 1;
  const next = compressionWaitQueue.shift();
  if (next) { activeCompressions += 1; next(); }
};

const scheduleDraftImagePipeline = (img, index, total) => {
  const uploadId = String(img?.uploadId || '').trim();
  const file = img?.file;
  if (!uploadId || !file) return;
  // 已失败的旧管线必须先删除再重建：否则重试时被下方守卫拦截，
  // 发布循环永远拿到已 settled 的失败 promise → 重试立即再失败（重试失效根因）。
  // 进行中（pending/preparing/uploading/done）的管线不重复调度。
  const existing = draftImagePipelines.get(uploadId);
  if (existing) {
    if (existing.state !== 'failed') return;
    draftImagePipelines.delete(uploadId);
  }
  const controller = new AbortController();
  const entry = {
    uploadId,
    state: 'pending',
    file: null,
    moderation: null,
    data: null,
    error: null,
    promise: null,
    progress: 0, // 0~1：压缩 0-0.35，检测 0.35-0.5，上传 0.5-1.0（供发布进度聚合）
    signal: controller.signal,
    controller,
    cleanupPending: false,
    cancelled: false
  };
  draftImagePipelines.set(uploadId, entry);
  // 阶段一 A：压缩进 2 路并发池（Web Worker 内执行，不占检测串行链）
  const compressionPromise = (async () => {
    await acquireCompressionSlot();
    try {
      if (entry.cancelled) throw Object.assign(new Error('已取消'), { code: DRAFT_PIPELINE_FAILED });
      entry.state = 'preparing';
      // quiet: 预热阶段不向编辑器写「优化中/待审核」等中间状态（设计意图：图片上不显示加载态）
      const prepared = await prepareForumImageForUpload(file, index, total, uploadId, {
        signal: entry.signal,
        quiet: true,
        onProgress: (p) => { entry.progress = Math.min(0.35, Math.max(0, (Number(p || 0) / 100)) * 0.35); }
      });
      entry.progress = 0.35; // 压缩完成，等待/进入检测
      return prepared;
    } finally {
      releaseCompressionSlot();
    }
  })();
  // 阶段一 B：检测挂在全局串行链末尾（WebGL classify 不并发）；链任务内先等本张压缩完成——
  // 压缩与上一张的检测重叠执行，多图总耗时 ≈ max(压缩流水, 检测串行和) 而非两者相加
  const preparePromise = draftPipelineChain.then(async () => {
    if (entry.cancelled) throw Object.assign(new Error('已取消'), { code: DRAFT_PIPELINE_FAILED });
    try {
      entry.file = await compressionPromise;
      entry.moderation = await moderateForumImage(entry.file);
      if (entry.moderation?.status !== 'approved') {
        const err = new Error(entry.moderation?.reason || '图片未通过安全检测');
        err.code = 'BETA5_IMAGE_PIPELINE_FAILED';
        throw err;
      }
      entry.progress = 0.5; // 检测完成，进入上传
    } catch (error) {
      if (!entry.cancelled && error?.code !== DRAFT_PIPELINE_FAILED) {
        entry.state = 'failed';
        entry.error = error;
        updatePendingPostImage(uploadId, {
          uploadStatus: 'failed',
          uploadStatusLabel: '处理失败',
          uploadError: error?.message || '图片处理失败'
        });
      }
      throw error;
    }
  });
  // 链式推进：无论本张成功/失败/取消，都让下一张的检测继续（压缩不受链约束）
  draftPipelineChain = preparePromise.catch(() => {});
  // 阶段二：上传进入全局并发队列（仅网络层并发），不占串行链，不阻塞下一张的压缩/检测
  entry.promise = preparePromise.then(async () => {
    if (entry.cancelled) return entry;
    const uploadPromise = uploadApprovedForumImageQueued(entry.file, entry.moderation, {
      signal: entry.signal,
      onProgress: (p) => { entry.progress = 0.5 + Math.min(1, Math.max(0, Number(p || 0) / 100)) * 0.5; }
    });
    entry.uploadPromise = uploadPromise;
    entry.state = 'uploading';
    try {
      const result = await uploadPromise;
      if (entry.cancelled) return entry;
      if (!result?.ok) {
        const err = result?.error || new Error('图片上传失败');
        if (err?.code === 'CLOUDINARY_UPLOAD_RATE_LIMIT') applyImageUploadRateLimitCooldown(err);
        err.code = err?.code || 'IMAGE_UPLOAD_FAILED';
        throw err;
      }
      entry.state = 'done';
      entry.data = result.data;
      updatePendingPostImage(uploadId, {
        ...result.data,
        uploadStatus: 'approved',
        uploadStatusLabel: '已就绪',
        file: entry.file
      });
    } catch (error) {
      if (!entry.cancelled) {
        entry.state = 'failed';
        entry.error = error;
        updatePendingPostImage(uploadId, {
          uploadStatus: 'failed',
          uploadStatusLabel: '上传失败',
          uploadError: error?.message || '图片上传失败'
        });
      }
    }
    return entry;
  });
  // 兜底：取消/失败均吞掉，等待发布路径或清理路径消费
  entry.promise.catch(() => {});
};

const cancelDraftImagePipeline = (uploadId) => {
  const entry = draftImagePipelines.get(uploadId);
  if (!entry) return null;
  entry.cancelled = true;
  // 上传进行中：不 abort 网络请求，让其自然完成并登记 pending（孤儿图由 Edge Function 兜底清理），
  // 同时标记不再走云端删除（避免 pending 登记与删除竞态）
  if (entry.state === 'uploading') {
    entry.cleanupPending = true;
    entry.uploadPromise?.catch(() => {});
  } else {
    try { entry.controller.abort(); } catch { /* ignore */ }
  }
  draftImagePipelines.delete(uploadId);
  return entry;
};

const clearAllDraftImagePipelines = () => {
  if (draftPipelineDebounceTimer) {
    clearTimeout(draftPipelineDebounceTimer);
    draftPipelineDebounceTimer = null;
  }
  for (const uploadId of [...draftImagePipelines.keys()]) {
    cancelDraftImagePipeline(uploadId);
  }
};

const prepareForumImageForUpload = async (file, fileIndex, totalCount, uploadId = '', options = {}) => {
  const plan = await getImageCompressionPlan(file, { optimizeForUpload: true });
  if (!plan.shouldCompress) return file;

  if (!plan.canCompress) {
    throw new Error('图片超过上传限制，且当前格式不支持自动压缩，请换成 JPG、PNG 或 WebP 后重试');
  }

  const actionLabel = plan.shouldOptimize ? '正在优化' : '正在压缩';
  // quiet（Beta5 预热管线）：不向编辑器写「优化中/压缩中/待审核」中间状态，
  // 图片上不显示任何加载态（设计意图：真实进度只在灵动岛展示）
  if (!options.quiet) {
    updatePendingPostImage(uploadId, {
      uploadStatus: 'optimizing',
      uploadStatusLabel: plan.shouldOptimize ? '优化中' : '压缩中'
    });
    postImageUploadStatus.value = `${actionLabel}第 ${fileIndex + 1}/${totalCount} 张图片...`;
  }
  const compressedFile = await compressImageFileToUploadLimit(file, plan, {
    onProgress: options.onProgress,
    signal: options.signal
  });
  if (Number(compressedFile.size || 0) > Number(plan.maxSizeBytes || 0)) {
    throw new Error(`压缩后仍超过限制（${formatImageFileSize(compressedFile.size)}），请手动压缩后再上传`);
  }
  if (!options.quiet) {
    updatePendingPostImage(uploadId, {
      uploadStatus: 'queued',
      uploadStatusLabel: '待审核'
    });
  }
  return compressedFile;
};

const normalizePostImageSortState = (images = []) => {
  const source = Array.isArray(images) ? images : [];
  return source.map((item, itemIndex) => ({
    ...item,
    sortOrder: itemIndex
  }));
};

const removePostImage = async (image, index) => {
  const pipeline = cancelDraftImagePipeline(image?.uploadId);
  revokePostImagePreview(image);
  const nextImages = postImages.value.filter((_, itemIndex) => itemIndex !== index);
  postImages.value = normalizePostImageSortState(nextImages);
  // 正在上传中的预热让其自然完成并登记 pending（云端兜底清理），不再走云端删除避免竞态
  if (pipeline?.cleanupPending) return;
  await cleanupUploadedForumImage(image, { silent: false });
};

const reorderPostImage = ({ fromIndex, toIndex } = {}) => {
  const from = Number(fromIndex);
  const to = Number(toIndex);
  const total = postImages.value.length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;
  if (from < 0 || from >= total || to < 0 || to >= total || from === to) return;
  const images = [...postImages.value];
  const [moved] = images.splice(from, 1);
  images.splice(to, 0, moved);
  postImages.value = normalizePostImageSortState(images);
};

const cleanupUploadedForumImage = async (image, { silent = true } = {}) => {
  const lockKey = String(image?.deleteToken || image?.publicId || image?.originalUrl || image?.url || '').trim();
  if (!lockKey || postImageCleanupLocks.has(lockKey)) return { ok: true, skipped: true };
  postImageCleanupLocks.add(lockKey);
  try {
    const result = await deleteUploadedForumImage(image);
    if (!result.ok && !silent) {
      showModal('warning', '图片清理失败', result.error?.message || '云端图片删除失败，请稍后在 Cloudinary 后台检查');
    }
    return result;
  } finally {
    postImageCleanupLocks.delete(lockKey);
  }
};

const cleanupDraftPostImages = async ({ silent = true } = {}) => {
  const images = [...postImages.value];
  if (!images.length) return;
  await Promise.allSettled(
    images.map((image) => cleanupUploadedForumImage(image, { silent }))
  );
};

const clearPostImages = ({ cleanup = false, silent = true } = {}) => {
  const images = [...postImages.value];
  // 先收集正在上传中的管线（cancel 后 entry 已从 map 移除，需提前标记）
  const pendingCleanupIds = new Set(
    images.filter((image) => draftImagePipelines.get(image?.uploadId)?.state === 'uploading').map((image) => image.uploadId)
  );
  clearAllDraftImagePipelines();
  images.forEach(revokePostImagePreview);
  postImages.value = [];
  postImageUploadStatus.value = '';
  if (cleanup && images.length) {
    // 正在上传中的预热让其自然完成并登记 pending（云端兜底清理），不再走云端删除避免竞态
    void Promise.allSettled(
      images
        .filter((image) => !pendingCleanupIds.has(image?.uploadId))
        .map((image) => cleanupUploadedForumImage(image, { silent }))
    );
  }
};

const discardDraftPostImages = async ({ silent = true } = {}) => {
  await cleanupDraftPostImages({ silent });
  clearPostImages({ cleanup: false });
};

// 移动端判断（窄屏档；竖屏编辑器形态由 forum-viewport 单源判据驱动，不在此处手算）
const MOBILE_BREAKPOINT = 768;
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false);
let resizeRafId = null;
const updateMobileStatus = () => {
  if (resizeRafId) return;
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT;
  });
};

// 离开竖屏编辑器（旋转/尺寸切换）时的安全关闭：
// 不再直接置 isMobileComposerOpen=false（会绕过 closeMobileComposer 的保存确认链，
// 且退出后 beforeunload 不再拦截），改为静默落草稿再关闭，不弹确认框。
const leaveMobileComposerForViewportSwitch = () => {
  if (hasUnsavedChanges()) {
    persistPostDraft();
    clearPostDraftSaveTimer();
    void savePostDraftToDatabase(savedPostDraft.value);
    logger.debug('forum', '视口切换：已静默保存发帖草稿');
  }
  closePostImageSourceMenu();
  closeMobileDraftPanel();
  isMobileComposerOpen.value = false;
};

// 竖屏编辑器形态切换（单源 matchMedia 驱动，旋转/窗口尺寸变化均会触发）
let releaseComposerModeWatch = null;
const handleComposerModeChange = (matches) => {
  const prevComposerMode = isMobileComposerMode.value;
  isMobileComposerMode.value = matches;
  // 从竖屏编辑器切换到桌面形态时关闭全屏编辑器，防止横屏出现竖屏样式的编辑器
  if (prevComposerMode && !matches && isMobileComposerOpen.value) {
    leaveMobileComposerForViewportSwitch();
  }
};

if (typeof window !== 'undefined') {
  updateMobileStatus();
  releaseComposerModeWatch = onForumPortraitComposerChange(handleComposerModeChange);
}

const isForumComposerFabVisible = computed(() => {
  if (!isMobileComposerMode.value || feedMode.value !== 'posts') return false;
  if (!props.embedded) return true;
  // 2026-09-22 首页社区化改版：嵌入式论坛的宿主是首页（UserSpace 不再有社区 tab）。
  // 论坛在首页由 v-show 挂着，只有当前停在「最新/关注/新闻/活动」这类 feed 分区时才露 FAB。
  if (route.path !== '/') return false;
  const view = getQueryString(route.query.view);
  return view === '' || isForumFeedSection(view);
});

const openMobileComposer = () => {
  feedMode.value = 'posts';
  closePostImageSourceMenu();
  isMobileComposerOpen.value = true;
};

// 外部搜索入口（横屏左栏）：embedded 下论坛工具栏常驻，滚到搜索框并聚焦。
// 工具栏未渲染时静默返回 false，不抛错、不新增状态。
const focusForumSearch = () => {
  if (typeof document === 'undefined') return false;
  const input = document.querySelector('.forum-page .toolbar-search-input');
  if (!(input instanceof HTMLInputElement)) return false;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
  return true;
};

// ✨ 新增：取消确认逻辑（询问是否保存草稿）
const closeMobileComposer = async () => {
  // 检查是否有未保存的内容
  if (hasUnsavedChanges()) {
    // 弹出确认框询问是否保存草稿
    const shouldSave = await requestConfirm({
      title: '保存草稿',
      message: '是否将当前编辑内容保存为草稿？',
      confirmText: '保存',
      cancelText: '不保存'
    });

    if (shouldSave) {
      // 用户确认保存
      persistPostDraft();
      clearPostDraftSaveTimer();
      await savePostDraftToDatabase(savedPostDraft.value);
      logger.debug('forum', '用户选择保存草稿并关闭编辑器');
    } else {
      // “不保存”不仅要清空编辑器，也要删除本地和云端的旧草稿。
      void clearPostDraft();
      newPost.value = { title: '', content: '' };
      selectedPostTag.value = 'daily';
      postLocation.value = null;
      clearPostImages({ cleanup: true });
      logger.debug('forum', '用户选择不保存草稿并关闭编辑器');
    }
  }

  closePostImageSourceMenu();
  closeMobileDraftPanel();
  isMobileComposerOpen.value = false;
};

const handleThemeChange = (theme, _preference, uiStyle = themeManager.getUiStyle?.() || currentUiStyle.value) => {
  currentTheme.value = theme;
  currentUiStyle.value = uiStyle;
};

// 处理刷新请求：重置状态并重新加载论坛数据
const handleForumRefreshRequest = () => {
  // 重置页码和状态
  currentPage.value = 1;
  nextPageCursor.value = '';
  hasMoreData.value = true;
  forumLoadError.value = '';
  searchQuery.value = '';
  searchKeyword.value = '';
  // 重新加载论坛数据
  fetchForumData();
  // 滚动到顶部
  scrollForumTo(0);
};

const handleForumPostDeleted = (event) => {
  const postId = String(event?.detail?.postId || '').trim();
  if (!postId) return;

  const previousPosts = forumData.value;
  const remainingPosts = previousPosts.filter((post) => String(post?.id || '') !== postId);
  if (remainingPosts.length !== previousPosts.length) {
    forumData.value = remainingPosts;
    expandedPostIds.value.delete(postId);
    if (activeReplyTarget.value?.postId === postId) {
      activeReplyTarget.value = null;
      replyContent.value = '';
    }
  }

  clearForumFeedSnapshots();
  persistForumFeedSnapshot();
};

// 弹窗模式下列表不卸载：详情内编辑/点赞/评论后经此事件原地 patch 卡片（不可变更新触发 shallowRef）
const handleForumPostUpdated = (event) => {
  const detail = event?.detail || {};
  const postId = String(detail.postId || '').trim();
  const updated = detail.post;
  if (!postId || !updated) return;

  let patched = false;
  const nextPosts = (forumData.value || []).map((item) => {
    if (String(item?.id || '') !== postId) return item;
    patched = true;
    return {
      ...item,
      title: updated.title ?? item.title,
      content: updated.content ?? item.content,
      body: updated.body ?? item.body,
      tag: updated.tag ?? item.tag,
      location_name: updated.location_name ?? item.location_name,
      status: updated.status ?? item.status,
      like_count: Number(updated.like_count ?? item.like_count ?? 0),
      comment_count: Number(updated.comment_count ?? item.comment_count ?? 0),
      updated_at: updated.updated_at ?? item.updated_at
    };
  });

  if (patched) {
    forumData.value = nextPosts;
    persistForumFeedSnapshot();
  }
};

onMounted(() => {
  currentTheme.value = readActiveForumTheme();
  currentUiStyle.value = themeManager.getUiStyle?.() || 'glass';
  themeManager.addListener(handleThemeChange);
  if (forumPageRef.value && typeof IntersectionObserver !== 'undefined') {
    anniversaryObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          showAnniversaryBg.value = true;
          anniversaryObserver?.disconnect();
          anniversaryObserver = null;
        }
      });
    }, { rootMargin: '100px' });
    anniversaryObserver.observe(forumPageRef.value);
  } else {
    showAnniversaryBg.value = true;
  }
  restorePostDraft();
  // ✨ 移除：startAutoSaveDraftTimer()调用（改为手动保存）
  // startAutoSaveDraftTimer();
  window.addEventListener('resize', updateMobileStatus);
  window.addEventListener('orientationchange', updateMobileStatus);
  document.addEventListener('click', closePostImageSourceMenu);
  // 监听刷新请求事件（从导航栏点击"我的方块"时触发）
  window.addEventListener('boh_forum_refresh_request', handleForumRefreshRequest);
  window.addEventListener('boh:forum-post-deleted', handleForumPostDeleted);
  window.addEventListener('boh:forum-post-updated', handleForumPostUpdated);
  // ✨ 新增：beforeunload事件监听（刷新页面时提示保存草稿）
  window.addEventListener('beforeunload', handleBeforeUnload);

  void initializeForumData();
  setupForumLoadMoreObserver();
  setupForumWindowObserver();
  loadForumWeeklyReport();
  loadActiveAds();
  if (isLoggedIn.value) {
    loadWeeklyCheckinStatus();
    scheduleForumImageModerationPreload();
  }
});

onActivated(() => {
  if (!props.embedded) return;
  const savedReturnState = readForumReturnState(getForumReturnKey());
  if (savedReturnState) {
    scrollForumTo(Math.max(0, Number(savedReturnState.scrollY || 0)));
    clearForumReturnState(getForumReturnKey());
  }
  updateMobileStatus();
  setupForumLoadMoreObserver();
  setupForumWindowObserverOnce();
  if (
    postCooldownUntil.value > Date.now()
    || replyCooldownUntil.value > Date.now()
    || imageUploadCooldownUntil.value > Date.now()
  ) {
    ensureCooldownTimer();
  }
  if (isLoggedIn.value) {
    scheduleForumImageModerationPreload();
  }
});

onDeactivated(() => {
  if (!props.embedded) return;
  cancelIdleReplyPrefetch();
  cleanupForumLoadMoreObserver();
  cleanupForumWindowObserver();
  clearForumImageModerationPreloadTask();
  if (forumImageLazyObserver) {
    forumImageLazyObserver.disconnect();
    forumImageLazyObserver = null;
  }
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  closePostImageSourceMenu();
  document.body.style.overflow = '';
});

onUnmounted(() => {
  cancelIdleReplyPrefetch();
  stopForumVirtualFeed();
  anniversaryObserver?.disconnect();
  anniversaryObserver = null;
  themeManager.removeListener(handleThemeChange);
  clearForumImageModerationPreloadTask();
  // ✨ 移除：clearAutoSaveDraftTimer()调用（函数已不存在）
  // clearAutoSaveDraftTimer();
  forumFetchAbortController?.abort?.();
  forumFetchAbortController = null;
  releaseComposerModeWatch?.();
  releaseComposerModeWatch = null;
  window.removeEventListener('resize', updateMobileStatus);
  window.removeEventListener('orientationchange', updateMobileStatus);
  window.removeEventListener('boh_forum_refresh_request', handleForumRefreshRequest);
  window.removeEventListener('boh:forum-post-deleted', handleForumPostDeleted);
  window.removeEventListener('boh:forum-post-updated', handleForumPostUpdated);
  // ✨ 新增：移除beforeunload事件监听
  window.removeEventListener('beforeunload', handleBeforeUnload);
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  document.removeEventListener('click', closePostImageSourceMenu);
  document.body.style.overflow = '';
  void discardDraftPostImages({ silent: true });
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  if (postDraftSaveTimer) {
    clearTimeout(postDraftSaveTimer);
    postDraftSaveTimer = null;
  }
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  uiAnimationTimers.forEach((timer) => clearTimeout(timer));
  uiAnimationTimers.clear();
  if (forumImageLazyObserver) {
    forumImageLazyObserver.disconnect();
    forumImageLazyObserver = null;
  }
  closeConfirm(false);
});

watch(isMobileComposerOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
  // 用户打开编辑器即为发图意图信号，移动端此时才开始预载检测模型
  if (isOpen) scheduleForumImageModerationPreload({ immediate: true });
});

watch(isLoggedIn, (loggedIn) => {
  if (postDraftSaveTimer) {
    clearTimeout(postDraftSaveTimer);
    postDraftSaveTimer = null;
  }
  if (loggedIn) {
    loadWeeklyCheckinStatus();
    restorePostDraft();
    scheduleForumImageModerationPreload();
    return;
  }
  void discardDraftPostImages({ silent: true });
  weeklyCheckinStatus.value = createDefaultWeeklyCheckinStatus();
  feedMode.value = 'posts';
  restorePostDraft();
});

watch(
  () => userInfo.id,
  (userId, previousUserId) => {
    if (postDraftSaveTimer) {
      clearTimeout(postDraftSaveTimer);
      postDraftSaveTimer = null;
    }
    if (previousUserId && previousUserId !== userId) {
      void discardDraftPostImages({ silent: true });
    }
    if (isLoggedIn.value && userId) {
      loadWeeklyCheckinStatus();
    }
    restorePostDraft();
  }
);

// ✨ 移除：watch自动保存草稿（改为手动保存）
// watch(
//   () => [newPost.value.title, newPost.value.content, selectedPostTag.value],
//   () => {
//     persistPostDraft();
//   }
// );

watch(
  () => [forumData.value.length, feedMode.value, hasMoreData.value, isLoading.value],
  () => {
    setupForumWindowObserverOnce();
  },
  { flush: 'post' }
);

// 外部 feed 接管（用户空间社区段控）：latest/following/news/activity → 关注态 + 内容类型一次同步（单次 fetch）
watch(() => props.externalFeed, (val) => {
  const nextFollowing = val === 'following';
  const nextKind = (val === 'news' || val === 'activity') ? val : '';
  if (nextFollowing && !isLoggedIn.value) return; // 与 setFeedMode 一致：关注流需登录
  if (showFollowingOnly.value === nextFollowing && selectedContentType.value === nextKind) return;
  showFollowingOnly.value = nextFollowing;
  selectedContentType.value = nextKind;
  feedMode.value = 'posts';
  /* ⚠️ 必须延到本组件 setup 跑完之后再取数（微任务即可）：
     immediate 会在 setup 中途同步回调，而 fetchForumData 是下方才声明的 const
     —— 直接调用就是 TDZ ReferenceError（Cannot access 'fetchForumData' before initialization）。
     实测触发路径：点「关注 / 新闻 / 活动」→ 这里进不去前面的 early return → 整页被
     全局错误边界接管成「页面出了问题」。状态同步赋值保持同步（首帧样式不吃延迟）。 */
  void Promise.resolve().then(() => fetchForumData());
}, { immediate: true });

watch(showFollowingOnly, (val) => {
  if (val && viewMode.value === 'my') {
    viewMode.value = 'all';
  }
});

watch(
  () => [viewMode.value, sortMode.value, searchKeyword.value, selectedTagFilter.value],
  () => {
    if (viewMode.value === 'my') {
      showFollowingOnly.value = false;
    }
    activeForumWindowIndex.value = 0;
  }
);

// 帖子列表预览：保留用户原始排版，溢出交给 CSS 控制。
const LIST_BODY_PREVIEW_CHAR_LIMIT = 180;
const LIST_BODY_PREVIEW_LINE_LIMIT = 5;

const extractPostTitle = (postOrContent) => {
  if (postOrContent && typeof postOrContent === 'object') {
    const explicitTitle = String(postOrContent.title || '').trim();
    if (explicitTitle) return explicitTitle;
  }
  const rawContent = postOrContent && typeof postOrContent === 'object'
    ? postOrContent.content
    : postOrContent;
  const safeContent = String(rawContent || '').trim();
  return safeContent.match(/【(.*?)】/)?.[1] || '无标题';
};

const stripLegacyTitlePrefix = (body = '', title = '') => {
  const safeBody = String(body || '').trim();
  const safeTitle = String(title || '').trim();
  if (!safeBody) return '';
  if (!safeTitle) return safeBody.replace(/^【[^】]+】\s*/, '');
  const titlePattern = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeBody.replace(new RegExp(`^【\\s*${titlePattern}\\s*】\\s*`), '');
};

const extractPostBody = (postOrContent) => {
  const title = extractPostTitle(postOrContent);
  if (postOrContent && typeof postOrContent === 'object') {
    const explicitBody = String(postOrContent.body || '').trim();
    if (explicitBody) return stripLegacyTitlePrefix(explicitBody, title);
    postOrContent = postOrContent.content;
  }
  const rawContent = postOrContent;
  return stripLegacyTitlePrefix(String(rawContent || '').replace(/【.*?】\n?/, ''), title);
};

const isBodyPreviewOverflowLikely = (content = '') => {
  const text = String(content || '');
  if (text.length > LIST_BODY_PREVIEW_CHAR_LIMIT) return true;
  return text.split(/\r\n|\r|\n/).length > LIST_BODY_PREVIEW_LINE_LIMIT;
};

const getPostImages = (post) => {
  const images = Array.isArray(post?.images)
    ? post.images.filter((image) => image?.url)
    : [];
  if (images.length) return images;

  const coverUrl = String(post?.cover_image_url || post?.coverImageUrl || '').trim();
  if (!coverUrl) return [];
  const rawCoverUrl = String(post?.cover_image_url_raw || coverUrl).trim();
  // 官方卡（新闻/活动镜像）的 cover_image_url 可能是新闻/活动库里的 Vite 资源引用
  // （如 @/assets/images/xxx.webp，老数据为 .png，同目录有同名 webp 兜底），
  // 必须经 getImageUrl 解析成打包 URL，否则 <img> 直接裂图；data:/http 原样直通。
  const resolvedCoverUrl = getImageUrl(coverUrl, { silent: true }) || coverUrl;
  const resolvedRawCoverUrl = getImageUrl(rawCoverUrl, { silent: true }) || rawCoverUrl;
  return [{
    id: `${String(post?.id || 'post').trim() || 'post'}-cover`,
    url: getCloudinaryTransformedUrl(resolvedCoverUrl, FORUM_LIST_IMAGE_TRANSFORM),
    originalUrl: resolvedRawCoverUrl,
    detailUrl: getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_DETAIL_IMAGE_TRANSFORM),
    srcset: [
      `${getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM_SM)} 360w`,
      `${getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM_MD)} 540w`,
      `${getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM)} 720w`
    ].join(', '),
    lqipUrl: getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_LQIP_TRANSFORM),
    width: Number(post?.cover_image_width || post?.coverImageWidth || 0),
    height: Number(post?.cover_image_height || post?.coverImageHeight || 0),
    sortOrder: 0
  }];
};

const FORUM_IMAGE_LAZY_ROOT_MARGIN = '300px 0px';
const FORUM_IMAGE_LAZY_THRESHOLD = 0.01;
let forumImageLazyObserver = null;

const getForumImageLazyObserver = () => {
  if (forumImageLazyObserver) return forumImageLazyObserver;
  if (typeof IntersectionObserver === 'undefined') return null;
  forumImageLazyObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      const src = img.dataset.lazySrc;
      const srcset = img.dataset.lazySrcset;
      if (src) {
        img.src = src;
        delete img.dataset.lazySrc;
      }
      if (srcset) {
        img.srcset = srcset;
        delete img.dataset.lazySrcset;
      }
      forumImageLazyObserver.unobserve(img);
    }
  }, { rootMargin: FORUM_IMAGE_LAZY_ROOT_MARGIN, threshold: FORUM_IMAGE_LAZY_THRESHOLD });
  return forumImageLazyObserver;
};

const observeForumLazyImage = (el) => {
  if (!el || !el.dataset?.lazySrc) return;
  const observer = getForumImageLazyObserver();
  if (observer) {
    observer.observe(el);
  } else {
    el.src = el.dataset.lazySrc;
    if (el.dataset.lazySrcset) el.srcset = el.dataset.lazySrcset;
  }
};

const prepareForumPostForDisplay = (post, index = 0) => {
  const preparedPost = { ...post };
  const isEager = index < 1;
  // 全量图列表（单一来源）：列表 RPC 最多只回 4 张（SQL limit 4），横向图片条
  // 直接渲染它；滚近末尾/打开大图时经 ensureForumPostFullImages 按需补全剩余张数。
  // eager 仅首帖首图，首屏外开销仍由 LQIP+lazy 承担。
  const allImages = getPostImages(preparedPost).map((image, imageIndex) => ({
    ...image,
    eager: isEager && imageIndex === 0
  }));
  const imageCount = Math.max(Number(preparedPost.image_count || 0), allImages.length);

  // 转发帖（post_kind=repost）只存转发留言，原帖经 repost_of_post_id 引用，
  // 由 ensureQuotedPostsForReposts 回源后在卡片引用框展示；标题先兜底避免"无标题"
  // （normalizePostListRecord 会把无【】的 content 拆出 title='无标题'，一并排除）
  const preparedTitle = String(preparedPost.title || '').trim();
  preparedPost.displayTitle = preparedPost.post_kind === 'repost' && (!preparedTitle || preparedTitle === '无标题')
    ? '转发动态'
    : extractPostTitle(preparedPost);
  preparedPost.displayBody = extractPostBody(preparedPost);
  preparedPost.isBodyOverflowLikely = isBodyPreviewOverflowLikely(preparedPost.displayBody);
  preparedPost.tag = normalizeForumTagValue(preparedPost.tag);
  preparedPost.tagLabel = ['news', 'activity'].includes(preparedPost.post_kind)
    ? ''
    : getForumTagLabel(preparedPost.tag);
  preparedPost.allImages = allImages;
  preparedPost.hasImages = allImages.length > 0;
  preparedPost.imageCount = imageCount;
  // hiddenImageCount = 尚未拉进 allImages 的张数（列表截断所致）；横条末尾"+N 张"占位卡用它
  preparedPost.hiddenImageCount = Math.max(0, imageCount - allImages.length);
  preparedPost.hasMultipleImages = imageCount > 1;
  preparedPost.imageLoading = index < 1 ? 'eager' : 'lazy';
  return preparedPost;
};

const prepareForumPosts = (posts = [], startIndex = 0) => (
  Array.isArray(posts) ? posts
    .filter((post) => {
      const kind = post?.post_kind || (/^【新闻】/.test(String(post?.content || '')) ? 'news' : /^【活动】/.test(String(post?.content || '')) ? 'activity' : 'unknown');
      // 「论坛」= 普通帖 + 用户转发（repost），与服务端 p_kind_filter 语义一致
      return !selectedContentType.value || (selectedContentType.value === 'post'
        ? kind === 'post' || kind === 'unknown' || kind === 'repost'
        : kind === selectedContentType.value);
    })
    .map((post, index) => prepareForumPostForDisplay(post, startIndex + index)) : []
);

const hydrateOfficialPostKinds = async (posts = []) => {
  const ids = (Array.isArray(posts) ? posts : []).map((post) => post?.id).filter(Boolean);
  if (!ids.length) return posts;
  const [postMeta, newsMeta, activityMeta] = await Promise.all([
    supabase.from('posts').select('id, post_kind, cover_image_url, title').in('id', ids),
    supabase.from('news').select('title, image'),
    supabase.from('activities').select('title, image')
  ]);
  const metadata = new Map((postMeta.data || []).map((row) => [row.id, row]));
  const newsByTitle = new Map((newsMeta.data || []).map((row) => [String(row.title || '').trim(), row]));
  const activityByTitle = new Map((activityMeta.data || []).map((row) => [String(row.title || '').trim(), row]));
  return posts.map((post) => ({
    ...post,
    post_kind: metadata.get(post.id)?.post_kind || post.post_kind
      || (/^【新闻】/.test(String(post.content || '')) ? 'news'
        : /^【活动】/.test(String(post.content || '')) ? 'activity'
          : newsByTitle.has(String(post.title || '').trim()) ? 'news'
            : activityByTitle.has(String(post.title || '').trim()) ? 'activity' : 'unknown'),
    cover_image_url: post.cover_image_url
      || metadata.get(post.id)?.cover_image_url
      || newsByTitle.get(String(post.title || '').trim())?.image
      || activityByTitle.get(String(post.title || '').trim())?.image
      || ''
  }));
};

const getForumFeedSnapshotKey = () => buildForumFeedSnapshotKey({
  userId: isLoggedIn.value ? userInfo.id : 'guest',
  viewMode: viewMode.value,
  sortMode: sortMode.value,
  searchKeyword: searchKeyword.value,
  tagFilter: selectedTagFilter.value,
  contentType: selectedContentType.value,
  followingOnly: showFollowingOnly.value
});

const persistForumFeedSnapshot = () => {
  if (feedMode.value !== 'posts' || forumLoadError.value) return;
  // 乐观帖不落快照，避免刷新后残留
  const snapshotPosts = forumData.value.filter(p=> !p._optimistic);
  writeForumFeedSnapshot(getForumFeedSnapshotKey(), {
    posts: snapshotPosts,
    currentPage: currentPage.value,
    nextPageCursor: nextPageCursor.value,
    hasMoreData: hasMoreData.value
  });
};

// 大图浏览器图片匹配键：以原图 URL 为准（列表预览与按需补全的 transforms 不同）
const forumImageMatchKey = (image) => String(image?.originalUrl || image?.url || '').trim();

const resolveForumViewerStartIndex = (images, target) => {
  const wanted = forumImageMatchKey(target);
  if (!wanted) return 0;
  const at = images.findIndex((image) => forumImageMatchKey(image) === wanted);
  return at >= 0 ? at : 0;
};

// 按需补全帖子全量图片（唯一入口，横向图片条滚近末尾与大图打开共用）：
// 列表 RPC 只回 4 张，超过部分从 forum_post_images 表取。in-flight 去重防滚动抖动重复请求。
const forumFullImagesInFlight = new Set();
const ensureForumPostFullImages = async (post) => {
  if (!post?.id || post?._optimistic) return null;
  const loadedCount = Array.isArray(post?.allImages) ? post.allImages.length : 0;
  if (!loadedCount || Number(post?.imageCount || 0) <= loadedCount) return null;
  if (forumFullImagesInFlight.has(post.id)) return null;
  forumFullImagesInFlight.add(post.id);
  try {
    const result = await getForumPostImages(post.id);
    if (!result?.ok || !Array.isArray(result.data)) return null;
    const fullImages = result.data.filter((image) => image?.url);
    if (fullImages.length <= loadedCount) return null;
    patchPostImageStats(post, fullImages);
    return fullImages;
  } finally {
    forumFullImagesInFlight.delete(post.id);
  }
};

// 横向图片条滚近末尾：补全剩余图片，占位"+N 张"卡随 hiddenImageCount 归零消失
const handleStripLoadMore = (post) => {
  void ensureForumPostFullImages(post);
};

const openForumImageViewer = (post, index = 0) => {
  const baseImages = (Array.isArray(post?.allImages) ? post.allImages : []).filter((image) => image?.url);
  if (!baseImages.length) return;
  const clickedImage = baseImages[Math.min(Math.max(Number(index || 0), 0), baseImages.length - 1)] || null;
  forumImageViewerImages.value = baseImages;
  forumImageViewerIndex.value = resolveForumViewerStartIndex(baseImages, clickedImage);
  isForumImageViewerOpen.value = true;

  // 打开时后台补全剩余图片（如有），保持当前查看的图片不动
  void (async () => {
    const fullImages = await ensureForumPostFullImages(post);
    if (!fullImages || !isForumImageViewerOpen.value) return;
    const current = forumImageViewerImages.value[forumImageViewerIndex.value] || null;
    forumImageViewerImages.value = fullImages;
    forumImageViewerIndex.value = resolveForumViewerStartIndex(fullImages, current);
  })();
};

// 回填卡片图片统计：forumData 是 shallowRef 且元素为普通对象，
// 原地改字段 + triggerRef 不会让持有同一引用的 PostCard 重渲染，
// 必须整体替换数组元素（与 updateOptimisticPost 同款模式）
const patchPostImageStats = (post, fullImages) => {
  if (!post?.id || !Array.isArray(fullImages) || !fullImages.length) return;
  const idx = forumData.value.findIndex((p) => p.id === post.id);
  if (idx < 0) return;
  const next = { ...forumData.value[idx] };
  next.allImages = fullImages;
  next.imageCount = Math.max(Number(next.imageCount || 0), fullImages.length);
  next.hiddenImageCount = Math.max(0, next.imageCount - next.allImages.length);
  const arr = [...forumData.value];
  arr[idx] = next;
  forumData.value = arr;
  triggerRef(forumData);
};

const closeForumImageViewer = () => {
  isForumImageViewerOpen.value = false;
};

// —— 转发帖引用回源 ——
// 转发帖只存转发留言，原帖靠 repost_of_post_id 引用；批量回源逻辑在
// forum/_shared.js 的 fetchQuotedPostsByIds（与个人空间帖子网格共用，真相源单一）。
// 这里只负责把回源结果 patch 进 forumData（shallowRef 须整体替换元素）。
const ensureQuotedPostsForReposts = async () => {
  const reposts = forumData.value.filter((p) => p.post_kind === 'repost'
    && p.repost_of_post_id && !p.quotedPost);
  if (!reposts.length) return;
  const map = await fetchQuotedPostsByIds(reposts.map((p) => p.repost_of_post_id));
  if (!map.size) return;

  let dirty = false;
  const arr = [...forumData.value];
  forumData.value.forEach((post, idx) => {
    if (post.post_kind === 'repost' && post.repost_of_post_id && !post.quotedPost) {
      const row = map.get(String(post.repost_of_post_id));
      if (row) {
        arr[idx] = { ...post, quotedPost: row };
        dirty = true;
      }
    }
  });
  if (dirty) {
    forumData.value = arr;
    triggerRef(forumData);
  }
};

const renderSearchExcerpt = (excerpt) => {
  const escaped = escapeHtml(excerpt);
  const withMarks = escaped.replace(/\[\[([\s\S]*?)\]\]/g, '<mark>$1</mark>');
  return DOMPurify.sanitize(withMarks, {
    ALLOWED_TAGS: ['mark'],
    ALLOWED_ATTR: []
  });
};

const weeklyCheckinProgressText = computed(() => {
  const points = WEEKLY_CHECKIN_REWARD_POINTS;
  return weeklyCheckinStatus.value.hasSignedThisWeek
    ? `本周已签 +${points} 积分`
    : `本周未签 +${points} 积分`;
});

const checkinCalendarDays = computed(() => {
  const sourceDate = weeklyCheckinStatus.value.currentWeekStart
    ? new Date(weeklyCheckinStatus.value.currentWeekStart)
    : new Date();
  const start = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const signedIndex = weeklyCheckinStatus.value.hasSignedThisWeek
    ? Math.max(0, Math.min(6, Math.floor((today.getTime() - start.getTime()) / 86400000)))
    : -1;

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: date.toISOString(),
      label: ['一', '二', '三', '四', '五', '六', '日'][index],
      day: date.getDate(),
      isToday: date.getTime() === today.getTime(),
      isSigned: index === signedIndex
    };
  });
});

const weeklyCheckinWeekDots = computed(() => (
  checkinCalendarDays.value.map((day) => ({
    key: day.key,
    today: day.isToday,
    signed: day.isSigned
  }))
));

const weeklyCheckinNextCheckin = computed(() => {
  const sourceDate = weeklyCheckinStatus.value.currentWeekStart
    ? new Date(weeklyCheckinStatus.value.currentWeekStart)
    : new Date();
  const monday = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
  const nextMonday = new Date(monday);
  nextMonday.setHours(0, 0, 0, 0);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((nextMonday.getTime() - today.getTime()) / 86400000));
  return {
    dateText: `${nextMonday.getMonth() + 1}.${nextMonday.getDate()}`,
    days
  };
});

const openWeeklyCheckinCalendar = () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  isWeeklyCheckinCalendarOpen.value = true;
};

const closeWeeklyCheckinCalendar = () => {
  isWeeklyCheckinCalendarOpen.value = false;
};

const weeklyCheckinHintText = computed(() => {
  if (!isLoggedIn.value) {
    return `登录后每周可签到一次，签到可得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分`;
  }
  if (weeklyCheckinStatus.value.hasSignedThisWeek) {
    return `本周已签到 +${WEEKLY_CHECKIN_REWARD_POINTS} 积分，下周再来`;
  }
  return `本周签到可得 +${WEEKLY_CHECKIN_REWARD_POINTS} 积分，每周一刷新`;
});

const loadWeeklyCheckinStatus = async () => {
  if (!isLoggedIn.value || !userInfo.id) {
    weeklyCheckinStatus.value = createDefaultWeeklyCheckinStatus();
    return;
  }

  isWeeklyCheckinLoading.value = true;
  try {
    const { ok, data, error } = await getWeeklyCheckinStatus(userInfo.id);
    if (!ok || error || !data) {
      logger.error('forum', '加载周签到状态失败:', error);
      return;
    }

    weeklyCheckinStatus.value = {
      ...createDefaultWeeklyCheckinStatus(),
      ...data
    };

    const currentPoints = Number(data.currentPoints);
    if (Number.isFinite(currentPoints)) {
      userInfo.points = currentPoints;
    }
  } catch (error) {
    logger.error('forum', '加载周签到状态异常:', error);
  } finally {
    isWeeklyCheckinLoading.value = false;
  }
};

const handleWeeklyCheckin = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (isWeeklyCheckinLoading.value || isWeeklyCheckinSubmitting.value) return;

  if (weeklyCheckinStatus.value.hasSignedThisWeek) {
    showModal('warning', '本周已签到', '每周仅可签到一次，请下周再来');
    return;
  }

  isWeeklyCheckinSubmitting.value = true;
  try {
    const { ok, data, error } = await submitWeeklyCheckin();
    if (!ok || error || !data) {
      throw error || new Error('签到失败，请稍后重试');
    }

    weeklyCheckinStatus.value = {
      ...createDefaultWeeklyCheckinStatus(),
      ...data
    };

    const currentPoints = Number(data.currentPoints);
    if (Number.isFinite(currentPoints)) {
      userInfo.points = currentPoints;
    }

    let successMessage;
    if (Number(data.pointsAwarded || 0) > 0) {
      successMessage = `已完成 ${data.cycleSize || 4} 周连签，获得 ${data.pointsAwarded} 积分奖励！下一轮进度 ${data.cycleProgress || 0} / ${data.cycleSize || 4}`;
      emitProfileSync({
        userId: userInfo.id,
        username: userInfo.username,
        reason: 'weekly_checkin_reward'
      });
    } else {
      successMessage = `本周签到完成，当前本轮连续 ${getWeeklyCheckinCycleProgress(data)} / ${data.cycleSize || 4} 周，再连续 ${data.nextRewardIn} 周可得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分`;
      emitProfileSync({
        userId: userInfo.id,
        username: userInfo.username,
        reason: 'weekly_checkin'
      });
    }

    closeWeeklyCheckinCalendar();
    await nextTick();
    showCheckinSuccessIsland(successMessage);
  } catch (error) {
    logger.error('forum', '周签到失败:', error);
    showModal('error', '签到失败', error?.message || '请稍后重试');
  } finally {
    isWeeklyCheckinSubmitting.value = false;
  }
};

const fetchForumData = async (isLoadMore = false, { background = false } = {}) => {
  const requestSeq = ++forumFetchSeq;
  if (!isLoadMore && forumFetchAbortController) {
    forumFetchAbortController.abort();
  }
  const abortController = new AbortController();
  forumFetchAbortController = abortController;
  if (isLoadMore) {
    isLoadingMore.value = true;
  } else if (!background) {
    isLoading.value = true;
    forumLoadError.value = '';
    hasMoreData.value = true;
    currentPage.value = 1;
    nextPageCursor.value = '';
  }

  try {
    let dataResult;
    const currentUserId = isLoggedIn.value ? userInfo.id : null;
    const pageToLoad = isLoadMore ? currentPage.value + 1 : 1;
    let followingUserIds;
    if (showFollowingOnly.value && isLoggedIn.value && viewMode.value !== 'my') {
      const followRes = await getFollowing(currentUserId);
      if (!followRes.error && Array.isArray(followRes.data)) {
        followingUserIds = followRes.data.map(f => f.id).filter(Boolean);
      }
      if (!followingUserIds || !followingUserIds.length) {
        forumData.value = [];
        hasMoreData.value = false;
        currentPage.value = 1;
        nextPageCursor.value = '';
        isLoading.value = false;
        isLoadingMore.value = false;
        return;
      }
    }
    const pagination = {
      page: pageToLoad,
      pageSize: POSTS_PER_PAGE,
      sortMode: sortMode.value,
      searchQuery: searchKeyword.value.trim(),
      tagFilter: selectedTagFilter.value,
      // 内容类型筛选下推服务端（list_forum_posts p_kind_filter），否则官方卡沉底导致筛选后空页
      kindFilter: selectedContentType.value,
      cursorMode: 'keyset',
      cursor: isLoadMore ? nextPageCursor.value : '',
      signal: abortController.signal,
      // 旧版降级查询会使用 overfetch 判断 hasMore；RPC 路径会忽略该值避免翻页错位。
      limit: POSTS_PER_PAGE + 1,
      includeUnapprovedForAuthor: viewMode.value === 'my',
      followingUserIds
    };

    if (viewMode.value === 'my' && isLoggedIn.value) {
      dataResult = await getUserPosts(userInfo.id, currentUserId, pagination);
    } else {
      dataResult = await getPosts(currentUserId, pagination);
    }

    if (requestSeq !== forumFetchSeq) return;

    // 主动取消不是失败（request-core 归一为 aborted:true + code ABORTED）：
    // 静默返回，避免把 `The operation was aborted` 渲染成论坛加载错误文案。
    if (dataResult?.aborted || dataResult?.error?.code === 'ABORTED') return;

    if (!dataResult.error && dataResult.data) {
      let safeRows = Array.isArray(dataResult.data) ? dataResult.data : [];
      safeRows = await hydrateOfficialPostKinds(safeRows);
      const hasNextCursor = String(dataResult?.nextCursor || '').trim();
      const hasNextPage = hasNextCursor
        ? true
        : (typeof dataResult.hasMore === 'boolean'
          ? dataResult.hasMore
          : safeRows.length >= POSTS_PER_PAGE);

      if (isLoadMore) {
        const existingIds = new Set(forumData.value.map(post => post.id));
        const newPosts = safeRows.filter(post => !existingIds.has(post.id));
        forumData.value = [
          ...forumData.value,
          ...prepareForumPosts(newPosts, forumData.value.length)
        ];
        currentPage.value = pageToLoad;
        prefetchAuthorTiersFor(newPosts);
        void ensureQuotedPostsForReposts();
      } else {
        // 保留乐观卡（正在后台发送的帖子）在列表顶部，避免刷新将其冲掉
        const optimisticPosts = forumData.value.filter(p=> p._optimistic);
        // 若处于搜索/标签筛选，非 all 视图下暂时隐藏乐观卡
        const shouldShowOptimistic = !searchKeyword.value.trim() && !selectedTagFilter.value && viewMode.value!=='my' && !showFollowingOnly.value;
        const basePosts = prepareForumPosts(safeRows);
        forumData.value = shouldShowOptimistic ? [...optimisticPosts, ...basePosts.filter(p=> !optimisticPosts.some(o=> o.id===p.id))] : basePosts;
        currentPage.value = 1;
        prefetchAuthorTiersFor(safeRows);
        void ensureQuotedPostsForReposts();
      }
      nextPageCursor.value = hasNextCursor;
      forumLoadError.value = '';
      hasMoreData.value = hasNextPage;
      persistForumFeedSnapshot();
      // 列表落地后再排空闲预取，避免和首屏渲染抢主线程
      scheduleIdleReplyPrefetch();
    } else {
      const errorMessage = String(dataResult?.error?.message || '论坛数据加载失败，请稍后重试');
      forumLoadError.value = errorMessage;
      logger.error('forum', '加载论坛数据返回错误:', dataResult?.error || dataResult);
      hasMoreData.value = false;
    }

    if (!isLoadMore && isLoggedIn.value && userInfo.id) {
      void refreshUnreadCount();
    }
  } catch (err) {
    // 取消语义兼容三种形态：DOMException(AbortError) / request-core 归一结果 / 旧文案
    if (err?.name === 'AbortError' || err?.aborted || err?.code === 'ABORTED'
      || String(err?.message || '') === '请求已被取消') return;
    if (requestSeq !== forumFetchSeq) return;
    logger.error('forum', '加载论坛数据失败:', err);
    forumLoadError.value = String(err?.message || '论坛数据加载失败，请稍后重试');
    hasMoreData.value = false;
  } finally {
    if (forumFetchAbortController === abortController) {
      forumFetchAbortController = null;
    }
    if (requestSeq === forumFetchSeq) {
      isLoading.value = false;
      isLoadingMore.value = false;
    }
  }
};

const cdnDeliveryBase = computed(() => {
  const envUrl = String(import.meta.env.VITE_CLOUDINARY_DELIVERY_BASE_URL || '').trim();
  if (envUrl) return envUrl;
  const cloudName = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  return cloudName ? `https://res.cloudinary.com/${cloudName}` : '';
});

const loadForumWeeklyReport = async () => {
  isWeeklyReportLoading.value = true;
  try {
    const result = await getLatestForumWeeklyReport();
    if (!result.error) forumWeeklyReport.value = result.data;
  } catch (error) {
    logger.warn('forum', '加载论坛周报失败:', error);
  } finally {
    isWeeklyReportLoading.value = false;
  }
};

const formatReportPeriod = (report) => {
  if (!report?.week_start || !report?.week_end) return '上一完整周';
  return `${String(report.week_start).replace(/-/g, '.')} - ${String(report.week_end).replace(/-/g, '.')}`;
};

const reportMetric = (key) => Number(forumWeeklyReport.value?.metrics?.[key] || 0);
const openWeeklyReport = () => { if (forumWeeklyReport.value) isWeeklyReportOpen.value = true; };
const closeWeeklyReport = () => { isWeeklyReportOpen.value = false; };
const openReportPost = (postId) => {
  closeWeeklyReport();
  if (postId) openPostDetail(postId);
};

const modalState = ref({ show: false, type: 'success', title: '', message: '' });
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value));
const modalMascotSrc = computed(() => {
  if (!isHomeCatActive.value || !modalState.value.show) return '';
  if (modalState.value.type === 'success') return getHomeCatAsset('success');
  if (modalState.value.type === 'error' || modalState.value.type === 'warning') return getHomeCatAsset('failed');
  return getHomeCatAsset('decor');
});
const confirmState = ref({
  show: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  resolve: null
});
const confirmMascotSrc = computed(() => {
  if (!isHomeCatActive.value || !confirmState.value.show) return '';
  const confirmText = String(confirmState.value.confirmText || '');
  const title = String(confirmState.value.title || '');
  return confirmText.includes('删除') || title.includes('删除') ? getHomeCatAsset('delete') : '';
});

const showModal = (type, title, message) => {
  modalState.value = { show: true, type, title, message };
};

const showEmbeddedSuccessIsland = (payload = {}) => {
  if (!props.embedded) return false;
  emit('island-message', payload);
  return true;
};

const showCheckinSuccessIsland = (message) => {
  const payload = {
    title: '签到成功',
    message,
    icon: 'success',
    durationMs: 3600,
    at: Date.now()
  };

  if (showEmbeddedSuccessIsland(payload)) return true;
  return showIsland.notify(payload);
};

const closeConfirm = (confirmed = false) => {
  const resolver = confirmState.value.resolve;
  confirmState.value = {
    show: false,
    title: '',
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    resolve: null
  };
  if (typeof resolver === 'function') {
    resolver(Boolean(confirmed));
  }
};

const requestConfirm = ({ title, message, confirmText = '确定', cancelText = '取消' }) => new Promise((resolve) => {
  confirmState.value = {
    show: true,
    title,
    message,
    confirmText,
    cancelText,
    resolve
  };
});

const goToProfile = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}?from=forum`);
};

const emitProfileSync = ({ userId, username, reason }) => {
  window.dispatchEvent(new CustomEvent('boh_profile_sync', {
    detail: {
      userId: userId || null,
      username: username || null,
      reason: reason || 'forum_update',
      at: Date.now()
    }
  }));
};

const addUiMarker = (markerRef, key, durationMs, timerPrefix) => {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;

  markerRef.value = new Set([...markerRef.value, safeKey]);
  const timerKey = `${timerPrefix}:${safeKey}`;
  if (uiAnimationTimers.has(timerKey)) {
    clearTimeout(uiAnimationTimers.get(timerKey));
  }

  uiAnimationTimers.set(timerKey, setTimeout(() => {
    const next = new Set(markerRef.value);
    next.delete(safeKey);
    markerRef.value = next;
    uiAnimationTimers.delete(timerKey);
  }, durationMs));
};

const hasUiMarker = (markerRef, key) => {
  const markerSet = markerRef?.value || markerRef;
  return markerSet instanceof Set && markerSet.has(String(key || '').trim());
};

const getForumImageKey = (postId, imageUrl) => `${String(postId || '').trim()}:${String(imageUrl || '').trim()}`;

const markForumImageLoaded = (postId, imageUrl) => {
  const key = getForumImageKey(postId, imageUrl);
  if (!key.includes(':') || key.endsWith(':')) return;
  loadedForumImageKeys.value = new Set([...loadedForumImageKeys.value, key]);
};

const isForumImageLoaded = (postId, imageUrl) => hasUiMarker(loadedForumImageKeys, getForumImageKey(postId, imageUrl));
const isPostHighlighted = (postId) => hasUiMarker(highlightedPostIds, postId);
const isPostLikePulsing = (postId) => hasUiMarker(likePulsePostIds, postId);
const isPostShareCopied = (postId) => hasUiMarker(shareCopiedPostIds, postId);
const getPostCardCatType = (index, post) => {
  if (post?.isLiked || Number(post?.like_count || 0) >= 8) return 'like';
  return ['decorAlt', 'decor', 'theme', 'cardExtra', 'mobileGap'][Number(index) % 5];
};
const getPostCardCatVariant = (index) => `cat-variant-${Number(index) % 4}`;
const getPostCardCatSeed = (post, index, suffix = 'card') => `${post?.id || index}:${suffix}`;
const getPostCardCatSrc = (post, index) => getHomeCatAsset(getPostCardCatType(index, post));
const getPostBackgroundCatSrc = (post, index) => {
  const type = getHomeCatTypeBySeed(getPostCardCatSeed(post, index, 'bg'), 'background');
  return getHomeCatAsset(type);
};
const shouldShowPostBackgroundCat = (post, index) => {
  const raw = String(post?.id || index || '');
  let sum = 0;
  for (let i = 0; i < raw.length; i += 1) sum += raw.charCodeAt(i);
  return sum % 3 === 1;
};

const isLikelyNetworkError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const text = `${message} ${details}`;

  return text.includes('timeout')
    || text.includes('超时')
    || text.includes('network')
    || text.includes('failed to fetch')
    || text.includes('load failed')
    || text.includes('请求失败');
};

const verifyPostCreatedOnServer = async (authorId, postBody, postTitle) => {
  if (!authorId) return false;
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error || !Array.isArray(data) || data.length === 0) return false;
    return true;
  } catch {
    return false;
  }
};

const shouldCleanupImagesAfterPostError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  return new Set([
    'EMPTY_POST_CONTENT',
    'LOCAL_KEYWORD_BLOCK',
    'SYNC_MODERATION_BLOCK',
    'NOT_AUTHENTICATED',
    'FORUM_IMAGE_LIMIT',
    'FORUM_IMAGE_MIGRATION_REQUIRED'
  ]).has(code);
};

const handlePost = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (userInfo.isBanned) {
    const isPermanentBan = !userInfo.bannedUntil;
    const isTempBanActive = userInfo.bannedUntil && new Date(userInfo.bannedUntil) > new Date();
    if (isPermanentBan || isTempBanActive) {
      let banMessage = '您的账号已被封禁，无法发布帖子。';
      if (userInfo.banReason) banMessage += ` 原因：${userInfo.banReason}`;
      if (userInfo.bannedUntil) {
        const expiryDate = new Date(userInfo.bannedUntil);
        banMessage += ` 解封时间：${expiryDate.toLocaleDateString('zh-CN')}`;
      } else banMessage += '（永久封禁）';
      showModal('warning', '封禁提示', banMessage);
      return;
    }
  }
  if (userInfo.isMuted) {
    const isPermanentMute = !userInfo.mutedUntil;
    const isTempMuteActive = userInfo.mutedUntil && new Date(userInfo.mutedUntil) > new Date();
    if (isPermanentMute || isTempMuteActive) {
      let muteMessage = '您已被禁言，无法发布帖子。';
      if (userInfo.muteReason) muteMessage += ` 原因：${userInfo.muteReason}`;
      if (userInfo.mutedUntil) muteMessage += ` 解禁时间：${new Date(userInfo.mutedUntil).toLocaleDateString('zh-CN')}`;
      else muteMessage += '（永久禁言）';
      showModal('warning', '禁言提示', muteMessage);
      return;
    }
  }
  if (!newPost.value.title.trim()) {
    showModal('warning', '提示', '请填写标题');
    return;
  }
  if (postImages.value.length > FORUM_POST_IMAGE_MAX_COUNT) {
    showModal('warning', '图片超限', `每个帖子最多发布 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片`);
    return;
  }
  if (postCooldownSeconds.value > 0) {
    showModal('warning', '发布太频繁', `请 ${postCooldownSeconds.value} 秒后再试`);
    return;
  }
  // 捕获当前编辑快照（用于乐观卡与队列）
  const snapshotTitle = String(newPost.value.title || '');
  const snapshotBody = String(newPost.value.content || '');
  const snapshotTag = normalizeForumTagValue(selectedPostTag.value) || 'daily';
  const snapshotLocation = postLocation.value ? { ...postLocation.value } : null;
  const snapshotImages = [...postImages.value].map((img, idx) => ({
    ...img,
    // 保留 File 与本地预览，队列将接管上传
    file: img.file || null,
    localPreviewUrl: img.localPreviewUrl || img.url || '',
    uploadStatus: img.uploadStatus || (img.file ? 'staged' : 'approved'),
    sortOrder: idx
  }));
  const submissionId = createSubmissionId();
  const submissionFingerprint = JSON.stringify([
    snapshotTitle, snapshotBody,
    snapshotImages.map(i=> [i?.publicId||i?.public_id||'', i?.file?.name||'', i?.file?.size||0])
  ]);
  // 校验队列：避免重复指纹正在发送中
  const dup = publishQueueStore.items.find(i=> i.fingerprint===submissionFingerprint && ['queued','uploading','publishing'].includes(i.state));
  if (dup) {
    showModal('warning', '正在发送中', '相同内容的帖子正在发送，请稍候');
    return;
  }
  const queueId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const rawAvatar = String(userInfo.avatarUrl || userInfo.avatar_url || '').trim();
  const queueItemPayload = {
    id: queueId,
    title: snapshotTitle,
    body: snapshotBody,
    tag: snapshotTag,
    location: snapshotLocation,
    images: snapshotImages,
    authorId: userInfo.id,
    authorUsername: userInfo.username,
    authorAvatarUrl: rawAvatar,
    submissionId,
    fingerprint: submissionFingerprint
  };
  const queueItem = publishQueueStore.enqueue(queueItemPayload);
  // 插入乐观帖子到列表顶部（简化：不暴露压缩/检测阶段，只显示百分比）
  insertOptimisticPost(queueItem);
  // 立即清空编辑器并退出（即发即走）
  const prevDraftImages = [...postImages.value];
  newPost.value.title = '';
  newPost.value.content = '';
  selectedPostTag.value = 'daily';
  postLocation.value = null;
  // 清理草稿但不清理已快照的图片（队列持有 file）
  postDraftRestoreSeq += 1;
  if (postDraftSaveTimer) { clearTimeout(postDraftSaveTimer); postDraftSaveTimer=null; }
  writeLocalPostDraft(null);
  savedPostDraft.value = null;
  lastAutoSaveTime.value = null;
  writePostDraftVersions([]);
  void savePostDraftToDatabase(null);
  // 清空编辑器图片状态（不触发云端删除，因队列已接管）
  prevDraftImages.forEach(img=> { /* 保留 localPreviewUrl 给队列，编辑器端移除 */ });
  postImages.value = [];
  postImageUploadStatus.value = '';
  // 关闭移动端编辑器（无二次确认，因已入队）
  showPostImageSourceMenu.value = false;
  isMobileDraftPanelOpen.value = false;
  if (isMobileComposerOpen.value) {
    isMobileComposerOpen.value = false;
    document.body.style.overflow = '';
  }
  await nextTick();
  // 即发即走：不走瞬时岛，靠统一任务岛常驻（Airdrop 同款，带堆叠缩略图直到成功）
  scrollForumTo(0);
  // 限流冷却仍需计时
  startActionCooldown('post', 8);
  // 启动后台队列
  void runPublishQueue();
};

const expandedPostIds = ref(new Set());
const activeReplyTarget = ref(null); // { postId, parentId, username }
const replyContent = ref('');
const isReplySubmitting = ref(false);

const toggleReplyInput = (postId, parentId = null, username = null, quotedContent = '') => {
  if (activeReplyTarget.value && activeReplyTarget.value.postId === postId && activeReplyTarget.value.parentId === parentId) {
    activeReplyTarget.value = null;
    replyContent.value = '';
  } else {
    activeReplyTarget.value = { postId, parentId, username, quotedContent };
    replyContent.value = buildReplyDraft(username);
  }
};

const handlePostCardToggleReplyInput = (postId, parentId, username, quotedContent) => {
  toggleReplyInput(postId, parentId ?? null, username ?? null, quotedContent ?? '');
};

const handlePostCardClearReplyTarget = (postId) => {
  activeReplyTarget.value = { postId, parentId: null, username: null };
};

const handlePostCardCancelReply = () => {
  activeReplyTarget.value = null;
};

// 返回值语义：true = 已填充（含本就有数据/已预载），false = 本次加载失败。
// 调用方据此决定「保留展开」还是「折叠回去」（失败不留空白展开区）。
const loadPostReplyPreview = async (post) => {
  if (!post?.id) return true;
  const existingReplies = Array.isArray(post.replies) ? post.replies : [];
  if (existingReplies.length > 0 || post.replies_preloaded) {
    post.replies = existingReplies;
    post.replies_has_more = Boolean(
      post.replies_has_more || Number(post.comment_count || 0) > existingReplies.length
    );
    return true;
  }

  const currentUserId = isLoggedIn.value ? userInfo.id : null;
  const first = await getComments(post.id, currentUserId, {
    topLevelOnly: true,
    page: 1,
    pageSize: LIST_REPLY_PREVIEW_COUNT,
    order: 'desc'
  });
  // 失败（含主动取消）：不写 replies_preloaded，下次点开还能重试
  if (first?.ok === false && first?.error) return false;
  let { data, hasMore } = first;

  if (shouldFallbackReplyPreview(data, post.comment_count)) {
    const fallbackOptions = buildFallbackReplyPreviewOptions({
      topLevelOnly: true,
      page: 1,
      pageSize: LIST_REPLY_PREVIEW_COUNT,
      order: 'desc'
    });
    const fallback = await getComments(post.id, currentUserId, fallbackOptions);
    if (fallback?.ok === false && fallback?.error) return false;
    data = fallback.data;
    hasMore = fallback.hasMore;
  }

  post.replies = Array.isArray(data) ? data : [];
  post.replies_has_more = Boolean(hasMore);
  post.replies_preloaded = true;
  triggerRef(forumData);
  return true;
};

const refreshPostEngagementStats = async (post) => {
  if (!post?.id) return;
  const statsRes = await getPostEngagementStats(post.id);
  if (!statsRes.ok) return;
  post.comment_count = Number(statsRes.data?.commentCount || 0);
  post.like_count = Number(statsRes.data?.likeCount || 0);
  triggerRef(forumData);
};

const toggleRepliesList = async (post) => {
  if (!post?.id) return;
  if (expandedPostIds.value.has(post.id)) {
    expandedPostIds.value.delete(post.id);
    return;
  }

  // 先展开再加载：点击瞬间即展开（PostCard 靠 is-expanded + _repliesLoading 渲染骨架），
  // 数据回来填充，失败/无可展示回复则折叠回去。消除等待期的零反馈。
  expandedPostIds.value.add(post.id);
  const hasReplies = Array.isArray(post.replies) && post.replies.length > 0;
  if (hasReplies || post.replies_preloaded) return;

  post._repliesLoading = true;
  triggerRef(forumData);
  try {
    const loaded = await loadPostReplyPreview(post);
    if (!loaded || !(Array.isArray(post.replies) && post.replies.length)) {
      expandedPostIds.value.delete(post.id);
    }
  } catch (error) {
    logger.warn('forum', '加载回复预览失败:', error);
    expandedPostIds.value.delete(post.id);
  } finally {
    post._repliesLoading = false;
    triggerRef(forumData);
  }
};

const shouldShowMoreRepliesLink = (post) => {
  const previewCount = Array.isArray(post?.replies) ? post.replies.length : 0;
  return Boolean(post?.replies_has_more || Number(post?.comment_count || 0) > previewCount);
};

// ============================================
// idle 预取未预载回复的帖子（可选优化）
// 列表落地后在空闲时段串行预载当前视口内「未预载 + 有评论」的帖子回复，
// 用户点开评论区时直接命中（loadPostReplyPreview 因 replies_preloaded 提前返回，
// 不会二次请求），把等待期从「骨架 → 数据」压成「直接就是数据」。
// ============================================
const REPLY_PREFETCH_MAX_PER_PASS = 4;
let idleReplyPrefetchHandle = null;
let idleReplyPrefetchCancelled = false;

const cancelIdleReplyPrefetch = () => {
  idleReplyPrefetchCancelled = true;
  if (idleReplyPrefetchHandle === null) return;
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleReplyPrefetchHandle);
  else clearTimeout(idleReplyPrefetchHandle);
  idleReplyPrefetchHandle = null;
};

const scheduleIdleReplyPrefetch = () => {
  cancelIdleReplyPrefetch();
  idleReplyPrefetchCancelled = false;
  const run = () => {
    idleReplyPrefetchHandle = null;
    if (idleReplyPrefetchCancelled) return;
    const targets = visibleForumPosts.value
      .filter((post) => post && post.id && !post._optimistic
        && !post.replies_preloaded
        && !(Array.isArray(post.replies) && post.replies.length)
        && Number(post.comment_count || 0) > 0)
      .slice(0, REPLY_PREFETCH_MAX_PER_PASS);
    if (!targets.length) return;
    // 串行：预取本身是低优先级任务，不与其他请求抢并发额度
    void (async () => {
      for (const target of targets) {
        if (idleReplyPrefetchCancelled) return;
        await loadPostReplyPreview(target);
      }
    })();
  };
  idleReplyPrefetchHandle = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: 2500 })
    : setTimeout(run, 1200);
};

const isLikeSubmitting = ref({});

const submitReply = async (post) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }

  // 优先检查封禁状态
  if (userInfo.isBanned) {
    const isPermanentBan = !userInfo.bannedUntil;
    const isTempBanActive = userInfo.bannedUntil && new Date(userInfo.bannedUntil) > new Date();
    if (isPermanentBan || isTempBanActive) {
      let banMessage = '您的账号已被封禁，无法回复。';
      if (userInfo.banReason) banMessage += ` 原因：${userInfo.banReason}`;
      if (userInfo.bannedUntil) {
        banMessage += ` 解封时间：${new Date(userInfo.bannedUntil).toLocaleDateString('zh-CN')}`;
      } else {
        banMessage += '（永久封禁）';
      }
      showModal('warning', '封禁提示', banMessage);
      return;
    }
  }

  // 检查禁言状态
  if (userInfo.isMuted) {
    const isPermanentMute = !userInfo.mutedUntil;
    const isTempMuteActive = userInfo.mutedUntil && new Date(userInfo.mutedUntil) > new Date();
    if (isPermanentMute || isTempMuteActive) {
      let muteMessage = '您已被禁言，无法回复。';
      if (userInfo.muteReason) muteMessage += ` 原因：${userInfo.muteReason}`;
      if (userInfo.mutedUntil) {
        muteMessage += ` 解禁时间：${new Date(userInfo.mutedUntil).toLocaleDateString('zh-CN')}`;
      } else {
        muteMessage += '（永久禁言）';
      }
      showModal('warning', '禁言提示', muteMessage);
      return;
    }
  }

  if (!replyContent.value.trim()) return;
  if (isReplySubmitting.value) return;
  if (replyCooldownSeconds.value > 0) {
    showModal('warning', '回复太频繁', `请 ${replyCooldownSeconds.value} 秒后再试`);
    return;
  }

  isReplySubmitting.value = true;
  try {
    const commentStatus = 'approved';
    const parentId = activeReplyTarget.value?.parentId;
    const replyToUsername = activeReplyTarget.value?.username;
    const rawReplyContent = replyContent.value;
    const safeUsername = resolveReplyUsername(userInfo);

    const { error } = await createComment(
      post.id,
      rawReplyContent,
      userInfo.id,
      safeUsername,
      commentStatus,
      parentId,
      replyToUsername
    );

    if (error) throw error;
    replyContent.value = '';
    activeReplyTarget.value = null;
    await loadPostReplyPreview(post);
    await refreshPostEngagementStats(post);
    expandedPostIds.value.add(post.id);
    if (!showEmbeddedSuccessIsland({
      title: '评论成功',
      message: '你的回复已经发送啦',
      icon: 'comment',
      type: 'success',
      catSticker: 'success',
      catStickerMode: 'hero',
      forceCatSticker: true
    })) {
      showModal(
        'success',
        '回复成功',
        '你的声音已被听到'
      );
    }

    addExperience(supabase, userInfo.id, XP_REWARDS.REPLY);
    addUiMarker(replySuccessPostIds, post.id, 1800, 'reply-success');
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'comment_created'
    });
  } catch (error) {
    logger.error('forum', '回复失败', error);
    applyRateLimitCooldown(error, 'reply');
    showModal('error', '发送失败', error?.message || '请稍后重试');
  } finally {
    setTimeout(() => {
      isReplySubmitting.value = false;
    }, 300);
  }
};

const handleToggleLike = async (post) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (!post || !post.id) {
    logger.error('forum', '无效的帖子数据');
    return;
  }
  // in-flight 去重：同一帖未落地前不接受重复提交（防重复 RPC 造成计数漂移）。
  // 这不是节流锁——请求一落地立即释放，不做 300ms 延迟，所以快速连点（赞↔取消）不会吞点击。
  if (isLikeSubmitting.value[post.id]) return;

  const prevLiked = Boolean(post.isLiked);
  const prevCount = Number(post.like_count || 0);
  const optimisticAction = prevLiked ? 'unliked' : 'liked';

  isLikeSubmitting.value[post.id] = true;
  // ① 乐观更新：点击瞬间翻转 isLiked、like_count±1 并触发心跳，感知延迟归零（不等 RPC）
  post.isLiked = !prevLiked;
  post.like_count = optimisticAction === 'liked' ? prevCount + 1 : Math.max(0, prevCount - 1);
  addUiMarker(likePulsePostIds, post.id, 1900, 'like-pulse');
  triggerRef(forumData);

  // 失败回滚：两个字段一起还原回点击前的值
  const rollback = () => {
    post.isLiked = prevLiked;
    post.like_count = prevCount;
    triggerRef(forumData);
  };

  try {
    const { action, data, error } = await toggleLike(post.id, userInfo.id);

    if (error) {
      rollback();
      logger.error('forum', '点赞失败:', error);
      const toast = getLikeErrorToast(error);
      showModal('warning', toast.title, toast.message);
      return;
    }

    // ② 校准：以点击前的计数为基数 → 服务端给了准确计数就用它，没给则等价于保留乐观值
    if (action === 'liked' || action === 'unliked') {
      post.like_count = calculateOptimisticLikeCount(prevCount, action, data?.likeCount);
      post.isLiked = action === 'liked';
      if (action === 'liked') {
        addExperience(supabase, userInfo.id, XP_REWARDS.LIKE);
      }
      triggerRef(forumData);

      emitProfileSync({
        userId: post.author_id,
        username: post.author_username,
        reason: action === 'liked' ? 'post_liked' : 'post_unliked'
      });
    }
  } catch (error) {
    rollback();
    logger.error('forum', '点赞异常', error);
    const toast = getLikeErrorToast(error);
    showModal('warning', toast.title, toast.message);
  } finally {
    isLikeSubmitting.value[post.id] = false;
  }
};

const _toggleViewMode = () => {
  feedMode.value = 'posts';
  viewMode.value = viewMode.value === 'all' ? 'my' : 'all';
  fetchForumData();
};

const setSortMode = (mode) => {
  feedMode.value = 'posts';
  sortMode.value = mode;
  fetchForumData();
};

const setFeedMode = (mode) => {
  if (mode === 'following' && !isLoggedIn.value) return;
  const newVal = mode === 'following';
  if (showFollowingOnly.value === newVal) return;
  showFollowingOnly.value = newVal;
  feedMode.value = 'posts';
  fetchForumData();
};

const setTagFilter = (tag = '') => {
  const normalizedTag = normalizeForumTagValue(tag);
  // 下拉显式选择优先：清掉输入中的 #记号，防止后续防抖解析把选择覆盖回记号里的标签
  if (searchQuery.value.includes('#')) {
    searchQuery.value = stripTagTokens(searchQuery.value);
  }
  if (selectedTagFilter.value === normalizedTag) return;
  selectedTagFilter.value = normalizedTag;
  feedMode.value = 'posts';
  fetchForumData();
};

const setContentType = (type = '') => {
  const next = ['news', 'activity', 'post'].includes(type) ? type : '';
  if (selectedContentType.value === next) return;
  selectedContentType.value = next;
  feedMode.value = 'posts';
  fetchForumData();
};

const CONTENT_TYPE_LABELS = { news: '新闻', activity: '活动', post: '论坛' };
const contentTypeLabel = computed(() => CONTENT_TYPE_LABELS[selectedContentType.value] || '');

const handleDeleteComment = async (comment, post) => {
  if (!comment?.id || !post?.id) return;
  const confirmed = await requestConfirm({
    title: '删除评论',
    message: '这条评论删除后无法恢复，确定继续吗？',
    confirmText: '删除'
  });
  if (!confirmed) return;

  try {
    const { success, error } = await deleteComment(comment.id, userInfo.id, userInfo.role);
    if (!success) {
      showModal('error', '删除失败', error || '请稍后重试');
      return;
    }
    emitProfileSync({
      userId: comment.author_id,
      username: comment.author_username,
      reason: 'comment_deleted'
    });
    await loadPostReplyPreview(post);
    await refreshPostEngagementStats(post);
  } catch (error) {
    logger.error('forum', '删除评论失败:', error);
    showModal('error', '删除失败', error?.message || '请稍后重试');
  }
};

// 帖子分享：点击卡片分享按钮 → 顶部导航灵动岛弹出选择器（复制链接 / 站内转发）
const buildPostShareTarget = (post) => ({
  title: String(post?.displayTitle || post?.title || '').replace(/\s+/g, ' ').trim().slice(0, 80),
  summary: String(post?.displayBody || post?.body || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  image: post?.allImages?.[0]?.url || post?.cover_image_url || '',
  path: `/forum/post/${post.id}`,
  forward: post?.id ? { postId: post.id } : null
});

let shareIslandHandle = null;
const sharePost = (post) => {
  if (!post?.id) return;
  shareIslandHandle?.close();
  shareIslandHandle = showIsland.custom(ShareIsland, {
    target: buildPostShareTarget(post),
    isLoggedIn: isLoggedIn.value,
    requireLogin: () => {
      showLoginModal.value = true;
    },
    onCopied: () => {
      // 同步点亮卡片上的「已复制」状态
      addUiMarker(shareCopiedPostIds, post.id, 1500, 'share-copied');
    },
    onClose: () => {
      // × / Esc / 成功自动关闭都走这里：必须真正清掉岛槽位，仅置空句柄岛不会消失
      shareIslandHandle?.close();
      shareIslandHandle = null;
    }
  });
};

const quoteRepostState = ref({ show: false, post: null, commentary: '' });
const openQuoteRepost = (post) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  quoteRepostState.value = { show: true, post, commentary: '' };
};
const closeQuoteRepost = () => {
  quoteRepostState.value = { show: false, post: null, commentary: '' };
};
const submitQuoteRepost = async () => {
  const { post, commentary } = quoteRepostState.value;
  if (!post?.id || !String(commentary || '').trim()) return;
  const result = await createQuoteRepost(post.id, commentary, { senderId: userInfo.id });
  if (!result.ok) {
    showModal('error', '转发失败', result.error?.message || '请稍后重试');
    return;
  }
  closeQuoteRepost();
  showModal('success', '转发成功', '你的留言已生成一条新的论坛帖子');
  await fetchForumData(false, { background: true });
};

// ─── #标签筛选语法：搜索框内输入 #服务器 / #question 等，即解析为标签筛选 ───
// 归一化单个 #记号 → 标签 value（支持英文 value 与中文标签名，大小写不敏感）
const resolveTagTokenValue = (token = '') => {
  const normalized = String(token || '').trim().toLowerCase().replace(/^#/, '');
  if (!normalized) return '';
  const option = FORUM_TAG_OPTIONS.find((tag) => (
    tag.value === normalized || tag.label.slice(1).toLowerCase() === normalized
  ));
  return option ? option.value : '';
};

// 从输入中剔除全部 #记号（含裸 #），得到真正入库搜索的关键词
const stripTagTokens = (raw = '') => String(raw || '')
  .replace(/#[^\s#]*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// 从输入解析标签筛选：返回 null 表示输入不含 #记号（不干预现有筛选状态）；
// 返回 '' 表示有记号但未匹配任何标签（视为清除）；否则返回标签 value
const deriveTagFilterFromInput = (raw = '') => {
  const text = String(raw || '');
  if (!text.includes('#')) return null;
  const tokens = [...text.matchAll(/#([^\s#]+)/g)];
  if (!tokens.length) return '';
  for (const token of tokens) {
    const value = resolveTagTokenValue(token[1]);
    if (value) return value;
  }
  return '';
};

// 统一搜索入口（提交按钮 / 回车 / 输入防抖共用）：解析 #标签 + 剔除记号后入库检索
const applySearchFromInput = () => {
  const rawInput = String(searchQuery.value || '');
  const derivedTag = deriveTagFilterFromInput(rawInput);
  const keyword = stripTagTokens(rawInput);
  const tagChanged = derivedTag !== null && derivedTag !== selectedTagFilter.value;
  if (tagChanged) selectedTagFilter.value = derivedTag;
  if (keyword === searchKeyword.value && !tagChanged) return;
  searchKeyword.value = keyword;
  feedMode.value = 'posts';
  fetchForumData();
};

const handleSearch = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  applySearchFromInput();
};

// 清除标签筛选（chip × / 「全部标签」）：同时清掉输入里的 #记号，避免下次输入又被解析回来
const clearTagFilter = () => {
  if (searchQuery.value.includes('#')) {
    searchQuery.value = stripTagTokens(searchQuery.value);
  }
  if (selectedTagFilter.value === '') return;
  selectedTagFilter.value = '';
  feedMode.value = 'posts';
  fetchForumData();
};

// 问 BOHAI：先在论坛库中检索相关内容，再把问题 + 检索结果交给顶部导航栏 AI 岛回复。
// 检索本身不消耗额度；岛内回答走用户 AI 额度，默认使用 Fast 模型（mode: 'fast'）。
const askBohai = async () => {
  if (isAiSearchLoading.value) return;
  const question = stripTagTokens(searchQuery.value);
  if (!question) {
    aiSearchHint.value = '先在搜索框输入你的问题，再问 BOHAI。';
    return;
  }
  if (!getBohAIModelStatus().hasConfig) {
    aiSearchHint.value = 'BOHAI 模型暂未配置，暂时无法回答。';
    return;
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }

  isAiSearchLoading.value = true;
  aiSearchHint.value = 'BOHAI 正在检索论坛相关内容...';

  try {
    const tagFromInput = deriveTagFilterFromInput(searchQuery.value);
    const { data: relatedPosts } = await getPosts(null, {
      page: 1,
      pageSize: 5,
      searchQuery: question,
      tagFilter: tagFromInput ?? selectedTagFilter.value ?? '',
      sortMode: 'hottest'
    });
    const posts = (Array.isArray(relatedPosts) ? relatedPosts : []).slice(0, 5);
    const contextBlock = posts.length
      ? posts.map((post, index) => {
          const title = String(post.title || '').trim() || '（无标题）';
          const excerpt = String(post.content || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
          const tagLabel = FORUM_TAG_MAP[post.tag]?.label || '';
          const author = String(post.author_username || post.username || '').trim();
          return `${index + 1}. ${title}${tagLabel ? `（${tagLabel}）` : ''}${author ? ` —— 作者：${author}` : ''}\n   ${excerpt || '（无正文摘要）'}`;
        }).join('\n')
      : '';

    const prompt = [
      `用户刚在社区论坛的搜索框里提问：「${question}」。`,
      '',
      contextBlock
        ? `论坛数据库中检索到的相关帖子：\n${contextBlock}`
        : '论坛数据库中没有检索到直接相关的帖子。',
      '',
      contextBlock
        ? '请基于以上论坛内容，用中文简洁回答用户的问题：相关内容充分就归纳作答并点出可参考的帖子标题；不够就如实说明，再补充你自己的知识。'
        : '请用中文简洁回答用户的问题；如果问题适合社区讨论，可以建议用户发一个带 #提问 标签的帖子来获得更多帮助。'
    ].join('\n');

    const opened = showIsland.ai({ prompt, mode: 'fast' });
    aiSearchHint.value = opened
      ? 'BOHAI 正在顶部 AI 岛为你解答（Fast 模型）。'
      : 'AI 岛当前不可用，请稍后再试。';
  } catch (error) {
    logger.warn('forum', '问 BOHAI 失败:', error);
    aiSearchHint.value = 'BOHAI 检索论坛内容失败，请稍后再试。';
  } finally {
    setTimeout(() => {
      isAiSearchLoading.value = false;
    }, 240);
  }
};

watch(searchQuery, () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    applySearchFromInput();
  }, SEARCH_DEBOUNCE_MS);
});

const openPostDetail = (postId) => {
  // 横屏（含桌面）：单源分流进详情弹窗，列表原地保留，无需 return state
  if (isForumLandscape()) {
    openForumPost({ router, postId });
    return;
  }
  const returnKey = props.embedded ? 'user-space' : 'forum';
  saveForumReturnState(returnKey, buildForumReturnState(postId));
  const query = props.embedded
    ? { from: 'user-space', tab: 'community', returnKey }
    : { from: 'forum', returnKey };

  router.push({
    name: 'PostDetail',
    params: { id: postId },
    query
  });
};
</script>

<template>
  <div ref="forumPageRef" class="forum-page" :class="{ 'embedded-mode': embedded }" :data-theme="currentTheme"
    :data-ui-style="currentUiStyle" :data-anniversary-skin="isAnniversaryMcTheme ? 'active' : 'off'"
    :style="anniversaryForumStyle">
    <link rel="preconnect" :href="cdnDeliveryBase" crossorigin />
    <link rel="dns-prefetch" :href="cdnDeliveryBase" />

    <div class="forum-container" :class="{ 'no-header': !showHeader }">
      <!-- 头部区域 -->
      <header v-if="showHeader" class="forum-header fade-in-up">
        <div class="header-content">
          <span class="header-tag">{{ isAnniversaryMcTheme ? 'BLOCK OF HOME · 2018—2026' : 'BOH COMMUNITY' }}</span>
          <h1 class="header-title">{{ isAnniversaryMcTheme ? '八周年方块社区' : '社区论坛' }}</h1>
          <p class="header-subtitle">{{ isAnniversaryMcTheme ? '挖掘旧回忆，继续建造我们的第九年。' : '分享你的创意，连接方块世界。' }}</p>
        </div>
        <div v-if="isAnniversaryMcTheme" class="anniversary-seal" aria-hidden="true"><strong>8</strong><span>周年限定<br>方块主题</span></div>
      </header>

      <!-- 主要内容区 -->
      <main class="forum-main-grid">

        <!-- 搜索工具栏：桌面 / 横屏下跨栏独占一行（base.css 的 grid-template-areas 负责布置）。
             单列时它在 DOM 里仍排在列表之前 → 手机端视觉顺序不变 -->
        <ForumToolbar v-model:searchQuery="searchQuery" :is-logged-in="isLoggedIn"
          :has-signed-this-week="weeklyCheckinStatus.hasSignedThisWeek" :sort-mode="sortMode"
          :selected-tag-filter="selectedTagFilter"
          :is-ai-search-loading="isAiSearchLoading" :ai-search-hint="aiSearchHint"
          @search-submit="handleSearch" @ask-bohai="askBohai" @clear-tag-filter="clearTagFilter"
          @open-weekly-checkin="openWeeklyCheckinCalendar" @set-sort-mode="setSortMode"
          @set-tag-filter="setTagFilter" />

        <!-- 左侧：发帖和列表 -->
        <div class="forum-left-column">
          <PostComposer v-if="!isMobileComposerMode" v-model:new-post="newPost"
            v-model:selected-post-tag="selectedPostTag" v-model:post-location="postLocation" :is-logged-in="isLoggedIn"
            :user-info="userInfo" :post-images="postImages" :is-submitting="isSubmitting"
            :is-uploading-post-image="isUploadingPostImage" :post-image-upload-status="postImageUploadStatus"
            :post-cooldown-seconds="postCooldownSeconds" :weekly-checkin-status="weeklyCheckinStatus"
            :weekly-checkin-progress-text="weeklyCheckinProgressText"
            :weekly-checkin-week-dots="weeklyCheckinWeekDots"
            :weekly-checkin-hint-text="weeklyCheckinHintText" :is-weekly-checkin-loading="isWeeklyCheckinLoading"
            :is-weekly-checkin-submitting="isWeeklyCheckinSubmitting" :forum-tag-options="FORUM_TAG_OPTIONS"
            :max-post-images="FORUM_POST_IMAGE_MAX_COUNT" :mention-users="forumMentionUsers"
            :is-home-cat-theme="isHomeCatActive" :show-post-image-source-menu="showPostImageSourceMenu"
            :auto-save-draft-label="autoSaveDraftLabel" @submit="handlePost" @login="showLoginModal = true"
            @toggle-image-source-menu="togglePostImageSourceMenu" @request-image-picker="openPostImagePicker"
            @request-camera="openPostCamera" @image-selection="handlePostImageSelection" @remove-image="removePostImage"
            @retry-image="retryPostImageUpload" @reorder-image="reorderPostImage" @clear-images="clearPostImages"
            @weekly-checkin="handleWeeklyCheckin" @open-draft="openMobileDraftPanel"
            @save-draft="saveMobileDraft" />

          <!-- 发布进度：已迁移到统一任务岛（useIsland 调度中心 showIsland.task），由发布队列 watcher 驱动 -->

          <!-- 帖子列表 -->
          <section class="posts-feed fade-in-up" style="animation-delay: 0.2s;">
            <div v-if="!externalFeed" class="feed-mode-tabs">
              <button class="feed-mode-tab" :class="{ active: selectedContentType === '' }" @click="setContentType('')">全部</button>
              <button class="feed-mode-tab" :class="{ active: selectedContentType === 'post' }" @click="setContentType('post')">论坛</button>
              <button class="feed-mode-tab" :class="{ active: selectedContentType === 'news' }" @click="setContentType('news')">新闻</button>
              <button class="feed-mode-tab" :class="{ active: selectedContentType === 'activity' }" @click="setContentType('activity')">活动</button>
              <template v-if="isLoggedIn">
                <span class="feed-mode-tab-divider" aria-hidden="true"></span>
                <button class="feed-mode-tab" :class="{ active: showFollowingOnly }"
                  :title="showFollowingOnly ? '返回全部内容' : '只看关注的人的动态'"
                  @click="setFeedMode(showFollowingOnly ? 'latest' : 'following')">关注</button>
              </template>
            </div>

            <!-- 骨架屏加载状态 -->
            <div v-if="isLoading" class="skeleton-feed">
              <div v-for="n in 5" :key="n" class="skeleton-post-card">
                <HomeCatMascot v-if="isHomeCatActive && n === 1" class="skeleton-thinking-cat" pool="state"
                  seed="forum-skeleton-thinking" size="md" decorative />
                <div class="skeleton-header">
                  <div class="skeleton-avatar skeleton-item"></div>
                  <div class="skeleton-header-info">
                    <div class="skeleton-username skeleton-item"></div>
                    <div class="skeleton-time skeleton-item"></div>
                  </div>
                </div>
                <div class="skeleton-content">
                  <div class="skeleton-title skeleton-item"></div>
                  <div class="skeleton-line long skeleton-item"></div>
                  <div class="skeleton-line medium skeleton-item"></div>
                  <div class="skeleton-line short skeleton-item"></div>
                </div>
                <div class="skeleton-actions">
                  <div class="skeleton-action skeleton-item"></div>
                  <div class="skeleton-action skeleton-item"></div>
                  <div class="skeleton-action skeleton-item"></div>
                </div>
              </div>
            </div>

            <div v-else class="posts-list stagger-list">
              <div v-if="forumData.length === 0" class="empty-state glass-panel">
                <HomeCatMascot v-if="isHomeCatActive" type="decor" size="lg" decorative />
                <span class="empty-icon">🔍</span>
                <p v-if="forumLoadError" class="forum-load-error">{{ forumLoadError }}</p>
                <p v-else-if="searchKeyword.trim() || selectedTagFilter || selectedContentType">
                  没有找到{{ selectedContentType ? `「${contentTypeLabel}」` : '' }}{{ selectedTagFilter ? `「${getForumTagLabel(selectedTagFilter)}」` : '' }}相关的内容，换个筛选条件试试
                </p>
                <p v-else>这里空空如也，快来发布第一条动态吧！</p>
              </div>

              <div v-if="virtualFeedTopSpacerHeight > 0" class="forum-virtual-spacer"
                :style="{ height: `${virtualFeedTopSpacerHeight}px` }" aria-hidden="true"></div>

              <template v-for="item in feedWithAds" :key="item.key">
                <AdSlot v-if="item.isAd" :ad="item.ad" />
                <div v-else class="forum-virtual-post"
                  :data-forum-virtual-index="getVisiblePostIndex(item.visIndex)">
                  <article v-if="item.post._optimistic" class="post-card-v2 glass-panel optimistic-post-card" :class="{ 'is-failed': item.post._publishState==='failed', 'is-moderation': item.post._failType==='moderation' }" :data-forum-post-id="item.post.id" @click.stop>
                    <div class="optimistic-progress-track"><i :style="{ width: Math.round(item.post._progress||0)+'%', background: item.post._failType==='moderation' ? '#f59e0b' : item.post._publishState==='failed' ? '#ff3b30' : item.post._publishState==='success' ? '#00b578' : '#1677ff' }"></i></div>
                    <div class="post-header-v2">
                      <div class="post-author-section">
                        <div class="post-author-avatar">
                          <img v-if="getAvatarUrl(item.post.author_avatar_url || userInfo.avatarUrl, 'sm')" :src="getAvatarUrl(item.post.author_avatar_url || userInfo.avatarUrl, 'sm')" class="avatar-image" loading="eager" />
                          <span v-else>{{ item.post.author_username ? item.post.author_username.charAt(0).toUpperCase() : 'U' }}</span>
                        </div>
                        <div class="post-author-info">
                          <span class="post-author-v2">{{ '@'+ item.post.author_username }}</span>
                          <span class="post-date-v2">刚刚 · 仅你可见</span>
                        </div>
                        <span class="optimistic-badge" :class="item.post._publishState==='failed' ? (item.post._failType==='moderation' ? 'moderation' : 'failed') : item.post._publishState==='success' ? 'success' : 'sending'">
                          <template v-if="item.post._publishState==='failed' && item.post._failType==='moderation'">审核未通过</template>
                          <template v-else-if="item.post._publishState==='failed'">发送失败</template>
                          <template v-else-if="item.post._publishState==='success'">发送成功</template>
                          <template v-else>发送中 · {{ Math.round(item.post._progress||0) }}%</template>
                        </span>
                      </div>
                    </div>
                    <div class="post-content-v2">
                      <h3 class="post-title-v2">{{ item.post.displayTitle }}</h3>
                      <div v-if="item.post.tagLabel" class="post-card-tags"><span class="post-card-tag">{{ item.post.tagLabel }}</span></div>
                      <div v-if="item.post.allImages && item.post.allImages.length" class="image-post-strip" :class="{ 'is-single': item.post.allImages.length === 1 }">
                        <div v-for="(img, idx) in item.post.allImages" :key="img.id||img.url" class="image-post-thumb-shell is-loaded" :class="{ 'is-failed-mark': item.post._failedImageIndex===idx && item.post._publishState==='failed' && item.post._failType==='moderation' }">
                          <img :src="img.url" :alt="`图片 ${idx+1}`" class="image-post-thumb is-loaded" style="opacity:.92" />
                          <span v-if="item.post._failedImageIndex===idx && item.post._publishState==='failed' && item.post._failType==='moderation'" class="optimistic-fail-mark">审核未过</span>
                        </div>
                      </div>
                      <p class="post-text-v2">{{ item.post.displayBody }}</p>
                      <div v-if="item.post._publishState==='failed'" :data-queue-failmsg="item.post._queueId" class="optimistic-fail-msg" :class="item.post._failType==='moderation' ? 'moderation' : 'network'">
                        <template v-if="item.post._failMessage">{{ item.post._failMessage }}</template>
                        <template v-else-if="item.post._failType==='moderation'">第 {{ (item.post._failedImageIndex||0)+1 }} 张图片未通过安全检测 · 可能含敏感内容，可移除该图后重试，其他内容不受影响。</template>
                        <template v-else>网络异常，未能完成发送。请检查网络后重试，无需重新编辑。</template>
                      </div>
                    </div>
                    <div class="optimistic-actions" @click.stop>
                      <button v-if="item.post._publishState==='failed' && item.post._failType==='moderation'" class="optimistic-btn fix" @click="fixModerationPublish(item.post._queueId)">移除该图后重试</button>
                      <button v-if="item.post._publishState==='failed'" class="optimistic-btn retry" @click="item.post._failType==='moderation' ? fixModerationPublish(item.post._queueId) : retryPublish(item.post._queueId)">{{ item.post._failType==='moderation' ? '移除该图' : '重试' }}</button>
                      <button v-if="item.post._publishState==='failed'" class="optimistic-btn ghost" @click="editFailedPublish(item.post._queueId)">编辑</button>
                      <button class="optimistic-btn ghost" @click="cancelPublish(item.post._queueId)">取消</button>
                    </div>
                  </article>
                  <PostCard v-else :post="item.post" :index="getVisiblePostIndex(item.visIndex)"
                    :is-home-cat-active="isHomeCatActive"
                    :is-expanded="expandedPostIds.has(item.post.id)"
                    :active-reply-target="activeReplyTarget && activeReplyTarget.postId === item.post.id ? activeReplyTarget : null"
                    :reply-content="replyContent" :is-reply-submitting="isReplySubmitting"
                    :reply-cooldown-seconds="replyCooldownSeconds" :reply-submit-label="replySubmitLabel"
                    :is-like-submitting="!!isLikeSubmitting[item.post.id]" :is-liked-pulsing="isPostLikePulsing(item.post.id)"
                    :is-replies-loading="!!item.post._repliesLoading"
                    :is-share-copied="isPostShareCopied(item.post.id)" :is-highlighted="isPostHighlighted(item.post.id)"
                    :is-reply-success="hasUiMarker(replySuccessPostIds, item.post.id)" :search-keyword="searchKeyword"
                    :is-logged-in="isLoggedIn" :user-info="userInfo" :loaded-image-keys="loadedForumImageKeys"
                    @click="openPostDetail" @go-to-profile="goToProfile" @toggle-like="handleToggleLike"
                    @toggle-replies="toggleRepliesList" @toggle-reply-input="handlePostCardToggleReplyInput"
                    @share="sharePost" @quote-repost="openQuoteRepost" @submit-reply="submitReply" @delete-comment="handleDeleteComment"
                    @open-image-viewer="openForumImageViewer" @update:reply-content="replyContent = $event"
                    @clear-reply-target="handlePostCardClearReplyTarget" @cancel-reply="handlePostCardCancelReply"
                    @image-loaded="markForumImageLoaded" @lazy-image-observe="observeForumLazyImage"
                    @load-more-images="handleStripLoadMore"
                    @more-replies="openPostDetail" />
                </div>
              </template>

              <div v-if="virtualFeedBottomSpacerHeight > 0" class="forum-virtual-spacer"
                :style="{ height: `${virtualFeedBottomSpacerHeight}px` }" aria-hidden="true"></div>
            </div>

            <div v-if="feedMode === 'posts' && hasMoreData" ref="loadMoreSentinelRef" class="forum-load-more-sentinel"
              aria-hidden="true"></div>

            <!-- 加载更多提示 -->
            <div v-if="feedMode === 'posts' && isLoadingMore" class="loading-more">
              <div class="loading-spinner small"></div>
              <p>正在加载更多帖子...</p>
            </div>

            <!-- 没有更多数据提示 -->
            <div v-else-if="feedMode === 'posts' && !hasMoreData && forumData.length > 0 && !isLoading"
              class="no-more-data">
              <p>已经到底啦～</p>
            </div>
          </section>
        </div>

        <!-- 右侧：AI 论坛周报 -->
        <aside class="forum-sidebar fade-in-up" style="animation-delay: 0.3s;">
          <div class="weekly-report-card glass-panel fade-in-up" style="animation-delay: 0.35s;">
            <div class="weekly-report-card-head">
              <div>
                <span class="weekly-report-kicker"><Newspaper :size="14" /> AI 周报</span>
                <h4>本周论坛周报</h4>
              </div>
              <span v-if="forumWeeklyReport" class="weekly-report-period">{{ formatReportPeriod(forumWeeklyReport) }}</span>
            </div>
            <div v-if="isWeeklyReportLoading" class="weekly-report-skeleton" aria-label="周报加载中">
              <span /><span /><span />
            </div>
            <template v-else-if="forumWeeklyReport">
              <p class="weekly-report-summary">{{ forumWeeklyReport.summary }}</p>
              <div class="weekly-report-metrics">
                <span><strong>{{ reportMetric('post_count') }}</strong> 帖子</span>
                <span><strong>{{ reportMetric('active_authors') }}</strong> 作者</span>
                <span><strong>{{ reportMetric('comment_count') }}</strong> 讨论</span>
              </div>
              <div v-if="forumWeeklyReport.topics?.length" class="weekly-report-topics">
                <span v-for="topic in forumWeeklyReport.topics.slice(0, 3)" :key="topic.name" class="weekly-report-topic">
                  {{ topic.name }}
                </span>
              </div>
              <button type="button" class="weekly-report-open-btn" @click="openWeeklyReport">
                <BookOpen :size="15" /> 查看完整周报 <ArrowUpRight :size="15" />
              </button>
            </template>
            <div v-else class="weekly-report-empty">
              <Newspaper :size="20" />
              <p>本周周报正在整理中</p>
              <span>下一次更新后会显示在这里</span>
            </div>
          </div>
        </aside>
      </main>
    </div>

    <Teleport to="body">
      <button v-if="isForumComposerFabVisible" type="button" class="mobile-compose-fab"
        :class="{ 'embedded-compose-fab': embedded }" aria-label="发布帖子" @click="openMobileComposer">
        <span>+</span>
      </button>
    </Teleport>

    <Teleport to="body">
      <Transition name="weekly-report-modal">
        <div v-if="isWeeklyReportOpen" class="weekly-report-overlay" @click.self="closeWeeklyReport">
          <section class="weekly-report-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-report-title">
            <header class="weekly-report-modal-head">
              <div>
                <span class="weekly-report-kicker"><Newspaper :size="15" /> AI 论坛周报</span>
                <h2 id="weekly-report-title">本周论坛周报</h2>
                <p>{{ formatReportPeriod(forumWeeklyReport) }}</p>
              </div>
              <button type="button" class="weekly-report-close" aria-label="关闭周报" @click="closeWeeklyReport"><X :size="19" /></button>
            </header>
            <div v-if="forumWeeklyReport" class="weekly-report-modal-body">
              <section class="weekly-report-overview">
                <h3>本周概览</h3>
                <p>{{ forumWeeklyReport.summary }}</p>
                <div class="weekly-report-metric-grid">
                  <div><strong>{{ reportMetric('post_count') }}</strong><span>帖子</span></div>
                  <div><strong>{{ reportMetric('active_authors') }}</strong><span>活跃作者</span></div>
                  <div><strong>{{ reportMetric('comment_count') }}</strong><span>评论</span></div>
                  <div><strong>{{ reportMetric('like_count') }}</strong><span>获赞</span></div>
                </div>
              </section>
              <section v-if="forumWeeklyReport.topics?.length" class="weekly-report-section">
                <h3>主要讨论主题</h3>
                <article v-for="topic in forumWeeklyReport.topics" :key="topic.name" class="weekly-report-topic-detail">
                  <div class="weekly-report-topic-title"><strong>{{ topic.name }}</strong><span>{{ topic.post_count || 0 }} 帖</span></div>
                  <p>{{ topic.summary }}</p>
                </article>
              </section>
              <section v-if="forumWeeklyReport.featured_posts?.length" class="weekly-report-section">
                <h3>帖子精选</h3>
                <article v-for="post in forumWeeklyReport.featured_posts" :key="post.post_id || post.title" class="weekly-report-post-detail">
                  <div class="weekly-report-post-title"><strong>{{ post.title }}</strong><button type="button" @click="openReportPost(post.post_id)">查看原帖 <ArrowUpRight :size="14" /></button></div>
                  <p>{{ post.summary }}</p>
                  <span v-if="post.reason" class="weekly-report-post-reason">入选理由：{{ post.reason }}</span>
                </article>
              </section>
              <section v-if="forumWeeklyReport.open_questions?.length" class="weekly-report-section">
                <h3>值得继续讨论</h3>
                <ul class="weekly-report-questions"><li v-for="question in forumWeeklyReport.open_questions" :key="question">{{ question }}</li></ul>
              </section>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="mobile-composer">
        <div v-if="isMobileComposerOpen" class="mobile-composer-overlay">
          <div class="mobile-composer-bar">
            <button type="button" class="mobile-composer-back" aria-label="返回论坛" @click="closeMobileComposer">
              取消
            </button>
            <button type="button" class="mobile-composer-draft-btn" @click="openMobileDraftPanel">
              草稿
            </button>
            <button type="button" class="mobile-composer-submit" @click="handlePost"
              :disabled="isSubmitting || isUploadingPostImage || postCooldownSeconds > 0">
              <span class="mobile-composer-submit-label">{{ postCooldownSeconds > 0 ? `${postCooldownSeconds}s` : '发布' }}</span>
            </button>
          </div>
          <Transition name="mobile-draft-panel">
            <div v-if="isMobileDraftPanelOpen" class="mobile-draft-panel-overlay" @click="closeMobileDraftPanel">
              <section class="mobile-draft-panel" aria-label="发帖草稿" @click.stop>
                <div class="mobile-draft-panel-header">
                  <div>
                    <h3>草稿</h3>
                    <p>{{ savedPostDraft ? `${formatDraftSavedTime(savedPostDraft.savedAt)} 保存` : '当前没有保存的草稿' }}</p>
                  </div>
                  <button type="button" class="mobile-draft-close-btn" aria-label="关闭草稿面板"
                    @click="closeMobileDraftPanel">×</button>
                </div>
                <div class="mobile-draft-preview" :class="{ empty: !savedPostDraft }">
                  <span v-if="savedPostDraft" class="mobile-draft-tag">{{ savedDraftTagLabel }}</span>
                  <p>{{ draftPreviewText }}</p>
                </div>
                <div v-if="postDraftVersions.length" class="mobile-draft-version-list" aria-label="草稿历史版本">
                  <button v-for="draft in postDraftVersions" :key="draft.savedAt" type="button"
                    class="mobile-draft-version-item" @click="restorePostDraftVersion(draft)">
                    <span>{{ formatDraftSavedTime(draft.savedAt) }}</span>
                    <strong>{{ draft.title || draft.content || '未命名草稿' }}</strong>
                  </button>
                </div>
                <div class="mobile-draft-actions">
                  <button type="button" class="mobile-draft-action secondary" @click="saveMobileDraft">
                    保存当前
                  </button>
                  <button type="button" class="mobile-draft-action secondary" :disabled="!savedPostDraft"
                    @click="clearMobileDraft">
                    清空
                  </button>
                  <button type="button" class="mobile-draft-action primary" :disabled="!savedPostDraft"
                    @click="restoreMobileDraft">
                    恢复
                  </button>
                </div>
              </section>
            </div>
          </Transition>
          <div class="mobile-composer-scroll">
            <PostComposer v-model:new-post="newPost" v-model:selected-post-tag="selectedPostTag"
              v-model:post-location="postLocation" :is-logged-in="isLoggedIn" :user-info="userInfo"
              :post-images="postImages" :is-submitting="isSubmitting" :is-uploading-post-image="isUploadingPostImage"
              :post-image-upload-status="postImageUploadStatus" :post-cooldown-seconds="postCooldownSeconds"
              :weekly-checkin-status="weeklyCheckinStatus" :weekly-checkin-progress-text="weeklyCheckinProgressText"
              :weekly-checkin-week-dots="weeklyCheckinWeekDots"
              :weekly-checkin-hint-text="weeklyCheckinHintText" :is-weekly-checkin-loading="isWeeklyCheckinLoading"
              :is-weekly-checkin-submitting="isWeeklyCheckinSubmitting" :forum-tag-options="FORUM_TAG_OPTIONS"
              :max-post-images="FORUM_POST_IMAGE_MAX_COUNT" :mention-users="forumMentionUsers"
              :is-home-cat-theme="isHomeCatActive" :show-post-image-source-menu="showPostImageSourceMenu"
              is-mobile-composer @submit="handlePost" @login="showLoginModal = true"
              @toggle-image-source-menu="togglePostImageSourceMenu" @request-image-picker="openPostImagePicker"
              @request-camera="openPostCamera" @image-selection="handlePostImageSelection"
              @remove-image="removePostImage" @retry-image="retryPostImageUpload" @reorder-image="reorderPostImage"
              @clear-images="clearPostImages" @weekly-checkin="handleWeeklyCheckin"
              @open-draft="openMobileDraftPanel" @save-draft="saveMobileDraft" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <WeeklyCheckinCalendar v-model:open="isWeeklyCheckinCalendarOpen" :status="weeklyCheckinStatus"
      :calendar-days="checkinCalendarDays" :next-checkin="weeklyCheckinNextCheckin"
      :loading="isWeeklyCheckinLoading"
      :submitting="isWeeklyCheckinSubmitting" :card-points="weeklyCheckinCardPoints"
      :card-username="userInfo.username || '未命名用户'" :card-skin="userInfo.pointsCardSkin || 'blank'"
      :card-image-url="userInfo.pointsCardImageUrl || ''" @close="closeWeeklyCheckinCalendar"
      @checkin="handleWeeklyCheckin" />

    <Teleport to="body">
      <Transition name="mobile-draft-panel">
        <div v-if="isMobileDraftPanelOpen && !isMobileComposerOpen"
          class="mobile-draft-panel-overlay desktop-draft-panel-overlay" @click="closeMobileDraftPanel">
          <section class="mobile-draft-panel" aria-label="发帖草稿" @click.stop>
            <div class="mobile-draft-panel-header">
              <div>
                <h3>草稿</h3>
                <p>{{ savedPostDraft ? `${formatDraftSavedTime(savedPostDraft.savedAt)} 保存` : '当前没有保存的草稿' }}</p>
              </div>
              <button type="button" class="mobile-draft-close-btn" aria-label="关闭草稿面板"
                @click="closeMobileDraftPanel">×</button>
            </div>
            <div class="mobile-draft-preview" :class="{ empty: !savedPostDraft }">
              <span v-if="savedPostDraft" class="mobile-draft-tag">{{ savedDraftTagLabel }}</span>
              <p>{{ draftPreviewText }}</p>
            </div>
            <div v-if="postDraftVersions.length" class="mobile-draft-version-list" aria-label="草稿历史版本">
              <button v-for="draft in postDraftVersions" :key="draft.savedAt" type="button"
                class="mobile-draft-version-item" @click="restorePostDraftVersion(draft)">
                <span>{{ formatDraftSavedTime(draft.savedAt) }}</span>
                <strong>{{ draft.title || draft.content || '未命名草稿' }}</strong>
              </button>
            </div>
            <div class="mobile-draft-actions">
              <button type="button" class="mobile-draft-action secondary" @click="saveMobileDraft">
                保存当前
              </button>
              <button type="button" class="mobile-draft-action secondary" :disabled="!savedPostDraft"
                @click="clearMobileDraft">
                清空
              </button>
              <button type="button" class="mobile-draft-action primary" :disabled="!savedPostDraft"
                @click="restoreMobileDraft">
                恢复
              </button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <ForumImageViewer v-model:open="isForumImageViewerOpen" :images="forumImageViewerImages"
      :initial-index="forumImageViewerIndex" @close="closeForumImageViewer" />

    <Teleport to="body">
      <Transition name="forum-confirm-fade">
        <div v-if="confirmState.show" class="forum-confirm-overlay" @click.self="closeConfirm(false)">
          <div class="forum-confirm-modal" role="dialog" aria-modal="true" :aria-label="confirmState.title">
            <img v-if="isHomeCatActive && confirmMascotSrc" class="forum-confirm-cat-img" :src="confirmMascotSrc" alt=""
              draggable="false" loading="lazy" />
            <h3>{{ confirmState.title }}</h3>
            <p>{{ confirmState.message }}</p>
            <div class="forum-confirm-actions">
              <button type="button" class="forum-confirm-btn secondary" @click="closeConfirm(true)">
                {{ confirmState.confirmText }}
              </button>
              <button type="button" class="forum-confirm-btn danger" @click="closeConfirm(false)">
                {{ confirmState.cancelText }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 弹窗 -->
    <CommonAlertModal v-model:visible="modalState.show" :type="modalState.type" :title="modalState.title"
      :message="modalState.message" :mascot-src="modalMascotSrc" mascot-alt="方块小窝提示小猫" />

    <Teleport to="body">
      <div v-if="quoteRepostState.show" class="forum-confirm-overlay" @click.self="closeQuoteRepost">
        <section class="forum-confirm-modal" role="dialog" aria-modal="true" aria-label="引用转发">
          <h3>引用转发</h3>
          <p class="quote-repost-source">{{ quoteRepostState.post?.displayTitle || quoteRepostState.post?.title }}</p>
          <textarea v-model="quoteRepostState.commentary" maxlength="2000" rows="4" placeholder="添加你的想法..."></textarea>
          <div class="forum-confirm-actions">
            <button type="button" class="forum-confirm-btn secondary" @click="closeQuoteRepost">取消</button>
            <button type="button" class="forum-confirm-btn danger" :disabled="!quoteRepostState.commentary.trim()" @click="submitQuoteRepost">转发</button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
@import './styles/base.css';
</style>
<style scoped>
@import './styles/composer.css';
@import './styles/feed.css';
@import './styles/replies-responsive.css';
@import './styles/drawers-skeletons.css';
@import './styles/anniversary.css';
@import './styles/weekly-report.css';
</style>
<style scoped>
.optimistic-post-card{ position:relative; overflow:hidden; border-color: rgba(22,119,255,.18); box-shadow: 0 8px 30px rgba(22,119,255,.10); }
.optimistic-progress-track{ position:absolute; left:0; right:0; top:0; height:3px; background: rgba(0,0,0,.06); overflow:hidden; }
.optimistic-progress-track i{ display:block; height:100%; width:0%; transition: width .35s cubic-bezier(.16,1,.3,1); border-radius:999px; }
.optimistic-badge{ margin-left:auto; font-size:10px; font-weight:800; letter-spacing:.04em; padding:5px 8px; border-radius:999px; }
.optimistic-badge.sending{ background:#e8f0ff; color:#1677ff }
.optimistic-badge.failed{ background:#ffe8e6; color:#c0392b }
.optimistic-badge.moderation{ background:#fff7ed; color:#b45309; border:1px solid rgba(180,83,9,.14) }
.optimistic-badge.success{ background:#d8f4e9; color:#057857 }
.optimistic-fail-msg{ margin-top:8px; padding:10px 12px; border-radius:14px; font-size:12px; font-weight:600; line-height:1.5 }
.optimistic-fail-msg.moderation{ background:#fff7ed; color:#7c3b0a; border:1px solid rgba(180,83,9,.12) }
.optimistic-fail-msg.network{ background:#fff1f0; color:#7f1d1d; border:1px solid rgba(255,59,48,.12) }
.optimistic-actions{ display:flex; gap:8px; justify-content:flex-end; padding-top:4px }
.optimistic-btn{ border:none; border-radius:999px; padding:7px 12px; font-size:11px; font-weight:800; cursor:pointer; transition:.2s }
.optimistic-btn.fix{ background:#b45309; color:#fff }
.optimistic-btn.retry{ background:#1d1d1f; color:#fff }
.optimistic-btn.ghost{ background:#fff; border:1px solid rgba(0,0,0,.08); color:#1d1d1f }
.optimistic-btn:active{ transform:scale(.97) }
.optimistic-fail-mark{ position:absolute; top:6px; right:6px; background:#ff3b30; color:#fff; font-size:10px; font-weight:800; padding:3px 6px; border-radius:999px }
.image-post-thumb-shell.is-failed-mark img{ outline:2px solid #ff3b30; outline-offset:2px; opacity:.55 !important; }
</style>
