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
/** ids 列表的体积上限：正常一屏最多几十个 id，64KB 已足够宽松（见下方鉴权前的体积闸门）。 */
const MAX_BODY_BYTES = 64 * 1024;

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
  user_id: string | null;
  public_id: string | null;
  purge_attempts: number | null;
};

/**
 * 归属登记表：cloudinary_pending_uploads 在上传成功时按 (user_id, public_id) 落一行
 * （见 src/utils/cloudinary-client.js 的 upsert），是「这张图是谁传的」在服务端的
 * 唯一证据。批量查一次，避免每行一次往返。
 */
const loadUploadOwners = async (
  serviceClient: ReturnType<typeof createServiceClient>,
  publicIds: string[],
) => {
  const owners = new Map<string, string>();
  const unique = Array.from(new Set(publicIds.filter(Boolean)));
  if (unique.length === 0) return owners;

  const { data, error } = await serviceClient
    .from('cloudinary_pending_uploads')
    .select('public_id, user_id')
    .in('public_id', unique);

  if (error) throw error;
  for (const row of data || []) {
    owners.set(String(row.public_id || ''), String(row.user_id || ''));
  }
  return owners;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return jsonResponse({ ok: false, code: 'CLOUDINARY_ENV_MISSING' }, 500);
  }

  /* 鉴权之前先卡体积（2026-11-05 审查补）：原来是直接 `await request.json()`，
     任何能发 POST 的人（不必有 key）都能用一个超大 body 打内存。
     ids 也先按 BATCH_LIMIT 裁剪再去重 —— 反过来写，Set 会先把整份数组展开。 */
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, 413);
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, 413);
  }
  let payload: { ids?: unknown[] } = {};
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    payload = {};
  }

  const requestedIds = Array.isArray(payload?.ids)
    ? Array.from(
        new Set(
          payload.ids
            .slice(0, BATCH_LIMIT)
            .map((value: unknown) => String(value || '').trim())
            .filter(Boolean),
        ),
      )
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
    .select('id, user_id, public_id, purge_attempts')
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
  let skipped = 0;
  const failed: Array<{ id: string; message: string }> = [];

  /* 归属闸门（2026-11-05 审查补，本次改动的核心）：
     public_id 来自用户可写的 content_blocks（上传守卫只校验格式，不校验归属），
     所以「行是我的」不等于「图是我的」。销毁前必须证明这张图是我传的 ——
     证据只有 cloudinary_pending_uploads 的登记行。
       · 登记在别人名下      ⇒ ownership_mismatch，绝不销毁
       · 查不到登记行（旧资产）⇒ ownership_unverified，也不销毁
     两种都标 state='skipped'（迁移 2026110516），让它们退出 pending 扫描、不再
     每天重试，同时在表里留下可排查的痕迹。宁可留孤儿资产，不能误删别人的图。 */
  let uploadOwners = new Map<string, string>();
  try {
    uploadOwners = await loadUploadOwners(
      serviceClient,
      ((rows || []) as TrashRow[]).map((row) => String(row?.public_id || '').trim()),
    );
  } catch (error) {
    // 查不到归属就不敢销毁任何东西：整批按失败返回，巡检明天再来。
    console.error('[purge-cloud-image-trash] ownership lookup failed:', error);
    return jsonResponse({ ok: false, code: 'OWNERSHIP_LOOKUP_FAILED' }, 500);
  }

  const markSkipped = async (id: string, reason: string) => {
    const { error } = await serviceClient
      .from('boh_cloud_image_trash')
      .update({ state: 'skipped', skipped_reason: reason })
      .eq('id', id)
      .eq('state', 'pending');
    if (error) {
      console.error('[purge-cloud-image-trash] mark skipped failed:', id, error);
      return false;
    }
    console.warn('[purge-cloud-image-trash] asset NOT destroyed (ownership):', { id, reason });
    return true;
  };

  for (const row of (rows || []) as TrashRow[]) {
    const id = String(row?.id || '').trim();
    const publicId = String(row?.public_id || '').trim();
    const ownerUserId = String(row?.user_id || '').trim();
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
      const owner = uploadOwners.get(publicId) || '';
      if (!owner) {
        if (await markSkipped(id, 'ownership_unverified')) skipped += 1;
        continue;
      }
      if (owner !== ownerUserId) {
        if (await markSkipped(id, 'ownership_mismatch')) skipped += 1;
        continue;
      }

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

  /* 用户模式下的 skipped 也要算「没成功」：资产确实还在，不能回 ok:true 让前端
     提示「已永久删除」。巡检模式同理不计入 failed（那是管理面日志的事，
     每天把同一批 skipped 当失败返 207 只会让监控噪声）—— 但会在 skipped 里报数。 */
  const userFailed = Boolean(callerUserId) && skipped > 0;
  return jsonResponse(
    {
      ok: failed.length === 0 && !userFailed,
      mode: callerUserId ? 'user' : 'sweep',
      claimed: (rows || []).length,
      purged,
      retried,
      skipped,
      failed,
    },
    failed.length || userFailed ? 207 : 200,
  );
});
