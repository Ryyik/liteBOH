<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { Check, Heart, Image as ImageIcon, MessageCircle, Share2 } from 'lucide-vue-next';
import UserCenterPageHeader from '../../components/UserCenterPageHeader.vue';
import CommentThread from './components/CommentThread.vue';
import ImageViewer from './components/ImageViewer.vue';
import PostComposer from '../Forum/components/PostComposer.vue';
import {
  getComments,
  createComment,
  getCommentThreadReplies,
  getCommentAncestors,
  getCommentThreadPreviewsBatch,
  toggleLike,
  reportPost,
  checkIfLiked,
  deletePost,
  deleteComment,
  getPostEngagementStats,
  getForumPostImages,
  updatePost,
  updateForumPostImages
} from '../../utils/api/forum-api.js';
import { uploadForumImage } from '../../utils/api/forum-images-api.js';
import { FORUM_POST_IMAGE_MAX_COUNT, FORUM_TAG_OPTIONS } from '../Forum/forum-config.js';
import { normalizeForumTag } from '../../utils/api/forum-format.js';
import { supabase } from '../../utils/supabase-client.js';
import { formatSmartTime } from '../../utils/time.js';
import { logger } from '@/utils/logger.js';
import CommonAlertModal from '../../components/CommonAlertModal.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { getForumReturnKeyFromQuery, isSafePostDetailHistoryReturn } from '@/utils/forum-return-state.js';
import { clearForumFeedSnapshots } from '@/utils/forum-feed-cache.js';
import { getHomeCatAsset, isHomeCatTheme } from '@/utils/home-cat-theme.js';
import { themeManager } from '@/utils/theme-manager.js';
import { buildReplyDraft } from '@/utils/forum-helpers.js';
import { useUserTier } from '@/composables/useUserTier.js';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const postId = computed(() => route.params.id);

// ✨ 移除：emit定义（改为全局事件）
// const emit = defineEmits(['island-message']);

const post = ref(null);
const isLoading = ref(true);
const isReplySubmitting = ref(false);
const isLikeSubmitting = ref(false);
const isReportSubmitting = ref(false);
const isPostMenuOpen = ref(false);
const isLikePulsing = ref(false);
const isReplySuccessPopping = ref(false);
const isShareCopied = ref(false);
const loadedDetailImageKeys = ref(new Set());
// ✨ 新增：图片加载失败跟踪
const failedDetailImageKeys = ref(new Set());
const isDetailImageViewerOpen = ref(false);
const replyContent = ref('');
const activeReplyId = ref(null); // 当前正在回复的对象ID (postId 或 commentId)
const replyToUser = ref(null); // 当前正在回复的用户名
const activeReplyQuote = ref('');
const cooldownNow = ref(Date.now());
const replyCooldownUntil = ref(0);
const detailImageIndex = ref(0);
const currentTheme = ref(themeManager.getTheme());
const isAnniversaryMcTheme = computed(() => currentTheme.value === 'anniversary-mc');
let cooldownTimer = null;
let detailFetchSeq = 0;
let likePulseTimer = null;
let replySuccessTimer = null;
let shareCopiedTimer = null;

// 编辑功能相关（复用发帖 PostComposer 的全屏/弹窗编辑 UI）
const isEditingPost = ref(false);
const editNewPost = ref({ title: '', content: '' });
const editSelectedPostTag = ref('daily');
const editPostImages = ref([]);
const editRemovedExistingIds = ref(new Set());
const isEditSubmitting = ref(false);
const isEditUploadingPostImage = ref(false);
const editImageUploadStatus = ref('');
const isEditPortrait = ref(false);
const PORTRAIT_EDITOR_BREAKPOINT = 1024;
let editPortraitResizeHandler = null;
const updateEditPortrait = () => {
  const width = window.innerWidth;
  isEditPortrait.value = width <= PORTRAIT_EDITOR_BREAKPOINT && window.innerHeight >= width;
};
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

const { fetchUserTier, getNicknameClass } = useUserTier();
const authorTierClass = ref('');
const authorTierCode = ref('');
watch(() => post.value?.author_id, async (id) => {
  if (id) {
    const tier = await fetchUserTier(id);
    authorTierClass.value = getNicknameClass(id);
    authorTierCode.value = tier;
  } else {
    authorTierClass.value = '';
    authorTierCode.value = '';
  }
}, { immediate: true });
const commentSortMode = ref('desc');

const TOP_LEVEL_PAGE_SIZE = 20;
const CHILD_REPLY_PAGE_SIZE = 5;
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value));
const confirmMascotSrc = computed(() => {
  if (!confirmState.value.show) return '';
  const confirmText = String(confirmState.value.confirmText || '');
  const title = String(confirmState.value.title || '');
  return confirmText.includes('删除') || title.includes('删除') ? getHomeCatAsset('delete') : '';
});
const modalMascotSrc = computed(() => {
  if (!isHomeCatActive.value || !modalState.value.show) return '';
  if (modalState.value.type === 'success') return getHomeCatAsset('success');
  if (modalState.value.type === 'error' || modalState.value.type === 'warning') return getHomeCatAsset('failed');
  return getHomeCatAsset('decor');
});

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

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const goToDetailImage = (index) => {
  const total = detailImages.value.length;
  if (!total) {
    detailImageIndex.value = 0;
    return;
  }
  detailImageIndex.value = Math.min(Math.max(Number(index || 0), 0), total - 1);
};

