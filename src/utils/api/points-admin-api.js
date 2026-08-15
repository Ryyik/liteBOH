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
  const fetchPage = async (targetPage) => {
    const { data, error } = await supabase.rpc('admin_list_point_grant_batches', {
      p_page: targetPage,
      p_page_size: safePageSize
    });
    if (error) {
      throw new Error(normalizeDbError(error)?.message || error.message || '加载发放记录失败');
    }
    return Array.isArray(data) ? data : [];
  };
  const rows = await fetchPage(safePage);
  // 越界空页时 total_count（挂在行上）会随行丢失：回查第 1 页取回总数，供上层纠正页码
  if (rows.length === 0 && safePage > 1) {
    const firstPageRows = await fetchPage(1);
    return { rows, total: Number(firstPageRows[0]?.total_count || 0) };
  }
  return {
    rows,
    total: Number(rows[0]?.total_count || 0)
  };
}

const GRANT_SEARCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 导出以供测试。为 ilike 搜索值做防护：
// - 移除引号，避免破坏查询串
// - 转义通配符（% _ \），防止输入 % 匹配全部用户等语义改变
// 注意：搜索不再拼接 or() 过滤表达式——id 搜索仅在输入为 UUID 形态时走参数化 .eq()，
// 结构上杜绝了过滤表达式注入，同时保留用户名中的 . 等合法字符。
export function sanitizePostgrestQuery(query) {
  return String(query || '')
    .replace(/["']/g, '')
    .replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function searchGrantTargetUsers(query = '', limit = 30) {
  const safeQuery = String(query || '').trim();
  let builder = supabase
    .from('profiles')
    .select('id, username, points, role')
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
