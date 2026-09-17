/**
 * 活动日期解析（单一真相源）
 *
 * 背景：public.activities.date 是 varchar(50)，历史数据存在三种格式混录：
 *   - YYYY/M/D    9 条  2026/2/3      （有「日」）
 *   - YYYY/M      6 条  2025/10       （只有年月，缺「日」）
 *   - YYYY-MM-DD  2 条  2026-08-10    （有「日」）
 *
 * 三条铁律：
 *   1. 只做「解析」，不改写原始字符串——缺「日」这一事实必须被保留（hasDay），
 *      否则前台会凭空多出「10月1日」。
 *   2. 分组键与排序键分开：monthKey/monthLabel 只用于显示，monthOrd/sortKey 只用于排序。
 *      字符串直接比较是错的（'2025/7/21' > '2025/12/12'）。
 *   3. 不依赖 Date 的宽松解析：new Date('2024-7') 会被 V8 补成 07-01 而不报错，
 *      属于静默失败。这里全部走显式正则。
 */

const YMD_RE = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
const YM_RE = /^(\d{4})[/-](\d{1,2})$/;

const INVALID = Object.freeze({
  valid: false,
  year: null,
  month: null,
  day: null,
  hasDay: false,
  monthKey: '',
  monthOrd: 0,
  sortKey: 0,
  monthLabel: '',
  dateLabel: '',
  shortLabel: '',
  precision: 'unknown'
});

const isMonthInRange = (month) => Number.isInteger(month) && month >= 1 && month <= 12;
const isDayInRange = (year, month, day) => {
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= max;
};

/**
 * 解析活动日期字符串。
 * @param {string|number|null|undefined} raw
 * @returns {{
 *   valid: boolean, year: number|null, month: number|null, day: number|null,
 *   hasDay: boolean, monthKey: string, monthOrd: number, sortKey: number,
 *   monthLabel: string, dateLabel: string, shortLabel: string,
 *   precision: 'day'|'month'|'unknown'
 * }}
 */
export function parseActivityDate(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ...INVALID };

  let year = null;
  let month = null;
  let day = null;
  let hasDay = false;

  const ymd = text.match(YMD_RE);
  if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
    hasDay = true;
  } else {
    const ym = text.match(YM_RE);
    if (ym) {
      year = Number(ym[1]);
      month = Number(ym[2]);
      hasDay = false;
    }
  }

  if (year === null || !isMonthInRange(month)) return { ...INVALID };
  if (hasDay && !isDayInRange(year, month, day)) return { ...INVALID };

  const monthOrd = year * 100 + month;
  const sortKey = year * 10000 + month * 100 + (hasDay ? day : 0);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  return {
    valid: true,
    year,
    month,
    day: hasDay ? day : null,
    hasDay,
    monthKey,
    monthOrd,
    sortKey,
    monthLabel: `${year}年${month}月`,
    dateLabel: hasDay ? `${year}年${month}月${day}日` : `${year}年${month}月`,
    shortLabel: hasDay ? `${month}月${day}日` : `${month}月`,
    precision: hasDay ? 'day' : 'month'
  };
}

/** 供 UI 直接使用的展示文案；无效日期回退到原始字符串。 */
export function formatActivityDate(raw, style = 'long') {
  const parsed = parseActivityDate(raw);
  if (!parsed.valid) return String(raw ?? '').trim();
  if (style === 'short') return parsed.shortLabel;
  if (style === 'month') return parsed.monthLabel;
  return parsed.dateLabel;
}

/** 该条记录是否精确到「日」；无效日期返回 false。 */
export function hasDayPrecision(raw) {
  return parseActivityDate(raw).hasDay;
}

const sortEntriesDesc = (a, b) => {
  if (b.parsed.sortKey !== a.parsed.sortKey) return b.parsed.sortKey - a.parsed.sortKey;
  const idA = Number(a.row?.id);
  const idB = Number(b.row?.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) return idB - idA;
  return String(a.row?.title ?? '').localeCompare(String(b.row?.title ?? ''), 'zh-Hans-CN');
};

/**
 * 按月份分组。同月内按日期降序（无「日」的记录排在同月最后），月份之间按时间降序。
 * 排序完全确定：无「日」不再依赖 Array.sort 的不稳定行为（2024/12/31 有两条）。
 *
 * @param {Array<object>} rows
 * @returns {{ groups: Array<{monthKey:string, monthLabel:string, monthOrd:number, items:Array<object>}>, undated: Array<object> }}
 */
export function groupActivitiesByMonth(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const entries = [];
  const undated = [];

  list.forEach((row) => {
    const parsed = parseActivityDate(row?.date);
    if (!parsed.valid) {
      undated.push(row);
      return;
    }
    entries.push({ row, parsed });
  });

  entries.sort(sortEntriesDesc);

  const groups = [];
  let current = null;
  entries.forEach((entry) => {
    if (!current || current.monthKey !== entry.parsed.monthKey) {
      current = {
        monthKey: entry.parsed.monthKey,
        monthLabel: entry.parsed.monthLabel,
        monthOrd: entry.parsed.monthOrd,
        items: []
      };
      groups.push(current);
    }
    current.items.push(entry.row);
  });

  return { groups, undated };
}

/** 归一化后的可写值：保留原始精度，缺「日」写 YYYY-MM，有「日」写 YYYY-MM-DD。 */
export function normalizeActivityDateInput(raw) {
  const parsed = parseActivityDate(raw);
  if (!parsed.valid) return '';
  if (!parsed.hasDay) return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
}

/**
 * 把编辑态的年月/年月日两段输入合成为存储值。
 * 供数据管理表单使用：留空「日」即表示只精确到月。
 */
export function composeActivityDateInput(yearValue, monthValue, dayValue) {
  const year = Number(String(yearValue ?? '').trim());
  const month = Number(String(monthValue ?? '').trim());
  if (!Number.isInteger(year) || year < 1900 || year > 2999) return '';
  if (!isMonthInRange(month)) return '';
  const dayText = String(dayValue ?? '').trim();
  if (!dayText) return `${year}-${String(month).padStart(2, '0')}`;
  const day = Number(dayText);
  if (!isDayInRange(year, month, day)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
