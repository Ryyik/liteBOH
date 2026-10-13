import { forceCleanAndReload } from './version-checker.js';
import { logger } from './logger.js';
import { reportEvent } from './monitoring.js';

const VITE_PRELOAD_RELOAD_TS_KEY = 'boh_vite_preload_reload_ts';
const VITE_PRELOAD_RELOAD_COOLDOWN_MS = 30 * 1000;

/**
 * 从 vite:preloadError 的 payload 里取出失败资源的**文件名**（不是整条 URL：
 * 只看得出「哪个文件在坏」就够了，URL 会带上域名/查询串把上报数据打散）。
 */
export const extractCssAssetName = (payload) => {
  const message = String(payload?.message || payload || '');
  const matched =
    message.match(/Unable to preload CSS for\s+(\S+)/i) ||
    message.match(/(\S+\.css(?:\?\S*)?)\s*$/i);
  if (!matched) return '';
  try {
    return new URL(matched[1], 'https://placeholder.invalid/').pathname.split('/').pop();
  } catch {
    return matched[1].split('/').pop();
  }
};

/* 同一会话里同一个资源只报一次：持续故障时页面会被恢复链/自愈反复重试，
   不限流的话一次会话就能刷出几十条同样的上报，把「哪个资源在坏」这个信号淹掉。 */
const reportedCssAssets = new Set();

/** 仅供测试：清空去重表 */
export const resetCssPreloadFailureReports = () => reportedCssAssets.clear();

/**
 * 上报一次 CSS 预加载失败（静默降级 → 可观测的核心信号）。
 * `recoveryTriggered` 区分「已被强制刷新救回」与「恢复被限流、页面带病运行」——
 * 后者才是真正要盯的那一档。
 */
export const reportCssPreloadFailure = (payload, recoveryTriggered) => {
  const asset = extractCssAssetName(payload);
  if (!asset || reportedCssAssets.has(asset)) return false;
  reportedCssAssets.add(asset);
  return reportEvent('css_load_failure', {
    asset,
    recoveryTriggered: Boolean(recoveryTriggered),
  });
};

/**
 * 判断一个 vite:preloadError 的 payload 是否属于「CSS 预加载失败」。
 *
 * __vitePreload 抛出的就是 `new Error("Unable to preload CSS for <url>")`，
 * 所以优先按这句话判；再留一条「消息里带 .css 资源地址、且不是 JS 模块本身失败」
 * 的兜底，防止 Vite 升级后改措辞导致识别失效（改措辞只会退化成旧行为，不会误伤 JS 失败）。
 */
const isCssPreloadFailure = (payload) => {
  const message = String(payload?.message || payload || '');
  if (/unable to preload css/i.test(message)) return true;
  return (
    /\.css(?:[?#][^\s"']*)?(?=["'\s]|$)/i.test(message) &&
    !/dynamically imported module/i.test(message)
  );
};

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

/**
 * 这次 vite:preloadError 该不该「吞掉」（= preventDefault，不让错误上抛给 import 调用方）。
 *
 * · 恢复已发起（recovered）→ 吞：整条链由 forceCleanAndReload 接管。
 * · CSS 预加载失败 → **无论恢复是否被限流都吞**（理由见下方 setupVitePreloadErrorRecovery）。
 * · 其余（JS chunk 失败且恢复被限流）→ 不吞：维持原语义，让 router.onError / 错误边界接住。
 *
 * 抽成纯函数是为了能被单测直接覆盖（tests/unit/css-preload-failure-recovery.test.js）——
 * 只写源文字面量断言的话，把 `|| cssFailure` 删掉它照样绿。
 */
export const shouldSwallowPreloadError = (payload, recovered) =>
  Boolean(recovered) || isCssPreloadFailure(payload);

/**
 * 监听 vite:preloadError 并决定「吞掉」还是「上抛」。
 *
 * ⚠️ 为什么 CSS 失败必须无条件吞掉（2026-10-12 实测，见 probe-css-load-failure）：
 * __vitePreload（构建产物内核实过）的时序是
 *   ① 并发建 CSS 的 <link> → 全部 settle
 *   ② 依次 reportError() 每一个 rejected
 *   ③ 最后才 loadModule()
 * 而 reportError 在「没人 preventDefault」时会 **throw**，且它跑在 `.then` 回调里 ——
 * 那一步抛出等于**整条链直接 reject，③ 根本不会执行**。
 * 于是一条 CSS 的 404 会把**整个路由 chunk 的 import() 炸掉**：
 * 实测在首页点底栏「方块」时表现为「导航被吞、点了毫无反应」
 * （比『页面渲染出来但样式缺失』严重得多 —— 后者至少可降级、可自愈）。
 *
 * 冷却只应该限制「强制刷新」的频率，不该把错误放大成导航不可用。
 */
export function setupVitePreloadErrorRecovery() {
  if (import.meta.env.DEV || typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    const handled = recoverDynamicImportFailure();
    // 先把信号发出去再决定吞/抛：这条是「用户看到半样式而我们还不知道」的唯一出口
    if (isCssPreloadFailure(event?.payload)) {
      reportCssPreloadFailure(event?.payload, handled);
    }
    if (typeof event?.preventDefault !== 'function') return;

    if (shouldSwallowPreloadError(event?.payload, handled)) {
      event.preventDefault();
      if (!handled) {
        // 走到这里只可能是「CSS 失败 + 恢复已限流」：页面继续可用，但样式可能缺失
        logger.warn(
          'preload',
          'CSS 预加载失败且恢复已限流，保留降级导航（页面照常渲染，样式可能缺失）',
          event?.payload,
        );
      }
      return;
    }
    // 非 CSS（JS chunk）失败且恢复被限流：不 preventDefault，让错误上抛保留可观测性
  });
}
