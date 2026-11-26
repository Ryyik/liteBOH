import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
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
  last_active_at,
  hide_online_status
`;

const isCaptchaVerificationFailure = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('captcha') ||
    normalized.includes('turnstile') ||
    normalized.includes('verification process failed')
  );
};

/**
 * GoTrue 的 `same_password`（新密码与库里的哈希逐字节相同）。
 *
 * 为什么必须单独识别：这是**唯一**一条「用户其实记得密码」的证据 —— 用户以为
 * 自己是来设新密码的，填的却是当前密码。原样透出会把英文
 * "New password should be different from the old password." 直接甩到界面上，
 * 用户读成「密码重复」，与「登录说密码错」叠加后极难解释（2026-11-15 橙子 事件）。
 * 判据同时认 code 与文案：GoTrue 在不同版本里一处有 code 一处没有。
 */
const isSamePasswordError = (errorLike) => {
  const code = String(errorLike?.code || '').toLowerCase();
  const message = String(errorLike?.message || '').toLowerCase();
  return code === 'same_password' || message.includes('should be different from the old password');
};

/**
 * 登录标识（方块 ID / 邮箱）→ 会话，全部在服务端完成。
 *
 * 为什么必须走 Edge Function：
 *   `resolve_email_for_login` RPC 会把邮箱**回传**给客户端，导致任何人（含未登录）
 *   都能用用户名反查邮箱。把「方块 ID → 邮箱 → 密码校验」整条链路放进
 *   `auth-login` EF（service_role 侧解析 auth.users.email），邮箱就不再离开服务端。
 *
 * 2026-11-03 收口：邮箱登录也不再直连 GoTrue。
 *   此前按 `loginId.includes('@')` 分流，含 `@` 的直接 `signInWithPassword` ——
 *   这条路径绕过了失败计数、Altcha 与服务端封禁校验，且闸门判据（auth_attempt_events）
 *   只由 EF 写入，等于被撞库时闸门完全无声。现在两种标识都走同一个 EF 入口。
 *
 * 无降级（2026-09-21 收口）：
 *   EF 已部署并验证通过，旧的 RPC 路径与降级开关已**彻底删除** —— 本文件不再出现
 *   `resolve_email_for_login`（由 `tests/unit/auth-signin-edge-gateway.test.js` 的源码守卫断言）。
 *   选择「宁可明确报错也不回落」的原因：回落到旧 RPC 等于把邮箱枚举面重新打开，
 *   而这类回落只会在故障时静默发生 —— 安全性不能在故障路径上让步。
 *   数据库侧的收权见 `supabase/migrations/2026092103_*.sql`。
 */
const EDGE_FUNCTION_UNAVAILABLE_STATUSES = new Set([0, 404, 501]);

/**
 * 登录请求的**客户端上限**（2026-11-16）。
 *
 * 为什么必须单独加：`supabase.functions.invoke` 走的是 `timeoutFetch` 里的
 * `SUPABASE_FUNCTION_TIMEOUT_MS`（默认 180000ms，见 utils/supabase-client.js）。
 * 那是"给大模型流式接口留的"上限，对登录来说意味着：网络半死时按钮会卡在
 * 「登录中...」整整 3 分钟，用户只会以为页面坏了、反复刷新。
 *
 * 超时语义与「凭据错误」「闸门限流」都不同：它**不能**计入失败次数
 * （UI 的 failedLoginAttempts 只认 INVALID_CREDENTIALS），所以单独给一个 code。
 */
const LOGIN_INVOKE_TIMEOUT_MS = 10000;
const LOGIN_TIMEOUT_SENTINEL = Symbol('auth-login-timeout');

/**
 * 注册验证码位数 —— 与线上 `mailer_otp_length` 一一对应（2026-11-25 实测为 **8**）。
 *
 * ⚠️ 不是 6。Supabase 后台默认常被写成 6，而这个项目线上是 8；
 * 照着「常见产品都是 6 位」去写输入框，会让用户输满 6 格就被判长度不对，
 * 或者输到第 7 位被截断 —— 症状是「验证码看着没错但永远不匹配」。
 * 改这个值之前先 `GET /v1/projects/{ref}/config/auth` 复核，别凭印象。
 */
export const OTP_LENGTH = 8;

/** 验证码有效期（秒）—— 与线上 `mailer_otp_exp` 一致，界面倒计时与文案都从这里取 */
export const OTP_TTL_SECONDS = 600;

/**
 * 当前生效的用户协议 / 隐私政策版本号。
 *
 * 为什么需要一个显式版本号：注册第 ① 屏的勾选会随 `raw_user_meta_data` 落进
 * `profiles.terms_version`（迁移 2026112501）。只存一个「已同意」的布尔值是不够的 ——
 * 协议内容改过之后再举证，你没法说明用户同意的是哪一版。
 *
 * 升版时机：`用户服务协议` 或 `隐私政策` 的**实质条款**有变动时改这里（改完新注册
 * 用户带新版本号，老用户保留他们当时同意的版本，不做追认）。
 * 纯错别字、排版调整不用动 —— 版本号换得太勤会让「同意记录」失去区分度。
 */
export const TERMS_VERSION = '2026-11';

const invokeWithTimeout = (promise, timeoutMs, sentinel) => {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer !== null) clearTimeout(timer);
    }),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(sentinel), timeoutMs);
    }),
  ]);
};

const invokeAuthLoginEdge = async (loginId, password, security = {}) => {
  let response;
  // 风控字段按需携带：服务端只在 requireAltcha 为真时才校验 payload，
  // 不带也不会导致首次登录失败（避免一上线就把所有人锁在门外）。
  const body = { loginId, password };
  const altchaPayload = String(security?.altchaPayload || '').trim();
  const deviceIdHash = String(security?.deviceIdHash || '').trim();
  if (altchaPayload) body.altchaPayload = altchaPayload;
  if (deviceIdHash) body.deviceIdHash = deviceIdHash;

  try {
    response = await invokeWithTimeout(
      supabase.functions.invoke('auth-login', {
        body,
      }),
      LOGIN_INVOKE_TIMEOUT_MS,
      LOGIN_TIMEOUT_SENTINEL,
    );
  } catch (invokeError) {
    // FunctionsFetchError / FunctionsRelayError / 网络中断
    return { unavailable: true, status: 0, reason: invokeError?.message || 'invoke_failed' };
  }

  if (response === LOGIN_TIMEOUT_SENTINEL) {
    return { unavailable: true, status: 0, reason: 'timeout' };
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
        message: payload?.message || '登录失败，请稍后再试。',
      }),
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    return { ok: false, data: null, error: normalizeDbError(sessionError) };
  }

  invalidateByTags(['auth', 'weekly-checkin']);

  return {
    ok: true,
    data: sessionData || { user: payload?.user || null, session },
    error: null,
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
    const taken =
      Array.isArray(data) &&
      data.some(
        (row) =>
          String(row?.username || '')
            .trim()
            .toLowerCase() === safeUsername.toLowerCase(),
      );
    return { ok: true, available: !taken };
  } catch (error) {
    logger.warn('auth-api', 'Username availability check threw', error);
    return { ok: false, available: null };
  }
}

/**
 * 这个邮箱是否已被注册（注册页第 ① 屏的真实判定）。
 *
 * 为什么必须单独有它：改版前第 ① 屏右侧那个「可用」徽标只看
 * 「已填 + 本机格式合法」，**从没问过服务端** —— 随便输入一个
 * zzzz@example.com 也显示「可用」，直到第 ② 屏发码才被挡回来
 * （signInWithOtp 对已注册邮箱是登录语义）。用户看到的是
 * 「它说可用，怎么又不行」。
 *
 * 走 RPC 而不是查表：邮箱在 auth.users，profiles 根本没有 email 列；
 * 而 auth schema 对 anon 不可读。RPC 只回布尔，不回邮箱明文 ——
 * 拿不到明文就没法批量探测「这个邮箱是谁」。
 *
 * 返回 { ok, registered }：
 *   ok=false 查询本身失败（网络断 / RPC 未部署）⇒ registered=null，
 *   调用方**不要**冒充「可用」也不要冒充「已注册」，直接不显示徽标。
 */
export async function isEmailRegistered(email) {
  const safeEmail = normalizeEmail(email);
  if (!safeEmail || !safeEmail.includes('@')) return { ok: false, registered: null };
  try {
    const { data, error } = await supabase.rpc('is_email_registered', {
      p_email: safeEmail,
    });
    if (error) {
      logger.warn('auth-api', 'Email registered check failed', error);
      return { ok: false, registered: null };
    }
    return { ok: true, registered: data === true };
  } catch (error) {
    logger.warn('auth-api', 'Email registered check threw', error);
    return { ok: false, registered: null };
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
      error: normalizeDbError({ message: usernameValidationMessage, code: 'INVALID_USERNAME' }),
    };
  }

  const passwordValidationMessage = validatePassword(safePassword);
  if (passwordValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: passwordValidationMessage, code: 'INVALID_PASSWORD' }),
    };
  }

  const emailValidationMessage = validateEmail(safeEmail);
  if (emailValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' }),
    };
  }

  const usernameAvailability = await isUsernameAvailable(safeUsername);
  if (usernameAvailability.ok && usernameAvailability.available === false) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '该方块 ID 已被使用', code: 'USERNAME_TAKEN' }),
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
        username: safeUsername,
      },
    },
  });

  if (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (
      normalizedMessage.includes('user already registered') ||
      normalizedMessage.includes('already registered')
    ) {
      return {
        ok: false,
        data,
        error: normalizeDbError({
          message: '该邮箱已注册，请直接登录。',
          code: 'USER_ALREADY_REGISTERED',
        }),
      };
    }
    if (normalizedMessage.includes('rate limit')) {
      return {
        ok: false,
        data,
        error: normalizeDbError({
          ...error,
          code: 'EMAIL_RATE_LIMIT',
          message: '邮件发送过于频繁，请稍后再试。',
        }),
      };
    }
    if (isCaptchaVerificationFailure(normalizedMessage)) {
      return {
        ok: false,
        data,
        error: normalizeDbError({
          ...error,
          code: 'CAPTCHA_FAILED',
          message:
            '注册失败：检测到 Supabase Bot Detection 验证未通过。若已废除 Turnstile，请在 Supabase 控制台关闭 Authentication -> Bot Detection 后重试。',
        }),
      };
    }
    return { ok: false, data, error: normalizeDbError(error) };
  }

  const isExistingUserMaskedSuccess =
    Array.isArray(data?.user?.identities) && data.user.identities.length === 0;

  if (isExistingUserMaskedSuccess) {
    return {
      ok: false,
      data,
      error: normalizeDbError({
        message: '该邮箱已注册，请直接登录。',
        code: 'USER_ALREADY_REGISTERED',
      }),
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
        join_date: new Date().toISOString().split('T')[0],
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

export async function signIn(loginId, password, security = {}) {
  const safeLoginId = normalizeLoginId(loginId);
  const safePassword = String(password || '');

  if (!safeLoginId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '请输入方块 ID 或邮箱地址', code: 'INVALID_INPUT' }),
    };
  }
  if (!safePassword) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '请输入密码', code: 'INVALID_INPUT' }),
    };
  }

  // 一切登录都走 auth-login EF：方块 ID 与邮箱一视同仁（2026-11-03 收口）。
  //
  // 为什么邮箱不能直连 GoTrue（旧实现就是那样，等于留了一条旁路）：
  //   · 直连 `supabase.auth.signInWithPassword` 绕过失败计数、Altcha 与服务端封禁校验。
  //     闸门的判据 `auth_attempt_events` 只由 EF 写入 ⇒ 旁路被撞库时闸门永远是哑的；
  //     而 GoTrue 侧的 `security_captcha_enabled` 也是 false，两边都不设防。
  //   · 邮箱走 EF **不增加枚举面**：`resolveEmailFromLoginId` 对含 `@` 的输入直接返回，
  //     不做任何库查询；EF 又把所有失败收敛成 INVALID_CREDENTIALS。
  //   · 仍然没有降级路径：EF 不可用时明确报错，绝不静默回落到直连。
  const edge = await invokeAuthLoginEdge(safeLoginId, safePassword, security);

  if (edge.unavailable) {
    logger.warn('auth-api', 'auth-login EF 不可用', {
      status: edge.status,
      reason: edge.reason,
    });

    // 超时与「服务不可用」分开报：前者是网络/上游慢（重试有意义），后者是网关真的没了。
    if (edge.reason === 'timeout') {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          code: 'LOGIN_GATEWAY_TIMEOUT',
          message: '登录请求超时，请检查网络后重试。',
        }),
      };
    }

    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'LOGIN_GATEWAY_UNAVAILABLE',
        message: '登录服务暂不可用，请稍后再试。',
      }),
    };
  }

  const payload = edge.payload || {};

  if (payload.ok !== true) {
    // 风控标志透传：store 的 login() 读 `data.requireCaptcha` 决定是否展示验证码。
    // 出错时 data 本来没有内容，这里把标志挂上去 —— 比改 store 的读取路径更安全。
    const riskData = {
      requireCaptcha: Boolean(payload.requireCaptcha),
      retryAfterSeconds: Number(payload.retryAfterSeconds) || undefined,
    };
    const edgeMessage = String(payload.message || '');
    const edgeCode = String(payload.code || '');
    // EF 自己已把「邮箱未验证」归一成 EMAIL_NOT_CONFIRMED 码；
    // 早期 GoTrue 原话也兼容，两者都给用户一句能行动的话。
    if (
      edgeCode === 'EMAIL_NOT_CONFIRMED' ||
      edgeMessage.toLowerCase().includes('email not confirmed')
    ) {
      return {
        ok: false,
        data: riskData,
        error: normalizeDbError({
          code: 'EMAIL_NOT_CONFIRMED',
          message:
            '该邮箱尚未完成验证，请查收注册确认邮件（注意垃圾箱）后再登录；若未收到，可回到注册页重新发送。',
        }),
      };
    }
    return {
      ok: false,
      data: riskData,
      error: normalizeDbError({
        code: edgeCode || 'LOGIN_FAILED',
        message: payload.message || '登录失败，请稍后再试。',
      }),
    };
  }

  return adoptEdgeSession(payload);
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
  if (
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
  ) {
    return false;
  }
  if (!passkeyCapabilityCache) {
    passkeyCapabilityCache =
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch((error) => {
        logger.warn('auth-api', '通行密钥能力检测失败', error);
        return false;
      });
  }
  return passkeyCapabilityCache;
}

/**
 * 注册入口是否真实可用：`registerPasskey` 是 supabase-js 2.105+ 才加入的 experimental API
 * （本项目 2026-09-21 随 6.3.3 升级到 2.116.0 才具备），实例还必须以
 * `auth: { experimental: { passkey: true } }` 创建（supabase-client.js 已开）。
 *
 * ⚠️ 浏览器若缓存了升级前的 Vite 预构建产物（deps 下发 immutable 强缓存头），
 * 运行时方法会整个不存在 —— 此时引导毫无意义，必须在 UI 层降级，
 * 而不是把「registerPasskey is not a function」的英文 TypeError 甩给用户。
 */
export const canRegisterPasskey = () => typeof supabase.auth?.registerPasskey === 'function';

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
  const code = String(error?.code || '').toLowerCase();

  // 封禁优先判：GoTrue 在签发 token 前就会 403 `user_banned`（服务端拦截，
  // 见迁移 2026110321 —— 封禁状态同步写入 auth.users.banned_until）。
  // 这条不是「设备没注册通行密钥」，不能让用户按引导去反复试。
  if (code.includes('banned') || message.includes('banned')) {
    return '该账号已被封禁，无法登录。如有疑问请联系管理员。';
  }
  if (
    name === 'NotAllowedError' ||
    message.includes('not allowed') ||
    message.includes('timed out')
  ) {
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

  // supabase-js 无会话/会话过期（AuthSessionMissingError）——预览假登录态与登录过期都会走到这里
  if (
    name === 'AuthSessionMissingError' ||
    message.includes('session missing') ||
    message.includes('not authenticated')
  ) {
    return '未检测到有效登录，请先登录后再开启。';
  }
  if (
    name === 'InvalidStateError' ||
    message.includes('already') ||
    message.includes('invalid state')
  ) {
    return '这台设备上已经注册过通行密钥，无需重复添加。';
  }
  if (
    name === 'NotAllowedError' ||
    message.includes('not allowed') ||
    message.includes('timed out')
  ) {
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
      ok: false,
      data: null,
      changed: false,
      pendingEmail: '',
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' }),
    };
  }

  const safePassword = String(currentPassword || '');
  const currentPasswordMessage = validateCurrentPassword(safePassword);
  if (currentPasswordMessage) {
    return {
      ok: false,
      data: null,
      changed: false,
      pendingEmail: '',
      error: normalizeDbError({ message: currentPasswordMessage, code: 'INVALID_PASSWORD' }),
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return {
      ok: false,
      data: null,
      changed: false,
      pendingEmail: '',
      error: normalizeDbError({
        message: '登录状态读取失败，请重新登录后再试。',
        code: 'SESSION_READ_FAILED',
      }),
    };
  }

  if (String(authData.user.email || '').toLowerCase() === safeEmail) {
    return {
      ok: false,
      data: null,
      changed: false,
      pendingEmail: '',
      error: normalizeDbError({ message: '新邮箱与当前邮箱相同。', code: 'SAME_EMAIL' }),
    };
  }

  // 当前密码校验（与 updatePassword 的 verify 模式一致：确保操作者是账号主人）
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: authData.user.email,
    password: safePassword,
  });

  if (verifyError) {
    const message =
      String(verifyError.message || '') === 'Invalid login credentials'
        ? '当前密码不正确，请重新输入。'
        : verifyError.message || '当前密码校验失败';
    return {
      ok: false,
      data: null,
      changed: false,
      pendingEmail: '',
      error: normalizeDbError({
        ...verifyError,
        message,
        code: verifyError.code || 'CURRENT_PASSWORD_VERIFY_FAILED',
      }),
    };
  }

  const { data, error } = await supabase.auth.updateUser({ email: safeEmail });

  if (error) {
    const normalizedMessage = String(error.message || '').toLowerCase();
    if (normalizedMessage.includes('already') || normalizedMessage.includes('registered')) {
      return {
        ok: false,
        data: null,
        changed: false,
        pendingEmail: '',
        error: normalizeDbError({
          ...error,
          code: 'EMAIL_TAKEN',
          message: '该邮箱已被其他账号使用。',
        }),
      };
    }
    return {
      ok: false,
      data: null,
      changed: false,
      pendingEmail: '',
      error: normalizeDbError(error),
    };
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
      error: normalizeDbError({ message: '确认令牌无效', code: 'INVALID_TOKEN_HASH' }),
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type: safeType,
    token_hash: safeTokenHash,
  });
  return { ok: !error, data, error: normalizeDbError(error) };
}

/**
 * 邮箱验证码校验（2026-11-25：注册改走「8 位验证码」而非确认链接）。
 *
 * 为什么是验证码而不是链接：
 *   链接模式下 emailRedirectTo 只能落到站点根路径，成功与否在落地页之外，
 *   用户点完链接回到站点时「注册」这件事已经消失了，没有任何容器能显示
 *   「成功连接 BOH」。验证码把验证留在当前页，第五步自然就是一次状态切换。
 *
 * 两个与线上配置绑死的常量（改动必须同步查 Management API config/auth）：
 *   · mailer_otp_length = 8 —— 不是常见的 6 位，输入框必须按 8 格设计
 *   · mailer_otp_exp    = 600 —— 10 分钟，界面文案必须与此一致
 *
 * type 用 'signup' 而不是文档里的 'email'：两者 GoTrue 都接受（实测返回同样的
 * `otp_expired`），但 'signup' 与 signUp() 产出的 OTP 类型同源，重发时也用同一个值
 * （resendSignupConfirmation 里的 type 同为 'signup'），不会出现「验的是 A 类、
 * 重发的是 B 类」这种错配。
 */
export async function verifySignupOtp(email, token) {
  const safeEmail = normalizeEmail(email);
  const safeToken = String(token || '')
    .replace(/\s+/g, '')
    .trim();

  const emailValidationMessage = validateEmail(safeEmail);
  if (emailValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' }),
    };
  }

  if (!safeToken) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '请输入验证码', code: 'EMPTY_OTP' }),
    };
  }

  // 长度按线上 mailer_otp_length 校验。故意不写成硬编码的 6 —— 6 是绝大多数
  // 产品的习惯值，照抄会让用户「输入的位数看着对、服务端永远说不匹配」。
  if (safeToken.length !== OTP_LENGTH) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        message: `验证码是 ${OTP_LENGTH} 位数字`,
        code: 'INVALID_OTP_LENGTH',
      }),
    };
  }

  if (!/^\d+$/.test(safeToken)) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '验证码只包含数字', code: 'INVALID_OTP_FORMAT' }),
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: safeEmail,
    token: safeToken,
    type: 'signup',
  });

  if (error) {
    const normalized = String(error.message || '').toLowerCase();
    const errorCode = String(error.error_code || error.code || '').toLowerCase();
    // 过期/已用过是 GoTrue 最常见的两种拒绝，且文案对用户毫无信息量
    // （"Token has expired or is invalid"）。分开说，因为处置动作不同：
    // 过期 → 重发；用过 → 直接去登录（它其实已经生效过一次）。
    if (errorCode === 'otp_expired' || normalized.includes('expired')) {
      return {
        ok: false,
        data,
        error: normalizeDbError({
          ...error,
          code: 'OTP_EXPIRED',
          message: '验证码已过期，请重新获取。',
        }),
      };
    }
    if (normalized.includes('invalid') && !normalized.includes('expired')) {
      return {
        ok: false,
        data,
        error: normalizeDbError({
          ...error,
          code: 'OTP_INVALID',
          message: '验证码不正确，请检查后重试。',
        }),
      };
    }
    return { ok: false, data, error: normalizeDbError(error) };
  }

  // 验证成功后 supabase-js 自动保存会话并广播 SIGNED_IN，
  // auth store 的事件处理器接管本地状态 —— 这里不重复写 session。

  /**
   * 「这个账号是不是刚建的」—— 注册流程必须靠它区分两件事：
   *
   *   `signInWithOtp` 对**已存在**的邮箱语义是登录。用户以为自己在注册，
   *   实际验证通过后进入的是一个老账号。如果继续走完第 ③ 屏（写 ID、设密码），
   *   就会把这个老账号的方块 ID 改成新的、密码换成新的 —— 一次**静默的账户改写**。
   *
   * 判据用 `created_at` 而不是别的：本次注册的第 ① 屏和第 ② 屏之间正常不超过
   * 10 分钟（验证码有效期），所以「创建于 15 分钟内」必然是本次这一轮建的。
   * 取 15 而不是 10，是为了容忍用户在第 ① 屏停留一阵才去收信。
   *
   * 拿不到 created_at 时返回 `null`（未知），调用方按「不确定」处理 ——
   * 不能默认当成新账号，否则就退回到上面那个静默改写。
   */
  const createdAtRaw = data?.user?.created_at || null;
  const createdAtMs = createdAtRaw ? Date.parse(createdAtRaw) : NaN;
  const wasCreatedRecently = Number.isFinite(createdAtMs)
    ? Date.now() - createdAtMs < 15 * 60 * 1000
    : null;

  return { ok: true, data, error: null, wasCreatedRecently };
}

export async function resendSignupConfirmation(email) {
  const safeEmail = normalizeEmail(email);
  const emailValidationMessage = validateEmail(safeEmail);
  if (emailValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' }),
    };
  }

  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email: safeEmail,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  // 429 拆成两种「等多久」，处置动作完全不同（2026-11-25）：
  //   · over_email_send_rate_limit —— 项目级每小时发信额度（线上 rate_limit_email_sent=15）
  //     或同一地址 60 秒间隔（smtp_max_frequency=60）。这是**整站**的额度，
  //     用户点再多次都没用，只能等；必须给出明确秒数，否则他会当成页面坏了。
  //   · over_request_rate_limit —— 请求频率，通常几十秒内自解。
  // 不区分就只会甩出英文 "email rate limit exceeded"，用户读不懂也做不了任何事。
  if (error) {
    const normalized = String(error.message || '').toLowerCase();
    const code = String(error.code || error.error_code || '').toLowerCase();
    const matched = normalized.match(/after\s+(\d+)\s+seconds?/i);
    const isEmailQuota =
      code === 'over_email_send_rate_limit' ||
      normalized.includes('email rate limit') ||
      normalized.includes('over_email_send_rate_limit');
    const isRequestLimit = code === 'over_request_rate_limit' || normalized.includes('rate limit');

    if (isEmailQuota || isRequestLimit || Number(error.status) === 429) {
      const retryAfterSeconds = Number(matched?.[1] || 0) || (isEmailQuota ? 3600 : 60);
      return {
        ok: false,
        data: null,
        retryAfterSeconds,
        error: normalizeDbError({
          ...error,
          code: isEmailQuota ? 'EMAIL_QUOTA_EXCEEDED' : 'EMAIL_RATE_LIMIT',
          message: isEmailQuota
            ? `发信额度已用完，请 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试。`
            : `请求过于频繁，请 ${retryAfterSeconds} 秒后再试。`,
        }),
      };
    }
  }

  return { ok: !error, data, error: normalizeDbError(error), retryAfterSeconds: 0 };
}

/**
 * 第三方 OAuth 登录：**刻意不提供**（2026-11-16 决策，原 `signInWithOAuth` 已删除）。
 *
 * 删掉而不是留着的三个理由：
 *   1. 风控旁路 —— 密码登录全部收口在 `auth-login` EF（失败计数 / Altcha / 封禁都在那里），
 *      OAuth 走 GoTrue 的 /token，等于第二条入口；`docs/reports/2026-11/2026-11-03-安全整改外部审查.md:69` 已点名。
 *   2. 首登无身份 —— OAuth 用户没有 profiles 行、没有方块 ID，而社区全链路依赖
 *      `profiles.username`，接上必须先有「首登设置方块 ID」的流程。
 *   3. 从未接线 —— UI 里没有任何入口（`docs/reports/2026-09/2026-09-22-注册页改版方案.md:139` 已记录），
 *      留着只会让下一个人以为「开箱即用」。
 * 将来若要启用：先定风控口径（是否并入 auth-login），再补首登引导与回跳落地，别只加两个按钮。
 */

/* ════════════════════════════════════════════════════════════════════
   「邮箱优先」注册三件套（2026-11-25）
   ────────────────────────────────────────────────────────────────────
   流程：① 邮箱+同意协议 → ② 验证码 → ③ BOH ID + 密码 → ④ 生日 → ⑤ 头像 → ⑥ passkey → ⑦ 欢迎

   为什么不是 signUp 一次搞定：signUp 是原子的，必须邮箱+密码+ID 一起提交，
   而新流程在第 ① 屏还拿不到后两项。所以第 ① 屏用 `signInWithOtp` 只建账号，
   第 ③ 屏拿到会话后再补密码（`updateUser`）和 ID（`profiles` update）。

   这条路的**代价**，写在这里免得下一轮又发现一遍：
     · auth.users 会在「用户还没设密码」时就存在 ⇒ 中途放弃会留下半成品账号。
       它们**登不进来**（密码为空、登录页只收密码），所以不构成安全风险，
       但会占着邮箱。清理策略见 `2026112503_prune_abandoned_signups` 的注释。
     · 已注册邮箱走的是 signInWithOtp 的「登录」语义 ⇒ 验证码通过后就进了一个
       **已有账号**。见 `sendSignupOtp` 里对 created_at 的说明。
   ════════════════════════════════════════════════════════════════════ */

/**
 * 第 ① 屏：只凭邮箱创建（或识别）账号，并发送 8 位验证码。
 *
 * `options.data` 会写进 `auth.users.raw_user_meta_data`，然后被 auth.users 上的
 * 触发器一次性写进 `profiles.terms_accepted_at` / `terms_version` ——
 * 也就是说「同意协议」和「账号建立」在同一次事务里，不依赖前端事后补写
 * （补写会漏：用户验证完就关页面的话，那次补写永远不会发生）。
 *
 * ⚠️ 已注册邮箱的行为差异：`signInWithOtp` 遇到已存在的邮箱时语义是**登录**，
 *    GoTrue 会改用 `magic_link` 那封信（默认模板带的是 `{{ .ConfirmationURL }}`，
 *    不是验证码）。用户会收到一封「Your Magic Link」而不是「你的 BOH 验证码」。
 *    调用方拿到 `ok:true` 也无法从返回值区分这两种情况，所以**必须**用
 *    `wasCreatedRecently`（验证通过后看 created_at）来兜住，见 verifySignupOtp 的第二个返回值。
 */
export async function sendSignupOtp(email, { termsAcceptedAt } = {}) {
  const safeEmail = normalizeEmail(email);
  const emailValidationMessage = validateEmail(safeEmail);
  if (emailValidationMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: emailValidationMessage, code: 'INVALID_EMAIL' }),
    };
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email: safeEmail,
    options: {
      // 第 ① 屏本来就是要「建号」，所以允许自动注册
      shouldCreateUser: true,
      data: {
        terms_accepted_at: termsAcceptedAt || new Date().toISOString(),
        terms_version: TERMS_VERSION,
      },
    },
  });

  if (!error) return { ok: true, data, error: null, retryAfterSeconds: 0 };

  // 频控与 signUp / resend 同一套口径（三条路径的 429 文案必须一致，
  // 否则用户在不同步骤看到三种措辞会以为遇到了不同故障）
  const normalized = String(error.message || '').toLowerCase();
  const code = String(error.code || error.error_code || '').toLowerCase();
  const matched = normalized.match(/after\s+(\d+)\s+seconds?/i);
  const isEmailQuota =
    code === 'over_email_send_rate_limit' ||
    normalized.includes('email rate limit') ||
    normalized.includes('over_email_send_rate_limit');
  const isRequestLimit = code === 'over_request_rate_limit' || normalized.includes('rate limit');

  if (isEmailQuota || isRequestLimit || Number(error.status) === 429) {
    const retryAfterSeconds = Number(matched?.[1] || 0) || (isEmailQuota ? 3600 : 60);
    return {
      ok: false,
      data: null,
      retryAfterSeconds,
      error: normalizeDbError({
        ...error,
        code: isEmailQuota ? 'EMAIL_QUOTA_EXCEEDED' : 'EMAIL_RATE_LIMIT',
        message: isEmailQuota
          ? `发信额度已用完，请 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试。`
          : `请求过于频繁，请 ${retryAfterSeconds} 秒后再试。`,
      }),
    };
  }

  return { ok: false, data: null, error: normalizeDbError(error), retryAfterSeconds: 0 };
}

/**
 * 第 ② 屏验证通过后：判断这个会话对应的账号**是不是还没建完**。
 *
 * 为什么必须有这一步：`signInWithOtp` 对已注册邮箱的语义是登录。
 * 验证码一过就拿到会话，但会话背后可能是：
 *   ① 本次刚建的空壳账号   → 继续走注册（正常路径）
 *   ② 上次放弃的半成品账号 → 也继续走注册（signup_completed_at 为 NULL）
 *   ③ 真正的老用户误用注册页 → 必须挡住，否则第 ③ 屏会改写他的 ID 和密码
 *
 * `signup_completed_at` 正好把 ①② 与 ③ 分开（迁移 2026112503）。
 * 拿不到时 fail-open（返回 incomplete: true）是**故意**的：宁可让极少数老用户
 * 看到第 ③ 屏（他们改回自己的 ID 就没事），也不要让正常新用户在第 ② 屏卡死 ——
 * 前者的代价是"多填一屏"，后者的代价是"根本注册不了"。
 */
export async function checkSignupState() {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return { ok: false, incomplete: true, error: null };

    const { data, error } = await supabase
      .from('profiles')
      .select('signup_completed_at, username')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.warn('auth-api', 'checkSignupState failed', error);
      return { ok: false, incomplete: true, error: normalizeDbError(error) };
    }

    return {
      ok: true,
      // 没有行也算未建完（理论上触发器保证有行，但别让缺行把用户锁死）
      incomplete: !data?.signup_completed_at,
      username: data?.username || '',
      error: null,
    };
  } catch (err) {
    logger.warn('auth-api', 'checkSignupState threw', err);
    return { ok: false, incomplete: true, error: null };
  }
}

/**
 * 第 ③ 屏：账号已由第 ① 屏建好、会话已在第 ② 屏拿到。
 * 这一屏要落三样东西：密码（auth.users）+ BOH ID / 生日（profiles）。
 *
 * 顺序讲究：**先写 profiles 再设密码**。
 *   · profiles update 失败（ID 被抢 / RLS 拒）时，用户还能在本屏重试，密码仍是空的，
 *     下次进来还是同一条路；
 *   · 反过来先设密码的话，ID 失败时用户已经「能登录但没有 ID」—— 登录态下没有 ID
 *     的账号在本项目里是坏死状态（社区全链路依赖 username），只能靠后台补。
 *
 * 生日是可选的：留空就不写，不要写空串（`profiles.birth_month/day` 是 text 且允许 NULL，
 * 空串会污染「生日是否已填」的判断）。
 */
export async function completeSignupIdentity({ username, password, birthMonth, birthDay }) {
  const safeUsername = String(username || '').trim();
  const safePassword = String(password || '');

  const usernameValidationMessage = validateUsername(safeUsername);
  if (usernameValidationMessage) {
    return {
      ok: false,
      step: 'username',
      error: normalizeDbError({ message: usernameValidationMessage, code: 'INVALID_USERNAME' }),
    };
  }

  const passwordValidationMessage = validatePassword(safePassword);
  if (passwordValidationMessage) {
    return {
      ok: false,
      step: 'password',
      error: normalizeDbError({ message: passwordValidationMessage, code: 'INVALID_PASSWORD' }),
    };
  }

  // 会话是第 ② 屏验证建立的；这里只读不写。没有会话说明用户跳步或会话已失效。
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (authError || !userId) {
    return {
      ok: false,
      step: 'session',
      error: normalizeDbError({
        message: '验证状态已失效，请重新验证邮箱。',
        code: 'NO_SESSION',
      }),
    };
  }

  // ① 先查重：给用户一句人话，而不是让 DB 抛 23505 再翻译
  const availability = await isUsernameAvailable(safeUsername);
  if (availability.ok && availability.available === false) {
    return {
      ok: false,
      step: 'username',
      error: normalizeDbError({ message: '该方块 ID 已被使用', code: 'USERNAME_TAKEN' }),
    };
  }

  // ② 写 profiles（ID / 生日 / 「建完了」标记）
  // signup_completed_at 是整套「邮箱优先」流程的安全阀：为 NULL 表示账号没建完，
  // 下次同一邮箱再来允许继续注册；非 NULL 才是真正的老用户。
  // 不写它的话，「放弃后回来」的用户会被当成老用户挡在门外，而他根本没有密码。
  const patch = { username: safeUsername, signup_completed_at: new Date().toISOString() };
  const m = birthMonth === '' || birthMonth == null ? NaN : Number(birthMonth);
  const d = birthDay === '' || birthDay == null ? NaN : Number(birthDay);
  if (Number.isFinite(m) && Number.isFinite(d)) {
    patch.birth_month = String(m);
    patch.birth_day = String(d);
  }

  const { error: profileError } = await supabase.from('profiles').update(patch).eq('id', userId);

  if (profileError) {
    const isTaken = String(profileError.code || '') === '23505';
    return {
      ok: false,
      step: 'username',
      error: normalizeDbError({
        ...profileError,
        code: isTaken ? 'USERNAME_TAKEN' : profileError.code,
        message: isTaken ? '该方块 ID 已被使用' : '资料保存失败，请重试。',
      }),
    };
  }

  // ③ 最后设密码。失败时 ID 已经写好了，重试这一屏不会重复写（update 幂等）。
  const { error: passwordError } = await supabase.auth.updateUser({ password: safePassword });
  if (passwordError) {
    return { ok: false, step: 'password', error: normalizeDbError(passwordError) };
  }

  return { ok: true, step: 'done', userId, error: null };
}

/**
 * 按字段更新自己的 profiles 行（注册流程的零散小写：头像 URL / 生日）。
 * 收口到这里而不是让 Join 页直连 .from('profiles') —— 分层棘轮（check:layering）
 * 只认「视图层零直连」，散写字段与 completeSignupIdentity 的整段写走同一条路。
 * 只写调用方给到的列，不动其他字段；错误原样返回，由调用方决定是否致命。
 */
export async function updateProfileFields(userId, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  return { ok: !error, error: error || null };
}

/**
 * 读某用户的角色（注册页管理员预览入口用，只取 role 一列）。
 * RLS 保证查得到的是自己那一行；出错时 role 回空串（探测失败 = 入口不可用）。
 */
export async function getProfileRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { role: '', error };
  return { role: String(data?.role || ''), error: null };
}

export async function resetPassword(email) {
  const redirectBase = `${window.location.origin}/#/reset-password`;
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectBase,
  });

  // 频控秒数（2026-11-16）：GoTrue 的 429 文案是
  // "For security purposes, you can only request this after N seconds."，
  // 但版本/语言变化时可能只剩 status=429。两条都兜住 —— 登录页要把「忘记密码」
  // 做成倒计时，否则用户只会反复点、反复看到同一句英文错误。
  if (error) {
    const matched = String(error.message || '').match(/after\s+(\d+)\s+seconds?/i);
    const retryAfterSeconds = Number(matched?.[1] || 0) || (Number(error.status) === 429 ? 60 : 0);
    if (retryAfterSeconds > 0) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          ...error,
          code: 'EMAIL_RATE_LIMIT',
          message: `邮件发送过于频繁，请 ${retryAfterSeconds} 秒后再试。`,
        }),
        retryAfterSeconds,
      };
    }
    return { ok: false, data: null, error: normalizeDbError(error), retryAfterSeconds: 0 };
  }

  return { ok: true, data, error: null, retryAfterSeconds: 0 };
}

