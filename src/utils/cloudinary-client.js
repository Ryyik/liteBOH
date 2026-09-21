import { normalizeDbError } from './request-core.js';
import { logger } from './logger.js';
import { supabase } from './supabase-client.js';
import {
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
  validateCloudinaryUploadResult,
  validateImageFileBeforeUpload
} from './cloud-upload-guard.js';

const CLOUDINARY_CLOUD_NAME = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dkqae7j1m').trim();
const DEFAULT_UPLOAD_PRESET = String(
  import.meta.env.VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET
  || import.meta.env.VITE_CLOUDINARY_NOTE_UPLOAD_PRESET
  || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  || 'BOHIMG'
).trim();
const DEFAULT_FOLDER = String(
  import.meta.env.VITE_CLOUDINARY_CLOUD_PLUS_FOLDER
  || import.meta.env.VITE_CLOUDINARY_NOTE_FOLDER
  || 'boh-cloud-plus'
).trim();
const CLOUDINARY_UPLOAD_BASE_URL = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_BASE_URL || '').trim().replace(/\/+$/, '');
const CLOUDINARY_DELIVERY_BASE_URL = String(import.meta.env.VITE_CLOUDINARY_DELIVERY_BASE_URL || 'https://cdn.blockofhome.cn').trim().replace(/\/+$/, '');

