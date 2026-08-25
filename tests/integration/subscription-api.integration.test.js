import { beforeEach, describe, expect, it, vi } from 'vitest';

const sm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: sm.supabaseFrom,
    rpc: sm.supabaseRpc,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getMySubscriptions,
  subscribeWithPoints,
  startSubscriptionTrial,
} from '../../src/utils/api/subscription-api.js';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    gt: vi.fn((col, val) => { calls.push({ method: 'gt', col, val }); return q; }),
    order: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('subscription-api: getMySubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns error when userId is empty', async () => {
    const result = await getMySubscriptions('');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('登录');
  });

  it('fetches active subscriptions', async () => {
    sm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { id: 'sub1', user_id: 'u1', plan_code: 'pro', plan_name: 'Pro Plan', billing_cycle: 'monthly', points_cost: 100, duration_months: 1, started_at: '2024-01-01', expires_at: '2025-01-01', status: 'active', metadata: {} },
      ],
      error: null,
    }));

    const result = await getMySubscriptions('u1');
    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(1);
    expect(result.data[0].planCode).toBe('pro');
    expect(result.data[0].planName).toBe('Pro Plan');
  });

  it('normalizes null row fields', async () => {
    sm.supabaseFrom.mockReturnValue(makeQuery({
      data: [{ id: null, user_id: null, plan_code: null, points_cost: null, duration_months: null, metadata: null }],
      error: null,
    }));

    const result = await getMySubscriptions('u1');
    expect(result.data[0].id).toBe('');
    expect(result.data[0].planCode).toBe('');
    expect(result.data[0].pointsCost).toBe(0);
    expect(result.data[0].durationMonths).toBe(0);
    expect(result.data[0].metadata).toEqual({});
  });

  it('handles database error', async () => {
    sm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'DB error', code: '500' },
    }));

    const result = await getMySubscriptions('u1');
    expect(result.data).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

describe('subscription-api: subscribeWithPoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('calls RPC with normalized payload', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: { ok: true, subscription_id: 'sub-new', plan_code: 'pro', plan_name: 'Pro', billing_cycle: 'monthly', points_deducted: 100, current_points: 900, required_points: 100, started_at: '2024-01-01', expires_at: '2025-01-01' },
      error: null,
    });

    const result = await subscribeWithPoints({
      planCode: 'pro',
      planName: 'Pro',
      billingCycle: 'monthly',
      pointsCost: 100,
      durationMonths: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.data.subscriptionId).toBe('sub-new');
    expect(result.data.pointsDeducted).toBe(100);
    expect(sm.supabaseRpc).toHaveBeenCalledWith('subscribe_with_points', expect.objectContaining({
      p_plan_code: 'pro',
      p_points_cost: 100,
    }));
  });

  it('normalizes upgrade proration fields', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: { ok: true, subscription_id: 'sub-up', plan_code: 'ultra', plan_name: 'Ultra', billing_cycle: 'monthly', points_deducted: 46, current_points: 854, required_points: 70, action: 'upgrade', previous_plan_code: 'plus', credit_applied: 24, remaining_days: 11, started_at: '2024-01-01', expires_at: '2025-02-01' },
      error: null,
    });

    const result = await subscribeWithPoints({
      planCode: 'ultra',
      planName: 'Ultra',
      billingCycle: 'monthly',
      pointsCost: 70,
      durationMonths: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.data.action).toBe('upgrade');
    expect(result.data.previousPlanCode).toBe('plus');
    expect(result.data.creditApplied).toBe(24);
    expect(result.data.remainingDays).toBe(11);
    expect(result.data.pointsDeducted).toBe(46);
    expect(result.data.requiredPoints).toBe(70);
  });

  it('normalizes renew action with no proration fields', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: { ok: true, subscription_id: 'sub-renew', plan_code: 'pro', plan_name: 'Pro', billing_cycle: 'monthly', points_deducted: 20, current_points: 880, required_points: 20, action: 'renew', previous_plan_code: '', credit_applied: 0, remaining_days: 0, started_at: '2025-02-01', expires_at: '2025-03-01' },
      error: null,
    });

    const result = await subscribeWithPoints({
      planCode: 'pro',
      planName: 'Pro',
      billingCycle: 'monthly',
      pointsCost: 20,
      durationMonths: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.data.action).toBe('renew');
    expect(result.data.previousPlanCode).toBe(null);
    expect(result.data.creditApplied).toBe(0);
    expect(result.data.remainingDays).toBe(0);
  });

  it('handles RPC error', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' },
    });

    const result = await subscribeWithPoints({
      planCode: 'pro',
      planName: 'Pro',
      pointsCost: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data.pointsDeducted).toBe(0);
  });

  it('normalizes array payload', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: [{ ok: true, subscription_id: 'sub-wrapped', plan_code: 'basic', plan_name: 'Basic', billing_cycle: 'monthly', points_deducted: 50, current_points: 950, required_points: 50 }],
      error: null,
    });

    const result = await subscribeWithPoints({
      planCode: 'basic',
      planName: 'Basic',
      pointsCost: 50,
    });
    expect(result.ok).toBe(true);
    expect(result.data.subscriptionId).toBe('sub-wrapped');
    expect(result.data.pointsDeducted).toBe(50);
  });

  it('handles RPC returning ok: false', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: { ok: false, message: 'Already subscribed', subscription_id: null, points_deducted: 0, current_points: 1000 },
      error: null,
    });

    const result = await subscribeWithPoints({
      planCode: 'pro',
      planName: 'Pro',
      pointsCost: 100,
    });
    expect(result.ok).toBe(false);
  });
});

describe('subscription-api: startSubscriptionTrial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('calls RPC with normalized args and maps response', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: { ok: true, message: 'TRIAL_STARTED', subscription_id: 'sub-trial', plan_code: 'pro', plan_name: 'Pro', expires_at: '2024-01-04', trial_days: 3 },
      error: null,
    });

    const result = await startSubscriptionTrial({ planCode: 'pro', durationDays: 3 });
    expect(result.ok).toBe(true);
    expect(result.data.subscriptionId).toBe('sub-trial');
    expect(result.data.planCode).toBe('pro');
    expect(result.data.trialDays).toBe(3);
    expect(sm.supabaseRpc).toHaveBeenCalledWith('start_subscription_trial', expect.objectContaining({
      p_plan_code: 'pro',
      p_duration_days: 3,
    }));
  });

  it('returns failure when RPC returns ok: false', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: { ok: false, message: 'TRIAL_ALREADY_USED', subscription_id: null },
      error: null,
    });

    const result = await startSubscriptionTrial({ planCode: 'pro', durationDays: 3 });
    expect(result.ok).toBe(false);
    expect(result.data.message).toBe('TRIAL_ALREADY_USED');
  });

  it('propagates RPC error', async () => {
    sm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'auth', code: 'NOT_AUTHENTICATED' },
    });

    const result = await startSubscriptionTrial({ planCode: 'pro', durationDays: 3 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});