<template>
  <div class="x-notifications-container" :class="{ 'minimal-mode': minimal }">
    <template v-if="!minimal">
      <UnifiedNavbar />
      <UserCenterPageHeader title="消息中心" @back="goBack">
        <template #actions>
          <button v-if="unreadCountsByType.all > 0" class="x-mark-all-btn" @click="markAllAsRead">
            全部已读
          </button>
        </template>
      </UserCenterPageHeader>
    </template>
    <!-- Sticky Header -->
    <header v-if="!minimal" class="x-header">
      <div class="x-header-controls">
        <div class="x-section-switch" role="tablist" aria-label="消息类型">
          <button type="button" class="active" @click="switchInboxSection('notifications')">
            通知
            <span v-if="unreadCountsByType.all > 0" class="tab-badge">{{ unreadCountsByType.all }}</span>
          </button>
        </div>

        <div class="x-tabs">
          <button v-for="tab in notificationTabs" :key="tab.id" type="button" class="x-tab"
            :class="{ active: currentTab === tab.id }" @click="setNotificationTab(tab.id)">
            <span>{{ tab.label }}</span>
            <span v-if="tab.unread > 0" class="tab-badge">{{ tab.unread }}</span>
          </button>
        </div>
      </div>
      <div class="x-filter-bar">
        <button type="button" class="x-filter-chip" :class="{ active: showUnreadOnly }"
          @click="showUnreadOnly = !showUnreadOnly">
          只看未读
        </button>
        <button v-if="currentTab !== 'all' && currentTabUnreadCount > 0" type="button"
          class="x-filter-chip action" @click="markCurrentNotificationTabAsRead">
          当前分类已读
        </button>
      </div>
    </header>

    <!-- Minimal Mode Header -->
    <header v-if="minimal" class="x-header-minimal">
      <div class="x-minimal-main">
        <div class="x-section-switch compact" role="tablist" aria-label="消息类型">
          <button type="button" class="active" @click="switchInboxSection('notifications')">
            通知
            <span v-if="unreadCountsByType.all > 0" class="tab-badge-mini">{{ unreadCountsByType.all }}</span>
          </button>
        </div>
        <div class="x-tabs-minimal">
          <button v-for="tab in notificationTabs" :key="tab.id" type="button" class="x-tab"
            :class="{ active: currentTab === tab.id }" @click="setNotificationTab(tab.id)">
            <span>{{ tab.label }}</span>
            <span v-if="tab.unread > 0" class="tab-badge-mini">{{ tab.unread }}</span>
          </button>
        </div>
        <div class="x-filter-bar minimal-filter-bar">
          <button type="button" class="x-filter-chip" :class="{ active: showUnreadOnly }"
            @click="showUnreadOnly = !showUnreadOnly">
            只看未读
          </button>
        </div>
      </div>
      <div class="x-header-actions-minimal">
        <button v-if="unreadCountsByType.all > 0" class="x-mark-all-btn-minimal" @click="markAllAsRead">
          全部已读
        </button>
      </div>
    </header>

    <!-- Notifications List -->
    <div class="x-list">
      <!-- Skeleton Loading -->
      <div v-if="loading" class="x-skeleton-list">
        <div v-for="i in 5" :key="i" class="x-skeleton-item">
          <div class="x-skeleton-avatar"></div>
          <div class="x-skeleton-content">
            <div class="x-skeleton-line x-skeleton-title"></div>
            <div class="x-skeleton-line x-skeleton-text"></div>
            <div class="x-skeleton-line x-skeleton-text short"></div>
          </div>
          <div class="x-skeleton-right">
            <div class="x-skeleton-line x-skeleton-badge"></div>
          </div>
        </div>
      </div>
      <div v-else-if="notificationsLoadError" class="x-empty">
        <div class="x-empty-visual">
          <TriangleAlert class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>通知加载失败</h3>
        <p>{{ notificationsLoadError }}</p>
        <button class="refresh-btn" @click="loadNotifications">点击重试</button>
      </div>
      <div v-else-if="filteredMessages.length > 0" class="x-inbox-list">
        <div v-for="msg in filteredMessages" :key="msg.id" class="x-item" :class="{ unread: msg.status === 'unread' }"
          @click="showDetail(msg)">
          <span v-if="msg.status === 'unread'" class="x-unread-dot" aria-hidden="true"></span>
          <!-- 左侧：头像 -->
          <div class="x-item-left">
            <div class="x-avatar-wrapper">
              <img v-if="msg.sender?.avatar_url" :src="msg.sender.avatar_url" class="x-avatar-img" alt="avatar" />
              <div v-else class="x-avatar">
                {{ msg.sender?.username?.charAt(0)?.toUpperCase?.() || 'S' }}
              </div>
            </div>
          </div>
          <!-- 中间：主要内容 -->
          <div class="x-item-main">
            <div class="x-item-meta">
              <div class="x-item-identity">
                <span class="x-sender-name">{{ msg.sender?.username || '系统' }}</span>
                <span class="x-action-type">{{ getTypeLabel(msg.type) }}</span>
              </div>
              <span class="x-date inline-date">{{ formatDate(msg.created_at) }}</span>
            </div>
            <div class="x-item-content">
              <span class="x-text">{{ getNotificationTitle(msg) }}</span>
            </div>
            <div v-if="getNotificationPreview(msg)" class="x-preview-box">
              {{ getNotificationPreview(msg) }}
            </div>
          </div>
          <!-- 右侧：时间和状态 -->
          <div class="x-item-right">
            <span class="x-date">{{ formatDate(msg.created_at) }}</span>
            <!-- 悬停快捷操作 -->
            <div v-if="msg.status === 'unread'" class="x-quick-actions" @click.stop>
              <button class="x-quick-btn mark-read" @click="markAsRead(msg)" title="标记已读" aria-label="标记已读">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div v-if="hasMoreNotifications" class="x-load-more-row">
          <button class="x-load-more-btn" :disabled="loadingMoreNotifications" @click="loadMoreNotifications">
            {{ loadMoreNotificationLabel }}
          </button>
        </div>
      </div>
      <div v-else class="x-empty">
        <div class="x-empty-visual">
          <Bell class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>保持专注，暂无新通知</h3>
        <p>当有伙伴与你互动或系统有新消息时，你会在这里看到它们。</p>
        <button class="refresh-btn" @click="loadNotifications">刷新试试</button>
      </div>
    </div>

    <!-- Details Overlay (Sidebar style) -->
    <Teleport to="body">
      <Transition name="slide-right">
        <div v-if="selectedMessage" class="x-detail-drawer-overlay" @click="closeDetail">
          <div class="x-detail-drawer" @click.stop>
            <div class="drawer-header">
              <UserCenterBackButton label="返回消息列表" @click="closeDetail" />
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
              <!-- Reply Input Section -->
              <Transition name="fade-slide">
                <div v-if="showReplyInput" class="reply-input-section">
                  <textarea v-model="replyContent" :placeholder="`回复 @${selectedMessage.sender?.username || '用户'}...`"
                    rows="3" class="reply-textarea" :disabled="isReplySubmitting"></textarea>
                  <div class="reply-controls">
                    <button class="cancel-reply-btn" @click="cancelReply" :disabled="isReplySubmitting">取消</button>
                    <button class="submit-reply-btn" @click="submitReply"
                      :disabled="!replyContent.trim() || isReplySubmitting">
                      {{ isReplySubmitting ? '发送中...' : '发送' }}
                    </button>
                  </div>
                </div>
              </Transition>
              <!-- Action Buttons -->
              <div v-if="shouldShowActions" class="notification-actions">
                <button v-if="selectedMessage.type === 'comment'" class="notif-action-btn reply"
                  @click="openReplyInput">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 17 4 12 9 7"></polyline>
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                  </svg>
                  回复
                </button>
                <button
                  v-if="(selectedMessage.type === 'comment' || selectedMessage.type === 'like') && (selectedMessage.post?.id || selectedMessage.post_id)"
                  class="notif-action-btn view-post" @click="viewOriginalPost">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  查看原文
                </button>
                <button v-if="canRetryModerationNotification(selectedMessage)" class="notif-action-btn retry"
                  @click="retryRejectedPostFromNotification" :disabled="isRetryingSelectedNotification">
                  {{ isRetryingSelectedNotification ? '重试中...' : '重试一次' }}
                </button>
                <button v-if="selectedMessage.status === 'unread'" class="notif-action-btn mark-read"
                  @click="markAsRead(selectedMessage)">
                  标记已读
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="fade">
        <div v-if="feedbackToast.visible" class="message-feedback-toast" :class="feedbackToast.type">
          {{ feedbackToast.message }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Bell, TriangleAlert } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader.js';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  filterSelfActionNotifications
} from '@/utils/api/notifications-api.js';
import { getCurrentUser } from '@/utils/api/auth-api.js';
import { createComment, retryPostModeration } from '@/utils/api/forum-api.js';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { invalidateByTags } from '@/utils/request-core.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
import UserCenterBackButton from '@/components/UserCenterBackButton.vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import {
  getForumPostBody,
  getForumPostExcerpt,
  getForumPostTitle
} from '@/utils/forum-post-format.js';
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
} from '@/utils/moderation-retry-cache.js';

