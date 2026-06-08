<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { Check, ChevronLeft, ChevronRight, Heart, MessageCircle, Reply, RotateCcw, Share2, X, ZoomIn, ZoomOut } from 'lucide-vue-next';
import UnifiedNavbar from '../../components/UnifiedNavbar/index.vue';
import UserCenterPageHeader from '../../components/UserCenterPageHeader.vue';
import {
  getComments,
  createComment,
  getCommentThreadReplies,
  toggleLike,
  reportPost,
  checkIfLiked,
  deletePost,
  deleteComment,
  getPostEngagementStats,
  getForumPostImages,
  updatePost
} from '../../utils/api/forum-api.js';
import { supabase } from '../../utils/supabase-client.js';
import { formatSmartTime } from '../../utils/time.js';
import CommonAlertModal from '../../components/CommonAlertModal.vue';
import { getForumReturnKeyFromQuery } from '@/utils/forum-return-state.js';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const postId = computed(() => route.params.id);

const post = ref(null);
const isLoading = ref(true);
const isReplySubmitting = ref(false);
const isLikeSubmitting = ref(false);
const isReportSubmitting = ref(false);
const isPostMenuOpen = ref(false);
const isLikePulsing = ref(false);
const isShareCopied = ref(false);
const isEditSubmitting = ref(false);
const loadedDetailImageKeys = ref(new Set());
const isDetailImageViewerOpen = ref(false);
const isDetailViewerImageLoading = ref(false);
const detailViewerZoom = ref(1);
const detailViewerPan = ref({ x: 0, y: 0 });
const isDetailViewerPanning = ref(false);
const replyContent = ref('');
const activeReplyId = ref(null); // 当前正在回复的对象ID (postId 或 commentId)
const replyToUser = ref(null); // 当前正在回复的用户名
const activeReplyQuote = ref('');
const cooldownNow = ref(Date.now());
const replyCooldownUntil = ref(0);
const detailImageIndex = ref(0);
let cooldownTimer = null;
let detailFetchSeq = 0;
let likePulseTimer = null;
let shareCopiedTimer = null;
let detailViewerPanStart = { x: 0, y: 0 };
const DETAIL_VIEWER_MIN_ZOOM = 0.5;
const DETAIL_VIEWER_MAX_ZOOM = 4;
const DETAIL_VIEWER_ZOOM_STEP = 0.25;

// 编辑功能相关
const isEditingPost = ref(false);
const editingPostTitle = ref('');
const editingPostContent = ref('');
const isReportModalOpen = ref(false);
const reportForm = ref({
  reason: 'other',
  detail: ''
});
const reportReasons = [
  { value: 'spam', label: '垃圾广告', description: '重复刷屏、广告推广或无关内容' },
  { value: 'harass', label: '骚扰攻击', description: '辱骂、人身攻击、恶意挑衅' },
  { value: 'porn', label: '不适内容', description: '色情、血腥或其他不宜展示内容' },
  { value: 'false', label: '虚假误导', description: '造谣、误导或冒充他人' },
  { value: 'other', label: '其他问题', description: '无法归类，但需要管理员查看' }
];

const topComments = ref([]);
const topCommentsPage = ref(1);
const hasMoreTopComments = ref(false);
const isTopCommentsLoading = ref(false);
const childRepliesMap = ref({});
const highlightedCommentId = ref('');

const TOP_LEVEL_PAGE_SIZE = 20;
const CHILD_REPLY_PAGE_SIZE = 5;

// 内容折叠相关
const isExpanded = ref(false);
const CONTENT_LIMIT = 500;
const extractPostTitle = (postOrContent) => {
  if (postOrContent && typeof postOrContent === 'object') {
    const explicitTitle = String(postOrContent.title || '').trim();
    if (explicitTitle) return explicitTitle;
    postOrContent = postOrContent.content;
  }
  const rawContent = postOrContent;
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
  return stripLegacyTitlePrefix(String(postOrContent || '').replace(/【.*?】\n?/, ''), title);
};

const isContentLong = computed(() => {
  if (!post.value) return false;
  const bodyText = extractPostBody(post.value);
  return bodyText.length > CONTENT_LIMIT;
});

const displayContent = computed(() => {
  if (!post.value) return '';
  const bodyText = extractPostBody(post.value);
  if (!isContentLong.value || isExpanded.value) return bodyText;
  return bodyText.substring(0, CONTENT_LIMIT) + '...';
});
const postTitle = computed(() => extractPostTitle(post.value));
const canManagePost = computed(() => Boolean(
  isLoggedIn.value
  && post.value
  && (String(post.value.author_id || '') === String(userInfo.id || '') || userInfo.role === 'admin')
));
const canReportPost = computed(() => Boolean(
  post.value
  && (!isLoggedIn.value || String(post.value.author_id || '') !== String(userInfo.id || ''))
));
const shouldShowPostMenu = computed(() => Boolean(post.value && (canManagePost.value || canReportPost.value)));
const detailImages = computed(() => (Array.isArray(post.value?.images)
  ? post.value.images.filter((image) => image?.url)
  : []));
const currentDetailImage = computed(() => detailImages.value[detailImageIndex.value] || null);
const detailImageKey = computed(() => String(
  currentDetailImage.value?.url
  || currentDetailImage.value?.detailUrl
  || currentDetailImage.value?.originalUrl
  || ''
).trim());
const hasMultipleDetailImages = computed(() => detailImages.value.length > 1);
const currentDetailImageViewerSources = computed(() => {
  const image = currentDetailImage.value || {};
  return Array.from(new Set([
    image.detailUrl,
    image.originalUrl,
    image.url,
    image.thumbUrl
  ].map((url) => String(url || '').trim()).filter(Boolean)));
});
const currentDetailImageLargeUrl = computed(() => currentDetailImageViewerSources.value[0] || '');
const detailViewerZoomPercent = computed(() => `${Math.round(detailViewerZoom.value * 100)}%`);
const detailViewerImageStyle = computed(() => ({
  transform: `translate3d(${detailViewerPan.value.x}px, ${detailViewerPan.value.y}px, 0) scale(${detailViewerZoom.value})`
}));

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const goToDetailImage = (index) => {
  const total = detailImages.value.length;
  if (!total) {
    detailImageIndex.value = 0;
    return;
  }
  const nextIndex = Math.min(Math.max(Number(index || 0), 0), total - 1);
  if (nextIndex !== detailImageIndex.value) {
    resetDetailViewerTransform();
    isDetailViewerImageLoading.value = true;
  }
  detailImageIndex.value = nextIndex;
};

const showPrevDetailImage = () => {
  const total = detailImages.value.length;
  if (total <= 1) return;
  resetDetailViewerTransform();
  isDetailViewerImageLoading.value = true;
  detailImageIndex.value = (detailImageIndex.value - 1 + total) % total;
};

const showNextDetailImage = () => {
  const total = detailImages.value.length;
  if (total <= 1) return;
  resetDetailViewerTransform();
  isDetailViewerImageLoading.value = true;
  detailImageIndex.value = (detailImageIndex.value + 1) % total;
};

