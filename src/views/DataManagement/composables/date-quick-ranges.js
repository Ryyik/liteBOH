/**
 * 日期快捷筛选（plans/050 期 2）。
 *
 * 口径：
 * - 全部用**本地日期**计算，绝不走 `toISOString()`（UTC 会让东八区用户
 *   在 00:00–08:00 之间看到「今天」其实是昨天）。
 * - 「近 7 天」= **含今天共 7 天**（today−6 .. today），与设置页/前台一致；
 *   不是 7×24 小时。
 * - `全部` = 清空起止日期，不产生额外查询条件。
 *
 * 抽成纯函数是为了单测（tests/unit/data-admin-date-quick-ranges.test.js），
 * 组件里不要再写第二份日期边界。
 */
export const DATE_QUICK_RANGES = [
  { id: 'all', label: '全部', days: 0 },
  { id: 'today', label: '今天', days: 1 },
  { id: 'last7', label: '近 7 天', days: 7 },
  { id: 'last30', label: '近 30 天', days: 30 },
];

const pad = (n) => String(n).padStart(2, '0');

/** 本地日期 → `YYYY-MM-DD`（原生 date input 的取值格式） */
export const toLocalDateValue = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 档位 → `{ from, to }`；未知档位返回 null，「全部」返回两个空串 */
export function resolveDateQuickRange(rangeId, now = new Date()) {
  const range = DATE_QUICK_RANGES.find((item) => item.id === rangeId);
  if (!range) return null;
  if (!range.days) return { from: '', to: '' };
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (range.days - 1));
  return { from: toLocalDateValue(start), to: toLocalDateValue(end) };
}

/** 当前起止日期命中了哪一档；都对不上（自定义）返回 `custom` */
export function detectDateQuickRange(from, to, now = new Date()) {
  const normalizedFrom = String(from || '').trim();
  const normalizedTo = String(to || '').trim();
  if (!normalizedFrom && !normalizedTo) return 'all';
  for (const range of DATE_QUICK_RANGES) {
    if (!range.days) continue;
    const resolved = resolveDateQuickRange(range.id, now);
    if (normalizedFrom === resolved.from && normalizedTo === resolved.to) return range.id;
  }
  return 'custom';
}

/** tooltip 文案：把档位展开成具体日期，避免「近 7 天」的歧义 */
export function describeDateQuickRange(rangeId, now = new Date()) {
  const resolved = resolveDateQuickRange(rangeId, now);
  if (!resolved) return '';
  if (!resolved.from) return '不限制日期';
  return resolved.from === resolved.to ? resolved.from : `${resolved.from} 至 ${resolved.to}`;
}
