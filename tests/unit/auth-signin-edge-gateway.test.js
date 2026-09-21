import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';

// ============================================================
// Hoisted mock holders
// ============================================================
const {
  invokeMock,
  rpcMock,
  setSessionMock,
  signInWithPasswordMock,
  mockNormalizeDbError,
  mockInvalidateByTags,
  mockLogger,
} = vi.hoisted(() => {
  const invokeMock = vi.fn();
  const rpcMock = vi.fn();
  const setSessionMock = vi.fn();
  const signInWithPasswordMock = vi.fn();
  const mockNormalizeDbError = vi.fn((error) => {
    if (!error) return null;
    if (typeof error === 'string') {
      return { message: error, code: 'APP_ERROR', details: null, hint: null };
    }
    return {
      message: String(error.message || '请求失败'),
      code: error.code || 'APP_ERROR',
      details: error.details ?? null,
      hint: error.hint ?? null,
    };
  });
  const mockInvalidateByTags = vi.fn();
  const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return {
    invokeMock,
    rpcMock,
    setSessionMock,
    signInWithPasswordMock,
    mockNormalizeDbError,
    mockInvalidateByTags,
    mockLogger,
  };
});

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    rpc: rpcMock,
    auth: {
      setSession: setSessionMock,
      signInWithPassword: signInWithPasswordMock,
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('../../src/utils/request-core.js', () => ({
  executeRead: vi.fn(),
  normalizeDbError: mockNormalizeDbError,
  invalidateByTags: mockInvalidateByTags,
}));

vi.mock('../../src/utils/logger.js', () => ({ logger: mockLogger }));

vi.mock('../../src/utils/safe-storage.js', () => ({
  clearSensitiveLocalStorage: vi.fn(),
}));

// auth-validation 无任何依赖 → 用真模块，避免测试与真实归一化口径漂移
import { signIn } from '../../src/utils/api/auth-api.js';

const EF_SESSION = {
  access_token: 'ef-access-token',
  refresh_token: 'ef-refresh-token',
  token_type: 'bearer',
  user: { id: 'user-1', email: 'hidden@example.com' },
};

/** 构造 supabase-js invoke 的非 2xx 错误形状（含可读 body） */
const httpError = (status, body) => ({
  name: 'FunctionsHttpError',
  message: `Edge Function returned a non-2xx status code`,
  context: { status, json: async () => body },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signIn：方块 ID 登录走 EF，邮箱不再出服务端', () => {
  it('方块 ID 登录成功：调用 auth-login EF 并用 setSession 采纳会话', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, user: EF_SESSION.user, session: EF_SESSION }, error: null });
    setSessionMock.mockResolvedValue({
      data: { user: EF_SESSION.user, session: EF_SESSION },
      error: null,
    });

    const result = await signIn('瑞一颗', 'p@ssw0rd');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('auth-login', {
      body: { loginId: '瑞一颗', password: 'p@ssw0rd' },
    });
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: 'ef-access-token',
      refresh_token: 'ef-refresh-token',
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it('走 EF 时完全不触碰旧的邮箱解析 RPC，也不在前端做 signInWithPassword', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, session: EF_SESSION }, error: null });
    setSessionMock.mockResolvedValue({ data: { session: EF_SESSION }, error: null });

    await signIn('some_user', 'pw');

    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('认证失败路径绝不携带任何邮箱（这才是枚举面要守的不变量）', async () => {
    const failures = [
      httpError(401, { ok: false, code: 'INVALID_CREDENTIALS', message: '登录失败：账号或密码错误' }),
      httpError(403, { ok: false, code: 'USER_BANNED', message: '您的账号已被封禁，无法登录。' }),
      httpError(429, { ok: false, code: 'RATE_LIMITED', message: '请求过于频繁' }),
      httpError(404, { message: 'Not Found' }),
    ];

    for (const error of failures) {
      invokeMock.mockResolvedValue({ data: null, error });
      // 降级分支也返回「查不到」——同样不能泄露任何邮箱
      rpcMock.mockResolvedValue({ data: null, error: null });

      const result = await signIn('some_user', 'pw');

      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/@/);
    }
  });

  it('登录成功后才返回会话（其中含调用者自己的邮箱，与原生 signInWithPassword 形状一致）', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, session: EF_SESSION }, error: null });
    setSessionMock.mockResolvedValue({ data: { user: EF_SESSION.user, session: EF_SESSION }, error: null });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(true);
    // 成功路径由 setSession 的返回决定，前端不额外注入字段
    expect(result.data.session.access_token).toBe('ef-access-token');
    expect(Object.keys(result).sort()).toEqual(['data', 'error', 'ok']);
  });

  it('EF 返回 401 账号密码错误 → 透传错误，且不降级到 RPC', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(401, { ok: false, code: 'INVALID_CREDENTIALS', message: '登录失败：账号或密码错误' }),
    });

    const result = await signIn('some_user', 'wrong');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_CREDENTIALS');
    expect(result.error.message).toBe('登录失败：账号或密码错误');
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('EF 返回 403 封禁 → 错误码透传，且不降级', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(403, { ok: false, code: 'USER_BANNED', message: '您的账号已被封禁，无法登录。' }),
    });

    const result = await signIn('banned_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('USER_BANNED');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('EF 返回 429 限流 → 错误码透传，且不降级', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(429, { ok: false, code: 'RATE_LIMITED', message: '请求过于频繁，请在 30 秒后重试。' }),
    });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('RATE_LIMITED');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('EF 返回 500 → 上抛错误，绝不静默降级（降级会复活邮箱枚举面）', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(500, { ok: false, code: 'AUTH_LOGIN_FAILED', message: '登录失败，请稍后再试。' }),
    });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('AUTH_LOGIN_FAILED');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('EF 返回 200 但 ok:false → 仍按失败处理', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, code: 'INVALID_CREDENTIALS', message: '登录失败：账号或密码错误' },
      error: null,
    });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_CREDENTIALS');
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it('EF 声称成功却没有 session → 报错且不调 setSession', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, user: { id: 'u1' } }, error: null });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOGIN_FAILED');
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it('setSession 失败 → 归一化错误上抛', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, session: EF_SESSION }, error: null });
    setSessionMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid refresh token', code: 'REFRESH_TOKEN_INVALID' },
    });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('invalid refresh token');
  });
});

