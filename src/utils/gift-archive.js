const DEFAULT_ARCHIVE_MONTHS = 1;

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getArchiveThreshold = (months = DEFAULT_ARCHIVE_MONTHS, now = new Date()) => {
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - months);
  return threshold;
};

export const getGiftCompletedAt = (gift) => {
  if (!gift || gift.gift_status !== 'completed') return null;
  return toValidDate(gift.completed_at || gift.updated_at || gift.created_at);
};

export const isGiftExpiredCompleted = (gift, months = DEFAULT_ARCHIVE_MONTHS, now = new Date()) => {
  if (!gift?.is_active) return false;
  const completedAt = getGiftCompletedAt(gift);
  if (!completedAt) return false;
  return completedAt <= getArchiveThreshold(months, now);
};

export const getExpiredActiveGiftIds = (gifts, months = DEFAULT_ARCHIVE_MONTHS, now = new Date()) => {
  if (!Array.isArray(gifts)) return [];
  return gifts
    .filter((gift) => gift?.id && isGiftExpiredCompleted(gift, months, now))
    .map((gift) => gift.id);
};

export const markGiftsAsHistory = (gifts, giftIds = []) => {
  if (!Array.isArray(gifts)) return [];
  if (!Array.isArray(giftIds) || giftIds.length === 0) return gifts;
  const idSet = new Set(giftIds);
  return gifts.map((gift) => (idSet.has(gift.id) ? { ...gift, is_active: false } : gift));
};
