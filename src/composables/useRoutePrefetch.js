/**
 * 路由 chunk 预取（docs/2026-09-29-加载速度与提速全面评测报告.md §10 P1-7）。
 *
 * 背景：53 个路由组件全部懒加载（探针 A2 在 verify 链里锁死「0 静态 view 引入」，
 * 别为了预取改回静态 import），除 UserSpace 自带的 async-loaders 外没有任何预取 ——
 * 跨一级路由首次切换都要付一次 chunk 往返（实测切换 123-501ms ≈ chunk RTT + 数据 RTT）。
 *
 * 两种低风险预取，刻意不做全量（会跟首屏图片抢带宽）：
 *   · hover：pointerenter 时触发目标路由组件的动态 import。同一个 loader 函数被
 *     Vue Router 复用，模块加载器天然去重，不会重复下载。
 *   · idle：首屏空闲后预取高频路由；sessionStorage 去重，每个会话只跑一次。
 */
import { useRouter } from 'vue-router';

// 模块级去重：导航栏每页都挂载，prefetch 的 Set 必须跨实例存活
const prefetchedPaths = new Set();

export function useRoutePrefetch() {
  const router = useRouter();
  return (path) => {
    const key = String(path || '');
    if (!key || prefetchedPaths.has(key)) return;
    try {
      const matched = router.resolve(key).matched || [];
      for (const record of matched) {
        const component = record.components?.default;
        if (typeof component === 'function') {
          prefetchedPaths.add(key);
          Promise.resolve(component()).catch(() => prefetchedPaths.delete(key));
          break;
        }
      }
    } catch {
      // 非法 path 解析失败静默忽略（预取是纯优化，不允许报错）
    }
  };
}

const IDLE_PREFETCH_STORAGE_KEY = 'boh_route_idle_prefetch_v1';
// 底栏四席的重量级落点：「内容」是首页本体（入口已加载），真正要预取的是
// 「我/消息」（UserSpaceMain，3453 行的大页）与 AI（BOHAIMain）两个 chunk。
// ⚠️ 别写 '/forum' —— 它已重定向到 /user-space?tab=posts（plans/022），预取它没有意义。
const IDLE_PREFETCH_PATHS = ['/user-space', '/ai-chat'];

export function scheduleIdleRoutePrefetch(prefetch) {
  if (typeof window === 'undefined' || typeof prefetch !== 'function') return;
  let alreadyDone = false;
  try {
    alreadyDone = window.sessionStorage.getItem(IDLE_PREFETCH_STORAGE_KEY) === '1';
  } catch {
    // sessionStorage 不可用（隐私模式等）时跳过去重检查，预取本身照跑
  }
  if (alreadyDone) return;
  const run = () => {
    try {
      window.sessionStorage.setItem(IDLE_PREFETCH_STORAGE_KEY, '1');
    } catch {
      // 忽略
    }
    IDLE_PREFETCH_PATHS.forEach(prefetch);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 2500);
  }
}