const openDetailImageViewer = (index = detailImageIndex.value) => {
  if (!detailImages.value.length) return;
  goToDetailImage(index);
  resetDetailViewerTransform();
  isDetailViewerImageLoading.value = true;
  isDetailImageViewerOpen.value = true;
};

const closeDetailImageViewer = () => {
  isDetailImageViewerOpen.value = false;
  isDetailViewerImageLoading.value = false;
  resetDetailViewerTransform();
};

function clampDetailViewerZoom(value) {
  return Math.min(DETAIL_VIEWER_MAX_ZOOM, Math.max(DETAIL_VIEWER_MIN_ZOOM, Number(value) || 1));
}

function resetDetailViewerTransform() {
  detailViewerZoom.value = 1;
  detailViewerPan.value = { x: 0, y: 0 };
  isDetailViewerPanning.value = false;
}

const setDetailViewerZoom = (value) => {
  const nextZoom = clampDetailViewerZoom(value);
  detailViewerZoom.value = nextZoom;
  if (nextZoom <= 1) {
    detailViewerPan.value = { x: 0, y: 0 };
  }
};

const zoomInDetailViewer = () => {
  setDetailViewerZoom(detailViewerZoom.value + DETAIL_VIEWER_ZOOM_STEP);
};

const zoomOutDetailViewer = () => {
  setDetailViewerZoom(detailViewerZoom.value - DETAIL_VIEWER_ZOOM_STEP);
};

const handleDetailViewerWheel = (event) => {
  const direction = Number(event?.deltaY || 0) < 0 ? 1 : -1;
  setDetailViewerZoom(detailViewerZoom.value + direction * DETAIL_VIEWER_ZOOM_STEP);
};

const startDetailViewerPan = (event) => {
  if (detailViewerZoom.value <= 1) return;
  isDetailViewerPanning.value = true;
  event?.currentTarget?.setPointerCapture?.(event.pointerId);
  detailViewerPanStart = {
    x: Number(event?.clientX || 0) - detailViewerPan.value.x,
    y: Number(event?.clientY || 0) - detailViewerPan.value.y
  };
};

const moveDetailViewerPan = (event) => {
  if (!isDetailViewerPanning.value || detailViewerZoom.value <= 1) return;
  detailViewerPan.value = {
    x: Number(event?.clientX || 0) - detailViewerPanStart.x,
    y: Number(event?.clientY || 0) - detailViewerPanStart.y
  };
};

const stopDetailViewerPan = (event) => {
  if (!isDetailViewerPanning.value) return;
  isDetailViewerPanning.value = false;
  event?.currentTarget?.releasePointerCapture?.(event.pointerId);
};

const handleDetailViewerImageError = (event) => {
  const target = event?.target;
  if (!target) {
    isDetailViewerImageLoading.value = false;
    return;
  }
  const currentSourceIndex = Number(target.dataset?.sourceIndex || 0);
  const nextSourceIndex = currentSourceIndex + 1;
  const nextSource = currentDetailImageViewerSources.value[nextSourceIndex];
  if (!nextSource) {
    isDetailViewerImageLoading.value = false;
    return;
  }
  isDetailViewerImageLoading.value = true;
  target.dataset.sourceIndex = String(nextSourceIndex);
  target.src = nextSource;
};

const handleDetailViewerImageLoad = () => {
  isDetailViewerImageLoading.value = false;
};

const handleDetailKeydown = (event) => {
  if (!isDetailImageViewerOpen.value) return;
  if (event.key === 'Escape') {
    closeDetailImageViewer();
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showPrevDetailImage();
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    showNextDetailImage();
    return;
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomInDetailViewer();
    return;
  }
  if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    zoomOutDetailViewer();
    return;
  }
  if (event.key === '0') {
    event.preventDefault();
    resetDetailViewerTransform();
  }
};

const triggerLikePulse = () => {
  isLikePulsing.value = true;
  if (likePulseTimer) clearTimeout(likePulseTimer);
  likePulseTimer = setTimeout(() => {
    isLikePulsing.value = false;
    likePulseTimer = null;
  }, 620);
};

const showShareCopiedState = () => {
  isShareCopied.value = true;
  if (shareCopiedTimer) clearTimeout(shareCopiedTimer);
  shareCopiedTimer = setTimeout(() => {
    isShareCopied.value = false;
    shareCopiedTimer = null;
  }, 1500);
};

const markDetailImageLoaded = (key = detailImageKey.value) => {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  loadedDetailImageKeys.value = new Set([...loadedDetailImageKeys.value, safeKey]);
};

const isDetailImageLoaded = (key = detailImageKey.value) => loadedDetailImageKeys.value.has(String(key || '').trim());

const closePostMenu = () => {
  isPostMenuOpen.value = false;
};

const togglePostMenu = () => {
  isPostMenuOpen.value = !isPostMenuOpen.value;
};

const handleDocumentClick = () => {
  closePostMenu();
};

// 弹窗状态
const modalState = ref({
  show: false,
  type: 'success',
  title: '',
  message: ''
});
const confirmState = ref({
  show: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  resolve: null
});

