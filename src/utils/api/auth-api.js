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
  validateCurrentPassword,
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

/**
 * 登录标识（方块 ID）→ 会话，全部在服务端完成。
 *
 * 为什么必须走 Edge Function：
 *   `resolve_email_for_login` RPC 会把邮箱**回传**给客户端，导致任何人（含未登录）
 *   都能用用户名反查邮箱。把「方块 ID → 邮箱 → 密码校验」整条链路放进
 *   `auth-login` EF（service_role 侧解析 auth.users.email），邮箱就不再离开服务端。
 *
 * 无降级（2026-09-21 收口）：
 *   EF 已部署并验证通过，旧的 RPC 路径与降级开关已**彻底删除** —— 本文件不再出现
 *   `resolve_email_for_login`（由 `tests/unit/auth-signin-edge-gateway.test.js` 的源码守卫断言）。
 *   选择「宁可明确报错也不回落」的原因：回落到旧 RPC 等于把邮箱枚举面重新打开，
 *   而这类回落只会在故障时静默发生 —— 安全性不能在故障路径上让步。
 *   数据库侧的收权见 `supabase/migrations/2026092103_*.sql`。
 */
const EDGE_FUNCTION_UNAVAILABLE_STATUSES = new Set([0, 404, 501]);

const invokeAuthLoginEdge = async (loginId, password) => {
  let response;
  try {
    response = await supabase.functions.invoke('auth-login', {
      body: { loginId, password },
    });
  } catch (invokeError) {
    // FunctionsFetchError / FunctionsRelayError / 网络中断
    return { unavailable: true, status: 0, reason: invokeError?.message || 'invoke_failed' };
  }

  const { data, error } = response || {};

  if (!error) {
    return { unavailable: false, status: 200, payload: data || {} };
  }

  const status = Number(error?.context?.status ?? error?.status ?? 0);
  let payload = null;
  try {
    payload = await error.context.json();
  } catch {
    payload = null;
  }

  if (EDGE_FUNCTION_UNAVAILABLE_STATUSES.has(status)) {
    return { unavailable: true, status, reason: error?.message || 'edge_unavailable' };
  }

  return { unavailable: false, status, payload: payload || {} };
};

/** 用 EF 返回的 session 落本地登录态；失败则返回归一化错误 */
const adoptEdgeSession = async (payload) => {
  const session = payload?.session || null;
  const accessToken = String(session?.access_token || '');
  const refreshToken = String(session?.refresh_token || '');

  if (!accessToken || !refreshToken) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'LOGIN_FAILED',
        message: payload?.message || '登录失败，请稍后再试。'
      })
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (sessionError) {
    return { ok: false, data: null, error: normalizeDbError(sessionError) };
  }

  invalidateByTags(['auth', 'weekly-checkin']);

  return {
    ok: true,
    data: sessionData || { user: payload?.user || null, session },
    error: null
  };
};

const escapeLikePattern = (value = '') => String(value || '').replace(/[\\%_]/g, '\\$&');

/**
 * 方块 ID 是否可用。
 * 注册页的实时查重与 signUp 的提交前预检**共用这一处**，避免「前端一套口径、
 * 提交时另一套口径」。返回 { ok, available }：
 *   ok=false 表示查询本身失败（网络 / 权限被 RLS 收紧），此时不要冒充
 *   「可用」也不要冒充「不可用」—— 交给真正的提交去兜底（DB 的 unique 是最后一道）。
 * 注意口径：这里用 ilike 做大小写不敏感比对，而唯一索引 profiles_username_key
 * 是大小写敏感的 —— 有意偏严（宁可多拦，不给用户注册出两个只差大小写的 ID）。
 */
