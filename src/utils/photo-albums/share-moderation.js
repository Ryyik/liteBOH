/**
 * 分享前复审（设计文档 §8：上传即审 + 分享到社区前复审）
 *
 * 上传时的 NSFW 结果已落库（photo_album_photos.moderation_status）；
 * 开启社区分享时整集重新过一遍审核管线（云端优先，本地 nsfwjs 兜底），
 * 任一照片被拒则阻断分享。
 */

import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

let moderationPipelinePromise = null;

function loadModerationPipeline() {
  if (!moderationPipelinePromise) {
    moderationPipelinePromise = import('@/utils/image-moderation-pipeline.js');
  }
  return moderationPipelinePromise;
}

async function fetchPhotoFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`照片拉取失败（${response.status}）`);
  const blob = await response.blob();
  return new File([blob], `album-photo-${Date.now()}.webp`, { type: blob.type || 'image/webp' });
}

/**
 * @param {string} albumId
 * @param {object} [options] {onProgress?(done,total), signal}
 * @returns {Promise<{ok:boolean, rejected:number, error:string|null}>}
 */
export async function recheckAlbumForShare(albumId, options = {}) {
  try {
    const { data: photos, error } = await supabase
      .from('photo_album_photos')
      .select('id, cloudinary_url, moderation_status')
      .eq('album_id', albumId)
      .order('sort_order', { ascending: true });
    if (error) throw error;

    const list = photos || [];
    if (!list.length) {
      return { ok: false, rejected: 0, error: '影集还没有照片，先上传几张再分享吧' };
    }

    // 上传时已被拒的照片直接阻断，不再重检
    if (list.some((p) => p.moderation_status === 'rejected')) {
      return { ok: false, rejected: 1, error: '影集内有未通过安全检测的照片，请先移除后再分享' };
    }

    const { moderateImagesWithFallback } = await loadModerationPipeline();
    const files = [];
    for (const photo of list) {
      files.push(await fetchPhotoFile(photo.cloudinary_url));
      if (typeof options.onProgress === 'function') {
        options.onProgress(files.length, list.length);
      }
    }

    const results = await moderateImagesWithFallback(files, { signal: options.signal });
    const rejected = results.filter((r) => r?.status !== 'approved').length;
    if (rejected > 0) {
      return { ok: false, rejected, error: `复审未通过 ${rejected} 张照片，已阻止分享` };
    }
    return { ok: true, rejected: 0, error: null };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, rejected: 0, error: 'aborted' };
    }
    logger.warn('photo-albums-share', '分享前复审失败', error);
    return { ok: false, rejected: 0, error: '复审服务暂时不可用，请稍后再试' };
  }
}
