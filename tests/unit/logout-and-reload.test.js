import { afterEach, describe, expect, it, vi } from 'vitest';
import { logoutAndReload } from '@/utils/logout-and-reload.js';

/**
 * 退出登录 + 整页重载的契约（2026-11-01 用户口径「退出登录的速度还可以再提升一下」）
 *
 * 这里锁两件容易在提速时被改坏的事：
 *   ① `reset: false` —— reload 会把整张 pinia 重建，重载前再清三个 store 是纯等待；
 *      但**不重载**的那条退出路径仍要默认 true，不能让提速顺手把那边也关掉。
 *   ② 顺序 —— reload 必须在注销请求落定之后（先 reload 会掐断请求，
 *      Supabase 侧 refresh token 还活着）；注销失败也必须 reload（否则页面卡在旧态）。
 */

const makeStore = (impl) => ({ logout: vi.fn(impl) });

const stubWindow = () => {
  const location = { hash: '#/user-space?tab=community', reload: vi.fn() };
  vi.stubGlobal('window', { location });
  return location;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('logoutAndReload', () => {
  it('传 reset: false —— 整页重载前不再做多余的 pinia 清理', async () => {
    const location = stubWindow();
    const store = makeStore(async () => {});

    await logoutAndReload(store);

    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(store.logout).toHaveBeenCalledWith({ reset: false });
    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('先落定 logout 再 reload（顺序不能反）', async () => {
    const order = [];
    const location = stubWindow();
    location.reload.mockImplementation(() => order.push('reload'));
    const store = makeStore(async () => {
      order.push('logout');
    });

    await logoutAndReload(store);

    expect(order).toEqual(['logout', 'reload']);
  });

  it('默认把 hash 归位到首页后再重载', async () => {
    const location = stubWindow();
    const store = makeStore(async () => {});

    await logoutAndReload(store);

    expect(location.hash).toBe('#/');
  });

  it('redirect 可覆盖落点；传空值则不动 hash', async () => {
    const location = stubWindow();
    await logoutAndReload(
      makeStore(async () => {}),
      { redirect: '/user-space' },
    );
    expect(location.hash).toBe('#/user-space');

    const location2 = stubWindow();
    location2.hash = '#/shop';
    await logoutAndReload(
      makeStore(async () => {}),
      { redirect: '' },
    );
    expect(location2.hash).toBe('#/shop');
  });

  it('logout 抛错也必须重载（否则页面停在旧数据上）', async () => {
    const location = stubWindow();
    const store = makeStore(async () => {
      throw new Error('network down');
    });

    await expect(logoutAndReload(store)).rejects.toThrow('network down');
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe('#/');
  });
});