export async function verifyPasswordRecovery(tokenHash) {
  const safeTokenHash = String(tokenHash || '').trim();
  if (!safeTokenHash) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '恢复令牌无效', code: 'INVALID_TOKEN_HASH' }),
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type: 'recovery',
    token_hash: safeTokenHash,
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
      error: normalizeDbError({ message: passwordValidationMessage, code: 'INVALID_PASSWORD' }),
    };
  }

  if (safeCurrentPassword) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError(
          authError || { message: '未检测到登录用户', code: 'NOT_AUTHENTICATED' },
        ),
      };
    }

    const currentEmail = String(authData.user.email || '')
      .trim()
      .toLowerCase();
    if (!currentEmail) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          message: '当前账号未绑定邮箱，暂无法校验当前密码',
          code: 'EMAIL_REQUIRED',
        }),
      };
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: safeCurrentPassword,
    });

    if (verifyError) {
      let message = verifyError.message || '当前密码校验失败';
      if (message === 'Invalid login credentials') {
        message = '当前密码不正确，请重新输入。';
      } else if (isCaptchaVerificationFailure(message)) {
        message =
          '当前密码校验失败：检测到 Supabase Bot Detection 验证未通过。若已废除 Turnstile，请在 Supabase 控制台关闭 Authentication -> Bot Detection 后重试。';
      }
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          ...verifyError,
          message,
          code: verifyError.code || 'CURRENT_PASSWORD_VERIFY_FAILED',
        }),
      };
    }

    if (verifyData?.user?.id !== authData.user.id) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          message: '账号校验失败：当前会话与密码验证账号不一致',
          code: 'USER_MISMATCH',
        }),
      };
    }
  }

  const { data, error } = await supabase.auth.updateUser({
    password: safePassword,
    ...(safeCurrentPassword ? { current_password: safeCurrentPassword } : {}),
  });

  // 归一成中文 + 可判定的 code：调用方（重置页 / 账户安全面板）需要据此给出
  // 不同引导 —— 重置页应告诉用户「你其实记得密码，直接去登录」，
  // 面板里则只需说「不能与当前密码相同」。
  if (isSamePasswordError(error)) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        ...error,
        message: '新密码不能与当前密码相同。',
        code: 'SAME_PASSWORD',
      }),
    };
  }

  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function deleteMyAccount(password, reason = '') {
  const safePassword = String(password || '');
  const currentPasswordMessage = validateCurrentPassword(safePassword);
  if (currentPasswordMessage) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: currentPasswordMessage, code: 'INVALID_PASSWORD' }),
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError(
        authError || { message: '未检测到登录用户', code: 'NOT_AUTHENTICATED' },
      ),
    };
  }

  const currentUser = authData.user;
  const currentEmail = String(currentUser.email || '')
    .trim()
    .toLowerCase();
  if (!currentEmail) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        message: '当前账号未绑定邮箱，暂无法使用密码注销',
        code: 'EMAIL_REQUIRED',
      }),
    };
  }

  const { data: verifyData, error: verifyError } = await supabase.auth.signInWithPassword({
    email: currentEmail,
    password: safePassword,
  });

  if (verifyError) {
    let message = verifyError.message || '密码验证失败';
    if (message === 'Invalid login credentials') {
      message = '密码验证失败：请输入当前账号密码';
    } else if (isCaptchaVerificationFailure(message)) {
      message =
        '密码验证失败：检测到 Supabase Bot Detection 验证未通过。若已废除 Turnstile，请在 Supabase 控制台关闭 Authentication -> Bot Detection 后重试。';
    }
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        ...verifyError,
        message,
        code: verifyError.code || 'PASSWORD_VERIFY_FAILED',
      }),
    };
  }

  if (verifyData?.user?.id !== currentUser.id) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        message: '账号校验失败：当前会话与密码验证账号不一致',
        code: 'USER_MISMATCH',
      }),
    };
  }

  const safeReason = String(reason || '')
    .trim()
    .slice(0, 120);
  const { data: rpcData, error: rpcError } = await supabase.rpc('delete_my_account', {
    p_reason: safeReason || null,
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
        code: rpcData.code || 'ACCOUNT_DELETE_FAILED',
      }),
    };
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    logger.warn('auth-api', 'Sign out after account deletion failed', signOutError);
  }

  invalidateByTags([
    'auth',
    'notifications',
    'profiles',
    'posts',
    'comments',
    'messages',
    'weekly-checkin',
  ]);
  return { ok: true, data: rpcData || { ok: true, code: 'ACCOUNT_DELETED' }, error: null };
}

