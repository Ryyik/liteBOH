import { beforeEach, describe, expect, it, vi } from 'vitest';

const vm = vi.hoisted(() => ({
  rpc: vi.fn()
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: { rpc: vm.rpc }
}));

import { fetchRecentGrants } from '../../src/utils/api/points-admin-api.js';

describe('points-admin-api: fetchRecentGrants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a page of grant batches and exposes the server total', async () => {
    vm.rpc.mockResolvedValue({
      data: [
        { batch_key: 'batch-1', total_count: 31 },
        { batch_key: 'batch-2', total_count: 31 }
      ],
      error: null
    });

    const result = await fetchRecentGrants({ page: 2, pageSize: 20 });

    expect(vm.rpc).toHaveBeenCalledWith('admin_list_point_grant_batches', {
      p_page: 2,
      p_page_size: 20
    });
    expect(result).toEqual({
      rows: [
        { batch_key: 'batch-1', total_count: 31 },
        { batch_key: 'batch-2', total_count: 31 }
      ],
      total: 31
    });
  });

  it('normalizes invalid page parameters', async () => {
    vm.rpc.mockResolvedValue({ data: [], error: null });

    await fetchRecentGrants({ page: 0, pageSize: 200 });

    expect(vm.rpc).toHaveBeenCalledWith('admin_list_point_grant_batches', {
      p_page: 1,
      p_page_size: 50
    });
  });
});
