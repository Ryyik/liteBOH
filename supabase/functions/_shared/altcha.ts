import {
  createChallenge,
  extractParams,
  verifySolution,
} from 'npm:altcha-lib@1.4.1';

const ALTCHA_MAXNUMBER = Number(Deno.env.get('ALTCHA_MAXNUMBER') || 75000);
const ALTCHA_TTL_MS = Number(Deno.env.get('ALTCHA_TTL_MS') || 5 * 60 * 1000);
const ALTCHA_SCOPES = new Set(['login', 'signup']);
const ALTCHA_ENABLED = String(Deno.env.get('ALTCHA_ENABLED') || 'false').trim().toLowerCase() === 'true';

const textEncoder = new TextEncoder();

const base64ToUtf8 = (input: string) => {
  const safeInput = String(input || '').trim();
  const binary = atob(safeInput);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const parsePayload = (payload: string) => {
  try {
    return JSON.parse(base64ToUtf8(payload));
  } catch {
    return null;
  }
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const normalizeExpiresAt = (payload: Record<string, unknown> | null) => {
  const expiresRaw = payload?.expires;
  if (typeof expiresRaw === 'string' || typeof expiresRaw === 'number') {
    const parsed = new Date(expiresRaw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(Date.now() + ALTCHA_TTL_MS);
};

const normalizeScope = (scope: string) => {
  const safeScope = String(scope || '').trim().toLowerCase();
  if (safeScope === 'register') return 'signup';
  return safeScope;
};

export const createScopedAltchaChallenge = async (scope: string) => {
  if (!ALTCHA_ENABLED) {
    throw new Error('ALTCHA_DISABLED');
  }

  const safeScope = normalizeScope(scope);
  if (!ALTCHA_SCOPES.has(safeScope)) {
    throw new Error('不支持的 ALTCHA scope');
  }

  const hmacKey = String(Deno.env.get('ALTCHA_HMAC_KEY') || '').trim();
  if (!hmacKey) {
    throw new Error('缺少环境变量 ALTCHA_HMAC_KEY');
  }

  return createChallenge({
    hmacKey,
    maxnumber: ALTCHA_MAXNUMBER,
    expires: new Date(Date.now() + ALTCHA_TTL_MS),
    params: {
      scope: safeScope,
    },
  });
};

export const verifyAndConsumeAltchaProof = async (
  serviceClient: any,
  {
    payload,
    scope,
    loginKey = '',
    deviceIdHash = '',
  }: {
    payload: string,
    scope: string,
    loginKey?: string,
    deviceIdHash?: string,
  },
) => {
  if (!ALTCHA_ENABLED) {
    return { ok: true, code: 'ALTCHA_DISABLED', message: '人机验证已临时关闭。' };
  }

  const safePayload = String(payload || '').trim();
  const safeScope = normalizeScope(scope);
  if (!safePayload) {
    return { ok: false, code: 'ALTCHA_REQUIRED', message: '请先完成人机验证。' };
  }
  if (!ALTCHA_SCOPES.has(safeScope)) {
    return { ok: false, code: 'ALTCHA_SCOPE_INVALID', message: '验证请求范围无效。' };
  }

  const hmacKey = String(Deno.env.get('ALTCHA_HMAC_KEY') || '').trim();
  if (!hmacKey) {
    throw new Error('缺少环境变量 ALTCHA_HMAC_KEY');
  }

  const verified = await verifySolution(safePayload, hmacKey, true);
  if (!verified) {
    return { ok: false, code: 'ALTCHA_FAILED', message: '人机验证失败，请刷新后重试。' };
  }

  const params = extractParams(safePayload);
  if (String(params?.scope || '').trim().toLowerCase() !== safeScope) {
    return { ok: false, code: 'ALTCHA_SCOPE_MISMATCH', message: '验证结果与当前操作不匹配。' };
  }

  const proofHash = await sha256Hex(safePayload);
  const payloadJson = parsePayload(safePayload);
  const expiresAt = normalizeExpiresAt(payloadJson);
  const safeLoginKey = String(loginKey || '').trim().toLowerCase() || null;
  const safeDeviceIdHash = String(deviceIdHash || '').trim() || null;

  const { error } = await serviceClient
    .from('auth_altcha_proofs')
    .insert([
      {
        proof_hash: proofHash,
        scope: safeScope,
        login_key: safeLoginKey,
        device_id_hash: safeDeviceIdHash,
        expires_at: expiresAt.toISOString(),
      },
    ]);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, code: 'ALTCHA_REPLAYED', message: '验证结果已被使用，请重新验证。' };
    }
    throw error;
  }

  return {
    ok: true,
    code: 'ALTCHA_VERIFIED',
    expiresAt,
    proofHash,
  };
};
