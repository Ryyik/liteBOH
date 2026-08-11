import { supabase } from '@/utils/supabase-client.js';
import { normalizeDbError } from '@/utils/request-core.js';

export async function grantPoints({ userIds = null, amount = 0, remark = '' }) {
  const { data, error } = await supabase.rpc('admin_grant_points', {
    p_user_ids: Array.isArray(userIds) && userIds.length > 0 ? userIds : null,
    p_amount: Number(amount) || 0,
    p_remark: String(remark || '').trim()
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '发放积分失败');
  }
  return data;
}

export async function fetchRecentGrants(limit = 20) {
  const { data, error } = await supabase
    .from('points_transactions')
    .select('id, user_id, amount, balance_after, reason, remark, operator_id, created_at')
    .eq('reason', 'admin_grant')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '加载发放记录失败');
  }
  return Array.isArray(data) ? data : [];
}

export async function searchGrantTargetUsers(query = '', limit = 30) {
  const safeQuery = String(query || '').trim();
  let builder = supabase
    .from('profiles')
    .select('id, username, points, role')
    .order('points', { ascending: false })
    .limit(limit);
  if (safeQuery) {
    builder = builder.or(`username.ilike.%${safeQuery}%,id.eq.${safeQuery}`);
  }
  const { data, error } = await builder;
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '搜索用户失败');
  }
  return Array.isArray(data) ? data : [];
}
