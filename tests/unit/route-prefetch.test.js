/**
 * 底栏落点 chunk 预取（utils/route-prefetch.js）的行为守卫。
 *
 * 守的是四件「错了不会报错、只会静默变慢或静默多流量」的事：
 *   ① 同一落点只加载一次（去重）——否则每次 hover / 按下都重复触发同一条
 *      动态 import（有模块缓存所以不会重复下载，但会重复走 loader 包装、白耗）；
 *   ② 失败必须能重试 —— 若把失败也记成「已预热」，那次会话里这个落点就永远不预取；
 *   ③ 省流 / 2G 不许预取 —— 预取是用未来带宽换未来等待，流量敏感用户不接受；
 *   ④ 薄壳页要追一层内层懒加载（Cloud+ 的路由入口只是壳，重面板在壳里再懒加载；
 *      实测只预取路由 chunk 时「我 → 图库」仍剩 341ms）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRoutePrefetchForTests,
  prefetchRoute,
  scheduleBottomNavPrefetch,
} from '../../src/utils/route-prefetch.js';

/** 用「路径 → { name, loader }」构造最小的路由表桩 */
const makeRouter = (loaders = {}) => {
  const records = Object.entries(loaders).map(([path, entry]) => ({
    path,
    name: entry.name,
    components: { default: entry.loader },
  }));
  return {
    resolve: (target) => ({ name: records.find((r) => r.path === target)?.name || '' }),
    getRoutes: () => records,
  };
};

describe('route-prefetch', () => {
  beforeEach(() => {
    __resetRoutePrefetchForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetRoutePrefetchForTests();
  });

  it('同一落点只调用一次 loader', async () => {
    const loader = vi.fn().mockResolvedValue({ default: {} });
    const router = makeRouter({ '/user-space/note': { name: 'CloudPlusPage', loader } });

    await prefetchRoute(router, '/user-space/note');
    await prefetchRoute(router, '/user-space/note');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('loader 失败后不把落点标记成「已预热」，下次还能重试', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValueOnce({ default: {} });
    const router = makeRouter({ '/user-space/note': { name: 'CloudPlusPage', loader } });

    const first = await prefetchRoute(router, '/user-space/note');
    expect(first).toBe(false);

    const second = await prefetchRoute(router, '/user-space/note');
    expect(second).toBe(true);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('saveData 时一条预取都不发', async () => {
    vi.stubGlobal('navigator', { connection: { saveData: true, effectiveType: '4g' } });
    const loader = vi.fn().mockResolvedValue({ default: {} });
    const router = makeRouter({ '/user-space/note': { name: 'CloudPlusPage', loader } });

    const result = await prefetchRoute(router, '/user-space/note');

    expect(result).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it('2G 时不预取；4G 且带宽富余时批量预取会真的开跑', async () => {
    vi.stubGlobal('navigator', {
      connection: { saveData: false, effectiveType: '2g', downlink: 0.3 },
    });
    const slowLoader = vi.fn().mockResolvedValue({ default: {} });
    const slowRouter = makeRouter({
      '/user-space/note': { name: 'CloudPlusPage', loader: slowLoader },
    });
    scheduleBottomNavPrefetch(slowRouter);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(slowLoader).not.toHaveBeenCalled();
  });

  it('薄壳页会继续预热内层异步组件（追一层 __asyncLoader）', async () => {
    const innerLoader = vi.fn().mockResolvedValue({ default: { heavy: true } });
    const shellLoader = vi.fn().mockResolvedValue({
      default: { __asyncLoader: innerLoader },
    });
    const router = makeRouter({
      '/user-space/note': { name: 'CloudPlusPage', loader: shellLoader },
    });

    const ok = await prefetchRoute(router, '/user-space/note');

    expect(ok).toBe(true);
    expect(shellLoader).toHaveBeenCalledTimes(1);
    expect(innerLoader).toHaveBeenCalledTimes(1);
  });

  it('拿不到路由记录时安全返回 false，不抛错', async () => {
    const router = makeRouter({});
    await expect(prefetchRoute(router, '/not-a-route')).resolves.toBe(false);
  });
});