/**
 * 退出登录。
 *
 * ⚠️ `scope` 的默认值从 `global` 改成 `local`（2026-11-16）：
 *   supabase-js 的默认值是 `{ scope: 'global' }`（GoTrueClient.js 的 signOut），
 *   意思是**吊销该账号在所有设备上的刷新令牌** —— 在电脑上点一次退出，手机也掉线。
 *   这个行为对用户完全不可见，而「账户安全 → 登录设备」里又有显式的
 *   「退出其他所有设备」（scope: 'others'）供需要时使用，所以普通退出按本机处理。
 *
 *   scope 语义：
 *     local  —— 只清本机（令牌到期自然失效），其他设备不受影响
 *     others —— 吊销其他所有设备，保留当前
 *     global —— 吊销全部（含当前）
 */
export async function signOut(scope = 'local') {
  // 先解绑这台设备的 Web Push 订阅，再登出。
  // 顺序不能反：解绑 RPC 内部用 auth.uid() 判定归属，登出后就没有身份了，
  // 会留下一个「已登出但仍在收上一个账号推送」的设备。
  let signOutError = null;
  try {
    try {
      const { unbindDeviceOnLogout } = await import('./push-api.js');
      await unbindDeviceOnLogout();
    } catch (error) {
      logger.warn('auth-api', '解绑推送设备失败（忽略）', error);
    }

    const { error } = await supabase.auth.signOut({ scope });
    signOutError = error || null;
  } finally {
    // ⚠️ 清理必须与「请求是否成功」解耦（2026-11-16）：
    //   supabase-js 的 `_signOut` 在**请求失败分支**里同样会 `_removeSession()`
    //   （见 GoTrueClient.js 的 _signOut：非 404/401/403 的错误也会删本地会话）。
    //   此前只有 `!error` 才 `clearSensitiveLocalStorage()` ⇒ 网络抖动时用户已经被登出，
    //   `boh_remember_email` / `username` / Cloud+ 共享相册令牌却留在 localStorage，
    //   共享设备上的下一个人能直接读到。
    //   判据用「本地是否真的没有会话了」而不是「请求成没成功」：只有极端的
    //   storage 读取异常才会在失败后仍保留会话，那种情况不清（宁可留着也不误删）。
    let localSessionGone = false;
    try {
      const { data } = await supabase.auth.getSession();
      localSessionGone = !data?.session;
    } catch (sessionError) {
      logger.warn('auth-api', '退出后读取本地会话失败，跳过 PII 清理', sessionError);
    }

    // 缓存失效本身无副作用，无条件执行：宁可能少用一次缓存，也不要让下一个账号读到上一个账号的数据。
    invalidateByTags([
      'auth',
      'notifications',
      'profiles',
      'posts',
      'comments',
      'messages',
      'weekly-checkin',
    ]);
    if (localSessionGone) clearSensitiveLocalStorage();
  }

  return { ok: !signOutError, error: normalizeDbError(signOutError) };
}

