/**
 * 摄影集配额（按订阅 tier，仿 useLabQuota 的 TIER_QUOTA_MAP 模式）
 *
 * 硬约束（设计文档 §8）：超限阻断 + 升级提示，不做降级。
 * - ALBUM_QUOTA_MAP   可创建影集数
 * - PHOTOS_QUOTA_MAP  单个影集照片数
 * - EXPORT_QUOTA_MAP  每月离线导出次数（导出计入配额，见设计文档 §7）
 */

import { supabase } from '@/utils/supabase-client.js';
import { useUserTier } from '@/composables/useUserTier.js';

export const ALBUM_QUOTA_MAP = {
  free: 1,
  plus: 3,
  pro: 5,
  max: 10,
  ultra: -1
};

export const PHOTOS_QUOTA_MAP = {
  free: 12,
  plus: 24,
  pro: 40,
  max: 60,
  ultra: -1
};

export const EXPORT_QUOTA_MAP = {
  free: 2,
  plus: 5,
  pro: 10,
  max: 20,
  ultra: -1
};

const NEXT_TIER_MAP = { free: 'plus', plus: 'pro', pro: 'max', max: 'ultra' };

function quotaOf(map, tier) {
  return Object.prototype.hasOwnProperty.call(map, tier) ? map[tier] : map.free;
}

export async function fetchMyTier() {
  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id;
  if (!userId) return 'free';
  const { fetchUserTier } = useUserTier();
  const tier = await fetchUserTier(userId);
  return tier || 'free';
}

export function albumQuotaFor(tier) {
  return quotaOf(ALBUM_QUOTA_MAP, tier);
}

export function photosQuotaFor(tier) {
  return quotaOf(PHOTOS_QUOTA_MAP, tier);
}

export function exportQuotaFor(tier) {
  return quotaOf(EXPORT_QUOTA_MAP, tier);
}

export function buildUpgradeHint(tier, what) {
  const nextTier = NEXT_TIER_MAP[tier];
  if (!nextTier) return `${what}已达当前档位上限`;
  return `升级到 ${nextTier.toUpperCase()} 可获得更多${what}`;
}

/**
 * 影集数配额校验
 * @returns {Promise<{allowed:boolean, used:number, limit:number, hint:string}>}
 */
export async function checkAlbumCountQuota() {
  const tier = await fetchMyTier();
  const limit = albumQuotaFor(tier);
  const { count, error } = await supabase
    .from('photo_albums')
    .select('id', { count: 'exact', head: true });
  const used = error ? 0 : Number(count || 0);
  if (limit === -1) return { allowed: true, used, limit, hint: '' };
  return {
    allowed: used < limit,
    used,
    limit,
    hint: used >= limit ? buildUpgradeHint(tier, '影集数量') : ''
  };
}

/**
 * 单集照片数配额校验（新增 countOfPhotos 张是否放行）
 */
export async function checkPhotoQuota(albumId, countOfPhotos = 1) {
  const tier = await fetchMyTier();
  const limit = photosQuotaFor(tier);
  if (limit === -1) return { allowed: true, used: 0, limit, hint: '' };
  const { count, error } = await supabase
    .from('photo_album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('album_id', albumId);
  const used = error ? 0 : Number(count || 0);
  return {
    allowed: used + countOfPhotos <= limit,
    used,
    limit,
    hint: used + countOfPhotos > limit ? buildUpgradeHint(tier, '单集照片数') : ''
  };
}

/**
 * 导出配额校验（导出前调用）
 */
export async function checkExportQuota() {
  const tier = await fetchMyTier();
  const limit = exportQuotaFor(tier);
  if (limit === -1) return { allowed: true, used: 0, limit, hint: '' };
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('photo_album_exports')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart.toISOString());
  const used = error ? 0 : Number(count || 0);
  return {
    allowed: used < limit,
    used,
    limit,
    hint: used >= limit ? buildUpgradeHint(tier, '本月导出次数') : ''
  };
}
