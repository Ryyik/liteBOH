import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';

const CLOUDINARY_CLOUD_NAME = String(Deno.env.get('CLOUDINARY_CLOUD_NAME') || '').trim();
const CLOUDINARY_API_KEY = String(Deno.env.get('CLOUDINARY_API_KEY') || '').trim();
const CLOUDINARY_API_SECRET = String(Deno.env.get('CLOUDINARY_API_SECRET') || '').trim();

const sha1Hex = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const normalizePublicIds = (publicIds: unknown) => {
  if (!Array.isArray(publicIds)) return [];
  return Array.from(new Set(
    publicIds
      .map((item) => String(item || '').trim())
      .filter((item) => (
        item
        && item.length <= 255
        && !item.startsWith('/')
        && !item.includes('..')
        && !item.includes('\\')
        && !item.includes(',')
      ))
      .slice(0, 50)
  ));
};

const normalizeResourceType = (resourceType: unknown) => {
  const safeResourceType = String(resourceType || 'image').trim().toLowerCase();
  return safeResourceType === 'image' ? 'image' : '';
};

const verifyUser = async (request: Request) => {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: '缺少登录凭证。' };
  }

  const anonClient = createAnonClient();
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, code: 'INVALID_SESSION', message: '登录状态已失效，请重新登录。' };
  }

  return { ok: true, userId: String(data.user.id || '').trim() };
};

const destroyAsset = async (publicId: string, resourceType = 'image') => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`);

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error?.message || 'Cloudinary 删除失败'));
  }

  return {
    publicId,
    result: String(data?.result || ''),
  };
};

type AssetContextResult =
  | { status: 'found'; contextUid: string }
  | { status: 'not_found' }
  | { status: 'error' };

// 查询 Cloudinary 资产上传时写入的 context（uid 归属标记）。
// GET /v1_1/{cloud}/resources/{resourceType}?public_ids[0]={publicId}
// 签名规则与 destroyAsset 一致：除 file/api_key/signature 外的参数按字母序 key=value 用 & 连接，
// 拼接 api_secret 后 sha1；GET 请求把 api_key/timestamp/signature 作为 query 参数。
const fetchAssetContext = async (publicId: string, resourceType: string): Promise<AssetContextResult> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(`public_ids[0]=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`);

  const query = new URLSearchParams();
  query.set('public_ids[0]', publicId);
  query.set('timestamp', String(timestamp));
  query.set('api_key', CLOUDINARY_API_KEY);
  query.set('signature', signature);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/${resourceType}?${query.toString()}`,
    );
  } catch {
    // 网络错误保守处理，由调用方拒绝删除
    return { status: 'error' };
  }

  const data = await response.json().catch(() => null);
  if (response.status === 404) return { status: 'not_found' };
  if (!response.ok || !data || !Array.isArray(data?.resources)) {
    const message = String(data?.error?.message || '').toLowerCase();
    if (message.includes('not found')) return { status: 'not_found' };
    return { status: 'error' };
  }

  const resources = data.resources as Array<Record<string, unknown>>;
  const asset = resources.find((item) => String(item?.public_id || '') === publicId);
  if (!asset) return { status: 'not_found' };

  const custom = (asset?.context as { custom?: Record<string, unknown> } | undefined)?.custom;
  return { status: 'found', contextUid: String(custom?.uid || '').trim() };
};

