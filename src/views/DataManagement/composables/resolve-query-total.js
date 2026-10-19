/**
 * resolve-query-total.js — 数据管理面板「页脚总数」的取值口径（纯函数，有单测）。
 *
 * ── 为什么需要（2026-10-19 用户报障）──────────────────────────────────
 * 「总记录数」在翻页后会变成当前页行数：第 1 页 20 条就显示 20，第 2 页 11 行
 * 就显示 11。根因是页脚总数只认 `tabQueryTotals[当前 tab]`（列表查询的
 * `count: 'exact'`）；一旦某次查询没拿到 count（undefined），旧实现静默退化成
 * `currentData.length` —— 也就是「当前页行数」，于是翻页就变。
 *
 * ── 取值优先级（一级比一级更"宽"，但绝不等于页长）────────────────────
 *   ① 列表查询 count（含筛选，最准；翻页不变）
 *   ② 全表计数（概览 RPC / head count；筛选时会偏大，但至少稳定）
 *   ③ 当前页行数（最后兜底 —— 只在①②都拿不到时出现，正常路径不应命中）
 *
 * ⚠️ null / undefined / 空串必须显式视为「没有值」：`Number(null) === 0` 是有限数，
 *    直接塞进 Number.isFinite 会把「缺 count」误判成「总数 0」（2026-10-19 单测抓出）。
 */

/** 归一为「非负有限数」；缺失值（null/undefined/空白串/NaN/Infinity）返回 null。 */
const toFiniteCount = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : null;
};

/**
 * @param {{ queryTotal?: number|string|null, tableTotal?: number|string|null, rowCount?: number|string|null }} input
 * @returns {number} 非负整数
 */
export const resolveQueryTotal = ({ queryTotal, tableTotal, rowCount } = {}) => {
  const query = toFiniteCount(queryTotal);
  if (query !== null) return query;

  const table = toFiniteCount(tableTotal);
  if (table !== null) return table;

  const rows = toFiniteCount(rowCount);
  return rows !== null ? rows : 0;
};
