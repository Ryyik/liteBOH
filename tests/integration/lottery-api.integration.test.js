import { beforeEach, describe, expect, it, vi } from 'vitest';

const lm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: lm.supabaseFrom,
    rpc: lm.supabaseRpc,
  },
}));

import {
  getHomeLottery,
  joinHomeLottery,
  getCommunityLotteries,
  joinCommunityLottery,
} from '../../src/utils/api/lottery-api.js';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    in: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    maybeSingle: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('lottery-api: getHomeLottery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalized lottery from RPC', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: { id: 'lot1', title: 'Test Lottery', description: 'Desc', prize_title: 'Prize', prize_description: 'Cool prize', cover_image_url: '', status: 'open', is_community_visible: true, max_entries: 100, winner_count: 1, entry_count: 5, entry_deadline_at: null, draw_at: null, drawn_at: null, winner_user_id: null, winner_username: '', winners: [], current_user_entry_id: null, current_user_entry_created_at: null, current_user_entry_number: null, created_at: '2024-01-01', updated_at: '2024-01-02' },
      error: null,
    });

    const result = await getHomeLottery();
    expect(result.data).toBeDefined();
    expect(result.data.title).toBe('Test Lottery');
    expect(result.data.status).toBe('open');
    expect(result.data.winner_count).toBe(1);
    expect(result.error).toBeNull();
  });

  it('falls back to direct query when RPC fails', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC not found', code: 'PGRST202' },
    });

    lm.supabaseFrom.mockReturnValue(makeQuery({
      data: { id: 'lot-fb', title: 'Fallback Lottery', description: '', prize_title: '', prize_description: '', cover_image_url: '', status: 'open', is_home_visible: true, max_entries: null, winner_count: 1, entry_deadline_at: null, draw_at: null, drawn_at: null, winner_user_id: null, winner_username: '', fulfillment_status: null, created_at: '2024-01-01', updated_at: '2024-01-02' },
      error: null,
    }));

    const result = await getHomeLottery();
    expect(result.data).toBeDefined();
    expect(result.data.title).toBe('Fallback Lottery');
    expect(result.data.entry_count).toBe(0);
  });

  it('returns null when both RPC and fallback fail', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'Error' },
    });

    lm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'Fallback also failed' },
    }));

    const result = await getHomeLottery();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe('lottery-api: joinHomeLottery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty lottery ID', async () => {
    const result = await joinHomeLottery('');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('不能为空');
  });

  it('calls RPC with lottery ID', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: { entry_id: 'entry1', lottery_id: 'lot1' },
      error: null,
    });

    const result = await joinHomeLottery('lot1');
    expect(result.data).toBeDefined();
    expect(result.data.entry_id).toBe('entry1');
    expect(lm.supabaseRpc).toHaveBeenCalledWith('join_home_lottery', { p_lottery_id: 'lot1' });
  });

  it('handles RPC error', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'Already joined' },
    });

    const result = await joinHomeLottery('lot1');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe('lottery-api: getCommunityLotteries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalized lottery list from RPC', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: [
        { id: 'clot1', title: 'Community Lottery 1', description: '', prize_title: '', prize_description: '', cover_image_url: '', status: 'open', is_community_visible: true, max_entries: 50, winner_count: 3, entry_count: 10, entry_deadline_at: null, draw_at: null, drawn_at: null, winner_user_id: null, winner_username: '', winners: [], current_user_entry_id: null, current_user_entry_created_at: null, current_user_entry_number: null, created_at: '2024-01-01', updated_at: '2024-01-02' },
        { id: 'clot2', title: 'Community Lottery 2', description: '', prize_title: '', prize_description: '', cover_image_url: '', status: 'drawn', is_community_visible: true, max_entries: null, winner_count: 1, entry_count: 5, entry_deadline_at: null, draw_at: '2024-06-01', drawn_at: '2024-06-01', winner_user_id: 'w1', winner_username: 'winnerUser', winners: [{ position: 1, user_id: 'w1', username: 'winnerUser' }], current_user_entry_id: null, current_user_entry_created_at: null, current_user_entry_number: null, created_at: '2024-01-01', updated_at: '2024-06-01' },
      ],
      error: null,
    });

    const result = await getCommunityLotteries();
    expect(result.data.length).toBe(2);
    expect(result.data[0].title).toBe('Community Lottery 1');
    expect(result.data[1].status).toBe('drawn');
    expect(result.data[1].winners.length).toBe(1);
    expect(result.data[1].winners[0].username).toBe('winnerUser');
  });

  it('falls back to direct query when RPC fails', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC error' },
    });

    lm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { id: 'clot-fb', title: 'Fallback Community', description: '', prize_title: '', prize_description: '', cover_image_url: '', status: 'open', is_community_visible: true, max_entries: null, winner_count: 1, entry_deadline_at: null, draw_at: null, drawn_at: null, winner_user_id: null, winner_username: '', fulfillment_status: null, created_at: '2024-01-01', updated_at: '2024-01-02' },
      ],
      error: null,
    }));

    const result = await getCommunityLotteries();
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe('Fallback Community');
  });

  it('returns empty array when both RPC and fallback fail', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'Error' },
    });

    lm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'Fallback error' },
    }));

    const result = await getCommunityLotteries();
    expect(result.data).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('normalizes winners array filtering empty entries', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: [
        { id: 'clot3', title: 'Test', description: '', prize_title: '', prize_description: '', cover_image_url: '', status: 'drawn', is_community_visible: true, max_entries: null, winner_count: 1, entry_count: 5, entry_deadline_at: null, draw_at: null, drawn_at: null, winner_user_id: null, winner_username: '', winners: [{ position: 1, user_id: null, username: '' }, { position: 2, user_id: 'u2', username: 'realUser' }], current_user_entry_id: null, current_user_entry_created_at: null, current_user_entry_number: null, created_at: '2024-01-01', updated_at: '2024-01-02' },
      ],
      error: null,
    });

    const result = await getCommunityLotteries();
    expect(result.data[0].winners.length).toBe(1);
    expect(result.data[0].winners[0].username).toBe('realUser');
  });
});

describe('lottery-api: joinCommunityLottery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty lottery ID', async () => {
    const result = await joinCommunityLottery('  ');
    expect(result.data).toBeNull();
    expect(result.error.message).toContain('不能为空');
  });

  it('calls RPC with lottery ID', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: { entry_id: 'centry1' },
      error: null,
    });

    const result = await joinCommunityLottery('clot1');
    expect(result.data.entry_id).toBe('centry1');
    expect(lm.supabaseRpc).toHaveBeenCalledWith('join_community_lottery', { p_lottery_id: 'clot1' });
  });

  it('handles RPC error', async () => {
    lm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'Lottery closed' },
    });

    const result = await joinCommunityLottery('clot1');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});