export async function isUsernameAvailable(username) {
  const safeUsername = String(username || '').trim();
  if (!safeUsername) return { ok: false, available: null };
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', escapeLikePattern(safeUsername))
      .limit(5);
    if (error) {
      logger.warn('auth-api', 'Username availability check failed', error);
      return { ok: false, available: null };
    }
    const taken = Array.isArray(data)
      && data.some((row) => String(row?.username || '').trim().toLowerCase() === safeUsername.toLowerCase());
    return { ok: true, available: !taken };
  } catch (error) {
    logger.warn('auth-api', 'Username availability check threw', error);
    return { ok: false, available: null };
  }
}

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

  const passwordValidationMessage = validatePassword(safePassword);
  if (passwordValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: passwordValidationMessage, code: 'INVALID_PASSWORD' })
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

  const usernameAvailability = await isUsernameAvailable(safeUsername);
  if (usernameAvailability.ok && usernameAvailability.available === false) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '该方块 ID 已被使用', code: 'USERNAME_TAKEN' })
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: safeEmail,
    password: safePassword,
    options: {
      // 邮箱验证开启（mailer_autoconfirm=false）后，确认链接回跳根路径：
      // implicit flow 在其后追加 #access_token=...，supabase-js detectSessionInUrl
      // 自动建会话并清理参数。未开启验证时该字段不被使用，无副作用。
      emailRedirectTo: `${window.location.origin}/`,
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
      // 安全加固（2026090803）：email 只存 auth.users，profiles 已 drop 该列
      const profileData = {
        id: data.user.id,
        username: safeUsername,
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

  const resolvedEmail = safeLoginId;

  // 方块 ID 登录：只走 EF。邮箱不回传客户端，且**没有**降级路径
  // （EF 不可用时明确报错，绝不静默回落 —— 回落会让邮箱枚举面复活）
  if (!safeLoginId.includes('@')) {
    const edge = await invokeAuthLoginEdge(safeLoginId, safePassword);

    if (edge.unavailable) {
      logger.warn('auth-api', 'auth-login EF 不可用', {
        status: edge.status,
        reason: edge.reason
      });

      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          code: 'LOGIN_GATEWAY_UNAVAILABLE',
          message: '登录服务暂不可用，请稍后再试。'
        })
      };
    }

    const payload = edge.payload || {};

    if (payload.ok !== true) {
      // 邮箱验证开启后，GoTrue 对未验证邮箱返回 "Email not confirmed"，EF 会透传
      const edgeMessage = String(payload.message || '');
      if (edgeMessage.toLowerCase().includes('email not confirmed')) {
        return {
          ok: false,
          data: null,
          error: normalizeDbError({
            code: 'EMAIL_NOT_CONFIRMED',
            message: '该邮箱尚未完成验证，请查收注册确认邮件（注意垃圾箱）后再登录；若未收到，可回到注册页重新发送。'
          })
        };
      }
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          code: payload.code || 'LOGIN_FAILED',
          message: payload.message || '登录失败，请稍后再试。'
        })
      };
    }

    return adoptEdgeSession(payload);
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

    // 邮箱验证开启后（mailer_autoconfirm=false），未验证邮箱登录被 GoTrue 拒绝
    if (normalizedMessage.includes('email not confirmed')) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          ...error,
          code: 'EMAIL_NOT_CONFIRMED',
          message: '该邮箱尚未完成验证，请查收注册确认邮件（注意垃圾箱）后再登录；若未收到，可回到注册页重新发送。'
        })
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

/**
 * 通行密钥（Passkey / WebAuthn）—— supabase-js ≥2.105 的 experimental API。
 * 线上 GoTrue 已开启 passkeys（rp_id=blockofhome.cn，origins=www/裸域，2026-09-21 经
 * Management API PATCH config/auth 启用）。signInWithPasskey 由 supabase-js 托管
 * 完整 WebAuthn 仪式（服务端挑战 → 浏览器生物识别 → 服务端验证），成功即返回
 * 与密码登录同一机制的 session；无需邮箱/用户名参与（discoverable credential）。
 */
let passkeyCapabilityCache = null;

