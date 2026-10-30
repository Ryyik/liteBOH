<script setup>
import {
  ref,
  shallowRef,
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  watch,
  triggerRef,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowUpRight,
  BookOpen,
  CloudOff,
  Inbox,
  Newspaper,
  RotateCw,
  SearchX,
  Sparkles,
  X,
} from 'lucide-vue-next';
import PostComposer from './components/PostComposer.vue';
import PostCard from './components/PostCard.vue';
import { resolveFrameForAuthor } from '@/composables/useAvatarFrame.js';
import ShareIsland from '@/components/UnifiedNavbar/ShareIsland.vue';
import AdSlot from './components/AdSlot.vue';
import ForumToolbar from './components/ForumToolbar.vue';
import ForumImageViewer from './components/ForumImageViewer.vue';
import CheckinRewardStage from './components/CheckinRewardStage.vue';
import { useForumPublishQueueStore } from '@/stores/forumPublishQueue.js';
import {
  useForumPostDraftStorage,
  FORUM_POST_DRAFT_CHANGE_EVENT,
  isDraftInSyncWithEditor,
} from './composables/useForumPostDraftStorage.js';
import { useForumVirtualFeed } from './composables/useForumVirtualFeed.js';
import { useForumDraftImagePipelines } from './composables/useForumDraftImagePipelines.js';
import { useForumFeedQuery } from './composables/useForumFeedQuery.js';
import { useForumPublishQueue } from './composables/useForumPublishQueue.js';
import { useActiveAds } from './composables/useActiveAds.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { getAvatarUrl } from '@/utils/avatar.js';
import { getImageUrl } from '@/utils/asset-helper.js';
import { preloadPointsCardAssets } from '@/utils/points-card-assets.js';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { ensureNotificationStore } from '@/stores/notification-loader';
import { isForumLandscape } from '@/utils/forum-viewport.js';
import { isForumFeedSection } from '@/config/forum-sections';
import { openForumPost } from '@/composables/usePostDetailModal.js';
import CommonAlertModal from '../../components/CommonAlertModal.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import {
  getPosts,
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
  getForumPostDraft,
  upsertForumPostDraft,
  deleteForumPostDraft,
  preloadForumImageModeration,
  getForumPostImages,
  fetchQuotedPostsByIds,
  matchesForumContentKind,
} from '../../utils/api/forum-api.js';
import { showIsland } from '@/composables/useIsland.js';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';
// 发帖图压缩库按需加载：image-compression vendor（≈40KB gz）不进论坛首屏闭包
//（报告 §9.1；动态 import 的 chunk 在首次选图时才拉取）
import { loadOfficialDirectory } from '@/utils/api/forum/official-directory.js';
import {
  clearForumReturnState,
  getForumReturnKeyFromQuery,
  readForumReturnState,
  saveForumReturnState,
} from '@/utils/forum-return-state.js';
import {
  buildForumFeedSnapshotKey,
  clearForumFeedSnapshots,
  readForumFeedSnapshot,
  writeForumFeedSnapshot,
} from '@/utils/forum-feed-cache.js';
import {
  buildReplyDraft,
  shouldShowReplyTarget,
  resolveReplyUsername,
  calculateOptimisticLikeCount,
  shouldFallbackReplyPreview,
  buildFallbackReplyPreviewOptions,
  getLikeErrorToast,
  getForumImageKey,
} from '@/utils/forum-helpers.js';
import { supabase } from '../../utils/supabase-client.js';
import { themeManager } from '@/utils/theme-manager.js';
import { getHomeCatAsset, isHomeCatTheme } from '@/utils/home-cat-theme.js';
import anniversaryForumImage from '@/assets/images/blockschool.webp';
import { addExperience, XP_REWARDS } from '../../utils/xp.js';
import { logger } from '@/utils/logger.js';
import { getFollowing } from '@/utils/api/profile-api.js';
import {
  FORUM_DETAIL_IMAGE_TRANSFORM,
  FORUM_LIST_IMAGE_TRANSFORM,
  FORUM_LIST_IMAGE_TRANSFORM_MD,
  FORUM_LIST_IMAGE_TRANSFORM_SM,
  FORUM_LIST_LQIP_TRANSFORM,
  FORUM_POST_DRAFT_PREFIX,
  FORUM_POST_IMAGE_MAX_COUNT,
  FORUM_TAG_MAP,
  FORUM_TAG_OPTIONS,
  LIST_REPLY_PREVIEW_COUNT,
  POSTS_PER_PAGE,
} from './forum-config.js';
import { applyPoints, readPoints } from './forum-points.js';
import { getBohAIModelStatus } from '@/utils/bohai-model-client.js';

import { useForumImageModerationPreload } from './composables/useForumImageModerationPreload.js';

// Props
const props = defineProps({
  showHeader: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
  // 外部接管「最新/关注/新闻/活动」筛选（用户空间社区段控驱动）：非空时隐藏内部筛选钮并跟随
  externalFeed: { type: String, default: '' },
});
// composer-state：发布会话（.mobile-composer-overlay）开关状态外报。
// 它被 Teleport 到 body，横屏下会盖住右区，外层（首页 / UserSpace 的左栏）
// 必须知道它开没开 —— 一是切换落点前要先收掉，二是左栏「发布」项的选中态。
// 真源只有本文件的 isMobileComposerOpen，外层一律经 ForumSectionShell 透传，别自己推。
const emit = defineEmits(['island-message', 'composer-state']);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const currentUiStyle = ref('glass');
const currentTheme = ref(themeManager.getTheme());
const isAnniversaryMcTheme = computed(() => currentTheme.value === 'anniversary-mc');
const showAnniversaryBg = ref(false);
let anniversaryObserver = null;
const anniversaryForumStyle = computed(() =>
  isAnniversaryMcTheme.value && showAnniversaryBg.value
    ? { '--forum-anniversary-image': `url(${anniversaryForumImage})` }
    : undefined,
);

const readActiveForumTheme = () => {
  if (typeof document === 'undefined') return themeManager.getTheme();
  const selectors = ['.forum-page', '.user-space-page', 'html'];
  for (const selector of selectors) {
    const theme = document.querySelector(selector)?.getAttribute('data-theme');
    if (isHomeCatTheme(theme)) return theme;
  }
  return themeManager.getTheme();
};

const refreshUnreadCount = async () => {
  const notificationStore = await ensureNotificationStore();
  await notificationStore.refreshUnreadCount();
};

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
const { clearForumImageModerationPreloadTask, scheduleForumImageModerationPreload } =
  useForumImageModerationPreload(preloadForumImageModeration);

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
  const safeTag = String(tag || '')
    .trim()
    .toLowerCase();
  return FORUM_TAG_MAP[safeTag] ? safeTag : '';
};
const getForumTagLabel = (tag = '') => FORUM_TAG_MAP[normalizeForumTagValue(tag)]?.label || '';
const normalizeForumSortMode = (mode = '', fallback = 'latest') => {
  const safeMode = String(mode || '')
    .trim()
    .toLowerCase();
  return ['latest', 'hottest'].includes(safeMode) ? safeMode : fallback;
};
const getQueryString = (value) =>
  String(Array.isArray(value) ? value[0] || '' : value || '').trim();
const getForumReturnKey = () =>
  getForumReturnKeyFromQuery(route.query, props.embedded ? 'user-space' : 'forum');
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
  visibleForumPosts,
  virtualFeedTopSpacerHeight,
  virtualFeedBottomSpacerHeight,
  getVisiblePostIndex,
  setupForumLoadMoreObserver,
  setupForumWindowObserver,
  setupForumWindowObserverOnce,
  cleanupForumLoadMoreObserver,
  cleanupForumWindowObserver,
  stop: stopForumVirtualFeed,
} = useForumVirtualFeed({
  feedMode,
  forumData,
  forumPageRef,
  loadMoreSentinelRef,
  isLoading,
  isLoadingMore,
  hasMoreData,
  getScrollContainer: getForumScrollContainer,
  onLoadMore: () => fetchForumData(true),
});

// ===== 广告：列表信息流（当前落地订阅计划广告）=====
const { ads: activeAds, load: loadActiveAds } = useActiveAds('list_feed');

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
      scrollHeight: scroller.scrollHeight || 0,
    };
  }
  return {
    scrollTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
    clientHeight: window.innerHeight || document.documentElement.clientHeight || 0,
    scrollHeight: Math.max(
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0,
    ),
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
  focusSearch: () => focusForumSearch(),
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
  hasMoreData: hasMoreData.value,
});

const applyForumReturnStateFilters = (state = {}) => {
  viewMode.value = state.viewMode === 'my' ? 'my' : 'all';
  sortMode.value = normalizeForumSortMode(state.sortMode, 'latest');
  searchQuery.value = String(state.searchQuery ?? state.searchKeyword ?? '');
  searchKeyword.value = String(state.searchKeyword ?? state.searchQuery ?? '').trim();
  selectedTagFilter.value = normalizeForumTagValue(state.selectedTagFilter || '');
  const savedContentType = String(state.selectedContentType || '')
    .trim()
    .toLowerCase();
  // 'info' 也要收：资讯分区切走再回来时，快照里的 contentType 不能被打回 ''
  selectedContentType.value = ['info', 'news', 'activity', 'post'].includes(savedContentType)
    ? savedContentType
    : '';
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
      const escapedPostId =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
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

  // 快照直跳：会话快照（2min TTL）覆盖目标页且含滚动锚点时，免掉「拉第 1 页 +
  // 逐页回放」的串行链（keyset 游标链天生串行，最多 12 连发，报告 §10 P1-3）。
  // 快照最多存 40 帖，页数深到被截断时放弃直跳，走原回放保证滚动锚点能落地。
  const desiredPage = Math.max(1, Math.min(12, Number(savedState.currentPage || 1)));
  const snapshot = readForumFeedSnapshot(getForumFeedSnapshotKey());
  const anchorPostId = String(savedState.postId || '').trim();
  const snapshotCoversAnchor =
    !anchorPostId ||
    (snapshot?.posts || []).some((post) => String(post?.id || '') === anchorPostId);
  const snapshotUntruncated = (snapshot?.posts?.length || 0) >= (desiredPage - 1) * POSTS_PER_PAGE;
  if (
    snapshot?.posts?.length &&
    Number(snapshot.currentPage || 1) >= desiredPage &&
    snapshotUntruncated &&
    snapshotCoversAnchor
  ) {
    forumData.value = prepareForumPosts(snapshot.posts);
    currentPage.value = snapshot.currentPage;
    nextPageCursor.value = snapshot.nextPageCursor;
    hasMoreData.value = snapshot.hasMoreData;
    isLoading.value = false;
    prefetchAuthorTiersFor(snapshot.posts);
    void ensureQuotedPostsForReposts();
    await restoreForumScrollPosition(savedState);
    clearForumReturnState(returnKey);
    return;
  }

  await fetchForumData();

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
/* 签到成功舞台（卡面 3D）。open 为 true 时组件才挂载 —— 挂载即起播，
   所以「资源就绪」必须在把它置 true **之前**完成（见 handleCheckinClick）。 */
const checkinReward = ref({
  open: false,
  pointsAfter: 0,
  awardAmount: 0,
  /* true = 「再看一遍」重播：文案换成已签到，不显示到账数字 */
  alreadySigned: false,
  assetsReady: true,
});
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
  currentWeekStart: null,
});
const weeklyCheckinStatus = ref(createDefaultWeeklyCheckinStatus());

