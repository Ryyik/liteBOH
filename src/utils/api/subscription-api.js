import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
import { CACHE_TTL_LEVELS } from '../cache-strategy.js';

function normalizeSubscriptionRow(row = {}) {
  return {
    id: row.id || '',
    userId: row.user_id || '',
    planCode: row.plan_code || '',
    planName: row.plan_name || '',
    billingCycle: row.billing_cycle || '',
    pointsCost: Number(row.points_cost || 0),
    durationMonths: Number(row.duration_months || 0),
    startedAt: row.started_at || null,
    expiresAt: row.expires_at || null,
    status: row.status || 'active',
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function normalizeSubscribePayload(payload = {}) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const safe = source || {};

  return {
    ok: safe.ok !== false,
    message: String(safe.message || ''),
    subscriptionId: safe.subscription_id || null,
    planCode: safe.plan_code || '',
    planName: safe.plan_name || '',
    billingCycle: safe.billing_cycle || '',
    pointsDeducted: Number(safe.points_deducted || 0),
    currentPoints: Number(safe.current_points || 0),
    requiredPoints: Number(safe.required_points || 0),
    startedAt: safe.started_at || null,
    expiresAt: safe.expires_at || null
  };
}

export async function getMySubscriptions(userId, options = {}) {
  const includeExpired = options.includeExpired !== false;
  if (!userId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '用户未登录', code: 'NOT_AUTHENTICATED' }) };
  }

  return executeRead(
    'subscriptions.getMySubscriptions',
    { userId, includeExpired },
    async () => {
      let query = supabase
        .from('user_subscriptions')
        .select(`
          id,
          user_id,
          plan_code,
          plan_name,
          billing_cycle,
          points_cost,
          duration_months,
          started_at,
          expires_at,
          status,
          metadata,
          created_at,
          updated_at
        `)
        .eq('user_id', userId)
        .order('expires_at', { ascending: false });

      if (!includeExpired) {
        query = query
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString());
      }

      const { data, error } = await query;
      if (error) return { data: [], error };
      return { data: (data || []).map(normalizeSubscriptionRow), error: null };
    },
    { ttlMs: CACHE_TTL_LEVELS.REALTIME, tags: ['subscriptions', `subscriptions:user:${userId}`], timeoutMs: 8000, retry: 0 }
  );
}

export async function subscribeWithPoints(payload = {}) {
  const {
    planCode = '',
    planName = '',
    billingCycle = 'monthly',
    pointsCost = 0,
    durationMonths = 1,
    metadata = {}
  } = payload;

  const { data, error } = await supabase.rpc('subscribe_with_points', {
    p_plan_code: planCode,
    p_plan_name: planName,
    p_billing_cycle: billingCycle,
    p_points_cost: Number(pointsCost || 0),
    p_duration_months: Number(durationMonths || 0),
    p_metadata: metadata || {}
  });

  if (error) {
    return {
      ok: false,
      data: normalizeSubscribePayload(),
      error: normalizeDbError(error)
    };
  }

  const normalized = normalizeSubscribePayload(data);
  if (normalized.ok) {
    invalidateByTags(['profiles', 'subscriptions']);
  }

  return {
    ok: normalized.ok,
    data: normalized,
    error: null
  };
}

function normalizeAnniversaryClaim(payload = {}) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const safe = source || {};
  return {
    ok: safe.ok === true,
    message: String(safe.message || ''),
    alreadyClaimed: Boolean(safe.already_claimed),
    planCode: String(safe.plan_code || ''),
    planName: String(safe.plan_name || ''),
    subscriptionId: safe.subscription_id || null,
    startedAt: safe.started_at || null,
    expiresAt: safe.expires_at || null
  };
}

export async function getAnniversarySubscriptionClaim(userId) {
  if (!userId) return { ok: false, data: null, error: null };
  const { data, error } = await supabase
    .from('anniversary_subscription_claims')
    .select('granted_plan_code, granted_plan_name, subscription_id, started_at, expires_at')
    .eq('campaign_code', 'boh-8th-anniversary-2026')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ok: false, data: null, error: normalizeDbError(error) };
  if (!data) return { ok: true, data: null, error: null };
  return {
    ok: true,
    data: normalizeAnniversaryClaim({
      ok: true,
      already_claimed: true,
      plan_code: data.granted_plan_code,
      plan_name: data.granted_plan_name,
      subscription_id: data.subscription_id,
      started_at: data.started_at,
      expires_at: data.expires_at
    }),
    error: null
  };
}

export async function claimAnniversarySubscription({ preferCurrentTier = true } = {}) {
  const { data, error } = await supabase.rpc('claim_boh_eighth_anniversary_subscription', {
    p_prefer_current_tier: Boolean(preferCurrentTier)
  });

  if (error) return { ok: false, data: normalizeAnniversaryClaim(), error: normalizeDbError(error) };
  const normalized = normalizeAnniversaryClaim(data);
  if (normalized.ok || normalized.alreadyClaimed) {
    invalidateByTags(['profiles', 'subscriptions']);
  }
  return { ok: normalized.ok, data: normalized, error: null };
}
