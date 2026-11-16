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

/** node 环境没有 window：给 scheduleBottomNavPrefetch 一套最小可用的桩 */
const createWindowStub = () => ({
  requestIdleCallback: (callback) => {
    callback(0);
    return 1;
  },
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (id) => clearTimeout(id),
});

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
    /* ⚠️ 本套测试跑在 node 环境（vitest.config.js 的 environment: 'node'），
       没有 window；而 scheduleBottomNavPrefetch 的第一行就是
       `typeof window === 'undefined' ? 早退` —— 不给 window 桩的话这条断言
       永远是绿的（测的是「函数没跑」，不是「2G 不预取」）。2026-11-16 补上，
       与下面那条剔除当前落点的用例共用同一套桩。 */
    vi.stubGlobal('window', createWindowStub());
    const slowLoader = vi.fn().mockResolvedValue({ default: {} });
    const slowRouter = makeRouter({
      '/user-space/note': { name: 'CloudPlusPage', loader: slowLoader },
    });
    const cancel = scheduleBottomNavPrefetch(slowRouter);
    await new Promise((resolve) => setTimeout(resolve, 60));
    cancel();
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

  /* 2026-11-16：批量预取队列要剔除「当前落点」。
     排程点是首屏 `router.isReady()` 之后 ⇒ 当前页 chunk 已经下完，预取它纯白占一格；
     而队列按 350ms 一席铺开，白占一格等于把后面的每一席都往后推 350ms
     （实测：进首页后立刻点「图库」，修前图库排第 4 位、1050ms 后才开始下，
     首次切换必然出现「骨架 + 底栏消失」的空窗）。
     断言用「第一席换人了」来证明剔除生效 —— 只看 homeLoader 没被调用是不够的，
     空闲回调没跑时它同样不会被调用（假绿）。 */
  it('批量预取队列剔除当前落点，后面的席次因此提前', async () => {
    vi.stubGlobal('navigator', {
      connection: { saveData: false, effectiveType: '4g', downlink: 10 },
    });
    vi.stubGlobal('window', createWindowStub());

    const homeLoader = vi.fn().mockResolvedValue({ default: {} });
    const messagesLoader = vi.fn().mockResolvedValue({ default: {} });
    const router = makeRouter({
      '/': { name: 'HomePage', loader: homeLoader },
      '/user-space?tab=messages': { name: 'UserSpace', loader: messagesLoader },
    });
    // 当前落在首页 ⇒ 首页不进队列，第一席应当是「消息」
    router.currentRoute = { value: { path: '/' } };

    const cancel = scheduleBottomNavPrefetch(router);
    await new Promise((resolve) => setTimeout(resolve, 50));
    cancel();

    expect(homeLoader).not.toHaveBeenCalled();
    expect(messagesLoader).toHaveBeenCalledTimes(1);
  });
});
