import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: { rpc: mocks.rpc }
}));

import { getMyUserSpaceSummary } from '../../src/utils/api/user-space-api.js';

describe('user-space-api', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the aggregated summary', async () => {
    mocks.rpc.mockResolvedValue({
      data: { posts: 12, points: 80, rank: 3, cloud_image_used: 9, cloud_image_limit: 150 },
      error: null
    });

    const result = await getMyUserSpaceSummary();
    expect(result.ok).toBe(true);
    expect(result.data.posts).toBe(12);
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_user_space_summary');
  });

  it('marks a missing migration as unsupported', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find get_my_user_space_summary in schema cache' }
    });

    const result = await getMyUserSpaceSummary();
    expect(result.ok).toBe(false);
    expect(result.unsupported).toBe(true);
  });
});
