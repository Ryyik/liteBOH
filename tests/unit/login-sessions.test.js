import { describe, expect, it, vi, beforeEach } from 'vitest';
import { describeDeviceLabel } from '@/utils/device-label.js';

/**
 * 「登录设备」的读模型（2026-11-16）。
 *
 * 后端真源是 GoTrue 的 auth.sessions（迁移 2026111601 的两个 SECURITY DEFINER 函数）。
 * 这里锁的是最容易被写错的两件纯逻辑：
 *   ① UA 解析顺序（微信 UA 同时含 Safari/Chrome 字样，判错了会把微信显示成 Safari）；
 *   ② RPC 返回的 snake_case → 前端模型，以及「业务失败」不是 HTTP 错误这件事。
 */

const mockRpc = vi.fn();

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { rpc: mockRpc },
}));

vi.mock('@/utils/request-core.js', () => ({
  normalizeDbError: (error) =>
    error ? { code: error.code || '', message: error.message || '' } : null,
}));

const { listMyLoginSessions, revokeMyLoginSession } =
  await import('@/utils/api/login-sessions-api.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('describeDeviceLabel', () => {
  it('微信内嵌浏览器优先于 Safari/Chrome（UA 里三者都有）', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2f) NetType/WIFI Language/zh_CN';
    expect(describeDeviceLabel(ua)).toBe('iOS · 微信');
  });

  it('iOS 上的 Chrome 是 CriOS，不是 Chrome/', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
    expect(describeDeviceLabel(ua)).toBe('iOS · Chrome');
  });

  it('桌面 Edge 不能被当成 Chrome', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
    expect(describeDeviceLabel(ua)).toBe('macOS · Edge');
  });

  it('空 UA 给「未知设备」，不要拼出「未知系统 · 浏览器」', () => {
    expect(describeDeviceLabel('')).toBe('未知设备');
    expect(describeDeviceLabel(null)).toBe('未知设备');
  });
});

describe('listMyLoginSessions', () => {
  it('把 RPC 的 snake_case 映射成前端模型，并丢掉没有 session_id 的脏行', async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: [
        {
          session_id: 'sid-1',
          created_at: '2026-11-16T01:00:00Z',
          last_active_at: '2026-11-16T02:00:00Z',
          user_agent: 'iPhone',
          is_current: true,
        },
        { session_id: '', created_at: null },
      ],
    });

    const result = await listMyLoginSessions();

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      sessionId: 'sid-1',
      createdAt: '2026-11-16T01:00:00Z',
      isCurrent: true,
    });
  });

  it('RPC 报错时返回空列表 + 归一化错误（调用方只判 ok）', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'boom', code: '42501' }, data: null });

    const result = await listMyLoginSessions();

    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.error.message).toBe('boom');
  });
});

describe('revokeMyLoginSession', () => {
  it('函数用 jsonb 表达业务失败 —— 不能当成功处理', async () => {
    mockRpc.mockResolvedValue({
      error: null,
      data: {
        ok: false,
        code: 'CANNOT_REVOKE_CURRENT',
        message: '不能在这里下线当前设备，请直接使用「退出登录」。',
      },
    });

    const result = await revokeMyLoginSession('sid-current');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CANNOT_REVOKE_CURRENT');
    expect(result.error.message).toContain('退出登录');
  });

  it('成功时返回 ok 且错误为空', async () => {
    mockRpc.mockResolvedValue({ error: null, data: { ok: true, code: 'REVOKED' } });

    const result = await revokeMyLoginSession('sid-other');

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it('空会话标识直接拒绝，不打网络', async () => {
    const result = await revokeMyLoginSession('');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