const showPrevDetailImage = () => {
  const total = detailImages.value.length;
  if (total <= 1) return;
  detailImageIndex.value = (detailImageIndex.value - 1 + total) % total;
};

const showNextDetailImage = () => {
  const total = detailImages.value.length;
  if (total <= 1) return;
  detailImageIndex.value = (detailImageIndex.value + 1) % total;
};

const openDetailImageViewer = (index = detailImageIndex.value) => {
  if (!detailImages.value.length) return;
  goToDetailImage(index);
  isDetailImageViewerOpen.value = true;
};

const closeDetailImageViewer = () => {
  isDetailImageViewerOpen.value = false;
};

const triggerLikePulse = () => {
  isLikePulsing.value = true;
  if (likePulseTimer) clearTimeout(likePulseTimer);
  likePulseTimer = setTimeout(() => {
    isLikePulsing.value = false;
    likePulseTimer = null;
  }, 1900);
};

const triggerReplySuccessPop = () => {
  isReplySuccessPopping.value = true;
  if (replySuccessTimer) clearTimeout(replySuccessTimer);
  replySuccessTimer = setTimeout(() => {
    isReplySuccessPopping.value = false;
    replySuccessTimer = null;
  }, 1800);
};

const showShareCopiedState = () => {
  isShareCopied.value = true;
  if (shareCopiedTimer) clearTimeout(shareCopiedTimer);
  shareCopiedTimer = setTimeout(() => {
    isShareCopied.value = false;
    shareCopiedTimer = null;
  }, 1500);
};

const handleThemeChange = (theme) => {
  currentTheme.value = theme;
};

const markDetailImageLoaded = (key = detailImageKey.value) => {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  loadedDetailImageKeys.value = new Set([...loadedDetailImageKeys.value, safeKey]);
};

const isDetailImageLoaded = (key = detailImageKey.value) => loadedDetailImageKeys.value.has(String(key || '').trim());

// ✨ 新增：图片加载失败处理函数
const markDetailImageFailed = (key = detailImageKey.value) => {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  failedDetailImageKeys.value = new Set([...failedDetailImageKeys.value, safeKey]);
  logger.warn('post-detail', '图片加载失败:', { key: safeKey });
};

const isDetailImageFailed = (key = detailImageKey.value) => failedDetailImageKeys.value.has(String(key || '').trim());

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
  router.push(`/profile/${encodeURIComponent(safeUsername)}?from=post-detail`);
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
  }, 1000);
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
      order: commentSortMode.value
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
    logger.error('post-detail', '加载顶层评论失败:', error);
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
    logger.error('post-detail', '加载楼中楼预览失败:', error);
    patchChildReplyState(rootId, { isLoading: false, fullLoaded: true });
  }
};

const preloadChildReplyPreviews = async (comments = []) => {
  const safeComments = Array.isArray(comments) ? comments : [];
  if (safeComments.length === 0) return;

  const commentIds = safeComments.map((c) => c?.id).filter(Boolean);
  if (commentIds.length === 0) return;

  const postId = String(post.value?.id || '').trim();
  if (!postId) return;

  // RPC 路径：批量获取所有顶层评论的子回复预览
  try {
    const result = await getCommentThreadPreviewsBatch(postId, commentIds);
    if (!result?.error && !result?.fallback && Array.isArray(result?.data)) {
      const previewMap = new Map();
      for (const row of result.data) {
        if (row?.root_comment_id) {
          previewMap.set(String(row.root_comment_id), row);
        }
      }

      for (const id of commentIds) {
        const rootId = toIdKey(id);
        const state = getChildReplyState(rootId);
        if (state.isLoading || state.fullLoaded || Number(state.totalCount || 0) > 0) continue;

        const preview = previewMap.get(String(id));
        if (preview) {
          const previewRows = [preview];
          patchChildReplyState(rootId, {
            items: previewRows,
            totalCount: previewRows.length,
            fullLoaded: !Boolean(preview.has_more),
            hasMore: Boolean(preview.has_more),
            page: 1,
            isLoading: false,
            expanded: false
          });
        } else {
          patchChildReplyState(rootId, {
            items: [],
            totalCount: 0,
            fullLoaded: true,
            hasMore: false,
            page: 1,
            isLoading: false,
            expanded: false
          });
        }
      }
      return;
    }
  } catch (err) {
    logger.warn('post-detail', 'get_comment_thread_previews RPC 失败，降级到逐条加载', err);
  }

  // Fallback：原逐条并行加载（RPC 失败或不存在时降级）
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
    logger.error('post-detail', '加载楼中楼评论失败:', error);
    patchChildReplyState(rootId, { isLoading: false });
  }
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
  const commentId = String(comment?.id || '').trim();
  const postId = String(post.value?.id || '').trim();

  // RPC 路径：一次性获取祖先链
  if (commentId && postId) {
    try {
      const result = await getCommentAncestors(commentId, postId);
      if (!result?.error && !result?.fallback && Array.isArray(result?.data) && result.data.length > 0) {
        const ancestors = result.data;
        for (const ancestor of ancestors) {
          const depth = Number(ancestor?.depth ?? 0);
          if (depth === 0) continue;

          const status = String(ancestor?.status || 'approved').trim().toLowerCase();
          if (status !== 'approved') {
            return String(ancestor?.id || '').trim();
          }
          if (!ancestor?.parent_id) {
            return String(ancestor?.id || '').trim();
          }
        }
        const last = ancestors[ancestors.length - 1];
        return String(last?.parent_id || last?.id || '').trim();
      }
    } catch (err) {
      logger.warn('post-detail', 'get_comment_ancestors RPC 失败，降级到循环查询', err);
    }
  }

  // Fallback：原循环逻辑（RPC 失败或不存在时降级）
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
    logger.error('post-detail', '获取帖子详情失败:', err);
    post.value = null;
  } finally {
    if (requestSeq === detailFetchSeq && isLoading.value) {
      isLoading.value = false;
    }
  }
};

