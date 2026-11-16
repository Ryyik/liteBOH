import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { logoutAndReload } from '@/utils/logout-and-reload.js';
import { registerAuthSoftResetHandler } from '@/composables/use-auth-soft-reset.js';

/**
 * 退出登录的契约（2026-11-16 C1 起）。
 *
 * 旧实现靠 `location.reload()` 把 SPA 内存里的一切扔掉，所以敢传 `reset: false`。
 * 现在改成软重置（重挂页面树），于是：
 *   ① 必须 `reset: true` —— 不再有 reload 帮忙清 pinia；
 *   ② 有处理器时不 reload，由处理器重挂页面树 + 回首页；
 *   ③ **没有处理器必须回落 reload** —— 退出不能变成"什么都没发生"；
 *   ④ 顺序仍是「注销请求落定 → 再重置」。
 */

const makeStore = (impl) => ({ logout: vi.fn(impl) });

const stubWindow = () => {
  const location = { hash: '#/user-space?tab=community', reload: vi.fn() };
  vi.stubGlobal('window', { location });
  return location;
};

beforeEach(() => {
  registerAuthSoftResetHandler(null);
});

afterEach(() => {
  registerAuthSoftResetHandler(null);
  vi.unstubAllGlobals();
});

describe('logoutAndReload：软重置优先，reload 兜底', () => {
  it('注册了处理器 ⇒ 不 reload，交给软重置', async () => {
    const location = stubWindow();
    const handler = vi.fn();
    registerAuthSoftResetHandler(handler);
    const store = makeStore(async () => {});

    await logoutAndReload(store);

    expect(store.logout).toHaveBeenCalledWith({ reset: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ redirect: '/' });
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('没有处理器 ⇒ 回落整页 reload 并把 hash 归位', async () => {
    const location = stubWindow();
    await logoutAndReload(makeStore(async () => {}));

    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe('#/');
  });

  it('处理器自己抛错 ⇒ 回落 reload（不能让退出停在半路）', async () => {
    const location = stubWindow();
    registerAuthSoftResetHandler(() => {
      throw new Error('tree broken');
    });

    await logoutAndReload(makeStore(async () => {}));

    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it('注销请求先落定，再做软重置', async () => {
    stubWindow();
    const order = [];
    registerAuthSoftResetHandler(() => order.push('soft-reset'));
    const store = makeStore(async () => {
      order.push('logout');
    });

    await logoutAndReload(store);

    expect(order).toEqual(['logout', 'soft-reset']);
  });

  it('logout 抛错也照样重置，并把异常继续抛给调用方', async () => {
    const location = stubWindow();
    const handler = vi.fn();
    registerAuthSoftResetHandler(handler);
    const store = makeStore(async () => {
      throw new Error('network down');
    });

    await expect(logoutAndReload(store)).rejects.toThrow('network down');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('redirect 透传给软重置处理器', async () => {
    stubWindow();
    const handler = vi.fn();
    registerAuthSoftResetHandler(handler);

    await logoutAndReload(
      makeStore(async () => {}),
      { redirect: '/shop' },
    );

    expect(handler.mock.calls[0][0]).toEqual({ redirect: '/shop' });
  });
});

describe('接线守卫：App 必须注册软重置处理器', () => {
  it('App.vue 注册 handler 且自增 boundaryKey（重挂页面树）', async () => {
    const source = await readFile('src/App.vue', 'utf-8');
    expect(source).toContain('registerAuthSoftResetHandler');
    expect(source).toMatch(/boundaryKey\.value\s*\+=\s*1/);
  });

  it('resetState 会清 homeHeroes（软重置不再有 reload 兜底）', async () => {
    const source = await readFile('src/stores/auth.ts', 'utf-8');
    expect(source).toContain('useHomeHeroesStore');
  });
});
