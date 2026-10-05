/**
 * 头像存储层 —— avatars bucket 的上传与清理
 *
 * 收敛自 ProfileMain / UserSpaceMain / Join 三处逐字重复的实现（第 1 批「avatars 三份拷贝」）。
 * 这里**只管 storage 读写与压缩档位**，不碰 profile 持久化、不碰提示 UI —— 那三处本来就不同：
 * Join 注册期还没有 profile 可写（只回传 url/filePath），ProfileMain 取 profile.avatar_url、
 * UserSpaceMain 取 avatarUrl，toast 也各用各的（showAlert / showTopNavStatus）。
 *
 * 唯一真源（改这里 = 三处一起改）：
 *   · 落库的是**压缩后的小图**：512px webp（展示上限 256 CSS px × 2 DPR，见
 *     docs/2026-09-29-加载速度与提速全面评测报告.md §4.1——385KB 原图直出是首访最大字节项）
 *   · 路径   `${userId}/avatar_${timestamp}.${ext}`，ext/contentType 跟随压缩产物的真实类型
 *   · 公开 URL 末尾带 `?t=${timestamp}` 破浏览器缓存
 *   · bucket 'avatars' + cacheControl 3600
 *
 * 落点说明：放在 utils/api/ 而不是 composables/ —— 它是纯数据层函数（无 Vue 响应式），
 * 且这样才符合「只有 utils/api 与 stores 可直接引 supabase-client」的分层目标。
 */
import { supabase } from '@/utils/supabase-client.js';
import { compressImageFileToUploadLimit } from '@/utils/image-compression.js';

const AVATAR_BUCKET = 'avatars';
const AVATAR_CACHE_CONTROL = '3600';

// 压缩档位唯一真源：全站头像展示最大 256px（utils/avatar.js lg 档），×2 DPR 取 512。
// 512px webp 实测 ≈15-40KB，对比改造前 800px PNG 的 avg 315KB。
export const AVATAR_UPLOAD_MAX_DIM = 512;
export const AVATAR_UPLOAD_TARGET_MB = 0.5;

const AVATAR_EXT_BY_MIME = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

const buildAvatarPath = (userId, timestamp, ext) => `${userId}/avatar_${timestamp}.${ext}`;

/**
 * 压缩到头像档位（512px webp）。走 image-compression.js 的统一封装：
 * 同源 worker libURL（防 jsdelivr CDN 在大陆挂起）+ 超时兜底 + webp 输出。
 * 三个上传入口（Join / ProfileMain / UserSpaceMain）都必须经它，不许自带第二份参数。
 */
export async function prepareAvatarUpload(file) {
  return compressImageFileToUploadLimit(
    file,
    {},
    {
      targetSizeMB: AVATAR_UPLOAD_TARGET_MB,
      maxWidthOrHeight: AVATAR_UPLOAD_MAX_DIM,
    },
  );
}

/**
 * 从公开 URL 反解出 bucket 内路径。
 * URL 形如 .../storage/v1/object/public/avatars/USER_ID/avatar_TS.png?t=...
 * 非法 URL 或非 avatars 路径一律返回 null（调用方据此跳过清理，不视为错误）。
 */
export function extractAvatarPath(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const pathParts = new URL(url).pathname.split('/');
    const avatarsIndex = pathParts.indexOf(AVATAR_BUCKET);
    if (avatarsIndex === -1) return null;
    return pathParts.slice(avatarsIndex + 1).join('/') || null;
  } catch {
    return null;
  }
}

/**
 * 上传头像文件，返回可直接落库的 URL。
 * 失败时**抛出** storage error，由调用方决定提示文案与是否回滚。
 *
 * @param {File|Blob} file
 * @param {string} userId
 * @returns {Promise<{url: string, filePath: string, timestamp: number}>}
 */
export async function uploadAvatarFile(file, userId) {
  const timestamp = Date.now();
  const ext = AVATAR_EXT_BY_MIME[file?.type] || 'png';
  const contentType = file?.type || 'image/png';
  const filePath = buildAvatarPath(userId, timestamp, ext);

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, file, {
    contentType,
    cacheControl: AVATAR_CACHE_CONTROL,
  });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

  return { url: `${publicUrl}?t=${timestamp}`, filePath, timestamp };
}

/**
 * 按路径删除头像。**不抛错** —— 旧头像清理属非致命操作，失败不该打断主流程。
 * @returns {Promise<object|null>} storage error 或 null
 */
export async function removeAvatarByPath(filePath) {
  if (!filePath) return null;
  try {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([filePath]);
    return error ?? null;
  } catch (error) {
    return error ?? new Error('remove avatar failed');
  }
}

/**
 * 按 URL 删除头像。
 * @param {string} url 旧头像 URL
 * @param {{exclude?: string}} [options] exclude 传新文件路径 —— 新旧同一文件时不删（保留原守卫）
 * @returns {Promise<object|null>} storage error 或 null
 */
export async function removeAvatarByUrl(url, { exclude = '' } = {}) {
  const filePath = extractAvatarPath(url);
  if (!filePath || filePath === exclude) return null;
  return removeAvatarByPath(filePath);
}
