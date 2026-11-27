import { getLocalDayKey } from '@/utils/local-day-key.js';

export const FORUM_PROMO_DISMISS_PREFIX = 'boh-forum-promo-dismissed';
export const FORUM_CHECKIN_DISMISS_KEY = 'boh-forum-checkin-card-dismissed-week';

const BUILTIN_PROMO_COPY = {
  'christmas-xmas': {
    eyebrow: '圣诞活动',
    title: '圣诞交换礼物',
    subtitle: '挂上头像，随机配对。',
    ctaText: '立即参与',
    to: '/xmas',
    icon: 'gift',
  },
};

export const getLocalWeekStartKey = (date = new Date()) => {
  const source = date instanceof Date ? date : new Date(date);
  if (!(source instanceof Date) || Number.isNaN(source.getTime())) return '';
  const copy = new Date(source.getFullYear(), source.getMonth(), source.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return getLocalDayKey(copy);
};

export const getForumPromoDismissKey = (card) =>
  `${String(card?.id || '')}:${Math.max(1, Number(card?.version) || 1)}`;

export function buildForumPromoCard(item, heroes = []) {
  if (!item || item.kind !== 'hero' || !item.hero_id) return null;
  const hero = heroes.find((candidate) => candidate.id === item.hero_id);
  if (!hero) return null;

  const builtinCopy = hero.builtin_key ? BUILTIN_PROMO_COPY[hero.builtin_key] : null;
  const link = Array.isArray(hero.links) ? hero.links[0] : null;
  return {
    key: `promo:${item.id}`,
    id: item.id,
    type: 'promo',
    version: item.version,
    eyebrow: builtinCopy?.eyebrow || hero.eyebrow || item.label || '方块活动',
    title: builtinCopy?.title || hero.title || item.label || '方块活动',
    subtitle: builtinCopy?.subtitle || hero.subtitle || '',
    ctaText: builtinCopy?.ctaText || link?.text || '',
    to: builtinCopy?.to || link?.to || '',
    href: builtinCopy?.href || link?.href || '',
    icon: builtinCopy?.icon || 'sparkles',
    dismissible: true,
  };
}

export function buildForumCheckinCard({ weekStart } = {}) {
  const weekKey = String(weekStart || '').trim();
  if (!weekKey) return null;
  return {
    key: `checkin:${weekKey}`,
    type: 'checkin',
    eyebrow: '方块积分',
    title: '每周签到',
    subtitle: '本周还没签到，签到可得积分。',
    ctaText: '签到',
    icon: 'calendar',
    dismissible: true,
    weekKey,
  };
}
