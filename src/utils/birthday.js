const toSafeInteger = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  return Math.trunc(normalized);
};

export const normalizeBirthday = (month, day) => {
  const safeMonth = toSafeInteger(month);
  const safeDay = toSafeInteger(day);

  if (!safeMonth || !safeDay || safeMonth < 1 || safeMonth > 12 || safeDay < 1) {
    return null;
  }

  const maxDay = new Date(2024, safeMonth, 0).getDate();
  if (safeDay > maxDay) return null;

  return {
    month: safeMonth,
    day: safeDay
  };
};

export const isBirthdayToday = (month, day, now = new Date()) => {
  const birthday = normalizeBirthday(month, day);
  if (!birthday || !(now instanceof Date) || Number.isNaN(now.getTime())) return false;

  return birthday.month === now.getMonth() + 1 && birthday.day === now.getDate();
};

export const getNextBirthdayDistance = (month, day, now = new Date()) => {
  const birthday = normalizeBirthday(month, day);
  if (!birthday || !(now instanceof Date) || Number.isNaN(now.getTime())) {
    return null;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let nextDate = new Date(today.getFullYear(), birthday.month - 1, birthday.day);

  if (nextDate < today) {
    nextDate = new Date(today.getFullYear() + 1, birthday.month - 1, birthday.day);
  }

  const daysUntil = Math.round((nextDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  return {
    ...birthday,
    daysUntil,
    nextDate
  };
};
