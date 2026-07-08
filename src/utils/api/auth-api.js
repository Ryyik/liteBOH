import { supabase } from '../supabase-client.js';
import {
  executeRead,
  normalizeDbError,
  invalidateByTags
} from '../request-core.js';
import { CACHE_TTL_LEVELS } from '../cache-strategy.js';
import { logger } from '../logger.js';
import { clearSensitiveLocalStorage } from '../safe-storage.js';
import {
  normalizeEmail,
  normalizeLoginId,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../auth-validation.js';

// H-1 修复：移除敏感字段（email/shipping_*/gift_content/gift_no/gift_price/pushplus_token），
// 这些字段已通过列级权限收窄，直接查询会报错。
// 需要敏感字段时通过 get_my_sensitive_profile / admin_get_user_sensitive RPC 获取。
const PROFILE_ALL_COLUMNS = `
  id,
  username,
  join_date,
  tags,
  role,
  points,
  birth_month,
  birth_day,
  bio,
  avatar_url,
  experience,
  gift_status,
  pushplus_enabled,
  last_active_at,
  hide_online_status
`;

const isCaptchaVerificationFailure = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('captcha')
    || normalized.includes('turnstile')
    || normalized.includes('verification process failed');
};

const escapeLikePattern = (value = '') => String(value || '').replace(/[\\%_]/g, '\\$&');

export async function signUp(username, email, password, metadata = {}) {
  const safeUsername = String(username || '').trim();
  const safeEmail = normalizeEmail(email);
  const safePassword = String(password || '');

  const usernameValidationMessage = validateUsername(safeUsername);
  if (usernameValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: usernameValidationMessage, code: 'INVALID_USERNAME' })
    };
  }

  if (safePassword.length < 6) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '密码长度至少为 6 位', code: 'INVALID_PASSWORD' })
    };
  }

  const emailValidationMessage = validateEmail(safeEmail);
  if (emailValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' })
    };
  }

  try {
    const { data: usernameRows, error: usernameLookupError } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', escapeLikePattern(safeUsername))
      .limit(5);

    const hasExactUsernameMatch = Array.isArray(usernameRows)
      && usernameRows.some((row) => String(row?.username || '').trim().toLowerCase() === safeUsername.toLowerCase());

    if (!usernameLookupError && hasExactUsernameMatch) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ message: '该方块 ID 已被使用', code: 'USERNAME_TAKEN' })
      };
    }
  } catch (usernameCheckError) {
    logger.warn('auth-api', 'Username availability check failed', usernameCheckError);
  }

  const { data, error } = await supabase.auth.signUp({
    email: safeEmail,
    password: safePassword,
    options: {
      data: {
        ...metadata,
        username: safeUsername
      }
    }
  });

  if (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('user already registered') || normalizedMessage.includes('already registered')) {
      return {
        ok: false,
        data,
        error: normalizeDbError({ message: '该邮箱已注册，请直接登录。', code: 'USER_ALREADY_REGISTERED' })
      };
    }
    if (normalizedMessage.includes('rate limit')) {
      return {
        ok: false,
        data,
        error: normalizeDbError({ ...error, code: 'EMAIL_RATE_LIMIT', message: '邮件发送过于频繁，请稍后再试。' })
      };
    }
    if (isCaptchaVerificationFailure(normalizedMessage)) {
      return {
        ok: false,
        data,
        error: normalizeDbError({
          ...error,
          code: 'CAPTCHA_FAILED',
          message: '注册失败：检测到 Supabase Bot Detection 验证未通过。若已废除 Turnstile，请在 Supabase 控制台关闭 Authentication -> Bot Detection 后重试。'
        })
      };
    }
    return { ok: false, data, error: normalizeDbError(error) };
  }

  const isExistingUserMaskedSuccess =
    Array.isArray(data?.user?.identities)
    && data.user.identities.length === 0;

  if (isExistingUserMaskedSuccess) {
    return {
      ok: false,
      data,
      error: normalizeDbError({ message: '该邮箱已注册，请直接登录。', code: 'USER_ALREADY_REGISTERED' })
    };
  }

  // 若当前项目邮箱确认已关闭，注册后通常会有会话并可直接写入 profiles。
  // 若邮箱确认开启导致无会话，可能受 RLS 限制；这里不阻断注册流程。
  // 仅同步安全字段，防止客户端通过 metadata 越权设置 role/points 等敏感字段。
  if (data?.user) {
    try {
      const profileData = {
        id: data.user.id,
        username: safeUsername,
        email: safeEmail,
        join_date: new Date().toISOString().split('T')[0]
      };

      const birthMonth = metadata.birth_month ? Number(metadata.birth_month) : NaN;
      const birthDay = metadata.birth_day ? Number(metadata.birth_day) : NaN;
      if (Number.isFinite(birthMonth)) profileData.birth_month = birthMonth;
      if (Number.isFinite(birthDay)) profileData.birth_day = birthDay;

      const { error: profileError } = await supabase
        .from('profiles')
        .insert([profileData])
        .select('id');

      if (profileError && profileError.code !== '23505') {
        logger.warn('auth-api', 'Profile sync failed after sign up', profileError);
      }
    } catch (syncErr) {
      logger.warn('auth-api', 'Profile sync exception after sign up', syncErr);
    }
  }

  invalidateByTags(['profiles', 'auth']);
  return { ok: true, data, error: null };
}

