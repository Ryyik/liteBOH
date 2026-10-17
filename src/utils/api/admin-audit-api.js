import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

/**
 * 管理端审计埋点（plans/027 E6.1）。
 *
 * 硬约束：审计写入**绝不**阻断业务 —— RPC 不存在、权限不足、网络失败都只
 * logger.warn，不 throw、不 toast。宁可丢一条审计，不可让删除/发放失败。
 *
 * action 白名单与服务端 log_admin_action 一致：
 *   create | update | delete | batch_delete | grant | moderate | export
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
    if (error) logger.warn('audit', '审计写入失败:', error);
  } catch (error) {
    logger.warn('audit', '审计写入异常:', error);
  }
};
