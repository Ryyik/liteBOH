import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { logger } from '@/utils/logger.js';
import type * as AuthModule from '@/utils/auth.js';

/**
 * 应用图标角标（Badging API）。
 *
 * ⚠️ 这里是角标数字的**唯一落点** —— 别在组件里另调 setAppBadge。
 *    数字来源就是下面的 unreadCount，而它来自服务端 get_unread_notification_count；
 *    推送侧（Service Worker）用的是同口径的 boh_count_unread_notifications，
 *    两处数字天然一致。
 *
 * 平台差异（必须知道，否则会以为坏了）：
 *   · 桌面 Chrome/Edge（已安装 PWA）、iOS Safari 16.4+（已加到主屏）→ 显示数字
 *   · Chrome for Android **不支持** setAppBadge（MDN 兼容表明确 No）→ 这里静默跳过，
 *     安卓的角标由系统在「存在未读通知」时自动点亮，表现为圆点而非数字
 */
const applyAppBadge = async (count: number): Promise<void> => {
  if (typeof navigator === 'undefined') return;
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    // 必须 await：setAppBadge/clearAppBadge 返回 Promise，
    // 不 await 的话 rejection（如 iOS 未授权时的 NotAllowedError）会变成 unhandled rejection
    if (count > 0) {
      await badgeNavigator.setAppBadge?.(count);
    } else {
      await badgeNavigator.clearAppBadge?.();
    }
  } catch (error) {
    // 平台不支持或权限未授予：绝不能让角标影响徽标逻辑
    logger.warn('notifications-store', '更新应用角标失败（忽略）', error);
  }
};

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
  let _swMessageHandler: ((event: MessageEvent) => void) | null = null;

  // 角标跟随未读数：用 watch 而不是在每个赋值点手动调用，
  // 这样将来任何新增的「改 unreadCount」路径都会自动带上角标，不会漏掉一处。
  watch(unreadCount, (value) => {
    void applyAppBadge(Number(value) || 0);
  });

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

    // Service Worker 在用户点开推送通知后会把目标地址 postMessage 过来。
    // 让页面自己走 hash 路由，比 openWindow 新开一个窗口体验好。
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const handleServiceWorkerMessage = (event: MessageEvent) => {
        const payload = event?.data;
        if (payload?.type !== 'boh-notification-click') return;
        const url = String(payload.url || '');
        if (!url.startsWith('/#')) return;
        if (window.location.hash !== url.slice(1)) {
          window.location.hash = url.slice(1);
        }
      };
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      _swMessageHandler = handleServiceWorkerMessage;
    }

    // 静默对齐这台设备的推送订阅（换账号后需要重新归属，否则新账号收不到推送）
    void import('@/utils/api/push-api.js')
      .then((module) => module.syncPushSubscription(userId))
      .catch(() => { /* 未开启推送 / 不支持：静默 */ });

    // 初始刷新
    await refreshUnreadCount({ force: true });
  };

  const stopNotificationListener = async (): Promise<void> => {
    if (_unreadRefreshHandler && typeof window !== 'undefined') {
      window.removeEventListener('boh_unread_refresh', _unreadRefreshHandler);
    }
    _unreadRefreshHandler = null;

    if (_swMessageHandler && typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.removeEventListener('message', _swMessageHandler);
    }
    _swMessageHandler = null;
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