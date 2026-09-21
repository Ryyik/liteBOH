/**
 * Cloudinary 上传签名（服务端）
 *
 * 为什么需要它：
 *   现有上传走的是**无签名 upload_preset**，而 cloud_name 与 preset 名都内联在前端产物里
 *   → 等同于公开凭据，任何人都能直接往账号里传文件。
 *   签名必须用 API secret 计算，**绝不能进前端** → 只能由 Edge Function 代签。
 *
 * 签名口径（与 Cloudinary 一致，已在测试中用独立实现交叉校验）：
 *   1. 取所有待签参数，排除 file / cloud_name / resource_type / api_key / signature
 *   2. 按 key 升序排列，拼成 `k=v&k=v` （值里含 `=` 不特殊处理，直接拼）
 *   3. SHA-1(该字符串 + api_secret) 的十六进制小写
 *
 * 抽成本模块的目的：纯函数、可被 vitest 直接覆盖（EF 入口含 Deno.serve 无法单测）。
 */

/** 不参与签名的参数（Cloudinary 规定） */
export const UNSIGNED_PARAM_KEYS = ['file', 'cloud_name', 'resource_type', 'api_key', 'signature'];

/** 文件夹格式：小写字母数字开头，允许 / _ -，最长 61 字符；禁止 `..` 与连续斜杠 */
const FOLDER_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,60}$/;

export const sanitizeCloudinaryFolder = (folder: unknown, fallback = ''): string => {
  const value = String(folder ?? '').trim();

  if (!value) return fallback;
  if (value.includes('..') || value.includes('//')) {
    throw new Error('INVALID_FOLDER');
  }
  if (!FOLDER_PATTERN.test(value)) {
    throw new Error('INVALID_FOLDER');
  }

  return value;
};

/** 过滤掉不参与签名的键与空值，统一转成字符串 */
export const normalizeSignableParams = (
  params: Record<string, unknown> = {},
): Record<string, string> => {
  const out: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(params)) {
    if (UNSIGNED_PARAM_KEYS.includes(key)) continue;
    if (rawValue === undefined || rawValue === null) continue;

    const value = String(rawValue).trim();
    if (!value) continue;

    out[key] = value;
  }

  return out;
};

/** 待签字符串：按 key 升序拼 `k=v&k=v` */
export const buildSignaturePayload = (params: Record<string, unknown> = {}): string => {
  const signable = normalizeSignableParams(params);

  return Object.keys(signable)
    .sort()
    .map((key) => `${key}=${signable[key]}`)
    .join('&');
};

export const sha1Hex = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export interface CloudinarySignatureResult {
  signature: string;
  payload: string;
  params: Record<string, string>;
}

export const signCloudinaryParams = async (
  params: Record<string, unknown>,
  apiSecret: string,
): Promise<CloudinarySignatureResult> => {
  const secret = String(apiSecret || '').trim();
  if (!secret) {
    throw new Error('MISSING_API_SECRET');
  }

  const normalized = normalizeSignableParams(params);
  const payload = buildSignaturePayload(normalized);

  if (!payload) {
    throw new Error('NOTHING_TO_SIGN');
  }

  return {
    signature: await sha1Hex(payload + secret),
    payload,
    params: normalized,
  };
};

/**
 * 上传模式：
 *   'unsigned'（默认）→ 与改造前行为完全一致，部署本模块不改变任何线上行为
 *   'signed'          → 客户端必须带签名；配合把 Cloudinary preset 切成 Signed 一起生效
 * 由服务端 secret 控制，切换只需 `supabase secrets set`，无需重新部署前端。
 */
export type CloudinaryUploadMode = 'unsigned' | 'signed';

export const resolveUploadMode = (raw: unknown): CloudinaryUploadMode =>
  String(raw ?? '').trim().toLowerCase() === 'signed' ? 'signed' : 'unsigned';
