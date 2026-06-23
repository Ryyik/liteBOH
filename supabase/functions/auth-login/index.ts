import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';
import { validateLoginId } from '../_shared/auth-validation.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';

const normalizeErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const escapeLikePattern = (value = '') => String(value || '').replace(/[\\%_]/g, '\\$&');

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const resolveEmailFromLoginId = async (serviceClient: ReturnType<typeof createServiceClient>, loginId: string) => {
  const normalizedLoginId = String(loginId || '').trim();
  if (normalizedLoginId.includes('@')) {
    return { ok: true, email: normalizedLoginId.toLowerCase() };
  }

  const { data: profileRows, error: lookupError } = await serviceClient
    .from('profiles')
    .select('email, username')
    .ilike('username', escapeLikePattern(normalizedLoginId))
    .limit(10);

  const exactProfileRows = Array.isArray(profileRows)
    ? profileRows.filter((row) => String(row?.username || '').trim().toLowerCase() === normalizedLoginId.toLowerCase())
    : [];

  if (lookupError || exactProfileRows.length === 0 || !exactProfileRows[0]?.email) {
    return { ok: false, code: 'UNKNOWN_ACCOUNT', message: '登录失败：未找到该方块 ID 对应的账号。' };
  }

  if (exactProfileRows.length > 1) {
    return { ok: false, code: 'DUPLICATED_USERNAME', message: '登录失败：该方块 ID 存在重复记录，请联系管理员处理。' };
  }

  return {
    ok: true,
    email: String(exactProfileRows[0].email || '').trim().toLowerCase(),
  };
};

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