const newPost = ref({ title: '', content: '' });
const selectedPostTag = ref('daily');
const isSubmitting = ref(false);
const postImages = ref([]);
const postLocation = ref(null);
const isUploadingPostImage = ref(false);
const postImageUploadStatus = ref('');
const createSubmissionId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `00000000-0000-4000-8000-${`${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(-12).padStart(12, '0')}`;
// ===== 即发即走：后台发布队列（与灵动岛/顶部常驻条联动，简化进度不暴露压缩/检测细节） =====
const publishQueueStore = useForumPublishQueueStore();
// 状态机与 worker（入队消费 / 岛同步 / 重试·取消·编辑·移除违规图 / 三条恢复路径）
// 已外搬到 ./composables/useForumPublishQueue.js（2026-10-30，审查报告 P1-1 第 1 步）。
// 这里只留 store 实例：下面还有几处直接读队列做判断（重复指纹、草稿恢复）。
// Phase 4（plans/023）：Cloud+「转为帖子」的一次性预填（读后即删，抑制本次会话的草稿恢复）
const convertPrefillApplied = ref(false);

onMounted(() => {
  try {
    const raw = sessionStorage.getItem('boh-cloud-convert-draft');
    if (!raw) return;
    sessionStorage.removeItem('boh-cloud-convert-draft');
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return;
    const urls = (Array.isArray(draft.images) ? draft.images : [])
      .map((url) => String(url || '').trim())
      .filter(Boolean);
    newPost.value = {
      title: String(draft.title || '').slice(0, 120),
      content: String(draft.content || ''),
    };
    postImages.value = urls.map((url, i) => ({
      uploadId: `cloud-convert-${Date.now()}-${i}`,
      url,
      publicId: '',
      uploadStatus: 'approved',
      sortOrder: i,
      file: null,
      localPreviewUrl: url,
    }));
    convertPrefillApplied.value = true;
    logger.info('forum', '已从 Cloud+ 预填发帖内容（转为帖子）');
  } catch (error) {
    logger.warn('forum', 'Cloud+ 转为帖子预填失败:', error);
  }
});

const isForumImageViewerOpen = ref(false);
const forumImageViewerImages = ref([]);
const forumImageViewerIndex = ref(0);
// 发布会话是发帖唯一入口：横屏左栏「发布」、窄屏 FAB、帖子详情编辑复用同一套组件。
const isMobileComposerOpen = ref(false);
/* 竖屏发布会话的缩放起点：从 FAB 的真实中心出发，关闭时缩回同一点。
   CSS 只消费这个变量，不在样式里写死右下角坐标（安全区 / embedded 抬升 / 旋转都会变）。 */
const mobileComposerTransformOrigin = ref('100% 100%');
/** 把 DOMRect 归一成 CSS transform-origin；FAB 必须真实渲染过（宽高为 0 时放弃）。 */
const resolveFabTransformOrigin = (rect) => {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;
};

const captureMobileComposerOrigin = () => {
  if (typeof document === 'undefined') return;
  const fab = document.querySelector('.mobile-compose-fab');
  if (!fab) return;
  const origin = resolveFabTransformOrigin(fab.getBoundingClientRect());
  if (origin) mobileComposerTransformOrigin.value = origin;
};

const releaseMobileComposerOrigin = () => {
  mobileComposerTransformOrigin.value = '100% 100%';
};

const savedPostDraft = ref(null);
// 图片管线的云端删除幂等锁已随管线搬到 composables/useForumDraftImagePipelines.js
const cooldownNow = ref(Date.now());
const postCooldownUntil = ref(0);
const replyCooldownUntil = ref(0);
const imageUploadCooldownUntil = ref(0);
let cooldownTimer = null;
let forumFetchSeq = 0;
let forumFetchAbortController = null;
let postDraftSaveTimer = null;
let postDraftSyncQueue = Promise.resolve(null);
// 草稿没有固定的自动保存定时器：仅在打开会话时对账、关闭确认保存、发布后清理。
// let autoSaveDraftTimer = null;
let postDraftRestoreSeq = 0;
const {
  readDraftClearedAt,
  clearDraftClearedMarker,
  readDraftPendingPush,
  markDraftPendingPush,
  clearDraftPendingPush,
  readPostDraft,
  writeLocalPostDraft,
  readAutoSaveDraft,
  writeAutoSaveDraft,
} = useForumPostDraftStorage({
  getUserId: () => userInfo.id,
  normalizeTag: normalizeForumTagValue,
  prefix: FORUM_POST_DRAFT_PREFIX,
  logger,
});

/* ===== 草稿跨实例同步（2026-10-26）=====
   为什么需要：首页 `/` 没有 keepAlive（离开即销毁、回来重建），UserSpace 是 keepAlive
   路由且分区壳 v-show 常驻 ⇒ 同一时刻可能存在**两个** ForumMain 实例，共享同一个
   localStorage key，却各持一份 newPost 副本。没有同步通道时：
     · A 实例发布/清空后，B 实例的编辑器仍留着旧稿 ⇒ 切回去像"内容复活"，点「保存草稿」
       还会把旧稿写回去覆盖 A 的新草稿；
     · 反之 A 保存草稿后 B 也看不到。
   ⚠️ 不能用 `storage` 事件：同一标签页内的写入不触发自己的 storage 事件，而两个宿主
   实例恰好都在同一个 tab 里 ⇒ 必须走同标签页广播（事件名见 storage 模块）。 */
const draftHostId = `draft-host-${Math.random().toString(36).slice(2)}-${Date.now()}`;

/** 编辑器里**能写进草稿**的图片 = 已上传完成的持久 URL。
 *  只有 blob 预览的图刷新后必然失效，写进暂存只会让"恢复了"变成一张打不开的灰块。 */
const getEditorPersistableImageUrls = () =>
  postImages.value
    .map((img) => String(img?.uploadedUrl || '').trim())
    .filter(Boolean)
    .slice(0, FORUM_POST_IMAGE_MAX_COUNT);

/** 有图还在上传/检测中 ⇒ 刷新必丢，必须算「未保存」。 */
const hasUnpersistedPostImages = () =>
  postImages.value.some((img) => !String(img?.uploadedUrl || '').trim());

/** 编辑器内容是否与某份草稿一致（= 没有未保存的改动）。判据实现与测试在 storage 模块，
 *  这里只做「从响应式状态取值」的适配 —— 别在本文件再抄一份判断逻辑。 */
const draftMatchesEditor = (draft) => {
  if (hasUnpersistedPostImages()) return false;
  return isDraftInSyncWithEditor({
    draft,
    title: newPost.value.title,
    content: newPost.value.content,
    hasImages: postImages.value.length > 0,
    imageUrls: getEditorPersistableImageUrls(),
  });
};

/** 编辑器里有「刷新/离开会丢」的内容 —— 比 hasUnsavedChanges() 多一层「是否已落草稿」，
 *  发布会话与新帖宿主共用同一判据（见 handleBeforeUnload）。
 *  2026-10-29：实时暂存也算「已落盘」—— 它就是为了让刷新不丢，落进暂存后再弹
 *  「是否保存草稿」只会教用户无视提示（真正会丢的只剩"图还在上传中"那条）。 */
const isEditorDirty = () =>
  !draftMatchesEditor(savedPostDraft.value) && !draftMatchesEditor(readAutoSaveDraft());

const notifyDraftChange = (reason = 'save') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(FORUM_POST_DRAFT_CHANGE_EVENT, {
      detail: { hostId: draftHostId, reason, draft: readPostDraft() },
    }),
  );
};

const applyExternalDraftChange = (event) => {
  const detail = event?.detail;
  if (!detail || detail.hostId === draftHostId) return;
  const incoming = detail.draft || null;
  /* 对方明确清空了草稿 ⇒ 本实例**在飞**的恢复请求必须立刻失效。否则它会把
     "删除前读到的 localDraft" 当成较新的一份回写云端，僵尸草稿正是这么复活的
     （2026-10-29 事故：删掉「啊」后 updated_at 每次都被刷新回同一段文字）。 */
  if (!incoming) {
    postDraftRestoreSeq += 1;
    /* 还要掐掉本实例**待写**的实时暂存：另一个实例已经清了草稿，本实例若还有
       400ms 防抖没触发，它会在删除之后把同一段内容写回暂存 key —— 下次打开
       编辑器又被"恢复"，用户看到的就是"删了又冒出来"。 */
    if (autoSaveDraftTimer) {
      clearTimeout(autoSaveDraftTimer);
      autoSaveDraftTimer = null;
    }
    autoSaveDraftSignature = '';
  }
  // 编辑中（内容已偏离上一份已知草稿）就**只刷新草稿快照**，不动编辑器 ——
  // 否则会把用户正在打的字清掉。
  const editorFollowingDraft = draftMatchesEditor(savedPostDraft.value);
  savedPostDraft.value = incoming;
  if (!editorFollowingDraft) return;
  newPost.value = { title: incoming?.title || '', content: incoming?.content || '' };
  selectedPostTag.value = incoming?.tag || 'daily';
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
        /* 删除成功 ⇒ 本机不再有"待同步"的改动（本地副本已一起删掉）。
           不清这个标记，下次任何一次保存都会被误判成"本地领先云端"而继续回写。 */
        clearDraftPendingPush(userId);
        /* ⚠️ 删除成功后**不清**「已清空」墓碑（2026-10-29 僵尸草稿事故）。
           清了墓碑 = 忘了"用户明确删过"这件事，任何仍持旧副本的代码路径（典型：另一个
           宿主实例正在 await 的 restorePostDraft，读到的 localDraft 还是删除前的值）
           都能把同一段文字重新 upsert 回来，且每写一次都会刷新 updated_at —— 用户看到
           的就是"删了又回来、怎么删都删不掉"。
           墓碑只在新草稿真正写成功后清（见下面 upsert 分支），语义才闭合。 */
        return null;
      }
      /* 写入前的墓碑守卫 —— 全部云端写入的唯一出口就在这一处，所以只在这里判一次：
         比"用户最后一次明确清空"更旧的草稿是陈旧副本，不许复活。用户主动保存时
         savedAt = Date.now()，必然大于墓碑，不受影响。 */
      if (Number(draft.savedAt || 0) <= readDraftClearedAt(userId)) {
        logger.debug('forum', '跳过陈旧草稿的云端回写（用户已明确清空过）');
        return null;
      }
      const result = await upsertForumPostDraft(userId, draft);
      if (!result.ok) throw result.error;
      clearDraftClearedMarker(userId);
      // 本地改动已落到云端 ⇒ 不再"待同步"，这是唯一清标记的地方（下载成功即事实）
      clearDraftPendingPush(userId);
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

/* ===== 实时暂存（2026-10-29）：刷新 / 崩溃 / 误关标签页不丢内容与图片 =====
   为什么需要：草稿只在「关闭时点保存」才落盘，编辑期间没有任何副本 ⇒ 手滑刷新、
   渲染进程崩溃、手机切后台被杀，写的字和已上传的图一起消失（用户报障）。
   做法：编辑器开着时把当前状态 debounce 写进本机 key（`<prefix>_<uid>_autosave`），
   恢复时与正式草稿取"较新的那份"，图片按**已上传的持久 URL** 一起回来。
   它**不是**第二份草稿：不进云端、不进任何"草稿列表"，用户明确删除草稿时一起清。
   ⚠️ 只在编辑器开着时写：两个宿主实例同时写同一个 key 会互相覆盖，而且编辑器关掉后
      内容应该已经"被用户处理过"（保存/丢弃/已发布），不该再留副本。 */
let autoSaveDraftTimer = null;
let autoSaveDraftSignature = '';

const getEditorAutoSaveSignature = () =>
  JSON.stringify([
    String(newPost.value.title || ''),
    String(newPost.value.content || ''),
    normalizeForumTagValue(selectedPostTag.value) || 'daily',
    getEditorPersistableImageUrls(),
  ]);

const buildEditorAutoSaveDraft = () => {
  const title = String(newPost.value.title || '');
  const content = String(newPost.value.content || '');
  const tag = normalizeForumTagValue(selectedPostTag.value) || 'daily';
  const images = getEditorPersistableImageUrls().map((url) => ({ url }));
  if (!title.trim() && !content.trim() && !images.length) return null;
  const savedAt = Date.now();
  return images.length
    ? { title, content, tag, savedAt, images }
    : { title, content, tag, savedAt };
};

const writeAutoSaveNow = () => {
  autoSaveDraftSignature = getEditorAutoSaveSignature();
  writeAutoSaveDraft(buildEditorAutoSaveDraft());
};

/** 同步落盘：pagehide / beforeunload 里调 —— 那里不允许 await，debounce 也来不及跑。 */
const flushAutoSaveDraft = () => {
  if (autoSaveDraftTimer) {
    clearTimeout(autoSaveDraftTimer);
    autoSaveDraftTimer = null;
  }
  writeAutoSaveNow();
};

const scheduleAutoSaveDraft = () => {
  if (autoSaveDraftTimer) clearTimeout(autoSaveDraftTimer);
  autoSaveDraftTimer = setTimeout(() => {
    autoSaveDraftTimer = null;
    // 签名没变就别重写：输入法把同一个字反复提交、或 watch 因图片状态抖动触发时，
    // 每次写都会 new Date() 换 savedAt，白白让后面"取较新一份"的判断失真。
    if (getEditorAutoSaveSignature() === autoSaveDraftSignature) return;
    writeAutoSaveNow();
  }, 400);
};

const clearAutoSaveDraft = () => {
  if (autoSaveDraftTimer) {
    clearTimeout(autoSaveDraftTimer);
    autoSaveDraftTimer = null;
  }
  autoSaveDraftSignature = '';
  writeAutoSaveDraft(null);
};

/** 把暂存里的图片回填进编辑器。只在编辑器**一张图都没有**时补 ——
 *  已有图 = 活会话（用户刚选的、或正在上传的），拿暂存去比对替换只会把新选的图洗掉，
 *  而暂存的图本来也只是"上次的内容"，用户的新选择永远优先。 */
const restoreDraftImages = (images) => {
  const urls = (Array.isArray(images) ? images : [])
    .map((image) => String(image?.url || '').trim())
    .filter(Boolean)
    .slice(0, FORUM_POST_IMAGE_MAX_COUNT);
  if (!urls.length || postImages.value.length) return;
  postImages.value = urls.map((url, index) => ({
    uploadId: `draft-recover-${index}`,
    url,
    uploadedUrl: url,
    uploadStatus: 'approved',
    uploadStatusLabel: '已就绪',
    localPreviewUrl: '',
    file: null,
    sortOrder: index,
  }));
};

const applyDraftToEditor = (draft, { withImages = false } = {}) => {
  if (!draft) return;
  newPost.value = { title: draft.title || '', content: draft.content || '' };
  selectedPostTag.value = draft.tag || 'daily';
  if (withImages) restoreDraftImages(draft.images);
};

const restorePostDraft = async ({ preserveLocalEdits = false } = {}) => {
  // Phase 4（plans/023）：Cloud+「转为帖子」预填期间跳过恢复 —— 否则旧草稿会把
  // 用户刚选好的图覆盖掉。预填是一次性的（读后即删），抑制只作用于当前会话。
  try {
    if (convertPrefillApplied.value) return;
  } catch {
    /* ignore */
  }
  const restoreSeq = ++postDraftRestoreSeq;
  const localDraft = readPostDraft();
  const autoSavedDraft = readAutoSaveDraft();
  const localClearedAt = readDraftClearedAt();
  /* preserveLocalEdits：KeepAlive 唤醒 / 重新打开编辑器时的恢复，**不得**覆盖用户尚未
     保存的输入（与下面远端分支的 editorSnapshot 校验同一语义）。挂载/换账号仍走默认
     的「本地草稿优先回填」，否则做不到"下次打开接着写"。 */
  const canOverwriteEditor = !preserveLocalEdits || draftMatchesEditor(savedPostDraft.value);
  /* 本机两份副本取**较新**的那份：实时暂存写得更频繁、还能带图 ⇒ 通常它就是用户最后
     看到的内容；正式草稿在此基础上兜跨设备。 */
  const localBest =
    autoSavedDraft &&
    (!localDraft || Number(autoSavedDraft.savedAt || 0) >= Number(localDraft.savedAt || 0))
      ? autoSavedDraft
      : localDraft;
  savedPostDraft.value = localDraft;
  if (localBest && canOverwriteEditor) applyDraftToEditor(localBest, { withImages: true });
  notifyDraftChange('restore');

  const editorSnapshot = {
    title: String(newPost.value.title || ''),
    content: String(newPost.value.content || ''),
    tag: normalizeForumTagValue(selectedPostTag.value) || 'daily',
  };

  const userId = String(userInfo.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  try {
    const result = await getForumPostDraft(userId);
    if (restoreSeq !== postDraftRestoreSeq) return;
    if (String(userInfo.id || '').trim() !== userId) return;
    if (
      String(newPost.value.title || '') !== editorSnapshot.title ||
      String(newPost.value.content || '') !== editorSnapshot.content ||
      (normalizeForumTagValue(selectedPostTag.value) || 'daily') !== editorSnapshot.tag
    )
      return;
    if (!result.ok) throw result.error;

    const remoteDraft = result.data;
    /* 「本机能不能覆盖云端」的唯一判据：本机是否真的有一份**没同步成功的**改动。
       以前是 s(savedAt) 比大小猜 —— 那只说明"本机这份看起来更新"，不说明"云端欠它一次写入"。
       猜错的代价就是僵尸草稿：云端被别的设备删掉后，任何一台还留着旧副本的设备都会在
       "云端查不到"这一支里把它推回去。 */
    const canPushLocal = readDraftPendingPush() > 0;
    if (!remoteDraft) {
      /* 云端没有草稿（要么从没有过，要么被别处删掉了）。
         只有本机确实有待同步改动时才回写 —— 否则云端是权威，本机这份只是历史遗迹，
         留在编辑器里给用户看即可，**不许**推上去复活它（2026-10-29 跨设备僵尸草稿）。 */
      if (
        canPushLocal &&
        localBest &&
        (String(localBest.title || '').trim() || String(localBest.content || '').trim())
      ) {
        void savePostDraftToDatabase(localBest);
      }
      return;
    }

    // 如果上次云端删除因断网失败，用本地清空标记拦截旧草稿，
    // 并在恢复网络后继续删除，不让那个旧字符再次回填。
    if (localClearedAt && Number(remoteDraft.savedAt || 0) <= localClearedAt) {
      void savePostDraftToDatabase(null);
      return;
    }

    if (localBest && Number(localBest.savedAt || 0) > Number(remoteDraft.savedAt || 0)) {
      /* 本机内容更新：编辑器在上面已经回填过本机那份，这里不动编辑器。
         只在「确实有待同步改动」时才推云端 —— 否则（典型：只是本机暂存比云端新）
         推上去等于用没被用户确认过的内容覆盖云端草稿。 */
      if (canPushLocal) void savePostDraftToDatabase(localBest);
      return;
    }

    savedPostDraft.value = remoteDraft;
    writeLocalPostDraft(remoteDraft);
    /* 云端草稿没有图片列 ⇒ 这里只回填文字，图片保留编辑器/暂存里已有的那些
       （否则刚恢复的图会被"云端没有图"清掉）。 */
    if (canOverwriteEditor) applyDraftToEditor(remoteDraft);
    notifyDraftChange('restore-remote');
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
      /* 草稿结构只有 title/content/tag，图片存不进去 ⇒ 「只有图片、没有文字」时
         **不能**把已有草稿清掉：此前这条分支会 writeLocalPostDraft(null)，表现为
         用户点「保存草稿」反而把草稿删了（按钮文案与行为完全相反）。
         保留原草稿并直接返回；发布/关闭确认链会给出对应提示。 */
      if (postImages.value.length) {
        logger.debug('forum', '仅有图片、无文字：草稿不可保存，保留已有草稿');
        return;
      }
      writeLocalPostDraft(null);
      savedPostDraft.value = null;
      clearAutoSaveDraft();
      schedulePostDraftDatabaseSync(null);
      notifyDraftChange('clear');
      return;
    }
    const draft = { title, content, tag, savedAt: Date.now() };
    writeLocalPostDraft(draft);
    /* 本地已领先云端 ⇒ 打上「待同步」标记。写盘和置标记都发生在**云端写成功之前**，
       所以哪怕页面在这一刻被关掉（900ms 防抖没跑完），下次打开也知道"这份本机内容
       欠云端一次写入"，该推就推；反之没有这个标记就永远不许推（见 restorePostDraft）。 */
    markDraftPendingPush();
    savedPostDraft.value = draft;
    schedulePostDraftDatabaseSync(draft);
    notifyDraftChange('save');
  } catch (error) {
    logger.warn('forum', '保存发帖草稿失败:', error);
  }
};

/* 发布会话不再在编辑器内部显示「已自动保存 HH:mm」—— 手动草稿面板已移除，
   保存反馈只来自关闭确认链的成功 toast，不再持有一份无人读取的时间状态。 */

// 固定间隔的自动保存定时器已移除；草稿只在明确的保存/清理路径落盘。
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
  /* 先把最后一点输入同步落进本机暂存（debounce 可能还没到）。这一步没有任何
     网络请求，纯 localStorage 写入，可以在卸载钩子里安全执行。 */
  if (isMobileComposerOpen.value) flushAutoSaveDraft();
  const hasPendingPublish = publishQueueStore.items.some((i) =>
    ['queued', 'uploading', 'publishing'].includes(i.state),
  );
  if (hasPendingPublish) {
    e.preventDefault();
    e.returnValue = '有内容正在发送，离开将中断发送';
    return e.returnValue;
  }
  /* 判据是 isEditorDirty()（编辑器内容 ≠ 已保存草稿），**不**再短路在
     `!isMobileComposerOpen` 上：发布会话未打开时直接放行，此前永远拿不到刷新保护
     ⇒ 宽屏写半天一刷新全丢、连提示都没有。而"内容已落草稿"时它返回 false，
     不会出现"只是回填了草稿也弹提示"的误报。 */
  if (!isEditorDirty()) return;

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
    /* 实时暂存跟着一起清（2026-10-29）：清草稿的语义是"这份内容我不要了"，只清正式
       草稿而留着暂存，下次打开编辑器又会被原样恢复回来 —— 用户看到的就是"删不掉"。 */
    clearAutoSaveDraft();
    notifyDraftChange('clear');
    return savePostDraftToDatabase(null);
  } catch (error) {
    logger.warn('forum', '清理发帖草稿失败:', error);
    return Promise.resolve(null);
  }
};

const getCooldownSeconds = (until) =>
  Math.max(0, Math.ceil((Number(until || 0) - cooldownNow.value) / 1000));

const postCooldownSeconds = computed(() => getCooldownSeconds(postCooldownUntil.value));
const replyCooldownSeconds = computed(() => getCooldownSeconds(replyCooldownUntil.value));
const imageUploadCooldownSeconds = computed(() =>
  getCooldownSeconds(imageUploadCooldownUntil.value),
);

const replySubmitLabel = computed(() =>
  replyCooldownSeconds.value > 0 ? `${replyCooldownSeconds.value}s 后发送` : '发送',
);
const imageUploadCooldownLabel = computed(() =>
  imageUploadCooldownSeconds.value > 0 ? `${imageUploadCooldownSeconds.value}s 后上传` : '',
);

const ensureCooldownTimer = () => {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(() => {
    cooldownNow.value = Date.now();
    if (
      postCooldownSeconds.value <= 0 &&
      replyCooldownSeconds.value <= 0 &&
      imageUploadCooldownSeconds.value <= 0
    ) {
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

// 移动端判断（窄屏档；竖屏编辑器形态由 forum-viewport 单源判据驱动，不在此处手算）
const MOBILE_BREAKPOINT = 768;
const isMobile = ref(
  typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
);
let resizeRafId = null;
const updateMobileStatus = () => {
  if (resizeRafId) return;
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT;
  });
};

if (typeof window !== 'undefined') {
  updateMobileStatus();
}

// KeepAlive 失活守卫：UserSpace 是 keepAlive 路由，切到底栏其它 tab 后本组件（连同
// Teleport 到 body 的 FAB）仍然存活 —— 失活实例绝不允许再露 FAB，否则回到首页会出现
// 两个重叠的 + 号（2026-10-05 实测往返切换后 count=2）。非 keepAlive 宿主（首页）这两个
// 钩子不会触发，ref 保持初始 true，行为不变。
const isRouteInstanceActive = ref(true);
onActivated(() => {
  isRouteInstanceActive.value = true;
});
onDeactivated(() => {
  isRouteInstanceActive.value = false;
});

const isForumComposerFabVisible = computed(() => {
  /* FAB 只属于「内容」——首页 feed 分区与 UserSpace 的「内容」tab 都算内容流，
     官方/成员 tab 与底栏其它落点（我/消息/AI）一律不挂载。
     2026-10-26：内嵌发帖器已废弃，FAB 是 feed 页唯一常驻发帖入口。
     横屏分栏另有左栏「发布」；两者都打同一场发布会话，不产生两套编辑状态。 */
  if (!isRouteInstanceActive.value) return false;
  if (feedMode.value !== 'posts') return false;
  if (!props.embedded) return true;
  if (route.path === '/user-space') {
    /* 分区壳是 v-show 常驻：其它 tab 下 ForumMain 也 mounted，只有「内容/方块」tab
       真正可见时才露，否则会从 v-show 后面钻出第二个 + 号。
       无 tab 参数 = 默认进方块 tab（useUserSpaceTabs initialTab='community'），同样算可见。
       这里**不再判 view**：本实例只在 feed 分区被 v-if 挂载（ForumSectionShell），
       能渲染就已经是「最新/关注/新闻/活动」之一。 */
    const tab = getQueryString(route.query.tab);
    return tab === '' || tab === 'community';
  }
  if (route.path !== '/') return false;
  const view = getQueryString(route.query.view);
  return view === '' || isForumFeedSection(view);
});

const openMobileComposer = () => {
  feedMode.value = 'posts';
  // 先拍 FAB 中心，再开 v-if；overlay 的 transform-origin 才能锚定到触发按钮。
  captureMobileComposerOrigin();
  /* 打开编辑器时按最新草稿对一次账（兜住"另一个宿主刚保存/清空"的情况）。
     preserveLocalEdits：另一个标签页/实例可能已经改过草稿，不能覆盖当前内存稿。 */
  void restorePostDraft({ preserveLocalEdits: true });
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
  /* ⚠️ 会话没开时必须是纯 no-op（2026-10-18 用户报障：点左栏「内容」/底栏「我的」无故弹
     「保存草稿」，而编辑器从未打开）。
     真因：外层闸门 dismissComposerSession() 对**每一次导航**都无条件调本函数，而本函数只
     看 hasUnsavedChanges() —— 那是「编辑器里有没有字」，不是「有没有正在编辑的会话」。
     restorePostDraft() 在 mount / 登录 / 换账号时会把本地或云端草稿回填进 newPost（设计如此，
     好让下次打开编辑器接着写），于是**只要存过草稿，newPost 就长期非空** ⇒ 每次点导航都被
     当成「用户正在离开编辑器」而弹确认；选「保存」还会原样再存一次，永远解不掉。
     同一份语义在 handleBeforeUnload 里已经写对了（`!isMobileComposerOpen.value ||` 短路），
     这里补齐即可。会话状态真源仍是 isMobileComposerOpen，别改成看 newPost。 */
  if (!isMobileComposerOpen.value) return;
  // 检查是否有未保存的内容
  if (hasUnsavedChanges()) {
    // 弹出确认框询问是否保存草稿
    const shouldSave = await requestConfirm({
      title: '保存草稿',
      message: '是否将当前编辑内容保存为草稿？',
      confirmText: '保存',
      cancelText: '不保存',
    });

    if (shouldSave) {
      // 用户确认保存
      persistPostDraft();
      clearPostDraftSaveTimer();
      await savePostDraftToDatabase(savedPostDraft.value);
      logger.debug('forum', '用户选择保存草稿并关闭编辑器');
    } else {
      // “不保存”不仅要清空编辑器，也要删除本地和云端的旧草稿（含实时暂存 —— 见 clearPostDraft）。
      void clearPostDraft();
      newPost.value = { title: '', content: '' };
      selectedPostTag.value = 'daily';
      postLocation.value = null;
      clearPostImages({ cleanup: true });
      logger.debug('forum', '用户选择不保存草稿并关闭编辑器');
    }
  } else if (savedPostDraft.value || readAutoSaveDraft()) {
    /* 内容为空但仍有旧草稿 = 用户进编辑器后把字全删了再关。此前这里直接跳过整个
       分支，本地/云端草稿原样留着 ⇒ 下次挂载 restorePostDraft 又把它填回编辑器
       （用户："我明明删了，怎么又回来了"）。删除意图必须落盘。
       只清正式草稿会漏掉"只有暂存、没有草稿"的情形，所以两者都要看。 */
    void clearPostDraft();
    logger.debug('forum', '内容已清空：同步删除残留草稿');
  }

  // 关闭前重新量一次：确认弹窗期间可能旋转、FAB 的 embedded 抬升也可能变化。
  captureMobileComposerOrigin();
  isMobileComposerOpen.value = false;
};

const handleThemeChange = (
  theme,
  _preference,
  uiStyle = themeManager.getUiStyle?.() || currentUiStyle.value,
) => {
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
      updated_at: updated.updated_at ?? item.updated_at,
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
    anniversaryObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            showAnniversaryBg.value = true;
            anniversaryObserver?.disconnect();
            anniversaryObserver = null;
          }
        });
      },
      { rootMargin: '100px' },
    );
    anniversaryObserver.observe(forumPageRef.value);
  } else {
    showAnniversaryBg.value = true;
  }
  restorePostDraft();
  // 不再启动固定间隔的自动保存定时器；挂载时只恢复草稿。
  // startAutoSaveDraftTimer();
  window.addEventListener('resize', updateMobileStatus);
  window.addEventListener('orientationchange', updateMobileStatus);
  // 监听刷新请求事件（从导航栏点击"我的方块"时触发）
  window.addEventListener('boh_forum_refresh_request', handleForumRefreshRequest);
  window.addEventListener('boh:forum-post-deleted', handleForumPostDeleted);
  window.addEventListener('boh:forum-post-updated', handleForumPostUpdated);
  // ✨ 新增：beforeunload事件监听（刷新页面时提示保存草稿）
  window.addEventListener('beforeunload', handleBeforeUnload);
  // 刷新 / 关闭 / 切后台被杀：同步落一次实时暂存（beforeunload 在移动端不一定来）
  window.addEventListener('pagehide', handleComposerPageHide);
  // 草稿跨实例同步：另一个宿主实例保存/清空草稿时，本实例跟着收敛（见 draftHostId 区块）
  window.addEventListener(FORUM_POST_DRAFT_CHANGE_EVENT, applyExternalDraftChange);

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
  /* KeepAlive 唤醒时补一次草稿对账：本实例可能是几分钟前的副本，期间首页实例或
     另一个宿主已经改过/清过草稿。preserveLocalEdits 保证不覆盖用户尚未保存的输入。 */
  void restorePostDraft({ preserveLocalEdits: true });
  setupForumLoadMoreObserver();
  setupForumWindowObserverOnce();
  if (
    postCooldownUntil.value > Date.now() ||
    replyCooldownUntil.value > Date.now() ||
    imageUploadCooldownUntil.value > Date.now()
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
  document.body.style.overflow = '';
});

onUnmounted(() => {
  cancelIdleReplyPrefetch();
  stopForumVirtualFeed();
  anniversaryObserver?.disconnect();
  anniversaryObserver = null;
  themeManager.removeListener(handleThemeChange);
  clearForumImageModerationPreloadTask();
  // 图片卡顿提示的定时器已随管线搬到 composable，由它自己的 onUnmounted 收尾
  // ✨ 移除：clearAutoSaveDraftTimer()调用（函数已不存在）
  // clearAutoSaveDraftTimer();
  forumFetchAbortController?.abort?.();
  forumFetchAbortController = null;
  window.removeEventListener('resize', updateMobileStatus);
  window.removeEventListener('orientationchange', updateMobileStatus);
  window.removeEventListener('boh_forum_refresh_request', handleForumRefreshRequest);
  window.removeEventListener('boh:forum-post-deleted', handleForumPostDeleted);
  window.removeEventListener('boh:forum-post-updated', handleForumPostUpdated);
  // ✨ 新增：移除beforeunload事件监听
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('pagehide', handleComposerPageHide);
  window.removeEventListener(FORUM_POST_DRAFT_CHANGE_EVENT, applyExternalDraftChange);
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  document.body.style.overflow = '';
  void discardDraftPostImages({ silent: true });
  cancelPendingSearch();
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
  // 会话开关外报：外层左栏据此做「发布」选中态 + 切落点前先收会话
  emit('composer-state', isOpen);
});

/* 实时暂存触发器（2026-10-29）：编辑器开着时把输入与**已上传**图片 debounce 写本机。
   ⚠️ 逐项 getter，别写 `() => [...]` 里塞对象/数组：那会每次求值都换引用，
   一次打字触发 N 次写盘（同 useForumVirtualFeed 那条注释的坑）。 */
watch(
  [
    () => String(newPost.value.title || ''),
    () => String(newPost.value.content || ''),
    () => normalizeForumTagValue(selectedPostTag.value) || 'daily',
    () => getEditorPersistableImageUrls().join('\u0000'),
  ],
  () => {
    if (!isMobileComposerOpen.value) return;
    scheduleAutoSaveDraft();
  },
);

/* pagehide 而不是只在 beforeunload：iOS Safari / 微信 WebView 常直接杀进程，
   beforeunload 不一定触发，pagehide 是这里唯一靠得住的时机。
   只 flush、不去动云端 —— 卸载阶段任何 await 都不会被等。 */
const handleComposerPageHide = () => {
  if (!isMobileComposerOpen.value) return;
  flushAutoSaveDraft();
};

/** 换账号 / 登出时清掉内存里的编辑器副本。
 *  ⚠️ 只清内存，**不**调 clearPostDraft —— 那会把上一个账号的云端草稿真删掉。
 *  为什么必须清：restorePostDraft 在新账号名下读不到草稿时**不覆盖** newPost
 *  （设计如此，否则"什么都没有"会把编辑器清空），于是上一个账号的草稿会留在编辑器里，
 *  被下一个账号看到、甚至以新账号身份发出去。 */
const resetComposerEditorForAccountSwitch = () => {
  postDraftRestoreSeq += 1; // 让在飞的恢复请求失效，别把旧账号的草稿回填进来
  clearPostDraftSaveTimer();
  newPost.value = { title: '', content: '' };
  selectedPostTag.value = 'daily';
  postLocation.value = null;
  postImages.value = [];
  postImageUploadStatus.value = '';
  savedPostDraft.value = null;
};

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
  resetComposerEditorForAccountSwitch();
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
      resetComposerEditorForAccountSwitch();
    }
    if (isLoggedIn.value && userId) {
      loadWeeklyCheckinStatus();
    }
    restorePostDraft();
  },
);

// 不再按输入 watch 自动保存草稿；恢复、关闭确认与发布清理是仅有的草稿路径。
// watch(
//   () => [newPost.value.title, newPost.value.content, selectedPostTag.value],
//   () => {
//     persistPostDraft();
//   }
// );

/* ⚠️ 必须逐项 watch，不能写 `() => [ ... ]`：getter 每次求值都返回新数组，
   依赖里又含 `forumData.value`（shallowRef）⇒ 发布进度每 300ms 换一次数组引用
   就会触发一次回调，把虚拟列表的 IntersectionObserver 重建一遍（详见
   useForumVirtualFeed 里 visibleForumPostSignature 的注释）。逐项 watch 之后，
   进度 tick 不改 length ⇒ 不再触发。 */
watch(
  [() => forumData.value.length, feedMode, hasMoreData, isLoading],
  () => {
    setupForumWindowObserverOnce();
  },
  { flush: 'post' },
);

// 外部 feed 接管（用户空间社区段控）：latest/following/news/activity → 关注态 + 内容类型一次同步（单次 fetch）
watch(
  () => props.externalFeed,
  (val) => {
    const nextFollowing = val === 'following';
    /* 2026-10-22：论坛把「新闻」「活动」并成「资讯」一席 ⇒ news 分区现在要**同时**
       展示两类官方内容，所以映射到 kindFilter 'info'（= news + activity，
       见 post-api 的 normalizeForumKindFilter）。activity 分区保留原映射，
       让旧深链 `?view=activity` 仍可用。 */
    const nextKind = val === 'news' ? 'info' : val === 'activity' ? 'activity' : '';
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
  },
  { immediate: true },
);

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
  },
);

// 帖子列表预览：保留用户原始排版，溢出交给 CSS 控制（5 行 max-height）。
// 「...」是否出现由 PostCard 实测（P2-4），这里不再做字数/行数估算。

const extractPostTitle = (postOrContent) => {
  if (postOrContent && typeof postOrContent === 'object') {
    const explicitTitle = String(postOrContent.title || '').trim();
    if (explicitTitle) return explicitTitle;
  }
  const rawContent =
    postOrContent && typeof postOrContent === 'object' ? postOrContent.content : postOrContent;
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

/* `isBodyPreviewOverflowLikely` 已删除（2026-10-17 P2-4）：按字数/行数估算「会不会溢出」
   与 CSS 的 5 行 max-height 不同源，边界处文字被静默切断在句中、连省略号都没有。
   「...」的判定改在 PostCard 内实测 `scrollHeight > clientHeight`（与 CSS 同一条约束）。 */

const getPostImages = (post) => {
  const images = Array.isArray(post?.images) ? post.images.filter((image) => image?.url) : [];
  if (images.length) return images;

  const coverUrl = String(post?.cover_image_url || post?.coverImageUrl || '').trim();
  if (!coverUrl) return [];
  const rawCoverUrl = String(post?.cover_image_url_raw || coverUrl).trim();
  // 官方卡（新闻/活动镜像）的 cover_image_url 可能是新闻/活动库里的 Vite 资源引用
  // （如 @/assets/images/xxx.webp，老数据为 .png，同目录有同名 webp 兜底），
  // 必须经 getImageUrl 解析成打包 URL，否则 <img> 直接裂图；data:/http 原样直通。
  const resolvedCoverUrl = getImageUrl(coverUrl, { silent: true }) || coverUrl;
  const resolvedRawCoverUrl = getImageUrl(rawCoverUrl, { silent: true }) || rawCoverUrl;
  return [
    {
      id: `${String(post?.id || 'post').trim() || 'post'}-cover`,
      url: getCloudinaryTransformedUrl(resolvedCoverUrl, FORUM_LIST_IMAGE_TRANSFORM),
      originalUrl: resolvedRawCoverUrl,
      detailUrl: getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_DETAIL_IMAGE_TRANSFORM),
      srcset: [
        `${getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM_SM)} 360w`,
        `${getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM_MD)} 540w`,
        `${getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM)} 720w`,
      ].join(', '),
      lqipUrl: getCloudinaryTransformedUrl(resolvedRawCoverUrl, FORUM_LIST_LQIP_TRANSFORM),
      width: Number(post?.cover_image_width || post?.coverImageWidth || 0),
      height: Number(post?.cover_image_height || post?.coverImageHeight || 0),
      sortOrder: 0,
    },
  ];
};

const FORUM_IMAGE_LAZY_ROOT_MARGIN = '300px 0px';
const FORUM_IMAGE_LAZY_THRESHOLD = 0.01;
let forumImageLazyObserver = null;

const getForumImageLazyObserver = () => {
  if (forumImageLazyObserver) return forumImageLazyObserver;
  if (typeof IntersectionObserver === 'undefined') return null;
  forumImageLazyObserver = new IntersectionObserver(
    (entries) => {
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
    },
    { rootMargin: FORUM_IMAGE_LAZY_ROOT_MARGIN, threshold: FORUM_IMAGE_LAZY_THRESHOLD },
  );
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
    eager: isEager && imageIndex === 0,
  }));
  const imageCount = Math.max(Number(preparedPost.image_count || 0), allImages.length);

  // 转发帖（post_kind=repost）只存转发留言，原帖经 repost_of_post_id 引用，
  // 由 ensureQuotedPostsForReposts 回源后在卡片引用框展示；标题先兜底避免"无标题"
  // （normalizePostListRecord 会把无【】的 content 拆出 title='无标题'，一并排除）
  const preparedTitle = String(preparedPost.title || '').trim();
  preparedPost.displayTitle =
    preparedPost.post_kind === 'repost' && (!preparedTitle || preparedTitle === '无标题')
      ? '转发动态'
      : extractPostTitle(preparedPost);
  preparedPost.displayBody = extractPostBody(preparedPost);
  // ⚠️ `isBodyOverflowLikely` 已删除（2026-10-17 P2-4）：「...」是否出现改由 PostCard
  // 实测 `scrollHeight > clientHeight`（与 CSS 的 5 行 max-height 同源）。
  // 这里的字数/行数估算会漏判 —— 估算说「不超」但实际折行更多时，文字被静默切断在句中。
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

const prepareForumPosts = (posts = [], startIndex = 0) =>
  Array.isArray(posts)
    ? posts
        .filter((post) => {
          const kind =
            post?.post_kind ||
            (/^【新闻】/.test(String(post?.content || ''))
              ? 'news'
              : /^【活动】/.test(String(post?.content || ''))
                ? 'activity'
                : 'unknown');
          /* 「论坛」= 普通帖 + 用户转发（repost）、「资讯」= 官方新闻 + 活动 ——
             口径统一在 post-api 的 matchesForumContentKind，别在这里再写一份
             （2026-10-22 就是这里只写了精确匹配，把资讯过滤成了空列表）。 */
          return matchesForumContentKind(kind, selectedContentType.value);
        })
        .map((post, index) => prepareForumPostForDisplay(post, startIndex + index))
    : [];

const hydrateOfficialPostKinds = async (posts = []) => {
  const safePosts = Array.isArray(posts) ? posts : [];
  const ids = safePosts.map((post) => post?.id).filter(Boolean);
  if (!ids.length) return safePosts;
  // 类型回源只补「行里没有 post_kind」的帖子：keyset 直查行自带 posts 表真值
  //（DB 零空值，2026-10-05 实测 145/145）；list_forum_posts RPC 24 列里没有
  // post_kind，搜索/排序/关注路径的行才需要回源 —— 官方帖类型历史事故守卫保留。
  const missingKindIds = [
    ...new Set(safePosts.filter((post) => post?.id && !post.post_kind).map((post) => post.id)),
  ];
  const metadata = new Map();
  if (missingKindIds.length) {
    const { data } = await supabase
      .from('posts')
      .select('id, post_kind, cover_image_url, title')
      .in('id', missingKindIds);
    for (const row of data || []) metadata.set(row.id, row);
  }
  // 目录（news/activities）只被「缺类型或缺封面」的帖子消费；5min memo 见 official-directory.js
  const needsDirectory = safePosts.some((post) => {
    if (!post) return false;
    const meta = metadata.get(post.id);
    const kindUnresolved = !post.post_kind && !meta?.post_kind;
    const coverUnresolved = !post.cover_image_url && !meta?.cover_image_url;
    return kindUnresolved || coverUnresolved;
  });
  const { newsByTitle, activityByTitle } = needsDirectory
    ? await loadOfficialDirectory()
    : { newsByTitle: new Map(), activityByTitle: new Map() };
  return safePosts.map((post) => ({
    ...post,
    post_kind:
      metadata.get(post.id)?.post_kind ||
      post.post_kind ||
      (/^【新闻】/.test(String(post.content || ''))
        ? 'news'
        : /^【活动】/.test(String(post.content || ''))
          ? 'activity'
          : newsByTitle.has(String(post.title || '').trim())
            ? 'news'
            : activityByTitle.has(String(post.title || '').trim())
              ? 'activity'
              : 'unknown'),
    cover_image_url:
      post.cover_image_url ||
      metadata.get(post.id)?.cover_image_url ||
      newsByTitle.get(String(post.title || '').trim())?.image ||
      activityByTitle.get(String(post.title || '').trim())?.image ||
      '',
  }));
};

const getForumFeedSnapshotKey = () =>
  buildForumFeedSnapshotKey({
    userId: isLoggedIn.value ? userInfo.id : 'guest',
    viewMode: viewMode.value,
    sortMode: sortMode.value,
    searchKeyword: searchKeyword.value,
    tagFilter: selectedTagFilter.value,
    contentType: selectedContentType.value,
    followingOnly: showFollowingOnly.value,
  });

const persistForumFeedSnapshot = () => {
  if (feedMode.value !== 'posts' || forumLoadError.value) return;
  // 乐观帖不落快照，避免刷新后残留
  const snapshotPosts = forumData.value.filter((p) => !p._optimistic);
  writeForumFeedSnapshot(getForumFeedSnapshotKey(), {
    posts: snapshotPosts,
    currentPage: currentPage.value,
    nextPageCursor: nextPageCursor.value,
    hasMoreData: hasMoreData.value,
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
  const baseImages = (Array.isArray(post?.allImages) ? post.allImages : []).filter(
    (image) => image?.url,
  );
  if (!baseImages.length) return;
  const clickedImage =
    baseImages[Math.min(Math.max(Number(index || 0), 0), baseImages.length - 1)] || null;
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
  const reposts = forumData.value.filter(
    (p) => p.post_kind === 'repost' && p.repost_of_post_id && !p.quotedPost,
  );
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

/**
 * 「再看一遍」：已签到用户再点签到时的重播。
 * 不提交、不弹提示岛 —— 直接把同一套舞台重播，文案换成「已签到」。
 * 这是用户明确要的（2026-10-29）：卡面旋转是彩蛋，不该一周只能看一次。
 */
const replayCheckinStage = async () => {
  if (checkinReward.value.open) return;
  // 资源走同一个 preload：命中模块级缓存时几乎瞬时，没命中也不会白屏（超时降级 blank）
  const assets = await preloadPointsCardAssets({
    skin: userInfo.pointsCardSkin || 'blank',
    imageUrl: userInfo.pointsCardImageUrl || '',
  }).catch(() => ({ ready: false, failed: [], timedOut: false }));

  checkinReward.value = {
    open: true,
    pointsAfter:
      readPoints(weeklyCheckinStatus.value.currentPoints) ?? (Number(userInfo.points) || 0),
    awardAmount: 0,
    alreadySigned: true,
    assetsReady: assets.ready,
  };
};

/**
 * 签到入口（2026-10-29 起一步到位）：点按钮即提交，不再开面板。
 * 已签 → 走 replayCheckinStage（重播舞台，文案「已签到」）；未登录 → 登录弹窗。
 */
const handleCheckinClick = () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (isWeeklyCheckinSubmitting.value) return;

  if (weeklyCheckinStatus.value.hasSignedThisWeek) {
    void replayCheckinStage();
    return;
  }

  // 状态可能因上次加载失败而停在「未签到」，顺手自愈一次（失败不阻塞本次提交）
  if (!isWeeklyCheckinLoading.value) void loadWeeklyCheckinStatus();
  void handleWeeklyCheckin();
};

const closeCheckinReward = () => {
  checkinReward.value = { ...checkinReward.value, open: false };
};

const loadWeeklyCheckinStatus = async () => {
  if (!isLoggedIn.value) {
    weeklyCheckinStatus.value = createDefaultWeeklyCheckinStatus();
    return;
  }
  // 已登录但 id 尚未就绪：保持现状，等 userInfo.id 的 watcher 再拉。
  // 这里若重置成默认值，会把「后端已确认本周已签」的本地状态抹掉 → 按钮重新可点。
  if (!userInfo.id) return;

  isWeeklyCheckinLoading.value = true;
  try {
    const { ok, data, error } = await getWeeklyCheckinStatus(userInfo.id);
    if (!ok || error || !data) {
      // 拉取失败就保持现状，绝不用默认值覆盖 —— 覆盖等于「假装没签过」
      logger.error('forum', '加载周签到状态失败:', error);
      return;
    }

    weeklyCheckinStatus.value = {
      ...createDefaultWeeklyCheckinStatus(),
      ...data,
    };

    // 只有后端真的回了余额才写回；缺字段时写 0 会把界面余额清零（2026-09-29 事故）
    applyPoints(userInfo, data.currentPoints);
  } catch (error) {
    logger.error('forum', '加载周签到状态异常:', error);
  } finally {
    isWeeklyCheckinLoading.value = false;
  }
};

const handleWeeklyCheckin = async () => {
  if (isWeeklyCheckinSubmitting.value) return;

  isWeeklyCheckinSubmitting.value = true;
  try {
    // 卡面预取与提交**并行**：等 RPC 回来再开始下图片等于白等一个 RTT。
    // preload 自身永不 reject；再兜一层，任何注入实现抛错都不能吞掉「签到成功」。
    const assetsPromise = preloadPointsCardAssets({
      skin: userInfo.pointsCardSkin || 'blank',
      imageUrl: userInfo.pointsCardImageUrl || '',
    }).catch(() => ({ ready: false, failed: [], timedOut: false }));

    const { ok, data, error, alreadySigned } = await submitWeeklyCheckin();
    if (!ok || error || !data) {
      // 「本周已签」不是失败，是后端明确告知该行已存在。
      // 用它把本地状态钉成已签到 —— 否则按钮会一直可点，用户每点一次都「签到成功」
      // 却拿不到积分（2026-09-29 线上事故：签到可以一直签到 + 余额被清零）。
      if (alreadySigned || data?.alreadySigned) {
        weeklyCheckinStatus.value = { ...weeklyCheckinStatus.value, hasSignedThisWeek: true };
        // 尽力把余额同步回真值；这一步失败也不影响上面「已签到」的判定
        void loadWeeklyCheckinStatus();
        // 不弹提示岛：既然用户点的是签到，就给他看舞台（已签到版），和「再看一遍」同一套反馈
        const assets = await assetsPromise;
        checkinReward.value = {
          open: true,
          pointsAfter: readPoints(data?.currentPoints) ?? (Number(userInfo.points) || 0),
          awardAmount: 0,
          alreadySigned: true,
          assetsReady: assets.ready,
        };
        return;
      }
      throw error || new Error('签到失败，请稍后重试');
    }

    weeklyCheckinStatus.value = {
      ...createDefaultWeeklyCheckinStatus(),
      ...data,
    };

    applyPoints(userInfo, data.currentPoints);

    // 只有卡面「可绘制」后才允许起播（preload 内部等的是 decode，不是 onload）。
    // 预算 1.5s；超时 / 失败 → assets.ready=false，舞台降级成 blank 卡面，动画照播。
    const assets = await assetsPromise;

    const awarded = Number(data.pointsAwarded || 0);
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: awarded > 0 ? 'weekly_checkin_reward' : 'weekly_checkin',
    });

    checkinReward.value = {
      open: true,
      pointsAfter: readPoints(data.currentPoints) ?? (Number(userInfo.points) || 0),
      awardAmount: awarded,
      alreadySigned: false,
      assetsReady: assets.ready,
    };
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
        followingUserIds = followRes.data.map((f) => f.id).filter(Boolean);
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
      followingUserIds,
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
        : typeof dataResult.hasMore === 'boolean'
          ? dataResult.hasMore
          : safeRows.length >= POSTS_PER_PAGE;

      if (isLoadMore) {
        const existingIds = new Set(forumData.value.map((post) => post.id));
        const newPosts = safeRows.filter((post) => !existingIds.has(post.id));
        forumData.value = [
          ...forumData.value,
          ...prepareForumPosts(newPosts, forumData.value.length),
        ];
        currentPage.value = pageToLoad;
        prefetchAuthorTiersFor(newPosts);
        void ensureQuotedPostsForReposts();
      } else {
        // 保留乐观卡（正在后台发送的帖子）在列表顶部，避免刷新将其冲掉
        const optimisticPosts = forumData.value.filter((p) => p._optimistic);
        // 若处于搜索/标签筛选，非 all 视图下暂时隐藏乐观卡
        const shouldShowOptimistic =
          !searchKeyword.value.trim() &&
          !selectedTagFilter.value &&
          viewMode.value !== 'my' &&
          !showFollowingOnly.value;
        const basePosts = prepareForumPosts(safeRows);
        forumData.value = shouldShowOptimistic
          ? [
              ...optimisticPosts,
              ...basePosts.filter((p) => !optimisticPosts.some((o) => o.id === p.id)),
            ]
          : basePosts;
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
    if (
      err?.name === 'AbortError' ||
      err?.aborted ||
      err?.code === 'ABORTED' ||
      String(err?.message || '') === '请求已被取消'
    )
      return;
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
const openWeeklyReport = () => {
  if (forumWeeklyReport.value) isWeeklyReportOpen.value = true;
};
const closeWeeklyReport = () => {
  isWeeklyReportOpen.value = false;
};
const openReportPost = (postId) => {
  closeWeeklyReport();
  if (postId) openPostDetail(postId);
};

const modalState = ref({ show: false, type: 'success', title: '', message: '' });
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value));
const modalMascotSrc = computed(() => {
  if (!isHomeCatActive.value || !modalState.value.show) return '';
  if (modalState.value.type === 'success') return getHomeCatAsset('success');
  if (modalState.value.type === 'error' || modalState.value.type === 'warning')
    return getHomeCatAsset('failed');
  return getHomeCatAsset('decor');
});
const confirmState = ref({
  show: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  resolve: null,
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

const closeConfirm = (confirmed = false) => {
  const resolver = confirmState.value.resolve;
  confirmState.value = {
    show: false,
    title: '',
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    resolve: null,
  };
  if (typeof resolver === 'function') {
    resolver(Boolean(confirmed));
  }
};

const requestConfirm = ({ title, message, confirmText = '确定', cancelText = '取消' }) =>
  new Promise((resolve) => {
    confirmState.value = {
      show: true,
      title,
      message,
      confirmText,
      cancelText,
      resolve,
    };
  });

const goToProfile = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}?from=forum`);
};

