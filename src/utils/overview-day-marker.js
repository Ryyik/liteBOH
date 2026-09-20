// 智能概览「上次在线日 / 当日已检查」天粒度游标
//
// 语义（产品规则）：用户在某天上过线，即默认已浏览该日及之前的全部内容；
// 次日自动推送的窗口 = 上次在线日的次日零点之后产生的内容；
// 若不存在「新一天」的内容，则不自动推送。
//
// 两个 key 分工（20260920 拆分——合成一个时有两类问题互相纠缠：会话结束写「今天」会把
// 当天推送窗口掐掉，不写又会让长离线天数被登录心跳锚点抹平成 0）：
// - boh_overview_last_online_day:<uid> 真实上次在线日：会话结束（pagehide）或检查成功时写。
//   只用于计算推送窗口与「你离开了 N 天」文案；当天在线不影响当天再推送。
// - boh_overview_checked_day:<uid> 当日已检查日：仅检查成功后写，只用于同日去重（同日不再重复检查）。
//
// 存储：按用户维度写 localStorage（跨浏览器会话生效）；存储不可用（隐私模式等）时
// 降级为页面会话内内存兜底，保证同一会话内语义一致。

const OVERVIEW_DAY_MARKER_PREFIX = 'boh_overview_last_online_day:';
const OVERVIEW_CHECKED_DAY_PREFIX = 'boh_overview_checked_day:';
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// localStorage 不可用时的会话级兜底（模块级单例，随页面生命周期存续）
const memoryDayMarks = new Map();
const memoryCheckedDays = new Map();

const readDayKey = (prefix, memory, userId = '') => {
  const id = String(userId || '').trim();
  if (!id) return '';
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(prefix + id) || '';
      if (DAY_KEY_PATTERN.test(raw)) return raw;
    } catch {
      // 读取失败（隐私模式等）落到内存兜底
    }
  }
  return memory.get(id) || '';
};

const writeDayKey = (prefix, memory, userId = '', dayKey = '') => {
  const id = String(userId || '').trim();
  const key = String(dayKey || '');
  if (!id || !DAY_KEY_PATTERN.test(key)) return;
  memory.set(id, key);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(prefix + id, key);
  } catch {
    // 写入失败时内存兜底已生效
  }
};

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
export const readLastOnlineDay = (userId = '') =>
  readDayKey(OVERVIEW_DAY_MARKER_PREFIX, memoryDayMarks, userId);

/**
 * 写入用户上次在线日（非法入参静默忽略）
 * @param {string} userId
 * @param {string} dayKey YYYY-MM-DD
 */
export const writeLastOnlineDay = (userId = '', dayKey = '') =>
  writeDayKey(OVERVIEW_DAY_MARKER_PREFIX, memoryDayMarks, userId, dayKey);

/**
 * 读取用户「当日已检查」日（同日去重用；未记录/脏数据返回空串）
 * @param {string} userId
 * @returns {string}
 */
export const readLastCheckedDay = (userId = '') =>
  readDayKey(OVERVIEW_CHECKED_DAY_PREFIX, memoryCheckedDays, userId);

/**
 * 写入用户「当日已检查」日（仅检查成功后调用；非法入参静默忽略）
 * @param {string} userId
 * @param {string} dayKey YYYY-MM-DD
 */
export const writeLastCheckedDay = (userId = '', dayKey = '') =>
  writeDayKey(OVERVIEW_CHECKED_DAY_PREFIX, memoryCheckedDays, userId, dayKey);