export async function signIn(loginId, password) {
  const safeLoginId = normalizeLoginId(loginId);
  const safePassword = String(password || '');

  if (!safeLoginId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '请输入方块 ID 或邮箱地址', code: 'INVALID_INPUT' })
    };
  }
  if (!safePassword) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '请输入密码', code: 'INVALID_INPUT' })
    };
  }

  let resolvedEmail = safeLoginId;
  if (!safeLoginId.includes('@')) {
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('resolve_email_for_login', { p_username: safeLoginId });

    if (rpcError || !rpcData) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ code: 'INVALID_CREDENTIALS', message: '登录失败：账号或密码错误' })
      };
    }

    resolvedEmail = String(rpcData || '').trim().toLowerCase();
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password: safePassword
  });

  if (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('invalid login credentials')) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ ...error, code: 'INVALID_CREDENTIALS', message: '登录失败：账号或密码错误' })
      };
    }

    if (isCaptchaVerificationFailure(normalizedMessage)) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          ...error,
          code: 'CAPTCHA_FAILED',
          message: '登录失败：检测到 Supabase Bot Detection 验证未通过。若已废除 Turnstile，请在 Supabase 控制台关闭 Authentication -> Bot Detection 后重试。'
        })
      };
    }

    return { ok: false, data, error: normalizeDbError(error) };
  }

  invalidateByTags(['auth', 'weekly-checkin']);
  return { ok: true, data, error: null };
}

export async function resendSignupConfirmation(email) {
  const safeEmail = normalizeEmail(email);
  const emailValidationMessage = validateEmail(safeEmail);
  if (emailValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' })
    };
  }

  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email: safeEmail,
    options: {
      emailRedirectTo: window.location.origin
    }
  });

  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function signInWithOAuth(provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin
    }
  });
  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function resetPassword(email) {
  const redirectBase = `${window.location.origin}/#/reset-password`;
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectBase
  });
  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function verifyPasswordRecovery(tokenHash) {
  const safeTokenHash = String(tokenHash || '').trim();
  if (!safeTokenHash) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '恢复令牌无效', code: 'INVALID_TOKEN_HASH' })
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type: 'recovery',
    token_hash: safeTokenHash
  });
  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function updatePassword(newPassword, currentPassword = '') {
  const safePassword = String(newPassword || '');
  const safeCurrentPassword = String(currentPassword || '');
  const passwordValidationMessage = validatePassword(safePassword);
  if (passwordValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: passwordValidationMessage, code: 'INVALID_PASSWORD' })
    };
  }

  if (safeCurrentPassword) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError(authError || { message: '未检测到登录用户', code: 'NOT_AUTHENTICATED' })
      };
    }

    const currentEmail = String(authData.user.email || '').trim().toLowerCase();
    if (!currentEmail) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ message: '当前账号未绑定邮箱，暂无法校验当前密码', code: 'EMAIL_REQUIRED' })
      };
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: safeCurrentPassword
    });

    if (verifyError) {
      let message = verifyError.message || '当前密码校验失败';
      if (message === 'Invalid login credentials') {
        message = '当前密码不正确，请重新输入。';
      } else if (isCaptchaVerificationFailure(message)) {
        message = '当前密码校验失败：检测到 Supabase Bot Detection 验证未通过。若已废除 Turnstile，请在 Supabase 控制台关闭 Authentication -> Bot Detection 后重试。';
      }
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ ...verifyError, message, code: verifyError.code || 'CURRENT_PASSWORD_VERIFY_FAILED' })
      };
    }

    if (verifyData?.user?.id !== authData.user.id) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          message: '账号校验失败：当前会话与密码验证账号不一致',
          code: 'USER_MISMATCH'
        })
      };
    }
  }

  const { data, error } = await supabase.auth.updateUser({
    password: safePassword,
    ...(safeCurrentPassword ? { current_password: safeCurrentPassword } : {})
  });

  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function deleteMyAccount(password, reason = '') {
  const safePassword = String(password || '');
  if (safePassword.length < 6) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '请输入当前账号密码（至少 6 位）', code: 'INVALID_PASSWORD' })
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError(authError || { message: '未检测到登录用户', code: 'NOT_AUTHENTICATED' })
    };
  }

  const currentUser = authData.user;
  const currentEmail = String(currentUser.email || '').trim().toLowerCase();
  if (!currentEmail) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '当前账号未绑定邮箱，暂无法使用密码注销', code: 'EMAIL_REQUIRED' })
    };
  }

  const { data: verifyData, error: verifyError } = await supabase.auth.signInWithPassword({
    email: currentEmail,
    password: safePassword
  });

  if (verifyError) {
    let message = verifyError.message || '密码验证失败';
    if (message === 'Invalid login credentials') {
      message = '密码验证失败：请输入当前账号密码';
    } else if (isCaptchaVerificationFailure(message)) {
      message = '密码验证失败：检测到 Supabase Bot Detection 验证未通过。若已废除 Turnstile，请在 Supabase 控制台关闭 Authentication -> Bot Detection 后重试。';
    }
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ ...verifyError, message, code: verifyError.code || 'PASSWORD_VERIFY_FAILED' })
    };
  }

  if (verifyData?.user?.id !== currentUser.id) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        message: '账号校验失败：当前会话与密码验证账号不一致',
        code: 'USER_MISMATCH'
      })
    };
  }

  const safeReason = String(reason || '').trim().slice(0, 120);
  const { data: rpcData, error: rpcError } = await supabase.rpc('delete_my_account', {
    p_reason: safeReason || null
  });

  if (rpcError) {
    return { ok: false, data: null, error: normalizeDbError(rpcError) };
  }

  if (rpcData && typeof rpcData === 'object' && rpcData.ok === false) {
    return {
      ok: false,
      data: rpcData,
      error: normalizeDbError({
        message: rpcData.message || '注销失败，请稍后重试',
        code: rpcData.code || 'ACCOUNT_DELETE_FAILED'
      })
    };
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    logger.warn('auth-api', 'Sign out after account deletion failed', signOutError);
  }

  invalidateByTags(['auth', 'notifications', 'profiles', 'posts', 'comments', 'messages', 'weekly-checkin']);
  return { ok: true, data: rpcData || { ok: true, code: 'ACCOUNT_DELETED' }, error: null };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (!error) {
    invalidateByTags(['auth', 'notifications', 'profiles', 'posts', 'comments', 'messages', 'weekly-checkin']);
    // 清理本地敏感数据(邮箱/草稿/偏好等),防止共享设备泄露
    clearSensitiveLocalStorage();
  }
  return { ok: !error, error: normalizeDbError(error) };
}

