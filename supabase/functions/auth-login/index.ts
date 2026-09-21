import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';
import { validateLoginId } from '../_shared/auth-validation.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
// 登录标识解析：邮箱唯一真源是 auth.users（profiles.email 已 drop）。
// 抽到 _shared 是为了可被 vitest 覆盖（本文件含 Deno.serve，无法直接单测）。
import { resolveEmailFromLoginId } from '../_shared/resolve-login-id.ts';

const normalizeErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' },
      405,
      origin,
    );
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const rateCheck = await checkRateLimitDb(clientIp, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateCheck.ok) {
    return jsonResponse(
      { ok: false, code: 'RATE_LIMITED', message: `请求过于频繁，请在 ${rateCheck.retryAfter} 秒后重试。` },
      429,
      origin,
    );
  }

  try {
    const body = await request.json();
    const loginId = String(body?.loginId || '').trim();
    const password = String(body?.password || '');
    if (!loginId || !password) {
      return jsonResponse(
        { ok: false, code: 'INVALID_INPUT', message: '请输入账号和密码。' },
        400,
        origin,
      );
    }

    const loginIdValidationMessage = validateLoginId(loginId);
    if (loginIdValidationMessage) {
      return jsonResponse(
        { ok: false, code: 'INVALID_LOGIN_ID', message: loginIdValidationMessage },
        400,
        origin,
      );
    }

    const serviceClient = createServiceClient();
    const emailLookup = await resolveEmailFromLoginId(serviceClient, loginId);
    if (!emailLookup.ok || !emailLookup.email) {
      return jsonResponse(
        {
          ok: false,
          code: 'INVALID_CREDENTIALS',
          message: '登录失败：账号或密码错误',
        },
        401,
        origin,
      );
    }

    const anonClient = createAnonClient();
    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email: emailLookup.email,
      password,
    });

    if (authError) {
      const normalizedMessage = String(authError.message || '').toLowerCase();
      let message = '登录失败，请稍后再试。';
      let code = 'LOGIN_FAILED';

      if (normalizedMessage.includes('invalid login credentials')) {
        message = '登录失败：账号或密码错误';
        code = 'INVALID_CREDENTIALS';
      } else if (normalizedMessage.includes('email not confirmed')) {
        message = '请先验证邮箱后再登录。';
        code = 'EMAIL_NOT_CONFIRMED';
      }

      return jsonResponse(
        {
          ok: false,
          code,
          message,
        },
        code === 'INVALID_CREDENTIALS' ? 401 : 400,
        origin,
      );
    }

    // 安全：密码校验通过后，立即在服务端查询封禁状态。
    // 客户端 login() 也会查一次，但客户端检查可被绕过（直接 curl 拿 token），
    // 此处是服务端根本防线：命中封禁则立刻撤销刚签发的 session，并返回 403。
    const authUserId = authData.user?.id;
    if (authUserId) {
      const { data: profileRow } = await serviceClient
        .from('profiles')
        .select('is_banned, ban_reason, banned_until')
        .eq('id', authUserId)
        .maybeSingle();

      const isBanned = Boolean(profileRow?.is_banned);
      const bannedUntil = profileRow?.banned_until ? String(profileRow.banned_until) : null;
      const isPermanentBan = isBanned && !bannedUntil;
      const isTempBanActive = isBanned && bannedUntil && new Date(bannedUntil) > new Date();

      if (isPermanentBan || isTempBanActive) {
        // 立即撤销刚签发的 session，避免泄漏有效 token
        try {
          await serviceClient.auth.admin.signOut(authUserId);
        } catch (signOutError) {
          // 撤销失败不阻断错误返回，仍以 403 拒绝登录
          console.error('banned-user signOut failed:', signOutError);
        }

        let banMessage = '您的账号已被封禁，无法登录。';
        if (profileRow?.ban_reason) {
          banMessage += ` 原因：${profileRow.ban_reason}`;
        }
        if (bannedUntil) {
          try {
            const expiryDate = new Date(bannedUntil).toLocaleDateString('zh-CN');
            banMessage += ` 解封时间：${expiryDate}`;
          } catch {
            banMessage += ` 解封时间：${bannedUntil}`;
          }
        } else {
          banMessage += '（永久封禁）';
        }

        return jsonResponse(
          {
            ok: false,
            code: 'USER_BANNED',
            message: banMessage,
          },
          403,
          origin,
        );
      }
    }

    return jsonResponse(
      {
        ok: true,
        user: authData.user,
        session: authData.session,
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'AUTH_LOGIN_FAILED',
        message: normalizeErrorMessage(error, '登录失败，请稍后再试。'),
      },
      500,
      origin,
    );
  }
});
