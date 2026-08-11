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
      getAttribute: () => selector.includes('boh-build-id') ? 'local-build' : '4.9.0',
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
    vi.stubGlobal('CustomEvent', class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    });
    stubVersionDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('unregisters service workers before clearing caches and navigating', async () => {
    let finishUnregister;
    const unregister = vi.fn(() => new Promise((resolve) => {
      finishUnregister = resolve;
    }));
    const cacheStorage = {
      keys: vi.fn(async () => ['app-cache']),
      delete: vi.fn(async () => true),
    };
    window.caches = cacheStorage;
    vi.stubGlobal('caches', cacheStorage);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn(async () => [{ unregister }]),
      },
    });
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    const updatePromise = forceCleanAndReload('remote-build');
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledOnce());
    expect(cacheStorage.keys).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();

    finishUnregister(true);
    await updatePromise;

    expect(cacheStorage.keys).toHaveBeenCalledOnce();
    expect(window.location.replace).toHaveBeenCalledWith(
      '/app/?from=test&__boh_update=remote-build#/user-space'
    );
  });

  it('continues navigation when cache cleanup exceeds the timeout', async () => {
    vi.useFakeTimers();
    const cacheStorage = {
      keys: vi.fn(() => new Promise(() => {})),
      delete: vi.fn(),
    };
    window.caches = cacheStorage;
    vi.stubGlobal('caches', cacheStorage);
    const { forceCleanAndReload } = await import('../../src/utils/version-checker.js');

    const updatePromise = forceCleanAndReload('remote-build');
    await vi.advanceTimersByTimeAsync(1500);
    await updatePromise;

    expect(window.location.replace).toHaveBeenCalledOnce();
  });

  it('treats a matching build as current when session storage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', createStorage({
      removeItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '4.9.0', buildId: 'local-build' }),
    })));
    const { checkVersion } = await import('../../src/utils/version-checker.js');

    const result = await checkVersion();

    expect(result.hasUpdate).toBe(false);
    expect(result.message).toContain('最新版本');
  });

  it('reuses the in-flight version request across concurrent checks', async () => {
    let resolveFetch;
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
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
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    })));
    const { checkVersion } = await import('../../src/utils/version-checker.js');

    const checkPromise = checkVersion();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await checkPromise;

    expect(result.hasUpdate).toBe(false);
    expect(result.message).toContain('版本检查失败');
  });

  it('uses the update query as the attempted build when session storage is unavailable', async () => {
    window.location.href = 'https://example.com/app/?__boh_update=remote-build#/user-space';
    vi.stubGlobal('sessionStorage', createStorage({
      getItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '5.0.0', buildId: 'remote-build' }),
    })));
    const { initVersionChecker, destroyVersionChecker } = await import('../../src/utils/version-checker.js');

    initVersionChecker();
    await vi.waitFor(() => expect(window.dispatchEvent).toHaveBeenCalledOnce());

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(window.dispatchEvent.mock.calls[0][0].detail.remoteBuildId).toBe('remote-build');
    destroyVersionChecker();
  });
});
