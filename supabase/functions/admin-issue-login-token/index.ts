// 管理员为信任用户签发「一次性登录 token」。
//
// 用途：用户丢失邮箱/密码访问时，管理员当面核实身份后签发一次性凭证；
//       用户在 /reset-password 页粘贴 token 直接建立会话，随后自行设置新密码。
//       密码全程只有用户本人知道 —— 管理员不设置、也看不到密码。
//
// 鉴权：调用者必须是 profiles.role = 'admin'（与 admin-revoke-session 同一模式）。
// 入参：{ user_id: string, reason: string }  —— reason 必填，写入审计。
// 出参：{ ok, token (hashed_token), username }  —— 绝不回传 action_link。
//
// 安全设计：
//   1. 审计先行：审计行写不进库 → 拒绝签发（fail-closed）。
//   2. 封禁用户拒绝签发：否则 token 会绕过封禁。
//   3. 限流：每管理员 10 分钟最多 5 次（check_rate_limit 为 service_role 专用）。
//   4. token 一次性（GoTrue verifyOtp 消费）+ 时效由 Auth 设置的 Email OTP Expiration 决定。

import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import { buildAuditRow, pickIssuePayload, validateIssueInput } from '../_shared/admin-issue-token.ts';

const SITE_ORIGIN = (Deno.env.get('VITE_SITE_URL') || 'https://www.blockofhome.cn').replace(/\/+$/, '');
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;

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

    const body = await request.json().catch(() => null);
    const validated = validateIssueInput(body);
    if (!validated.ok) {
      return jsonResponse(
        { ok: false, code: validated.code, message: validated.message },
        400,
        origin,
      );
    }
    const { userId: targetUserId, reason } = validated.value;

    const rate = await checkRateLimitDb(
      `admin-issue-login-token:${adminCheck.userId}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rate.ok) {
      return jsonResponse(
        { ok: false, code: 'RATE_LIMITED', message: `签发过于频繁，请约 ${rate.retryAfter} 秒后再试。` },
        429,
        origin,
      );
    }

    // 目标用户必须存在且未被封禁 —— 给封禁用户签发 token 等于绕过封禁。
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('id, username, is_banned')
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileError) {
      return jsonResponse(
        { ok: false, code: 'PROFILE_LOOKUP_FAILED', message: '查询目标用户失败。' },
        500,
        origin,
      );
    }
    if (!profile) {
      return jsonResponse(
        { ok: false, code: 'TARGET_NOT_FOUND', message: '目标用户不存在。' },
        404,
        origin,
      );
    }
    if (profile.is_banned) {
      return jsonResponse(
        { ok: false, code: 'TARGET_BANNED', message: '该用户已被封禁，不能签发登录 token。' },
        403,
        origin,
      );
    }

    // generateLink 必需邮箱；profiles 无 email 列（2026090911 已 drop），走 Admin API 取。
    const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(targetUserId);
    const email = String(userData?.user?.email || '').trim().toLowerCase();
    if (userError || !email) {
      return jsonResponse(
        { ok: false, code: 'TARGET_EMAIL_MISSING', message: '该账号未绑定邮箱，无法签发。' },
        409,
        origin,
      );
    }

    // 审计先行（fail-closed）：审计写不进库 → 拒绝签发。
    const auditRow = buildAuditRow({
      actorId: adminCheck.userId,
      targetId: targetUserId,
      targetUsername: String(profile.username || ''),
      reason,
    });
    const auditInsert = await serviceClient
      .from('admin_issued_login_tokens')
      .insert(auditRow)
      .select('id')
      .single();

    if (auditInsert.error || !auditInsert.data?.id) {
      return jsonResponse(
        { ok: false, code: 'AUDIT_WRITE_FAILED', message: '审计写入失败，已拒绝签发。' },
        500,
        origin,
      );
    }
    const auditId = String(auditInsert.data.id);

    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${SITE_ORIGIN}/#/reset-password` },
    });

    if (linkError || !linkData) {
      const message = String(linkError?.message || 'generate_link_failed');
      await serviceClient
        .from('admin_issued_login_tokens')
        .update({ status: 'failed', detail: { ...auditRow.detail, error: message } })
        .eq('id', auditId);
      return jsonResponse(
        { ok: false, code: 'TOKEN_ISSUE_FAILED', message: `签发失败：${message}` },
        500,
        origin,
      );
    }

    const picked = pickIssuePayload(linkData);
    if (!picked.ok) {
      await serviceClient
        .from('admin_issued_login_tokens')
        .update({ status: 'failed', detail: { ...auditRow.detail, error: picked.code } })
        .eq('id', auditId);
      return jsonResponse(
        { ok: false, code: picked.code, message: picked.message },
        500,
        origin,
      );
    }

    await serviceClient
      .from('admin_issued_login_tokens')
      .update({ status: 'issued' })
      .eq('id', auditId);

    return jsonResponse(
      {
        ok: true,
        token: picked.token,
        username: String(profile.username || ''),
        message: '一次性登录 token 已生成，请当面或私聊交付，勿发群聊。',
      },
      200,
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '签发失败';
    return jsonResponse(
      { ok: false, code: 'ISSUE_TOKEN_FAILED', message },
      500,
      origin,
    );
  }
});
