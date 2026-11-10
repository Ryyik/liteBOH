/**
 * 「按当前筛选删除全部」的条件装配（纯函数，供单测；plans/027 E6.3 / 042 B3）。
 *
 * 与列表查询同源：`fetchTabData` 对 4 个 tab 有额外的基础过滤（reportedPosts /
 * reviewPosts / reviewComments / bohaiModels）。服务端 RPC 的 count 预检拿的是
 * `totalRecordCount`（含基础过滤），如果这里只拼用户筛选，这 4 个 tab 会稳定
 * count mismatch。抽成纯函数后，列表与批量删除的条件口径由单测锁死。
 *
 * 注意：基础过滤只是「这个 tab 的数据边界」，**不算**用户筛选。
 * 调用方必须另外要求至少一个用户可见条件（search/status/date/高级规则），否则
 * 会退化成「删掉整个基础集合」。
 *
 * 🔴 本文件的唯一职责是「把屏幕上的筛选翻译成 p_filters」，一旦翻译不出**语义等价**
 * 的条件就必须返回 `blocked`，绝不能翻译成「差不多」的条件 —— RPC 的 count 预检
 * 会拒绝（表现为删不掉），最坏情况下如果恰好数量相同，删掉的就不是屏幕上那一批。
 * 因此这里刻意复用：
 *   - `buildSearchMatchSpec`（哪几列、什么算子、什么模式）
 *   - `resolveAdvancedRules`（哪条规则真的生效）
 *   - `endOfDayIso`（截止日怎么取值）
 * 三处都是列表查询已经在用的同一份实现。
 */
import { buildSearchMatchSpec, escapeLikePattern } from '@/utils/search-core.js';
import { endOfDayIso, hasFilterValue, resolveAdvancedRules } from './useDataAdminFilters.js';
import { INTERNAL_MODE_PREFIX } from '../config/bohai-internal-modes.js';

/** tab 级基础过滤 → RPC 条件（与 DataAdmin 的 fetchTabData 逐条对应） */
const BASE_SCOPE_CONDITIONS = {
  reportedPosts: [{ column: 'status', op: 'eq', value: 'limited' }],
  reviewPosts: [{ column: 'status', op: 'ilike', value: 'rejected' }],
  reviewComments: [{ column: 'status', op: 'ilike', value: 'rejected' }],
  bohaiModels: [{ column: 'mode_id', op: 'not_like', value: `${INTERNAL_MODE_PREFIX}%` }],
};

/**
 * 服务端 RPC 支持的算子（`admin_batch_delete` 的 op 白名单）。
 * 前端基础过滤用到的 `not_like` 不在其中 —— 遇到就 block，而不是悄悄丢掉这条条件
 * （丢掉就等于把「排除内部模型」变成「连内部模型一起删」）。
 */
const RPC_SUPPORTED_OPS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'or_ilike',
]);

export const getBaseScopeConditions = (tabId) =>
  (BASE_SCOPE_CONDITIONS[tabId] || []).map((condition) => ({ ...condition }));

/** 高级规则算子 → RPC 条件（LIKE 类与列表一样先转义通配符、再拼模式） */
const toRpcCondition = ({ field, operator, value }) => {
  if (operator === 'starts')
    return { column: field, op: 'ilike', value: `${escapeLikePattern(value)}%` };
  if (operator === 'contains' || operator === 'ilike') {
    return { column: field, op: 'ilike', value: `%${escapeLikePattern(value)}%` };
  }
  return { column: field, op: operator, value };
};

/**
 * 搜索条件 → RPC 条件。
 *
 * RPC 的顶层条件是 AND，只有 `or_ilike` 内部是 OR，所以：
 *   - 全是文本包含 → 一条 `or_ilike`（单列时也保留这层分组，与历史条件形状一致）
 *   - 只有一条且是精确匹配（`id:` + 完整 UUID）→ 直接落成 eq
 *   - 混了精确匹配（关键词是 UUID / 纯数字，列表会额外走 id.eq）→ 无法表达成
 *     「A OR B 且 B 是精确比较」，返回 blocked。这种关键词通常只想删一条，
 *     用行内删除更合适。
 */
