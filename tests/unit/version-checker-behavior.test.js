import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const createStorage = (overrides = {}) => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  ...overrides,
});

const createWindow = () => ({
  location: {
    href: 'https://example.com/app/?from=test#/user-space',
    replace: vi.fn(),
    reload: vi.fn(),
  },
  history: {
    state: null,
    replaceState: vi.fn(),
  },
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (id) => clearTimeout(id),
  dispatchEvent: vi.fn(),
});

const stubVersionDocument = () => {
  vi.stubGlobal('document', {
    querySelector: vi.fn((selector) => ({
      getAttribute: () => (selector.includes('boh-build-id') ? 'local-build' : '4.9.0'),
    })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    visibilityState: 'visible',
  });
};

describe('version-checker behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', createWindow());
    vi.stubGlobal('sessionStorage', createStorage());
    vi.stubGlobal('navigator', {});
    vi.stubGlobal(
      'CustomEvent',
      class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
    );
    stubVersionDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('updates service workers before navigating without deleting the active app shell cache', async () => {
    const update = vi.fn(async () => undefined);
    const unregister = vi.fn(async () => true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn(async () => [{ update, unregister }]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    await forceCleanAndReload('remote-build');

    expect(update).toHaveBeenCalledOnce();
    // 无新 SW（installing/waiting 均无）→ 当前 SW 预缓存已是最新，直接导航、不注销
    expect(unregister).not.toHaveBeenCalled();
    expect(window.location.replace).toHaveBeenCalledWith(
      '/app/?from=test&__boh_update=remote-build#/user-space',
    );
  });

  it('navigates right after the new service worker takes control, without unregistering', async () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn(async () => [
          {
            update: vi.fn(async () => undefined),
            unregister: vi.fn(async () => true),
            installing: { state: 'installing' },
          },
        ]),
        addEventListener,
        removeEventListener: vi.fn(),
      },
    });
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    const reloadPromise = forceCleanAndReload('remote-build');
    await vi.waitFor(() => expect(addEventListener).toHaveBeenCalled());
    // 模拟新 SW 完成安装并 claim 页面（skipWaiting + clientsClaim）
    const controllerChangeHandler = addEventListener.mock.calls.find(
      ([type]) => type === 'controllerchange',
    )[1];
    controllerChangeHandler();
    await reloadPromise;

    expect(window.location.replace).toHaveBeenCalledWith(
      '/app/?from=test&__boh_update=remote-build#/user-space',
    );
  });

  it('navigates within the dismantle grace even when unregister hangs on an in-flight install', async () => {
    vi.useFakeTimers();
    // Chrome 实测（见 probe-version-update-click.mjs）：有新 SW 正在安装时
    // unregister() 的 promise 会拖到安装结束才 resolve，绝不能 await 到底
    const unregister = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn(async () => [
          {
            update: vi.fn(() => new Promise(() => {})),
            unregister,
            installing: { state: 'installing' },
          },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    const reloadPromise = forceCleanAndReload('remote-build');
    await vi.advanceTimersByTimeAsync(10_000); // 接管等待窗口超时
    await vi.advanceTimersByTimeAsync(1_000); // 注销宽限期
    await reloadPromise;

    // 关键：不能带着仍拦截导航的旧 SW 直接触发导航 —— 旧 SW 会用旧预缓存的
    // index.html 应答这次导航，用户点了「立即更新」却拿回一模一样的旧页面。
    expect(unregister).toHaveBeenCalledOnce();
    expect(window.location.replace).toHaveBeenCalledWith(
      '/app/?from=test&__boh_update=remote-build#/user-space',
    );
  });

  it('treats a matching build as current when session storage is unavailable', async () => {
    vi.stubGlobal(
      'sessionStorage',
      createStorage({
        removeItem: vi.fn(() => {
          throw new DOMException('Blocked', 'SecurityError');
        }),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: '4.9.0', buildId: 'local-build' }),
      })),
    );
    const { checkVersion } = await import('../../src/utils/version-checker.js');

    const result = await checkVersion();

    expect(result.hasUpdate).toBe(false);
    expect(result.message).toContain('最新版本');
  });

  it('reuses the in-flight version request across concurrent checks', async () => {
    let resolveFetch;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { checkVersion } = await import('../../src/utils/version-checker.js');

    const firstCheck = checkVersion();
    const secondCheck = checkVersion();
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveFetch({
      ok: true,
      json: async () => ({ version: '4.9.0', buildId: 'local-build' }),
    });
    const [firstResult, secondResult] = await Promise.all([firstCheck, secondCheck]);

    expect(firstResult.hasUpdate).toBe(false);
    expect(secondResult.hasUpdate).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts a version request after the request timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );
    const { checkVersion } = await import('../../src/utils/version-checker.js');

    const checkPromise = checkVersion();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await checkPromise;

    expect(result.hasUpdate).toBe(false);
    expect(result.message).toContain('版本检查失败');
  });

  it('uses the update query as the attempted build when session storage is unavailable', async () => {
    window.location.href = 'https://example.com/app/?__boh_update=remote-build#/user-space';
    vi.stubGlobal(
      'sessionStorage',
      createStorage({
        getItem: vi.fn(() => {
          throw new DOMException('Blocked', 'SecurityError');
        }),
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: '5.0.0', buildId: 'remote-build' }),
      })),
    );
    const { initVersionChecker, destroyVersionChecker } =
      await import('../../src/utils/version-checker.js');

    initVersionChecker();
    await vi.waitFor(() => expect(window.dispatchEvent).toHaveBeenCalledOnce());

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(window.dispatchEvent.mock.calls[0][0].detail.remoteBuildId).toBe('remote-build');
    destroyVersionChecker();
  });

  // ===== recoverIfStaleBuild：引导超时自救（App.vue 10s 兜底专用） =====
  it('auto-reloads when boot times out on a stale build facing a newer remote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: '5.0.0', buildId: 'remote-build' }),
      })),
    );
    const { recoverIfStaleBuild } = await import('../../src/utils/version-checker.js');

    const outcome = await recoverIfStaleBuild();

    expect(outcome).toBe('reloading');
    await vi.waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith(
        '/app/?from=test&__boh_update=remote-build#/user-space',
      ),
    );
  });

  it('stays hands-off when the remote build matches the page (真网络慢，不清缓存)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: '4.9.0', buildId: 'local-build' }),
      })),
    );
    const { recoverIfStaleBuild } = await import('../../src/utils/version-checker.js');

    const outcome = await recoverIfStaleBuild();

    expect(outcome).toBe('no-update');
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('stays hands-off when version.json is unreachable (离线不清缓存)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const { recoverIfStaleBuild } = await import('../../src/utils/version-checker.js');

    const outcome = await recoverIfStaleBuild();

    expect(outcome).toBe('unreachable');
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('never retries the same target buildId (CDN 未切换时防刷新循环)', async () => {
    vi.stubGlobal('sessionStorage', createStorage({ getItem: vi.fn(() => 'remote-build') }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: '5.0.0', buildId: 'remote-build' }),
      })),
    );
    const { recoverIfStaleBuild } = await import('../../src/utils/version-checker.js');

    const outcome = await recoverIfStaleBuild();

    expect(outcome).toBe('cooldown');
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('is a no-op in dev', async () => {
    vi.stubEnv('DEV', true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { recoverIfStaleBuild } = await import('../../src/utils/version-checker.js');

    const outcome = await recoverIfStaleBuild();

    expect(outcome).toBe('dev');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports no-meta when the build meta is missing (旧缓存页面不误判)', async () => {
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => null),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { recoverIfStaleBuild } = await import('../../src/utils/version-checker.js');

    const outcome = await recoverIfStaleBuild();

    expect(outcome).toBe('no-meta');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  /* ============================================
     预缓存壳核对（2026-11-10「点更新 → 还是弹」循环的回归）
     ============================================
     病根：「没有 pending worker」被当成「预缓存里的壳已是最新」。sw.js 被边缘
     缓存住、或新 SW 安装失败时两者同时为假却都看不到 installing/waiting ⇒
     旧 SW 用旧预缓存应答导航 ⇒ 落地还是旧壳 ⇒ 防循环护栏把更新降级成反复弹窗。
     下面三条锁住「读预缓存 → 判定 → 该拆就拆」。 */
  const stubPrecache = (shellBuildId) => {
    const deleteCache = vi.fn(async () => true);
    vi.stubGlobal('caches', {
      keys: vi.fn(async () => ['workbox-precache-v2-https://example.com/']),
      open: vi.fn(async () => ({
        keys: vi.fn(async () => [
          new Request('https://example.com/app/index.html?__WB_REVISION__=abc123'),
        ]),
        match: vi.fn(async () => ({
          text: async () =>
            `<html><head><meta name="boh-build-id" content="${shellBuildId}" /></head></html>`,
        })),
      })),
      delete: deleteCache,
    });
    return deleteCache;
  };

  const stubRegistration = (extra = {}) => {
    const unregister = vi.fn(async () => true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn(async () => [
          { update: vi.fn(async () => undefined), unregister, ...extra },
        ]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    return unregister;
  };

  it('dismantles the old SW when the precached shell is still the old build', async () => {
    const unregister = stubRegistration(); // 无 installing/waiting（sw.js 被缓存住时的真实形态）
    const deleteCache = stubPrecache('stale-build-local');
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    await forceCleanAndReload('remote-build');

    // 预缓存里还是旧壳 ⇒ 必须注销 + 清缓存，否则导航被旧预缓存应答
    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalled();
    expect(window.location.replace).toHaveBeenCalledWith(
      '/app/?from=test&__boh_update=remote-build#/user-space',
    );
  });

  it('navigates without dismantling when the precached shell already matches the target', async () => {
    const unregister = stubRegistration();
    stubPrecache('remote-build');
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    await forceCleanAndReload('remote-build');

    // 预缓存已是目标壳（新 SW 装好并 claim）⇒ 直接导航，别多清一次缓存
    expect(unregister).not.toHaveBeenCalled();
    expect(window.location.replace).toHaveBeenCalledWith(
      '/app/?from=test&__boh_update=remote-build#/user-space',
    );
  });

  it('falls back to the previous behavior when the cache API is unavailable', async () => {
    const unregister = stubRegistration();
    vi.stubGlobal('caches', undefined);
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    await forceCleanAndReload('remote-build');

    // 判定不了就别乱清缓存（旧行为），导航照旧
    expect(unregister).not.toHaveBeenCalled();
    expect(window.location.replace).toHaveBeenCalledWith(
      '/app/?from=test&__boh_update=remote-build#/user-space',
    );
  });

  /* ============================================
     落地失败的一次性自救
     ============================================ */
  const createStatefulStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return {
      getItem: vi.fn((key) => (map.has(key) ? map.get(key) : null)),
      setItem: vi.fn((key, value) => map.set(key, String(value))),
      removeItem: vi.fn((key) => map.delete(key)),
    };
  };

  it('hard-resets once when the update target landed on the old shell', async () => {
    vi.stubGlobal(
      'sessionStorage',
      createStatefulStorage({ boh_version_reload_target: 'remote-build' }),
    );
    const unregister = stubRegistration();
    const deleteCache = stubPrecache('local-build');
    vi.stubGlobal('fetch', vi.fn());
    const { recoverStaleLanding } = await import('../../src/utils/version-checker.js');

    const handled = await recoverStaleLanding();

    expect(handled).toBe(true);
    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalled();
    // 必须回到不带 __boh_update 的干净地址
    expect(window.location.replace).toHaveBeenCalledWith('/app/?from=test#/user-space');
  });

  it('never hard-resets the same target twice (硬重置也只许一次)', async () => {
    vi.stubGlobal(
      'sessionStorage',
      createStatefulStorage({
        boh_version_reload_target: 'remote-build',
        boh_version_hard_reset: 'remote-build',
      }),
    );
    const unregister = stubRegistration();
    stubPrecache('local-build');
    vi.stubGlobal('fetch', vi.fn());
    const { recoverStaleLanding } = await import('../../src/utils/version-checker.js');

    const handled = await recoverStaleLanding();

    expect(handled).toBe(false);
    expect(unregister).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('decides a stale landing from target vs local build (纯判定，不碰 DOM)', async () => {
    const { shouldHardResetStaleLanding } = await import('../../src/utils/version-checker.js');

    // 带着目标回来却仍是旧壳 ⇒ 该硬重置
    expect(shouldHardResetStaleLanding('local-build', 'remote-build', '')).toBe(true);
    // 已落地到目标 ⇒ 正常
    expect(shouldHardResetStaleLanding('remote-build', 'remote-build', '')).toBe(false);
    // 同一目标已硬重置过 ⇒ 绝不重复（防刷新循环的唯一闸门）
    expect(shouldHardResetStaleLanding('local-build', 'remote-build', 'remote-build')).toBe(false);
    // 目标/本机构建缺失 ⇒ 无从判定，不动
    expect(shouldHardResetStaleLanding('', 'remote-build', '')).toBe(false);
    expect(shouldHardResetStaleLanding('local-build', '', '')).toBe(false);
  });
});