export async function getCurrentUser() {
  const { data, error } = await executeRead(
    'auth.getCurrentUser',
    {},
    async () => {
      const { data: authData, error } = await supabase.auth.getUser();
      return { data: authData?.user || null, error };
    },
    { ttlMs: CACHE_TTL_LEVELS.REALTIME, tags: ['auth'], timeoutMs: 4000, retry: 0 }
  );

  if (error) {
    const code = String(error.code || '').trim().toUpperCase();
    const message = String(error.message || '').toLowerCase();
    const isSessionMissing = code === 'AUTH_SESSION_MISSING' || message.includes('auth session missing');
    if (!isSessionMissing) {
      logger.warn('auth-api', 'getCurrentUser failed', error);
    }
    return null;
  }
  return data;
}

export async function getAllProfiles() {
  return executeRead(
    'profiles.getAllProfiles',
    {},
    async () => supabase.from('profiles').select(PROFILE_ALL_COLUMNS),
    { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['profiles'], timeoutMs: 8000, retry: 1 }
  );
}

export async function getProfilesPage({ page = 1, pageSize = 10, search = '', countMode = 'planned' } = {}) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 10;
  const safeSearch = String(search || '').trim();
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  return executeRead(
    'profiles.getProfilesPage',
    { page: safePage, pageSize: safePageSize, search: safeSearch, countMode: safeCountMode },
    async () => {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          username,
          role,
          avatar_url,
          bio,
          join_date,
          birth_month,
          birth_day,
          last_active_at,
          hide_online_status,
          hide_follow_data
        `, { count: safeCountMode })
        .order('last_active_at', { ascending: false, nullsFirst: false })
        .order('username', { ascending: true })
        .range(from, to);

      if (safeSearch) {
        query = query.ilike('username', `%${escapeLikePattern(safeSearch)}%`);
      }

      const { data, error, count } = await query;

      return {
        data: {
          items: data || [],
          total: count || 0,
          page: safePage,
          pageSize: safePageSize,
          search: safeSearch
        },
        error
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.USER_DATA,
      tags: ['profiles'],
      timeoutMs: 8000,
      retry: 1
    }
  );
}

export async function getRecentBirthdayProfiles({ limit = 8 } = {}) {
  const safeLimit = Number.isFinite(limit) ? Math.min(24, Math.max(1, Math.trunc(limit))) : 8;

  return executeRead(
    'profiles.getRecentBirthdayProfiles',
    { limit: safeLimit },
    async () => {
      const { data, error } = await supabase
        .rpc('get_recent_birthday_profiles', { p_limit: safeLimit });

      if (error) {
        return { data: [], error };
      }

      return {
        data: data || [],
        error: null
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.STATIC_DATA,
      tags: ['profiles'],
      timeoutMs: 8000,
      retry: 1
    }
  );
}

export async function getUserInfo(userId) {
  return executeRead(
    'profiles.getUserInfo',
    { userId },
    async () => supabase.from('profiles').select(PROFILE_ALL_COLUMNS).eq('id', userId).single(),
    { ttlMs: CACHE_TTL_LEVELS.USER_DATA, tags: ['profiles', `profiles:user:${userId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function getEmailByUsername(username) {
  const { data, error } = await supabase.rpc('resolve_email_for_login', { p_username: username });
  return { ok: !error, email: data || null, data, error };
}