const searchConditionsOf = (spec) => {
  if (!spec.columns.length) return { conditions: [] };
  if (spec.columns.length === 1 && spec.columns[0].op === 'eq') {
    return {
      conditions: [{ column: spec.columns[0].column, op: 'eq', value: spec.columns[0].value }],
    };
  }
  if (spec.columns.every((item) => item.op === 'ilike')) {
    return {
      conditions: [
        { op: 'or_ilike', columns: spec.columns.map((item) => item.column), value: spec.pattern },
      ],
    };
  }
  return {
    blocked: {
      code: 'mixed-search',
      message:
        '这个关键词会同时命中 ID 字段与文本字段，无法保证与列表同口径；请改用状态/高级筛选，或逐条删除',
    },
  };
};

/**
 * @param {Object} input
 * @param {string} input.tabId
 * @param {string} [input.statusField]   当前 tab 的状态筛选列
 * @param {string} [input.statusFilter]  状态筛选值
 * @param {string} [input.dateField]     当前 tab 的日期筛选列
 * @param {string} [input.dateFrom]
 * @param {string} [input.dateTo]
 * @param {Array<{column:string,type?:string}>} [input.searchFields] 搜索字段（含类型，优先）
 * @param {string[]} [input.searchColumns] 仅列名的旧入参（兼容；按纯文本处理）
 * @param {string} [input.searchQuery]
 * @param {Array<Object>} [input.advancedRules] 高级筛选规则
 * @param {string[]} [input.allowedAdvancedFields] 高级筛序列白名单（与列表同一份）
 * @returns {{conditions: Array<Object>, blocked: null|{code:string,message:string}>}
 */
export const buildBatchDeleteScope = ({
  tabId,
  statusField = '',
  statusFilter = '',
  dateField = '',
  dateFrom = '',
  dateTo = '',
  searchFields = [],
  searchColumns = [],
  searchQuery = '',
  advancedRules = [],
  allowedAdvancedFields = [],
} = {}) => {
  const conditions = getBaseScopeConditions(tabId);
  const blocked = (code, message) => ({ conditions: [], blocked: { code, message } });

  const unsupportedBase = conditions.find((condition) => !RPC_SUPPORTED_OPS.has(condition.op));
  if (unsupportedBase) {
    return blocked(
      'base-scope-op',
      `该表的基础过滤（${unsupportedBase.op}）服务端暂不支持，无法按筛选全量删除`,
    );
  }

  // 状态值与列表侧同口径：布尔列的「否」(false) 也必须落成条件，真值判断会静默丢掉它
  if (hasFilterValue(statusFilter) && statusField) {
    conditions.push({ column: statusField, op: 'eq', value: String(statusFilter) });
  }
  if (dateField && dateFrom) {
    conditions.push({ column: dateField, op: 'gte', value: String(dateFrom) });
  }
  if (dateField && dateTo) {
    conditions.push({ column: dateField, op: 'lte', value: endOfDayIso(dateTo) });
  }

  const fields = searchFields?.length
    ? searchFields
    : (searchColumns || []).filter(Boolean).map((column) => ({ column }));
  const search = searchConditionsOf(buildSearchMatchSpec(tabId, searchQuery, { [tabId]: fields }));
  if (search.blocked) return { conditions: [], blocked: search.blocked };
  conditions.push(...search.conditions);

  resolveAdvancedRules(advancedRules, allowedAdvancedFields).forEach((rule) => {
    conditions.push(toRpcCondition(rule));
  });

  return { conditions, blocked: null };
};

/** 只要条件数组的旧签名（保留给单测与任何不关心 blocked 的调用方）。 */
export const buildBatchDeleteConditions = (input = {}) => buildBatchDeleteScope(input).conditions;
