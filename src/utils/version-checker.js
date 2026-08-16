import { logger } from './logger.js';

// ============================================
// 独立版本指纹检测器
// 绕过 Service Worker 缓存，直接通过 HTTP 拉取 version.json 比对
// 版本不一致时：注销 SW + 清空 Cache Storage + 强制刷新
//
// 版本数据分离：
// - version: 语义版本（如 4.7.2，用户可见展示）
// - buildId: 构建指纹（commit+timestamp，内部比对基准）
// 比对 buildId 而非 version，确保同版本重新部署（hotfix）也能触发更新
// ============================================

const CHECK_INTERVAL = 5 * 60 * 1000; // 每 5 分钟检查一次
const VERSION_URL = './version.json'; // 相对路径，适配任意部署路径
const RELOAD_TARGET_KEY = 'boh_version_reload_target';
const UPDATE_QUERY_KEY = '__boh_update';
const UPDATE_CLEANUP_TIMEOUT = 1500;
const VERSION_REQUEST_TIMEOUT = 10_000;

let intervalId = null;
let visibilityHandler = null;
let versionFetchInFlight = null;
let automaticCheckInFlight = null;
let currentVersion = null; // 当前语义版本（来自 meta boh-version，如 4.7.2）
let currentBuildId = null; // 当前构建指纹（来自 meta boh-build-id，用于比对）

export const shouldAutoApplyVersion = (remoteBuildId, attemptedBuildId = '') => {
  const target = String(remoteBuildId || '').trim();
  return Boolean(target && target !== String(attemptedBuildId || '').trim());
};

export const buildVersionReloadPath = (href, targetBuildId = '') => {
  const reloadUrl = new URL(href);
  reloadUrl.searchParams.delete('forceUpdate');
  reloadUrl.searchParams.delete('clearCache');
  reloadUrl.searchParams.set(UPDATE_QUERY_KEY, String(targetBuildId || Date.now()));
  return `${reloadUrl.pathname}${reloadUrl.search}${reloadUrl.hash}`;
};

