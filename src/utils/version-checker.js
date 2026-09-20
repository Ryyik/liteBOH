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
const VERSION_REQUEST_TIMEOUT = 10_000;
// 新 SW 必须下载完整新预缓存才能激活并接管页面，本地弱网下远超秒级，
// 这里给足等待窗口；超时后走「注销旧 SW + 直连网络导航」的兜底（见 forceCleanAndReload）。
const SERVICE_WORKER_UPDATE_TIMEOUT = 10_000;

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

// Safari 在注销仍控制当前页面的 SW 后立刻导航时，仍可能命中旧的 NavigationRoute
// 缓存。更新时应先让新 SW 接管；其 cleanupOutdatedCaches 会负责移除旧预缓存。
// 返回 true 表示「可以安全导航」：要么新 SW 已接管（其预缓存里有新 index.html），
// 要么根本没有会拦截导航的 SW；返回 false 表示新 SW 未能及时接管，调用方必须
// 先注销旧 SW 再导航（旧 SW 会用旧预缓存的 index.html 应答任何导航，
// 查询串只影响 HTTP 缓存、影响不了 SW 预缓存 → 否则用户会看到一模一样的旧页面）。
const updateServiceWorkerBeforeReload = async () => {
  if (!('serviceWorker' in navigator)) return false;

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (!registrations.length) return false;

  let controllerChangeHandler = null;
  let timeoutId = null;
  const controllerChanged = new Promise((resolve) => {
    controllerChangeHandler = () => resolve(true);
    navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler, { once: true });
  });
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve(false), SERVICE_WORKER_UPDATE_TIMEOUT);
  });

  try {
    // 先让浏览器重新拉取 sw.js（updateViaCache:'none'，只等脚本字节比对完成，
    // 不等新 SW 的全量预缓存下载）。installing/waiting 一旦出现说明确有新版本。
    // 整条链路（update + 等接管）与超时对跑：弱网下 update() 挂起时也能按时兜底。
    const updatePromise = Promise.allSettled(registrations.map((registration) => registration.update()));
    const flow = updatePromise.then(() => {
      const hasPendingWorker = registrations.some((registration) => registration.installing || registration.waiting);
      if (!hasPendingWorker) {
        // 没有新 SW：当前活跃 SW 的预缓存清单已是最新，导航即可拿到新应用壳。
        return true;
      }
      // 有新 SW：等它完成安装并 claim 页面（skipWaiting + clientsClaim 下接管
      // 必然触发 controllerchange），新 SW 的预缓存里才有新的 index.html。
      return controllerChanged;
    });
    return await Promise.race([flow, timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    if (controllerChangeHandler) {
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
    }
  }
};

// 兜底：注销所有 SW 并清空 Cache Storage，让下一次导航直连网络。
// 仅在新 SW 无法及时接管时使用。
// ⚠️ 两个实测结论（scripts/probes/probe-version-update-click.mjs 抓到的）：
// ① Chrome 在「有新 SW 正在安装」时，unregister() 的 promise 会拖到安装结束
//    才 resolve（几十秒级），所以发起注销后只能给它一个短限时，不能 await 到底；
// ② 就算旧 SW 因注册未及摘除而继续拦截导航，Cache Storage 已被清空 →
//    workbox 的 NavigationRoute 预缓存未命中会回落到网络 fetch，
//    照样拿到新的 index.html。两件事合起来保证兜底导航必然离开旧文档。
const DISMANTLE_GRACE_MS = 1_000;

const dismantleServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const unregisterPromise = Promise.allSettled(
      registrations.map((registration) => registration.unregister())
    );
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
    await Promise.race([
      unregisterPromise,
      new Promise((resolve) => window.setTimeout(resolve, DISMANTLE_GRACE_MS)),
    ]);
    logger.warn('version', '已注销旧 SW 并清空缓存，本次导航将直连网络');
  } catch (err) {
    logger.warn('version', '注销旧 Service Worker 失败，仍尝试导航', err);
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
 * 让最新 Service Worker 接管后，使用带构建指纹的导航刷新页面。
 * 不主动删除 Workbox 缓存：旧 SW 仍控制当前页面时清缓存会让导航继续命中旧应用壳。
 */
export const forceCleanAndReload = async (targetBuildId = '') => {
  const safeTargetBuildId = String(targetBuildId || '').trim();
  const reloadPath = buildVersionReloadPath(window.location.href, safeTargetBuildId);

  logger.info('version', '用户确认更新，正在切换到最新应用壳', {
    from: currentVersion,
    buildId: currentBuildId,
  });

  let takeoverReady = false;
  try {
    if (safeTargetBuildId) {
      writeReloadTarget(safeTargetBuildId);
    }

    if ('serviceWorker' in navigator) {
      takeoverReady = await updateServiceWorkerBeforeReload();
    }
  } catch (err) {
    logger.error('version', '强制更新流程出错', err);
  } finally {
    // 只有「新 SW 已接管（预缓存里有新 index.html）」或「无 SW 拦截」时才能直接导航。
    // 否则必须先注销旧 SW：旧 SW 的 NavigationRoute 会用旧预缓存的 index.html
    // 应答任何带查询串的导航，用户点「立即更新」后会看到一模一样的旧页面。
    if (!takeoverReady) {
      await dismantleServiceWorkers();
    }
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
