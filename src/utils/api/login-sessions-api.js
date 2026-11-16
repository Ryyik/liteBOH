/**
 * 「登录设备」的读 / 写封装（2026-11-16）。
 *
 * 数据源是 GoTrue 自己的 `auth.sessions`（每个会话本来就记 user_agent / created_at /
 * updated_at），通过两个 SECURITY DEFINER 函数暴露给当前用户：
 *   · `list_my_login_sessions()` → 自己的、未过期的会话（已过滤 Edge Function 的 Deno 会话）
 *   · `revoke_my_login_session(uuid)` → 删会话行；`auth.refresh_tokens.session_id` 是
 *     ON DELETE CASCADE，所以该设备的 refresh token 会一起失效
 *
 * 为什么不直接查表：`auth` schema 不暴露给 anon/authenticated，前端读不到。
 * 为什么不在前端拼 `signOut({scope:'others'})` 来"下线某台"：那个 scope 是"其他全部"，
 * 做不到逐台。
 */

import { supabase } from '../supabase-client.js';
import { normalizeDbError } from '../request-core.js';

/** RPC 行 → 前端模型。字段名转换集中在这里，别让 UI 直接碰 snake_case。 */
const toSessionModel = (row) => ({
  sessionId: String(row?.session_id || ''),
  createdAt: String(row?.created_at || ''),
  lastActiveAt: String(row?.last_active_at || ''),
  userAgent: String(row?.user_agent || ''),
  isCurrent: Boolean(row?.is_current),
});

export async function listMyLoginSessions() {
  const { data, error } = await supabase.rpc('list_my_login_sessions');
  if (error) {
    return { ok: false, data: [], error: normalizeDbError(error) };
  }
  const rows = Array.isArray(data) ? data.map(toSessionModel) : [];
  return { ok: true, data: rows.filter((row) => row.sessionId), error: null };
}

export async function revokeMyLoginSession(sessionId) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ code: 'INVALID_INPUT', message: '缺少会话标识。' }),
    };
  }

  const { data, error } = await supabase.rpc('revoke_my_login_session', {
    p_session_id: safeSessionId,
  });
  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  // 函数用 jsonb 表达业务结果（NOT_FOUND / CANNOT_REVOKE_CURRENT / REVOKED），
  // 不是 HTTP 错误 —— 这里翻译成统一形状，调用方只判 ok。
  const ok = Boolean(data?.ok);
  return {
    ok,
    data,
    error: ok
      ? null
      : normalizeDbError({
          code: String(data?.code || 'REVOKE_FAILED'),
          message: String(data?.message || '下线失败，请稍后再试。'),
        }),
  };
}
