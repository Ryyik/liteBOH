import { ref, readonly } from 'vue';
import { logger } from '@/utils/logger.js';

/**
 * PWA 更新提示状态管理
 * 提供非阻塞的更新提示机制
 */

// 全局状态（单例模式）
const hasUpdate = ref(false);
const isChecking = ref(false);
const updateMessage = ref('');
let waitingWorker = null;

// 存储键名
const PROMPTED_VERSION_KEY = 'pwa_prompted_version';

/**
 * 获取 Service Worker 的版本标识
 * @param {ServiceWorker} worker - Service Worker 实例
 * @returns {string} 版本标识
 */
const getWorkerVersionId = (worker) => {
  if (!worker) return '';
  // 使用 scriptURL 和 state 组合作为版本标识
  // 由于 SW 更新后 scriptURL 相同，我们使用 worker 的内部状态标识
  // 实际上，当有新的 waiting worker 时，它的 scriptURL 相同但时间不同
  // 我们用一个更可靠的方案：检查 localStorage 中是否有新版本标识
  return `sw_${Date.now()}`;
};

/**
 * 检查是否已经提示过该版本
 * @param {ServiceWorker} worker - Service Worker 实例
 * @returns {boolean} 是否已提示过
 */
const hasPromptedVersion = (worker) => {
  // 使用 sessionStorage 确保同一会话只提示一次
  // 关闭浏览器后重新打开会重新提示
  const prompted = sessionStorage.getItem(PROMPTED_VERSION_KEY);
  return prompted === 'true';
};

/**
 * 记录已提示过更新
 */
const markVersionPrompted = () => {
  sessionStorage.setItem(PROMPTED_VERSION_KEY, 'true');
};

/**
 * 显示更新提示（由 main.js 或 Service Worker 事件触发）
 * @param {string} message - 提示消息
 * @param {ServiceWorker} worker - 等待中的 Service Worker
 */
export const showUpdatePrompt = (message = '网站已更新到新版本', worker = null) => {
  // 检查本次会话是否已经提示过
  if (hasPromptedVersion(worker)) {
    logger.info('pwa-update', '本次会话已提示过更新，跳过');
    return;
  }

  if (worker) {
    waitingWorker = worker;
  }
  hasUpdate.value = true;
  updateMessage.value = message;
  markVersionPrompted();
  logger.info('pwa-update', '显示更新提示', message);
};

/**
 * 隐藏更新提示
 */
export const hideUpdatePrompt = () => {
  hasUpdate.value = false;
  updateMessage.value = '';
};

/**
 * 应用更新（跳过等待并刷新）
 */
export const applyPWAUpdate = async () => {
  // 清除提示标记，允许下次会话重新提示
  sessionStorage.removeItem(PROMPTED_VERSION_KEY);

  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    logger.info('pwa-update', '发送 SKIP_WAITING 消息');
  } else {
    // 没有等待中的 worker，尝试从 registration 获取
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          logger.info('pwa-update', '从 registration 发送 SKIP_WAITING');
        } else {
          // 强制清除缓存并刷新
          await clearCacheAndRefresh();
        }
      } catch (err) {
        logger.error('pwa-update', '应用更新失败', err);
        await clearCacheAndRefresh();
      }
    } else {
      window.location.reload();
    }
  }
  hideUpdatePrompt();
};

/**
 * 稍后更新（隐藏提示，不刷新）
 */
export const postponeUpdate = () => {
  hideUpdatePrompt();
  logger.info('pwa-update', '用户选择稍后更新');
};

/**
 * 清除所有缓存并刷新页面
 */
const clearCacheAndRefresh = async () => {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      logger.info('pwa-update', '所有缓存已清除');
    }
    localStorage.removeItem('sw_last_update');
    sessionStorage.removeItem(PROMPTED_VERSION_KEY);
    window.location.reload();
  } catch (err) {
    logger.error('pwa-update', '清除缓存失败', err);
    window.location.reload();
  }
};

/**
 * 主动检查更新
 * @returns {Promise<boolean>} 是否发现新版本
 */
export const checkForPWAUpdate = async () => {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  // 开发环境不检查
  if (import.meta.env.DEV) {
    return false;
  }

  isChecking.value = true;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();

    // 检查是否有等待中的 worker
    if (registration.waiting) {
      showUpdatePrompt('发现新版本，点击立即更新', registration.waiting);
      isChecking.value = false;
      return true;
    }

    // 等待一段时间检测是否有新版本安装
    const found = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              clearTimeout(timeout);
              showUpdatePrompt('发现新版本，点击立即更新', newWorker);
              resolve(true);
            }
          });
        }
      });
    });

    isChecking.value = false;
    return found;
  } catch (err) {
    logger.error('pwa-update', '检查更新失败', err);
    isChecking.value = false;
    return false;
  }
};

/**
 * PWA 更新 Composable
 */
export const usePWAUpdate = () => {
  return {
    hasUpdate: readonly(hasUpdate),
    isChecking: readonly(isChecking),
    updateMessage: readonly(updateMessage),
    applyUpdate: applyPWAUpdate,
    postponeUpdate,
    checkForUpdate: checkForPWAUpdate
  };
};