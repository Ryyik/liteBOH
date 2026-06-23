import { beforeEach, describe, expect, it, vi } from 'vitest';

const lm = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  authGetUser: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    rpc: lm.rpcMock,
    from: lm.fromMock,
    auth: { getUser: lm.authGetUser },
  },
}));

vi.mock('../../src/utils/pushplus.js', () => ({
  sendNotificationPush: vi.fn(() => Promise.resolve({ success: true })),
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getHomeLottery,
  joinHomeLottery,
  getCommunityLotteries,
  joinCommunityLottery,
} from '../../src/utils/api/lottery-api.js';
import {
  getMySubscriptions,
  subscribeWithPoints,
} from '../../src/utils/api/subscription-api.js';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
} from '../../src/utils/api/notifications-api.js';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    lt: vi.fn(() => q),
    gt: vi.fn(() => q),
    in: vi.fn(() => q),
    single: vi.fn(() => q),
    maybeSingle: vi.fn(() => q),
    insert: vi.fn(() => q),
    update: vi.fn(() => q),
    delete: vi.fn(() => q),
    then: (resolve) => { Promise.resolve(result).then(resolve); return q; },
  };
  return q;
}

// ==================== Lottery API ====================
describe('lottery-api integration: getHomeLottery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns home lottery from RPC', async () => {
    lm.rpcMock.mockResolvedValue({
      data: {
        id: 'lottery-1',
        title: 'Weekly Draw',
        description: 'Win prizes',
        prize_title: 'Gift Card',
        status: 'open',
        is_community_visible: true,
        winner_count: 1,
        entry_count: 5,
      },
      error: null,
    });

    const result = await getHomeLottery();
    expect(result.error).toBeNull();
    expect(result.data.id).toBe('lottery-1');
    expect(result.data.title).toBe('Weekly Draw');
    expect(result.data.status).toBe('open');
  });

  it('falls back to direct query when RPC fails', async () => {
    lm.rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'RPC error', code: 'PGRST202' },
    });

    lm.fromMock.mockReturnValue(makeQuery({
      data: {
        id: 'lottery-2',
        title: 'Fallback Draw',
        status: 'open',
        is_home_visible: true,
      },
      error: null,
    }));

    const result = await getHomeLottery();
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
  });
});

describe('lottery-api integration: joinHomeLottery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty lottery ID', async () => {
    const result = await joinHomeLottery('');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('joins lottery via RPC', async () => {
    lm.rpcMock.mockResolvedValue({
      data: { ok: true, entry_id: 'entry-1', message: 'Successfully joined' },
      error: null,
    });

    const result = await joinHomeLottery('lottery-1');
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(lm.rpcMock).toHaveBeenCalledWith('join_home_lottery', { p_lottery_id: 'lottery-1' });
  });
});

describe('lottery-api integration: getCommunityLotteries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns community lotteries from RPC', async () => {
    lm.rpcMock.mockResolvedValue({
      data: [
        { id: 'l1', title: 'Draw 1', status: 'open', is_community_visible: true, winner_count: 1, entry_count: 3 },
        { id: 'l2', title: 'Draw 2', status: 'drawn', is_community_visible: true, winner_count: 1, entry_count: 10 },
      ],
      error: null,
    });

    const result = await getCommunityLotteries();
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
  });

  it('filters out invalid lottery data', async () => {
    lm.rpcMock.mockResolvedValue({
      data: [
        null,
        { id: 'l1', title: 'Valid', status: 'open', is_community_visible: true, winner_count: 1, entry_count: 0 },
      ],
      error: null,
    });

    const result = await getCommunityLotteries();
    expect(result.data).toHaveLength(1);
  });
});

describe('lottery-api integration: joinCommunityLottery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty lottery ID', async () => {
    const result = await joinCommunityLottery('');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('joins community lottery via RPC', async () => {
    lm.rpcMock.mockResolvedValue({
      data: { ok: true, entry_id: 'entry-2' },
      error: null,
    });

    const result = await joinCommunityLottery('lottery-1');
    expect(result.error).toBeNull();
    expect(lm.rpcMock).toHaveBeenCalledWith('join_community_lottery', { p_lottery_id: 'lottery-1' });
  });
});