onMounted(() => {
  currentTheme.value = themeManager.getTheme();
  themeManager.addListener(handleThemeChange);
  fetchPostDetail();
  document.addEventListener('click', handleDocumentClick);
  updateEditPortrait();
  editPortraitResizeHandler = () => updateEditPortrait();
  window.addEventListener('resize', editPortraitResizeHandler);
});

onUnmounted(() => {
  themeManager.removeListener(handleThemeChange);
  document.removeEventListener('click', handleDocumentClick);
  if (editPortraitResizeHandler) {
    window.removeEventListener('resize', editPortraitResizeHandler);
    editPortraitResizeHandler = null;
  }
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  if (likePulseTimer) {
    clearTimeout(likePulseTimer);
    likePulseTimer = null;
  }
  if (replySuccessTimer) {
    clearTimeout(replySuccessTimer);
    replySuccessTimer = null;
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
    isReplySuccessPopping.value = false;
    isShareCopied.value = false;
    isDetailImageViewerOpen.value = false;
    closePostMenu();
    detailImageIndex.value = 0;
    resetCommentState();
    resetEditState();
    fetchPostDetail();
  }
);

watch(
  () => detailImages.value.length,
  (total) => {
    if (detailImageIndex.value >= total) {
      detailImageIndex.value = Math.max(0, total - 1);
    }
  }
);

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
      logger.error('post-detail', '点赞失败:', error);
      return;
    }

    const nextIsLiked = typeof data?.isLiked === 'boolean' ? data.isLiked : action === 'liked';

    if (action === 'liked') {
      post.value.like_count = Number(data?.likeCount ?? Number(post.value.like_count || 0) + 1);
      post.value.isLiked = nextIsLiked;
    } else if (action === 'unliked') {
      post.value.like_count = Number.isFinite(Number(data?.likeCount))
        ? Number(data.likeCount)
        : Math.max(0, Number(post.value.like_count || 0) - 1);
      post.value.isLiked = nextIsLiked;
    }
    triggerLikePulse();

    emitProfileSync({
      userId: post.value.author_id,
      username: post.value.author_username,
      reason: action === 'liked' ? 'post_liked' : 'post_unliked'
    });
  } catch (error) {
    logger.error('post-detail', '点赞异常:', error);
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
    activeReplyQuote.value = '';
    replyContent.value = buildReplyDraft(username);

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

  // 检查用户禁言状态
  if (userInfo.isMuted) {
    // 判断禁言是否有效：永久禁言或临时禁言未过期
    const isPermanentMute = !userInfo.mutedUntil;
    const isTempMuteActive = userInfo.mutedUntil && new Date(userInfo.mutedUntil) > new Date();

    if (isPermanentMute || isTempMuteActive) {
      let muteMessage = '您已被禁言，无法发表评论。';
      if (userInfo.muteReason) {
        muteMessage += ` 原因：${userInfo.muteReason}`;
      }
      if (userInfo.mutedUntil) {
        const expiryDate = new Date(userInfo.mutedUntil);
        muteMessage += ` 解禁时间：${expiryDate.toLocaleDateString('zh-CN')}`;
      } else {
        muteMessage += '（永久禁言）';
      }
      showModal('warning', '禁言提示', muteMessage);
      return;
    }
    // 临时禁言已过期，允许操作
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

    triggerReplySuccessPop();
    showModal('success', '回复成功', '您的回复已发布');
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'comment_created'
    });
  } catch (error) {
    logger.error('post-detail', '回复失败:', error);
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
    clearForumFeedSnapshots();
    window.dispatchEvent(new CustomEvent('boh:forum-post-deleted', {
      detail: { postId: post.value.id }
    }));
    goBack();
  } catch (error) {
    logger.error('post-detail', '删除失败:', error);
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
      router.push(createForumHomeLocation());
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
  if (!post.value) return;
  const title = extractPostTitle(post.value);
  const body = extractPostBody(post.value);
  editNewPost.value = { title, content: body };
  editSelectedPostTag.value = normalizeForumTag(post.value.tag) || 'daily';
  // 已有图片（detailImages 来自 getForumPostImages，已 normalize）
  editPostImages.value = detailImages.value.map((image) => ({
    ...image,
    isExisting: true,
    uploadStatus: 'approved',
    sortOrder: image.sortOrder
  }));
  editRemovedExistingIds.value = new Set();
  editImageUploadStatus.value = '';
  isEditUploadingPostImage.value = false;
  updateEditPortrait();
  isEditingPost.value = true;
};