/** 能力检测：仅当浏览器暴露 PublicKeyCredential 且平台认证器可用时返回 true。 */
export async function isPasskeySupported() {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  if (!passkeyCapabilityCache) {
    passkeyCapabilityCache = window.PublicKeyCredential
      .isUserVerifyingPlatformAuthenticatorAvailable()
      .catch((error) => {
        logger.warn('auth-api', '通行密钥能力检测失败', error);
        return false;
      });
  }
  return passkeyCapabilityCache;
}

export const signInWithPasskey = () => supabase.auth.signInWithPasskey();
export const registerPasskey = () => supabase.auth.registerPasskey();
export const listPasskeys = () => supabase.auth.passkey.list();
export const deletePasskey = (passkeyId) => supabase.auth.passkey.delete({ passkeyId });
export const renamePasskey = (passkeyId, friendlyName) =>
  supabase.auth.passkey.update({ passkeyId, friendlyName });

/** 通行密钥登录失败 → 用户可读文案（首次使用引导在这里给出） */
export function toPasskeyLoginMessage(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();

  if (name === 'NotAllowedError' || message.includes('not allowed') || message.includes('timed out')) {
    // 浏览器端最常见的失败：用户取消 / 该设备没有本站通行密钥
    return '这台设备还没有本站的通行密钥，或验证未完成。请先用密码登录，然后在 设置 → 账户安全 中添加通行密钥。';
  }
  if (name === 'SecurityError' || message.includes('secure context') || message.includes('rp.id')) {
    return '当前环境不允许使用通行密钥（需 HTTPS 且域名匹配），请使用密码登录。';
  }
  if (name === 'NotSupportedError' || message.includes('not supported')) {
    return '当前浏览器不支持通行密钥，请使用密码登录。';
  }
  if (message.includes('experimental')) {
    return '通行密钥登录暂未启用，请使用密码登录。';
  }
  return error?.message || '通行密钥登录失败，请使用密码登录。';
}

/** 通行密钥注册失败 → 用户可读文案（设置面板用） */
export function toPasskeyRegisterMessage(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();

  if (name === 'InvalidStateError' || message.includes('already') || message.includes('invalid state')) {
    return '这台设备上已经注册过通行密钥，无需重复添加。';
  }
  if (name === 'NotAllowedError' || message.includes('not allowed') || message.includes('timed out')) {
    return '已取消注册，或设备验证未通过。';
  }
  if (name === 'SecurityError' || message.includes('secure context') || message.includes('rp.id')) {
    return '当前环境不允许注册通行密钥（需 HTTPS 且域名匹配）。';
  }
  return error?.message || '通行密钥注册失败，请稍后再试。';
}

