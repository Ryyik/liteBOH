/**
 * 「按当前筛选删除全部」的条件装配（纯函数，供单测；plans/027 E6.3）。
 *
 * 与列表查询同源：`fetchTabData` 对 4 个 tab 有额外的基础过滤（reportedPosts /
 * reviewPosts / reviewComments / bohaiModels）。服务端 RPC 的 count 预检拿的是
 * `totalRecordCount`（含基础过滤），如果这里只拼用户筛选，这 4 个 tab 会稳定
 * count mismatch。抽成纯函数后，列表与批量删除的条件口径由单测锁死。
 *
 * 注意：基础过滤只是「这个 tab 的数据边界」，**不算**用户筛选。
 * 调用方必须另外要求至少一个用户可见条件（search/status/date），否则
 * 会退化成「删掉整个基础集合」。
 */
import { INTERNAL_MODE_PREFIX } from '../config/bohai-internal-modes.js';

/** tab 级基础过滤 → RPC 条件（与 DataAdmin 的 fetchTabData 逐条对应） */
const BASE_SCOPE_CONDITIONS = {
  reportedPosts: [{ column: 'status', op: 'eq', value: 'limited' }],
  reviewPosts: [{ column: 'status', op: 'ilike', value: 'rejected' }],
  reviewComments: [{ column: 'status', op: 'ilike', value: 'rejected' }],
  bohaiModels: [{ column: 'mode_id', op: 'not_like', value: `${INTERNAL_MODE_PREFIX}%` }],
};

export const getBaseScopeConditions = (tabId) =>
  (BASE_SCOPE_CONDITIONS[tabId] || []).map((condition) => ({ ...condition }));

/**
 * @param {Object} input
 * @param {string} input.tabId
 * @param {string} [input.statusField]   当前 tab 的状态筛选列
 * @param {string} [input.statusFilter]  状态筛选值
 * @param {string} [input.dateField]     当前 tab 的日期筛选列
 * @param {string} [input.dateFrom]
 * @param {string} [input.dateTo]
 * @param {string[]} [input.searchColumns] 搜索字段（TAB_SEARCH_FIELDS 的 column 列表）
 * @param {string} [input.searchQuery]
 * @returns {Array<Object>} RPC 的 p_filters
 */
export const buildBatchDeleteConditions = ({
  tabId,
  statusField = '',
  statusFilter = '',
  dateField = '',
  dateFrom = '',
  dateTo = '',
  searchColumns = [],
  searchQuery = '',
} = {}) => {
  const conditions = getBaseScopeConditions(tabId);

  if (statusFilter && statusField) {
    conditions.push({ column: statusField, op: 'eq', value: String(statusFilter) });
  }
  if (dateField && dateFrom) {
    conditions.push({ column: dateField, op: 'gte', value: String(dateFrom) });
  }
  if (dateField && dateTo) {
    conditions.push({ column: dateField, op: 'lte', value: String(dateTo) });
  }
  const columns = (searchColumns || []).filter(Boolean);
  if (searchQuery && columns.length) {
    conditions.push({ op: 'or_ilike', columns, value: `%${searchQuery}%` });
  }

  return conditions;
};
