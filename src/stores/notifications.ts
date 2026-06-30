import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '@/utils/logger.js';
import type { NotificationPayload } from '@/types';
import type * as AuthModule from '@/utils/auth.js';

let authApiPromise: Promise<typeof AuthModule> | null = null;
const loadAuthApi = async (): Promise<typeof AuthModule> => {
  if (!authApiPromise) {
    authApiPromise = import('@/utils/auth.js');
  }
  try {
    return await authApiPromise;
  } catch (error) {
    authApiPromise = null;
    throw error;
  }
};

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0);
  const notificationPending = ref(false);
  const currentUserId = ref<string | null>(null);
  const unreadRefreshInflight = ref<Promise<void> | null>(null);
  const lastUnreadRefreshAt = ref(0);
  const UNREAD_REFRESH_MIN_INTERVAL_MS = 1200;

  let _unreadRefreshHandler: (() => void) | null = null;

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

  const startNotificationListener = async (userId: string): Promise<void> => {
    if (!userId) return;
    currentUserId.value = userId;

    // 避免重复注册监听器
    await stopNotificationListener();

    // 监听全局未读刷新事件（仅在浏览器环境）
    if (typeof window !== 'undefined') {
      const handleUnreadRefresh = async () => {
        await refreshUnreadCount({ force: true });
      };
      window.addEventListener('boh_unread_refresh', handleUnreadRefresh);
      _unreadRefreshHandler = handleUnreadRefresh;
    }

    // 初始刷新
    await refreshUnreadCount({ force: true });
  };

  const stopNotificationListener = async (): Promise<void> => {
    if (_unreadRefreshHandler && typeof window !== 'undefined') {
      window.removeEventListener('boh_unread_refresh', _unreadRefreshHandler);
    }
    _unreadRefreshHandler = null;
  };

  const setUnreadCount = (count: number): void => {
    unreadCount.value = count;
  };

  const refreshUnreadCount = async ({ force = false } = {}): Promise<void> => {
    if (force) {
      try {
        const { invalidateByTags } = await loadAuthApi();
        invalidateByTags(['notifications']);
      } catch (error) {
        logger.warn('notifications-store', '缓存失效失败', error);
      }
    }

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
    notificationPending.value = false;
    currentUserId.value = null;
    unreadRefreshInflight.value = null;
    lastUnreadRefreshAt.value = 0;
    await stopNotificationListener();
  };

  return {
    unreadCount,
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
    resetState
  };
});