// ==================== Subscription API ====================
describe('subscription-api integration: getMySubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects without userId', async () => {
    const result = await getMySubscriptions(null);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('returns active subscriptions', async () => {
    lm.fromMock.mockReturnValue(makeQuery({
      data: [
        {
          id: 'sub-1',
          user_id: 'u1',
          plan_code: 'premium',
          plan_name: 'Premium',
          billing_cycle: 'monthly',
          points_cost: 100,
          duration_months: 1,
          started_at: '2026-01-01',
          expires_at: '2026-07-01',
          status: 'active',
        },
      ],
      error: null,
    }));

    const result = await getMySubscriptions('u1');
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].planCode).toBe('premium');
    expect(result.data[0].status).toBe('active');
  });

  it('returns empty array when no subscriptions', async () => {
    lm.fromMock.mockReturnValue(makeQuery({ data: [], error: null }));
    const result = await getMySubscriptions('u1');
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(0);
  });
});

describe('subscription-api integration: subscribeWithPoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('subscribes via RPC', async () => {
    lm.rpcMock.mockResolvedValue({
      data: {
        ok: true,
        subscription_id: 'sub-new',
        plan_code: 'premium',
        plan_name: 'Premium',
        billing_cycle: 'monthly',
        points_deducted: 100,
        current_points: 900,
        required_points: 100,
        started_at: '2026-06-15',
        expires_at: '2026-07-15',
      },
      error: null,
    });

    const result = await subscribeWithPoints({
      planCode: 'premium',
      planName: 'Premium',
      billingCycle: 'monthly',
      pointsCost: 100,
      durationMonths: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.data.subscriptionId).toBe('sub-new');
    expect(result.data.pointsDeducted).toBe(100);
    expect(lm.rpcMock).toHaveBeenCalledWith('subscribe_with_points', expect.objectContaining({
      p_plan_code: 'premium',
      p_points_cost: 100,
    }));
  });

  it('handles insufficient points', async () => {
    lm.rpcMock.mockResolvedValue({
      data: {
        ok: false,
        message: '积分不足',
        plan_code: 'premium',
        points_deducted: 0,
        current_points: 50,
        required_points: 100,
      },
      error: null,
    });

    const result = await subscribeWithPoints({
      planCode: 'premium',
      pricing: 'premium',
      billingCycle: 'monthly',
      pointsCost: 100,
      durationMonths: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.data.message).toContain('积分不足');
  });
});

// ==================== Notifications API ====================
describe('notifications-api integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('getUserNotifications returns paginated list', async () => {
    lm.fromMock.mockReturnValue(makeQuery({
      data: [
        { id: 'n1', type: 'like', status: 'unread', created_at: '2026-06-15T10:00:00Z' },
        { id: 'n2', type: 'comment', status: 'read', created_at: '2026-06-14T10:00:00Z' },
      ],
      error: null,
    }));

    const result = await getUserNotifications('u1', { limit: 20 });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('getUnreadNotificationCount returns count', async () => {
    lm.rpcMock.mockResolvedValue({
      data: [{ count: 2 }],
      error: null,
    });

    const result = await getUnreadNotificationCount('u1');
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(lm.rpcMock).toHaveBeenCalledWith('get_unread_notification_count', { p_recipient_id: 'u1' });
  });

  it('markNotificationAsRead via RPC', async () => {
    lm.rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await markNotificationAsRead('n1');
    expect(result.ok).toBe(true);
    expect(lm.rpcMock).toHaveBeenCalledWith('mark_single_as_read', { notification_id: 'n1' });
  });

  it('markAllNotificationsAsRead via RPC', async () => {
    lm.rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await markAllNotificationsAsRead('u1');
    expect(result.ok).toBe(true);
    expect(lm.rpcMock).toHaveBeenCalledWith('mark_all_as_read', { target_user_id: 'u1' });
  });

  it('createNotification inserts and triggers push', async () => {
    lm.fromMock.mockReturnValue(makeQuery({
      data: [{ id: 'n-new', type: 'like', status: 'unread' }],
      error: null,
    }));

    const result = await createNotification('u1', 'u2', 'like', { post_id: 'p1' });
    expect(result.ok).toBe(true);
  });
});