// Props
defineProps({
  minimal: {
    type: Boolean,
    default: false
  }
});

const route = useRoute();
const notificationStoreRef = ref(getNotificationStoreSync());

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

const refreshUnreadCount = async (options = {}) => {
  const notificationStore = await ensureNotificationStore();
  await notificationStore.refreshUnreadCount(options);
};

const router = useRouter();
const authStore = useAuthStore();
const { userInfo, isLoggedIn, isInitialized } = storeToRefs(authStore);
const messages = ref([]);
const selectedMessage = ref(null);
const loading = ref(true);
const loadingMoreNotifications = ref(false);
const notificationsLoadError = ref('');
const notificationsCursor = ref(null);
const hasMoreNotifications = ref(false);
const currentUserId = ref(null);
const currentTab = ref('all'); // 'all' | 'like' | 'comment' | 'impression' | 'system'
const LOTTERY_WIN_NOTIFICATION_TYPE = 'lottery_win';
const MESSAGE_PAGE_SIZE = 24;
const NOTIFICATION_TABS = [
  { id: 'all', label: '全部' },
  { id: 'comment', label: '回复' },
  { id: 'like', label: '点赞' },
  { id: 'impression', label: '印象' },
  { id: 'system', label: '系统' }
];
let unreadRefreshInflight = null;
let lastUnreadRefreshAt = 0;
const UNREAD_REFRESH_MIN_INTERVAL_MS = 1200;
let messageCenterRealtimeChannels = [];
let realtimeRefreshTimer = null;
let pendingRealtimeRefresh = {
  notifications: false,
  forceCache: false
};
const retryingNotificationIds = ref({});
const retriedNotificationIdSet = ref(new Set());
const showUnreadOnly = ref(false);
const feedbackToast = reactive({
  visible: false,
  type: 'info',
  message: ''
});
let feedbackToastTimer = null;

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

