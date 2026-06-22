import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';
import { validateEmail, validatePassword, validateUsername } from '../_shared/auth-validation.ts';

const normalizeErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// 简单内存内速率限制
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;

function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

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
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.ok) {
    return jsonResponse(
      { ok: false, code: 'RATE_LIMITED', message: `请求过于频繁，请在 ${rateCheck.retryAfter} 秒后重试。` },
      429,
      origin,
    );
  }

  try {
    const body = await request.json();
    const username = String(body?.username || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const metadata = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {};

    if (!username || !email || !password) {
      return jsonResponse(
        { ok: false, code: 'INVALID_INPUT', message: '请填写完整的注册信息。' },
        400,
        origin,
      );
    }

    const usernameValidationMessage = validateUsername(username);
    if (usernameValidationMessage) {
      return jsonResponse(
        { ok: false, code: 'INVALID_USERNAME', message: usernameValidationMessage },
        400,
        origin,
      );
    }

    const emailValidationMessage = validateEmail(email);
    if (emailValidationMessage) {
      return jsonResponse(
        { ok: false, code: 'INVALID_EMAIL', message: emailValidationMessage },
        400,
        origin,
      );
    }

    const passwordValidationMessage = validatePassword(password);
    if (passwordValidationMessage) {
      return jsonResponse(
        { ok: false, code: 'INVALID_PASSWORD', message: passwordValidationMessage },
        400,
        origin,
      );
    }

    const serviceClient = createServiceClient();

    // 预检用户名是否已存在，避免依赖错误消息字符串匹配
    const { data: existingProfile } = await serviceClient
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();
    if (existingProfile) {
      return jsonResponse(
        { ok: false, code: 'USERNAME_TAKEN', message: '该方块 ID 已被使用。' },
        409,
        origin,
      );
    }

    const { data: createdUserData, error: createUserError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        ...metadata,
        username,
      },
    });

    if (createUserError) {
      const normalizedMessage = String(createUserError.message || '').toLowerCase();
      if (normalizedMessage.includes('already been registered')
        || normalizedMessage.includes('already registered')
        || normalizedMessage.includes('user already exists')) {
        return jsonResponse(
          { ok: false, code: 'USER_ALREADY_REGISTERED', message: '该邮箱已注册，请直接登录。' },
          409,
          origin,
        );
      }

      if (normalizedMessage.includes('idx_profiles_username_lower_unique')
        || normalizedMessage.includes('profiles_username_key')
        || (normalizedMessage.includes('duplicate key value') && normalizedMessage.includes('username'))) {
        return jsonResponse(
          { ok: false, code: 'USERNAME_TAKEN', message: '该方块 ID 已被使用。' },
          409,
          origin,
        );
      }

      throw createUserError;
    }

    const createdUser = createdUserData?.user;
    if (!createdUser?.id) {
      throw new Error('注册成功后未返回用户信息。');
    }

    const anonClient = createAnonClient();
    const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !sessionData?.session) {
      // 自动登录失败时，回滚已创建的用户账号
      try {
        await serviceClient.auth.admin.deleteUser(createdUser.id);
      } catch (_cleanupError) {
        // 静默清理失败，但用户可走正常登录流程
      }
      return jsonResponse(
        {
          ok: false,
          code: 'AUTO_LOGIN_FAILED',
          message: '创建账号成功，但自动登录失败，请直接登录。',
        },
        200,
        origin,
      );
    }

    return jsonResponse(
      {
        ok: true,
        user: sessionData.user || createdUser,
        session: sessionData.session,
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'AUTH_REGISTER_FAILED',
        message: normalizeErrorMessage(error, '注册失败，请稍后再试。'),
      },
      500,
      origin,
    );
  }
});