const emitProfileSync = ({ userId, username, reason }) => {
  window.dispatchEvent(
    new CustomEvent('boh_profile_sync', {
      detail: {
        userId: userId || null,
        username: username || null,
        reason: reason || 'forum_update',
        at: Date.now(),
      },
    }),
  );
};

const addUiMarker = (markerRef, key, durationMs, timerPrefix) => {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;

  markerRef.value = new Set([...markerRef.value, safeKey]);
  const timerKey = `${timerPrefix}:${safeKey}`;
  if (uiAnimationTimers.has(timerKey)) {
    clearTimeout(uiAnimationTimers.get(timerKey));
  }

  uiAnimationTimers.set(
    timerKey,
    setTimeout(() => {
      const next = new Set(markerRef.value);
      next.delete(safeKey);
      markerRef.value = next;
      uiAnimationTimers.delete(timerKey);
    }, durationMs),
  );
};

const hasUiMarker = (markerRef, key) => {
  const markerSet = markerRef?.value || markerRef;
  return markerSet instanceof Set && markerSet.has(String(key || '').trim());
};

const markForumImageLoaded = (postId, imageUrl) => {
  const key = getForumImageKey(postId, imageUrl);
  if (!key.includes(':') || key.endsWith(':')) return;
  loadedForumImageKeys.value = new Set([...loadedForumImageKeys.value, key]);
};

