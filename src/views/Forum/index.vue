<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Check, Heart, MessageCircle, Reply, Share2 } from 'lucide-vue-next';
import UnifiedNavbar from '../../components/UnifiedNavbar/index.vue';
import PostComposer from './components/PostComposer.vue';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader.js';

// Props
const props = defineProps({
  showNavbar: { type: Boolean, default: true },
  showHeader: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false }
});
const emit = defineEmits(['immersive-scroll']);

const router = useRouter();
const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const notificationStoreRef = ref(getNotificationStoreSync());
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);

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

import { getAllNews, getCategoryName } from '../../composables/useNews.js';
import CommonAlertModal from '../../components/CommonAlertModal.vue';
import {
  getPosts,
  createPost,
  uploadForumImage,
  deleteUploadedForumImage,
  getComments,
  createComment,
  toggleLike,
  checkIfLiked as _checkIfLiked,
  getUserPosts,
  deleteComment,
  getForumTagStats,
  getPostEngagementStats,
  retryPostModeration,
  getWeeklyCheckinStatus,
  submitWeeklyCheckin,
  getForumPostDraft,
  upsertForumPostDraft,
  deleteForumPostDraft
} from '../../utils/api/forum-api.js';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount
} from '../../utils/api/notifications-api.js';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';
import {
  getForumPostBody,
  getForumPostExcerpt,
  getForumPostTitle
} from '@/utils/forum-post-format.js';
import { supabase } from '../../utils/supabase-client.js';
import { formatSmartTime } from '../../utils/time.js';
import { addExperience, XP_REWARDS } from '../../utils/xp.js';
import DOMPurify from '@/utils/dompurify.js';
import {
  POST_REJECTED_NOTICE_TEXT,
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTICE_TEXT,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTICE_TEXT,
  COMMENT_REJECTED_NOTIFICATION_TYPE,
  canRetryModerationNotificationBySet,
  loadRetriedNotificationIdSet,
  markRetriedNotificationId,
  persistRetriedNotificationIdSet
} from '../../utils/moderation-retry-cache.js';

// 别名方便使用
const formatDate = formatSmartTime;

// 论坛数据
const forumData = ref([]);
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
const feedMode = ref('posts');
const highlightedPostIds = ref(new Set());
const likePulsePostIds = ref(new Set());
const shareCopiedPostIds = ref(new Set());
const loadedForumImageKeys = ref(new Set());
const uiAnimationTimers = new Map();
const hotTagStats = ref([]);
const POSTS_PER_PAGE = 10;
const LIST_REPLY_PREVIEW_COUNT = 3;
const WEEKLY_CHECKIN_REWARD_POINTS = 5;
const FORUM_POST_DRAFT_PREFIX = 'boh_forum_post_draft';
const SEARCH_DEBOUNCE_MS = 350;
const FORUM_LIST_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_720,h_540';
const FORUM_TAG_OPTIONS = [
  { value: 'server', label: '#服务器' },
  { value: 'activity', label: '#活动' },
  { value: 'daily', label: '#日常' },
  { value: 'question', label: '#提问' }
];
const FORUM_TAG_MAP = Object.fromEntries(FORUM_TAG_OPTIONS.map((tag) => [tag.value, tag]));
const normalizeForumTagValue = (tag = '') => {
  const safeTag = String(tag || '').trim().toLowerCase();
  return FORUM_TAG_MAP[safeTag] ? safeTag : '';
};
const getForumTagLabel = (tag = '') => FORUM_TAG_MAP[normalizeForumTagValue(tag)]?.label || '';

// 通知/消息中心相关
const showNotifications = ref(false);
const notifications = ref([]);
const isNotificationsLoading = ref(false);
const selectedMessage = ref(null);
const retryingNotificationIds = ref({});
const retriedNotificationIdSet = ref(new Set());
const isWeeklyCheckinLoading = ref(false);
const isWeeklyCheckinSubmitting = ref(false);

const loadRetriedNotificationIds = () => {
  retriedNotificationIdSet.value = loadRetriedNotificationIdSet();
};

const markNotificationRetried = (notificationId) => {
  const marked = markRetriedNotificationId(retriedNotificationIdSet.value, notificationId);
  if (!marked) return;
  persistRetriedNotificationIdSet(retriedNotificationIdSet.value);
};

const canRetryModerationNotification = (notification) => {
  return canRetryModerationNotificationBySet(
    notification,
    retriedNotificationIdSet.value,
    POST_REJECTED_NOTIFICATION_TYPE
  );
};

const isRetryingSelectedNotification = computed(() => {
  const key = String(selectedMessage.value?.id || '');
  return Boolean(key && retryingNotificationIds.value[key]);
});

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

const newPost = ref({ title: '', content: '' });
const selectedPostTag = ref('daily');
const isSubmitting = ref(false);
const postImages = ref([]);
const isUploadingPostImage = ref(false);
const postImageUploadStatus = ref('');
const showPostImageSourceMenu = ref(false);
const isMobileComposerMode = ref(false);
const isMobileComposerOpen = ref(false);
const isMobileDraftPanelOpen = ref(false);
const savedPostDraft = ref(null);
const postImageCleanupLocks = new Set();
const cooldownNow = ref(Date.now());
const postCooldownUntil = ref(0);
const replyCooldownUntil = ref(0);
let cooldownTimer = null;
let forumFetchSeq = 0;
let searchDebounceTimer = null;
let postDraftSaveTimer = null;
let postDraftRestoreSeq = 0;
const getDraftStorageKey = () => {
  const uid = String(userInfo.id || 'guest').trim() || 'guest';
  return `${FORUM_POST_DRAFT_PREFIX}_${uid}`;
};

