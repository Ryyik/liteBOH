/**
 * temporal-anchor.js — 「今天是几号」的**唯一真源**（2026-11-12 新增）
 *
 * 为什么需要：`system-prompt.ts` 拼装出来的 prompt 里**没有任何时间锚点**
 * （全仓 BOHAI 搜不到「当前时间 / 今天是 / 当前日期」）。后果是模型不知道今天几号：
 *   · 数据里明明给了 `2026-11-11` 的帖子，它可能说成「上个月」；
 *   · 用户问「本月新增了什么」，它没有「本月」这个基准；
 *   · 遇到「最新 / 最近」这类问法，它只能拿训练数据里的时间去猜 —— 而那是几年前的。
 * 这类错误不报错、不崩，只是答得「看起来像过期的」，最难被发现。
 *
 * 口径（三条，别自行放宽）：
 *   ① **固定北京时间（UTC+8）** —— 站内数据都按站内统一时区叙述，用户在国外也不会
 *      得到「今天是另一天」的锚点。`TEMPORAL_TIME_ZONE` 是唯一常量，别再写第二份。
 *   ② 纯函数 + 可注入 `now` —— 时间相关内容必须能在测试里被钉死，不许内部偷读 `Date.now()`。
 *   ③ 输出包在 `<temporal_anchor>` 里，与 BASE_SYSTEM_PROMPT 里其他标签同风格；
 *      它被拼进 `{{EVIDENCE_CONTEXT}}` 所在的 `<context>` 块的**最前面**（先时间、后内容）。
 *
 * ⚠️ 与 `formatPromptDate`（utils/format/display.js）的分工：那个负责把**数据里的时间戳**
 * 格式化成本地时区的 `YYYY-MM-DD`；本文件只回答「现在是什么时候」。两者都出现在 prompt 里，
 * 提示词明确写了「按绝对日期换算」，所以即便用户设备时区与北京时间差一天也不会误导。
 */

/** 站内统一时区（唯一常量）。改这里等于改所有「今天」的定义。 */
export const TEMPORAL_TIME_ZONE = 'Asia/Shanghai';

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** `Intl` 的 weekday 短名（en-US）→ 中文标签下标 */
const WEEKDAY_SHORT_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * 按指定时区读年月日时分与星期。
 * `Intl` 在极端环境（缺 ICU 时区数据 / 老 Safari）可能抛错 —— 那不应让整轮对话挂掉，
 * 所以返回 `null` 交给调用方回退本地时区。
 */
const readZonedParts = (date) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TEMPORAL_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      // h23：00–23，避免午夜出现「24:00」这种在提示词里会引起歧义的写法
      hourCycle: 'h23',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(date);
    const pick = (type) => parts.find((part) => part.type === type)?.value || '';
    const weekday = WEEKDAY_LABELS[WEEKDAY_SHORT_INDEX[pick('weekday')]] || '';
    const year = pick('year');
    const month = pick('month');
    const day = pick('day');
    if (!year || !month || !day) return null;
    return {
      year,
      month,
      day,
      hour: pick('hour') || '00',
      minute: pick('minute') || '00',
      weekday,
    };
  } catch {
    return null;
  }
};

/** 回退：本地时区（只在 `Intl` 不可用时用，宁可差时区也不能没有锚点）。 */
const readLocalParts = (date) => ({
  year: String(date.getFullYear()),
  month: pad2(date.getMonth() + 1),
  day: pad2(date.getDate()),
  hour: pad2(date.getHours()),
  minute: pad2(date.getMinutes()),
  weekday: WEEKDAY_LABELS[date.getDay()] || '',
});

/**
 * 生成时间锚点段落。非法时间返回空串（调用方 `filter` 掉，不会留空标签）。
 *
 * @param {Date|string|number} [now] 注入用；默认取当前时刻
 * @returns {string}
 */
export const formatTemporalAnchor = (now = new Date()) => {
  const date = now instanceof Date ? now : new Date(now);
  if (!date || Number.isNaN(date.getTime())) return '';
  const parts = readZonedParts(date) || readLocalParts(date);
  const stamp = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  const weekday = parts.weekday ? `（${parts.weekday}）` : '';
  return [
    '<temporal_anchor>',
    `当前时间：${stamp}${weekday}，时区为北京时间（UTC+8）。`,
    '上下文里出现的日期都是绝对日期（YYYY-MM-DD 或 YYYY-MM-DD HH:mm）。凡涉及「最近 / 最新 / 今天 / 昨天 / 本周 / 本月 / 刚刚」这类时效判断，一律以本锚点为基准换算，不要用训练数据里的时间猜测今天几号。',
    '若某条资料的时间明显早于今天，回答时就把它说成具体日期（例如「11 月 6 日」），不要笼统说成「最近 / 刚刚 / 这几天」；反过来，不要把很久以前的内容说成今天发生的。',
    '</temporal_anchor>',
  ].join('\n');
};
