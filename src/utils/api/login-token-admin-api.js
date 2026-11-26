import { supabase } from '@/utils/supabase-client.js';
import { normalizeDbError } from '@/utils/request-core.js';

/**
 * 签发一次性登录口令（migration 2026112601）。
 * 明文只在这次返回值里出现一次；库里只存 sha256(code || user_id)。
 */
export async function issueLoginToken(userId, { ttlMinutes = 15 } = {}) {
  const { data, error } = await supabase.rpc('admin_issue_login_token', {
    p_user_id: String(userId || '').trim(),
    p_ttl_minutes: Number(ttlMinutes) || 15,
  });
  if (error) {
    throw new Error(normalizeDbError(error)?.message || error.message || '生成一次性令牌失败');
  }
  // returns table → 单行数组
  const row = Array.isArray(data) ? data[0] : data;
  return { code: String(row?.code || ''), expires_at: row?.expires_at || null };
}
