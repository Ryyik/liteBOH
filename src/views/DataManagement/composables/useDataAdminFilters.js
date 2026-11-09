/**
 * DataAdmin 列表筛选 / 搜索 / 排序相关纯函数
 * 拆分自 DataAdmin.vue (P2 拆分第一阶段)
 *
 * 全部接收数据/状态作为入参, 不直接持有 ref, 便于复用与单元测试
 */

import {
  escapeLikePattern,
  normalizeKeyword,
  buildSearchFilters as buildSearchFiltersCore,
} from '@/utils/search-core.js';

export const ALLOWED_ADVANCED_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'starts',
  'contains',
  'ilike',
]);

/**
 * 高级筛选算子的中文标签（单一真源）。
 * 下拉选项与「生效条件 chips」都从这里取 —— 以前只在下拉里写死过一份，
 * chips 再写一份就会出现「下拉叫『开头是』、chip 叫『starts』」的两种说法。
 */
export const ADVANCED_OPERATOR_LABELS = {
  contains: '包含',
  eq: '等于',
  neq: '不等于',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  starts: '开头是',
  ilike: '包含',
};

/** 高级筛选下拉的算子顺序（推荐顺序，不是白名单；白名单见 ALLOWED_ADVANCED_OPERATORS） */
export const ADVANCED_OPERATOR_OPTIONS = [
  'contains',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'starts',
];

/**
 * 清理用户输入的搜索词（plans/042 C1）。
 *
 * **不再删除** `, % ( )`：旧实现把「50%」替换成「50 」，用户看到的输入与实际
 * 查询不一致，而且永远不会有人发现。转义交给 search-core 的 buildSearchFilters。
 * 这里保留旧名做转发，避免三处 import 同时改。
 */
export const sanitizeSearchTerm = normalizeKeyword;

/**
 * 清理高级筛选条件值。
 * 同样只做规范化；LIKE 类算子在使用时单独转义，eq/gt 这类比较算子必须拿到原值。
 */
export const normalizeFilterValue = (value) =>
  String(value || '')
    .trim()
    .slice(0, 160);

/**
 * 根据 tabId + 搜索词构造 supabase or() 过滤器数组。
 * 规则（含转义）在 utils/search-core.js，这里只是旧的调用点适配。
 */
export const buildSearchFilters = (tabId, keyword, tabSearchFields) =>
  buildSearchFiltersCore(tabId, keyword, tabSearchFields);

/**
 * 高级筛选应用:
 *   - 白名单: 仅允许 currentColumns 中声明的字段, 防止探测敏感列
 *   - 算子白名单: 仅允许 ALLOWED_ADVANCED_OPERATORS 中的
 *   - 值为空跳过
 *   - eq/neq/gt/gte/lt/lte 走 supabase 标准算子
 *   - starts -> ilike 'value%'
 *   - contains / ilike -> ilike '%value%'
 */
export const applyAdvancedFilters = (query, rules, allowedFieldKeys) => {
  let nextQuery = query;
  const allowedFields = new Set(allowedFieldKeys || []);

  (rules || []).forEach((rule) => {
    const field = String(rule.field || '').trim();
    const operator = String(rule.operator || 'contains').trim();
    const value = normalizeFilterValue(rule.value);
    if (!field || !value) return;
    if (allowedFields.size > 0 && !allowedFields.has(field)) return;
    if (!ALLOWED_ADVANCED_OPERATORS.has(operator)) return;

    if (operator === 'eq') nextQuery = nextQuery.eq(field, value);
    else if (operator === 'neq') nextQuery = nextQuery.neq(field, value);
    else if (operator === 'gt') nextQuery = nextQuery.gt(field, value);
    else if (operator === 'gte') nextQuery = nextQuery.gte(field, value);
    else if (operator === 'lt') nextQuery = nextQuery.lt(field, value);
    else if (operator === 'lte') nextQuery = nextQuery.lte(field, value);
    // LIKE 类算子按字面量匹配：用户输入「50%」时不该被当成通配符
    else if (operator === 'starts')
      nextQuery = nextQuery.ilike(field, `${escapeLikePattern(value)}%`);
    else nextQuery = nextQuery.ilike(field, `%${escapeLikePattern(value)}%`);
  });

  return nextQuery;
};

/**
 * 组合应用: 搜索 + 状态 + 日期范围 + 高级筛选 + 排序
 * @param {Object} params
 * @param {Object} params.query - supabase query builder
 * @param {string} params.tabId
 * @param {string} params.keyword - 搜索词
 * @param {string} params.statusFilter
 * @param {string} params.dateFrom
 * @param {string} params.dateTo
 * @param {Array} params.advancedRules
 * @param {string} params.sortKey
 * @param {string} params.sortOrder - 'asc' | 'desc'
 * @param {Object} params.configs - { tabSearchFields, statusFilterFields, dateFilterFields, tabSortColumns, tabDefaultSort }
 * @param {Array<string>} params.allowedAdvancedFields - 列白名单
 */
export const applySearchAndSort = (params) => {
  const {
    query,
    tabId,
    keyword,
    statusFilter,
    dateFrom,
    dateTo,
    advancedRules,
    sortKey,
    sortOrder,
    configs,
    allowedAdvancedFields = [],
  } = params;

  let nextQuery = query;

  const searchFilters = buildSearchFilters(tabId, keyword, configs.tabSearchFields);
  if (searchFilters.length > 0) {
    nextQuery = nextQuery.or(searchFilters.join(','));
  }

  const statusField = configs.statusFilterFields[tabId];
  if (statusField && statusFilter !== '') {
    nextQuery = nextQuery.eq(statusField, statusFilter);
  }

  const dateField = configs.dateFilterFields[tabId];
  if (dateField && dateFrom) {
    nextQuery = nextQuery.gte(dateField, dateFrom);
  }
  if (dateField && dateTo) {
    const endDate = new Date(`${dateTo}T23:59:59`);
    nextQuery = nextQuery.lte(
      dateField,
      Number.isNaN(endDate.getTime()) ? dateTo : endDate.toISOString(),
    );
  }

  nextQuery = applyAdvancedFilters(nextQuery, advancedRules, allowedAdvancedFields);

  const sortableColumns = configs.tabSortColumns[tabId] || new Set();
  const configuredSort = sortableColumns.has(sortKey)
    ? { column: sortKey, ascending: sortOrder === 'asc' }
    : configs.tabDefaultSort[tabId];

  if (configuredSort?.column) {
    nextQuery = nextQuery.order(configuredSort.column, { ascending: configuredSort.ascending });
  }
  if (configuredSort?.secondary?.column) {
    nextQuery = nextQuery.order(configuredSort.secondary.column, {
      ascending: configuredSort.secondary.ascending,
    });
  }

  return nextQuery;
};

/**
 * 全局搜索结果预览需要高亮的字段
 */
export const getSearchablePreviewFields = (tabId, dataConfig, tabSearchFields) => {
  const config = dataConfig[tabId] || {};
  return [
    ...(config.columns || []).map((col) => col.key),
    ...(tabSearchFields[tabId] || []).map((field) => field.column),
  ].filter((value, index, list) => value && list.indexOf(value) === index);
};
