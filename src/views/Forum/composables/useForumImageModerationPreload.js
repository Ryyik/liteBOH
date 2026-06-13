export const useForumImageModerationPreload = (preloadForumImageModeration) => {
  let preloadTimer = null;
  let preloadIdleId = null;
  let hasScheduledPreload = false;

  const shouldPreload = () => {
    if (typeof window === 'undefined') return false;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    if (connection?.saveData) return false;
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return false;
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

  const schedulePreload = () => {
    if (hasScheduledPreload || !shouldPreload()) return;
    hasScheduledPreload = true;

    const runPreload = () => {
      preloadIdleId = null;
      void preloadForumImageModeration();
    };

    preloadTimer = setTimeout(() => {
      preloadTimer = null;
      if (typeof window.requestIdleCallback === 'function') {
        preloadIdleId = window.requestIdleCallback(runPreload, { timeout: 12000 });
        return;
      }
      runPreload();
    }, 2500);
  };

  return {
    clearForumImageModerationPreloadTask: clearPreloadTask,
    scheduleForumImageModerationPreload: schedulePreload
  };
};