// Reply to comment state
const showReplyInput = ref(false);
const replyContent = ref('');
const isReplySubmitting = ref(false);
const TASK_TIMEOUT_MS = 12000;

const withTaskTimeout = (promise, timeoutMs = TASK_TIMEOUT_MS, message = '请求超时，请稍后重试') =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const showFeedback = (message, type = 'info') => {
  if (feedbackToastTimer) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  feedbackToast.message = message;
  feedbackToast.type = type;
  feedbackToast.visible = true;
  feedbackToastTimer = window.setTimeout(() => {
    feedbackToast.visible = false;
    feedbackToastTimer = null;
  }, 2400);
};

const mergeById = (currentRows = [], incomingRows = []) => {
  const map = new Map();
  [...currentRows, ...incomingRows].forEach((row) => {
    if (row?.id) map.set(row.id, { ...(map.get(row.id) || {}), ...row });
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
};

const waitForAuthReady = async (timeoutMs = 4000) => {
  if (isInitialized.value) return;

  await Promise.race([
    new Promise((resolve) => {
      const stop = watch(isInitialized, (ready) => {
        if (ready) {
          stop();
          resolve();
        }
      }, { immediate: true });
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
};

const invalidateMessageCenterCaches = (userId = currentUserId.value) => {
  const safeUserId = String(userId || '').trim();
  invalidateByTags([
    'notifications',
    safeUserId ? `notifications:user:${safeUserId}` : ''
  ]);
};

const visibleNotificationMessages = computed(() => filterSelfActionNotifications(messages.value));
const isSystemNotificationType = (type) => [
  'system',
  'gift',
  LOTTERY_WIN_NOTIFICATION_TYPE,
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTIFICATION_TYPE
].includes(type);

const filteredMessages = computed(() => {
  let result = visibleNotificationMessages.value;

  if (currentTab.value === 'system') {
    result = result.filter(m => isSystemNotificationType(m.type));
  } else if (currentTab.value !== 'all') {
    result = result.filter(m => m.type === currentTab.value);
  }

  if (showUnreadOnly.value) {
    result = result.filter(m => m.status === 'unread');
  }

  return result;
});

// 计算各类型未读数量
const unreadCountsByType = computed(() => {
  const counts = { all: 0, like: 0, comment: 0, impression: 0, system: 0 };

  visibleNotificationMessages.value.forEach(m => {
    if (m.status === 'unread') {
      counts.all++;
      if (isSystemNotificationType(m.type)) {
        counts.system++;
      } else if (m.type && Object.prototype.hasOwnProperty.call(counts, m.type)) {
        counts[m.type]++;
      }
    }
  });

  return counts;
});

const notificationTabs = computed(() => NOTIFICATION_TABS.map((tab) => ({
  ...tab,
  unread: unreadCountsByType.value[tab.id] || 0
})));
const currentTabUnreadCount = computed(() => unreadCountsByType.value[currentTab.value] || 0);

const refreshMessageCenter = async ({
  includeNotifications = true,
  forceCache = false
} = {}) => {
  if (!currentUserId.value) return;

  const now = Date.now();
  if (!forceCache && now - lastUnreadRefreshAt < UNREAD_REFRESH_MIN_INTERVAL_MS) return;
  if (unreadRefreshInflight) {
    await unreadRefreshInflight;
    return;
  }

  unreadRefreshInflight = (async () => {
    try {
      if (forceCache) {
        invalidateMessageCenterCaches();
      }

      await Promise.allSettled([
        includeNotifications
          ? (async () => {
            const { data, hasMore, nextCursor } = await getUserNotifications(currentUserId.value, {
              limit: MESSAGE_PAGE_SIZE
            });
            messages.value = data || [];
            hasMoreNotifications.value = Boolean(hasMore);
            notificationsCursor.value = nextCursor || null;
          })()
          : Promise.resolve()
      ]);

      await refreshUnreadCount({ force: forceCache });
      lastUnreadRefreshAt = Date.now();
    } catch (err) {
      logger.error('messages', '实时刷新消息中心失败', err);
    }
  })();

  try {
    await unreadRefreshInflight;
  } finally {
    unreadRefreshInflight = null;
  }
};

const scheduleRealtimeRefresh = ({ notifications = true, forceCache = false } = {}) => {
  pendingRealtimeRefresh.notifications = pendingRealtimeRefresh.notifications || notifications;
  pendingRealtimeRefresh.forceCache = pendingRealtimeRefresh.forceCache || forceCache;

  if (realtimeRefreshTimer) return;

  realtimeRefreshTimer = window.setTimeout(async () => {
    const refreshOptions = {
      includeNotifications: pendingRealtimeRefresh.notifications,
      forceCache: pendingRealtimeRefresh.forceCache
    };
    pendingRealtimeRefresh = {
      notifications: false,
      forceCache: false
    };
    realtimeRefreshTimer = null;
    await refreshMessageCenter(refreshOptions);
  }, 120);
};

const removeRealtimeChannels = async () => {
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
  pendingRealtimeRefresh = {
    notifications: false,
    forceCache: false
  };

  if (!messageCenterRealtimeChannels.length) return;

  const channels = messageCenterRealtimeChannels;
  messageCenterRealtimeChannels = [];
  await Promise.allSettled(channels.map((channel) => supabase.removeChannel(channel)));
};

const applyRealtimeRow = (rowsRef, payload) => {
  const eventType = String(payload?.eventType || '').toUpperCase();
  const newRow = payload?.new;
  const oldRow = payload?.old;
  const rowId = newRow?.id || oldRow?.id;
  if (!rowId) return false;

  if (eventType === 'DELETE') {
    rowsRef.value = rowsRef.value.filter((row) => row.id !== rowId);
    return true;
  }

  if (eventType === 'INSERT') {
    rowsRef.value = mergeById([newRow], rowsRef.value);
    return true;
  }

  rowsRef.value = rowsRef.value.map((row) =>
    row.id === rowId ? { ...row, ...newRow } : row
  );
  return true;
};

const refreshUnreadCountAfterRealtime = async () => {
  invalidateMessageCenterCaches();
  await refreshUnreadCount({ force: true });
};

const startRealtimeChannels = async (userId) => {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return;

  await removeRealtimeChannels();

  const notificationsChannel = supabase
    .channel(`messages-center-notifications:${safeUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${safeUserId}`
      },
      (payload) => {
        const patched = applyRealtimeRow(messages, payload);
        void refreshUnreadCountAfterRealtime();
        if (!patched || String(payload?.eventType || '').toUpperCase() === 'INSERT') {
          scheduleRealtimeRefresh({
            notifications: true,
            forceCache: true
          });
        }
      }
    )
    .subscribe();
  messageCenterRealtimeChannels = [notificationsChannel];
};

const shouldShowActions = computed(() => {
  if (!selectedMessage.value) return false;
  const msg = selectedMessage.value;
  const hasPostId = msg.post?.id || msg.post_id;
  return ((msg.type === 'comment' || msg.type === 'like') && hasPostId)
    || canRetryModerationNotification(msg);
});

// 监听弹窗状态，控制 body 滚动
watch(selectedMessage, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

// 监听路由参数，自动切换到消息中心内部分区
watch(() => route.query.section, (newSection) => {
  if (newSection === 'mail') {
    switchInboxSection('notifications');
    return;
  }
}, { immediate: true });

watch(() => route.query.to, () => {
  if (route.query.to) switchInboxSection('notifications');
});

const setNotificationTab = (tabId) => {
  currentTab.value = NOTIFICATION_TABS.some((tab) => tab.id === tabId) ? tabId : 'all';
  const nextQuery = {
    ...route.query,
    tab: 'messages',
    section: 'notifications'
  };
  delete nextQuery.to;
  router.replace({
    query: nextQuery
  });
};

const switchInboxSection = (section) => {
  if (section === 'mail') {
    showFeedback('私信功能已下架，消息中心仅保留站内通知。', 'info');
    setNotificationTab('all');
    return;
  }
  currentTab.value = NOTIFICATION_TABS.some((tab) => tab.id === currentTab.value) ? currentTab.value : 'all';
  const nextQuery = {
    ...route.query,
    tab: 'messages',
    section: 'notifications'
  };
  delete nextQuery.to;
  router.replace({
    query: nextQuery
  });
};

onMounted(() => {
  loadRetriedNotificationIds();
});

// 处理 auth 初始化竞态：用户ID晚到时自动补拉一次
watch(() => userInfo.value?.id, async (newId, oldId) => {
  if (!newId || newId === oldId) return;
  await loadNotifications();
  await startRealtimeChannels(newId);
});

// 组件卸载时恢复 body 滚动并取消订阅
onUnmounted(() => {
  document.body.style.overflow = '';
  if (feedbackToastTimer) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  window.removeEventListener('boh_unread_refresh', handleUnreadRefreshEvent);
  void removeRealtimeChannels();
});

const handleUnreadRefreshEvent = async (event) => {
  logger.debug('messages', '收到未读刷新事件，刷新消息列表');
  if (!currentUserId.value) return;

  invalidateMessageCenterCaches();
  scheduleRealtimeRefresh({
    notifications: true,
    forceCache: event?.detail?.source === 'realtime'
  });
};

// 初始化消息数据
onMounted(async () => {
  await waitForAuthReady();

  await Promise.allSettled([
    loadNotifications()
  ]);

  // 监听 boh_unread_refresh 事件来刷新消息列表
  window.addEventListener('boh_unread_refresh', handleUnreadRefreshEvent);
  await startRealtimeChannels(currentUserId.value || userInfo.value?.id);
});

// 加载通知
const loadNotifications = async () => {
  loading.value = true;
  notificationsLoadError.value = '';
  try {
    const user = await withTaskTimeout(getCurrentUser());
    if (user) {
      currentUserId.value = user.id;
      const { data, hasMore, nextCursor } = await withTaskTimeout(
        getUserNotifications(user.id, { limit: MESSAGE_PAGE_SIZE })
      );
      messages.value = data || [];
      hasMoreNotifications.value = Boolean(hasMore);
      notificationsCursor.value = nextCursor || null;
    } else if (isLoggedIn.value) {
      // auth 竞态兜底：首次未拿到 user 时稍后补拉一次
      await new Promise((resolve) => setTimeout(resolve, 400));
      const retryUser = await withTaskTimeout(getCurrentUser(), 8000, '获取用户信息超时');
      if (retryUser) {
        currentUserId.value = retryUser.id;
        const { data, hasMore, nextCursor } = await withTaskTimeout(
          getUserNotifications(retryUser.id, { limit: MESSAGE_PAGE_SIZE })
        );
        messages.value = data || [];
        hasMoreNotifications.value = Boolean(hasMore);
        notificationsCursor.value = nextCursor || null;
      }
    }
  } catch (error) {
    logger.error('messages', '加载通知失败', error);
    notificationsLoadError.value = error?.message || '网络异常，请稍后重试';
  } finally {
    loading.value = false;
  }
};

const loadMoreNotifications = async () => {
  if (!currentUserId.value || loadingMoreNotifications.value || !hasMoreNotifications.value) return;
  loadingMoreNotifications.value = true;
  try {
    const { data, hasMore, nextCursor } = await withTaskTimeout(
      getUserNotifications(currentUserId.value, {
        limit: MESSAGE_PAGE_SIZE,
        cursor: notificationsCursor.value
      })
    );
    messages.value = mergeById(messages.value, data || []);
    hasMoreNotifications.value = Boolean(hasMore);
    notificationsCursor.value = nextCursor || null;
  } catch (error) {
    logger.error('messages', '加载更多通知失败', error);
    showFeedback(error?.message || '加载更多失败，请稍后重试', 'error');
  } finally {
    loadingMoreNotifications.value = false;
  }
};

const triggerUnreadRefresh = async () => {
  // 从数据库刷新未读计数
  invalidateMessageCenterCaches();
  await refreshUnreadCount({ force: true });
  // 使用自定义事件来通知同标签页内的其他组件刷新
  const event = new CustomEvent('boh_unread_refresh', {
    detail: { source: 'local-action' }
  });
  window.dispatchEvent(event);
  // 使用 localStorage 事件来通知其他标签页刷新
  localStorage.setItem('boh_unread_refresh', Date.now().toString());
  setTimeout(() => {
    localStorage.removeItem('boh_unread_refresh');
  }, 100);
};

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

// 标记单条已读（快捷操作）
const markAsRead = async (msg) => {
  if (!msg || msg.status !== 'unread') return;

  const previousStatus = msg.status;
  msg.status = 'read';
  try {
    const result = await markNotificationAsRead(msg.id);
    if (result?.error) throw result.error;
    await triggerUnreadRefresh();
    showFeedback('已标记为已读', 'success');
  } catch (error) {
    msg.status = previousStatus;
    logger.error('messages', '标记已读失败', error);
    showFeedback(error?.message || '标记已读失败，请稍后重试', 'error');
  }
};

// 标记全部已读
const markAllAsRead = async () => {
  if (!currentUserId.value) {
    logger.debug('messages', '标记全部已读跳过：currentUserId 为空');
    return;
  }

  try {
    await markAllNotificationsAsRead(currentUserId.value);
    messages.value.forEach(m => m.status = 'read');
    // 触发未读消息数量更新
    await triggerUnreadRefresh();
    showFeedback('通知已全部标记为已读', 'success');
  } catch (error) {
    logger.error('messages', '标记全部已读失败', error);
    showFeedback(error?.message || '操作失败，请稍后重试', 'error');
  }
};

const getCurrentTabUnreadMessages = () => {
  if (currentTab.value === 'all') {
    return visibleNotificationMessages.value.filter((msg) => msg.status === 'unread');
  }
  if (currentTab.value === 'system') {
    return visibleNotificationMessages.value.filter((msg) => msg.status === 'unread' && isSystemNotificationType(msg.type));
  }
  return visibleNotificationMessages.value.filter((msg) => msg.status === 'unread' && msg.type === currentTab.value);
};

const markCurrentNotificationTabAsRead = async () => {
  const targetMessages = getCurrentTabUnreadMessages();
  if (!targetMessages.length) return;

  const previousRows = targetMessages.map((msg) => ({ msg, status: msg.status }));
  targetMessages.forEach((msg) => {
    msg.status = 'read';
  });

  try {
    const settled = await Promise.allSettled(targetMessages.map((msg) => markNotificationAsRead(msg.id)));
    const failed = settled.some((item) => item.status === 'rejected' || item.value?.error);
    if (failed) throw new Error('部分通知标记失败');
    await triggerUnreadRefresh();
    showFeedback('当前分类已标记为已读', 'success');
  } catch (error) {
    previousRows.forEach(({ msg, status }) => {
      msg.status = status;
    });
    logger.error('messages', '标记当前分类已读失败', error);
    showFeedback(error?.message || '操作失败，请稍后重试', 'error');
  }
};

// 显示详情并标记已读
const showDetail = async (msg) => {
  selectedMessage.value = msg;

  if (msg.status === 'unread') {
    try {
      const result = await markNotificationAsRead(msg.id);
      if (result?.error) throw result.error;
      msg.status = 'read';
      // 触发未读消息数量更新
      await triggerUnreadRefresh();
    } catch (error) {
      logger.error('messages', '标记已读失败', error);
      showFeedback(error?.message || '标记已读失败，请稍后重试', 'error');
    }
  }
};

const closeDetail = () => {
  selectedMessage.value = null;
  showReplyInput.value = false;
  replyContent.value = '';
};

const openReplyInput = () => {
  if (!isLoggedIn.value) {
    authStore.showLoginModal = true;
    return;
  }
  showReplyInput.value = true;
};

const cancelReply = () => {
  showReplyInput.value = false;
  replyContent.value = '';
};

const getNotificationReplyParentId = (msg) => {
  const comment = msg?.comment || {};
  const parent = comment.parent || {};
  return parent.parent_id || comment.parent_id || msg?.comment_id || null;
};

const submitReply = async () => {
  if (!isLoggedIn.value || !replyContent.value.trim() || isReplySubmitting.value) return;

  isReplySubmitting.value = true;

  try {
    const commentStatus = 'approved';
    const msg = selectedMessage.value;
    const rawReplyContent = replyContent.value.trim();

    const { error } = await createComment(
      msg.post_id,
      rawReplyContent,
      userInfo.value.id,
      userInfo.value.username,
      commentStatus,
      getNotificationReplyParentId(msg),
      msg.sender?.username || null
    );

    if (error) throw error;
    showFeedback('回复已发送', 'success');
    showReplyInput.value = false;
    replyContent.value = '';
  } catch (error) {
    logger.error('messages', '回复失败', error);
    showFeedback(error?.message || '回复发送失败，请稍后重试', 'error');
  } finally {
    isReplySubmitting.value = false;
  }
};

const viewOriginalPost = () => {
  const postId = selectedMessage.value?.post?.id || selectedMessage.value?.post_id;
  if (postId) {
    const commentId = selectedMessage.value?.comment?.id || selectedMessage.value?.comment_id;
    closeDetail();
    router.push({
      path: `/forum/post/${postId}`,
      query: commentId ? { comment: commentId } : {}
    });
  } else {
    logger.warn('messages', '无法跳转：帖子ID不存在', selectedMessage.value);
    showFeedback('无法跳转到原文，该帖子可能已被删除', 'error');
  }
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
    const { ok, resultStatus, error } = await retryPostModeration(postId, userInfo.value.id);
    if (!ok) {
      showFeedback(`重试失败：${error?.message || '请稍后重试'}`, 'error');
      return;
    }

    markNotificationRetried(notificationId);
    if (resultStatus === 'approved') {
      showFeedback('重试通过：帖子已恢复展示', 'success');
    } else {
      showFeedback('本次重试后仍未通过审查，如有疑问请联系客服', 'info');
    }
  } catch (error) {
    logger.error('messages', '帖子复审重试失败', error);
    showFeedback('重试失败，请稍后再试', 'error');
  } finally {
    retryingNotificationIds.value[notificationId] = false;
  }
};

// 获取通知类型简短标签
const getTypeLabel = (type) => {
  const labels = {
    'like': '赞了你',
    'comment': '回复了你',
    'follow': '关注了你',
    'impression': '给你印象',
    [POST_REJECTED_NOTIFICATION_TYPE]: '审查通知',
    [COMMENT_REJECTED_NOTIFICATION_TYPE]: '审查通知',
    [LOTTERY_WIN_NOTIFICATION_TYPE]: '中奖通知',
    'system': '系统消息',
    'gift': '礼物通知'
  };
  return labels[type] || '消息';
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
    [LOTTERY_WIN_NOTIFICATION_TYPE]: '中奖通知',
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
    case LOTTERY_WIN_NOTIFICATION_TYPE:
      return '你中奖啦';
    case 'system':
      return '系统通知';
    case 'gift':
      return '礼物进度更新';
    default:
      return '新消息';
  }
};

// 获取通知预览
const getNotificationPreview = (notification) => {
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
  if (notification.type === LOTTERY_WIN_NOTIFICATION_TYPE) {
    return notification.content || '你在 BOH 抽奖中中奖啦，请等待管理员联系。';
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
  if (notification.type === LOTTERY_WIN_NOTIFICATION_TYPE) {
    return notification.content || '你在 BOH 抽奖中中奖啦，请等待管理员联系。';
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

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const loadMoreNotificationLabel = computed(() => {
  if (loadingMoreNotifications.value) return '加载中...';
  return hasMoreNotifications.value ? '加载更多通知' : '没有更多通知';
});
</script>

<style scoped src="./style.scoped.css"></style>
