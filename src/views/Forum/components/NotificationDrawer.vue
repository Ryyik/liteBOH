<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { escapeHtml, truncateTextSafe } from '@/utils/forum-helpers.js';
import DOMPurify from '@/utils/dompurify.js';
import { formatSmartTime } from '@/utils/time.js';
import {
  POST_REJECTED_NOTICE_TEXT,
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTICE_TEXT,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTICE_TEXT,
  COMMENT_REJECTED_NOTIFICATION_TYPE
} from '@/utils/moderation-retry-cache.js';
import {
  getForumPostBody,
  getForumPostExcerpt,
  getForumPostTitle
} from '@/utils/forum-post-format.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  notifications: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  unreadCount: { type: Number, default: 0 },
  typeFilter: { type: String, default: 'all' },
  filterOptions: { type: Array, default: () => [] },
  selectedMessage: { type: Object, default: null }
});

const emit = defineEmits(['close', 'markAllRead', 'select', 'filterChange', 'loadMore']);

const formatDate = formatSmartTime;

const MOBILE_BREAKPOINT = 768;
const isMobile = ref(window.innerWidth <= MOBILE_BREAKPOINT);

function updateMobileStatus() {
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT;
}

onMounted(() => {
  window.addEventListener('resize', updateMobileStatus);
  window.addEventListener('orientationchange', updateMobileStatus);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateMobileStatus);
  window.removeEventListener('orientationchange', updateMobileStatus);
});

function getNotificationFilterGroup(type = '') {
  const safeType = String(type || '').trim();
  if (['like', 'comment', 'follow', 'impression', 'gift'].includes(safeType)) return 'interaction';
  if ([POST_REJECTED_NOTIFICATION_TYPE, COMMENT_REJECTED_NOTIFICATION_TYPE, POST_REPORT_LIMITED_NOTIFICATION_TYPE].includes(safeType)) return 'moderation';
  return 'system';
}

const filteredNotifications = computed(() => {
  if (props.typeFilter === 'all') return props.notifications;
  return props.notifications.filter((notification) => getNotificationFilterGroup(notification?.type) === props.typeFilter);
});

function getNotificationIcon(type) {
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
}

function getNotificationText(n) {
  const rawSenderName = String(n.sender?.username || '').trim();
  const senderName = rawSenderName || '有人';
  const escapedSenderName = escapeHtml(senderName);
  const senderProfileUrl = `#/profile/${encodeURIComponent(senderName)}`;
  const senderLink = rawSenderName
    ? `<a class="clickable-username-inline" href="${senderProfileUrl}">${escapedSenderName}</a>`
    : escapedSenderName;
  const safeCommentSnippet = escapeHtml(truncateTextSafe(String(n.comment?.content || ''), 20));

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
}

function getNotificationTypeLabel(type) {
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
}

function getNotificationTitle(notification) {
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
}

function getNotificationContent(notification) {
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
}

function getNotificationSourceLabel(notification) {
  if (notification?.type === 'comment') return '原帖内容：';
  return '原文内容：';
}

function getNotificationSourceText(notification) {
  if (notification?.post) {
    return getForumPostBody(notification.post) || getForumPostTitle(notification.post);
  }
  return String(notification?.comment?.content || '').trim();
}

function handleNotificationItemClick(notification, event) {
  const target = event?.target;
  if (target?.closest?.('.clickable-username-inline')) {
    return;
  }
  emit('select', notification);
}

function handleFilterChange(value) {
  emit('filterChange', value);
}

function handleMarkAllAsRead() {
  emit('markAllRead');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="notification-drawer-overlay" @click="handleClose"></div>
    <transition name="drawer-slide">
      <div v-if="open" class="notification-drawer glass-panel"
        :class="{ 'mobile-drawer': isMobile }">
        <div class="drawer-header">
          <div class="header-main">
            <h3 class="drawer-title">消息通知</h3>
            <span v-if="unreadCount > 0" class="unread-badge-inline">{{ unreadCount }} 条未读</span>
          </div>
          <div class="drawer-actions">
            <button v-if="unreadCount > 0" class="mark-all-btn-v2" @click="handleMarkAllAsRead">全部已读</button>
            <button class="close-drawer-btn" @click="handleClose">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="drawer-list-container custom-scrollbar">
          <div class="notification-filter-row" role="tablist" aria-label="通知类型筛选">
            <button v-for="option in filterOptions" :key="option.value" type="button"
              class="notification-filter-btn" :class="{ active: typeFilter === option.value }"
              role="tab" :aria-selected="typeFilter === option.value"
              @click="handleFilterChange(option.value)">
              {{ option.label }}
            </button>
          </div>
          <div v-if="loading" class="panel-loading-v2">
            <div class="loading-spinner-v2"></div>
            <p>同步通知中...</p>
          </div>
          <div v-else-if="filteredNotifications.length === 0" class="panel-empty">
            <span class="empty-icon">🏜️</span>
            <p>暂无新消息，去社区逛逛吧</p>
          </div>
          <div v-else class="notification-items-group">
            <div v-for="n in filteredNotifications" :key="n.id" class="notification-item-v2"
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
</template>