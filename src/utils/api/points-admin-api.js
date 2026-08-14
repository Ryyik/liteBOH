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

export async function revokeGrant(batchId) {
  const safeBatchId = String(batchId || '').trim();
  if (!safeBatchId) throw new Error('批次 ID 不能为空');
  const { data, error } = await supabase.rpc('admin_revoke_grant', {
    p_batch_id: safeBatchId
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '撤销积分发放失败');
  }
  return data;
}

export async function fetchRecentGrants({ page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Math.trunc(Number(page) || 1));
  const safePageSize = Math.min(50, Math.max(1, Math.trunc(Number(pageSize) || 20)));
  const { data, error } = await supabase.rpc('admin_list_point_grant_batches', {
    p_page: safePage,
    p_page_size: safePageSize
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '加载发放记录失败');
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    rows,
    total: Number(rows[0]?.total_count || 0)
  };
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
