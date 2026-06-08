import { supabase } from '../supabase-client.js';
import {
  executeRead,
  normalizeDbError,
  invalidateByTags
} from '../request-core.js';
import { logger } from '../logger.js';
import {
  normalizeEmail,
  normalizeLoginId,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../auth-validation.js';

const PROFILE_ALL_COLUMNS = `
  id,
  username,
  join_date,
  tags,
  role,
  points,
  birth_month,
  birth_day,
  email,
  bio,
  avatar_url,
  experience,
  shipping_recipient,
  shipping_phone,
  shipping_address,
  gift_status,
  gift_content,
  gift_no,
  gift_price,
  pushplus_token,
  pushplus_enabled
`;

const isCaptchaVerificationFailure = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('captcha')
    || normalized.includes('turnstile')
    || normalized.includes('verification process failed');
};

const escapeLikePattern = (value = '') => String(value || '').replace(/[\\%_]/g, '\\$&');

export async function signUp(username, email, password, metadata = {}, altchaPayload = '') {
  const safeUsername = String(username || '').trim();
  const safeEmail = normalizeEmail(email);
  const safePassword = String(password || '');
  const safeAltchaPayload = String(altchaPayload || '').trim();

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

  // 当前版本临时停用验证码入参，但保留形参以兼容已有调用链。
  void safeAltchaPayload;

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
  if (data?.user) {
    try {
      const profileData = {
        id: data.user.id,
        username: safeUsername,
        email: safeEmail,
        role: metadata.role || 'user',
        points: metadata.points || 0,
        join_date: metadata.join_date || new Date().toISOString().split('T')[0]
      };

      if (metadata.birth_month) profileData.birth_month = metadata.birth_month;
      if (metadata.birth_day) profileData.birth_day = metadata.birth_day;

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

export async function signIn(loginId, password, altchaPayload = '', deviceIdHash = '') {
  const safeLoginId = normalizeLoginId(loginId);
  const safePassword = String(password || '');
  const safeAltchaPayload = String(altchaPayload || '').trim();
  const safeDeviceIdHash = String(deviceIdHash || '').trim();

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
  void safeAltchaPayload;
  void safeDeviceIdHash;

  let resolvedEmail = safeLoginId;
  if (!safeLoginId.includes('@')) {
    const { data: profileRows, error: lookupError } = await supabase
      .from('profiles')
      .select('email, username')
      .ilike('username', escapeLikePattern(safeLoginId))
      .limit(10);

    const exactProfileRows = Array.isArray(profileRows)
      ? profileRows.filter((row) => String(row?.username || '').trim().toLowerCase() === safeLoginId.toLowerCase())
      : [];

    if (lookupError || exactProfileRows.length === 0 || !exactProfileRows[0]?.email) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ code: 'UNKNOWN_ACCOUNT', message: '登录失败：未找到该方块 ID 对应的账号。' })
      };
    }

    if (exactProfileRows.length > 1) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ code: 'DUPLICATED_USERNAME', message: '登录失败：该方块 ID 存在重复记录，请联系管理员处理。' })
      };
    }

    resolvedEmail = String(exactProfileRows[0].email || '').trim().toLowerCase();
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

    if (normalizedMessage.includes('email not confirmed')) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ ...error, code: 'EMAIL_NOT_CONFIRMED', message: '登录失败：当前项目仍启用了邮箱验证，请完成邮箱确认后重试。' })
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
  if (!error) invalidateByTags(['auth', 'notifications', 'profiles', 'posts', 'comments', 'messages', 'weekly-checkin']);
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
    { ttlMs: 2000, tags: ['auth'], timeoutMs: 4000, retry: 0 }
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
    { ttlMs: 30000, tags: ['profiles'], timeoutMs: 8000, retry: 1 }
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
          birth_day
        `, { count: safeCountMode })
        .order('join_date', { ascending: false, nullsFirst: false })
        .order('username', { ascending: true })
        .range(from, to);

      if (safeSearch) {
        query = query.ilike('username', `%${safeSearch}%`);
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
      ttlMs: 15000,
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
        .from('profiles')
        .select(`
          id,
          username,
          avatar_url,
          bio,
          join_date,
          birth_month,
          birth_day
        `)
        .not('birth_month', 'is', null)
        .not('birth_day', 'is', null)
        .limit(200);

      if (error) {
        return { data: [], error };
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const todayStart = new Date(currentYear, now.getMonth(), now.getDate()).getTime();
      const withDistance = (data || []).map((profile) => {
        const month = Number(profile.birth_month);
        const day = Number(profile.birth_day);
        let nextBirthday = new Date(currentYear, month - 1, day);
        if (Number.isNaN(nextBirthday.getTime())) {
          return null;
        }
        if (nextBirthday.getTime() < todayStart) {
          nextBirthday = new Date(currentYear + 1, month - 1, day);
        }
        return {
          ...profile,
          birthday_days_until: Math.max(0, Math.round((nextBirthday.getTime() - todayStart) / 86400000))
        };
      }).filter(Boolean);

      withDistance.sort((a, b) => {
        if (a.birthday_days_until !== b.birthday_days_until) {
          return a.birthday_days_until - b.birthday_days_until;
        }
        return String(a.username || '').localeCompare(String(b.username || ''), 'zh-Hans-CN');
      });

      return {
        data: withDistance.slice(0, safeLimit),
        error: null
      };
    },
    {
      ttlMs: 5 * 60 * 1000,
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
    { ttlMs: 30000, tags: ['profiles', `profiles:user:${userId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function getEmailByUsername(username) {
  const { data, error, ok } = await executeRead(
    'profiles.getEmailByUsername',
    { username },
    async () => supabase.from('profiles').select('email').eq('username', username).single(),
    { ttlMs: 30000, tags: ['profiles', `profiles:username:${username}`], timeoutMs: 8000, retry: 1 }
  );

  return { ok, email: data?.email, data, error };
}