const filterOwnedCloudPublicIds = async (userId: string, publicIds: string[]) => {
  const serviceClient = createServiceClient();
  const ownedPublicIds: string[] = [];

  // 逐条查询避免 .or() 操作符的 JSONB contains 语义歧义
  // content_blocks 中的元素可能使用 publicId（camelCase）或 public_id（snake_case），分别查询
  for (const publicId of publicIds) {
    const orConditions = [
      `content_blocks.cs.${JSON.stringify({ publicId })}`,
      `content_blocks.cs.${JSON.stringify({ public_id: publicId })}`,
    ].join(',');

    const { data: entries, error } = await serviceClient
      .from('boh_cloud_entries')
      .select('id')
      .eq('user_id', userId)
      .or(orConditions)
      .limit(1);

    if (error) {
      throw error;
    }
    if (Array.isArray(entries) && entries.length > 0) {
      ownedPublicIds.push(publicId);
      continue;
    }

    const { data: pointsCardPreset, error: pointsCardPresetError } = await serviceClient
      .from('points_card_presets')
      .select('id')
      .eq('user_id', userId)
      .eq('image_public_id', publicId)
      .maybeSingle();

    if (pointsCardPresetError) {
      throw pointsCardPresetError;
    }
    if (pointsCardPreset?.id) {
      ownedPublicIds.push(publicId);
      continue;
    }

    const { data: pendingUpload, error: pendingUploadError } = await serviceClient
      .from('cloudinary_pending_uploads')
      .select('id')
      .eq('user_id', userId)
      .eq('public_id', publicId)
      .is('deleted_at', null)
      .maybeSingle();

    if (pendingUploadError) {
      throw pendingUploadError;
    }
    if (pendingUpload?.id) {
      ownedPublicIds.push(publicId);
    }
  }

  return ownedPublicIds;
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }, 405, origin);
  }

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return jsonResponse({ ok: false, code: 'CLOUDINARY_ENV_MISSING', message: '缺少 Cloudinary 服务端环境变量。' }, 500, origin);
  }

  const authResult = await verifyUser(request);
  if (!authResult.ok) {
    return jsonResponse(authResult, authResult.status, origin);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const publicIds = normalizePublicIds(body?.publicIds);
    const resourceType = normalizeResourceType(body?.resourceType);

    if (!publicIds.length) {
      return jsonResponse({ ok: false, code: 'INVALID_INPUT', message: '请提供至少一个 publicId。' }, 400, origin);
    }
    if (!resourceType) {
      return jsonResponse({ ok: false, code: 'INVALID_RESOURCE_TYPE', message: '仅支持删除图片资源。' }, 400, origin);
    }

    const ownedPublicIds = await filterOwnedCloudPublicIds(authResult.userId, publicIds);
    if (!ownedPublicIds.length) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN_PUBLIC_ID', message: '只能删除当前账号 Cloud+ 内容中已保存的图片。' }, 403, origin);
    }

    // 归属强验证：数据库归属可被伪造（用户可写表），以上传时写入 Cloudinary 的 context.uid 为准。
    // publicIds 已被 normalizePublicIds 截断为最多 50 个，逐个查询开销可控。
    const verifiedPublicIds: string[] = [];
    const contextFailed: Array<{ publicId: string; message: string }> = [];
    for (const publicId of ownedPublicIds) {
      const contextResult = await fetchAssetContext(publicId, resourceType);
      if (contextResult.status === 'found') {
        if (!contextResult.contextUid) {
          // 存量资产上传早于 context 标记上线：保持放行（存量过渡策略，待旧资产随清理自然消亡后可移除）
          verifiedPublicIds.push(publicId);
        } else if (contextResult.contextUid === authResult.userId) {
          verifiedPublicIds.push(publicId);
        } else {
          contextFailed.push({ publicId, message: '只能删除本账号上传的图片' });
        }
      } else if (contextResult.status === 'not_found') {
        contextFailed.push({ publicId, message: '图片不存在或已删除' });
      } else {
        // 网络或服务异常时保守拒绝，避免误删
        contextFailed.push({ publicId, message: '图片信息校验失败，请稍后重试' });
      }
    }

    const results = await Promise.allSettled(verifiedPublicIds.map((publicId) => destroyAsset(publicId, resourceType)));
    const deleted = [];
    const failed = [
      ...publicIds
        .filter((publicId) => !ownedPublicIds.includes(publicId))
        .map((publicId) => ({
          publicId,
          message: '只能删除当前账号 Cloud+ 内容中已保存的图片。',
        })),
      ...contextFailed,
    ];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        deleted.push(result.value);
        return;
      }
      failed.push({
        publicId: verifiedPublicIds[index],
        message: result.reason instanceof Error ? result.reason.message : 'Cloudinary 删除失败',
      });
    });

    return jsonResponse(
      {
        ok: failed.length === 0,
        deleted,
        failed,
        message: failed.length ? '部分图片删除失败。' : '图片删除成功。',
      },
      failed.length ? 207 : 200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'CLOUDINARY_DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Cloudinary 删除失败。',
      },
      500,
      origin,
    );
  }
});