const hasEditUnsavedChanges = () => {
  if (!post.value) return false;
  if (String(editNewPost.value.title || '') !== extractPostTitle(post.value)) return true;
  if (String(editNewPost.value.content || '') !== extractPostBody(post.value)) return true;
  if (editPostImages.value.length !== detailImages.value.length) return true;
  if (editRemovedExistingIds.value.size > 0) return true;
  if (editPostImages.value.some((image) => image?.file || image?.uploadId)) return true;
  return false;
};

const resetEditState = () => {
  isEditingPost.value = false;
  editNewPost.value = { title: '', content: '' };
  editSelectedPostTag.value = 'daily';
  editPostImages.value = [];
  editRemovedExistingIds.value = new Set();
  editImageUploadStatus.value = '';
  isEditUploadingPostImage.value = false;
};

const cancelEditPost = async () => {
  if (isEditSubmitting.value) return;
  if (hasEditUnsavedChanges()) {
    const confirmed = await requestConfirm({
      title: '放弃修改',
      message: '当前修改尚未保存，确定放弃吗？',
      confirmText: '放弃修改',
      cancelText: '继续编辑'
    });
    if (!confirmed) return;
  }
  resetEditState();
};

const handleEditImageSelection = async ({ files, event } = {}) => {
  const fileList = Array.from(files || event?.target?.files || []);
  if (!fileList.length || isEditSubmitting.value) return;
  const remaining = Math.max(0, FORUM_POST_IMAGE_MAX_COUNT - editPostImages.value.length);
  if (remaining <= 0) {
    showModal('warning', '图片已满', `每个帖子最多 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片`);
    return;
  }
  const selectedFiles = fileList.slice(0, remaining);
  for (const file of selectedFiles) {
    await enqueueEditImageUpload(file);
  }
};

