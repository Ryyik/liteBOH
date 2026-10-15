import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * unknown_route 埋点（兼容层日落度量）：
 * NotFound 兜底每次命中即上报，同一路径**每次会话只报一次**（防脚本刷量）。
 * monitoring 的端点刻意惰性读取（见其文件头注释），故用 vi.stubEnv + resetModules
 * 驱动真实上报路径，而不是测一个被 mock 掉的空壳。
 */
describe('unknown_route 埋点', () => {
  const load = async () => {
    vi.resetModules();
    return import('../../src/utils/monitoring.js');
  };

  const stubRuntime = () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon, userAgent: 'vitest' });
    vi.stubGlobal('window', { location: { href: 'http://localhost/#/unknown' } });
    return sendBeacon;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://collect.example.test/beacon');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('同一路径只报一次，不同路径各报一次', async () => {
    const sendBeacon = stubRuntime();
    const { reportUnknownRoute } = await load();

    expect(reportUnknownRoute('/old-link-a')).toBe(true);
    expect(reportUnknownRoute('/old-link-a')).toBe(false);
    expect(reportUnknownRoute('/old-link-b')).toBe(true);

    expect(sendBeacon).toHaveBeenCalledTimes(2);
    const payloads = sendBeacon.mock.calls.map((call) => JSON.parse(call[1]));
    expect(payloads.map((p) => p.type)).toEqual(['unknown_route', 'unknown_route']);
    expect(payloads.map((p) => p.path)).toEqual(['/old-link-a', '/old-link-b']);
  });

  it('空路径不上报', async () => {
    const sendBeacon = stubRuntime();
    const { reportUnknownRoute } = await load();

    expect(reportUnknownRoute('')).toBe(false);
    expect(reportUnknownRoute(null)).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('未配置监控端点时静默跳过（本地/预览环境的正常态）', async () => {
    vi.stubEnv('VITE_MONITORING_ENDPOINT', '');
    const sendBeacon = stubRuntime();
    const { reportUnknownRoute } = await load();

    expect(reportUnknownRoute('/old-link')).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
