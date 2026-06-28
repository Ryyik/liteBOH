/**
 * DataAdmin 列表筛选 / 搜索 / 排序相关纯函数
 * 拆分自 DataAdmin.vue (P2 拆分第一阶段)
 *
 * 全部接收数据/状态作为入参, 不直接持有 ref, 便于复用与单元测试
 */

import { UUID_REGEX } from './useDataAdminValidation.js';

export const ALLOWED_ADVANCED_OPERATORS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'starts', 'contains', 'ilike'
]);

/**
 * 清理用户输入的搜索词, 防止 Supabase 语法注入
 *   - 去除首尾空白
 *   - 移除 supabase or() 语法敏感字符 ( , % ( ) )
 *   - 折叠连续空白
 *   - 截断到 120 字
 */
export const sanitizeSearchTerm = (value) => String(value || '')
  .trim()
  .replace(/[,%()]/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 120);

/**
 * 清理高级筛选条件值, 防御注入 + 截断
 */
export const normalizeFilterValue = (value) => String(value || '')
  .trim()
  .replace(/[,%()]/g, ' ')
  .slice(0, 160);

/**
 * 根据 tabId + 搜索词构造 supabase or() 过滤器数组
 *   TAB_SEARCH_FIELDS[tabId] 中声明的字段才会被查询
 *   type='uuid' 的字段: 关键词为合法 UUID 时精确匹配
 *   type='number' 的字段: 关键词为纯数字时精确匹配
 *   其余字段: 大小写不敏感包含
 */
export const buildSearchFilters = (tabId, keyword, tabSearchFields) => {
  const cleaned = sanitizeSearchTerm(keyword);
  if (!cleaned) return [];

  const isUuid = UUID_REGEX.test(cleaned);
  const isInteger = /^\d+$/.test(cleaned);

  return (tabSearchFields[tabId] || []).flatMap((field) => {
    if (field.type === 'uuid') return isUuid ? [`${field.column}.eq.${cleaned}`] : [];
    if (field.type === 'number') return isInteger ? [`${field.column}.eq.${cleaned}`] : [];
    return [`${field.column}.ilike.%${cleaned}%`];
  });
};

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
    else if (operator === 'starts') nextQuery = nextQuery.ilike(field, `${value}%`);
    else nextQuery = nextQuery.ilike(field, `%${value}%`);
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
    allowedAdvancedFields = []
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
    nextQuery = nextQuery.lte(dateField, Number.isNaN(endDate.getTime()) ? dateTo : endDate.toISOString());
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
    nextQuery = nextQuery.order(configuredSort.secondary.column, { ascending: configuredSort.secondary.ascending });
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
    ...(tabSearchFields[tabId] || []).map((field) => field.column)
  ].filter((value, index, list) => value && list.indexOf(value) === index);
};
