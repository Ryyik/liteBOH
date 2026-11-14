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
    day: safeDay,
  };
};

/**
 * 今天是不是这个人的生日。
 *
 * ⚠️ 判据与生日页 / 生日邮件一致：**北京时间**（`getShanghaiDate`）。
 * 2026-11-14 前这里用设备本地时区，而 `/birthday` 页与 `boh_enqueue_birthday_mails()`
 * 都用 Asia/Shanghai ⇒ 海外用户在 UTC 凌晨会看到「首页说今天我生日、生日页把我排在明天」。
 * 三处（首页英雄区 / 生日页 / 邮件）必须是同一个「今天」。
 */
export const isBirthdayToday = (month, day, now = new Date()) => {
  const birthday = normalizeBirthday(month, day);
  if (!birthday || !(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  const today = getShanghaiDate(now);
  if (!today) return false;

  return birthday.month === today.month && birthday.day === today.day;
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad2 = (value) => String(value).padStart(2, '0');
const isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/**
 * 北京时间的「今天」（UTC+8，中国无夏令时，固定偏移即可）。
 *
 * 为什么不直接 new Date().getMonth()：生日页和生日邮件必须同一口径，
 * 而邮件侧用的是 `(now() at time zone 'Asia/Shanghai')::date`。
 * 用本地时区算的话，海外访问者/UTC 凌晨会差一天，出现「明明今天生日却显示倒计时 364 天」。
 */
export const getShanghaiDate = (now = new Date()) => {
  const ms = now instanceof Date ? now.getTime() : NaN;
  if (Number.isNaN(ms)) return null;
  const shifted = new Date(ms + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

/**
 * 下一次生日（含今天），按北京时间算。
 *
 * 2/29 出生的人在平年落到 2/28 —— 与 `boh_enqueue_birthday_mails()` 同口径，
 * 否则闰日出生的人四年才被点亮三次。
 *
 * @returns {{ year:number, month:number, day:number, date:string, daysUntil:number, isToday:boolean } | null}
 */
export const getNextCelebration = (month, day, now = new Date()) => {
  const birthday = normalizeBirthday(month, day);
  const today = getShanghaiDate(now);
  if (!birthday || !today) return null;

  const toDayMs = (d) => Date.UTC(d.year, d.month - 1, d.day);
  const resolveInYear = (year) => ({
    year,
    month: birthday.month,
    // 平年的 2/29 落到 2/28
    day: birthday.month === 2 && birthday.day === 29 && !isLeapYear(year) ? 28 : birthday.day,
  });

  const todayMs = toDayMs(today);
  let candidate = resolveInYear(today.year);
  if (toDayMs(candidate) < todayMs) candidate = resolveInYear(today.year + 1);

  const daysUntil = Math.round((toDayMs(candidate) - todayMs) / DAY_MS);

  return {
    ...candidate,
    date: `${candidate.year}-${pad2(candidate.month)}-${pad2(candidate.day)}`,
    daysUntil,
    isToday: daysUntil === 0,
  };
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
    nextDate,
  };
};