describe('signIn：EF 不可用时明确报错（不再降级到旧 RPC）', () => {
  it('EF 404 → 返回 LOGIN_GATEWAY_UNAVAILABLE，绝不调用 RPC', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(404, { message: 'Not Found' }) });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOGIN_GATEWAY_UNAVAILABLE');
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('invoke 抛异常（网络/relay 故障）→ 同样明确报错，不回落', async () => {
    invokeMock.mockRejectedValue(new Error('FunctionsFetchError: Failed to send a request'));

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOGIN_GATEWAY_UNAVAILABLE');
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('EF 501 → 视为不可用，明确报错', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(501, { message: 'Not Implemented' }) });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOGIN_GATEWAY_UNAVAILABLE');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('EF 5xx（非 0/404/501）→ 当作服务端拒绝原样上抛，也不回落', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: httpError(500, { message: 'Internal Server Error', code: 'EDGE_INTERNAL' }),
    });

    const result = await signIn('some_user', 'pw');

    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('EF 不可用时留下可观测告警（便于发现 EF 掉线）', async () => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(404, { message: 'Not Found' }) });

    await signIn('some_user', 'pw');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'auth-api',
      'auth-login EF 不可用',
      expect.objectContaining({ status: 404 })
    );
  });
});

describe('signIn：邮箱直登不需要任何解析（零枚举面）', () => {
  it('输入是邮箱 → 既不走 EF 也不查 RPC', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { access_token: 'a' } },
      error: null,
    });

    const result = await signIn('someone@example.com', 'pw');

    expect(invokeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'someone@example.com',
      password: 'pw',
    });
    expect(result.ok).toBe(true);
  });

  it('邮箱登录失败仍归一化 invalid login credentials', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    const result = await signIn('someone@example.com', 'bad');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_CREDENTIALS');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('signIn：输入校验先于任何网络调用', () => {
  it('空账号 / 空密码 → 直接返回错误，不发任何请求', async () => {
    const r1 = await signIn('   ', 'pw');
    const r2 = await signIn('someone@example.com', '');

    expect(r1.ok).toBe(false);
    expect(r1.error.code).toBe('INVALID_INPUT');
    expect(r2.ok).toBe(false);
    expect(r2.error.code).toBe('INVALID_INPUT');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });
});

describe('源码守卫：枚举入口已被移除', () => {
  it('auth-api.js 不再导出 getEmailByUsername', async () => {
    const source = await readFile('src/utils/api/auth-api.js', 'utf-8');
    expect(source).not.toContain('export async function getEmailByUsername');
  });

  it('utils/auth.js 不再再导出 getEmailByUsername', async () => {
    const source = await readFile('src/utils/auth.js', 'utf-8');
    expect(source).not.toContain('getEmailByUsername');
  });

  it('类型声明同步移除', async () => {
    const source = await readFile('src/utils/auth.d.ts', 'utf-8');
    expect(source).not.toContain('getEmailByUsername');
  });

  it('auth-api.js 中不再存在旧 RPC 调用点（降级路径已删除）', async () => {
    const source = await readFile('src/utils/api/auth-api.js', 'utf-8');

    // 断言「调用点」而非「字符串提及」：注释里保留删除原因说明是有价值的文档，
    // 但绝不允许出现真正的调用
    expect(source).not.toMatch(/\.rpc\(\s*['"]resolve_email_for_login/);
    expect(source).not.toContain('LOGIN_LEGACY_RPC_FALLBACK');
  });

  it('仍然保留 EF 不可用时的明确失败出口（而非静默降级）', async () => {
    const source = await readFile('src/utils/api/auth-api.js', 'utf-8');

    expect(source).toContain("functions.invoke('auth-login'");
    expect(source).toContain('LOGIN_GATEWAY_UNAVAILABLE');
  });
});
