import { logger } from './logger.js';

// ============================================
// 独立版本指纹检测器
// 绕过 Service Worker 缓存，直接通过 HTTP 拉取 version.json 比对
// 版本不一致时：注销 SW + 清空 Cache Storage + 强制刷新
// ============================================

const CHECK_INTERVAL = 5 * 60 * 1000; // 每 5 分钟检查一次
const VERSION_URL = './version.json'; // 相对路径，适配任意部署路径
const RELOAD_FLAG = 'boh_version_reloading'; // 防止刷新死循环的标记

let intervalId = null;
let visibilityHandler = null;
let currentVersion = null; // 当前页面加载时的版本（来自 meta 标签）

/**
 * 从 meta 标签读取当前页面版本
 * 该版本在构建时由 bohVersionPlugin 注入到 index.html
 */
const readCurrentVersion = () => {
  const meta = document.querySelector('meta[name="boh-version"]');
  return meta?.getAttribute('content') || null;
};

/**
 * 强制拉取远程 version.json
 * 使用 cache: 'no-store' 绕过浏览器缓存
 * 加时间戳查询参数绕过 CDN 缓存（GitHub Pages CDN 对 .json 有缓存）
 */
const fetchRemoteVersion = async () => {
  const url = `${VERSION_URL}?_t=${Date.now()}`;
  const res = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`version.json 请求失败: ${res.status}`);
  }
  return res.json();
};

/**
 * 清除所有 Service Worker 和 Cache Storage，然后刷新页面
 * 用户在更新提示弹窗中点击"立即更新"后调用
 */
export const forceCleanAndReload = async () => {
  // 防止刷新死循环：如果刚刚已经触发过刷新，则不再重复
  if (sessionStorage.getItem(RELOAD_FLAG) === 'true') {
    sessionStorage.removeItem(RELOAD_FLAG);
    logger.warn('version', '检测到刷新标记，跳过本次强制更新以避免死循环');
    return;
  }
  sessionStorage.setItem(RELOAD_FLAG, 'true');

  logger.info('version', '用户确认更新，开始清除缓存并刷新', {
    from: currentVersion,
  });

  try {
    // 1. 注销所有 Service Worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
      logger.info('version', `已注销 ${registrations.length} 个 Service Worker`);
    }

    // 2. 清空所有 Cache Storage
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      logger.info('version', `已清除 ${keys.length} 个缓存`);
    }

    // 3. 强制刷新（使用 replace 避免在历史记录中留下旧版本入口）
    window.location.replace(window.location.pathname + window.location.hash);
  } catch (err) {
    logger.error('version', '强制更新流程出错', err);
    // 即使出错也尝试刷新
    window.location.reload();
  }
};

// 标记本次会话是否已派发过更新提示，避免重复弹窗打扰
let updateNotified = false;

/**
 * 通知应用层有新版本可用（由自动轮询/visibilitychange 触发）
 * 通过自定义事件让 PWAUpdateToast 弹出统一对话框，不直接刷新
 */
const notifyUpdateAvailable = (remoteVersion) => {
  if (updateNotified) {
    logger.debug('version', '本次会话已派发过更新提示，跳过');
    return;
  }
  updateNotified = true;
  logger.info('version', '派发 boh:update-available 事件', { remoteVersion });
  window.dispatchEvent(new CustomEvent('boh:update-available', {
    detail: {
      remoteVersion,
      currentVersion,
      message: '发现新版本，建议立即刷新以获取最新内容。',
    },
  }));
};

/**
 * 执行一次版本检查（只检测，不自动刷新）
 * @returns {Promise<{hasUpdate: boolean, message: string, remoteVersion?: string, currentVersion?: string}>}
 */
export const checkVersion = async () => {
  // 开发环境跳过
  if (import.meta.env.DEV) {
    return { hasUpdate: false, message: '开发环境下版本检测不可用，请在生产环境使用' };
  }

  // 首次运行时记录当前版本
  if (!currentVersion) {
    currentVersion = readCurrentVersion();
    if (!currentVersion) {
      // 没有 meta 标签（可能是旧版本页面），不强制更新，避免误判
      logger.warn('version', '未找到版本 meta 标签，跳过版本检测');
      return { hasUpdate: false, message: '未找到版本信息，无法检测更新' };
    }
    logger.debug('version', '当前页面版本', currentVersion);
  }

  try {
    const remote = await fetchRemoteVersion();
    if (!remote?.version) {
      logger.warn('version', 'version.json 缺少 version 字段', remote);
      return { hasUpdate: false, message: '版本信息读取失败' };
    }

    if (remote.version !== currentVersion) {
      logger.info('version', '发现新版本', {
        current: currentVersion,
        remote: remote.version,
      });
      return {
        hasUpdate: true,
        message: '发现新版本，可以立即更新',
        remoteVersion: remote.version,
        currentVersion,
      };
    }

    logger.debug('version', '版本一致，无需更新', currentVersion);
    return { hasUpdate: false, message: '当前已是最新版本' };
  } catch (err) {
    // version.json 拉取失败不阻塞用户，仅记录日志
    // 可能是网络问题或 GitHub Pages CDN 暂时不可用
    logger.warn('version', '版本检查失败', err?.message || err);
    return { hasUpdate: false, message: '版本检查失败，请稍后重试' };
  }
};

/**
 * 初始化版本检测器
 * 启动定时轮询 + 页面可见性监听
 */
export const initVersionChecker = () => {
  if (import.meta.env.DEV) {
    logger.debug('version', '开发环境，跳过版本检测器初始化');
    return;
  }

  // 自动轮询检测：检测到新版本时派发 boh:update-available 事件，
  // 由 PWAUpdateToast 弹出统一对话框提示用户，不直接强制刷新
  const autoCheck = async () => {
    try {
      const result = await checkVersion();
      if (result.hasUpdate) {
        notifyUpdateAvailable(result.remoteVersion);
      }
    } catch (err) {
      logger.warn('version', '自动版本检查异常', err?.message || err);
    }
  };

  // 页面加载完成后延迟 10 秒首次检查，避免与首屏资源争抢
  setTimeout(() => {
    autoCheck();
  }, 10 * 1000);

  // 定时轮询
  intervalId = setInterval(() => {
    autoCheck();
  }, CHECK_INTERVAL);

  // 页面从隐藏切换回可见时立即检查
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      autoCheck();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  logger.info('version', `版本检测器已启动（每 ${CHECK_INTERVAL / 1000 / 60} 分钟检查一次，检测到新版本将弹窗提示）`);
};

/**
 * 销毁版本检测器（一般不需要手动调用）
 */
export const destroyVersionChecker = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
};
