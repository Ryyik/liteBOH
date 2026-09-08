// 智能概览「当日已读」天粒度游标
//
// 语义（产品规则）：用户在某天上过线，即默认已浏览该日及之前的全部内容；
// 次日自动推送的窗口 = 上次在线日的次日零点之后产生的内容；
// 若不存在「新一天」的内容，则不自动推送。
//
// 存储：按用户维度写 localStorage（跨浏览器会话生效，替代此前仅会话内的
// sessionStorage 去重）；存储不可用（隐私模式等）时降级为页面会话内内存兜底，
// 保证同一会话内语义一致。

const OVERVIEW_DAY_MARKER_PREFIX = 'boh_overview_last_online_day:';
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// localStorage 不可用时的会话级兜底（模块级单例，随页面生命周期存续）
const memoryDayMarks = new Map();

/**
 * 本地时区的日键（YYYY-MM-DD）
 * @param {Date|string|number} [date] 缺省为当前时间
 * @returns {string} 非法输入返回空串
 */
export const getLocalDayKey = (date = new Date()) => {
  const source = date instanceof Date ? date : new Date(date);
  if (!(source instanceof Date) || Number.isNaN(source.getTime())) return '';
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, '0');
  const day = String(source.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 某本地日的推送游标 = 该日结束时刻（次日 00:00:00.000 本地时间）的 ISO 串。
 * 服务端按 created_at > 游标 过滤，恰好实现「该日及之前的内容不再推送」。
 * @param {string} dayKey YYYY-MM-DD
 * @returns {string|null} 非法日键返回 null
 */
export const getDayFrontierIso = (dayKey = '') => {
  const raw = String(dayKey || '');
  if (!DAY_KEY_PATTERN.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  // 语义校验：Date 构造器会静默滚动非法分量（13 月、2 月 30 日等），回读不一致即非法
  const probe = new Date(year, month - 1, day);
  if (
    Number.isNaN(probe.getTime())
    || probe.getFullYear() !== year
    || probe.getMonth() !== month - 1
    || probe.getDate() !== day
  ) {
    return null;
  }
  const frontier = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return Number.isNaN(frontier.getTime()) ? null : frontier.toISOString();
};

/**
 * 读取用户上次在线日（未记录/脏数据返回空串）
 * @param {string} userId
 * @returns {string}
 */
export const readLastOnlineDay = (userId = '') => {
  const id = String(userId || '').trim();
  if (!id) return '';
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(OVERVIEW_DAY_MARKER_PREFIX + id) || '';
      if (DAY_KEY_PATTERN.test(raw)) return raw;
    } catch {
      // 读取失败（隐私模式等）落到内存兜底
    }
  }
  return memoryDayMarks.get(id) || '';
};

/**
 * 写入用户上次在线日（非法入参静默忽略）
 * @param {string} userId
 * @param {string} dayKey YYYY-MM-DD
 */
export const writeLastOnlineDay = (userId = '', dayKey = '') => {
  const id = String(userId || '').trim();
  const key = String(dayKey || '');
  if (!id || !DAY_KEY_PATTERN.test(key)) return;
  memoryDayMarks.set(id, key);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OVERVIEW_DAY_MARKER_PREFIX + id, key);
  } catch {
    // 写入失败时内存兜底已生效
  }
};