const waitForCleanup = async (cleanupPromise, timeout = UPDATE_CLEANUP_TIMEOUT) => {
  let timeoutId = null;
  try {
    return await Promise.race([
      cleanupPromise.then(() => true),
      new Promise((resolve) => {
        timeoutId = window.setTimeout(() => resolve(false), timeout);
      }),
    ]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
};

const readReloadTarget = () => {
  let storedTarget = '';
  try {
    storedTarget = sessionStorage.getItem(RELOAD_TARGET_KEY) || '';
  } catch (err) {
    logger.warn('version', '无法读取目标构建标记', err);
  }
  if (storedTarget) return storedTarget;

  // sessionStorage 不可用时，刷新 URL 中的目标构建仍能阻止自动刷新循环。
  try {
    return new URL(window.location.href).searchParams.get(UPDATE_QUERY_KEY) || '';
  } catch {
    return '';
  }
};

const writeReloadTarget = (targetBuildId) => {
  try {
    sessionStorage.setItem(RELOAD_TARGET_KEY, targetBuildId);
  } catch (err) {
    logger.warn('version', '无法记录目标构建，继续执行更新', err);
  }
};

const clearReloadTarget = () => {
  try {
    sessionStorage.removeItem(RELOAD_TARGET_KEY);
  } catch (err) {
    logger.warn('version', '无法清除目标构建标记', err);
  }
};

/**
 * 从 meta 标签读取当前页面语义版本
 * 该版本在构建时由 bohVersionPlugin 注入到 index.html
 */
const readCurrentVersion = () => {
  const meta = document.querySelector('meta[name="boh-version"]');
  return meta?.getAttribute('content') || null;
};

/**
 * 从 meta 标签读取当前页面构建指纹
 * 该指纹在构建时由 bohVersionPlugin 注入到 index.html
 */
const readCurrentBuildId = () => {
  const meta = document.querySelector('meta[name="boh-build-id"]');
  return meta?.getAttribute('content') || null;
};

/**
 * 强制拉取远程 version.json
 * 使用 cache: 'no-store' 绕过浏览器缓存
 * 加时间戳查询参数绕过 CDN 缓存（GitHub Pages CDN 对 .json 有缓存）
 */
const fetchRemoteVersion = () => {
  if (versionFetchInFlight) return versionFetchInFlight;

  versionFetchInFlight = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), VERSION_REQUEST_TIMEOUT);
    try {
      const url = `${VERSION_URL}?_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`version.json 请求失败: ${res.status}`);
      }
      return await res.json();
    } finally {
      window.clearTimeout(timeoutId);
    }
  })().finally(() => {
    versionFetchInFlight = null;
  });

  return versionFetchInFlight;
};

/**
 * 清除所有 Service Worker 和 Cache Storage，然后刷新页面
 * 用户在更新提示弹窗中点击"立即更新"后调用
 */
export const forceCleanAndReload = async (targetBuildId = '') => {
  const safeTargetBuildId = String(targetBuildId || '').trim();
  const reloadPath = buildVersionReloadPath(window.location.href, safeTargetBuildId);

  logger.info('version', '用户确认更新，开始清除缓存并刷新', {
    from: currentVersion,
    buildId: currentBuildId,
  });

  try {
    if (safeTargetBuildId) {
      writeReloadTarget(safeTargetBuildId);
    }

    // 必须先完成 SW 注销，否则超时导航仍可能被旧 SW 接管并返回旧页面。
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));
      logger.info('version', `已注销 ${registrations.length} 个 Service Worker`);
    }

    // Cache Storage 在部分 WebKit 环境可能长时间不结束。SW 已注销后，即使
    // 缓存清理超时，带构建指纹的导航也会直接访问网络，不会再被旧 SW 拦截。
    if ('caches' in window) {
      const cacheCleanupCompleted = await waitForCleanup(
        caches.keys().then(async (keys) => {
          await Promise.allSettled(keys.map((key) => caches.delete(key)));
          logger.info('version', `已清除 ${keys.length} 个缓存`);
        })
      );
      if (!cacheCleanupCompleted) {
        logger.warn('version', '缓存清理等待超时，继续刷新');
      }
    }
  } catch (err) {
    logger.error('version', '强制更新流程出错', err);
  } finally {
    // 无论清理成功、失败或超时，都必须离开当前旧文档。查询参数同时
    // 绕过浏览器和 CDN 对 index.html 的缓存，并保留 Hash 路由。
    try {
      window.location.replace(reloadPath);
    } catch (err) {
      logger.error('version', '更新导航失败，退回普通刷新', err);
      window.location.reload();
    }
  }
};

// 标记本次会话是否已派发过更新提示，避免重复弹窗打扰
let updateNotified = false;

/**
 * 通知应用层有新版本可用（由自动轮询/visibilitychange 触发）
 * 通过自定义事件让 PWAUpdateToast 弹出统一对话框，不直接刷新
 */
const notifyUpdateAvailable = (remoteVersion, remoteBuildId) => {
  if (updateNotified) {
    logger.debug('version', '本次会话已派发过更新提示，跳过');
    return;
  }
  updateNotified = true;
  logger.info('version', '派发 boh:update-available 事件', { remoteVersion, remoteBuildId });
  window.dispatchEvent(new CustomEvent('boh:update-available', {
    detail: {
      remoteVersion,
      remoteBuildId,
      currentVersion,
      currentBuildId,
      message: `发现新版本 ${remoteVersion}，建议立即刷新以获取最新内容。`,
    },
  }));
};

const clearCompletedReloadState = (remoteBuildId) => {
  if (!remoteBuildId || remoteBuildId !== currentBuildId) return;
  clearReloadTarget();
  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has(UPDATE_QUERY_KEY)) return;
  currentUrl.searchParams.delete(UPDATE_QUERY_KEY);
  window.history.replaceState(
    window.history.state,
    '',
    `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
  );
};