const readPostDraft = () => {
  try {
    const raw = localStorage.getItem(getDraftStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const title = String(parsed?.title || '');
    const content = String(parsed?.content || '');
    const tag = normalizeForumTagValue(parsed?.tag) || 'daily';
    const savedAt = Number(parsed?.savedAt || 0) || 0;
    if (!title.trim() && !content.trim()) return null;
    return { title, content, tag, savedAt };
  } catch (error) {
    console.warn('读取发帖草稿失败:', error);
    return null;
  }
};

const writeLocalPostDraft = (draft) => {
  if (!draft) {
    localStorage.removeItem(getDraftStorageKey());
    return;
  }
  localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
};

const refreshPostDraftState = () => {
  savedPostDraft.value = readPostDraft();
};

const savePostDraftToDatabase = async (draft) => {
  const userId = String(userInfo.id || '').trim();
  if (!isLoggedIn.value || !userId) return null;

  try {
    if (!draft) {
      const result = await deleteForumPostDraft(userId);
      if (!result.ok) throw result.error;
      return null;
    }
    const result = await upsertForumPostDraft(userId, draft);
    if (!result.ok) throw result.error;
    return result.data;
  } catch (error) {
    console.warn('同步发帖草稿失败:', error);
    return null;
  }
};

const schedulePostDraftDatabaseSync = (draft) => {
  if (postDraftSaveTimer) {
    clearTimeout(postDraftSaveTimer);
    postDraftSaveTimer = null;
  }
  postDraftSaveTimer = setTimeout(() => {
    postDraftSaveTimer = null;
    void savePostDraftToDatabase(draft);
  }, 900);
};

const restorePostDraft = async () => {
  const restoreSeq = ++postDraftRestoreSeq;
  const localDraft = readPostDraft();
  savedPostDraft.value = localDraft;
  if (localDraft) {
    newPost.value = { title: localDraft.title, content: localDraft.content };
    selectedPostTag.value = localDraft.tag;
  }

  const userId = String(userInfo.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  try {
    const result = await getForumPostDraft(userId);
    if (restoreSeq !== postDraftRestoreSeq) return;
    if (!result.ok) throw result.error;

    const remoteDraft = result.data;
    if (!remoteDraft) {
      if (localDraft) {
        void savePostDraftToDatabase(localDraft);
      }
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
    console.warn('恢复发帖草稿失败:', error);
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
      return;
    }
    const draft = { title, content, tag, savedAt: Date.now() };
    writeLocalPostDraft(draft);
    savedPostDraft.value = draft;
    schedulePostDraftDatabaseSync(draft);
  } catch (error) {
    console.warn('保存发帖草稿失败:', error);
  }
};

const clearPostDraft = () => {
  try {
    if (postDraftSaveTimer) {
      clearTimeout(postDraftSaveTimer);
      postDraftSaveTimer = null;
    }
    writeLocalPostDraft(null);
    savedPostDraft.value = null;
    void savePostDraftToDatabase(null);
  } catch (error) {
    console.warn('清理发帖草稿失败:', error);
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
  persistPostDraft();
  await savePostDraftToDatabase(savedPostDraft.value);
  refreshPostDraftState();
  isMobileDraftPanelOpen.value = true;
};

const closeMobileDraftPanel = () => {
  isMobileDraftPanelOpen.value = false;
};

const saveMobileDraft = async () => {
  persistPostDraft();
  const syncedDraft = await savePostDraftToDatabase(savedPostDraft.value);
  if (syncedDraft) {
    savedPostDraft.value = syncedDraft;
    writeLocalPostDraft(syncedDraft);
  }
  refreshPostDraftState();
};

const restoreMobileDraft = () => {
  restorePostDraft();
  closeMobileDraftPanel();
};

const clearMobileDraft = () => {
  clearPostDraft();
  newPost.value = { title: '', content: '' };
  selectedPostTag.value = 'daily';
  closeMobileDraftPanel();
};

const getCooldownSeconds = (until) => Math.max(0, Math.ceil((Number(until || 0) - cooldownNow.value) / 1000));

const postCooldownSeconds = computed(() => getCooldownSeconds(postCooldownUntil.value));
const replyCooldownSeconds = computed(() => getCooldownSeconds(replyCooldownUntil.value));

const replySubmitLabel = computed(() => (
  replyCooldownSeconds.value > 0 ? `${replyCooldownSeconds.value}s 后发送` : '发送'
));

const ensureCooldownTimer = () => {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(() => {
    cooldownNow.value = Date.now();
    if (postCooldownSeconds.value <= 0 && replyCooldownSeconds.value <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 250);
};

const startActionCooldown = (target, seconds) => {
  const safeSeconds = Math.max(1, Number(seconds || 0));
  if (target === 'post') {
    postCooldownUntil.value = Date.now() + safeSeconds * 1000;
  } else if (target === 'reply') {
    replyCooldownUntil.value = Date.now() + safeSeconds * 1000;
  }
  cooldownNow.value = Date.now();
  ensureCooldownTimer();
};

const applyRateLimitCooldown = (error, fallbackTarget = 'post') => {
  if (error?.code !== 'FORUM_RATE_LIMIT') return false;
  const ruleCode = String(error.details || '').trim();
  if (ruleCode === 'POST_COOLDOWN') {
    startActionCooldown('post', 30);
  } else if (ruleCode === 'IMAGE_POST_COOLDOWN') {
    startActionCooldown('post', 180);
  } else if (ruleCode === 'IMAGE_10M_LIMIT') {
    startActionCooldown('post', 120);
  } else if (ruleCode === 'COMMENT_COOLDOWN') {
    startActionCooldown('reply', 10);
  } else if (ruleCode.startsWith('POST_')) {
    startActionCooldown('post', 60);
  } else if (ruleCode.startsWith('COMMENT_')) {
    startActionCooldown('reply', 30);
  } else {
    startActionCooldown(fallbackTarget, fallbackTarget === 'reply' ? 10 : 30);
  }
  return true;
};

const ensureCanAddPostImage = () => {
  if (postImages.value.length >= 3) {
    showModal('warning', '图片已满', '每个帖子最多发布 3 张图片');
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

const handlePostImageSelection = async (payload) => {
  const files = Array.from(payload?.files || payload?.event?.target?.files || payload?.target?.files || []);
  if (!files.length) return;

  const remaining = Math.max(0, 3 - postImages.value.length);
  if (remaining <= 0) {
    showModal('warning', '图片已满', '每个帖子最多发布 3 张图片');
    return;
  }

  const selectedFiles = files.slice(0, remaining);
  if (files.length > remaining) {
    showModal('warning', '图片数量已限制', '每个帖子最多发布 3 张图片，多余图片未处理');
  }

  isUploadingPostImage.value = true;
  try {
    for (const file of selectedFiles) {
      postImageUploadStatus.value = '正在进行图片安全检测...';
      const result = await uploadForumImage(file);
      if (!result.ok) {
        throw result.error || new Error('图片上传失败');
      }
      postImages.value = [...postImages.value, {
        ...result.data,
        sortOrder: postImages.value.length
      }];
      postImageUploadStatus.value = '图片已通过检测并上传';
    }
  } catch (error) {
    console.error('论坛图片处理失败:', error);
    showModal('error', '图片无法发布', error?.message || '图片上传或安全检测失败');
  } finally {
    isUploadingPostImage.value = false;
    setTimeout(() => {
      if (!isUploadingPostImage.value) postImageUploadStatus.value = '';
    }, 1800);
  }
};

const removePostImage = async (image, index) => {
  const nextImages = postImages.value.filter((_, itemIndex) => itemIndex !== index);
  postImages.value = nextImages.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
  await cleanupUploadedForumImage(image, { silent: false });
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
  postImages.value = [];
  postImageUploadStatus.value = '';
  if (cleanup && images.length) {
    void Promise.allSettled(
      images.map((image) => cleanupUploadedForumImage(image, { silent }))
    );
  }
};

const discardDraftPostImages = async ({ silent = true } = {}) => {
  await cleanupDraftPostImages({ silent });
  clearPostImages({ cleanup: false });
};

// 移动端判断
const isMobile = ref(window.innerWidth <= 768);
const updateMobileStatus = () => {
  isMobile.value = window.innerWidth <= 768;
  isMobileComposerMode.value = window.innerWidth <= 768 && window.innerHeight >= window.innerWidth;
  if (!isMobileComposerMode.value) {
    isMobileComposerOpen.value = false;
  }
};

updateMobileStatus();

const openMobileComposer = () => {
  feedMode.value = 'posts';
  closePostImageSourceMenu();
  isMobileComposerOpen.value = true;
};

const closeMobileComposer = () => {
  closePostImageSourceMenu();
  closeMobileDraftPanel();
  isMobileComposerOpen.value = false;
};

onMounted(() => {
  loadRetriedNotificationIds();
  restorePostDraft();
  window.addEventListener('resize', updateMobileStatus);
  window.addEventListener('scroll', handleScroll);
  document.addEventListener('click', closePostImageSourceMenu);
  fetchForumData();
  loadHotTagStats();
  if (isLoggedIn.value) {
    loadWeeklyCheckinStatus();
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updateMobileStatus);
  window.removeEventListener('scroll', handleScroll);
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
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  uiAnimationTimers.forEach((timer) => clearTimeout(timer));
  uiAnimationTimers.clear();
});

watch(isMobileComposerOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

// 监听弹窗状态，控制 body 滚动
watch(selectedMessage, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

watch(isLoggedIn, (loggedIn) => {
  if (postDraftSaveTimer) {
    clearTimeout(postDraftSaveTimer);
    postDraftSaveTimer = null;
  }
  if (loggedIn) {
    loadWeeklyCheckinStatus();
    restorePostDraft();
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

watch(
  () => [newPost.value.title, newPost.value.content, selectedPostTag.value],
  () => {
    persistPostDraft();
  }
);

// 加载通知
const loadNotifications = async () => {
  if (!isLoggedIn.value) return;
  isNotificationsLoading.value = true;
  try {
    const { data, error } = await getUserNotifications(userInfo.id, { limit: 100 });
    if (!error) {
      notifications.value = data;
      const { count } = await getUnreadNotificationCount(userInfo.id);
      await setUnreadCount(count);
    }
  } catch (error) {
    console.error('加载通知失败:', error);
  } finally {
    isNotificationsLoading.value = false;
  }
};

const toggleNotifications = () => {
  showNotifications.value = !showNotifications.value;
  if (showNotifications.value) {
    loadNotifications();
  }
};

// 显示详情并标记已读
const showDetail = async (msg) => {
  showNotifications.value = false;
  selectedMessage.value = msg;

  if (msg.status === 'unread') {
    try {
      await markNotificationAsRead(msg.id);
      msg.status = 'read';
      // 从数据库刷新最新的未读计数
      await refreshUnreadCount();
      // 触发 localStorage 事件，通知其他组件刷新
      localStorage.setItem('boh_unread_refresh', Date.now().toString());
      setTimeout(() => {
        localStorage.removeItem('boh_unread_refresh');
      }, 100);
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  }
};

const handleNotificationItemClick = (notification, event) => {
  const target = event?.target;
  if (target?.closest?.('.clickable-username-inline')) {
    return;
  }
  showDetail(notification);
};

const closeDetail = () => {
  selectedMessage.value = null;
};

const canOpenNotificationSource = (notification) => {
  const postId = notification?.post?.id || notification?.post_id;
  return Boolean(postId);
};

const goToNotificationSource = () => {
  if (!selectedMessage.value) return;
  const postId = selectedMessage.value.post?.id || selectedMessage.value.post_id;
  if (!postId) return;
  const commentId = selectedMessage.value.comment?.id || selectedMessage.value.comment_id;
  selectedMessage.value = null;
  router.push({
    name: 'PostDetail',
    params: { id: postId },
    query: commentId ? { comment: commentId } : undefined
  });
};

const retryRejectedPostFromNotification = async () => {
  if (!selectedMessage.value || !canRetryModerationNotification(selectedMessage.value)) {
    return;
  }

  const notificationId = String(selectedMessage.value.id || '');
  const postId = selectedMessage.value.post?.id || selectedMessage.value.post_id;
  if (!notificationId || !postId) return;

  retryingNotificationIds.value[notificationId] = true;
  try {
    const { ok, resultStatus, error } = await retryPostModeration(postId, userInfo.id);
    if (!ok) {
      showModal('error', '重试失败', error?.message || '请稍后重试');
      return;
    }

    markNotificationRetried(notificationId);
    if (resultStatus === 'approved') {
      showModal('success', '重试通过', '帖子已恢复展示');
      fetchForumData();
    } else {
      showModal('warning', '仍未通过', '本次重试后仍未通过审查，如有疑问请联系客服');
    }
  } catch (error) {
    console.error('帖子复审重试失败:', error);
    showModal('error', '重试失败', '请稍后重试');
  } finally {
    retryingNotificationIds.value[notificationId] = false;
  }
};

const handleMarkAllAsRead = async () => {
  if (unreadCount.value === 0) return;
  try {
    await markAllNotificationsAsRead(userInfo.id);
    notifications.value.forEach(n => n.status = 'read');
    // 从数据库刷新最新的未读计数
    await refreshUnreadCount();
    // 触发 localStorage 事件，通知其他组件刷新
    localStorage.setItem('boh_unread_refresh', Date.now().toString());
    setTimeout(() => {
      localStorage.removeItem('boh_unread_refresh');
    }, 100);
  } catch (error) {
    console.error('标记全部已读失败:', error);
  }
};

const getNotificationIcon = (type) => {
  const icons = {
    'like': '❤️',
    'comment': '💬',
    'follow': '👤',
    'impression': '✨',
    [POST_REJECTED_NOTIFICATION_TYPE]: '⚠️',
    [COMMENT_REJECTED_NOTIFICATION_TYPE]: '⚠️',
    'system': '🔔'
  };
  return icons[type] || '✉️';
};

const getNotificationText = (n) => {
  const rawSenderName = String(n.sender?.username || '').trim();
  const senderName = rawSenderName || '有人';
  const escapedSenderName = escapeHtml(senderName);
  const senderProfileUrl = `#/profile/${encodeURIComponent(senderName)}`;
  const senderLink = rawSenderName
    ? `<a class="clickable-username-inline" href="${senderProfileUrl}">${escapedSenderName}</a>`
    : escapedSenderName;
  const safeCommentSnippet = escapeHtml(String(n.comment?.content || '').substring(0, 20));

  let rawHtml = '';
  switch (n.type) {
    case 'like':
      rawHtml = `<b>${senderLink}</b> 点赞了你的帖子`;
      break;
    case 'comment':
      rawHtml = `<b>${senderLink}</b> 评论了你的帖子: "${safeCommentSnippet}..."`;
      break;
    case 'impression':
      rawHtml = `<b>${senderLink}</b> 给您写下了一条新印象`;
      break;
    case POST_REJECTED_NOTIFICATION_TYPE:
      rawHtml = '您的帖子暂未通过审查，可点击查看详情并重试一次';
      break;
    case COMMENT_REJECTED_NOTIFICATION_TYPE:
      rawHtml = '您的评论暂未通过审查，已被系统自动拦截';
      break;
    default:
      rawHtml = `来自 <b>${senderLink}</b> 的新动态`;
      break;
  }

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['a', 'b'],
    ALLOWED_ATTR: ['class', 'href']
  });
};

// 获取通知类型图标
const _getTypeIcon = (type) => {
  const icons = {
    'like': '❤️',
    'comment': '💬',
    'follow': '👤',
    'impression': '✨',
    [POST_REPORT_LIMITED_NOTIFICATION_TYPE]: '⚠️',
    'system': '🔔',
    'gift': '🎁'
  };
  return icons[type] || '✉️';
};

// 获取通知类型标签
const getNotificationTypeLabel = (type) => {
  const labels = {
    'like': '点赞通知',
    'comment': '评论通知',
    'follow': '关注通知',
    'impression': '印象通知',
    [POST_REJECTED_NOTIFICATION_TYPE]: '发帖审查',
    [POST_REPORT_LIMITED_NOTIFICATION_TYPE]: '举报处理',
    [COMMENT_REJECTED_NOTIFICATION_TYPE]: '评论审查',
    'system': '系统通知',
    'gift': '礼物通知'
  };
  return labels[type] || '消息';
};

// 获取通知标题
const getNotificationTitle = (notification) => {
  switch (notification.type) {
    case 'like':
      return `${notification.sender?.username || '有人'} 点赞了你的内容`;
    case 'comment':
      return `${notification.sender?.username || '有人'} 评论了你的内容`;
    case 'follow':
      return `${notification.sender?.username || '有人'} 关注了你`;
    case 'impression':
      return `${notification.sender?.username || '有人'} 对你发表了印象`;
    case POST_REJECTED_NOTIFICATION_TYPE:
      return '发帖审查未通过';
    case POST_REPORT_LIMITED_NOTIFICATION_TYPE:
      return '帖子已设为仅自己可见';
    case COMMENT_REJECTED_NOTIFICATION_TYPE:
      return '评论审查未通过';
    case 'system':
      return '系统通知';
    case 'gift':
      return '礼物进度更新';
    default:
      return '新消息';
  }
};

// 获取通知预览
const _getNotificationPreview = (notification) => {
  if (notification.type === 'impression') {
    return '查看新的印象评价';
  }
  if (notification.type === 'gift') {
    return notification.content || '查看礼物最新进度';
  }
  if (notification.type === 'system') {
    return notification.content || '系统消息';
  }
  if (notification.type === POST_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || POST_REJECTED_NOTICE_TEXT;
  }
  if (notification.type === POST_REPORT_LIMITED_NOTIFICATION_TYPE) {
    return notification.content || POST_REPORT_LIMITED_NOTICE_TEXT;
  }
  if (notification.type === COMMENT_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || COMMENT_REJECTED_NOTICE_TEXT;
  }
  if (notification.comment?.content) {
    return notification.comment.content.substring(0, 50) + (notification.comment.content.length > 50 ? '...' : '');
  }
  if (notification.post) {
    return getForumPostExcerpt(notification.post, 50);
  }
  return '查看详情';
};

// 获取通知完整内容
const getNotificationContent = (notification) => {
  if (notification.type === 'impression') {
    return '有伙伴为您撰写了新的社区印象，快去个人中心查看吧！';
  }
  if (notification.type === 'gift') {
    return notification.content || '您的礼物进度有更新，请前往礼物中心查看。';
  }
  if (notification.type === 'system') {
    return notification.content || '系统消息';
  }
  if (notification.type === POST_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || POST_REJECTED_NOTICE_TEXT;
  }
  if (notification.type === POST_REPORT_LIMITED_NOTIFICATION_TYPE) {
    return notification.content || POST_REPORT_LIMITED_NOTICE_TEXT;
  }
  if (notification.type === COMMENT_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || COMMENT_REJECTED_NOTICE_TEXT;
  }
  if (notification.comment?.content) {
    return notification.comment.content;
  }
  if (notification.type === 'like' && notification.post) {
    const title = getForumPostTitle(notification.post);
    return title && title !== '无标题' ? `点赞了你的帖子《${title}》` : '点赞了你的帖子';
  }
  return '您收到了一条新通知';
};

const getNotificationSourceLabel = (notification) => {
  if (notification?.type === 'comment') return '原帖内容：';
  return '原文内容：';
};

const getNotificationSourceText = (notification) => {
  if (notification?.post) {
    return getForumPostBody(notification.post) || getForumPostTitle(notification.post);
  }
  return String(notification?.comment?.content || '').trim();
};

// 帖子内容折叠相关
const postExpandStates = ref(new Set());
const CONTENT_LIMIT = 200;

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

const isContentLong = (content) => String(content || '').length > CONTENT_LIMIT;

const getDisplayContent = (post) => {
  const bodyText = String(post?.displayBody || extractPostBody(post) || '').trim();
  if (!isContentLong(bodyText) || postExpandStates.value.has(post?.id)) {
    return bodyText;
  }
  return bodyText.substring(0, CONTENT_LIMIT) + '...';
};

const getPostImages = (post) => {
  const images = Array.isArray(post?.images)
    ? post.images.filter((image) => image?.url)
    : [];
  if (images.length) return images;

  const coverUrl = String(post?.cover_image_url || post?.coverImageUrl || '').trim();
  if (!coverUrl) return [];
  return [{
    id: `${String(post?.id || 'post').trim() || 'post'}-cover`,
    url: getCloudinaryTransformedUrl(coverUrl, FORUM_LIST_IMAGE_TRANSFORM),
    width: Number(post?.cover_image_width || post?.coverImageWidth || 0),
    height: Number(post?.cover_image_height || post?.coverImageHeight || 0),
    sortOrder: 0
  }];
};

const prepareForumPostForDisplay = (post, index = 0) => {
  const preparedPost = { ...post };
  const images = getPostImages(preparedPost).map((image, imageIndex) => ({
    ...image,
    loading: imageIndex === 0 && index < 2 ? 'eager' : 'lazy'
  }));
  const imageCount = Math.max(Number(preparedPost.image_count || 0), images.length);

  preparedPost.displayTitle = extractPostTitle(preparedPost);
  preparedPost.displayBody = extractPostBody(preparedPost);
  preparedPost.tag = normalizeForumTagValue(preparedPost.tag);
  preparedPost.tagLabel = getForumTagLabel(preparedPost.tag);
  preparedPost.previewImages = images;
  preparedPost.hasImages = images.length > 0;
  preparedPost.imageCount = imageCount;
  preparedPost.hasMultipleImages = imageCount > 1;
  preparedPost.imageLoading = index < 2 ? 'eager' : 'lazy';
  return preparedPost;
};

const prepareForumPosts = (posts = [], startIndex = 0) => (
  Array.isArray(posts) ? posts.map((post, index) => prepareForumPostForDisplay(post, startIndex + index)) : []
);

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderSearchExcerpt = (excerpt) => {
  const escaped = escapeHtml(excerpt);
  const withMarks = escaped.replace(/\[\[([\s\S]*?)\]\]/g, '<mark>$1</mark>');
  return DOMPurify.sanitize(withMarks, {
    ALLOWED_TAGS: ['mark'],
    ALLOWED_ATTR: []
  });
};

const _togglePostExpand = (postId) => {
  if (postExpandStates.value.has(postId)) {
    postExpandStates.value.delete(postId);
  } else {
    postExpandStates.value.add(postId);
  }
};

const getWeeklyCheckinCycleProgress = (status) => {
  const cycleSize = Math.max(1, Number(status?.cycleSize || 4));
  const explicitProgress = Number(status?.cycleProgress);
  if (Number.isFinite(explicitProgress)) {
    return Math.min(Math.max(0, explicitProgress), cycleSize - 1);
  }

  const normalizedStreak = Math.max(0, Number(status?.currentStreak || status?.streakTotal || 0));
  return normalizedStreak % cycleSize;
};

const weeklyCheckinCycleProgress = computed(() => (
  getWeeklyCheckinCycleProgress(weeklyCheckinStatus.value)
));

const weeklyCheckinProgressText = computed(() => (
  `连续 ${weeklyCheckinCycleProgress.value} / ${weeklyCheckinStatus.value.cycleSize || 4} 周`
));

const weeklyCheckinProgressPercent = computed(() => {
  const cycleSize = Math.max(1, Number(weeklyCheckinStatus.value.cycleSize || 4));
  return Math.round((weeklyCheckinCycleProgress.value / cycleSize) * 100);
});

const weeklyCheckinHintText = computed(() => {
  if (!isLoggedIn.value) {
    return `登录后每周可签到一次，连续 4 周可获得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分`;
  }

  const cycleSize = Math.max(1, Number(weeklyCheckinStatus.value.cycleSize || 4));
  const cycleProgress = getWeeklyCheckinCycleProgress(weeklyCheckinStatus.value);
  const nextReward = Math.max(1, Number(weeklyCheckinStatus.value.nextRewardIn || cycleSize));
  const weeksAfterThisWeek = Math.max(0, nextReward - 1);

  if (weeklyCheckinStatus.value.hasSignedThisWeek) {
    if (weeklyCheckinStatus.value.rewardCompletedThisWeek) {
      return `本周已签到，已达成 ${cycleSize} 周连签奖励，下一轮进度 ${cycleProgress} / ${cycleSize}`;
    }
    return `本周已签到，当前 ${cycleProgress} / ${cycleSize}，再连续 ${nextReward} 周可获得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分`;
  }

  if (cycleProgress === 0) {
    return `本周可签到一次，连续签到 ${cycleSize} 周可获得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分`;
  }

  if (weeksAfterThisWeek === 0) {
    return `本周完成签到即可获得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分奖励`;
  }

  return `本周还未签到，完成本周签到后再连续 ${weeksAfterThisWeek} 周可获得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分`;
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
      console.error('加载周签到状态失败:', error);
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
    console.error('加载周签到状态异常:', error);
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

    if (Number(data.pointsAwarded || 0) > 0) {
      showModal('success', '签到成功', `已完成 ${data.cycleSize || 4} 周连签，获得 ${data.pointsAwarded} 积分奖励！下一轮进度 ${data.cycleProgress || 0} / ${data.cycleSize || 4}`);
      emitProfileSync({
        userId: userInfo.id,
        username: userInfo.username,
        reason: 'weekly_checkin_reward'
      });
      return;
    }

    showModal(
      'success',
      '签到成功',
      `本周签到完成，当前本轮连续 ${getWeeklyCheckinCycleProgress(data)} / ${data.cycleSize || 4} 周，再连续 ${data.nextRewardIn} 周可得 ${WEEKLY_CHECKIN_REWARD_POINTS} 积分`
    );
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'weekly_checkin'
    });
  } catch (error) {
    console.error('周签到失败:', error);
    showModal('error', '签到失败', error?.message || '请稍后重试');
  } finally {
    isWeeklyCheckinSubmitting.value = false;
  }
};

const fetchForumData = async (isLoadMore = false) => {
  const requestSeq = ++forumFetchSeq;
  if (isLoadMore) {
    isLoadingMore.value = true;
  } else {
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
    const pagination = {
      page: pageToLoad,
      pageSize: POSTS_PER_PAGE,
      sortMode: sortMode.value,
      searchQuery: searchKeyword.value.trim(),
      tagFilter: selectedTagFilter.value,
      cursorMode: 'keyset',
      cursor: isLoadMore ? nextPageCursor.value : '',
      // 旧版降级查询会使用 overfetch 判断 hasMore；RPC 路径会忽略该值避免翻页错位。
      limit: POSTS_PER_PAGE + 1,
      includeUnapprovedForAuthor: viewMode.value === 'my'
    };

    if (viewMode.value === 'my' && isLoggedIn.value) {
      dataResult = await getUserPosts(userInfo.id, currentUserId, pagination);
    } else {
      dataResult = await getPosts(currentUserId, pagination);
    }

    if (requestSeq !== forumFetchSeq) return;

    if (!dataResult.error && dataResult.data) {
      const safeRows = Array.isArray(dataResult.data) ? dataResult.data : [];
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
      } else {
        forumData.value = prepareForumPosts(safeRows);
        currentPage.value = 1;
      }
      nextPageCursor.value = hasNextCursor;
      forumLoadError.value = '';
      hasMoreData.value = hasNextPage;
    } else {
      const errorMessage = String(dataResult?.error?.message || '论坛数据加载失败，请稍后重试');
      forumLoadError.value = errorMessage;
      console.error('加载论坛数据返回错误:', dataResult?.error || dataResult);
      hasMoreData.value = false;
    }

    if (!isLoadMore) {
      // 未读数异步补充，避免拖慢帖子首屏渲染
      void (async () => {
        try {
          if (!isLoggedIn.value || !userInfo.id) return;
          const unreadRes = await getUnreadNotificationCount(userInfo.id);
          if (requestSeq !== forumFetchSeq) return;
          await setUnreadCount(unreadRes?.count || 0);
        } catch (metaErr) {
          console.warn('补充未读通知数失败:', metaErr);
        }
      })();
    }
  } catch (err) {
    if (requestSeq !== forumFetchSeq) return;
    console.error('加载论坛数据失败:', err);
    forumLoadError.value = String(err?.message || '论坛数据加载失败，请稍后重试');
    hasMoreData.value = false;
  } finally {
    if (requestSeq === forumFetchSeq) {
      isLoading.value = false;
      isLoadingMore.value = false;
    }
  }
};

const latestNews = computed(() => getAllNews().slice(0, 3));

const normalizedHotTagStats = computed(() => {
  const countMap = new Map();
  for (const row of hotTagStats.value || []) {
    const tag = normalizeForumTagValue(row?.tag);
    if (!tag) continue;
    countMap.set(tag, Number(row?.post_count ?? row?.count ?? 0) || 0);
  }
  return FORUM_TAG_OPTIONS
    .map((tag) => ({
      ...tag,
      count: countMap.get(tag.value) || 0
    }))
    .sort((a, b) => b.count - a.count);
});

const loadHotTagStats = async () => {
  try {
    const result = await getForumTagStats();
    if (!result.error && Array.isArray(result.data)) {
      hotTagStats.value = result.data;
    }
  } catch (error) {
    console.warn('加载热门标签失败:', error);
  }
};

// formatDate 已由 formatSmartTime 提供

const modalState = ref({ show: false, type: 'success', title: '', message: '' });

const showModal = (type, title, message) => {
  modalState.value = { show: true, type, title, message };
};

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

const hasUiMarker = (markerRef, key) => markerRef.value.has(String(key || '').trim());

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

const handlePost = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }

  if (!newPost.value.title.trim() || !newPost.value.content.trim()) {
    showModal('warning', '提示', '请填写标题和内容');
    return;
  }
  if (postImages.value.length > 3) {
    showModal('warning', '图片超限', '每个帖子最多发布 3 张图片');
    return;
  }
  if (postCooldownSeconds.value > 0) {
    showModal('warning', '发布太频繁', `请 ${postCooldownSeconds.value} 秒后再试`);
    return;
  }

  isSubmitting.value = true;
  try {
    const postTitle = newPost.value.title;
    const postBody = newPost.value.content;
    const postStatus = 'approved';
    const result = await createPost(
      postBody,
      userInfo.id,
      userInfo.username,
      postStatus,
      postTitle,
      postImages.value,
      selectedPostTag.value
    );
    if (result.error) throw result.error;
    const createdPostId = String(result.data?.[0]?.id || '').trim();

    newPost.value.title = '';
    newPost.value.content = '';
    selectedPostTag.value = 'daily';
    clearPostDraft();
    clearPostImages({ cleanup: false });
    closeMobileComposer();
    await nextTick();
    showModal(
      'success',
      '发布成功',
      '编辑器已关闭，帖子已加入社区动态'
    );

    // 增加发帖经验
    addExperience(supabase, userInfo.id, XP_REWARDS.POST);

    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'post_created'
    });

    await fetchForumData();
    loadHotTagStats();
    if (createdPostId) {
      addUiMarker(highlightedPostIds, createdPostId, 2600, 'new-post');
    }
  } catch (error) {
    console.error('发帖失败', error);
    applyRateLimitCooldown(error, 'post');
    await discardDraftPostImages({ silent: true });
    showModal('error', '发布失败', error?.message || '请稍后重试');
  } finally {
    isSubmitting.value = false;
  }
};

const expandedPostIds = ref(new Set());
const activeReplyTarget = ref(null); // { postId, parentId, username }
const replyContent = ref('');
const isReplySubmitting = ref(false);

const buildReplyDraft = () => {
  return '';
};

const toggleReplyInput = (postId, parentId = null, username = null, quotedContent = '') => {
  if (activeReplyTarget.value && activeReplyTarget.value.postId === postId && activeReplyTarget.value.parentId === parentId) {
    activeReplyTarget.value = null;
    replyContent.value = '';
  } else {
    activeReplyTarget.value = { postId, parentId, username, quotedContent };
    replyContent.value = buildReplyDraft(username, quotedContent);
  }
};

const loadPostReplyPreview = async (post) => {
  if (!post?.id) return;
  const currentUserId = isLoggedIn.value ? userInfo.id : null;
  let { data, hasMore } = await getComments(post.id, currentUserId, {
    topLevelOnly: true,
    page: 1,
    pageSize: LIST_REPLY_PREVIEW_COUNT,
    order: 'desc'
  });

  if ((!Array.isArray(data) || data.length === 0) && Number(post.comment_count || 0) > 0) {
    const fallback = await getComments(post.id, currentUserId, {
      page: 1,
      pageSize: LIST_REPLY_PREVIEW_COUNT,
      order: 'desc'
    });
    data = fallback.data;
    hasMore = fallback.hasMore;
  }

  post.replies = Array.isArray(data) ? data : [];
  post.replies_has_more = Boolean(hasMore);
};

const refreshPostEngagementStats = async (post) => {
  if (!post?.id) return;
  const statsRes = await getPostEngagementStats(post.id);
  if (!statsRes.ok) return;
  post.comment_count = Number(statsRes.data?.commentCount || 0);
  post.like_count = Number(statsRes.data?.likeCount || 0);
};

const toggleRepliesList = async (post) => {
  if (expandedPostIds.value.has(post.id)) {
    expandedPostIds.value.delete(post.id);
  } else {
    await loadPostReplyPreview(post);
    expandedPostIds.value.add(post.id);
  }
};

const shouldShowMoreRepliesLink = (post) => {
  const previewCount = Array.isArray(post?.replies) ? post.replies.length : 0;
  return Boolean(post?.replies_has_more || Number(post?.comment_count || 0) > previewCount);
};

const isLikeSubmitting = ref({});

const submitReply = async (post) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
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

    const { error } = await createComment(
      post.id,
      rawReplyContent,
      userInfo.id,
      userInfo.username,
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
    showModal(
      'success',
      '回复成功',
      '你的声音已被听到'
    );

    addExperience(supabase, userInfo.id, XP_REWARDS.REPLY);
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'comment_created'
    });
  } catch (error) {
    console.error('回复失败', error);
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
    console.error('无效的帖子数据');
    return;
  }
  if (isLikeSubmitting.value[post.id]) return;

  isLikeSubmitting.value[post.id] = true;
  try {
    const { action, data, error } = await toggleLike(post.id, userInfo.id);

    if (error) {
      console.error('点赞失败:', error);
      return;
    }

    if (action === 'liked') {
      post.like_count = Number(data?.likeCount ?? Number(post.like_count || 0) + 1);
      post.isLiked = true;
      addExperience(supabase, userInfo.id, XP_REWARDS.LIKE);
    } else if (action === 'unliked') {
      post.like_count = Number.isFinite(Number(data?.likeCount))
        ? Number(data.likeCount)
        : Math.max(0, Number(post.like_count || 0) - 1);
      post.isLiked = false;
    }
    addUiMarker(likePulsePostIds, post.id, 620, 'like-pulse');

    emitProfileSync({
      userId: post.author_id,
      username: post.author_username,
      reason: action === 'liked' ? 'post_liked' : 'post_unliked'
    });
  } catch (error) {
    console.error('点赞异常', error);
  } finally {
    setTimeout(() => {
      isLikeSubmitting.value[post.id] = false;
    }, 300);
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

const setTagFilter = (tag = '') => {
  const normalizedTag = normalizeForumTagValue(tag);
  if (selectedTagFilter.value === normalizedTag) return;
  selectedTagFilter.value = normalizedTag;
  feedMode.value = 'posts';
  fetchForumData();
};

const handleDeleteComment = async (comment, post) => {
  if (!confirm('确定删除评论吗？')) return;
  const { success } = await deleteComment(comment.id, userInfo.id, userInfo.role);
  if (success) {
    emitProfileSync({
      userId: comment.author_id,
      username: comment.author_username,
      reason: 'comment_deleted'
    });
    await loadPostReplyPreview(post);
    await refreshPostEngagementStats(post);
  }
};

const sharePost = async (post) => {
  const url = `${window.location.origin}${window.location.pathname}#/forum/post/${post.id}`;
  try {
    await navigator.clipboard.writeText(`来看看这个帖子：${url}`);
    addUiMarker(shareCopiedPostIds, post.id, 1500, 'share-copied');
  } catch (error) {
    console.error('复制分享链接失败:', error);
    showModal('error', '复制失败', '当前环境不支持自动复制，请手动复制地址栏链接');
  }
};

const showMobileNews = ref(false);
const toggleMobileNews = () => {
  showMobileNews.value = !showMobileNews.value;
};

// 懒加载滚动处理
let scrollTimeout = null;

const handleScroll = () => {
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop || window.scrollY || 0;
  const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
  const clientHeight = document.documentElement.clientHeight || window.innerHeight || 0;

  emit('immersive-scroll', {
    scrollTop,
    scrollHeight,
    clientHeight,
    feedMode: feedMode.value
  });

  if (feedMode.value !== 'posts') return;
  if (isLoading.value || isLoadingMore.value || !hasMoreData.value) return;

  // 清除之前的定时器
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  // 设置新的定时器，减少到100ms防抖
  scrollTimeout = setTimeout(() => {
    // 当滚动到距离底部800px时加载更多
    if (scrollTop + clientHeight >= scrollHeight - 800) {
      fetchForumData(true);
    }
  }, 100);
};

const handleSearch = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  const nextKeyword = String(searchQuery.value || '').trim();
  if (nextKeyword === searchKeyword.value) return;
  searchKeyword.value = nextKeyword;
  feedMode.value = 'posts';
  fetchForumData();
};

watch(searchQuery, (nextVal) => {
  const nextKeyword = String(nextVal || '').trim();
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    if (nextKeyword === searchKeyword.value) return;
    searchKeyword.value = nextKeyword;
    feedMode.value = 'posts';
    fetchForumData();
  }, SEARCH_DEBOUNCE_MS);
});

