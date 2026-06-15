import { beforeEach, describe, expect, it, vi } from 'vitest';

const pm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: pm.supabaseFrom,
    rpc: pm.supabaseRpc,
  },
}));

vi.mock('../../src/utils/pushplus.js', () => ({
  validatePushplusToken: vi.fn(() => true),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getPushplusSettings,
  updatePushplusToken,
  togglePushplusEnabled,
  deletePushplusToken,
  getUserPushplusToken,
} from '../../src/utils/api/pushplus-api.js';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    update: vi.fn(() => q),
    single: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('pushplus-api: getPushplusSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns pushplus settings', async () => {
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: { pushplus_token: 'tok-123', pushplus_enabled: true },
      error: null,
    }));

    const result = await getPushplusSettings('u1');
    expect(result.error).toBeNull();
    expect(result.data.token).toBe('tok-123');
    expect(result.data.enabled).toBe(true);
  });

  it('returns defaults when no settings', async () => {
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: { pushplus_token: null, pushplus_enabled: false },
      error: null,
    }));

    const result = await getPushplusSettings('u1');
    expect(result.data.token).toBe('');
    expect(result.data.enabled).toBe(false);
  });

  it('handles database error gracefully', async () => {
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'DB error', code: 'NOT_FOUND' },
    }));

    const result = await getPushplusSettings('u1');
    expect(result.error).toBeDefined();
  });
});

describe('pushplus-api: updatePushplusToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects short token', async () => {
    const result = await updatePushplusToken('u1', 'short');
    expect(result.success).toBe(false);
    expect(result.message).toContain('格式不正确');
  });

  it('rejects invalid token', async () => {
    const { validatePushplusToken } = await import('../../src/utils/pushplus.js');
    validatePushplusToken.mockReturnValue(false);

    const result = await updatePushplusToken('u1', 'invalid-token-12345');
    expect(result.success).toBe(false);
    expect(result.message).toContain('验证失败');
  });

  it('updates token successfully', async () => {
    const { validatePushplusToken } = await import('../../src/utils/pushplus.js');
    validatePushplusToken.mockReturnValue(true);
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: null,
    }));

    const result = await updatePushplusToken('u1', 'valid-token-with-min-10-chars');
    expect(result.success).toBe(true);
    expect(result.message).toContain('保存成功');
  });

  it('handles database save error', async () => {
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'Save failed' },
    }));

    const result = await updatePushplusToken('u1', 'valid-token-with-min-10-chars');
    expect(result.success).toBe(false);
  });
});

describe('pushplus-api: togglePushplusEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects enabling without token', async () => {
    // First call returns no token
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: { pushplus_token: '', pushplus_enabled: false },
      error: null,
    }));

    const result = await togglePushplusEnabled('u1', true);
    expect(result.success).toBe(false);
    expect(result.message).toContain('请先配置');
  });

  it('enables pushplus with existing token', async () => {
    // Token check: from → select → eq → single
    pm.supabaseFrom.mockReturnValueOnce(makeQuery({
      data: { pushplus_token: 'existing-token', pushplus_enabled: false },
      error: null,
    }));
    // Update: from → update → eq
    pm.supabaseFrom.mockReturnValueOnce(makeQuery({
      data: null,
      error: null,
    }));

    const result = await togglePushplusEnabled('u1', true);
    expect(result.success).toBe(true);
  });

  it('disables pushplus', async () => {
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: null,
    }));

    const result = await togglePushplusEnabled('u1', false);
    expect(result.success).toBe(true);
  });
});

describe('pushplus-api: deletePushplusToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('deletes token successfully', async () => {
    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: null,
    }));

    const result = await deletePushplusToken('u1');
    expect(result.success).toBe(true);
    expect(result.message).toContain('已删除');
  });
});

describe('pushplus-api: getUserPushplusToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns null for empty userId', async () => {
    const result = await getUserPushplusToken('');
    expect(result).toBeNull();
  });

  it('returns token from RPC', async () => {
    pm.supabaseRpc.mockResolvedValue({
      data: 'tok-from-rpc',
      error: null,
    });

    const result = await getUserPushplusToken('u1');
    expect(result).toBe('tok-from-rpc');
  });

  it('falls back to direct query when RPC missing', async () => {
    pm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC not found', code: 'PGRST202' },
    });

    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: { pushplus_token: 'tok-direct', pushplus_enabled: true },
      error: null,
    }));

    const result = await getUserPushplusToken('u1');
    expect(result).toBe('tok-direct');
  });

  it('returns null when both RPC and direct query fail', async () => {
    pm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'Error' },
    });

    pm.supabaseFrom.mockReturnValue(makeQuery({
      data: { pushplus_token: null, pushplus_enabled: false },
      error: null,
    }));

    const result = await getUserPushplusToken('u1');
    expect(result).toBeNull();
  });
});