/**
 * 执行一次版本检查（只检测，不自动刷新）
 * 比对 buildId（构建指纹），同版本重新部署也能触发更新
 * @returns {Promise<{hasUpdate: boolean, message: string, remoteVersion?: string, currentVersion?: string, remoteBuildId?: string}>}
 */
export const checkVersion = async () => {
  // 开发环境跳过
  if (import.meta.env.DEV) {
    return { hasUpdate: false, message: '开发环境下版本检测不可用，请在生产环境使用' };
  }

  // 首次运行时记录当前版本与构建指纹
  if (!currentVersion) {
    currentVersion = readCurrentVersion();
    if (!currentVersion) {
      // 没有 meta 标签（可能是旧版本页面），不强制更新，避免误判
      logger.warn('version', '未找到版本 meta 标签，跳过版本检测');
      return { hasUpdate: false, message: '未找到版本信息，无法检测更新' };
    }
    currentBuildId = readCurrentBuildId();
    logger.debug('version', '当前页面版本', { version: currentVersion, buildId: currentBuildId });
  }

  try {
    const remote = await fetchRemoteVersion();
    if (!remote?.buildId) {
      logger.warn('version', 'version.json 缺少 buildId 字段', remote);
      return { hasUpdate: false, message: '版本信息读取失败' };
    }

    // 比对构建指纹：同版本重新部署（hotfix）时 buildId 变化也能触发更新
    if (remote.buildId !== currentBuildId) {
      logger.info('version', '发现新版本', {
        currentVersion,
        remoteVersion: remote.version,
        currentBuildId,
        remoteBuildId: remote.buildId,
      });
      return {
        hasUpdate: true,
        message: `发现新版本 ${remote.version}，可以立即更新`,
        remoteVersion: remote.version,
        currentVersion,
        remoteBuildId: remote.buildId,
      };
    }

    clearCompletedReloadState(remote.buildId);
    logger.debug('version', '版本一致，无需更新', { version: currentVersion, buildId: currentBuildId });
    return {
      hasUpdate: false,
      message: `当前已是最新版本 ${currentVersion}`,
      currentVersion,
    };
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
  if (intervalId || visibilityHandler) {
    logger.debug('version', '版本检测器已初始化，跳过重复启动');
    return;
  }

  // 自动轮询检测：检测到新版本时派发 boh:update-available 事件，
  // 由 PWAUpdateToast 弹出统一对话框提示用户，不直接强制刷新
  const isTypingInForm = (el) => {
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  };

  const autoCheck = ({ autoApply = false } = {}) => {
    if (automaticCheckInFlight) return automaticCheckInFlight;

    automaticCheckInFlight = (async () => {
      try {
        const result = await checkVersion();
        if (result.hasUpdate) {
          const attemptedTarget = readReloadTarget();
          if (autoApply && shouldAutoApplyVersion(result.remoteBuildId, attemptedTarget)) {
            // L11 加固：用户正在输入时跳过自动强刷，保持页面可用；
            // 后续 visibilitychange 触发的检查仍有机会完成更新
            if (isTypingInForm(document.activeElement)) {
              logger.info('version', '用户正在输入，跳过本次自动强刷', {
                remoteBuildId: result.remoteBuildId,
              });
            } else {
              logger.info('version', '页面启动时发现新构建，自动清理旧缓存并刷新', {
                currentBuildId,
                remoteBuildId: result.remoteBuildId,
              });
              await forceCleanAndReload(result.remoteBuildId);
              return;
            }
          }
          notifyUpdateAvailable(result.remoteVersion, result.remoteBuildId);
        }
      } catch (err) {
        logger.warn('version', '自动版本检查异常', err?.message || err);
      }
    })().finally(() => {
      automaticCheckInFlight = null;
    });

    return automaticCheckInFlight;
  };

  // 页面启动时若发现自己属于旧构建，自动应用一次新构建。同一目标 buildId
  // 只尝试一次，CDN 尚未完成切换时会退回更新提示，避免刷新循环。
  void autoCheck({ autoApply: true });

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
