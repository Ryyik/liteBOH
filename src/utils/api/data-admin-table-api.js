import { supabase } from '@/utils/supabase-client.js';

/**
 * 每轮重建 query 的分页拉全量（plans/027 S2：数据管理面板「导出全部筛选结果」）。
 *
 * ⚠️ Supabase query builder 的 .range() 会原地改状态：复用同一 builder 对象
 *    会导致第二批 range 叠加，拿到空数组或错位数据 —— 所以每轮循环都重建 query。
 *
 * @param {Object} options
 * @param {string} options.table 表名（调用方负责白名单，来自 dataConfig）
 * @param {string} options.selectColumns select 列串（DataAdmin 的 TAB_SELECT_COLUMNS[tabId]）
 * @param {(query: Object) => Object} [options.decorateQuery]
 *   对 `supabase.from(table).select(columns)` 的返回逐轮注入 tab 级基础过滤与筛选/排序装配；
 *   DataAdmin 侧复用 applySearchAndSort（单一真源），这里不复制筛选逻辑。
 * @param {number} [options.batchSize=1000]
 * @param {number} [options.maxRows=50000] 超过即抛错，绝不静默截断
 * @param {{ columns: string, isLegacySchemaError: (error: unknown) => boolean }} [options.legacyFallback]
 *   查询命中特定缺列错误时改用旧列装配重试（lotteries 观测字段未部署的降级，口径同列表 fetchTabData）。
 * @returns {Promise<Array<Object>>} 全量行
 */
export const fetchRecordById = async ({ table, selectColumns, id }) => {
  const { data, error } = await supabase
    .from(table)
    .select(selectColumns)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const fetchAllRows = async ({
  table,
  selectColumns,
  decorateQuery,
  batchSize = 1000,
  maxRows = 50000,
  legacyFallback = null,
}) => {
  const buildQuery = (columns) => {
    let query = supabase.from(table).select(columns);
    if (decorateQuery) query = decorateQuery(query);
    return query;
  };

  const runBatch = async (columns, from) => {
    const { data, error } = await buildQuery(columns).range(from, from + batchSize - 1);
    if (error) throw error;
    return data || [];
  };

  let activeColumns = selectColumns;
  const rows = [];
  for (let from = 0; ; from += batchSize) {
    let batch;
    try {
      batch = await runBatch(activeColumns, from);
    } catch (error) {
      if (legacyFallback && legacyFallback.isLegacySchemaError(error)) {
        activeColumns = legacyFallback.columns;
        batch = await runBatch(activeColumns, from);
      } else {
        throw error;
      }
    }
    rows.push(...batch);
    if (batch.length < batchSize) break;
    if (rows.length >= maxRows) {
      throw new Error(`结果超过 ${maxRows} 行，请先缩小筛选范围再导出`);
    }
  }
  return rows;
};