const isPostHighlighted = (postId) => hasUiMarker(highlightedPostIds, postId);
const isPostLikePulsing = (postId) => hasUiMarker(likePulsePostIds, postId);
const isPostShareCopied = (postId) => hasUiMarker(shareCopiedPostIds, postId);

const isLikelyNetworkError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const text = `${message} ${details}`;

  return (
    text.includes('timeout') ||
    text.includes('超时') ||
    text.includes('network') ||
    text.includes('failed to fetch') ||
    text.includes('load failed') ||
    text.includes('请求失败')
  );
};

const shouldCleanupImagesAfterPostError = (error) => {
  const code = String(error?.code || '')
    .trim()
    .toUpperCase();
  return new Set([
    'EMPTY_POST_CONTENT',
    'LOCAL_KEYWORD_BLOCK',
    'SYNC_MODERATION_BLOCK',
    'NOT_AUTHENTICATED',
    'FORUM_IMAGE_LIMIT',
    'FORUM_IMAGE_MIGRATION_REQUIRED',
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
      if (userInfo.mutedUntil)
        muteMessage += ` 解禁时间：${new Date(userInfo.mutedUntil).toLocaleDateString('zh-CN')}`;
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
    // P1（不闪白）配套：预热管线完成后 url 仍是 blob（远端在 uploadedUrl），快照在此归一，
    // 否则 allApproved 分支会把 blob: 地址直接交给 createPost 落库。
    // 未上传完成的图 uploadedUrl 为空 → 保持原 url（blob），由队列 replaceUploadedImage 覆盖为远端。
    url: img.uploadedUrl || img.url || '',
    uploadStatus: img.uploadStatus || (img.file ? 'staged' : 'approved'),
    sortOrder: idx,
  }));
  const submissionId = createSubmissionId();
  const submissionFingerprint = JSON.stringify([
    snapshotTitle,
    snapshotBody,
    snapshotImages.map((i) => [
      i?.publicId || i?.public_id || '',
      i?.file?.name || '',
      i?.file?.size || 0,
    ]),
  ]);
  // 校验队列：避免重复指纹正在发送中
  const dup = publishQueueStore.items.find(
    (i) =>
      i.fingerprint === submissionFingerprint &&
      ['queued', 'uploading', 'publishing'].includes(i.state),
  );
  if (dup) {
    showModal('warning', '正在发送中', '相同内容的帖子正在发送，请稍候');
    return;
  }
  const queueId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
    fingerprint: submissionFingerprint,
  };
  const queueItem = publishQueueStore.enqueue(queueItemPayload);
  // 插入乐观帖子到列表顶部（简化：不暴露压缩/检测阶段，只显示百分比）
  insertOptimisticPost(queueItem);
  // 立即清空编辑器并退出（即发即走）
  newPost.value.title = '';
  newPost.value.content = '';
  selectedPostTag.value = 'daily';
  postLocation.value = null;
  // 清理草稿但不清理已快照的图片（队列持有 file）
  postDraftRestoreSeq += 1;
  if (postDraftSaveTimer) {
    clearTimeout(postDraftSaveTimer);
    postDraftSaveTimer = null;
  }
  writeLocalPostDraft(null);
  savedPostDraft.value = null;
  // 已进入发布队列 ⇒ 实时暂存必须一起清：否则下次打开编辑器会把刚发出去的内容
  // 当成"未保存的稿"再恢复一遍（用户会以为发重了）。
  clearAutoSaveDraft();
  // 发布成功即清草稿：必须广播，否则另一个宿主实例的编辑器里还留着刚发出去的那篇
  notifyDraftChange('clear');
  void savePostDraftToDatabase(null);
  // 清空编辑器图片状态（不触发云端删除，因队列已接管；localPreviewUrl 留给队列）
  postImages.value = [];
  postImageUploadStatus.value = '';
  // 关闭移动端编辑器（无二次确认，因已入队）
  if (isMobileComposerOpen.value) {
    captureMobileComposerOrigin();
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

const toggleReplyInput = (
  postId,
  parentId = null,
  username = null,
  quotedContent = '',
  rootAuthorUsername = null,
) => {
  if (
    activeReplyTarget.value &&
    activeReplyTarget.value.postId === postId &&
    activeReplyTarget.value.parentId === parentId
  ) {
    activeReplyTarget.value = null;
    replyContent.value = '';
  } else {
    activeReplyTarget.value = { postId, parentId, username, quotedContent };
    // 直接回复楼层根评论时不预填 @（与详情页同一判据）；回复楼里其他子评论才预填。
    replyContent.value = shouldShowReplyTarget(username, rootAuthorUsername)
      ? buildReplyDraft(username)
      : '';
  }
};

const handlePostCardToggleReplyInput = (
  postId,
  parentId,
  username,
  quotedContent,
  rootAuthorUsername,
) => {
  toggleReplyInput(
    postId,
    parentId ?? null,
    username ?? null,
    quotedContent ?? '',
    rootAuthorUsername ?? null,
  );
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
      post.replies_has_more || Number(post.comment_count || 0) > existingReplies.length,
    );
    return true;
  }

  const currentUserId = isLoggedIn.value ? userInfo.id : null;
  const first = await getComments(post.id, currentUserId, {
    topLevelOnly: true,
    page: 1,
    pageSize: LIST_REPLY_PREVIEW_COUNT,
    order: 'desc',
  });
  // 失败（含主动取消）：不写 replies_preloaded，下次点开还能重试
  if (first?.ok === false && first?.error) return false;
  let { data, hasMore } = first;

  if (shouldFallbackReplyPreview(data, post.comment_count)) {
    const fallbackOptions = buildFallbackReplyPreviewOptions({
      topLevelOnly: true,
      page: 1,
      pageSize: LIST_REPLY_PREVIEW_COUNT,
      order: 'desc',
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
      .filter(
        (post) =>
          post &&
          post.id &&
          !post._optimistic &&
          !post.replies_preloaded &&
          !(Array.isArray(post.replies) && post.replies.length) &&
          Number(post.comment_count || 0) > 0,
      )
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
  idleReplyPrefetchHandle =
    typeof requestIdleCallback === 'function'
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
      replyToUsername,
    );

    if (error) throw error;
    replyContent.value = '';
    activeReplyTarget.value = null;
    await loadPostReplyPreview(post);
    await refreshPostEngagementStats(post);
    expandedPostIds.value.add(post.id);
    if (
      !showEmbeddedSuccessIsland({
        title: '评论成功',
        message: '你的回复已经发送啦',
        icon: 'comment',
        type: 'success',
        catSticker: 'success',
        catStickerMode: 'hero',
        forceCatSticker: true,
      })
    ) {
      showModal('success', '回复成功', '你的声音已被听到');
    }

    addExperience(supabase, userInfo.id, XP_REWARDS.REPLY);
    addUiMarker(replySuccessPostIds, post.id, 1800, 'reply-success');
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'comment_created',
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
        reason: action === 'liked' ? 'post_liked' : 'post_unliked',
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

// ===== 查询条件层（外搬，见 composables/useForumFeedQuery.js）=====
// 就地挂载而不是挪到 setup 尾部：注入项（fetchForumData / focusForumSearch / isLoggedIn /
// 标签归一）都在本行之上声明完毕；挪到尾部会让下方 askBohai 里的 stripTagTokens 变成
// 「先用后声明」。状态 ref 仍归宿主（虚拟列表接线要先用到它们），这里只拿引用。
const {
  setSortMode,
  setFeedMode,
  setTagFilter,
  setContentType,
  clearTagFilter,
  emptyFilterTitle,
  emptyFilterDesc,
  searchHistory,
  showSearchHistory,
  onSearchFocus,
  onSearchBlur,
  applyHistoryKeyword,
  historySuggestion,
  clearSearchHistory,
  handleSearch,
  clearSearchInput,
  stripTagTokens,
  deriveTagFilterFromInput,
  cancelPendingSearch,
} = useForumFeedQuery({
  searchQuery,
  searchKeyword,
  selectedTagFilter,
  selectedContentType,
  sortMode,
  feedMode,
  showFollowingOnly,
  isLoggedIn,
  fetchForumData,
  normalizeForumTagValue,
  getForumTagLabel,
  focusForumSearch,
});

const handleDeleteComment = async (comment, post) => {
  if (!comment?.id || !post?.id) return;
  const confirmed = await requestConfirm({
    title: '删除评论',
    message: '这条评论删除后无法恢复，确定继续吗？',
    confirmText: '删除',
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
      reason: 'comment_deleted',
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
  title: String(post?.displayTitle || post?.title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80),
  summary: String(post?.displayBody || post?.body || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120),
  image: post?.allImages?.[0]?.url || post?.cover_image_url || '',
  path: `/forum/post/${post.id}`,
  forward: post?.id ? { postId: post.id } : null,
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
    },
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
  cancelPendingSearch();

  isAiSearchLoading.value = true;
  aiSearchHint.value = 'BOHAI 正在检索论坛相关内容...';

  try {
    const tagFromInput = deriveTagFilterFromInput(searchQuery.value);
    const { data: relatedPosts } = await getPosts(null, {
      page: 1,
      pageSize: 5,
      searchQuery: question,
      tagFilter: tagFromInput ?? selectedTagFilter.value ?? '',
      sortMode: 'hottest',
    });
    const posts = (Array.isArray(relatedPosts) ? relatedPosts : []).slice(0, 5);
    const contextBlock = posts.length
      ? posts
          .map((post, index) => {
            const title = String(post.title || '').trim() || '（无标题）';
            const excerpt = String(post.content || '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 120);
            const tagLabel = FORUM_TAG_MAP[post.tag]?.label || '';
            const author = String(post.author_username || post.username || '').trim();
            return `${index + 1}. ${title}${tagLabel ? `（${tagLabel}）` : ''}${author ? ` —— 作者：${author}` : ''}\n   ${excerpt || '（无正文摘要）'}`;
          })
          .join('\n')
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
        : '请用中文简洁回答用户的问题；如果问题适合社区讨论，可以建议用户发一个带 #提问 标签的帖子来获得更多帮助。',
    ].join('\n');

    const opened = showIsland.ai({ prompt, mode: 'fast' });
    if (opened) {
      aiSearchHint.value = 'BOHAI 正在顶部 AI 岛为你解答（Fast 模型）。';
    } else {
      /* ⚠️ 走到这里几乎只有一个原因：**当前视图没有导航栏**，而 AI 岛的岛体就挂在导航栏里
         —— 没有宿主容器，open() 只会置位 isOpen、永远不渲染。
         属于这一类的是「导航栏被隐藏但路由 meta 没标记」的视图：
         user-space 的我的/设置子视图、详情页、embed=desktop 等
         （判据见 utils/global-navbar-visibility.js，已与 App.vue 同源）。
         旧文案「AI 岛当前不可用，请稍后再试」把「必然」说成「偶发」，用户只能反复点。 */
      aiSearchHint.value =
        '当前视图隐藏了顶部导航栏，AI 岛打不开 —— 到首页或完整论坛页再问 BOHAI。';
    }
  } catch (error) {
    logger.warn('forum', '问 BOHAI 失败:', error);
    aiSearchHint.value = 'BOHAI 检索论坛内容失败，请稍后再试。';
  } finally {
    setTimeout(() => {
      isAiSearchLoading.value = false;
    }, 240);
  }
};

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
    query,
  });
};
// ===== 发帖图片管线（外搬，见 composables/useForumDraftImagePipelines.js）=====
// 同样挂在 setup 尾部：注入项里有 showModal 这类中段才声明的 const 箭头函数。
// 管线表（draftImagePipelines）必须**只取一次**再分别给模板与发布链路 ——
// 两处各建一份 Map 会让发布时看不到预热结果，表现为「点发布后重新压缩上传一遍」。
const {
  openPostImagePicker,
  openPostCamera,
  handlePostImageSelection,
  retryPostImageUpload,
  removePostImage,
  reorderPostImage,
  clearPostImages,
  discardDraftPostImages,
  draftImagePipelines,
  scheduleDraftImagePipeline,
  cancelDraftImagePipeline,
  normalizePostImageSortState,
  cleanupUploadedForumImage,
} = useForumDraftImagePipelines({
  postImages,
  postImageUploadStatus,
  isUploadingPostImage,
  isSubmitting,
  imageUploadCooldownSeconds,
  imageUploadCooldownLabel,
  showModal,
  applyImageUploadRateLimitCooldown,
  scheduleForumImageModerationPreload,
});
// ===== 发帖发布链路（外搬，见 composables/useForumPublishQueue.js）=====
// 必须挂在 setup 尾部：注入的依赖都是本文前面声明的 const 箭头函数，中途调用会 TDZ。
// 模板与 submitPost 只在运行时调用返回的动作，所以「声明在尾部」不影响它们。
const {
  insertOptimisticPost,
  runPublishQueue,
  retryPublish,
  cancelPublish,
  editFailedPublish,
  fixModerationPublish,
} = useForumPublishQueue({
  forumData,
  highlightedPostIds,
  userInfo,
  postImages,
  newPost,
  selectedPostTag,
  postLocation,
  postImageUploadStatus,
  draftImagePipelines,
  scheduleDraftImagePipeline,
  cancelDraftImagePipeline,
  prepareForumPostForDisplay,
  resolveFrameForAuthor,
  normalizePostImageSortState,
  cleanupUploadedForumImage,
  applyRateLimitCooldown,
  addUiMarker,
  emitProfileSync,
  isLikelyNetworkError,
  shouldCleanupImagesAfterPostError,
  loadForumWeeklyReport,
  persistForumFeedSnapshot,
  showEmbeddedSuccessIsland,
});
</script>

