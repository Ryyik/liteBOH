import { beforeEach, describe, expect, it, vi } from 'vitest';

const cloudMocks = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  authGetUserMock: vi.fn(),
  fromMock: vi.fn()
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    rpc: cloudMocks.rpcMock,
    auth: {
      getUser: cloudMocks.authGetUserMock
    },
    from: cloudMocks.fromMock
  }
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  disableMyCloudShareChannel,
  getMyCloudShareViewers,
  revokeMyCloudShareToken,
  setMyCloudShareDescription,
  upsertMyCloudShareChannel
} from '../../src/utils/api/boh-cloud-api.js';

describe('boh-cloud-api private token channel', () => {
  beforeEach(() => {
    cloudMocks.rpcMock.mockReset();
    cloudMocks.authGetUserMock.mockReset();
    cloudMocks.fromMock.mockReset();
    clearRequestCache();
  });

  it('hard-codes token visibility for share channel writes', async () => {
    cloudMocks.rpcMock.mockResolvedValue({
      data: {
        ok: true,
        channel: {
          id: 'c1',
          user_id: 'u1',
          share_token: 'ABCD1234EFGH5678',
          is_active: true,
          visibility: 'token'
        }
      },
      error: null
    });

    const result = await upsertMyCloudShareChannel({
      regenerate: false,
      visibility: 'public',
      description: 'private note'
    });

    expect(result.ok).toBe(true);
    expect(cloudMocks.rpcMock).toHaveBeenCalledWith('upsert_my_boh_cloud_share_channel', {
      p_regenerate: false,
      p_visibility: 'token',
      p_description: 'private note'
    });
  });

  it('revokes the current token by regenerating a token channel', async () => {
    cloudMocks.rpcMock.mockResolvedValue({
      data: {
        ok: true,
        channel: {
          id: 'c1',
          user_id: 'u1',
          share_token: 'NEWTOKEN12345678',
          is_active: true,
          visibility: 'token'
        }
      },
      error: null
    });

    const result = await revokeMyCloudShareToken();

    expect(result.ok).toBe(true);
    expect(cloudMocks.rpcMock).toHaveBeenCalledWith('upsert_my_boh_cloud_share_channel', {
      p_regenerate: true,
      p_visibility: 'token',
      p_description: null
    });
  });

  it('does not expose caller-controlled visibility for viewers, notes, or disable', async () => {
    cloudMocks.rpcMock
      .mockResolvedValueOnce({
        data: { ok: true, viewers: [] },
        error: null
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          channel: { id: 'c1', user_id: 'u1', share_token: 'TOKEN1234567890', is_active: true }
        },
        error: null
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          channel: { id: 'c1', user_id: 'u1', share_token: 'TOKEN1234567890', is_active: false }
        },
        error: null
      });

    await getMyCloudShareViewers({ limit: 10, visibility: 'public' });
    await setMyCloudShareDescription('for close friends', 'public');
    await disableMyCloudShareChannel('public');

    expect(cloudMocks.rpcMock).toHaveBeenNthCalledWith(1, 'get_my_boh_cloud_share_viewers', {
      p_limit: 10,
      p_visibility: 'token'
    });
    expect(cloudMocks.rpcMock).toHaveBeenNthCalledWith(2, 'set_my_boh_cloud_share_description', {
      p_description: 'for close friends',
      p_visibility: 'token'
    });
    expect(cloudMocks.rpcMock).toHaveBeenNthCalledWith(3, 'disable_my_boh_cloud_share_channel', {
      p_visibility: 'token'
    });
  });
});
