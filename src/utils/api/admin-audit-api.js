import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

/**
 * 管理端审计埋点（plans/027 E6.1）。
 *
 * 硬约束：审计写入**绝不**阻断业务 —— RPC 不存在、权限不足、网络失败都只
 * logger.warn，不 throw、不 toast。宁可丢一条审计，不可让删除/发放失败。
 *
 * 但它**返回结果**（plans/042 B3 补充）：`{ ok, error }`。原来只返回 undefined，
 * 删除成功了、审计却没写进去，界面上完全看不出来 —— 一次「没留痕的物理删除」
 * 比一条打扰人的警告危险得多。调用方按需把 `ok === false` 变成一句非阻断提示，
 * 业务结果不受影响（仍然不 throw、不回滚）。
 */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'batch_delete',
  'grant',
  'moderate',
  'export',
];

export const logAdminAction = async ({ action, table, id = null, diff = null, meta = null }) => {
  try {
    const { error } = await supabase.rpc('log_admin_action', {
      p_action: String(action || ''),
      p_resource_table: String(table || ''),
      p_resource_id: id ?? null,
      p_diff: diff ?? null,
      p_meta: meta ?? null,
    });
    if (error) {
      logger.warn('audit', '审计写入失败:', error);
      return { ok: false, error };
    }
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('audit', '审计写入异常:', error);
    return { ok: false, error };
  }
};
