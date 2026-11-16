import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * 登录/退出的两条「失败路径」回归（2026-11-16 第 1 批）：
 *
 *  A1  退出请求失败、但本地会话已被 supabase-js 删掉 ⇒ 必须照常清 PII。
 *      修复前 `clearSensitiveLocalStorage()` 只在 `!error` 时执行，失败路径会把
 *      `boh_remember_email` / `username` / Cloud+ 共享相册令牌留在设备上。
 *
 *  A2  登录请求不能无限等：`functions.invoke` 的上限是 180s（给流式接口留的），
 *      登录必须有自己的 10s 上限，且超时要给独立 code（不能冒充「密码错」）。
 *
 * 反证方式：把任一修复回退，本文件必须变红——
 *  · 把清理移回 `if (!error)`：用例 1 红；
 *  · 去掉 invokeWithTimeout：用例 3 会挂到超时（用假时钟断言，去掉后永不 resolve）。
 */

const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockInvoke = vi.fn();
const mockClearSensitive = vi.fn();

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      getSession: mockGetSession,
      setSession: vi.fn(),
    },
    functions: { invoke: mockInvoke },
    from: vi.fn(),
  },
}));

vi.mock('@/utils/safe-storage.js', () => ({
  clearSensitiveLocalStorage: mockClearSensitive,
}));

vi.mock('@/utils/request-core.js', () => ({
  executeRead: vi.fn(),
  normalizeDbError: (error) => error || { message: '' },
  invalidateByTags: vi.fn(),
  clearRequestCache: vi.fn(),
}));

vi.mock('@/utils/api/push-api.js', () => ({
  unbindDeviceOnLogout: vi.fn(),
}));

const { signOut, signIn } = await import('@/utils/api/auth-api.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockSignOut.mockResolvedValue({ error: null });
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('signOut：PII 清理与请求成败解耦', () => {
  it('请求失败但本地会话已空 ⇒ 仍然清理本地敏感数据', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'network down', status: 0 } });
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await signOut();

    expect(result.ok).toBe(false);
    expect(mockClearSensitive).toHaveBeenCalledTimes(1);
  });

  it('请求失败且本地会话仍在 ⇒ 不清（宁可留着也不误删在登录态的用户）', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'storage broken', status: 0 } });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'x' } } });

    const result = await signOut();

    expect(result.ok).toBe(false);
    expect(mockClearSensitive).not.toHaveBeenCalled();
  });

  it('正常退出 ⇒ 清理一次', async () => {
    await signOut();
    expect(mockClearSensitive).toHaveBeenCalledTimes(1);
  });
});

describe('signIn：10s 上限不能退化成 180s', () => {
  it('EF 一直不返回 ⇒ 超时后给出 LOGIN_GATEWAY_TIMEOUT', async () => {
    vi.useFakeTimers();
    mockInvoke.mockReturnValue(new Promise(() => {}));

    const pending = signIn('someone@example.com', 'password123');
    await vi.advanceTimersByTimeAsync(10_001);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOGIN_GATEWAY_TIMEOUT');
    // 超时不是凭据失败：不能被 UI 计进「密码错」次数
    expect(result.error.code).not.toBe('INVALID_CREDENTIALS');
  });

  it('EF 正常返回认证失败 ⇒ 仍走原有错误映射（不误判成超时）', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'invalid credentials',
        status: 401,
        context: { status: 401, json: async () => ({ ok: false, code: 'INVALID_CREDENTIALS' }) },
      },
    });

    const result = await signIn('someone@example.com', 'password123');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_CREDENTIALS');
  });
});
