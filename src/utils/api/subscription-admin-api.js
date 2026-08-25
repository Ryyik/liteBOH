import { supabase } from '@/utils/supabase-client.js';
import { normalizeDbError } from '@/utils/request-core.js';

export async function grantSubscriptions({
  userIds = null,
  planCode = '',
  planName = '',
  billingCycle = 'monthly',
  pointsCost = 0,
  durationMonths = 1,
  startedAt = null,
  expiresAt = null,
  status = 'active',
  skipExisting = false,
  skipAnyTier = false
} = {}) {
  const { data, error } = await supabase.rpc('admin_batch_grant_subscriptions', {
    p_user_ids: Array.isArray(userIds) && userIds.length > 0 ? userIds : null,
    p_plan_code: String(planCode || '').trim(),
    p_plan_name: String(planName || '').trim(),
    p_billing_cycle: String(billingCycle || 'monthly').trim(),
    p_points_cost: Number(pointsCost) || 0,
    p_duration_months: Number(durationMonths) || 1,
    p_started_at: startedAt || null,
    p_expires_at: expiresAt || null,
    p_status: String(status || 'active').trim(),
    p_skip_existing: Boolean(skipExisting),
    p_skip_any_tier: Boolean(skipAnyTier)
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '批量发放订阅失败');
  }
  return data;
}

export async function updateSubscription({
  subscriptionId,
  planCode = '',
  planName = '',
  billingCycle = 'monthly',
  pointsCost = 0,
  durationMonths = 1,
  startedAt = null,
  expiresAt = null,
  status = 'active'
}) {
  const { data, error } = await supabase.rpc('admin_update_subscription', {
    p_subscription_id: subscriptionId,
    p_plan_code: String(planCode || '').trim(),
    p_plan_name: String(planName || '').trim(),
    p_billing_cycle: String(billingCycle || 'monthly').trim(),
    p_points_cost: Number(pointsCost) || 0,
    p_duration_months: Number(durationMonths) || 1,
    p_started_at: startedAt || null,
    p_expires_at: expiresAt || null,
    p_status: String(status || 'active').trim()
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '编辑订阅失败');
  }
  return data;
}

export async function cancelSubscription({ subscriptionId }) {
  if (!subscriptionId) throw new Error('缺少订阅记录ID');
  const { data, error } = await supabase.rpc('admin_cancel_subscription', {
    p_subscription_id: subscriptionId
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '撤销订阅失败');
  }
  return data;
}

export async function cancelSubscriptionBatch({ batchId }) {
  if (!batchId) throw new Error('缺少发放批次ID');
  const { data, error } = await supabase.rpc('admin_cancel_subscription_batch', {
    p_batch_id: batchId
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '撤销发放批次失败');
  }
  return data;
}

export async function fetchExistingSubscribers(planCode = '', anyTier = false, limit = 200) {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit) || 200)));
  const { data, error } = await supabase.rpc('admin_list_existing_subscribers', {
    p_plan_code: String(planCode || '').trim() || null,
    p_any_tier: Boolean(anyTier),
    p_limit: safeLimit
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '加载已有订阅用户失败');
  }
  const result = data || {};
  return {
    rows: Array.isArray(result.rows) ? result.rows : [],
    total: Number(result.total || 0),
    sameTotal: Number(result.same_total || 0),
    anyTotal: Number(result.any_total || 0)
  };
}

export async function fetchRecentSubscriptionBatches({ page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Math.trunc(Number(page) || 1));
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(Number(pageSize) || 20)));
  const { data, error } = await supabase.rpc('admin_list_subscription_grant_batches', {
    p_page: safePage,
    p_page_size: safePageSize
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '加载发放记录失败');
  }
  const result = data || {};
  return {
    rows: Array.isArray(result.rows) ? result.rows : [],
    total: Number(result.total || 0)
  };
}

const GRANT_SEARCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizePostgrestQuery(query) {
  return String(query || '')
    .replace(/["']/g, '')
    .replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function fetchSubscriptionTargetCount() {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '查询用户数量失败');
  }
  return Number(count || 0);
}

export async function searchSubscriptionTargetUsers(query = '', limit = 30) {
  const safeQuery = String(query || '').trim();
  let builder = supabase
    .from('profiles')
    .select('id, username, points, role, avatar_url')
    .order('points', { ascending: false })
    .limit(limit);
  if (safeQuery) {
    if (GRANT_SEARCH_UUID_RE.test(safeQuery)) {
      builder = builder.eq('id', safeQuery);
    } else {
      const sanitized = sanitizePostgrestQuery(safeQuery);
      if (sanitized) {
        builder = builder.ilike('username', `%${sanitized}%`);
      }
    }
  }
  const { data, error } = await builder;
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '搜索用户失败');
  }
  return Array.isArray(data) ? data : [];
}
