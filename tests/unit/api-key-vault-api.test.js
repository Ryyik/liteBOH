import { beforeEach, describe, expect, it, vi } from 'vitest';

const vm = vi.hoisted(() => ({
  supabaseFunctions: { invoke: vi.fn() },
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    functions: vm.supabaseFunctions,
  },
}));

import {
  listApiKeys,
  upsertApiKey,
  updateApiKeyStatus,
  testApiKey,
} from '../../src/utils/api/api-key-vault-api.js';

describe('api-key-vault-api: listApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists keys via edge function', async () => {
    vm.supabaseFunctions.invoke.mockResolvedValue({
      data: {
        ok: true,
        data: [
          { id: 'key1', provider: 'siliconflow', masked_key: 'sk-***1234', status: 'active' },
          { id: 'key2', provider: 'tavily', masked_key: 'tvly-***5678', status: 'active' },
        ],
      },
      error: null,
    });

    const result = await listApiKeys();
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].provider).toBe('siliconflow');
    expect(vm.supabaseFunctions.invoke).toHaveBeenCalledWith('api-key-vault', {
      body: { action: 'list' },
    });
  });

  it('handles invoke error', async () => {
    vm.supabaseFunctions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Function error', name: 'FUNCTION_INVOKE_ERROR' },
    });

    const result = await listApiKeys();
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('FUNCTION_INVOKE_ERROR');
  });

  it('handles vault returning ok:false', async () => {
    vm.supabaseFunctions.invoke.mockResolvedValue({
      data: { ok: false, message: 'No keys found', code: 'NO_KEYS' },
      error: null,
    });

    const result = await listApiKeys();
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NO_KEYS');
  });
});

describe('api-key-vault-api: upsertApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts a key via edge function', async () => {
    vm.supabaseFunctions.invoke.mockResolvedValue({
      data: { ok: true, data: { id: 'new-key', provider: 'siliconflow' } },
      error: null,
    });

    const result = await upsertApiKey({ provider: 'siliconflow', api_key: 'sk-test123' });
    expect(result.ok).toBe(true);
    expect(result.data.id).toBe('new-key');
    expect(vm.supabaseFunctions.invoke).toHaveBeenCalledWith('api-key-vault', {
      body: { action: 'upsert', provider: 'siliconflow', api_key: 'sk-test123' },
    });
  });
});

describe('api-key-vault-api: updateApiKeyStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates key status via edge function', async () => {
    vm.supabaseFunctions.invoke.mockResolvedValue({
      data: { ok: true, data: { id: 'key1', status: 'disabled' } },
      error: null,
    });

    const result = await updateApiKeyStatus('key1', 'disabled');
    expect(result.ok).toBe(true);
    expect(vm.supabaseFunctions.invoke).toHaveBeenCalledWith('api-key-vault', {
      body: { action: 'status', id: 'key1', status: 'disabled' },
    });
  });
});

describe('api-key-vault-api: testApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tests a key via edge function', async () => {
    vm.supabaseFunctions.invoke.mockResolvedValue({
      data: { ok: true, data: { valid: true, latency_ms: 120 } },
      error: null,
    });

    const result = await testApiKey('key1', { provider: 'siliconflow' });
    expect(result.ok).toBe(true);
    expect(result.data.valid).toBe(true);
    expect(vm.supabaseFunctions.invoke).toHaveBeenCalledWith('api-key-vault', {
      body: { action: 'test', id: 'key1', provider: 'siliconflow' },
    });
  });
});