import { supabase } from '@/utils/supabase-client.js';
import { normalizeDbError } from '@/utils/request-core.js';

export async function adjustPity({ userId, delta, reason = '' }) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) throw new Error('用户 ID 不能为空');
  const safeDelta = Number(delta);
  if (!Number.isInteger(safeDelta) || safeDelta === 0) throw new Error('调整值必须为非 0 整数');
  const { data, error } = await supabase.rpc('admin_adjust_pity', {
    p_user_id: safeUserId,
    p_delta: safeDelta,
    p_reason: String(reason || '').trim() || null
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '调整保底失败');
  }
  if (data && data.ok === false) {
    throw new Error(data.message || '调整保底失败');
  }
  return data;
}

export async function setPity({ userId, value, reason = '' }) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) throw new Error('用户 ID 不能为空');
  const safeValue = Number(value);
  if (!Number.isInteger(safeValue) || safeValue < 0) throw new Error('保底次数必须为大于等于 0 的整数');
  const { data, error } = await supabase.rpc('admin_set_pity', {
    p_user_id: safeUserId,
    p_value: safeValue,
    p_reason: String(reason || '').trim() || null
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '设置保底失败');
  }
  if (data && data.ok === false) {
    throw new Error(data.message || '设置保底失败');
  }
  return data;
}

export async function batchAdjustPity({ userIds = null, delta, reason = '' }) {
  const safeDelta = Number(delta);
  if (!Number.isInteger(safeDelta) || safeDelta === 0) throw new Error('调整值必须为非 0 整数');
  const safeIds = Array.isArray(userIds) && userIds.length > 0 ? userIds : null;
  const { data, error } = await supabase.rpc('admin_batch_adjust_pity', {
    p_user_ids: safeIds,
    p_delta: safeDelta,
    p_reason: String(reason || '').trim() || null
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '批量调整保底失败');
  }
  if (data && data.ok === false) {
    throw new Error(data.message || '批量调整保底失败');
  }
  return data;
}

export async function undoPity({ userId, reason = '' }) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) throw new Error('用户 ID 不能为空');
  const { data, error } = await supabase.rpc('admin_undo_pity', {
    p_user_id: safeUserId,
    p_reason: String(reason || '').trim() || null
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '撤销保底修改失败');
  }
  if (data && data.ok === false) {
    throw new Error(data.message || '撤销保底修改失败');
  }
  return data;
}

export async function batchSetPity({ userIds = null, value, reason = '' }) {
  const safeValue = Number(value);
  if (!Number.isInteger(safeValue) || safeValue < 0) throw new Error('保底次数必须为大于等于 0 的整数');
  const safeIds = Array.isArray(userIds) && userIds.length > 0 ? userIds : null;
  const { data, error } = await supabase.rpc('admin_batch_set_pity', {
    p_user_ids: safeIds,
    p_value: safeValue,
    p_reason: String(reason || '').trim() || null
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '批量设置保底失败');
  }
  if (data && data.ok === false) {
    throw new Error(data.message || '批量设置保底失败');
  }
  return data;
}

export async function undoPityBatch({ logId, reason = '' }) {
  const safeLogId = String(logId || '').trim();
  if (!safeLogId) throw new Error('批次记录 ID 不能为空');
  const { data, error } = await supabase.rpc('admin_undo_pity_batch', {
    p_log_id: safeLogId,
    p_reason: String(reason || '').trim() || null
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '撤销保底批次失败');
  }
  if (data && data.ok === false) {
    throw new Error(data.message || '撤销保底批次失败');
  }
  return data;
}

export async function fetchPityBatchOps(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 20)));
  const { data, error } = await supabase.rpc('admin_list_pity_batch_ops', {
    p_limit: safeLimit
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '加载保底操作批次失败');
  }
  const result = data || {};
  return {
    rows: Array.isArray(result.rows) ? result.rows : [],
    total: Number(result.total || 0)
  };
}

// 复用积分发放的搜索：搜索用户名/ID，带防注入
const PITY_SEARCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizePityQuery(query) {
  return String(query || '')
    .replace(/["']/g, '')
    .replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function searchPityTargetUsers(query = '', limit = 30) {
  const safeQuery = String(query || '').trim();
  let builder = supabase
    .from('profiles')
    .select('id, username, role, points')
    .order('points', { ascending: false })
    .limit(limit);
  if (safeQuery) {
    if (PITY_SEARCH_UUID_RE.test(safeQuery)) {
      builder = builder.eq('id', safeQuery);
    } else {
      const sanitized = sanitizePityQuery(safeQuery);
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

// 读取 pity 进度列表（管理视图）：优先走视图，无视图则回退到基础表
export async function fetchPityProgress({ page = 1, pageSize = 20, search = '' } = {}) {
  const safePage = Math.max(1, Math.trunc(Number(page) || 1));
  const safePageSize = Math.min(100, Math.max(1, Math.trunc(Number(pageSize) || 20)));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  // 尝试从管理视图读取，包含 tier/threshold 等计算列
  let query = supabase
    .from('lottery_pity_progress_admin')
    .select('*', { count: 'exact' })
    .order('consecutive_losses', { ascending: false })
    .range(from, to);

  if (search && String(search).trim()) {
    const q = String(search).trim();
    if (PITY_SEARCH_UUID_RE.test(q)) {
      query = query.eq('user_id', q);
    } else {
      const sanitized = sanitizePityQuery(q);
      if (sanitized) query = query.ilike('username', `%${sanitized}%`);
    }
  }

  const { data, error, count } = await query;
  if (!error) {
    return { rows: Array.isArray(data) ? data : [], total: Number(count || 0) };
  }

  // 回退：直接查基础表 + profiles
  const fallback = await supabase
    .from('lottery_pity_progress')
    .select('user_id, consecutive_losses, last_lottery_id, updated_at, profile:user_id(username, role)', { count: 'exact' })
    .order('consecutive_losses', { ascending: false })
    .range(from, to);
  if (fallback.error) {
    throw new Error(normalizeDbError(fallback.error)?.message || fallback.error.message || '加载保底进度失败');
  }
  const rows = (fallback.data || []).map((r) => ({
    id: r.user_id,
    user_id: r.user_id,
    username: r.profile?.username || '未命名用户',
    role: r.profile?.role || 'user',
    consecutive_losses: r.consecutive_losses,
    tier_code: '—',
    threshold: '—',
    remaining_losses: '—',
    is_due: false,
    last_lottery_id: r.last_lottery_id,
    updated_at: r.updated_at
  }));
  return { rows, total: Number(fallback.count || 0) };
}
