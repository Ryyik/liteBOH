export const useForumImageModerationPreload = (preloadForumImageModeration) => {
  let preloadTimer = null;
  let preloadIdleId = null;
  let hasScheduledPreload = false;

  // 基础网络守卫：省流量模式与极慢网络一律不预载
  const hasUsableConnection = () => {
    if (typeof window === 'undefined') return false;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    if (connection?.saveData) return false;
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return false;
    return true;
  };

  // 页面空闲时的全量预载：仅桌面大屏设备
  const shouldPreload = () => {
    if (!hasUsableConnection()) return false;
    const deviceMemory = Number(navigator.deviceMemory || 0);
    const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true;
    const shortScreenSide = Math.min(Number(window.screen?.width || 0), Number(window.screen?.height || 0));
    if ((deviceMemory > 0 && deviceMemory <= 4) || isCoarsePointer || (shortScreenSide > 0 && shortScreenSide <= 900)) {
      return false;
    }
    return true;
  };

  const clearPreloadTask = () => {
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }
    if (preloadIdleId && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(preloadIdleId);
      preloadIdleId = null;
    }
  };

  // 意图预载：用户已打开编辑器/选图，说明大概率要发图，
  // 移动端也值得此时才开始下载模型（绕过设备档位限制，仅保留网络守卫）
  const schedulePreload = ({ immediate = false } = {}) => {
    if (hasScheduledPreload) return;
    const allowed = immediate ? hasUsableConnection() : shouldPreload();
    if (!allowed) return;
    hasScheduledPreload = true;

    const runPreload = () => {
      preloadIdleId = null;
      void preloadForumImageModeration();
    };

    preloadTimer = setTimeout(() => {
      preloadTimer = null;
      if (typeof window.requestIdleCallback === 'function') {
        preloadIdleId = window.requestIdleCallback(runPreload, { timeout: immediate ? 2000 : 12000 });
        return;
      }
      runPreload();
    }, immediate ? 0 : 2500);
  };

  return {
    clearForumImageModerationPreloadTask: clearPreloadTask,
    scheduleForumImageModerationPreload: schedulePreload
  };
};
