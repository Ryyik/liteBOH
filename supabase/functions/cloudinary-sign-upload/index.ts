import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import {
  resolveUploadMode,
  sanitizeCloudinaryFolder,
  signCloudinaryParams,
} from '../_shared/cloudinary-sign.ts';

/**
 * Cloudinary 上传签名网关
 *
 * 解决的问题：
 *   原先客户端用**无签名 upload_preset** 直传 Cloudinary，而 cloud_name 与 preset 名
 *   都内联在前端产物里 → 任何人都能直接往账号里传文件，且完全绕过
 *   `assert_cloudinary_upload_allowed`（客户端预检 + 未登录直接 return）。
 *
 * 本函数做三件事：
 *   1. 必须携带有效登录态（anon key 无法通过）——这是堵住匿名上传的关键
 *   2. **服务端**执行额度预检 `assert_cloudinary_upload_allowed`（用用户 JWT 调，
 *      使 auth.uid() 生效），把原本可绕过的客户端预检变成真正的闸
 *   3. 按 CLOUDINARY_UPLOAD_MODE 决定下发签名；'unsigned'（默认）时行为与改造前完全一致
 *
 * 切换顺序（与前端部署顺序无关）：
 *   a. 部署本 EF 且 mode 默认 unsigned        → 线上行为不变
 *   b. 设置 CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 *   c. 把 Cloudinary preset 的 Signing Mode 改为 Signed
 *   d. `supabase secrets set CLOUDINARY_UPLOAD_MODE=signed` → 立即切换（无需重新部署）
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

const CLOUDINARY_CLOUD_NAME = String(Deno.env.get('CLOUDINARY_CLOUD_NAME') || '').trim();
const CLOUDINARY_UPLOAD_PRESET = String(Deno.env.get('CLOUDINARY_UPLOAD_PRESET') || '').trim();
const CLOUDINARY_API_KEY = String(Deno.env.get('CLOUDINARY_API_KEY') || '').trim();
const CLOUDINARY_API_SECRET = String(Deno.env.get('CLOUDINARY_API_SECRET') || '').trim();
const CLOUDINARY_UPLOAD_MODE = resolveUploadMode(Deno.env.get('CLOUDINARY_UPLOAD_MODE'));
const CLOUDINARY_DEFAULT_FOLDER = String(Deno.env.get('CLOUDINARY_DEFAULT_FOLDER') || 'boh-cloud-plus').trim();

type AuthenticatedUser = { ok: true; userId: string; token: string };
type AuthError = { ok: false; status: number; code: string; message: string };

const verifyAuth = async (request: Request): Promise<AuthenticatedUser | AuthError> => {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: '缺少登录凭证。' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, code: 'ENV_MISSING', message: '服务器配置缺失。' };
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, code: 'INVALID_SESSION', message: '登录状态已失效，请重新登录。' };
  }

  return { ok: true, userId: data.user.id, token };
};

/**
 * 服务端额度预检。
 * 必须用**用户 JWT** 构造客户端，否则函数内 auth.uid() 为 NULL 会被自身守卫拒绝
 * （该函数对未认证调用会抛 CLOUDINARY_UPLOAD_RATE_LIMIT:NOT_AUTHENTICATED）。
 */
const assertUploadAllowed = async (token: string, source: string) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { error } = await userClient.rpc('assert_cloudinary_upload_allowed', {
    p_source: String(source || 'generic').trim().slice(0, 40) || 'generic',
  });

  return error;
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }, 405, origin);
  }

  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      return jsonResponse({ ok: false, code: auth.code, message: auth.message }, auth.status, origin);
    }

    const rateCheck = await checkRateLimitDb(
      `cloudinary-sign:${auth.userId}`,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rateCheck.ok) {
      return jsonResponse(
        { ok: false, code: 'RATE_LIMITED', message: `请求过于频繁，请在 ${rateCheck.retryAfter} 秒后重试。` },
        429,
        origin,
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const source = String(body?.source || 'generic').trim();

    let folder = '';
    try {
      folder = sanitizeCloudinaryFolder(body?.folder, CLOUDINARY_DEFAULT_FOLDER);
    } catch {
      return jsonResponse({ ok: false, code: 'INVALID_FOLDER', message: '上传目录不合法。' }, 400, origin);
    }

    // 服务端额度预检（原客户端预检可被绕过；这里是真正的闸）
    const allowanceError = await assertUploadAllowed(auth.token, source);
    if (allowanceError) {
      const raw = String(allowanceError.message || '');
      const segments = raw.split(':');
      const code = segments.length >= 3 ? segments[1] : 'UPLOAD_NOT_ALLOWED';
      const message = segments.length >= 3 ? segments.slice(2).join(':') : '当前不可上传图片，请稍后再试。';
      const retryAfter = Number(allowanceError.hint || 0);

      return jsonResponse(
        { ok: false, code, message, retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0 },
        429,
        origin,
      );
    }

    if (CLOUDINARY_UPLOAD_MODE === 'unsigned') {
      return jsonResponse(
        {
          ok: true,
          mode: 'unsigned',
          cloudName: CLOUDINARY_CLOUD_NAME,
          uploadPreset: CLOUDINARY_UPLOAD_PRESET,
        },
        200,
        origin,
      );
    }

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      return jsonResponse(
        {
          ok: false,
          code: 'ENV_MISSING',
          message: '签名服务未配置：需要 CLOUDINARY_CLOUD_NAME / CLOUDINARY_UPLOAD_PRESET / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET。',
        },
        500,
        origin,
      );
    }

    const signed = await signCloudinaryParams(
      {
        upload_preset: CLOUDINARY_UPLOAD_PRESET,
        folder,
        // 归属标记由服务端生成，客户端无法伪造
        context: `uid=${auth.userId}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
      },
      CLOUDINARY_API_SECRET,
    );

    return jsonResponse(
      {
        ok: true,
        mode: 'signed',
        cloudName: CLOUDINARY_CLOUD_NAME,
        apiKey: CLOUDINARY_API_KEY,
        signature: signed.signature,
        params: signed.params,
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'SIGN_UPLOAD_FAILED',
        message: error instanceof Error ? error.message : '签名失败，请稍后再试。',
      },
      500,
      origin,
    );
  }
});