const enqueueEditImageUpload = async (file) => {
  const uploadId = `edit-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let localPreviewUrl = '';
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try { localPreviewUrl = URL.createObjectURL(file); } catch { /* ignore */ }
  }
  const pending = {
    id: uploadId,
    uploadId,
    name: String(file?.name || '图片').trim(),
    file,
    url: localPreviewUrl,
    localPreviewUrl,
    uploadStatus: 'uploading',
    uploadStatusLabel: '上传中',
    sortOrder: editPostImages.value.length
  };
  editPostImages.value = [...editPostImages.value, pending];
  isEditUploadingPostImage.value = true;
  editImageUploadStatus.value = '正在检测并上传图片…';
  try {
    const result = await uploadForumImage(file);
    const index = editPostImages.value.findIndex((image) => image.uploadId === uploadId);
    if (index < 0) return;
    const next = [...editPostImages.value];
    if (result.ok && result.data) {
      next[index] = {
        ...result.data,
        uploadId,
        uploadStatus: 'approved',
        uploadStatusLabel: '',
        sortOrder: index
      };
    } else {
      next[index] = {
        ...pending,
        uploadStatus: 'failed',
        uploadStatusLabel: '未通过',
        uploadError: result.error?.message || '图片上传失败'
      };
    }
    editPostImages.value = next;
  } finally {
    isEditUploadingPostImage.value = false;
    editImageUploadStatus.value = '';
  }
};

const handleEditRemoveImage = (image, index) => {
  if (isEditSubmitting.value) return;
  if (image?.isExisting && image?.id) {
    editRemovedExistingIds.value = new Set([...editRemovedExistingIds.value, String(image.id)]);
  }
  if (image?.localPreviewUrl && typeof URL !== 'undefined') {
    try { URL.revokeObjectURL(image.localPreviewUrl); } catch { /* ignore */ }
  }
  editPostImages.value = editPostImages.value
    .filter((_, itemIndex) => itemIndex !== index)
    .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
};

const handleEditReorderImage = ({ fromIndex, toIndex } = {}) => {
  const from = Number(fromIndex);
  const to = Number(toIndex);
  const total = editPostImages.value.length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;
  if (from < 0 || from >= total || to < 0 || to >= total || from === to) return;
  const images = [...editPostImages.value];
  const [moved] = images.splice(from, 1);
  images.splice(to, 0, moved);
  editPostImages.value = images.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
};

const handleEditClearImages = () => {
  if (isEditSubmitting.value) return;
  editPostImages.value.forEach((image) => {
    if (image?.isExisting && image?.id) {
      editRemovedExistingIds.value = new Set([...editRemovedExistingIds.value, String(image.id)]);
    }
  });
  editPostImages.value = [];
};

const submitEditPost = async () => {
  if (isEditSubmitting.value) return;

  const title = String(editNewPost.value.title || '').trim();
  const body = String(editNewPost.value.content || '').trim();
  if (!title || !body) {
    showModal('warning', '提示', '请填写标题和正文');
    return;
  }
  if (editPostImages.value.some((image) => image.uploadStatus === 'uploading')) {
    showModal('warning', '提示', '图片还在上传中，请稍候再保存');
    return;
  }
  if (editPostImages.value.some((image) => image.uploadStatus === 'failed')) {
    showModal('warning', '提示', '有图片上传失败，请移除后重试或换一张图片');
    return;
  }

  isEditSubmitting.value = true;
  try {
    const { success, error } = await updatePost(post.value.id, body, userInfo.id, userInfo.role, title);
    if (!success) {
      showModal('error', '保存失败', error || '请稍后重试');
      return;
    }

    // 图片集合：保留图传 id，新图传上传完成的元数据
    const imagesPayload = editPostImages.value.map((image) => {
      if (image?.isExisting && image?.id) {
        return { id: String(image.id) };
      }
      return {
        url: image?.originalUrl || image?.url || '',
        publicId: image?.publicId || '',
        width: Number(image?.width || 0),
        height: Number(image?.height || 0),
        format: image?.format || '',
        moderationStatus: 'approved',
        moderationScore: image?.moderationScore || 0,
        moderationReason: image?.moderationReason || ''
      };
    });
    const imgResult = await updateForumPostImages(post.value.id, imagesPayload);
    if (!imgResult.ok) {
      logger.warn('post-detail', '帖子图片同步失败', imgResult.error);
    }

    // 标签回写（updatePost 不处理 tag）
    const currentTag = normalizeForumTag(post.value.tag);
    if (editSelectedPostTag.value && editSelectedPostTag.value !== currentTag) {
      const { error: tagError } = await supabase
        .from('posts')
        .update({ tag: editSelectedPostTag.value })
        .eq('id', post.value.id)
        .eq('author_id', userInfo.id);
      if (tagError) {
        logger.warn('post-detail', '帖子标签回写失败', tagError);
      }
    }

    emitProfileSync({
      userId: post.value.author_id,
      username: post.value.author_username,
      reason: 'post_updated'
    });
    clearForumFeedSnapshots();
    window.dispatchEvent(new CustomEvent('boh:forum-post-updated', {
      detail: { postId: post.value.id }
    }));
    resetEditState();
    showModal('success', '保存成功', imgResult.ok ? '帖子已更新' : '帖子已更新，但图片同步失败，请稍后重试');
    await fetchPostDetail();
  } catch (error) {
    logger.error('post-detail', '编辑帖子失败', error);
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

const createForumHomeLocation = (query = {}) => ({
  path: '/user-space',
  query: {
    tab: 'posts',
    ...query
  }
});

const goBack = () => {
  const source = getQueryString(route.query.from);
  const returnKey = getForumReturnKeyFromQuery(route.query, source === 'forum' ? 'forum' : 'user-space');
  const historyBack = typeof window !== 'undefined' ? getQueryString(window.history.state?.back) : '';

  if (isSafePostDetailHistoryReturn(historyBack, source)) {
    router.back();
    return;
  }

  if (source === 'user-space') {
    router.replace(createForumHomeLocation({
      tab: getQueryString(route.query.tab) || 'posts',
      restore: '1',
      returnKey
    }));
    return;
  }

  if (source === 'forum') {
    router.replace(createForumHomeLocation({
      restore: '1',
      returnKey
    }));
    return;
  }

  if (source === 'profile') {
    const sourceUsername = getQueryString(route.query.username);
    const origin = getQueryString(route.query.origin);
    if (sourceUsername) {
      const url = origin
        ? `/profile/${encodeURIComponent(sourceUsername)}?from=${encodeURIComponent(origin)}`
        : `/profile/${encodeURIComponent(sourceUsername)}`;
      router.replace(url);
      return;
    }
  }

  router.replace(createForumHomeLocation());
};

const sharePost = async () => {
  const shareUrl = window.location.href;
  const shareContent = `【${post.value.author_username}的帖子】${shareUrl}`;
  try {
    await navigator.clipboard.writeText(shareContent);
    showShareCopiedState();
    // 此路由没有公共顶部导航栏；保留事件供嵌入式宿主承接。
    window.dispatchEvent(new CustomEvent('boh_global_nav_status', {
      detail: {
        title: '分享链接已复制到剪贴板',
        icon: 'success',
        catSticker: 'success',
        actionLabel: '知道了',
        at: Date.now()
      }
    }));
  } catch (error) {
    logger.error('post-detail', '复制分享链接失败:', error);
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
    logger.error('post-detail', '删除评论失败:', error);
    showModal('error', '删除失败', error?.message || '请稍后重试');
  }
};

const handleChangeCommentSortMode = async (mode) => {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (normalizedMode !== 'asc' && normalizedMode !== 'desc') return;
  if (commentSortMode.value === normalizedMode) return;
  commentSortMode.value = normalizedMode;
  await loadTopComments({ reset: true });
};
</script>

<template>
  <div class="post-detail-page" :data-theme="currentTheme"
    :data-anniversary-skin="isAnniversaryMcTheme ? 'active' : 'off'">
    <UserCenterPageHeader title="帖子详情" max-width="1400px" @back="goBack" />

    <div class="detail-container">
      <main class="detail-content fade-in-up" style="animation-delay: 0.1s;">
        <div v-if="isLoading" class="post-detail-skeleton" aria-hidden="true">
          <div class="post-skeleton-main glass-panel">
            <HomeCatMascot v-if="isHomeCatActive" class="detail-skeleton-thinking-cat" pool="state"
              seed="detail-skeleton-thinking" size="md" decorative />
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
          <button @click="router.push(createForumHomeLocation())" class="home-btn">返回方块社区</button>
        </div>

        <div v-else class="post-x-layout">
          <div class="x-main-column">
            <article class="x-post-card glass-panel" :class="{
              'tier-plus': authorTierCode === 'plus',
              'tier-pro': authorTierCode === 'pro',
              'tier-max': authorTierCode === 'max',
              'tier-ultra': authorTierCode === 'ultra'
            }">
              <HomeCatMascot v-if="isHomeCatActive" class="detail-post-decor-cat" pool="card"
                :seed="`${post.id}:detail`" size="md" decorative />
              <div class="post-header">
                <div class="author-section" @click="goToProfile(post.author_username)">
                  <div class="author-avatar">
                    <img v-if="post.author_avatar_url" :src="post.author_avatar_url" alt="作者头像" class="avatar-image"
                      loading="lazy" />
                    <span v-else>{{ post.author_username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                  </div>
                  <div class="author-meta">
                    <span class="author-name" :class="authorTierClass">@{{ post.author_username }}</span>
                    <span class="post-time">{{ formatDate(post.created_at) }}</span>
                    <span v-if="post.location_name" class="post-location-tag">📍 {{ post.location_name }}</span>
                  </div>
                </div>
                <div v-if="shouldShowPostMenu" class="post-menu-wrap" @click.stop>
                  <button type="button" class="post-menu-trigger" :class="{ active: isPostMenuOpen }" aria-label="帖子操作"
                    :aria-expanded="isPostMenuOpen ? 'true' : 'false'" @click="togglePostMenu">
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
                      <button v-if="canManagePost" type="button" class="post-menu-item danger"
                        @click="handleDeletePost">
                        <span class="post-menu-icon">×</span>
                        <span>删除</span>
                      </button>
                      <button v-if="canReportPost" type="button" class="post-menu-item warning"
                        :disabled="isReportSubmitting" @click="handleReportPost">
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
                      <button :key="detailImageKey" type="button" class="post-detail-image-link"
                        :class="{ 'is-loaded': isDetailImageLoaded(detailImageKey), 'is-failed': isDetailImageFailed(detailImageKey) }"
                        :aria-label="`查看${postTitle}第 ${detailImageIndex + 1} 张大图`"
                        @click="openDetailImageViewer(detailImageIndex)">
                        <!-- ✨ 新增：图片加载失败时显示占位符 -->
                        <div v-if="isDetailImageFailed(detailImageKey)" class="post-detail-image-failed-placeholder">
                          <ImageIcon :size="48" :stroke-width="1.5" aria-hidden="true" />
                          <span class="failed-text">图片加载失败</span>
                        </div>
                        <!-- 正常图片渲染 -->
                        <img v-else :src="currentDetailImage.url" :alt="`${postTitle} 图片 ${detailImageIndex + 1}`"
                          loading="eager" decoding="async" fetchpriority="high" class="post-detail-image"
                          :class="{ 'is-loaded': isDetailImageLoaded(detailImageKey) }"
                          :width="currentDetailImage.width || undefined"
                          :height="currentDetailImage.height || undefined" @load="markDetailImageLoaded(detailImageKey)"
                          @error="markDetailImageFailed(detailImageKey)" />
                        <span
                          v-if="currentDetailImage.width && currentDetailImage.height && !isDetailImageFailed(detailImageKey)"
                          class="post-detail-image-meta">
                          {{ currentDetailImage.width }} × {{ currentDetailImage.height }}
                        </span>
                      </button>
                    </transition>
                    <button v-if="hasMultipleDetailImages" type="button" class="post-detail-image-nav prev"
                      aria-label="上一张图片" @click.stop="showPrevDetailImage">
                      ‹
                    </button>
                    <button v-if="hasMultipleDetailImages" type="button" class="post-detail-image-nav next"
                      aria-label="下一张图片" @click.stop="showNextDetailImage">
                      ›
                    </button>
                  </div>
                  <div v-if="hasMultipleDetailImages" class="post-detail-image-dots"
                    :aria-label="`共 ${detailImages.length} 张图片，当前第 ${detailImageIndex + 1} 张`">
                    <button v-for="(image, index) in detailImages" :key="image.id || image.url || index" type="button"
                      class="post-detail-image-dot" :class="{ active: index === detailImageIndex }"
                      :aria-label="`查看第 ${index + 1} 张图片`" @click.stop="goToDetailImage(index)"></button>
                  </div>
                </div>
              </div>

              <div class="post-footer">
                <div class="action-bar">
                  <button class="action-btn like-btn" :class="{ 'is-liked': post.isLiked, 'is-pulsing': isLikePulsing }"
                    @click="handleToggleLike" :disabled="isLikeSubmitting">
                    <img v-if="isHomeCatActive && isLikePulsing" class="detail-like-pop-cat-img"
                      :src="getHomeCatAsset('like')" alt="" draggable="false" loading="lazy" />
                    <Heart class="action-svg" :size="18" :stroke-width="1.8"
                      :fill="post.isLiked ? 'currentColor' : 'none'" aria-hidden="true" />
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
            <CommentThread :comments="topComments" :is-loading="isTopCommentsLoading" :has-more="hasMoreTopComments"
              :is-logged-in="isLoggedIn" :current-user-id="userInfo.id" :current-user-role="userInfo.role"
              :post-author-id="post.author_id" :post-comment-count="post.comment_count"
              :is-home-cat-active="isHomeCatActive" :is-reply-success-popping="isReplySuccessPopping"
              :active-reply-id="activeReplyId" :reply-to-user="replyToUser" :active-reply-quote="activeReplyQuote"
              :reply-content="replyContent" :is-reply-submitting="isReplySubmitting"
              :reply-cooldown-seconds="replyCooldownSeconds" :reply-submit-label="replySubmitLabel"
              :child-replies-map="childRepliesMap" :highlighted-comment-id="highlightedCommentId"
              :comment-sort-mode="commentSortMode"
              @reply="({ targetId, username, content }) => toggleReplyInput(targetId, username, content)"
              @submit-reply="submitReply"
              @cancel-reply="activeReplyId = null; replyToUser = null; activeReplyQuote = ''; replyContent = ''"
              @update:reply-content="replyContent = $event" @load-more-comments="loadTopComments({ reset: false })"
              @toggle-child-replies="toggleChildReplies"
              @load-child-replies="({ parentId, options }) => loadChildReplies(parentId, options)"
              @delete-comment="({ comment, parentId }) => handleDeleteComment(comment, parentId)"
              @go-to-profile="goToProfile" @change-sort-mode="handleChangeCommentSortMode" />
          </div>
        </div>
      </main>
    </div>

    <Teleport to="body">
      <Transition name="detail-confirm-fade">
        <div v-if="confirmState.show" class="detail-confirm-overlay" @click.self="closeConfirm(false)">
          <div class="detail-confirm-modal" role="dialog" aria-modal="true" :aria-label="confirmState.title">
            <img v-if="confirmMascotSrc" class="detail-confirm-cat-img" :src="confirmMascotSrc" alt="" draggable="false"
              loading="lazy" />
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
      :message="modalState.message" :mascot-src="modalMascotSrc" mascot-alt="方块小窝提示小猫" />

    <!-- 编辑帖子：竖屏全屏毛玻璃 / 横屏居中弹窗，复用发帖 UI -->
    <Teleport to="body">
      <Transition name="edit-composer-fade">
        <div v-if="isEditingPost" class="post-edit-overlay" :class="{ 'is-portrait': isEditPortrait }"
          @click.self="cancelEditPost">
          <div class="post-edit-shell" :class="{ 'is-portrait': isEditPortrait }">
            <!-- 竖屏顶栏：移动端布局下 PostComposer 内部 footer 会被 CSS 隐藏，发布按钮由这里承担 -->
            <header v-if="isEditPortrait" class="post-edit-bar">
              <button type="button" class="post-edit-bar-back" :disabled="isEditSubmitting"
                @click="cancelEditPost">取消</button>
              <span class="post-edit-bar-title">编辑帖子</span>
              <button type="button" class="post-edit-bar-submit" :disabled="isEditSubmitting || isEditUploadingPostImage"
                @click="submitEditPost">
                {{ isEditSubmitting ? '保存中…' : '保存' }}
              </button>
            </header>
            <div class="post-edit-scroll" :class="{ 'is-portrait': isEditPortrait }">
              <PostComposer edit-mode :user-info="userInfo" :is-logged-in="isLoggedIn"
                v-model:new-post="editNewPost" v-model:selected-post-tag="editSelectedPostTag"
                :post-images="editPostImages" :is-submitting="isEditSubmitting"
                :is-uploading-post-image="isEditUploadingPostImage" :post-image-upload-status="editImageUploadStatus"
                :forum-tag-options="FORUM_TAG_OPTIONS" :max-post-images="FORUM_POST_IMAGE_MAX_COUNT"
                :is-home-cat-theme="isHomeCatActive" :is-mobile-composer="isEditPortrait"
                @submit="submitEditPost" @close="cancelEditPost"
                @image-selection="handleEditImageSelection" @remove-image="handleEditRemoveImage"
                @reorder-image="handleEditReorderImage" @clear-images="handleEditClearImages" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

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
          <button v-for="reason in reportReasons" :key="reason.value" type="button" class="report-reason-option"
            :class="{ selected: reportForm.reason === reason.value }" :disabled="isReportSubmitting"
            @click="reportForm.reason = reason.value">
            <span class="report-reason-label">{{ reason.label }}</span>
            <span class="report-reason-description">{{ reason.description }}</span>
          </button>
        </div>

        <label class="report-detail-field">
          <span>补充说明</span>
          <textarea v-model="reportForm.detail" class="report-detail-textarea" rows="4" maxlength="500"
            placeholder="可以补充具体问题、相关上下文或希望管理员注意的地方（选填）" :disabled="isReportSubmitting"></textarea>
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

    <ImageViewer :visible="isDetailImageViewerOpen" :images="detailImages" :current-index="detailImageIndex"
      :post-title="postTitle" :current-image="currentDetailImage" :image-key="detailImageKey"
      @close="closeDetailImageViewer" @navigate-prev="showPrevDetailImage" @navigate-next="showNextDetailImage"
      @go-to-index="goToDetailImage" />
  </div>
</template>

<style scoped>
@import './style.scoped.css';
</style>

<style scoped>
.post-location-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #059669;
  background: #ecfdf5;
  padding: 2px 8px;
  border-radius: 6px;
  margin-top: 4px;
}

/* ---- 编辑帖子：竖屏全屏毛玻璃 / 横屏居中弹窗 ---- */
.post-edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 220300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
}

.post-edit-overlay.is-portrait {
  padding: 0;
  align-items: stretch;
}

.post-edit-shell {
  width: 100%;
  max-width: 720px;
  max-height: 88vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 32px;
  border: 1px solid var(--glass-border, rgba(0, 0, 0, 0.06));
  background: var(--glass-bg, rgba(255, 255, 255, 0.8));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18);
  isolation: isolate;
}

.post-edit-shell.is-portrait {
  max-width: 100%;
  max-height: 100%;
  height: 100%;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 竖屏顶栏：移动端布局下 PostComposer footer 被隐藏，保存按钮由此承担 */
.post-edit-bar {
  flex-shrink: 0;
  height: calc(58px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 16px 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
  background: rgba(255, 255, 255, 0.32);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  border-bottom: 1px solid rgba(15, 20, 25, 0.06);
}

.post-edit-bar-title {
  font-size: 16px;
  font-weight: 800;
  color: #1d1d1f;
  text-align: center;
  letter-spacing: 0;
}

.post-edit-bar-back {
  justify-self: start;
  border: none;
  background: transparent;
  color: #1d1d1f;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  padding: 8px 2px;
  line-height: 1;
}

.post-edit-bar-back:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.post-edit-bar-submit {
  position: relative;
  justify-self: end;
  min-width: 74px;
  height: 40px;
  border: none;
  border-radius: 999px;
  background: #1d1d1f;
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  padding: 0 18px;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s, background-color 0.2s;
}

.post-edit-bar-submit:active:not(:disabled) {
  transform: scale(0.96);
}

.post-edit-bar-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.post-edit-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.post-edit-scroll.is-portrait {
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

/* 竖屏全屏时 PostComposer 头部关闭按钮与顶栏"取消"重复，隐藏 */
.post-edit-shell.is-portrait :deep(.editor-close-btn) {
  display: none;
}

/* 编辑层内嵌发帖卡片：去掉重复玻璃与入场动画 */
.post-edit-shell :deep(.post-creation-section) {
  opacity: 1;
  transform: none;
  animation: none;
}

.post-edit-shell :deep(.editor-card) {
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  padding: 0;
}

/* 过渡动画 */
.edit-composer-fade-enter-active,
.edit-composer-fade-leave-active {
  transition: opacity 0.28s ease;
}

.edit-composer-fade-enter-active .post-edit-shell,
.edit-composer-fade-leave-active .post-edit-shell {
  transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
}

.edit-composer-fade-enter-from,
.edit-composer-fade-leave-to {
  opacity: 0;
}

.edit-composer-fade-enter-from .post-edit-shell,
.edit-composer-fade-leave-to .post-edit-shell {
  transform: translateY(24px) scale(0.98);
}

.edit-composer-fade-enter-to .post-edit-shell,
.edit-composer-fade-leave-from .post-edit-shell {
  transform: translateY(0) scale(1);
}
</style>
