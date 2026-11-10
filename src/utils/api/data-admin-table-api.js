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

/**
 * 按 id 批量取原始行（「最近删除」的批量快照用）。
 *
 * 为什么要单独一个函数：批量删除快照必须来自**库里的原始行**，不能直接把列表行
 * 存下来 —— 列表行带展示派生列（`entry_count` / `shipping_*` / `gift_scope_label` …），
 * 恢复时 `insert` 会因「unknown column」整体失败（2026-11-10 修）。
 */
export const fetchRecordsByIds = async ({ table, selectColumns = '*', ids = [] }) => {
  const cleanIds = (Array.isArray(ids) ? ids : []).filter(
    (id) => id !== undefined && id !== null && id !== '',
  );
  if (!cleanIds.length) return [];
  const { data, error } = await supabase.from(table).select(selectColumns).in('id', cleanIds);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

/**
 * 把一行插回原表（数据管理「最近删除」的恢复动作）。
 *
 * 收口在这里而不是视图里：`check:layering` 对 DataAdmin 的 supabase 直连次数有棘轮，
 * 视图直接 `.from().insert()` 会把它推高 —— 而且表名来自快照（运行期字符串），
 * 放在 API 层更容易在写之前统一校验。
 *
 * @param {string} table 表名（调用方负责白名单，来源是删除时的 dataConfig.table）
 * @param {Object} row 删除时保存的整行快照
 */
export const insertAdminRow = async (table, row) => {
  const { data, error } = await supabase.from(table).insert([row]).select('*').maybeSingle();
  if (error) throw error;
  return data;
};

/**
 * 物理删除一行。
 *
 * ⚠️ 没有软删兜底：调用方**必须**保证「删除前先把整行取到内存」，删除成功后再写
 * 本机删除快照（`ADMIN_STORAGE_KEYS.deletedSnapshots`）。两件事的先后不能合并成
 * 「先写快照再删」—— 删除失败时会在「最近删除」里留下一条其实还在库里的幽灵记录，
 * 恢复必然主键冲突。取原始行同理必须在删除**之前**：删完就查不到了。
 *
 * @param {string} table 表名（调用方负责白名单）
 * @param {string|number} id 主键
 */
export const deleteAdminRow = async (table, id) => {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
};

/**
 * 就地编辑的单字段写入通道。
 *
 * 收口在这里的理由同 insertAdminRow：`check:layering` 对视图直连 supabase 的次数
 * 有棘轮。就地编辑是**高频**路径（每次失焦一次请求），放在 API 层也便于统一挂
 * 表名/列名上下文，出错时日志能直接定位是哪一格。
 *
 * 返回值刻意带上 `.select()`：调用方拿更新后的整行做校准（DB 默认值、触发器回填
 * 的列都可能在写入后变化），避免本地乐观值和服务端值长期分叉。
 *
 * @param {string} table 表名（调用方负责白名单，来源是 dataConfig.table）
 * @param {string|number} id 主键
 * @param {Object} patch 只包含要改的列
 * @returns {Promise<Object|null>} 写入后的整行
 */
export const patchAdminRow = async (table, id, patch) => {
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', id)
    .select('*')
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