function resolveUploadUrl(resourceType = 'image') {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('缺少 Cloudinary 配置：请设置 VITE_CLOUDINARY_CLOUD_NAME');
  }
  const baseUrl = CLOUDINARY_UPLOAD_BASE_URL || 'https://api.cloudinary.com';
  return `${baseUrl}/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
}

function resolveDeleteByTokenUrl() {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('缺少 Cloudinary 配置：请设置 VITE_CLOUDINARY_CLOUD_NAME');
  }
  const baseUrl = CLOUDINARY_UPLOAD_BASE_URL || 'https://api.cloudinary.com';
  return `${baseUrl}/v1_1/${CLOUDINARY_CLOUD_NAME}/delete_by_token`;
}

function stripFileExtension(name = '') {
  return String(name || '').replace(/\.[^.]+$/, '').trim();
}

// Supabase-js 的 fetch 默认无超时：预检/取 uid 若连接挂起，调用方会无限等待
// （表现为上传按钮永久禁用、错误提示永不来）。race 一层超时兜底，孤儿请求完成后结果自然丢弃。
const SUPABASE_PRECHECK_TIMEOUT_MS = 10000;

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function uploadFormDataWithProgress(url, formData, options = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const timeoutId = window.setTimeout(() => request.abort(), 30000);
    const signal = options.signal;
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener?.('abort', abortRequest);
      callback();
    };
    const abortRequest = () => request.abort();

    request.open('POST', url, true);
    request.responseType = 'text';
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof options.onProgress !== 'function') return;
      options.onProgress(Math.max(0, Math.min(100, (event.loaded / event.total) * 100)));
    };
    request.onload = () => finish(() => {
      let data = {};
      try {
        data = JSON.parse(request.responseText || '{}');
      } catch {
        reject(new Error('Cloudinary 上传响应无效'));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        const error = new Error(data?.error?.message || 'Cloudinary 上传失败');
        error.status = request.status;
        reject(error);
        return;
      }
      resolve(data);
    });
    request.onerror = () => finish(() => reject(new Error('Cloudinary 上传失败')));
    request.onabort = () => finish(() => reject(new Error('Cloudinary 上传超时或已取消')));
    signal?.addEventListener?.('abort', abortRequest, { once: true });
    if (signal?.aborted) {
      abortRequest();
      return;
    }
    options.onProgress?.(0);
    request.send(formData);
  });
}

export function isCloudinaryNoteUploadConfigured() {
  return Boolean(CLOUDINARY_CLOUD_NAME && DEFAULT_UPLOAD_PRESET);
}

export function supportsCloudinaryClientDeleteToken(payload = {}) {
  return Boolean(String(payload?.delete_token || payload?.deleteToken || '').trim());
}

function normalizeCloudinaryPendingPublicIds(publicIds = []) {
  return Array.from(new Set(
    (Array.isArray(publicIds) ? publicIds : [publicIds])
      .map((item) => String(item?.publicId || item?.public_id || item || '').trim())
      .filter(Boolean)
  ));
}

function isMissingPendingUploadStoreError(error = {}) {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST202'
    || code === 'PGRST205'
    || message.includes('cloudinary_pending_uploads')
    || message.includes('could not find the table')
    || message.includes('could not find the function');
}

async function getCurrentSupabaseUserId() {
  // C1：getUser() 是一次 auth RTT，此前每张图上传要调 3 次（预检/uid/pending）。
  // 短 TTL 缓存 + 登录态变化时失效，把每图省出 2 次串行网络往返。
  const now = Date.now();
  if (cachedUserId && now - cachedUserIdAt < USER_ID_CACHE_TTL_MS) return cachedUserId;
  const { data } = await withTimeout(
    supabase.auth.getUser(),
    SUPABASE_PRECHECK_TIMEOUT_MS,
    '登录状态获取超时，请检查网络后重试'
  );
  cachedUserId = String(data?.user?.id || '').trim();
  cachedUserIdAt = now;
  return cachedUserId;
}

const USER_ID_CACHE_TTL_MS = 60000;
let cachedUserId = '';
let cachedUserIdAt = 0;
let authListenerAttached = false;
function attachAuthCacheInvalidation() {
  if (authListenerAttached || typeof supabase?.auth?.onAuthStateChange !== 'function') return;
  authListenerAttached = true;
  try {
    supabase.auth.onAuthStateChange(() => {
      cachedUserId = '';
      cachedUserIdAt = 0;
      uploadAllowCache.ts = 0;
    });
  } catch { /* 监听失败不影响主流程 */ }
}

// 仅测试使用：C1 缓存是模块级状态，跨用例会泄漏（userId/预检结果），
// 单测 beforeEach 必须重置，否则「未登录/限流」等分支无法到达
export function __resetCloudinaryUploadGuardsForTests() {
  cachedUserId = '';
  cachedUserIdAt = 0;
  uploadAllowCache.ts = 0;
  uploadAllowCache.promise = null;
}

export async function registerCloudinaryPendingUpload(uploaded = {}, options = {}) {
  const publicId = String(uploaded.publicId || uploaded.public_id || '').trim();
  if (!publicId) return { ok: true, skipped: true, error: null };

  try {
    const userId = await getCurrentSupabaseUserId();
    if (!userId) return { ok: true, skipped: true, error: null };

    const { error } = await supabase
      .from('cloudinary_pending_uploads')
      .upsert({
        user_id: userId,
        public_id: publicId,
        url: String(uploaded.url || uploaded.secure_url || '').trim(),
        resource_type: 'image',
        source: String(options.source || 'generic').trim().slice(0, 40) || 'generic',
        folder: String(options.folder || '').trim().slice(0, 255),
        claimed_at: null,
        deleted_at: null
      }, {
        onConflict: 'public_id'
      });

    if (error) {
      if (isMissingPendingUploadStoreError(error)) {
        return { ok: true, skipped: true, error: null };
      }
      throw error;
    }
    return { ok: true, skipped: false, error: null };
  } catch (error) {
    return { ok: false, skipped: false, error: normalizeDbError(error, 'Cloudinary 上传归属记录失败') };
  }
}

export async function markCloudinaryUploadsClaimed(publicIds = []) {
  const normalizedPublicIds = normalizeCloudinaryPendingPublicIds(publicIds);
  if (!normalizedPublicIds.length) return { ok: true, error: null };

  try {
    const userId = await getCurrentSupabaseUserId();
    if (!userId) return { ok: false, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };

    const { error } = await supabase
      .from('cloudinary_pending_uploads')
      .update({ claimed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('public_id', normalizedPublicIds)
      .is('deleted_at', null);

    if (error) {
      if (isMissingPendingUploadStoreError(error)) {
        return { ok: true, skipped: true, error: null };
      }
      throw error;
    }
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: normalizeDbError(error, 'Cloudinary 上传归属标记失败') };
  }
}

// C1：上传预检批缓存。此前逐图预检（每张一次 RPC RTT），N 张图多花 N-1 次
// 串行往返。服务端预检本质是限频计数，客户端 60s 结果复用风险极低；
// 仅缓存成功结果，失败（含限流）不缓存，in-flight 请求去重。
const UPLOAD_ALLOW_TTL_MS = 60000;
const uploadAllowCache = { ts: 0, promise: null };

export async function assertCloudinaryUploadAllowed(options = {}) {
  attachAuthCacheInvalidation();
  const userId = await getCurrentSupabaseUserId();
  if (!userId) return;

  const now = Date.now();
  if (now - uploadAllowCache.ts < UPLOAD_ALLOW_TTL_MS) return;
  if (uploadAllowCache.promise) return uploadAllowCache.promise;

  const request = (async () => {
    const { error } = await withTimeout(
      supabase.rpc('assert_cloudinary_upload_allowed', {
        p_source: String(options.source || 'generic').trim().slice(0, 40) || 'generic'
      }),
      SUPABASE_PRECHECK_TIMEOUT_MS,
      '上传预检超时，请检查网络后重试'
    );

    if (!error) {
      uploadAllowCache.ts = Date.now();
      return;
    }
    const message = String(error.message || '').toLowerCase();
    if (String(error.code || '').trim().toUpperCase() === 'PGRST202' || message.includes('could not find the function')) {
      uploadAllowCache.ts = Date.now();
      return;
    }
    throw error;
  })();

  uploadAllowCache.promise = request;
  try {
    await request;
  } finally {
    if (uploadAllowCache.promise === request) uploadAllowCache.promise = null;
  }
}

export function getCloudinaryDisplayUrl(url = '') {
  const safeUrl = String(url || '').trim();
  if (!safeUrl || !CLOUDINARY_DELIVERY_BASE_URL) return safeUrl;

  try {
    const parsed = new URL(safeUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return safeUrl;

    const deliveryBase = new URL(CLOUDINARY_DELIVERY_BASE_URL);
    return `${deliveryBase.origin}${parsed.pathname}${parsed.search}`;
  } catch (_error) {
    return safeUrl;
  }
}

export function getCloudinaryTransformedUrl(url = '', transformation = '') {
  const safeUrl = String(url || '').trim();
  const safeTransformation = String(transformation || '').trim().replace(/^\/+|\/+$/g, '');
  if (!safeUrl || !safeTransformation) {
    return getCloudinaryDisplayUrl(safeUrl);
  }

  try {
    const parsed = new URL(safeUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
      return getCloudinaryDisplayUrl(safeUrl);
    }

    const marker = '/image/upload/';
    const uploadIndex = parsed.pathname.indexOf(marker);
    if (uploadIndex < 0) {
      return getCloudinaryDisplayUrl(safeUrl);
    }

    const beforeUpload = parsed.pathname.slice(0, uploadIndex + marker.length);
    const afterUpload = parsed.pathname.slice(uploadIndex + marker.length).replace(/^\/+/, '');
    if (!afterUpload) {
      return getCloudinaryDisplayUrl(safeUrl);
    }

    if (afterUpload.startsWith(`${safeTransformation}/`)) {
      return getCloudinaryDisplayUrl(parsed.toString());
    }

    parsed.pathname = `${beforeUpload}${safeTransformation}/${afterUpload}`;
    return getCloudinaryDisplayUrl(parsed.toString());
  } catch (_error) {
    return getCloudinaryDisplayUrl(safeUrl);
  }
}

export function extractCloudinaryPublicIdFromUrl(url = '') {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return '';

  try {
    const parsed = new URL(safeUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const uploadIndex = segments.findIndex((segment) => segment === 'upload');
    if (uploadIndex < 0) return '';

    const assetSegments = segments.slice(uploadIndex + 1).filter((segment) => !/^v\d+$/.test(segment));
    if (!assetSegments.length) return '';

    const lastSegment = assetSegments[assetSegments.length - 1] || '';
    assetSegments[assetSegments.length - 1] = lastSegment.replace(/\.[^.]+$/, '');
    return assetSegments.join('/').trim();
  } catch (_error) {
    return '';
  }
}

/**
 * 向签名网关（cloudinary-sign-upload EF）索取上传参数。
 *
 * 三种结果，调用方必须区别对待：
 *   - signed       → 用服务端下发的 params + signature + api_key 上传（参数一律以服务端为准）
 *   - unsigned     → 沿用无签名上传（改造前的行为）
 *   - unavailable  → **仅** EF 未部署 / 网络故障；此时回落无签名，保证前端可先于 EF 上线
 *   - blocked      → EF 明确拒绝（未登录 401 / 额度 429 / 配置缺失 5xx）。
 *                    ⚠️ 绝不静默回落：配额类拒绝若悄悄降级成无签名上传，等于把刚堵上的洞又打开。
 */
export async function resolveCloudinaryUploadSignParams({ source = 'generic', folder = '', includeContext = true } = {}) {
  let response;
  try {
    response = await supabase.functions.invoke('cloudinary-sign-upload', {
      body: { source, folder, includeContext: includeContext !== false }
    });
  } catch (invokeError) {
    return { mode: 'unavailable', status: 0, reason: invokeError?.message || 'invoke_failed' };
  }

  const { data, error } = response || {};

  if (error) {
    const status = Number(error?.context?.status ?? error?.status ?? 0);
    let payload = null;
    try {
      payload = await error.context.json();
    } catch {
      payload = null;
    }

    if (status === 0 || status === 404 || status === 501) {
      return { mode: 'unavailable', status, reason: error?.message || 'edge_unavailable' };
    }

    return { mode: 'blocked', status, payload: payload || {} };
  }

  if (data?.mode === 'signed' && data?.signature && data?.params) {
    return {
      mode: 'signed',
      signature: String(data.signature),
      params: data.params,
      apiKey: String(data.apiKey || ''),
      cloudName: String(data.cloudName || CLOUDINARY_CLOUD_NAME)
    };
  }

  return { mode: 'unsigned' };
}

const buildSignBlockedError = (payload = {}) => {
  const error = new Error(String(payload.message || '图片上传暂不可用，请稍后再试。'));
  error.code = String(payload.code || 'UPLOAD_NOT_ALLOWED');
  error.status = 429;
  if (payload.retryAfter) {
    error.retryAfter = Number(payload.retryAfter);
  }
  return error;
};

export async function uploadImageToCloudinary(file, options = {}) {
  try {
    await validateImageFileBeforeUpload(file);

    const uploadPreset = String(options.uploadPreset || DEFAULT_UPLOAD_PRESET).trim();
    const folder = String(options.folder || DEFAULT_FOLDER).trim();

    if (!uploadPreset) {
      throw new Error('缺少 Cloudinary 配置：请设置 VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET、VITE_CLOUDINARY_NOTE_UPLOAD_PRESET 或 VITE_CLOUDINARY_UPLOAD_PRESET');
    }

    if (options.skipUploadPreflight !== true) {
      await assertCloudinaryUploadAllowed({
        source: options.pendingSource || options.source || 'generic'
      });
    }

    // 上传归属标记：cloudinary-delete Edge Function 会比对 context.uid 与登录用户，
    // 防止删除他人上传的图片；未登录时不上传 context
    const uploadUid = await getCurrentSupabaseUserId();

    const signSource = options.pendingSource || options.source || 'generic';

    // 签名模式：由 EF 下发签名。未切换时 mode='unsigned'，行为与改造前逐字节一致。
    const signRequest = await resolveCloudinaryUploadSignParams({
      source: signSource,
      folder,
      includeContext: true
    });

    if (signRequest.mode === 'blocked') {
      throw buildSignBlockedError(signRequest.payload);
    }

    const signedParams = signRequest.mode === 'signed' ? signRequest.params : null;
    // 服务端额度预检在 EF 内执行；这里让下游校验用服务端认定的 folder
    const effectiveFolder = String(signedParams?.folder || folder || '').trim();

    const buildUploadFormData = async (withContext) => {
      const formData = new FormData();
      formData.append('file', file);

      if (signedParams) {
        let params = signedParams;
        let signature = signRequest.signature;

        // 签名必须与所发参数逐字对应：降级去掉 context 时必须重新取一次签名，
        // 否则 signature 与 params 不匹配，Cloudinary 会拒。
        if (!withContext && signedParams.context) {
          const reFetched = await resolveCloudinaryUploadSignParams({
            source: signSource,
            folder,
            includeContext: false
          });
          if (reFetched.mode === 'signed') {
            params = reFetched.params;
            signature = reFetched.signature;
          }
        }

        Object.entries(params).forEach(([key, value]) => {
          formData.append(key, String(value));
        });
        formData.append('api_key', signRequest.apiKey);
        formData.append('signature', signature);
        return formData;
      }

      formData.append('upload_preset', uploadPreset);
      if (folder) {
        formData.append('folder', folder);
      }
      if (withContext && uploadUid) {
        formData.append('context', `uid=${uploadUid}`);
      }
      return formData;
    };

    const sendUploadRequest = async (formData) => {
      if (typeof options.onProgress === 'function' && typeof XMLHttpRequest !== 'undefined') {
        return uploadFormDataWithProgress(resolveUploadUrl('image'), formData, options);
      }
      const uploadController = new AbortController();
      const uploadTimeoutId = setTimeout(() => uploadController.abort(), 30000);
      let response;
      try {
        response = await fetch(resolveUploadUrl('image'), {
          method: 'POST',
          body: formData,
          signal: options.signal || uploadController.signal
        });
      } finally {
        clearTimeout(uploadTimeoutId);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data?.error?.message || 'Cloudinary 上传失败');
        error.status = response.status;
        throw error;
      }
      return data;
    };

    // C3：网络类失败自动重试（瞬时抖动/5xx/超时）。30s 超时 × 2 次尝试，
    // 最坏 ~60s 出结果——此前 60s×3 会静默卡 3 分钟，用户全程无反馈。
    // 4xx（鉴权/参数错误）不重试；unsigned 上传可安全重发，孤儿图由 pending 兜底清理收口。
    const isRetryableUploadError = (error) => {
      const message = String(error?.message || '');
      if (!error?.status) {
        return /failed to fetch|network|超时|已取消/.test(message) || message === 'Cloudinary 上传失败';
      }
      return error.status >= 500;
    };
    const sendUploadRequestWithRetry = async (formData) => {
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await sendUploadRequest(formData);
        } catch (error) {
          lastError = error;
          if (!isRetryableUploadError(error) || attempt === 1) throw error;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      throw lastError;
    };

    let data;
    try {
      data = await sendUploadRequestWithRetry(await buildUploadFormData(true));
    } catch (error) {
      // 降级保护：upload preset 不允许 context 参数时（如 unsigned 上传被拒），去掉 context 重试一次
      if (uploadUid && /context|not allowed|unsigned/i.test(String(error?.message || ''))) {
        data = await sendUploadRequestWithRetry(await buildUploadFormData(false));
      } else {
        throw error;
      }
    }
    validateCloudinaryUploadResult(data, {
      cloudName: CLOUDINARY_CLOUD_NAME,
      folder: effectiveFolder
    });

    const uploaded = {
      url: String(data.secure_url || ''),
      publicId: String(data.public_id || ''),
      deleteToken: String(data.delete_token || ''),
      width: Number(data.width || 0),
      height: Number(data.height || 0),
      format: String(data.format || ''),
      originalFilename: stripFileExtension(data.original_filename || file.name)
    };

    const pendingSource = String(options.pendingSource || '').trim();
    if (options.registerPendingUpload !== false && pendingSource) {
      // C2：归属记账移出关键路径。此前 pending 登记（1 次 auth RTT + 1 次 upsert RTT）
      // 失败会让整张上传报错——它只是兜底清理的记账，不该阻断。
      // 并行执行不阻塞返回；登记通常在发帖 RPC 前完成，远早于兜底清理时限，误删风险可忽略。
      void registerCloudinaryPendingUpload(uploaded, { source: pendingSource, folder })
        .then((pendingResult) => {
          if (!pendingResult?.ok) {
            logger.warn('cloudinary', '上传归属登记失败（不阻断，由兜底清理覆盖）', pendingResult?.error);
          }
        })
        .catch((error) => logger.warn('cloudinary', '上传归属登记异常（不阻断）', error));
    }

    return uploaded;
  } catch (error) {
    throw normalizeDbError(error, 'Cloudinary 上传失败');
  }
}

export async function deleteCloudinaryAssetByToken(deleteToken, options = {}) {
  try {
    const token = String(deleteToken || '').trim();
    if (!token) {
      throw new Error('缺少 Cloudinary delete token，无法从云端删除图片');
    }

    const formData = new FormData();
    formData.append('token', token);

    const deleteController = new AbortController();
    const deleteTimeoutId = setTimeout(() => deleteController.abort(), 30000);
    let response;
    try {
      response = await fetch(resolveDeleteByTokenUrl(), {
        method: 'POST',
        body: formData,
        keepalive: Boolean(options.keepalive),
        signal: deleteController.signal
      });
    } finally {
      clearTimeout(deleteTimeoutId);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || 'Cloudinary 云端删除失败');
    }

    return {
      ok: true,
      result: String(data.result || ''),
      partial: Boolean(data.partial)
    };
  } catch (error) {
    throw normalizeDbError(error, 'Cloudinary 云端删除失败');
  }
}

export async function deleteCloudinaryAssetsByPublicIds(publicIds = [], options = {}) {
  try {
    const normalizedPublicIds = Array.from(new Set(
      (Array.isArray(publicIds) ? publicIds : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));

    if (!normalizedPublicIds.length) {
      return { ok: true, data: { deleted: [], failed: [] }, error: null };
    }

    const { data, error } = await supabase.functions.invoke('cloudinary-delete', {
      body: {
        publicIds: normalizedPublicIds,
        resourceType: String(options.resourceType || 'image').trim() || 'image'
      }
    });

    if (error) {
      throw error;
    }

    return {
      ok: Boolean(data?.ok),
      data: data || { deleted: [], failed: [] },
      error: data?.ok ? null : normalizeDbError({ message: data?.message || 'Cloudinary 云端删除失败', code: data?.code || 'CLOUDINARY_DELETE_FAILED' })
    };
  } catch (error) {
    return { ok: false, data: null, error: normalizeDbError(error, 'Cloudinary 云端删除失败') };
  }
}

export { CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES };
