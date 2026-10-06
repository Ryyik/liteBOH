/**
 * display.js — 面向 prompt / 展示的日期与周期格式化
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 */
import { normalizePromptLine } from '../text/normalize.js';

export const formatPromptDate = (value, fallback = '未知') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizePromptLine(value, 32) || fallback;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatPromptDateTime = (value, fallback = '未知') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizePromptLine(value, 40) || fallback;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const parseBirthdayValue = (monthText, dayText) => {
  const month = Number(String(monthText || '').trim());
  const day = Number(String(dayText || '').trim());
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
};

export const getBirthdayCountdown = (monthText, dayText) => {
  const parsed = parseBirthdayValue(monthText, dayText);
  if (!parsed) return null;

  const now = new Date();
  const year = now.getFullYear();
  let nextBirthday = new Date(year, parsed.month - 1, parsed.day, 0, 0, 0, 0);
  if (Number.isNaN(nextBirthday.getTime())) return null;

  if (nextBirthday < new Date(year, now.getMonth(), now.getDate(), 0, 0, 0, 0)) {
    nextBirthday = new Date(year + 1, parsed.month - 1, parsed.day, 0, 0, 0, 0);
  }

  const diffMs =
    nextBirthday.getTime() -
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const days = Math.max(0, Math.round(diffMs / 86400000));
  return {
    month: parsed.month,
    day: parsed.day,
    nextDate: formatPromptDate(nextBirthday, '未知'),
    daysUntil: days,
  };
};

export const formatBillingCycleLabel = (cycle) => {
  const normalized = String(cycle || '')
    .toLowerCase()
    .trim();
  if (normalized === 'yearly') return '年付';
  if (normalized === 'monthly') return '月付';
  return '未知';
};
