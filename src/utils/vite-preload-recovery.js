import { forceCleanAndReload } from './version-checker.js';

const VITE_PRELOAD_RELOAD_TS_KEY = 'boh_vite_preload_reload_ts';
const VITE_PRELOAD_RELOAD_COOLDOWN_MS = 30 * 1000;

/**
 * 动态模块加载失败的统一恢复入口（单源）。
 *
 * 适用：vite:preloadError 事件、以及任何组件级 defineAsyncComponent 的 loader
 * 失败（后者不走路由，router.onError 管不到）。
 *
 * 部署刚完成时，旧入口引用的 hash chunk 可能已不存在；旧 Service Worker 的
 * NavigationRoute 又会用旧预缓存的 index.html 应答裸 location.reload()——
 * 刷完还是旧文档、再点还是 404（空白弹窗/空白区块会持续到冷却期外）。
 * 所以这里必须走 forceCleanAndReload()：先让新 SW 接管（或注销旧 SW + 清缓存），
 * 再带查询参数导航到最新构建。
 *
 * 返回 true 表示已发起恢复；false 表示 DEV / 环境异常 / 冷却期内未采取动作。
 */
export function recoverDynamicImportFailure() {
  if (import.meta.env.DEV || typeof window === 'undefined') return false;

  const now = Date.now();
  let lastReloadAt = 0;
  try {
    lastReloadAt = Number(sessionStorage.getItem(VITE_PRELOAD_RELOAD_TS_KEY) || 0);
  } catch {
    lastReloadAt = 0;
  }

  // 限流强刷，避免资源持续异常时反复刷新。
  if (Number.isFinite(lastReloadAt) && now - lastReloadAt < VITE_PRELOAD_RELOAD_COOLDOWN_MS) {
    return false;
  }

  try {
    sessionStorage.setItem(VITE_PRELOAD_RELOAD_TS_KEY, String(now));
  } catch {
    // ignore
  }
  void forceCleanAndReload();
  return true;
}

export function setupVitePreloadErrorRecovery() {
  if (import.meta.env.DEV || typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    // 冷却期内不 preventDefault：让 Vite 把错误 rethrow 到控制台，保留可观测性。
    const handled = recoverDynamicImportFailure();
    if (handled && typeof event?.preventDefault === 'function') {
      event.preventDefault();
    }
  });
}
