import { ref } from 'vue';
import { logger } from '@/utils/logger.js';
import { checkVersion, forceCleanAndReload } from '@/utils/version-checker.js';

/**
 * 版本检测 Composable
 * 基于 version-checker 的 HTTP 拉取 version.json 机制（绕过 SW 缓存，可靠检测任何代码变更）
 * 不再依赖 SW registration.waiting（skipWaiting:true 下永远没有 waiting 状态，导致检测失效）
 */
export const useVersionCheck = () => {
  const isChecking = ref(false);
  const hasUpdate = ref(false);
  const lastCheckTime = ref(null);

  /**
   * 检测是否有新版本（HTTP 拉取 version.json 比对，绕过 SW 缓存）
   * @returns {Promise<{hasUpdate: boolean, message: string}>}
   */
  const checkForUpdate = async () => {
    isChecking.value = true;
    hasUpdate.value = false;

    try {
      const result = await checkVersion();
      hasUpdate.value = result.hasUpdate;
      lastCheckTime.value = new Date().toLocaleString('zh-CN');
      return result;
    } catch (error) {
      logger.error('version-check', '版本检测失败', error);
      return {
        hasUpdate: false,
        message: '版本检测失败，请稍后重试'
      };
    } finally {
      isChecking.value = false;
    }
  };

  /**
   * 应用更新（清除 SW + 缓存并强制刷新）
   * @returns {Promise<boolean>}
   */
  const applyUpdate = async () => {
    // 开发环境下直接强制刷新
    if (import.meta.env.DEV) {
      window.location.reload();
      return true;
    }

    await forceCleanAndReload();
    return true;
  };

  /**
   * 强制刷新（清除所有缓存）
   */
  const forceRefresh = async () => {
    try {
      // 清除 Service Worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      // 清除所有缓存
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // 清除 localStorage 和 sessionStorage 中的缓存标记
      localStorage.removeItem('sw_last_update');
      sessionStorage.clear();

      // 强制刷新页面
      window.location.reload();
    } catch (error) {
      logger.error('version-check', '强制刷新失败', error);
      // 即使失败也尝试刷新
      window.location.reload();
    }
  };

  return {
    isChecking,
    hasUpdate,
    lastCheckTime,
    checkForUpdate,
    applyUpdate,
    forceRefresh
  };
};
