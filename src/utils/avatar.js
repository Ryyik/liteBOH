/**
 * 头像 URL 优化工具
 * 将头像 URL 通过 Cloudinary transform 按需裁剪，避免列表页加载全尺寸原图
 */
import { getCloudinaryTransformedUrl } from './cloudinary-client.js';

// 头像尺寸预设
const AVATAR_SIZES = {
  xs: 32,   // 列表小头像
  sm: 48,   // 常规列表头像
  md: 96,   // 详情页头像
  lg: 256,  // 大头像
};

/**
 * 获取优化后的头像 URL
 * @param {string} url - 原始头像 URL
 * @param {'xs'|'sm'|'md'|'lg'} size - 尺寸预设
 * @returns {string} 优化后的 URL（非 Cloudinary 图片返回原 URL）
 */
export function getAvatarUrl(url, size = 'sm') {
  if (!url || typeof url !== 'string') return '';
  const px = AVATAR_SIZES[size] || AVATAR_SIZES.sm;
  // Cloudinary transform: 自动格式+质量+裁剪+聚焦面部
  const transform = `f_auto,q_auto:good,c_thumb,g_face,w_${px},h_${px}`;
  return getCloudinaryTransformedUrl(url, transform);
}
