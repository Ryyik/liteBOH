import { isCloudModerationCoolingDown } from '@/utils/image-moderation-pipeline.js';

export const useForumImageModerationPreload = (preloadForumImageModeration) => {
  let preloadTimer = null;
  let preloadIdleId = null;
  let hasScheduledPreload = false;

  /**
   * §9.3 P3（2026-10-04）：本地兜底模型**只在云端已被判定不可达时才值得预载**。
   *
   * 为什么：`nsfw-weights` chunk 实测 3516 KB raw / **2477 KB gzip**，而且整个文件里
   * 最长一行 360 万字符 —— 权重被内联成单个 JS 串，**要下载并当 JS 解析**（主线程大头）。
   * 云端可达时这个模型**一次都用不上**（审核走云端优先），白下这几 MB 正是「选图后卡顿」的成因之一。
   * 实测数据见 docs/2026-10-04-GitHub开源可引入方案调研.md §3.1。
   *
   * 为什么安全：真需要时**不依赖预载** —— 兜底 classify 路径本身是懒加载
   * （`forum-image-moderation.js` 的 `getNsfwModel()`），所以这里只省流量、不改变任何判定行为。
   *
   * ⚠️ 这个守卫必须放在 `hasScheduledPreload = true` **之前**：云端可达时提前返回且不置位，
   * 之后云端真的挂了（冷却开始）再调用仍能排上预载。
   *
   * ⚠️ 不能把这个守卫下沉到 `forum-image-moderation.js`：`image-moderation-pipeline.js`
   * 反过来 import 了它（`createImageElementForModeration` 等），在下沉会形成循环依赖。
   */
  const shouldPreloadLocalModel = () => isCloudModerationCoolingDown();

  // 基础网络守卫：省流量模式与极慢网络一律不预载
  const hasUsableConnection = () => {
    if (typeof window === 'undefined') return false;
    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
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
    const shortScreenSide = Math.min(
      Number(window.screen?.width || 0),
      Number(window.screen?.height || 0),
    );
    if (
      (deviceMemory > 0 && deviceMemory <= 4) ||
      isCoarsePointer ||
      (shortScreenSide > 0 && shortScreenSide <= 900)
    ) {
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
    // §9.3 P3：云端可达就不下本地模型（见 shouldPreloadLocalModel 注释）
    if (!shouldPreloadLocalModel()) return;
    const allowed = immediate ? hasUsableConnection() : shouldPreload();
    if (!allowed) return;
    hasScheduledPreload = true;

    const runPreload = () => {
      preloadIdleId = null;
      void preloadForumImageModeration();
    };

    preloadTimer = setTimeout(
      () => {
        preloadTimer = null;
        if (typeof window.requestIdleCallback === 'function') {
          preloadIdleId = window.requestIdleCallback(runPreload, {
            timeout: immediate ? 2000 : 12000,
          });
          return;
        }
        runPreload();
      },
      immediate ? 0 : 2500,
    );
  };

  return {
    clearForumImageModerationPreloadTask: clearPreloadTask,
    scheduleForumImageModerationPreload: schedulePreload,
  };
};
