import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '@/utils/logger.js';
import type { NotificationPayload, NotificationItem } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type * as AuthModule from '@/utils/auth.js';

let authApiPromise: Promise<typeof AuthModule> | null = null;
const loadAuthApi = async (): Promise<typeof AuthModule> => {
  if (!authApiPromise) {
    authApiPromise = import('@/utils/auth.js');
  }
  return authApiPromise;
};

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0);
  const notifications = ref<NotificationItem[]>([]);
  const notificationSubscription = ref<RealtimeChannel | null>(null);
  const currentUserId = ref<string | null>(null);
  const unreadRefreshInflight = ref<Promise<void> | null>(null);
  const lastUnreadRefreshAt = ref(0);
  const UNREAD_REFRESH_MIN_INTERVAL_MS = 1500;

  const showToast = ref(false);
  const toastTitle = ref('');
  const toastDesc = ref('');
  const toastIcon = ref('🔔');
  const toastTimer = ref<ReturnType<typeof setTimeout> | null>(null);

  const displayToast = (title: string, desc: string, icon = '🔔'): void => {
    if (toastTimer.value) {
      clearTimeout(toastTimer.value);
      toastTimer.value = null;
    }
    toastTitle.value = title;
    toastDesc.value = desc;
    toastIcon.value = icon;
    showToast.value = true;

    toastTimer.value = setTimeout(() => {
      showToast.value = false;
      toastTimer.value = null;
    }, 1500);
  };

  const hideToast = (): void => {
    if (toastTimer.value) {
      clearTimeout(toastTimer.value);
      toastTimer.value = null;
    }
    showToast.value = false;
  };

  const loadNotifications = async (): Promise<void> => {
    if (!currentUserId.value) return;
    try {
      const { getUserNotifications } = await loadAuthApi();
      const { data, error } = await getUserNotifications(currentUserId.value);
      if (!error) {
        notifications.value = data || [];
      }
    } catch (error) {
      logger.error('notifications-store', '加载通知列表失败', error);
    }
  };

  const removeChannelSafely = async (channel: RealtimeChannel | null): Promise<void> => {
    if (!channel) return;
    try {
      const { supabase } = await loadAuthApi();
      // 使用类型断言确保 channel 类型兼容
      supabase.removeChannel(channel as RealtimeChannel);
    } catch (error) {
      logger.warn('notifications-store', '移除通知通道失败', error);
    }
  };

  const startNotificationListener = async (userId: string): Promise<void> => {
    if (!userId) return;

    if (notificationSubscription.value && currentUserId.value === userId) {
      logger.debug('notifications-store', '通知监听器已存在，跳过重复启动', { userId });
      return;
    }

    currentUserId.value = userId;

    if (notificationSubscription.value) {
      stopNotificationListener();
    }

    try {
      const { subscribeToNotifications, supabase, invalidateByTags } = await loadAuthApi();

      await loadNotifications();
      await refreshUnreadCount();

      logger.debug('notifications-store', '启动新的通知监听器', { userId });

      const notificationsChannel = subscribeToNotifications(userId, async (payload: NotificationPayload) => {
        logger.debug('notifications-store', '收到实时通知', payload);

        invalidateByTags(['notifications', `notifications:user:${userId}`]);
        await refreshUnreadCount({ force: true });
        await loadNotifications();

        window.dispatchEvent(new CustomEvent('boh_unread_refresh', {
          detail: { source: 'realtime', table: 'notifications', event: 'INSERT' }
        }));

        let desc = '你收到了一条新通知';
        let icon = '🔔';

        switch (payload.type) {
          case 'like':
            desc = '有人点赞了你的帖子';
            icon = '❤️';
            break;
          case 'comment':
            desc = '有人回复了你的帖子';
            icon = '💬';
            break;
          case 'impression':
            desc = '有人给你留下了新印象';
            icon = '✨';
            break;
          case 'lottery_win':
            desc = payload.content || '你中奖啦，请前往消息中心查看';
            icon = '🏆';
            break;
        }

        displayToast('新消息提醒', desc, icon);
      });

      notificationSubscription.value = notificationsChannel as RealtimeChannel;
    } catch (error) {
      logger.error('notifications-store', '启动通知监听器失败', error);
    }
  };

  const stopNotificationListener = async (): Promise<void> => {
    const activeSubscription = notificationSubscription.value;
    notificationSubscription.value = null;
    if (!activeSubscription) return;

    await removeChannelSafely(activeSubscription as RealtimeChannel);
  };

  const setUnreadCount = (count: number): void => {
    unreadCount.value = count;
  };

  const refreshUnreadCount = async ({ force = false } = {}): Promise<void> => {
    if (unreadRefreshInflight.value) {
      await unreadRefreshInflight.value;
      return;
    }

    const now = Date.now();
    if (!force && lastUnreadRefreshAt.value > 0 && (now - lastUnreadRefreshAt.value) < UNREAD_REFRESH_MIN_INTERVAL_MS) {
      return;
    }

    unreadRefreshInflight.value = (async () => {
      try {
        const { getCurrentUser, getUnreadNotificationCount } = await loadAuthApi();
        let userId = currentUserId.value;
        if (!userId) {
          const user = await getCurrentUser();
          if (user) {
            userId = user.id;
            currentUserId.value = userId;
          } else {
            return;
          }
        }
        const { count } = await getUnreadNotificationCount(userId);
        unreadCount.value = count;
        lastUnreadRefreshAt.value = Date.now();
      } catch (error) {
        logger.error('notifications-store', '刷新未读计数失败', error);
      }
    })();

    try {
      await unreadRefreshInflight.value;
    } finally {
      unreadRefreshInflight.value = null;
    }
  };

  const resetState = async (): Promise<void> => {
    hideToast();
    unreadCount.value = 0;
    notifications.value = [];
    currentUserId.value = null;
    unreadRefreshInflight.value = null;
    lastUnreadRefreshAt.value = 0;
    if (notificationSubscription.value) {
      await stopNotificationListener();
    }
  };

  return {
    unreadCount,
    notifications,
    notificationSubscription,
    currentUserId,
    showToast,
    toastTitle,
    toastDesc,
    toastIcon,
    displayToast,
    hideToast,
    startNotificationListener,
    stopNotificationListener,
    setUnreadCount,
    refreshUnreadCount,
    loadNotifications,
    resetState
  };
});