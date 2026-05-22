import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';
import { validateEmail, validatePassword, validateUsername } from '../_shared/auth-validation.ts';

const normalizeErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

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
      throw signInError || new Error('创建账号成功，但自动登录失败。');
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