<template>
  <div
    ref="forumPageRef"
    class="forum-page"
    :class="{ 'embedded-mode': embedded }"
    :data-theme="currentTheme"
    :data-ui-style="currentUiStyle"
    :data-anniversary-skin="isAnniversaryMcTheme ? 'active' : 'off'"
    :style="anniversaryForumStyle"
  >
    <link rel="preconnect" :href="cdnDeliveryBase" crossorigin />
    <link rel="dns-prefetch" :href="cdnDeliveryBase" />

    <div class="forum-container" :class="{ 'no-header': !showHeader }">
      <!-- 头部区域 -->
      <header v-if="showHeader" class="forum-header fade-in-up">
        <div class="header-content">
          <span class="header-tag">{{
            isAnniversaryMcTheme ? 'BLOCK OF HOME · 2018—2026' : 'BOH COMMUNITY'
          }}</span>
          <h1 class="header-title">{{ isAnniversaryMcTheme ? '八周年方块社区' : '社区论坛' }}</h1>
          <p class="header-subtitle">
            {{
              isAnniversaryMcTheme
                ? '挖掘旧回忆，继续建造我们的第九年。'
                : '分享你的创意，连接方块世界。'
            }}
          </p>
        </div>
        <div v-if="isAnniversaryMcTheme" class="anniversary-seal" aria-hidden="true">
          <strong>8</strong><span>周年限定<br />方块主题</span>
        </div>
      </header>

      <!-- 主要内容区 -->
      <main class="forum-main-grid">
        <!-- 搜索工具栏：桌面 / 横屏下跨栏独占一行（base.css 的 grid-template-areas 负责布置）。
             单列时它在 DOM 里仍排在列表之前 → 手机端视觉顺序不变 -->
        <ForumToolbar
          v-model:searchQuery="searchQuery"
          :is-logged-in="isLoggedIn"
          :has-signed-this-week="weeklyCheckinStatus.hasSignedThisWeek"
          :sort-mode="sortMode"
          :selected-tag-filter="selectedTagFilter"
          :is-ai-search-loading="isAiSearchLoading"
          :ai-search-hint="aiSearchHint"
          :search-history="searchHistory"
          :show-search-history="showSearchHistory"
          @search-submit="handleSearch"
          @ask-bohai="askBohai"
          @clear-tag-filter="clearTagFilter"
          @clear-search="clearSearchInput"
          @search-focus="onSearchFocus"
          @search-blur="onSearchBlur"
          @apply-history-keyword="applyHistoryKeyword"
          @clear-search-history="clearSearchHistory"
          @open-weekly-checkin="handleCheckinClick"
          @set-sort-mode="setSortMode"
          @set-tag-filter="setTagFilter"
        />

        <!-- 列表：发帖统一走发布会话（左栏「发布」/ FAB），页面内不再内嵌编辑器 -->
        <div class="forum-left-column">
          <!-- 发布进度：已迁移到统一任务岛（useIsland 调度中心 showIsland.task），由发布队列 watcher 驱动 -->

          <!-- 帖子列表 -->
          <section class="posts-feed fade-in-up" style="animation-delay: 0.2s">
            <div v-if="!externalFeed" class="feed-mode-tabs">
              <button
                class="feed-mode-tab"
                :class="{ active: selectedContentType === '' }"
                @click="setContentType('')"
              >
                全部
              </button>
              <button
                class="feed-mode-tab"
                :class="{ active: selectedContentType === 'post' }"
                @click="setContentType('post')"
              >
                论坛
              </button>
              <button
                class="feed-mode-tab"
                :class="{ active: selectedContentType === 'news' }"
                @click="setContentType('news')"
              >
                新闻
              </button>
              <button
                class="feed-mode-tab"
                :class="{ active: selectedContentType === 'activity' }"
                @click="setContentType('activity')"
              >
                活动
              </button>
              <template v-if="isLoggedIn">
                <span class="feed-mode-tab-divider" aria-hidden="true"></span>
                <button
                  class="feed-mode-tab"
                  :class="{ active: showFollowingOnly }"
                  :title="showFollowingOnly ? '返回全部内容' : '只看关注的人的动态'"
                  @click="setFeedMode(showFollowingOnly ? 'latest' : 'following')"
                >
                  关注
                </button>
              </template>
            </div>

            <!-- 最近搜索面板不在这里：它在 ForumToolbar 内部贴着搜索框展开
                 （放信息流顶部会被手机底栏压住，且与输入框隔着一个发帖框）。 -->

            <!-- 结果计数：2026-10-22 按用户要求整条移除（理由见 script 里那段注释） -->

            <!-- 骨架屏加载状态 -->
            <div v-if="isLoading" class="skeleton-feed">
              <div v-for="n in 5" :key="n" class="skeleton-post-card">
                <HomeCatMascot
                  v-if="isHomeCatActive && n === 1"
                  class="skeleton-thinking-cat"
                  pool="state"
                  seed="forum-skeleton-thinking"
                  size="md"
                  decorative
                />
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
              <div v-if="forumData.length === 0" class="empty-state glass-panel forum-empty">
                <!-- 2026-10-22 重做：原来是一个 emoji + 一句裸奔的 16px 正文（还被 emoji 挤到左对齐），
                     读起来像页面报错。现在统一成「图标砖 + 标题 + 说明 + 可选动作」的空态。 -->
                <div class="forum-empty-icon" :class="{ 'is-error': Boolean(forumLoadError) }">
                  <CloudOff
                    v-if="forumLoadError"
                    :size="23"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                  <SearchX
                    v-else-if="searchKeyword.trim()"
                    :size="23"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                  <Inbox v-else :size="23" :stroke-width="1.7" aria-hidden="true" />
                </div>

                <template v-if="forumLoadError">
                  <p class="forum-empty-title">内容没加载出来</p>
                  <p class="forum-empty-desc is-error">{{ forumLoadError }}</p>
                  <button
                    type="button"
                    class="empty-action-btn is-primary"
                    @click="fetchForumData()"
                  >
                    <RotateCw :size="14" :stroke-width="2.2" aria-hidden="true" />
                    <span>重试</span>
                  </button>
                </template>

                <!-- 有关键词却没结果：给两条出路（问 BOHAI / 退回全部），
                     而不是只丢一句「换个条件试试」让用户自己想办法 -->
                <template v-else-if="searchKeyword.trim()">
                  <p class="forum-empty-title">没有找到「{{ searchKeyword }}」相关内容</p>
                  <p class="forum-empty-desc">试试更短的关键词，或让 BOHAI 在论坛里找一遍</p>
                  <div class="empty-state-actions">
                    <button
                      type="button"
                      class="empty-action-btn is-primary"
                      :disabled="isAiSearchLoading"
                      @click="askBohai"
                    >
                      <Sparkles :size="14" :stroke-width="2" aria-hidden="true" />
                      <span>问 BOHAI</span>
                    </button>
                    <button type="button" class="empty-action-btn" @click="clearSearchInput">
                      清除搜索
                    </button>
                  </div>
                  <button
                    v-if="historySuggestion"
                    type="button"
                    class="empty-history-hint"
                    @click="applyHistoryKeyword(historySuggestion)"
                  >
                    换个词试试「{{ historySuggestion }}」
                  </button>
                </template>

                <template v-else-if="selectedTagFilter || selectedContentType">
                  <p class="forum-empty-title">{{ emptyFilterTitle }}</p>
                  <p class="forum-empty-desc">{{ emptyFilterDesc }}</p>
                </template>

                <template v-else>
                  <p class="forum-empty-title">这里还没有内容</p>
                  <p class="forum-empty-desc">发第一条动态，让这里热闹起来</p>
                  <button
                    type="button"
                    class="empty-action-btn is-primary"
                    @click="openMobileComposer()"
                  >
                    <span>去发帖</span>
                    <ArrowUpRight :size="14" :stroke-width="2.2" aria-hidden="true" />
                  </button>
                </template>
              </div>

              <div
                v-if="virtualFeedTopSpacerHeight > 0"
                class="forum-virtual-spacer"
                :style="{ height: `${virtualFeedTopSpacerHeight}px` }"
                aria-hidden="true"
              ></div>

              <template v-for="item in feedWithAds" :key="item.key">
                <AdSlot v-if="item.isAd" :ad="item.ad" />
                <div
                  v-else
                  class="forum-virtual-post"
                  :data-forum-virtual-index="getVisiblePostIndex(item.visIndex)"
                >
                  <article
                    v-if="item.post._optimistic"
                    class="post-card-v2 glass-panel optimistic-post-card"
                    :class="{
                      'is-failed': item.post._publishState === 'failed',
                      'is-moderation': item.post._failType === 'moderation',
                    }"
                    :data-forum-post-id="item.post.id"
                    @click.stop
                  >
                    <div class="optimistic-progress-track">
                      <i
                        class="optimistic-progress-fill"
                        :class="
                          item.post._failType === 'moderation'
                            ? 'is-moderation'
                            : item.post._publishState === 'failed'
                              ? 'is-failed'
                              : item.post._publishState === 'success'
                                ? 'is-success'
                                : 'is-sending'
                        "
                        :style="{ width: Math.round(item.post._progress || 0) + '%' }"
                      ></i>
                    </div>
                    <div class="post-header-v2">
                      <div class="post-author-section">
                        <div class="post-author-avatar">
                          <img
                            v-if="
                              getAvatarUrl(item.post.author_avatar_url || userInfo.avatarUrl, 'sm')
                            "
                            :src="
                              getAvatarUrl(item.post.author_avatar_url || userInfo.avatarUrl, 'sm')
                            "
                            class="avatar-image"
                            loading="eager"
                          />
                          <span v-else>{{
                            item.post.author_username
                              ? item.post.author_username.charAt(0).toUpperCase()
                              : 'U'
                          }}</span>
                        </div>
                        <div class="post-author-info">
                          <span class="post-author-v2">{{ '@' + item.post.author_username }}</span>
                          <span class="post-date-v2">刚刚 · 仅你可见</span>
                        </div>
                        <span
                          class="optimistic-badge"
                          :class="
                            item.post._publishState === 'failed'
                              ? item.post._failType === 'moderation'
                                ? 'moderation'
                                : 'failed'
                              : item.post._publishState === 'success'
                                ? 'success'
                                : 'sending'
                          "
                        >
                          <template
                            v-if="
                              item.post._publishState === 'failed' &&
                              item.post._failType === 'moderation'
                            "
                            >审核未通过</template
                          >
                          <template v-else-if="item.post._publishState === 'failed'"
                            >发送失败</template
                          >
                          <template v-else-if="item.post._publishState === 'success'"
                            >发送成功</template
                          >
                          <template v-else
                            >发送中 · {{ Math.round(item.post._progress || 0) }}%</template
                          >
                        </span>
                      </div>
                    </div>
                    <div class="post-content-v2">
                      <h3 class="post-title-v2">{{ item.post.displayTitle }}</h3>
                      <div v-if="item.post.tagLabel" class="post-card-tags">
                        <span class="post-card-tag">{{ item.post.tagLabel }}</span>
                      </div>
                      <div
                        v-if="item.post.allImages && item.post.allImages.length"
                        class="image-post-strip"
                        :class="{ 'is-single': item.post.allImages.length === 1 }"
                      >
                        <div
                          v-for="(img, idx) in item.post.allImages"
                          :key="img.id || img.url"
                          class="image-post-thumb-shell is-loaded"
                          :class="{
                            'is-failed-mark':
                              item.post._failedImageIndex === idx &&
                              item.post._publishState === 'failed' &&
                              item.post._failType === 'moderation',
                          }"
                        >
                          <img
                            :src="img.url"
                            :alt="`图片 ${idx + 1}`"
                            class="image-post-thumb is-loaded"
                            style="opacity: 0.92"
                          />
                          <span
                            v-if="
                              item.post._failedImageIndex === idx &&
                              item.post._publishState === 'failed' &&
                              item.post._failType === 'moderation'
                            "
                            class="optimistic-fail-mark"
                            >审核未过</span
                          >
                        </div>
                      </div>
                      <p class="post-text-v2">{{ item.post.displayBody }}</p>
                      <div
                        v-if="item.post._publishState === 'failed'"
                        :data-queue-failmsg="item.post._queueId"
                        class="optimistic-fail-msg"
                        :class="item.post._failType === 'moderation' ? 'moderation' : 'network'"
                      >
                        <template v-if="item.post._failMessage">{{
                          item.post._failMessage
                        }}</template>
                        <template v-else-if="item.post._failType === 'moderation'"
                          >第 {{ (item.post._failedImageIndex || 0) + 1 }} 张图片未通过安全检测 ·
                          可能含敏感内容，可移除该图后重试，其他内容不受影响。</template
                        >
                        <template v-else
                          >网络异常，未能完成发送。请检查网络后重试，无需重新编辑。</template
                        >
                      </div>
                    </div>
                    <div class="optimistic-actions" @click.stop>
                      <button
                        v-if="
                          item.post._publishState === 'failed' &&
                          item.post._failType === 'moderation'
                        "
                        class="optimistic-btn fix"
                        @click="fixModerationPublish(item.post._queueId)"
                      >
                        移除该图后重试
                      </button>
                      <button
                        v-if="item.post._publishState === 'failed'"
                        class="optimistic-btn retry"
                        @click="
                          item.post._failType === 'moderation'
                            ? fixModerationPublish(item.post._queueId)
                            : retryPublish(item.post._queueId)
                        "
                      >
                        {{ item.post._failType === 'moderation' ? '移除该图' : '重试' }}
                      </button>
                      <button
                        v-if="item.post._publishState === 'failed'"
                        class="optimistic-btn ghost"
                        @click="editFailedPublish(item.post._queueId)"
                      >
                        编辑
                      </button>
                      <button
                        class="optimistic-btn ghost"
                        @click="cancelPublish(item.post._queueId)"
                      >
                        取消
                      </button>
                    </div>
                  </article>
                  <PostCard
                    v-else
                    :post="item.post"
                    :index="getVisiblePostIndex(item.visIndex)"
                    :is-home-cat-active="isHomeCatActive"
                    :is-expanded="expandedPostIds.has(item.post.id)"
                    :active-reply-target="
                      activeReplyTarget && activeReplyTarget.postId === item.post.id
                        ? activeReplyTarget
                        : null
                    "
                    :reply-content="replyContent"
                    :is-reply-submitting="isReplySubmitting"
                    :reply-cooldown-seconds="replyCooldownSeconds"
                    :reply-submit-label="replySubmitLabel"
                    :is-like-submitting="!!isLikeSubmitting[item.post.id]"
                    :is-liked-pulsing="isPostLikePulsing(item.post.id)"
                    :is-replies-loading="!!item.post._repliesLoading"
                    :is-share-copied="isPostShareCopied(item.post.id)"
                    :is-highlighted="isPostHighlighted(item.post.id)"
                    :is-reply-success="hasUiMarker(replySuccessPostIds, item.post.id)"
                    :search-keyword="searchKeyword"
                    :is-logged-in="isLoggedIn"
                    :user-info="userInfo"
                    :loaded-image-keys="loadedForumImageKeys"
                    @click="openPostDetail"
                    @go-to-profile="goToProfile"
                    @toggle-like="handleToggleLike"
                    @toggle-replies="toggleRepliesList"
                    @toggle-reply-input="handlePostCardToggleReplyInput"
                    @share="sharePost"
                    @quote-repost="openQuoteRepost"
                    @submit-reply="submitReply"
                    @delete-comment="handleDeleteComment"
                    @open-image-viewer="openForumImageViewer"
                    @update:reply-content="replyContent = $event"
                    @clear-reply-target="handlePostCardClearReplyTarget"
                    @cancel-reply="handlePostCardCancelReply"
                    @image-loaded="markForumImageLoaded"
                    @lazy-image-observe="observeForumLazyImage"
                    @load-more-images="handleStripLoadMore"
                    @more-replies="openPostDetail"
                  />
                </div>
              </template>

              <div
                v-if="virtualFeedBottomSpacerHeight > 0"
                class="forum-virtual-spacer"
                :style="{ height: `${virtualFeedBottomSpacerHeight}px` }"
                aria-hidden="true"
              ></div>
            </div>

            <div
              v-if="feedMode === 'posts' && hasMoreData"
              ref="loadMoreSentinelRef"
              class="forum-load-more-sentinel"
              aria-hidden="true"
            ></div>

            <!-- 加载更多提示 -->
            <div v-if="feedMode === 'posts' && isLoadingMore" class="loading-more">
              <div class="loading-spinner small"></div>
              <p>正在加载更多帖子...</p>
            </div>

            <!-- 没有更多数据提示 -->
            <div
              v-else-if="feedMode === 'posts' && !hasMoreData && forumData.length > 0 && !isLoading"
              class="no-more-data"
            >
              <p>已经到底啦～</p>
            </div>
          </section>
        </div>

        <!-- 右侧：AI 论坛周报 -->
        <aside class="forum-sidebar fade-in-up" style="animation-delay: 0.3s">
          <div class="weekly-report-card glass-panel fade-in-up" style="animation-delay: 0.35s">
            <div class="weekly-report-card-head">
              <div>
                <span class="weekly-report-kicker"><Newspaper :size="14" /> AI 周报</span>
                <h4>本周论坛周报</h4>
              </div>
              <span v-if="forumWeeklyReport" class="weekly-report-period">{{
                formatReportPeriod(forumWeeklyReport)
              }}</span>
            </div>
            <div
              v-if="isWeeklyReportLoading"
              class="weekly-report-skeleton"
              aria-label="周报加载中"
            >
              <span /><span /><span />
            </div>
            <template v-else-if="forumWeeklyReport">
              <p class="weekly-report-summary">{{ forumWeeklyReport.summary }}</p>
              <div class="weekly-report-metrics">
                <span
                  ><strong>{{ reportMetric('post_count') }}</strong> 帖子</span
                >
                <span
                  ><strong>{{ reportMetric('active_authors') }}</strong> 作者</span
                >
                <span
                  ><strong>{{ reportMetric('comment_count') }}</strong> 讨论</span
                >
              </div>
              <div v-if="forumWeeklyReport.topics?.length" class="weekly-report-topics">
                <span
                  v-for="topic in forumWeeklyReport.topics.slice(0, 3)"
                  :key="topic.name"
                  class="weekly-report-topic"
                >
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
      <button
        v-if="isForumComposerFabVisible"
        type="button"
        class="mobile-compose-fab"
        :class="{ 'embedded-compose-fab': embedded }"
        aria-label="发布帖子"
        @click="openMobileComposer"
      >
        <span>+</span>
      </button>
    </Teleport>

    <Teleport to="body">
      <Transition name="weekly-report-modal">
        <div
          v-if="isWeeklyReportOpen"
          class="weekly-report-overlay"
          @click.self="closeWeeklyReport"
        >
          <section
            class="weekly-report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-report-title"
          >
            <header class="weekly-report-modal-head">
              <div>
                <span class="weekly-report-kicker"><Newspaper :size="15" /> AI 论坛周报</span>
                <h2 id="weekly-report-title">本周论坛周报</h2>
                <p>{{ formatReportPeriod(forumWeeklyReport) }}</p>
              </div>
              <button
                type="button"
                class="weekly-report-close"
                aria-label="关闭周报"
                @click="closeWeeklyReport"
              >
                <X :size="19" />
              </button>
            </header>
            <div v-if="forumWeeklyReport" class="weekly-report-modal-body">
              <section class="weekly-report-overview">
                <h3>本周概览</h3>
                <p>{{ forumWeeklyReport.summary }}</p>
                <div class="weekly-report-metric-grid">
                  <div>
                    <strong>{{ reportMetric('post_count') }}</strong
                    ><span>帖子</span>
                  </div>
                  <div>
                    <strong>{{ reportMetric('active_authors') }}</strong
                    ><span>活跃作者</span>
                  </div>
                  <div>
                    <strong>{{ reportMetric('comment_count') }}</strong
                    ><span>评论</span>
                  </div>
                  <div>
                    <strong>{{ reportMetric('like_count') }}</strong
                    ><span>获赞</span>
                  </div>
                </div>
              </section>
              <section v-if="forumWeeklyReport.topics?.length" class="weekly-report-section">
                <h3>主要讨论主题</h3>
                <article
                  v-for="topic in forumWeeklyReport.topics"
                  :key="topic.name"
                  class="weekly-report-topic-detail"
                >
                  <div class="weekly-report-topic-title">
                    <strong>{{ topic.name }}</strong
                    ><span>{{ topic.post_count || 0 }} 帖</span>
                  </div>
                  <p>{{ topic.summary }}</p>
                </article>
              </section>
              <section
                v-if="forumWeeklyReport.featured_posts?.length"
                class="weekly-report-section"
              >
                <h3>帖子精选</h3>
                <article
                  v-for="post in forumWeeklyReport.featured_posts"
                  :key="post.post_id || post.title"
                  class="weekly-report-post-detail"
                >
                  <div class="weekly-report-post-title">
                    <strong>{{ post.title }}</strong
                    ><button type="button" @click="openReportPost(post.post_id)">
                      查看原帖 <ArrowUpRight :size="14" />
                    </button>
                  </div>
                  <p>{{ post.summary }}</p>
                  <span v-if="post.reason" class="weekly-report-post-reason"
                    >入选理由：{{ post.reason }}</span
                  >
                </article>
              </section>
              <section
                v-if="forumWeeklyReport.open_questions?.length"
                class="weekly-report-section"
              >
                <h3>值得继续讨论</h3>
                <ul class="weekly-report-questions">
                  <li v-for="question in forumWeeklyReport.open_questions" :key="question">
                    {{ question }}
                  </li>
                </ul>
              </section>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="mobile-composer" @after-leave="releaseMobileComposerOrigin">
        <div
          v-if="isMobileComposerOpen"
          class="mobile-composer-overlay"
          :style="{ '--mobile-composer-origin': mobileComposerTransformOrigin }"
        >
          <div class="mobile-composer-bar">
            <button
              type="button"
              class="mobile-composer-back"
              aria-label="返回论坛"
              @click="closeMobileComposer"
            >
              取消
            </button>
            <button
              type="button"
              class="mobile-composer-submit"
              @click="handlePost"
              :disabled="isSubmitting || isUploadingPostImage || postCooldownSeconds > 0"
            >
              <span class="mobile-composer-submit-label">{{
                postCooldownSeconds > 0 ? `${postCooldownSeconds}s` : '发布'
              }}</span>
            </button>
          </div>
          <div class="mobile-composer-scroll">
            <PostComposer
              v-model:new-post="newPost"
              v-model:selected-post-tag="selectedPostTag"
              v-model:post-location="postLocation"
              :is-logged-in="isLoggedIn"
              :user-info="userInfo"
              :post-images="postImages"
              :is-submitting="isSubmitting"
              :is-uploading-post-image="isUploadingPostImage"
              :post-image-upload-status="postImageUploadStatus"
              :post-cooldown-seconds="postCooldownSeconds"
              :forum-tag-options="FORUM_TAG_OPTIONS"
              :max-post-images="FORUM_POST_IMAGE_MAX_COUNT"
              :mention-users="forumMentionUsers"
              :is-home-cat-theme="isHomeCatActive"
              is-mobile-composer
              @submit="handlePost"
              @login="showLoginModal = true"
              @request-image-picker="openPostImagePicker"
              @request-camera="openPostCamera"
              @image-selection="handlePostImageSelection"
              @remove-image="removePostImage"
              @retry-image="retryPostImageUpload"
              @reorder-image="reorderPostImage"
              @clear-images="clearPostImages"
            />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 签到成功舞台：卡面 3D 旋转 + 极简到账提示（替代原「每周签到」弹窗）。
         v-if 而不是 v-show —— 组件挂载即起播，资源就绪的判断在派发前已完成 -->
    <Teleport to="body">
      <CheckinRewardStage
        v-if="checkinReward.open"
        :points-after="checkinReward.pointsAfter"
        :award-amount="checkinReward.awardAmount"
        :already-signed="checkinReward.alreadySigned"
        :assets-ready="checkinReward.assetsReady"
        :username="userInfo.username || '未命名用户'"
        :skin="userInfo.pointsCardSkin || 'blank'"
        :image-url="userInfo.pointsCardImageUrl || ''"
        @dismiss="closeCheckinReward"
      />
    </Teleport>

    <ForumImageViewer
      v-model:open="isForumImageViewerOpen"
      :images="forumImageViewerImages"
      :initial-index="forumImageViewerIndex"
      @close="closeForumImageViewer"
    />

    <Teleport to="body">
      <Transition name="forum-confirm-fade">
        <div
          v-if="confirmState.show"
          class="forum-confirm-overlay"
          @click.self="closeConfirm(false)"
        >
          <div
            class="forum-confirm-modal"
            role="dialog"
            aria-modal="true"
            :aria-label="confirmState.title"
          >
            <img
              v-if="isHomeCatActive && confirmMascotSrc"
              class="forum-confirm-cat-img"
              :src="confirmMascotSrc"
              alt=""
              draggable="false"
              loading="lazy"
            />
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
    <CommonAlertModal
      v-model:visible="modalState.show"
      :type="modalState.type"
      :title="modalState.title"
      :message="modalState.message"
      :mascot-src="modalMascotSrc"
      mascot-alt="方块小窝提示小猫"
    />

    <Teleport to="body">
      <div
        v-if="quoteRepostState.show"
        class="forum-confirm-overlay"
        @click.self="closeQuoteRepost"
      >
        <section class="forum-confirm-modal" role="dialog" aria-modal="true" aria-label="引用转发">
          <h3>引用转发</h3>
          <p class="quote-repost-source">
            {{ quoteRepostState.post?.displayTitle || quoteRepostState.post?.title }}
          </p>
          <textarea
            v-model="quoteRepostState.commentary"
            maxlength="2000"
            rows="4"
            placeholder="添加你的想法..."
          ></textarea>
          <div class="forum-confirm-actions">
            <button type="button" class="forum-confirm-btn secondary" @click="closeQuoteRepost">
              取消
            </button>
            <button
              type="button"
              class="forum-confirm-btn danger"
              :disabled="!quoteRepostState.commentary.trim()"
              @click="submitQuoteRepost"
            >
              转发
            </button>
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
@import '../../styles/common/compose-fab.css';
@import './styles/drawers-skeletons.css';
@import './styles/anniversary.css';
@import './styles/weekly-report.css';
</style>
<style scoped>
/* 组件私有样式：仅 ForumMain 模板使用（乐观发帖卡片）。
   前两个 style 块是多组件共享的 styles/*.css scoped @import（架构现状见 base.css 顶部说明）。 */
