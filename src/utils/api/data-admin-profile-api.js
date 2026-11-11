/**
 * 数据管理面板 · 用户资料（profiles）写入口
 *
 * 单独收口的原因（不只是分层门禁）：profiles 的写路径有两处**必须**配套的约束，
 * 散落在视图里迟早被改回去。见 docs/2026-11-11-数据管理面板功能可行性全量审查.md §2 P0-1。
 *
 *   ① `role / points / experience / tags / hide_online_status` 的列级 UPDATE
 *      被 2026090803_security_hardening.sql 有意收窄 ⇒ 只能经 SECURITY DEFINER RPC
 *      `admin_update_user_profile`。**不要**改成直更或补 GRANT：
 *      补 `update(role)` 会让任何登录用户借 profiles_update_self 自升 admin（已实测）。
 *   ② profiles 没有表级 SELECT（shipping_* / pushplus_token 按 H-1 收回），
 *      所以回读必须给显式列；`.select()` 无参等于 RETURNING *，会 42501。
 */
import { supabase } from '@/utils/supabase-client.js';

/**
 * 管理员更新 profiles 的敏感列（服务端有管理员校验 + 字段白名单 + 值域校验）
 * @param {string} userId
 * @param {Record<string, unknown>} patch 只允许 role/points/experience/tags/hide_online_status
 * @returns {Promise<Record<string, unknown>>} 更新后的资料行（不含敏感列）
 */
export const adminUpdateUserProfile = async (userId, patch) => {
  const { data, error } = await supabase.rpc('admin_update_user_profile', {
    p_user_id: userId,
    p_patch: patch,
  });
  if (error) throw error;
  return data && typeof data === 'object' ? data : null;
};

/**
 * 更新 profiles 中「列级授权开放」的字段，并回读指定列
 * @param {string} userId
 * @param {Record<string, unknown>} payload
 * @param {string} selectColumns 显式列清单（逗号分隔）—— 传 '*' 会撞列级 SELECT 收窄
 * @returns {Promise<Record<string, unknown>>}
 */
export const updateProfileRow = async (userId, payload, selectColumns) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(selectColumns);
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('保存失败：没有记录被更新，请检查管理员权限或记录是否存在');
  }
  return data[0];
};