/**
 * 退出其他所有设备（**保留当前这台**）。
 *
 * 为什么不用 global：`global` 会把当前会话一起吊销 —— 用户点完还得重新登录一次，
 * 这不是「清理其他设备」该有的行为。`others` 是 GoTrue 为此场景专门提供的 scope。
 *
 * 注意：GoTrue 没有「用户侧会话列表」API（只有 service_role 的 /admin/users/:id/sessions），
 * 所以这里只能做到「一次踢掉其他全部」，做不到「看到列表并逐台下线」——
 * 后者需要自建设备表 + 吊销 EF，见 docs 里的待办。
 */
export async function signOutOtherDevices() {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
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
    { ttlMs: CACHE_TTL_LEVELS.REALTIME, tags: ['auth'], timeoutMs: 4000, retry: 0 },
  );

  if (error) {
    const code = String(error.code || '')
      .trim()
      .toUpperCase();
    const message = String(error.message || '').toLowerCase();
    const isSessionMissing =
      code === 'AUTH_SESSION_MISSING' || message.includes('auth session missing');
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
    { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['profiles'], timeoutMs: 8000, retry: 1 },
  );
}

export async function getProfilesPage({
  page = 1,
  pageSize = 10,
  search = '',
  countMode = 'planned',
  onlyRecentActive = false,
} = {}) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.trunc(pageSize)))
    : 10;
  const safeSearch = String(search || '').trim();
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode)
    ? countMode
    : 'planned';
  const safeOnlyRecentActive = Boolean(onlyRecentActive);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  return executeRead(
    'profiles.getProfilesPage',
    {
      page: safePage,
      pageSize: safePageSize,
      search: safeSearch,
      countMode: safeCountMode,
      onlyRecentActive: safeOnlyRecentActive,
    },
    async () => {
      let query = supabase
        .from('profiles')
        .select(
          `
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
        `,
          { count: safeCountMode },
        )
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
          search: safeSearch,
        },
        error,
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.USER_DATA,
      tags: ['profiles'],
      timeoutMs: 8000,
      retry: 1,
    },
  );
}

export async function getRecentBirthdayProfiles({ limit = 8 } = {}) {
  const safeLimit = Number.isFinite(limit) ? Math.min(24, Math.max(1, Math.trunc(limit))) : 8;

  return executeRead(
    'profiles.getRecentBirthdayProfiles',
    { limit: safeLimit },
    async () => {
      const { data, error } = await supabase.rpc('get_recent_birthday_profiles', {
        p_limit: safeLimit,
      });

      if (error) {
        return { data: [], error };
      }

      return {
        data: data || [],
        error: null,
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.STATIC_DATA,
      tags: ['profiles'],
      timeoutMs: 8000,
      retry: 1,
    },
  );
}

export async function getUserInfo(userId) {
  return executeRead(
    'profiles.getUserInfo',
    { userId },
    async () => supabase.from('profiles').select(PROFILE_ALL_COLUMNS).eq('id', userId).single(),
    {
      ttlMs: CACHE_TTL_LEVELS.USER_DATA,
      tags: ['profiles', `profiles:user:${userId}`],
      timeoutMs: 8000,
      retry: 1,
    },
  );
}
