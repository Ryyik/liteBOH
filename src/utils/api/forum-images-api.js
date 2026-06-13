import { supabase } from '../supabase-client.js';
import { normalizeDbError } from '../request-core.js';
import { logger } from '../logger.js';
import {
  assertCloudinaryUploadAllowed,
  deleteCloudinaryAssetByToken,
  deleteCloudinaryAssetsByPublicIds,
  uploadImageToCloudinary
} from '../cloudinary-client.js';
import {
  APPROVED_STATUS,
  FORUM_ALLOWED_IMAGE_MIME_TYPES,
  FORUM_CLOUDINARY_FOLDER,
  FORUM_IMAGE_MAX_SIZE_BYTES,
  FORUM_IMAGE_MAX_SIZE_MB,
  normalizeForumImage,
  normalizeForumImageUploadError,
  normalizeForumImages
} from './forum-format.js';

let forumImageModerationModulePromise = null;

async function loadForumImageModeration() {
  if (!forumImageModerationModulePromise) {
    forumImageModerationModulePromise = import('../forum-image-moderation.js');
  }
  try {
    return await forumImageModerationModulePromise;
  } catch (error) {
    forumImageModerationModulePromise = null;
    throw error;
  }
}

export async function preloadForumImageModeration() {
  try {
    const { preloadForumImageModerationModel } = await loadForumImageModeration();
    if (typeof preloadForumImageModerationModel !== 'function') {
      return { ok: false, skipped: true, error: null };
    }
    await preloadForumImageModerationModel();
    return { ok: true, skipped: false, error: null };
  } catch (error) {
    logger.warn('forum-images-api', '论坛图片安全检测模型预加载失败（不阻断发帖）', error);
    return { ok: false, skipped: false, error: normalizeDbError(error, '图片安全检测模型预加载失败') };
  }
}

export async function uploadForumImage(file) {
  try {
    if (!file || typeof file !== 'object') {
      throw new Error('请选择有效的图片文件');
    }

    const mimeType = String(file.type || '').trim().toLowerCase();
    if (!FORUM_ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error('论坛图片仅支持 PNG、JPG 或 WebP，暂不开放 GIF');
    }
    if (Number(file.size || 0) > FORUM_IMAGE_MAX_SIZE_BYTES) {
      throw new Error(`单张论坛图片大小不能超过 ${FORUM_IMAGE_MAX_SIZE_MB}MB`);
    }

    await assertCloudinaryUploadAllowed({ source: 'forum' });

    const { moderateForumImageFile } = await loadForumImageModeration();
    const moderation = await moderateForumImageFile(file);
    if (moderation.status !== APPROVED_STATUS) {
      throw new Error(moderation.reason || '图片未通过安全检测');
    }

    const uploaded = await uploadImageToCloudinary(file, {
      folder: FORUM_CLOUDINARY_FOLDER,
      pendingSource: 'forum',
      skipUploadPreflight: true
    });

    return {
      ok: true,
      data: normalizeForumImage({
        ...uploaded,
        moderationStatus: APPROVED_STATUS,
        moderationScore: moderation.score || 0,
        moderationReason: moderation.reason || 'NSFWJS 预筛通过'
      }),
      error: null,
      moderation
    };
  } catch (error) {
    logger.warn('forum-images-api', '论坛图片上传/预筛失败', error);
    return { ok: false, data: null, error: normalizeForumImageUploadError(error) };
  }
}

export async function deleteUploadedForumImage(image = {}) {
  const deleteToken = String(image?.deleteToken || image?.delete_token || '').trim();
  const publicId = String(image?.publicId || image?.public_id || '').trim();

  try {
    if (deleteToken) {
      await deleteCloudinaryAssetByToken(deleteToken, { keepalive: true });
      return { ok: true, error: null };
    }
    if (publicId) {
      const result = await deleteCloudinaryAssetsByPublicIds([publicId]);
      return { ok: result.ok, error: result.error };
    }
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('forum-images-api', '清理未提交的论坛图片失败（不阻断）', error);
    return { ok: false, error: normalizeDbError(error) };
  }
}

export async function getForumPostImages(postId) {
  const safePostId = String(postId || '').trim();
  if (!safePostId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '缺少帖子 ID' }) };
  }

  const { data, error } = await supabase
    .from('forum_post_images')
    .select('id, url, public_id, width, height, format, sort_order')
    .eq('post_id', safePostId)
    .eq('moderation_status', APPROVED_STATUS)
    .order('sort_order', { ascending: true });

  return {
    ok: !error,
    data: normalizeForumImages(data || []),
    error: normalizeDbError(error)
  };
}
