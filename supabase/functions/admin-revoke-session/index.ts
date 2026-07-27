// 管理员撤销指定用户的所有 session。
// 用于封禁流程：admin_ban_user RPC 成功后，调用此 Edge Function 撤销该用户
// 已签发的 JWT，避免被封禁用户在 token 自然过期前继续访问。
//
// 鉴权：调用者必须是 profiles.role = 'admin'。
// 入参：{ user_id: string }
// 出参：{ ok: boolean, message: string }

import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const getBearerToken = (request: Request): string => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const requireAdmin = async (request: Request, client: ReturnType<typeof createServiceClient>) => {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false as const, status: 401, code: 'UNAUTHORIZED', message: '请先登录。' };
  }

  const { data: authData, error: authError } = await client.auth.getUser(token);
  const userId = String(authData?.user?.id || '').trim();
  if (authError || !userId) {
    return { ok: false as const, status: 401, code: 'INVALID_SESSION', message: '登录状态已失效。' };
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || String(profile?.role || '').trim() !== 'admin') {
    return { ok: false as const, status: 403, code: 'FORBIDDEN', message: '仅管理员可执行此操作。' };
  }

  return { ok: true as const, userId };
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' },
      405,
      origin,
    );
  }

  try {
    const serviceClient = createServiceClient();
    const adminCheck = await requireAdmin(request, serviceClient);
    if (!adminCheck.ok) {
      return jsonResponse(
        { ok: false, code: adminCheck.code, message: adminCheck.message },
        adminCheck.status,
        origin,
      );
    }

    const body = await request.json();
    const targetUserId = String(body?.user_id || '').trim();

    if (!targetUserId) {
      return jsonResponse(
        { ok: false, code: 'INVALID_INPUT', message: '缺少 user_id 参数。' },
        400,
        origin,
      );
    }

    // 简单 UUID 校验
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(targetUserId)) {
      return jsonResponse(
        { ok: false, code: 'INVALID_USER_ID', message: 'user_id 格式不合法。' },
        400,
        origin,
      );
    }

    // 不允许撤销自己的 session
    if (targetUserId === adminCheck.userId) {
      return jsonResponse(
        { ok: false, code: 'CANNOT_REVOKE_SELF', message: '不能撤销自己的会话。' },
        400,
        origin,
      );
    }

    // 撤销目标用户的所有 session
    const { error: signOutError } = await serviceClient.auth.admin.signOut(targetUserId);

    if (signOutError) {
      return jsonResponse(
        { ok: false, code: 'REVOKE_FAILED', message: `撤销会话失败：${signOutError.message}` },
        500,
        origin,
      );
    }

    return jsonResponse(
      { ok: true, message: '用户会话已撤销', user_id: targetUserId },
      200,
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '撤销会话失败';
    return jsonResponse(
      { ok: false, code: 'REVOKE_SESSION_FAILED', message },
      500,
      origin,
    );
  }
});
