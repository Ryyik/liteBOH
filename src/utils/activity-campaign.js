/**
 * 活动平台（activity_campaigns）的纯工具函数
 *
 * 为什么单独成文件：这套规则此前只存在于数据管理的 saveStrategies 里，
 * 而活动页的管理员投稿弹窗也要写同一张表。两处各写一份就会出现
 * 「后台能存进去、前台存不进去」这类漂移，所以收敛到这里做单一真相源。
 */

/**
 * slug 归一：小写 + 只留字母数字连字符 + 去首尾连字符。
 * 口径与 2026090802 迁移里 slug text unique not null 的预期一致。
 * 注意中文标题会被清空（这是预期行为，调用方需回退到 buildSlugFromTitle）。
 */
export function normalizeCampaignSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    // 连字符本身属于合法字符类、不会被上一步替换，所以 'a  b--c' 会留下 'a-b--c'，
    // 这里再折叠一次连续连字符
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * 从标题推导 slug。中文标题推导结果为空，退回时间戳式 slug。
 * 时间戳用 base36（7-9 位），再补 3 位随机后缀 —— 只靠毫秒时间戳在
 * 同一毫秒内会生成相同 slug，撞 slug 的 unique 约束导致发布失败。
 */
export function buildSlugFromTitle(title) {
  const fromTitle = normalizeCampaignSlug(title);
  if (fromTitle) return fromTitle;
  const suffix = (`${Math.random().toString(36)}000`).slice(2, 5);
  return `boh-${Date.now().toString(36)}${suffix}`;
}

/**
 * datetime-local / 文本 → 带时区的 ISO 字符串。
 *
 * datetime-local 给的是「不带时区的本地时间」（2026-09-10T00:00），
 * 原样写进 timestamptz 列会被当作 UTC 解释，整体偏 8 小时。
 * 空值统一为 null（DB 侧 signup_* 允许空 = 不限）。
 */
export function toIsoOrNull(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

/**
 * 校验时间窗先后。ISO 8601 字符串的字典序即时间序，可直接比较。
 * @returns {string} 错误文案，空字符串表示通过
 */
export function validateCampaignWindow({ signupStart, signupEnd, startAt, endAt }) {
  if (signupStart && signupEnd && signupEnd < signupStart) return '报名截止不能早于报名开始';
  if (startAt && endAt && endAt < startAt) return '活动结束不能早于活动开始';
  return '';
}
