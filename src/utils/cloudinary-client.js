import { normalizeDbError } from './request-core.js';
import { supabase } from './supabase-client.js';
import {
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
  validateCloudinaryUploadResult,
  validateImageFileBeforeUpload
} from './cloud-upload-guard.js';

const CLOUDINARY_CLOUD_NAME = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
const DEFAULT_UPLOAD_PRESET = String(
  import.meta.env.VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET
  || import.meta.env.VITE_CLOUDINARY_NOTE_UPLOAD_PRESET
  || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  || ''
).trim();
const DEFAULT_FOLDER = String(
  import.meta.env.VITE_CLOUDINARY_CLOUD_PLUS_FOLDER
  || import.meta.env.VITE_CLOUDINARY_NOTE_FOLDER
  || 'boh-cloud-plus'
).trim();
const CLOUDINARY_UPLOAD_BASE_URL = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_BASE_URL || '').trim().replace(/\/+$/, '');
const CLOUDINARY_DELIVERY_BASE_URL = String(import.meta.env.VITE_CLOUDINARY_DELIVERY_BASE_URL || '').trim().replace(/\/+$/, '');

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

export function isCloudinaryNoteUploadConfigured() {
  return Boolean(CLOUDINARY_CLOUD_NAME && DEFAULT_UPLOAD_PRESET);
}

export function supportsCloudinaryClientDeleteToken(payload = {}) {
  return Boolean(String(payload?.delete_token || payload?.deleteToken || '').trim());
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

export async function uploadImageToCloudinary(file, options = {}) {
  try {
    await validateImageFileBeforeUpload(file);

    const uploadPreset = String(options.uploadPreset || DEFAULT_UPLOAD_PRESET).trim();
    const folder = String(options.folder || DEFAULT_FOLDER).trim();

    if (!uploadPreset) {
      throw new Error('缺少 Cloudinary 配置：请设置 VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET、VITE_CLOUDINARY_NOTE_UPLOAD_PRESET 或 VITE_CLOUDINARY_UPLOAD_PRESET');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    if (folder) {
      formData.append('folder', folder);
    }

    const response = await fetch(resolveUploadUrl('image'), {
      method: 'POST',
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || 'Cloudinary 上传失败');
    }
    validateCloudinaryUploadResult(data, {
      cloudName: CLOUDINARY_CLOUD_NAME,
      folder
    });

    return {
      url: String(data.secure_url || ''),
      publicId: String(data.public_id || ''),
      deleteToken: String(data.delete_token || ''),
      width: Number(data.width || 0),
      height: Number(data.height || 0),
      format: String(data.format || ''),
      originalFilename: stripFileExtension(data.original_filename || file.name)
    };
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

    const response = await fetch(resolveDeleteByTokenUrl(), {
      method: 'POST',
      body: formData,
      keepalive: Boolean(options.keepalive)
    });

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
