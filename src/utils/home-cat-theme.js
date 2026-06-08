import catUploading from '@/assets/images/theme-cats/cat-uploading.webp';
import catFailed from '@/assets/images/theme-cats/cat-failed.webp';
import catSuccess from '@/assets/images/theme-cats/cat-success.webp';
import catLike from '@/assets/images/theme-cats/cat-like.webp';
import catDecor1 from '@/assets/images/theme-cats/cat-decor-1.webp';
import catDelete from '@/assets/images/theme-cats/cat-delete.webp';
import catTheme from '@/assets/images/theme-cats/cat-theme.webp';
import catDecor2 from '@/assets/images/theme-cats/cat-decor-2.webp';
import catMobileGap from '@/assets/images/theme-cats/cat-mobile-gap.webp';
import catCardExtra from '@/assets/images/theme-cats/cat-card-extra.webp';

export const HOME_CAT_THEME = 'home-cat';

export const HOME_CAT_ASSETS = {
  uploading: catUploading,
  failed: catFailed,
  success: catSuccess,
  like: catLike,
  decor: catDecor1,
  delete: catDelete,
  theme: catTheme,
  decorAlt: catDecor2,
  mobileGap: catMobileGap,
  cardExtra: catCardExtra
};

export const HOME_CAT_POOLS = {
  ambient: ['decor', 'decorAlt', 'theme', 'mobileGap', 'cardExtra'],
  card: ['decor', 'decorAlt', 'theme', 'cardExtra', 'like'],
  background: ['decor', 'decorAlt', 'mobileGap', 'cardExtra'],
  state: ['uploading', 'success', 'failed', 'delete', 'theme'],
  reaction: ['like', 'success', 'theme', 'cardExtra']
};

const hashSeed = (seed = '') => {
  const text = String(seed || 'home-cat');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

export const getHomeCatTypeBySeed = (seed = '', pool = 'ambient', options = {}) => {
  const sourcePool = HOME_CAT_POOLS[pool] || HOME_CAT_POOLS.ambient;
  const excluded = new Set((options.exclude || []).filter(Boolean));
  const available = sourcePool.filter((type) => !excluded.has(type));
  const finalPool = available.length ? available : sourcePool;
  return finalPool[hashSeed(`${pool}:${seed}`) % finalPool.length] || 'decor';
};

export const getHomeCatAsset = (type = 'decor') => HOME_CAT_ASSETS[type] || HOME_CAT_ASSETS.decor;

export const isHomeCatTheme = (themeOrPreference) => themeOrPreference === HOME_CAT_THEME;