const showModal = (type, title, message) => {
  modalState.value = { show: true, type, title, message };
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
  router.push(`/profile/${encodeURIComponent(safeUsername)}`);
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

const formatDate = formatSmartTime;

const getCurrentUserId = () => (isLoggedIn.value ? userInfo.id : null);

const buildReplyDraft = () => {
  return '';
};

const getCooldownSeconds = (until) => Math.max(0, Math.ceil((Number(until || 0) - cooldownNow.value) / 1000));

const replyCooldownSeconds = computed(() => getCooldownSeconds(replyCooldownUntil.value));

const replySubmitLabel = computed(() => (
  replyCooldownSeconds.value > 0 ? `${replyCooldownSeconds.value}s 后发布` : '发布'
));

const ensureCooldownTimer = () => {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(() => {
    cooldownNow.value = Date.now();
    if (replyCooldownSeconds.value <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 250);
};

const startReplyCooldown = (seconds) => {
  replyCooldownUntil.value = Date.now() + Math.max(1, Number(seconds || 10)) * 1000;
  cooldownNow.value = Date.now();
  ensureCooldownTimer();
};

const applyRateLimitCooldown = (error) => {
  if (error?.code !== 'FORUM_RATE_LIMIT') return false;
  const ruleCode = String(error.details || '').trim();
  startReplyCooldown(ruleCode === 'COMMENT_10M_LIMIT' ? 30 : 10);
  return true;
};

const resetCommentState = () => {
  topComments.value = [];
  topCommentsPage.value = 1;
  hasMoreTopComments.value = false;
  childRepliesMap.value = {};
  highlightedCommentId.value = '';
};

const refreshPostStats = async () => {
  if (!post.value?.id) return;
  const statsRes = await getPostEngagementStats(post.value.id);
  if (statsRes.ok) {
    post.value.comment_count = Number(statsRes.data?.commentCount || 0);
    post.value.like_count = Number(statsRes.data?.likeCount || 0);
  }
};

const loadTopComments = async ({ reset = false } = {}) => {
  if (!post.value?.id) return;
  if (isTopCommentsLoading.value) return;
  if (!reset && !hasMoreTopComments.value) return;

  isTopCommentsLoading.value = true;
  const pageToLoad = reset ? 1 : topCommentsPage.value;

  try {
    const result = await getComments(post.value.id, getCurrentUserId(), {
      topLevelOnly: true,
      page: pageToLoad,
      pageSize: TOP_LEVEL_PAGE_SIZE,
      order: 'desc'
    });

    const incoming = Array.isArray(result?.data) ? result.data : [];
    if (reset) {
      topComments.value = incoming;
      childRepliesMap.value = {};
      await preloadChildReplyPreviews(incoming);
    } else {
      const existing = new Set(topComments.value.map((item) => item.id));
      const merged = incoming.filter((item) => !existing.has(item.id));
      topComments.value = [...topComments.value, ...merged];
      await preloadChildReplyPreviews(merged);
    }

    hasMoreTopComments.value = Boolean(result?.hasMore);
    topCommentsPage.value = pageToLoad + 1;
  } catch (error) {
    console.error('加载顶层评论失败:', error);
  } finally {
    isTopCommentsLoading.value = false;
  }
};

const toIdKey = (value) => String(value || '').trim();

const getChildReplyState = (parentId) => {
  const key = String(parentId || '');
  return childRepliesMap.value[key] || {
    items: [],
    totalCount: 0,
    fullLoaded: false,
    page: 1,
    hasMore: false,
    isLoading: false,
    expanded: false
  };
};

const patchChildReplyState = (parentId, patch) => {
  const key = String(parentId || '');
  const current = getChildReplyState(key);
  childRepliesMap.value = {
    ...childRepliesMap.value,
    [key]: {
      ...current,
      ...patch
    }
  };
};

const loadChildReplyPreview = async (parentId) => {
  if (!post.value?.id || !parentId) return;
  const rootId = toIdKey(parentId);
  const state = getChildReplyState(rootId);
  if (state.isLoading || state.fullLoaded || Number(state.totalCount || 0) > 0) return;

  patchChildReplyState(rootId, { isLoading: true });
  try {
    const { data, error, hasMore } = await getCommentThreadReplies(
      post.value.id,
      rootId,
      getCurrentUserId(),
      {
        page: 1,
        pageSize: 1
      }
    );

    if (error) throw error;
    const previewRows = Array.isArray(data) ? data.slice(0, 1) : [];

    patchChildReplyState(rootId, {
      items: previewRows,
      totalCount: previewRows.length,
      fullLoaded: !Boolean(hasMore),
      hasMore: Boolean(hasMore),
      page: 1,
      isLoading: false,
      expanded: false
    });
  } catch (error) {
    console.error('加载楼中楼预览失败:', error);
    patchChildReplyState(rootId, { isLoading: false, fullLoaded: true });
  }
};

const preloadChildReplyPreviews = async (comments = []) => {
  const safeComments = Array.isArray(comments) ? comments : [];
  if (safeComments.length === 0) return;
  await Promise.allSettled(
    safeComments
      .filter((comment) => comment?.id)
      .map((comment) => loadChildReplyPreview(comment.id))
  );
};

const loadChildReplies = async (parentId, { reset = false, expand = false } = {}) => {
  if (!post.value?.id || !parentId) return;
  const rootId = toIdKey(parentId);
  const state = getChildReplyState(rootId);
  if (state.isLoading) return;
  if (!reset && state.fullLoaded) return;
  patchChildReplyState(rootId, { isLoading: true });

  try {
    const { data, error, hasMore } = await getCommentThreadReplies(
      post.value.id,
      rootId,
      getCurrentUserId(),
      {
        page: reset ? 1 : state.page,
        pageSize: CHILD_REPLY_PAGE_SIZE
      }
    );

    if (error) throw error;

    const incoming = Array.isArray(data) ? data : [];
    const existingItems = reset ? [] : (state.items || []);
    const existingIds = new Set(existingItems.map((item) => String(item.id)));
    const threadReplies = [
      ...existingItems,
      ...incoming.filter((item) => !existingIds.has(String(item.id)))
    ];

    patchChildReplyState(rootId, {
      items: threadReplies,
      totalCount: threadReplies.length,
      fullLoaded: !Boolean(hasMore),
      hasMore: Boolean(hasMore),
      page: (reset ? 1 : state.page) + 1,
      isLoading: false,
      expanded: Boolean(expand || state.expanded) && threadReplies.length > 0
    });
  } catch (error) {
    console.error('加载楼中楼评论失败:', error);
    patchChildReplyState(rootId, { isLoading: false });
  }
};

const getVisibleChildReplies = (parentId) => {
  const state = getChildReplyState(parentId);
  if (state.expanded) {
    return state.items || [];
  }
  return (state.items || []).slice(0, 1);
};

const shouldShowExpandChildReplies = (parentId) => {
  const state = getChildReplyState(parentId);
  const total = Number(state.totalCount || 0);
  return state.isLoading || !state.fullLoaded || total > 1;
};

const getChildReplyToggleLabel = (parentId) => {
  const state = getChildReplyState(parentId);
  if (state.isLoading) return '加载中...';
  if (state.expanded) return '收起回复';
  if (!state.fullLoaded && Number(state.totalCount || 0) === 0) return '查看更多回复';
  if (!state.fullLoaded && Number(state.totalCount || 0) > 0) return '展开更多回复';
  const total = Number(state.totalCount || 0);
  if (total <= 1) return '查看更多回复';
  return '展开更多回复';
};

const shouldShowLoadMoreChildReplies = (parentId) => {
  const state = getChildReplyState(parentId);
  return Boolean(state.expanded && state.hasMore);
};

const getChildReplyLoadMoreLabel = (parentId) => {
  const state = getChildReplyState(parentId);
  return state.isLoading ? '加载中...' : '加载更多回复';
};

const toggleChildReplies = async (parentComment) => {
  if (!parentComment?.id) return;
  const state = getChildReplyState(parentComment.id);
  const hasLoadedPreview = Number(state.totalCount || 0) > 0;

  if (state.expanded) {
    patchChildReplyState(parentComment.id, { expanded: false });
    return;
  }

  if (!hasLoadedPreview && !state.fullLoaded) {
    await loadChildReplies(parentComment.id, { reset: true, expand: true });
    return;
  }

  if (hasLoadedPreview && !state.fullLoaded) {
    await loadChildReplies(parentComment.id, { reset: true, expand: true });
    return;
  }

  const nextState = getChildReplyState(parentComment.id);
  patchChildReplyState(parentComment.id, {
    expanded: Number(nextState.totalCount || 0) > 1,
    totalCount: Number(nextState.totalCount || 0)
  });
};

const scrollToComment = async (commentId) => {
  await nextTick();
  const el = document.getElementById(`comment-${commentId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightedCommentId.value = String(commentId || '');
  window.setTimeout(() => {
    if (highlightedCommentId.value === String(commentId || '')) {
      highlightedCommentId.value = '';
    }
  }, 2200);
  return true;
};

const ensureTopCommentLoaded = async (targetCommentId) => {
  const targetId = String(targetCommentId || '').trim();
  if (!targetId) return false;
  if (topComments.value.some((item) => String(item.id) === targetId)) return true;

  while (hasMoreTopComments.value) {
    await loadTopComments({ reset: false });
    if (topComments.value.some((item) => String(item.id) === targetId)) return true;
  }

  return false;
};

const ensureChildCommentLoaded = async (parentId, targetCommentId) => {
  const targetId = String(targetCommentId || '').trim();
  if (!targetId) return false;

  let state = getChildReplyState(parentId);
  if (!state.fullLoaded) {
    await loadChildReplies(parentId, { reset: true });
    state = getChildReplyState(parentId);
  }

  if ((state.items || []).some((item) => String(item.id) === targetId)) {
    return true;
  }

  while (state.hasMore) {
    await loadChildReplies(parentId, { reset: false });
    state = getChildReplyState(parentId);
    if ((state.items || []).some((item) => String(item.id) === targetId)) {
      return true;
    }
  }

  return false;
};

const resolveRootCommentId = async (comment) => {
  let current = comment;
  const visited = new Set();

  for (let depth = 0; depth < 12; depth += 1) {
    const currentId = String(current?.id || '').trim();
    const parentId = String(current?.parent_id || '').trim();
    if (!currentId || !parentId || visited.has(currentId)) {
      return currentId;
    }

    visited.add(currentId);
    const { data: parentComment, error } = await supabase
      .from('comments')
      .select('id, parent_id, post_id, status')
      .eq('id', parentId)
      .eq('post_id', post.value.id)
      .single();

    const parentStatus = String(parentComment?.status || 'approved').trim().toLowerCase();
    if (error || !parentComment || parentStatus !== 'approved') {
      return parentId;
    }

    if (!parentComment.parent_id) {
      return parentComment.id;
    }
    current = parentComment;
  }

  return String(current?.parent_id || current?.id || '').trim();
};

const handleCommentDeepLink = async () => {
  const targetCommentId = String(route.query.comment || '').trim();
  if (!targetCommentId || !post.value?.id) return;

  const { data: targetComment, error } = await supabase
    .from('comments')
    .select('id, parent_id, post_id, status')
    .eq('id', targetCommentId)
    .eq('post_id', post.value.id)
    .single();

  const targetStatus = String(targetComment?.status || 'approved').trim().toLowerCase();
  if (error || !targetComment || targetStatus !== 'approved') {
    return;
  }

  if (!targetComment.parent_id) {
    const loaded = await ensureTopCommentLoaded(targetComment.id);
    if (loaded) {
      await scrollToComment(targetComment.id);
    }
    return;
  }

  const rootCommentId = await resolveRootCommentId(targetComment);
  const parentLoaded = await ensureTopCommentLoaded(rootCommentId);
  if (!parentLoaded) return;

  patchChildReplyState(rootCommentId, { expanded: true });
  const childLoaded = await ensureChildCommentLoaded(rootCommentId, targetComment.id);
  if (childLoaded) {
    await scrollToComment(targetComment.id);
  }
};

const fetchPostDetail = async () => {
  const requestSeq = ++detailFetchSeq;
  isLoading.value = true;
  try {
    const currentUserId = getCurrentUserId();
    const isAdmin = Boolean(isLoggedIn.value && userInfo.role === 'admin');

    let query = supabase
      .from('posts')
      .select(`
        *,
        author:author_id(avatar_url)
      `)
      .eq('id', postId.value);

    if (!isAdmin) {
      const safeCurrentUserId = String(currentUserId || '').trim();
      const statusFilter = safeCurrentUserId
        ? `status.is.null,status.eq.approved,and(status.eq.limited,author_id.eq.${safeCurrentUserId}),and(status.eq.rejected,author_id.eq.${safeCurrentUserId})`
        : 'status.is.null,status.eq.approved';
      query = query.or(statusFilter);
    }

    const { data, error } = await query.single();

    if (error) throw error;

    if (data) {
      const [isLiked, imagesRes] = await Promise.all([
        currentUserId ? checkIfLiked(data.id, currentUserId) : Promise.resolve(false),
        getForumPostImages(data.id)
      ]);

      if (requestSeq !== detailFetchSeq) return;

      post.value = {
        ...data,
        isLiked,
        comment_count: Number(data.comment_count || 0),
        like_count: Number(data.like_count || 0),
        author_avatar_url: data.author?.avatar_url,
        images: imagesRes.ok ? imagesRes.data : []
      };
      detailImageIndex.value = 0;
      isLoading.value = false;

      resetCommentState();
      void (async () => {
        await loadTopComments({ reset: true });
        if (requestSeq !== detailFetchSeq) return;
        await handleCommentDeepLink();
      })();
    }
  } catch (err) {
    if (requestSeq !== detailFetchSeq) return;
    console.error('获取帖子详情失败:', err);
    post.value = null;
  } finally {
    if (requestSeq === detailFetchSeq && isLoading.value) {
      isLoading.value = false;
    }
  }
};

onMounted(() => {
  fetchPostDetail();
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('keydown', handleDetailKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('keydown', handleDetailKeydown);
  document.body.style.overflow = '';
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  if (likePulseTimer) {
    clearTimeout(likePulseTimer);
    likePulseTimer = null;
  }
  if (shareCopiedTimer) {
    clearTimeout(shareCopiedTimer);
    shareCopiedTimer = null;
  }
  closeConfirm(false);
});

watch(
  () => route.params.id,
  () => {
    post.value = null;
    activeReplyId.value = null;
    replyToUser.value = null;
    activeReplyQuote.value = '';
    replyContent.value = '';
    isExpanded.value = false;
    isLikePulsing.value = false;
    isShareCopied.value = false;
    isDetailImageViewerOpen.value = false;
    closePostMenu();
    detailImageIndex.value = 0;
    resetCommentState();
    fetchPostDetail();
  }
);

watch(isDetailImageViewerOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

watch(
  () => detailImages.value.length,
  (total) => {
    if (detailImageIndex.value >= total) {
      detailImageIndex.value = Math.max(0, total - 1);
    }
  }
);

watch(detailImageKey, () => {
  if (isDetailImageViewerOpen.value) {
    isDetailViewerImageLoading.value = true;
  }
});

watch(
  () => route.query.comment,
  async () => {
    if (!post.value?.id || isLoading.value) return;
    await handleCommentDeepLink();
  }
);

const handleToggleLike = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (!post.value?.id) return;
  if (isLikeSubmitting.value) return;

  isLikeSubmitting.value = true;
  try {
    const { action, data, error } = await toggleLike(post.value.id, userInfo.id);

    if (error) {
      console.error('点赞失败:', error);
      return;
    }

    if (action === 'liked') {
      post.value.like_count = Number(data?.likeCount ?? Number(post.value.like_count || 0) + 1);
      post.value.isLiked = true;
    } else if (action === 'unliked') {
      post.value.like_count = Number.isFinite(Number(data?.likeCount))
        ? Number(data.likeCount)
        : Math.max(0, Number(post.value.like_count || 0) - 1);
      post.value.isLiked = false;
    }
    triggerLikePulse();

    emitProfileSync({
      userId: post.value.author_id,
      username: post.value.author_username,
      reason: action === 'liked' ? 'post_liked' : 'post_unliked'
    });
  } catch (error) {
    console.error('点赞异常:', error);
  } finally {
    setTimeout(() => {
      isLikeSubmitting.value = false;
    }, 300);
  }
};

const toggleReplyInput = (targetId = null, username = null, quotedContent = '') => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }

  const replyTargetId = targetId || post.value.id;
  if (activeReplyId.value === replyTargetId) {
    activeReplyId.value = null;
    replyToUser.value = null;
    activeReplyQuote.value = '';
    replyContent.value = '';
  } else {
    activeReplyId.value = replyTargetId;
    replyToUser.value = username;
    activeReplyQuote.value = String(quotedContent || '').trim();
    replyContent.value = buildReplyDraft(username, quotedContent);

    setTimeout(() => {
      const element = document.querySelector('.x-reply-box, .reply-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const textarea = element.querySelector('textarea');
        if (textarea) textarea.focus();
      }
    }, 100);
  }
};

const submitReply = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (isReplySubmitting.value) return;
  if (replyCooldownSeconds.value > 0) {
    showModal('warning', '回复太频繁', `请 ${replyCooldownSeconds.value} 秒后再试`);
    return;
  }

  if (!replyContent.value.trim()) {
    showModal('warning', '提示', '回复内容不能为空');
    return;
  }

  isReplySubmitting.value = true;
  try {
    const commentStatus = 'approved';
    const isReplyToComment = activeReplyId.value !== post.value.id;
    const parentId = isReplyToComment ? activeReplyId.value : null;
    const replyToUsername = isReplyToComment ? replyToUser.value : null;

    const rawReplyContent = replyContent.value.trim();

    const { error } = await createComment(
      post.value.id,
      rawReplyContent,
      userInfo.id,
      userInfo.username,
      commentStatus,
      parentId,
      replyToUsername
    );

    if (error) throw error;
    replyContent.value = '';
    activeReplyId.value = null;
    replyToUser.value = null;
    activeReplyQuote.value = '';

    if (parentId) {
      patchChildReplyState(parentId, { expanded: true });
      await loadChildReplies(parentId, { reset: true });
    } else {
      await loadTopComments({ reset: true });
    }

    await refreshPostStats();

    showModal('success', '回复成功', '您的回复已发布');
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'comment_created'
    });
  } catch (error) {
    console.error('回复失败:', error);
    applyRateLimitCooldown(error);
    showModal('error', '发送失败', error?.message || '请稍后重试');
  } finally {
    setTimeout(() => {
      isReplySubmitting.value = false;
    }, 300);
  }
};

const handleDeletePost = async () => {
  closePostMenu();
  const confirmed = await requestConfirm({
    title: '删除帖子',
    message: '帖子和评论将一并删除，且无法恢复，确定继续吗？',
    confirmText: '删除'
  });
  if (!confirmed) return;

  try {
    const { success, error } = await deletePost(post.value.id, userInfo.id, userInfo.role);
    if (!success) {
      showModal('error', '删除失败', error || '请稍后重试');
      return;
    }

    emitProfileSync({
      userId: post.value.author_id,
      username: post.value.author_username,
      reason: 'post_deleted'
    });
    router.push('/forum');
  } catch (error) {
    console.error('删除失败:', error);
    showModal('error', '删除失败', error?.message || '请稍后重试');
  }
};

const handleReportPost = async () => {
  closePostMenu();
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (!post.value?.id || isReportSubmitting.value) return;
  if (String(post.value.author_id || '') === String(userInfo.id || '')) {
    showModal('warning', '无法举报', '不能举报自己的帖子');
    return;
  }

  reportForm.value = { reason: 'other', detail: '' };
  isReportModalOpen.value = true;
};

const closeReportModal = () => {
  if (isReportSubmitting.value) return;
  isReportModalOpen.value = false;
  reportForm.value = { reason: 'other', detail: '' };
};

const submitReportPost = async () => {
  if (!post.value?.id || isReportSubmitting.value) return;
  const reason = String(reportForm.value.reason || 'other').trim() || 'other';
  const detail = String(reportForm.value.detail || '').trim();

  isReportSubmitting.value = true;
  try {
    const result = await reportPost(post.value.id, reason, detail);
    if (!result.ok) {
      showModal('error', '举报失败', result.error?.message || '请稍后重试');
      return;
    }

    if (result.data?.limited) {
      isReportModalOpen.value = false;
      showModal('success', '举报已提交', result.data?.message || '该帖子已因多人举报暂时设为仅作者可见');
      router.push('/forum');
      return;
    }

    isReportModalOpen.value = false;
    showModal('success', '举报已提交', result.data?.message || '感谢你的反馈，我们会继续核查');
  } catch (error) {
    showModal('error', '举报失败', error?.message || '请稍后重试');
  } finally {
    isReportSubmitting.value = false;
  }
};

const startEditPost = () => {
  closePostMenu();
  isEditingPost.value = true;
  editingPostTitle.value = extractPostTitle(post?.value);
  editingPostContent.value = extractPostBody(post?.value);
};

const cancelEditPost = () => {
  isEditingPost.value = false;
  editingPostTitle.value = '';
  editingPostContent.value = '';
};

const submitEditPost = async () => {
  if (isEditSubmitting.value) return;

  const title = String(editingPostTitle.value || '').trim();
  const body = String(editingPostContent.value || '').trim();
  if (!title || !body) {
    showModal('warning', '提示', '请填写标题和正文');
    return;
  }

  isEditSubmitting.value = true;
  try {
    const { success, error } = await updatePost(post.value.id, body, userInfo.id, userInfo.role, title);
    if (success) {
      emitProfileSync({
        userId: post.value.author_id,
        username: post.value.author_username,
        reason: 'post_updated'
      });
      cancelEditPost();
      showModal('success', '保存成功', '帖子已更新，系统将异步完成内容复审');
      await fetchPostDetail();
      return;
    }

    showModal('error', '保存失败', error || '请稍后重试');
  } catch (error) {
    showModal('error', '保存失败', error?.message || '请稍后重试');
  } finally {
    isEditSubmitting.value = false;
  }
};

const getQueryString = (value) => {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
};

const goBack = () => {
  const source = getQueryString(route.query.from);
  const returnKey = getForumReturnKeyFromQuery(route.query, source === 'user-space' ? 'user-space' : 'forum');

  if (source === 'user-space') {
    router.push({
      path: '/user-space',
      query: {
        tab: getQueryString(route.query.tab) || 'posts',
        restore: '1',
        returnKey
      }
    });
    return;
  }

  if (source === 'forum') {
    router.push({
      path: '/forum',
      query: {
        restore: '1',
        returnKey
      }
    });
    return;
  }

  if (source === 'profile') {
    const sourceUsername = getQueryString(route.query.username);
    if (sourceUsername) {
      router.push(`/profile/${encodeURIComponent(sourceUsername)}`);
      return;
    }
  }

  router.push('/forum');
};

const sharePost = async () => {
  const shareUrl = window.location.href;
  const shareContent = `【${post.value.author_username}的帖子】${shareUrl}`;
  try {
    await navigator.clipboard.writeText(shareContent);
    showShareCopiedState();
  } catch (error) {
    console.error('复制分享链接失败:', error);
    showModal('error', '复制失败', '当前环境不支持自动复制，请手动复制地址栏链接');
  }
};

const handleDeleteComment = async (comment, parentId = null) => {
  if (!comment?.id) return;
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

    if (parentId) {
      await loadChildReplies(parentId, { reset: true });
    } else {
      await loadTopComments({ reset: true });
    }
    await refreshPostStats();
  } catch (error) {
    console.error('删除评论失败:', error);
    showModal('error', '删除失败', error?.message || '请稍后重试');
  }
};
</script>

<template>
  <div class="post-detail-page" data-theme>
    <UnifiedNavbar />
    <UserCenterPageHeader title="帖子详情" max-width="1400px" @back="goBack" />

    <div class="detail-container">
      <main class="detail-content fade-in-up" style="animation-delay: 0.1s;">
        <div v-if="isLoading" class="post-detail-skeleton" aria-hidden="true">
          <div class="post-skeleton-main glass-panel">
            <div class="post-skeleton-header">
              <div class="detail-skeleton-block skeleton-avatar"></div>
              <div class="post-skeleton-author">
                <div class="detail-skeleton-block skeleton-line name"></div>
                <div class="detail-skeleton-block skeleton-line time"></div>
              </div>
            </div>
            <div class="detail-skeleton-block skeleton-title"></div>
            <div class="detail-skeleton-block skeleton-line full"></div>
            <div class="detail-skeleton-block skeleton-line wide"></div>
            <div class="detail-skeleton-block skeleton-line medium"></div>
            <div class="post-skeleton-actions">
              <div class="detail-skeleton-block skeleton-pill"></div>
              <div class="detail-skeleton-block skeleton-pill"></div>
              <div class="detail-skeleton-block skeleton-pill short"></div>
            </div>
          </div>
          <div class="comments-skeleton-side glass-panel">
            <div class="detail-skeleton-block comments-skeleton-heading"></div>
            <div v-for="item in 4" :key="`detail-comment-skeleton-${item}`" class="comment-skeleton-row">
              <div class="detail-skeleton-block skeleton-avatar small"></div>
              <div class="comment-skeleton-body">
                <div class="detail-skeleton-block skeleton-line name"></div>
                <div class="detail-skeleton-block skeleton-line wide"></div>
                <div class="detail-skeleton-block skeleton-line medium"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!post" class="empty-state glass-panel">
          <div class="empty-icon">🏜️</div>
          <h3>帖子已失效</h3>
          <p>抱歉，该帖子可能已被作者删除或链接有误。</p>
          <button @click="router.push('/forum')" class="home-btn">返回论坛首页</button>
        </div>

        <div v-else class="post-x-layout">
          <div class="x-main-column">
            <article class="x-post-card glass-panel">
              <div class="post-header">
                <div class="author-section" @click="goToProfile(post.author_username)">
                  <div class="author-avatar">
                    <img v-if="post.author_avatar_url" :src="post.author_avatar_url" alt="作者头像" class="avatar-image" />
                    <span v-else>{{ post.author_username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                  </div>
                  <div class="author-meta">
                    <span class="author-name">@{{ post.author_username }}</span>
                    <span class="post-time">{{ formatDate(post.created_at) }}</span>
                  </div>
                </div>
                <div v-if="shouldShowPostMenu" class="post-menu-wrap" @click.stop>
                  <button
                    type="button"
                    class="post-menu-trigger"
                    :class="{ active: isPostMenuOpen }"
                    aria-label="帖子操作"
                    :aria-expanded="isPostMenuOpen ? 'true' : 'false'"
                    @click="togglePostMenu"
                  >
                    <span></span>
                    <span></span>
                    <span></span>
                  </button>
                  <transition name="post-menu">
                    <div v-if="isPostMenuOpen" class="post-menu-panel">
                      <button v-if="canManagePost" type="button" class="post-menu-item" @click="startEditPost">
                        <span class="post-menu-icon">✎</span>
                        <span>编辑</span>
                      </button>
                      <button v-if="canManagePost" type="button" class="post-menu-item danger" @click="handleDeletePost">
                        <span class="post-menu-icon">×</span>
                        <span>删除</span>
                      </button>
                      <button
                        v-if="canReportPost"
                        type="button"
                        class="post-menu-item warning"
                        :disabled="isReportSubmitting"
                        @click="handleReportPost"
                      >
                        <span class="post-menu-icon">!</span>
                        <span>{{ isReportSubmitting ? '提交中' : '举报' }}</span>
                      </button>
                    </div>
                  </transition>
                </div>
              </div>

              <div class="post-body">
                <h2 class="post-detail-title">
                  {{ postTitle }}
                  <span v-if="post.status === 'limited'" class="post-status-pill limited">仅自己可见</span>
                </h2>
                <div class="content-wrapper">
                  <p class="content-text">{{ displayContent }}</p>
                  <button v-if="isContentLong" class="expand-btn" @click="toggleExpand">
                    {{ isExpanded ? '收起全文' : '展开全文' }}
                  </button>
                </div>
                <div v-if="detailImages.length" class="post-detail-image-carousel">
                  <div class="post-detail-image-stage">
                    <transition name="detail-image-fade" mode="out-in">
                      <button :key="detailImageKey" type="button"
                        class="post-detail-image-link"
                        :class="{ 'is-loaded': isDetailImageLoaded(detailImageKey) }"
                        :aria-label="`查看${postTitle}第 ${detailImageIndex + 1} 张大图`"
                        @click="openDetailImageViewer(detailImageIndex)">
                        <img :src="currentDetailImage.url" :alt="`${postTitle} 图片 ${detailImageIndex + 1}`"
                          loading="eager" decoding="async" fetchpriority="high" class="post-detail-image"
                          :class="{ 'is-loaded': isDetailImageLoaded(detailImageKey) }"
                          :width="currentDetailImage.width || undefined"
                          :height="currentDetailImage.height || undefined"
                          @load="markDetailImageLoaded(detailImageKey)"
                          @error="markDetailImageLoaded(detailImageKey)" />
                        <span v-if="currentDetailImage.width && currentDetailImage.height" class="post-detail-image-meta">
                          {{ currentDetailImage.width }} × {{ currentDetailImage.height }}
                        </span>
                      </button>
                    </transition>
                    <button v-if="hasMultipleDetailImages" type="button"
                      class="post-detail-image-nav prev" aria-label="上一张图片" @click.stop="showPrevDetailImage">
                      ‹
                    </button>
                    <button v-if="hasMultipleDetailImages" type="button"
                      class="post-detail-image-nav next" aria-label="下一张图片" @click.stop="showNextDetailImage">
                      ›
                    </button>
                  </div>
                  <div v-if="hasMultipleDetailImages" class="post-detail-image-dots"
                    :aria-label="`共 ${detailImages.length} 张图片，当前第 ${detailImageIndex + 1} 张`">
                    <button v-for="(image, index) in detailImages" :key="image.id || image.url || index"
                      type="button" class="post-detail-image-dot"
                      :class="{ active: index === detailImageIndex }"
                      :aria-label="`查看第 ${index + 1} 张图片`" @click.stop="goToDetailImage(index)"></button>
                  </div>
                </div>
              </div>

              <div class="post-footer">
                <div class="action-bar">
                  <button class="action-btn like-btn" :class="{ 'is-liked': post.isLiked, 'is-pulsing': isLikePulsing }" @click="handleToggleLike"
                    :disabled="isLikeSubmitting">
                    <Heart class="action-svg" :size="18" :stroke-width="1.8" :fill="post.isLiked ? 'currentColor' : 'none'"
                      aria-hidden="true" />
                    <span class="action-count-bold">{{ post.like_count }}</span>
                    <span class="action-label">点赞</span>
                  </button>

                  <button class="action-btn comment-btn" @click="toggleReplyInput()">
                    <MessageCircle class="action-svg" :size="18" :stroke-width="1.8" aria-hidden="true" />
                    <span class="action-count-bold">{{ post.comment_count }}</span>
                    <span class="action-label">评论</span>
                  </button>

                  <button class="action-btn share-btn" :class="{ 'is-copy-success': isShareCopied }" @click="sharePost">
                    <Check v-if="isShareCopied" class="action-svg" :size="18" :stroke-width="2" aria-hidden="true" />
                    <Share2 v-else class="action-svg" :size="18" :stroke-width="1.8" aria-hidden="true" />
                    <span class="action-label">{{ isShareCopied ? '已复制' : '分享' }}</span>
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div class="x-side-column">
            <div class="x-side-content glass-panel">
              <transition name="fade-slide">
                <div v-if="activeReplyId" class="x-reply-box" :class="{ 'is-thread-reply': Boolean(replyToUser) }">
                  <div class="reply-input-wrapper">
                    <div class="reply-context-bar">
                      <div class="reply-context-main">
                        <span class="reply-context-label">{{ replyToUser ? '正在回复' : '写评论' }}</span>
                        <span v-if="replyToUser" class="reply-context-user">@{{ replyToUser }}</span>
                      </div>
                      <p v-if="replyToUser && activeReplyQuote" class="reply-context-quote">{{ activeReplyQuote }}</p>
                    </div>
                    <textarea v-model="replyContent" :placeholder="replyToUser ? `回复 @${replyToUser}...` : '写下你的想法...'"
                      rows="3" class="reply-textarea-x"></textarea>
                    <div class="reply-controls">
                      <div class="btn-group">
                        <button class="cancel-reply-btn"
                          @click="activeReplyId = null; replyToUser = null; activeReplyQuote = ''; replyContent = ''">取消</button>
                        <button class="submit-reply-btn" :disabled="isReplySubmitting || replyCooldownSeconds > 0"
                          @click="submitReply">
                          {{ isReplySubmitting ? '发送中...' : replySubmitLabel }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </transition>

              <section class="x-comments-section">
                <div class="section-header">
                  <h3 class="section-title">
                    社区回复
                    <span class="comment-count-badge">{{ post.comment_count }}</span>
                  </h3>
                </div>

                <div v-if="isTopCommentsLoading && topComments.length === 0" class="comments-list custom-scrollbar"
                  aria-hidden="true">
                  <div v-for="item in 4" :key="`top-comment-loading-${item}`" class="comment-skeleton-row inline">
                    <div class="detail-skeleton-block skeleton-avatar small"></div>
                    <div class="comment-skeleton-body">
                      <div class="detail-skeleton-block skeleton-line name"></div>
                      <div class="detail-skeleton-block skeleton-line wide"></div>
                      <div class="detail-skeleton-block skeleton-line medium"></div>
                    </div>
                  </div>
                </div>

                <div v-else-if="topComments.length > 0" class="comments-list custom-scrollbar">
                  <div v-for="reply in topComments" :key="reply.id" :id="`comment-${reply.id}`" class="comment-item-x"
                    :class="{ 'is-highlighted': highlightedCommentId === String(reply.id) }">
                    <div class="comment-header">
                      <div class="comment-author-info" @click="goToProfile(reply.author_username)">
                        <div class="mini-avatar">
                          <img v-if="reply.author_avatar_url" :src="reply.author_avatar_url" alt="回复者头像"
                            class="avatar-image" />
                          <span v-else>{{ reply.author_username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                        </div>
                        <div class="author-details">
                          <span class="comment-author-name">{{ reply.author_username }}</span>
                          <span class="comment-date">{{ formatDate(reply.created_at) }}</span>
                          <span v-if="String(reply.author_id || '') === String(post.author_id || '')" class="comment-author-badge">楼主</span>
                        </div>
                      </div>
                    </div>
                    <div class="comment-content">
                      <p class="comment-text">{{ reply.content }}</p>
                    </div>
                    <div class="comment-footer-x">
                      <button class="comment-reply-btn-mini"
                        @click="toggleReplyInput(reply.id, reply.author_username, reply.content)">
                        <Reply :size="14" :stroke-width="1.8" aria-hidden="true" />
                        回复
                      </button>
                      <button v-if="shouldShowExpandChildReplies(reply.id)" class="comment-thread-btn-mini"
                        :disabled="getChildReplyState(reply.id).isLoading" @click="toggleChildReplies(reply)">
                        {{ getChildReplyToggleLabel(reply.id) }}
                      </button>
                      <button v-if="isLoggedIn && (reply.author_id === userInfo.id || userInfo.role === 'admin')"
                        class="del-comment-btn-mini" aria-label="删除评论" title="删除评论" @click="handleDeleteComment(reply)">删除</button>
                    </div>

                    <div v-if="getChildReplyState(reply.id).totalCount > 0 || getChildReplyState(reply.id).isLoading"
                      class="child-replies-wrap">
                      <div
                        v-if="getChildReplyState(reply.id).isLoading && getVisibleChildReplies(reply.id).length === 0"
                        class="child-replies-loading" aria-hidden="true">
                        <div v-for="item in 2" :key="`child-reply-loading-${reply.id}-${item}`"
                          class="child-reply-skeleton-row">
                          <div class="detail-skeleton-block skeleton-line name"></div>
                          <div class="detail-skeleton-block skeleton-line wide"></div>
                        </div>
                      </div>

                      <div v-for="child in getVisibleChildReplies(reply.id)" :key="child.id" :id="`comment-${child.id}`"
                        class="child-reply-item"
                        :class="{ 'is-highlighted': highlightedCommentId === String(child.id) }">
                        <div class="child-reply-head" @click="goToProfile(child.author_username)">
                          <span class="child-reply-author-wrap">
                            <span class="child-reply-author">{{ child.author_username }}</span>
                            <span v-if="String(child.author_id || '') === String(post.author_id || '')" class="comment-author-badge compact">楼主</span>
                            <span v-if="child.reply_to_username" class="child-reply-target">
                              回复 @{{ child.reply_to_username }}
                            </span>
                          </span>
                          <span class="child-reply-time">{{ formatDate(child.created_at) }}</span>
                        </div>
                        <p class="child-reply-content">{{ child.content }}</p>
                        <div class="child-reply-actions">
                          <button class="comment-reply-btn-mini"
                            @click="toggleReplyInput(reply.id, child.author_username, child.content)">回复</button>
                          <button v-if="isLoggedIn && (child.author_id === userInfo.id || userInfo.role === 'admin')"
                            class="del-comment-btn-mini" aria-label="删除回复" title="删除回复" @click="handleDeleteComment(child, reply.id)">删除</button>
                        </div>
                      </div>

                      <button v-if="shouldShowLoadMoreChildReplies(reply.id)" class="child-load-more-btn"
                        :disabled="getChildReplyState(reply.id).isLoading"
                        @click="loadChildReplies(reply.id, { reset: false })">
                        {{ getChildReplyLoadMoreLabel(reply.id) }}
                      </button>
                    </div>
                  </div>

                  <div v-if="hasMoreTopComments" class="top-load-more-wrap">
                    <button class="load-more-comments-btn" :disabled="isTopCommentsLoading"
                      @click="loadTopComments({ reset: false })">
                      {{ isTopCommentsLoading ? '加载中...' : '加载更多评论' }}
                    </button>
                  </div>
                </div>

                <div v-else class="no-comments-state">
                  <div class="no-comments-icon">☕️</div>
                  <p>暂无评论</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>

    <Teleport to="body">
      <Transition name="detail-confirm-fade">
        <div v-if="confirmState.show" class="detail-confirm-overlay" @click.self="closeConfirm(false)">
          <div class="detail-confirm-modal" role="dialog" aria-modal="true" :aria-label="confirmState.title">
            <h3>{{ confirmState.title }}</h3>
            <p>{{ confirmState.message }}</p>
            <div class="detail-confirm-actions">
              <button type="button" class="detail-confirm-btn secondary" @click="closeConfirm(false)">
                {{ confirmState.cancelText }}
              </button>
              <button type="button" class="detail-confirm-btn danger" @click="closeConfirm(true)">
                {{ confirmState.confirmText }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <CommonAlertModal v-model:visible="modalState.show" :type="modalState.type" :title="modalState.title"
      :message="modalState.message" />

    <!-- 编辑模态框 -->
    <div v-if="isEditingPost" class="modal-overlay" @click.self="cancelEditPost">
      <div class="edit-modal glass-panel">
        <div class="modal-header">
          <h3>编辑帖子</h3>
          <button class="close-btn" @click="cancelEditPost">×</button>
        </div>
        <input v-model="editingPostTitle" class="edit-title-input" type="text" placeholder="帖子标题" />
        <textarea v-model="editingPostContent" class="edit-textarea" rows="6"></textarea>
        <div class="modal-footer">
          <button class="cancel-btn" :disabled="isEditSubmitting" @click="cancelEditPost">取消</button>
          <button class="submit-btn" :disabled="isEditSubmitting" @click="submitEditPost">
            {{ isEditSubmitting ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 举报模态框 -->
    <div v-if="isReportModalOpen" class="modal-overlay" @click.self="closeReportModal">
      <div class="report-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <div class="modal-header report-modal-header">
          <div>
            <h3 id="report-modal-title">举报帖子</h3>
            <p class="report-modal-subtitle">选择最接近的问题类型，管理员会结合帖子内容一起查看。</p>
          </div>
          <button class="close-btn" :disabled="isReportSubmitting" @click="closeReportModal">×</button>
        </div>

        <div class="report-reason-grid">
          <button
            v-for="reason in reportReasons"
            :key="reason.value"
            type="button"
            class="report-reason-option"
            :class="{ selected: reportForm.reason === reason.value }"
            :disabled="isReportSubmitting"
            @click="reportForm.reason = reason.value"
          >
            <span class="report-reason-label">{{ reason.label }}</span>
            <span class="report-reason-description">{{ reason.description }}</span>
          </button>
        </div>

        <label class="report-detail-field">
          <span>补充说明</span>
          <textarea
            v-model="reportForm.detail"
            class="report-detail-textarea"
            rows="4"
            maxlength="500"
            placeholder="可以补充具体问题、相关上下文或希望管理员注意的地方（选填）"
            :disabled="isReportSubmitting"
          ></textarea>
          <small>{{ reportForm.detail.length }}/500</small>
        </label>

        <div class="modal-footer report-modal-footer">
          <button class="cancel-btn" :disabled="isReportSubmitting" @click="closeReportModal">取消</button>
          <button class="submit-btn report-submit-btn" :disabled="isReportSubmitting" @click="submitReportPost">
            {{ isReportSubmitting ? '提交中...' : '提交举报' }}
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <transition name="detail-viewer-fade">
        <div v-if="isDetailImageViewerOpen" class="detail-image-viewer" role="dialog" aria-modal="true"
          aria-label="查看帖子大图" @click.self="closeDetailImageViewer">
          <button type="button" class="detail-image-viewer-close" aria-label="关闭大图"
            @click="closeDetailImageViewer">
            <X :size="24" :stroke-width="2.2" aria-hidden="true" />
          </button>
          <div class="detail-image-viewer-toolbar" aria-label="大图缩放工具">
            <button type="button" class="detail-image-viewer-tool" :disabled="detailViewerZoom <= DETAIL_VIEWER_MIN_ZOOM"
              aria-label="缩小图片" @click.stop="zoomOutDetailViewer">
              <ZoomOut :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
            <span class="detail-image-viewer-zoom">{{ detailViewerZoomPercent }}</span>
            <button type="button" class="detail-image-viewer-tool" :disabled="detailViewerZoom >= DETAIL_VIEWER_MAX_ZOOM"
              aria-label="放大图片" @click.stop="zoomInDetailViewer">
              <ZoomIn :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
            <button type="button" class="detail-image-viewer-tool" aria-label="重置缩放"
              @click.stop="resetDetailViewerTransform">
              <RotateCcw :size="19" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <button v-if="hasMultipleDetailImages" type="button" class="detail-image-viewer-nav prev"
            aria-label="上一张大图" @click.stop="showPrevDetailImage">
            <ChevronLeft :size="34" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <div class="detail-image-viewer-stage"
            :class="{ 'is-zoomed': detailViewerZoom > 1, 'is-panning': isDetailViewerPanning }"
            @wheel.prevent="handleDetailViewerWheel"
            @pointerdown="startDetailViewerPan"
            @pointermove="moveDetailViewerPan"
            @pointerup="stopDetailViewerPan"
            @pointercancel="stopDetailViewerPan"
            @pointerleave="stopDetailViewerPan">
            <div v-if="isDetailViewerImageLoading" class="detail-image-viewer-loader" aria-label="图片加载中">
              <span class="detail-image-viewer-spinner"></span>
            </div>
            <img :key="`${detailImageKey}-viewer`" class="detail-image-viewer-img" :src="currentDetailImageLargeUrl"
              data-source-index="0" :style="detailViewerImageStyle"
              :alt="`${postTitle} 大图 ${detailImageIndex + 1}`" decoding="async"
              @load="handleDetailViewerImageLoad" @error="handleDetailViewerImageError" />
          </div>
          <button v-if="hasMultipleDetailImages" type="button" class="detail-image-viewer-nav next"
            aria-label="下一张大图" @click.stop="showNextDetailImage">
            <ChevronRight :size="34" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <div v-if="hasMultipleDetailImages" class="detail-image-viewer-count">
            {{ detailImageIndex + 1 }} / {{ detailImages.length }}
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped src="./style.scoped.css"></style>