// 更换账户邮箱：要求当前密码（防会话被劫持后直接改绑找回生命线）。
// mailer_autoconfirm=false（当前配置）时 updateUser({email}) 自动进入验证流程：
// secure email change（已开启）会给旧邮箱和新邮箱各发一封确认邮件，
// 两边都完成确认后新邮箱才生效；若 autoconfirm=true 则直接生效（无邮件）。
// changed=false 表示进入了待确认状态（邮件已发、邮箱尚未更换）。
export async function updateUserEmail(newEmail, currentPassword) {
  const safeEmail = normalizeEmail(newEmail);
  const emailValidationMessage = validateEmail(safeEmail);
  if (emailValidationMessage) {
    return {
      ok: false, data: null, changed: false, pendingEmail: '',
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' })
    };
  }

  const safePassword = String(currentPassword || '');
  const currentPasswordMessage = validateCurrentPassword(safePassword);
  if (currentPasswordMessage) {
    return {
      ok: false, data: null, changed: false, pendingEmail: '',
      error: normalizeDbError({ message: currentPasswordMessage, code: 'INVALID_PASSWORD' })
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return {
      ok: false, data: null, changed: false, pendingEmail: '',
      error: normalizeDbError({ message: '登录状态读取失败，请重新登录后再试。', code: 'SESSION_READ_FAILED' })
    };
  }

  if (String(authData.user.email || '').toLowerCase() === safeEmail) {
    return {
      ok: false, data: null, changed: false, pendingEmail: '',
      error: normalizeDbError({ message: '新邮箱与当前邮箱相同。', code: 'SAME_EMAIL' })
    };
  }

  // 当前密码校验（与 updatePassword 的 verify 模式一致：确保操作者是账号主人）
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: authData.user.email,
    password: safePassword
  });

  if (verifyError) {
    const message = String(verifyError.message || '') === 'Invalid login credentials'
      ? '当前密码不正确，请重新输入。'
      : (verifyError.message || '当前密码校验失败');
    return {
      ok: false, data: null, changed: false, pendingEmail: '',
      error: normalizeDbError({ ...verifyError, message, code: verifyError.code || 'CURRENT_PASSWORD_VERIFY_FAILED' })
    };
  }

  const { data, error } = await supabase.auth.updateUser({ email: safeEmail });

  if (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('already') || normalizedMessage.includes('registered')) {
      return {
        ok: false, data: null, changed: false, pendingEmail: '',
        error: normalizeDbError({ ...error, code: 'EMAIL_TAKEN', message: '该邮箱已被其他账号使用。' })
      };
    }
    return { ok: false, data: null, changed: false, pendingEmail: '', error: normalizeDbError(error) };
  }

  // changed=false = 进入待确认状态：邮件已发、邮箱尚未更换（user.email 仍是旧值）
  const changed = String(data?.user?.email || '').toLowerCase() === safeEmail;
  return { ok: true, data, changed, pendingEmail: changed ? '' : safeEmail, error: null };
}

// 消费邮箱验证回跳里的 token_hash（GoTrue token-hash 型链接，注册/更换邮箱共用）：
// verifyOtp({type, token_hash}) 成功 → supabase-js 保存会话并广播
// SIGNED_IN / USER_UPDATED → auth store 的事件处理器自动接管本地状态。
export async function verifyEmailTokenHash(tokenHash, type = 'signup') {
  const safeTokenHash = String(tokenHash || '').trim();
  const safeType = String(type || '').trim();
  if (!safeTokenHash || !safeType) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '确认令牌无效', code: 'INVALID_TOKEN_HASH' })
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type: safeType,
    token_hash: safeTokenHash
  });
  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function resendSignupConfirmation(email) {  const safeEmail = normalizeEmail(email);
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
  const currentPasswordMessage = validateCurrentPassword(safePassword);
  if (currentPasswordMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: currentPasswordMessage, code: 'INVALID_PASSWORD' })
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
  // 先解绑这台设备的 Web Push 订阅，再登出。
  // 顺序不能反：解绑 RPC 内部用 auth.uid() 判定归属，登出后就没有身份了，
  // 会留下一个「已登出但仍在收上一个账号推送」的设备。
  try {
    const { unbindDeviceOnLogout } = await import('./push-api.js');
    await unbindDeviceOnLogout();
  } catch (error) {
    logger.warn('auth-api', '解绑推送设备失败（忽略）', error);
  }

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

export async function getProfilesPage({ page = 1, pageSize = 10, search = '', countMode = 'planned', onlyRecentActive = false } = {}) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 10;
  const safeSearch = String(search || '').trim();
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const safeOnlyRecentActive = Boolean(onlyRecentActive);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  return executeRead(
    'profiles.getProfilesPage',
    { page: safePage, pageSize: safePageSize, search: safeSearch, countMode: safeCountMode, onlyRecentActive: safeOnlyRecentActive },
    async () => {
      let query = supabase
        .from('profiles')
        .select(`
          id,
          username,
          role,
          avatar_url,
          avatar_frame_url,
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

      if (safeOnlyRecentActive) {
        const thresholdIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('last_active_at', thresholdIso).eq('hide_online_status', false);
      }

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