.optimistic-post-card {
  position: relative;
  overflow: hidden;
  border-color: rgba(22, 119, 255, 0.18);
  box-shadow: 0 8px 30px rgba(22, 119, 255, 0.1);
}
.optimistic-progress-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.optimistic-progress-track i {
  display: block;
  height: 100%;
  width: 0%;
  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 999px;
}
/* 进度条状态色：语义 class 取代内联 style（暗色可经 forum-dark.css 覆盖） */
.optimistic-progress-fill {
  background: #1677ff;
}
.optimistic-progress-fill.is-moderation {
  background: #f59e0b;
}
.optimistic-progress-fill.is-failed {
  background: #ff3b30;
}
.optimistic-progress-fill.is-success {
  background: #00b578;
}
.optimistic-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 5px 8px;
  border-radius: 999px;
}
.optimistic-badge.sending {
  background: #e8f0ff;
  color: #1677ff;
}
.optimistic-badge.failed {
  background: #ffe8e6;
  color: #c0392b;
}
.optimistic-badge.moderation {
  background: #fff7ed;
  color: #b45309;
  border: 1px solid rgba(180, 83, 9, 0.14);
}
.optimistic-badge.success {
  background: #d8f4e9;
  color: #057857;
}
.optimistic-fail-msg {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}
.optimistic-fail-msg.moderation {
  background: #fff7ed;
  color: #7c3b0a;
  border: 1px solid rgba(180, 83, 9, 0.12);
}
.optimistic-fail-msg.network {
  background: #fff1f0;
  color: #7f1d1d;
  border: 1px solid rgba(255, 59, 48, 0.12);
}
.optimistic-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 4px;
}
.optimistic-btn {
  border: none;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: 0.2s;
}
.optimistic-btn.fix {
  background: #b45309;
  color: #fff;
}
.optimistic-btn.retry {
  background: #1d1d1f;
  color: #fff;
}
.optimistic-btn.ghost {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #1d1d1f;
}
.optimistic-btn:active {
  transform: scale(0.97);
}
.optimistic-fail-mark {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #ff3b30;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 3px 6px;
  border-radius: 999px;
}
.image-post-thumb-shell.is-failed-mark img {
  outline: 2px solid #ff3b30;
  outline-offset: 2px;
  opacity: 0.55 !important;
}
</style>