const openPostDetail = (postId) => {
  const query = props.embedded
    ? { from: 'user-space', tab: 'posts' }
    : undefined;

  router.push({
    name: 'PostDetail',
    params: { id: postId },
    query
  });
};
</script>

<template>
  <div class="forum-page" :class="{ 'embedded-mode': embedded }" data-theme>
    <UnifiedNavbar v-if="showNavbar" />

    <div class="forum-container" :class="{ 'no-header': !showHeader }">
      <!-- 头部区域 -->
      <header v-if="showHeader" class="forum-header fade-in-up">
        <div class="header-content">
          <span class="header-tag">BOH COMMUNITY</span>
          <h1 class="header-title">社区论坛</h1>
          <p class="header-subtitle">分享你的创意，连接方块世界。</p>
        </div>

        <!-- 浮动操作按钮：消息通知 -->
        <div v-if="isLoggedIn" class="floating-actions-container fade-in-up" style="animation-delay: 0.1s;">
          <button class="notification-fab" :class="{ 'has-unread': unreadCount > 0 }" @click="toggleNotifications"
            title="消息通知">
            <span class="fab-icon">🔔</span>
            <span v-if="unreadCount > 0" class="fab-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
          </button>

          <!-- 通知面板 -->
          <Teleport to="body">
            <div v-if="showNotifications" class="notification-drawer-overlay" @click="showNotifications = false"></div>
            <transition name="drawer-slide">
              <div v-if="showNotifications" class="notification-drawer glass-panel"
                :class="{ 'mobile-drawer': isMobile }">
                <div class="drawer-header">
                  <div class="header-main">
                    <h3 class="drawer-title">消息通知</h3>
                    <span v-if="unreadCount > 0" class="unread-badge-inline">{{ unreadCount }} 条未读</span>
                  </div>
                  <div class="drawer-actions">
                    <button v-if="unreadCount > 0" class="mark-all-btn-v2" @click="handleMarkAllAsRead">全部已读</button>
                    <button class="close-drawer-btn" @click="showNotifications = false">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="drawer-list-container custom-scrollbar">
                  <div v-if="isNotificationsLoading" class="panel-loading-v2">
                    <div class="loading-spinner-v2"></div>
                    <p>同步通知中...</p>
                  </div>
                  <div v-else-if="notifications.length === 0" class="panel-empty">
                    <span class="empty-icon">🏜️</span>
                    <p>暂无新消息，去社区逛逛吧</p>
                  </div>
                  <div v-else class="notification-items-group">
                    <div v-for="n in notifications" :key="n.id" class="notification-item-v2"
                      :class="{ 'is-unread': n.status === 'unread' }" @click="handleNotificationItemClick(n, $event)">
                      <div class="n-icon-v2">{{ getNotificationIcon(n.type) }}</div>
                      <div class="n-content-v2">
                        <p class="n-text-v2" v-html="getNotificationText(n)"></p>
                        <span class="n-date-v2">{{ formatDate(n.created_at) }}</span>
                      </div>
                      <div v-if="n.status === 'unread'" class="n-unread-dot"></div>
                    </div>
                  </div>
                </div>
              </div>
            </transition>
          </Teleport>
        </div>
      </header>

      <!-- 移动端 NewsRoom 切换按钮 -->
      <button class="mobile-news-toggle-btn fade-in-up" @click="toggleMobileNews">
        <span>{{ showMobileNews ? '隐藏 News Room' : '查看 News Room' }}</span>
        <span class="toggle-icon">{{ showMobileNews ? '×' : '+' }}</span>
      </button>

      <!-- 主要内容区 -->
      <main class="forum-main-grid">

        <!-- 左侧：发帖和列表 -->
        <div class="forum-left-column">
          <PostComposer v-if="!isMobileComposerMode" v-model:new-post="newPost"
            v-model:selected-post-tag="selectedPostTag" :is-logged-in="isLoggedIn" :user-info="userInfo"
            :post-images="postImages" :is-submitting="isSubmitting" :is-uploading-post-image="isUploadingPostImage"
            :post-image-upload-status="postImageUploadStatus" :post-cooldown-seconds="postCooldownSeconds"
            :weekly-checkin-status="weeklyCheckinStatus" :weekly-checkin-progress-text="weeklyCheckinProgressText"
            :weekly-checkin-progress-percent="weeklyCheckinProgressPercent"
            :weekly-checkin-hint-text="weeklyCheckinHintText"
            :is-weekly-checkin-loading="isWeeklyCheckinLoading"
            :is-weekly-checkin-submitting="isWeeklyCheckinSubmitting" :forum-tag-options="FORUM_TAG_OPTIONS"
            :show-post-image-source-menu="showPostImageSourceMenu" @submit="handlePost"
            @login="showLoginModal = true" @toggle-image-source-menu="togglePostImageSourceMenu"
            @request-image-picker="openPostImagePicker" @request-camera="openPostCamera"
            @image-selection="handlePostImageSelection" @remove-image="removePostImage"
            @clear-images="clearPostImages" @weekly-checkin="handleWeeklyCheckin"
            @open-draft="openMobileDraftPanel" />

          <section v-if="isLoggedIn" class="weekly-checkin-standalone-section fade-in-up"
            style="animation-delay: 0.15s;">
            <div class="weekly-checkin-mobile-card">
              <div class="editor-tools weekly-checkin-panel">
                <div v-if="isWeeklyCheckinLoading" class="weekly-checkin-status weekly-checkin-status-skeleton"
                  aria-label="正在加载周签到状态">
                  <span class="checkin-skeleton-title skeleton-item"></span>
                  <span class="checkin-skeleton-progress skeleton-item"></span>
                  <span class="checkin-skeleton-line skeleton-item"></span>
                </div>
                <div v-else class="weekly-checkin-status">
                  <span class="tool-hint">周签到：{{ weeklyCheckinProgressText }}</span>
                  <div class="checkin-progress-track" :class="{ signed: weeklyCheckinStatus.hasSignedThisWeek }"
                    aria-hidden="true">
                    <div class="checkin-progress-fill" :style="{ width: `${weeklyCheckinProgressPercent}%` }"></div>
                  </div>
                  <span class="checkin-hint">{{ weeklyCheckinHintText }}</span>
                </div>
                <button class="weekly-checkin-btn" :class="{ 'is-done': weeklyCheckinStatus.hasSignedThisWeek }"
                  @click="handleWeeklyCheckin"
                  :disabled="isWeeklyCheckinLoading || isWeeklyCheckinSubmitting || weeklyCheckinStatus.hasSignedThisWeek">
                  <span v-if="isWeeklyCheckinLoading" class="checkin-skeleton-button-label skeleton-item"></span>
                  <span v-else-if="isWeeklyCheckinSubmitting">签到中...</span>
                  <span v-else>{{ weeklyCheckinStatus.hasSignedThisWeek ? '本周已签到' : '每周签到' }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- 帖子列表 -->
          <section class="posts-feed fade-in-up" style="animation-delay: 0.2s;">
            <div class="feed-header-v2">
              <h2 class="feed-title-v2">社区动态</h2>
              <div class="search-section">
                <div class="search-input-wrapper">
                  <input v-model="searchQuery" type="text" placeholder="搜索帖子、内容或作者..." class="search-input"
                    @keyup.enter="handleSearch" />
                  <button class="search-btn-inner" @click="handleSearch">
                    🔍
                  </button>
                </div>
              </div>
              <div class="filter-row-v2">
                <button class="filter-btn-v2" :class="{ 'active': sortMode === 'latest' }"
                  @click="setSortMode('latest')">
                  当前最新
                </button>
                <button class="filter-btn-v2" :class="{ 'active': sortMode === 'hottest' }"
                  @click="setSortMode('hottest')">
                  当前最热
                </button>
              </div>
              <div class="tag-filter-row">
                <button class="tag-filter-btn" :class="{ active: selectedTagFilter === '' }" @click="setTagFilter('')">
                  全部标签
                </button>
                <button v-for="tag in FORUM_TAG_OPTIONS" :key="tag.value" class="tag-filter-btn"
                  :class="{ active: selectedTagFilter === tag.value }" @click="setTagFilter(tag.value)">
                  {{ tag.label }}
                </button>
              </div>
            </div>

            <!-- 骨架屏加载状态 -->
            <div v-if="isLoading" class="skeleton-feed">
              <div v-for="n in 5" :key="n" class="skeleton-post-card">
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

            <div v-else class="posts-list">
              <div v-if="forumData.length === 0" class="empty-state glass-panel">
                <span class="empty-icon">🔍</span>
                <p v-if="forumLoadError" class="forum-load-error">{{ forumLoadError }}</p>
                <p v-else-if="searchKeyword.trim() || selectedTagFilter">
                  没有找到{{ selectedTagFilter ? `「${getForumTagLabel(selectedTagFilter)}」` : '' }}相关的帖子
                </p>
                <p v-else>这里空空如也，快来发布第一条动态吧！</p>
              </div>

              <article v-for="(post, index) in forumData" :key="post.id" class="post-card-v2 glass-panel"
                :class="{
                  'image-post-card-v2': post.hasImages,
                  'is-expanded': expandedPostIds.has(post.id) || (activeReplyTarget && activeReplyTarget.postId === post.id),
                  'is-new-post': isPostHighlighted(post.id)
                }"
                :style="{ '--post-appear-delay': `${Math.min(index, 8) * 45}ms` }"
                @click="openPostDetail(post.id)">
                <div class="post-header-v2">
                  <div class="post-author-section">
                    <div class="post-author-avatar">
                      <img v-if="post.author_avatar_url" :src="post.author_avatar_url" alt="作者头像"
                        class="avatar-image" />
                      <span v-else>{{ post.author_username ? post.author_username.charAt(0).toUpperCase() : 'U'
                      }}</span>
                    </div>
                    <div class="post-author-info">
                      <span class="post-author-v2" @click.stop="goToProfile(post.author_username)">@{{
                        post.author_username }}</span>
                      <span class="post-date-v2">{{ formatDate(post.created_at) }}</span>
                    </div>
                  </div>
                </div>

                <div class="post-content-v2">
                  <h3 class="post-title-v2">
                    {{ post.displayTitle }}
                    <span v-if="post.status === 'limited'" class="post-status-pill limited">仅自己可见</span>
                  </h3>
                  <div v-if="post.tagLabel" class="post-card-tags">
                    <span class="post-card-tag">{{ post.tagLabel }}</span>
                  </div>
                  <div v-if="post.hasImages" class="image-post-thumb-grid"
                    :class="[
                      `count-${Math.min(post.previewImages.length, 3)}`,
                      { 'is-multi-image': post.hasMultipleImages }
                    ]"
                    :aria-label="post.hasMultipleImages ? `多图帖子，共 ${post.imageCount} 张图片` : '图片帖子'">
                    <div v-for="(image, index) in post.previewImages.slice(0, 3)" :key="image.id || image.url"
                      class="image-post-thumb-shell"
                      :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
                    >
                      <img
                        :src="image.url" :alt="`${post.displayTitle} 图片 ${index + 1}`" :loading="image.loading || post.imageLoading"
                        decoding="async" class="image-post-thumb"
                        :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
                        :width="image.width || undefined"
                        :height="image.height || undefined"
                        @load="markForumImageLoaded(post.id, image.url)"
                        @error="markForumImageLoaded(post.id, image.url)" />
                    </div>
                    <span v-if="post.hasMultipleImages" class="image-post-count-badge" aria-hidden="true">
                      多图 {{ post.imageCount }}
                    </span>
                  </div>
                  <p v-if="searchKeyword && post.search_excerpt" class="search-highlight-snippet"
                    v-html="renderSearchExcerpt(post.search_excerpt)">
                  </p>
                  <p class="post-text-v2">{{ getDisplayContent(post) }}</p>
                </div>

                <!-- 操作栏 -->
                <div class="post-actions-v2" @click.stop>
                  <div class="actions-left-v2">
                    <button class="action-item-v2 like-btn-v2" @click="handleToggleLike(post)"
                      :class="{ 'is-liked': post.isLiked, 'is-pulsing': isPostLikePulsing(post.id) }" :disabled="isLikeSubmitting[post.id]">
                      <Heart class="action-svg-v2" :size="17" :stroke-width="1.8"
                        :fill="post.isLiked ? 'currentColor' : 'none'" aria-hidden="true" />
                      <span class="action-count-v2">{{ post.like_count || 0 }}</span>
                    </button>

                    <button class="action-item-v2 replies-btn-v2" @click="toggleRepliesList(post)" aria-label="查看评论">
                      <MessageCircle class="action-svg-v2" :size="17" :stroke-width="1.8" aria-hidden="true" />
                      <span class="action-count-v2">{{ post.comment_count || 0 }}</span>
                    </button>
                  </div>

                  <div class="actions-right-v2">
                    <button class="action-item-v2 icon-only-action-v2 reply-btn-v2" @click="toggleReplyInput(post.id)"
                      aria-label="回复" title="回复">
                      <Reply class="action-svg-v2" :size="17" :stroke-width="1.8" aria-hidden="true" />
                    </button>
                    <button class="action-item-v2 icon-only-action-v2 share-btn-v2"
                      :class="{ 'is-copy-success': isPostShareCopied(post.id) }"
                      :aria-label="isPostShareCopied(post.id) ? '链接已复制' : '分享'"
                      :title="isPostShareCopied(post.id) ? '已复制' : '分享'"
                      @click="sharePost(post)">
                      <Check v-if="isPostShareCopied(post.id)" class="action-svg-v2" :size="17" :stroke-width="2"
                        aria-hidden="true" />
                      <Share2 v-else class="action-svg-v2" :size="17" :stroke-width="1.8" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <!-- 回复输入 (支持多级回复) -->
                <transition name="fade-slide">
                  <div v-if="activeReplyTarget && activeReplyTarget.postId === post.id" class="reply-input-section-v2"
                    @click.stop>
                    <div v-if="activeReplyTarget.username" class="reply-target-hint">
                      正在回复 <span class="target-user">@{{ activeReplyTarget.username }}</span>
                      <button class="clear-target-btn"
                        @click="activeReplyTarget = { postId: post.id, parentId: null, username: null }">×</button>
                    </div>
                    <textarea v-model="replyContent"
                      :placeholder="activeReplyTarget.username ? `回复 @${activeReplyTarget.username}...` : '写下你的回复...'"
                      class="reply-textarea-v2" rows="2"></textarea>
                    <div class="reply-actions-v2">
                      <button class="cancel-reply-btn-v2" @click="activeReplyTarget = null">取消</button>
                      <button class="submit-reply-btn-v2" @click="submitReply(post)"
                        :disabled="isReplySubmitting || replyCooldownSeconds > 0">
                        {{ isReplySubmitting ? '发送中...' : replySubmitLabel }}
                      </button>
                    </div>
                  </div>
                </transition>

                <!-- 回复列表 (优化多级显示) -->
                <transition name="expand-replies">
                  <div v-if="expandedPostIds.has(post.id) && post.replies && post.replies.length > 0"
                    class="replies-list" @click.stop>
                    <div v-for="reply in post.replies" :key="reply.id" class="reply-item-v2">
                      <div class="reply-header-v2">
                        <div class="reply-avatar">
                          <img v-if="reply.author_avatar_url" :src="reply.author_avatar_url" alt="回复者头像"
                            class="avatar-image" />
                          <span v-else>{{ reply.author_username ? reply.author_username.charAt(0).toUpperCase() : 'U'
                          }}</span>
                        </div>
                        <div class="reply-content-wrapper">
                          <div class="reply-user-info">
                            <span class="reply-author-v2" @click="goToProfile(reply.author_username)">{{
                              reply.author_username }}</span>
                            <span v-if="reply.reply_to_username" class="reply-to-tag">
                              回复 <span class="target-name">@{{ reply.reply_to_username }}</span>
                            </span>
                          </div>
                          <p class="reply-text-v2">{{ reply.content }}</p>
                          <div class="reply-meta-v2">
                            <span class="reply-date-v2">{{ formatDate(reply.created_at) }}</span>
                            <button class="reply-action-btn"
                              @click="toggleReplyInput(post.id, reply.parent_id || reply.id, reply.author_username, reply.content)">回复</button>
                            <button v-if="isLoggedIn && (reply.author_id === userInfo.id || userInfo.role === 'admin')"
                              class="delete-comment-btn-v2" @click="handleDeleteComment(reply, post)">×</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button v-if="shouldShowMoreRepliesLink(post)" class="more-replies-link-v2"
                      @click="openPostDetail(post.id)">
                      查看更多回复
                    </button>
                  </div>
                </transition>
              </article>
            </div>

            <!-- 加载更多提示 -->
            <div v-if="feedMode === 'posts' && isLoadingMore" class="loading-more">
              <div class="loading-spinner small"></div>
              <p>正在加载更多帖子...</p>
            </div>

            <!-- 没有更多数据提示 -->
            <div v-else-if="feedMode === 'posts' && !hasMoreData && forumData.length > 0 && !isLoading" class="no-more-data">
              <p>已经到底啦～</p>
            </div>
          </section>
        </div>

        <!-- 右侧：新闻侧边栏 -->
        <aside id="forum-newsroom" class="forum-sidebar fade-in-up" :class="{ 'mobile-hidden': !showMobileNews }"
          style="animation-delay: 0.3s;">
          <div class="sidebar-card glass-panel">
            <div class="sidebar-header">
              <span class="sidebar-tag">LATEST NEWS</span>
              <h3>NEWS ROOM</h3>
              <div class="sidebar-divider"></div>
            </div>

            <div class="news-list-sidebar">
              <div v-for="news in latestNews" :key="news.id" class="sidebar-news-item">
                <div class="news-meta">
                  <span class="news-category">{{ getCategoryName(news.category) }}</span>
                  <span class="news-date">{{ formatDate(news.date) }}</span>
                </div>
                <h4 class="news-title">{{ news.title }}</h4>
                <p class="news-excerpt">{{ news.excerpt }}</p>
              </div>
            </div>

            <router-link to="/newsroom" class="view-all-news-btn">
              查看全部新闻
              <span class="btn-arrow">→</span>
            </router-link>
          </div>

          <div class="hot-tags-card glass-panel fade-in-up" style="animation-delay: 0.35s; margin-top: 24px;">
            <div class="stats-header">
              <h4>热门标签</h4>
            </div>
            <div class="hot-tags-list">
              <button v-for="tag in normalizedHotTagStats" :key="tag.value" class="hot-tag-item"
                :class="{ active: selectedTagFilter === tag.value }" @click="setTagFilter(tag.value)">
                <span class="hot-tag-name">{{ tag.label }}</span>
                <span class="hot-tag-count">{{ tag.count }}</span>
              </button>
            </div>
          </div>

        </aside>
      </main>
    </div>

    <button v-if="isMobileComposerMode && feedMode === 'posts'" type="button" class="mobile-compose-fab"
      aria-label="发布帖子" @click="openMobileComposer">
      <span>+</span>
    </button>

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
              {{ postCooldownSeconds > 0 ? `${postCooldownSeconds}s` : '发布' }}
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
              :is-logged-in="isLoggedIn" :user-info="userInfo" :post-images="postImages"
              :is-submitting="isSubmitting" :is-uploading-post-image="isUploadingPostImage"
              :post-image-upload-status="postImageUploadStatus" :post-cooldown-seconds="postCooldownSeconds"
              :weekly-checkin-status="weeklyCheckinStatus" :weekly-checkin-progress-text="weeklyCheckinProgressText"
              :weekly-checkin-progress-percent="weeklyCheckinProgressPercent"
              :weekly-checkin-hint-text="weeklyCheckinHintText"
              :is-weekly-checkin-loading="isWeeklyCheckinLoading"
              :is-weekly-checkin-submitting="isWeeklyCheckinSubmitting" :forum-tag-options="FORUM_TAG_OPTIONS"
              :show-post-image-source-menu="showPostImageSourceMenu" is-mobile-composer @submit="handlePost"
              @login="showLoginModal = true" @toggle-image-source-menu="togglePostImageSourceMenu"
              @request-image-picker="openPostImagePicker" @request-camera="openPostCamera"
              @image-selection="handlePostImageSelection" @remove-image="removePostImage"
              @clear-images="clearPostImages" @weekly-checkin="handleWeeklyCheckin" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="mobile-draft-panel">
        <div v-if="isMobileDraftPanelOpen && !isMobileComposerOpen"
          class="mobile-draft-panel-overlay desktop-draft-panel-overlay"
          @click="closeMobileDraftPanel">
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

    <!-- 弹窗 -->
    <CommonAlertModal v-model:visible="modalState.show" :type="modalState.type" :title="modalState.title"
      :message="modalState.message" />

    <!-- 消息详情抽屉 -->
    <Teleport to="body">
      <Transition name="slide-right">
        <div v-if="selectedMessage" class="x-detail-drawer-overlay" @click="closeDetail">
          <div class="x-detail-drawer glass-panel" @click.stop>
            <div class="drawer-header">
              <button class="back-btn" @click="closeDetail">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
              </button>
              <h3>通知详情</h3>
            </div>
            <div class="drawer-content">
              <div class="detail-user-card">
                <div class="large-avatar-wrapper">
                  <img v-if="selectedMessage.sender?.avatar_url" :src="selectedMessage.sender.avatar_url"
                    class="large-avatar-img" alt="avatar" />
                  <div v-else class="large-avatar">
                    {{ selectedMessage.sender?.username?.charAt(0)?.toUpperCase?.() || 'S' }}
                  </div>
                </div>
                <div class="user-info">
                  <span class="name">{{ selectedMessage.sender?.username || '系统' }}</span>
                  <span class="type">{{ getNotificationTypeLabel(selectedMessage.type) }}</span>
                </div>
              </div>
              <div class="detail-body">
                <h2 class="detail-title">{{ getNotificationTitle(selectedMessage) }}</h2>
                <p class="main-text">{{ getNotificationContent(selectedMessage) }}</p>
                <div v-if="selectedMessage.type === 'comment' || selectedMessage.type === 'like'"
                  class="source-content">
                  <span class="source-label">{{ getNotificationSourceLabel(selectedMessage) }}</span>
                  <p class="source-text">{{ getNotificationSourceText(selectedMessage) }}</p>
                </div>
                <span class="full-date">{{ new Date(selectedMessage.created_at).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) }}</span>
              </div>
              <div v-if="canRetryModerationNotification(selectedMessage)" class="notification-actions">
                <button class="notif-action-btn retry" @click="retryRejectedPostFromNotification"
                  :disabled="isRetryingSelectedNotification">
                  {{ isRetryingSelectedNotification ? '重试中...' : '重试一次' }}
                </button>
              </div>
              <div v-if="canOpenNotificationSource(selectedMessage)" class="notification-actions">
                <button class="notif-action-btn" @click="goToNotificationSource">
                  查看原帖
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped src="./style.scoped.css"></style>
