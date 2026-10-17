import { supabase } from '@/utils/supabase-client.js';

/**
 * 服务端真全选批量删除（plans/027 E6.3）。
 * RPC：admin_batch_delete(p_table, p_filters, p_expected_count)
 *  - 表名白名单在服务端硬编码（排除 users/points/审计表自身）
 *  - p_filters = [{ column, op, value }] / [{ op:'or_ilike', columns:[...], value }]
 *  - 服务端 count 预检与 p_expected_count 对齐（不一致拒绝）+ 上限 5000
 *
 * 与审计 API 不同：这里的错误**必须**向上抛（调用方负责 toast/结果面板）。
 */
export const adminBatchDelete = async ({ table, filters, expectedCount = null }) => {
  const { data, error } = await supabase.rpc('admin_batch_delete', {
    p_table: table,
    p_filters: filters,
    p_expected_count: expectedCount,
  });
  if (error) throw error;
  return Number(data ?? 0);
};
