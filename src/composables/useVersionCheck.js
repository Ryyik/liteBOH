import { ref } from 'vue';
import { logger } from '@/utils/logger.js';

/**
 * 版本检测 Composable
 * 利用 Service Worker 检测网站是否有新版本
 */
export const useVersionCheck = () => {
  const isChecking = ref(false);
  const hasUpdate = ref(false);
  const lastCheckTime = ref(null);

  /**
   * 检测是否有新版本
   * @returns {Promise<{hasUpdate: boolean, message: string}>}
   */
  const checkForUpdate = async () => {
    // 开发环境下直接返回提示
    if (import.meta.env.DEV) {
      return {
        hasUpdate: false,
        message: '开发环境下版本检测不可用，请在生产环境使用'
      };
    }

    if (!('serviceWorker' in navigator)) {
      return {
        hasUpdate: false,
        message: '当前浏览器不支持版本检测功能'
      };
    }

    isChecking.value = true;
    hasUpdate.value = false;

    try {
      // 检查是否有已注册的 Service Worker
      const registrations = await navigator.serviceWorker.getRegistrations();

      if (registrations.length === 0) {
        isChecking.value = false;
        return {
          hasUpdate: false,
          message: '当前未启用 PWA 缓存，请刷新页面后重试'
        };
      }

      const registration = registrations[0];

      // 触发 Service Worker 更新检查
      await registration.update();

      // 等待一段时间检测是否有新版本安装
      // 如果有 waiting 状态的 worker，说明有新版本
      const checkResult = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // 超时：没有发现新版本
          resolve({ hasUpdate: false, message: '当前已是最新版本' });
        }, 5000);

        // 监听 updatefound 事件
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                clearTimeout(timeout);
                hasUpdate.value = true;
                resolve({ hasUpdate: true, message: '发现新版本，可以立即更新' });
              }
            });
          }
        });

        // 检查是否已经有等待中的 worker
        if (registration.waiting) {
          clearTimeout(timeout);
          hasUpdate.value = true;
          resolve({ hasUpdate: true, message: '发现新版本，可以立即更新' });
        }
      });

      lastCheckTime.value = new Date().toLocaleString('zh-CN');
      isChecking.value = false;
      return checkResult;
    } catch (error) {
      logger.error('version-check', '版本检测失败', error);
      isChecking.value = false;
      return {
        hasUpdate: false,
        message: '版本检测失败，请稍后重试'
      };
    }
  };

  /**
   * 应用更新（清除缓存并刷新页面）
   * @returns {Promise<boolean>}
   */
  const applyUpdate = async () => {
    // 开发环境下直接强制刷新
    if (import.meta.env.DEV) {
      window.location.reload();
      return true;
    }

    if (!('serviceWorker' in navigator)) {
      return false;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length === 0) {
        window.location.reload();
        return true;
      }

      const registration = registrations[0];

      // 如果有等待中的 worker，发送 SKIP_WAITING 消息
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return true;
      }

      // 如果没有等待中的 worker，强制清除所有缓存并刷新
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // 强制刷新页面
      window.location.reload();
      return true;
    } catch (error) {
      logger.error('version-check', '应用更新失败', error);
      return false;
    }
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