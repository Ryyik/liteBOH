/**
 * 图库回收站清理（plans/039）
 *
 * 两种调用方，鉴权与范围严格分开：
 *
 * ① **每日巡检**（pg_cron，service_role / BOH_PUSH_DISPATCH_KEY）
 *    扫 `purge_after < now()` 的 pending 行 → 销毁 Cloudinary 资产 → 标 purged。
 *    不带 ids 时只走这条。
 *
 * ② **用户主动「永久删除」**（普通用户 JWT + body `{ ids: [...] }`，2026-11-04 加）
 *    只处理 `user_id = 该 token 的 sub` 且 state='pending' 的行 —— 不看 purge_after，
 *    用户明确要求立即销毁。越权 id 会被静默过滤（不报错，避免枚举他人回收站）。
 *
 * 为什么不在「删除图片」时就销毁资产：
 *   回收站承诺 30 天内可恢复 —— 资产一旦 destroy 就不可逆，恢复只能拿到裂图。
 *   所以销毁只发生在「到期巡检」或「用户点永久删除」这两个明确时点。
 */
import { jsonResponse } from '../_shared/cors.ts';
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';

const CLOUDINARY_CLOUD_NAME = String(Deno.env.get('CLOUDINARY_CLOUD_NAME') || '').trim();
const CLOUDINARY_API_KEY = String(Deno.env.get('CLOUDINARY_API_KEY') || '').trim();
const CLOUDINARY_API_SECRET = String(Deno.env.get('CLOUDINARY_API_SECRET') || '').trim();

const BATCH_LIMIT = 200;
const MAX_ATTEMPTS = 5;

const sha1Hex = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const hasTrustedAuthorization = (request: Request) => {
  const presented = String(request.headers.get('authorization') || '');
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const dispatchKey = String(Deno.env.get('BOH_PUSH_DISPATCH_KEY') || '').trim();
  if (serviceRoleKey && presented === `Bearer ${serviceRoleKey}`) return true;
  return Boolean(dispatchKey) && presented === `Bearer ${dispatchKey}`;
};

/** 从 Bearer token 解析出调用者；无效/过期一律 null。 */
const resolveCallerUserId = async (request: Request) => {
  const presented = String(request.headers.get('authorization') || '');
  if (!presented.startsWith('Bearer ')) return '';
  const token = presented.slice('Bearer '.length).trim();
  if (!token) return '';
  try {
    const { data, error } = await createAnonClient().auth.getUser(token);
    if (error) return '';
    return String(data?.user?.id || '').trim();
  } catch {
    return '';
  }
};

/**
 * Cloudinary 单张销毁。
 * `not found` 视为成功 —— 资产可能被别的清理路径（论坛删帖、图库整条删除）先删掉了，
 * 这时继续把它留在 pending 只会每天重试一次、永远卡住。
 */
const destroyAsset = async (publicId: string) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(
    `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`,
  );

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
    { method: 'POST', body: formData },
  );

  const data = await response.json().catch(() => ({}));
  const result = String(data?.result || '').toLowerCase();
  if (!response.ok || !['ok', 'not found'].includes(result)) {
    throw new Error(String(data?.error?.message || 'Cloudinary 删除失败'));
  }
};

type TrashRow = {
  id: string;
  public_id: string | null;
  purge_attempts: number | null;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return jsonResponse({ ok: false, code: 'CLOUDINARY_ENV_MISSING' }, 500);
  }

  const payload = await request.json().catch(() => ({}));
  const requestedIds = Array.isArray(payload?.ids)
    ? Array.from(
        new Set(payload.ids.map((value: unknown) => String(value || '').trim()).filter(Boolean)),
      ).slice(0, BATCH_LIMIT)
    : [];

  const trusted = hasTrustedAuthorization(request);
  // 普通用户只能「点名删除自己的行」：没有 ids 的调用（= 每日巡检）一律不给。
  let callerUserId = '';
  if (!trusted) {
    if (requestedIds.length === 0) {
      return jsonResponse({ ok: false, code: 'UNAUTHORIZED' }, 401);
    }
    callerUserId = await resolveCallerUserId(request);
    if (!callerUserId) {
      return jsonResponse({ ok: false, code: 'UNAUTHORIZED' }, 401);
    }
  }

  const serviceClient = createServiceClient();
  let query = serviceClient
    .from('boh_cloud_image_trash')
    .select('id, public_id, purge_attempts')
    .eq('state', 'pending');

  if (requestedIds.length > 0) {
    query = query.in('id', requestedIds);
    // 用户模式必须再加归属：ids 是客户端给的，不加就能销毁别人的图。
    if (callerUserId) query = query.eq('user_id', callerUserId);
  } else {
    query = query.lte('purge_after', new Date().toISOString());
  }

  const { data: rows, error: selectError } = await query
    .order('purge_after', { ascending: true })
    .limit(BATCH_LIMIT);

  if (selectError) {
    console.error('[purge-cloud-image-trash] select failed:', selectError);
    return jsonResponse({ ok: false, code: 'QUERY_FAILED' }, 500);
  }

  let purged = 0;
  let retried = 0;
  const failed: Array<{ id: string; message: string }> = [];

  for (const row of (rows || []) as TrashRow[]) {
    const id = String(row?.id || '').trim();
    const publicId = String(row?.public_id || '').trim();
    const attempts = Number(row?.purge_attempts || 0);

    if (!id) continue;

    // 没有 public_id 的行（历史脏数据）无法销毁资产，直接标 purged，避免永久占位。
    if (!publicId) {
      const { error } = await serviceClient
        .from('boh_cloud_image_trash')
        .update({ state: 'purged', purged_at: new Date().toISOString() })
        .eq('id', id)
        .eq('state', 'pending');
      if (!error) purged += 1;
      continue;
    }

    try {
      await destroyAsset(publicId);
      const { error } = await serviceClient
        .from('boh_cloud_image_trash')
        .update({ state: 'purged', purged_at: new Date().toISOString() })
        .eq('id', id)
        .eq('state', 'pending');
      if (error) throw error;
      purged += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloudinary 删除失败';
      failed.push({ id, message });
      retried += 1;

      const nextAttempts = attempts + 1;
      const { error: patchError } = await serviceClient
        .from('boh_cloud_image_trash')
        .update({ purge_attempts: nextAttempts })
        .eq('id', id)
        .eq('state', 'pending');

      if (patchError) console.error('[purge-cloud-image-trash] patch failed:', id, patchError);
      // 到上限只告警、不标 purged：标了就等于放弃销毁（资产变孤儿），
      // 而保留 pending 至少每次巡检都能在日志里看到它。
      if (nextAttempts >= MAX_ATTEMPTS) {
        console.warn('[purge-cloud-image-trash] asset destroy keeps failing:', {
          id,
          publicId,
          attempts: nextAttempts,
        });
      }
    }
  }

  return jsonResponse(
    {
      ok: failed.length === 0,
      mode: callerUserId ? 'user' : 'sweep',
      claimed: (rows || []).length,
      purged,
      retried,
      failed,
    },
    failed.length ? 207 : 200,
  );
});
