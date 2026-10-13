import { supabase } from '../supabase-client.js';

/**
 * freemodels 表（可用模型清单）的**唯一访问口**。
 *
 * ── 为什么单独建这个文件 ────────────────────────────────────────────
 * 合并「API Key」与「免费模型库」两页时，模型清单的读写要从组件里抽出来。
 * `src/views/**` 与 `src/composables/**` 直连 `supabase.from(...)` 是**分层棘轮**
 * 明令禁止的（表结构改名要散落到几十个组件里）—— 所以这里的每一处读写都必须
 * 落在 `src/utils/**`，组件侧只 import 函数。
 *
 * ── 字段语义 ────────────────────────────────────────────────────────
 * · model_id      —— 供应商的模型标识（上游真实模型名），不是本站内部 mode_id
 *                    （三个 model_id 的区别见 src/config/field-semantics.ts）
 * · api_base_url  —— 名字叫 base，实际存的是**完整 chat/completions 端点**
 *                    （历史如此，存量数据就是这个形状，不要按名字改语义）
 * · sort_order    —— 越小越靠前
 */

export const FREEMODELS_TABLE = 'freemodels';

/** 全部模型，按 sort_order 升序（列表展示的顺序真源）。 */
export async function listFreemodels() {
  const { data, error } = await supabase
    .from(FREEMODELS_TABLE)
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** 当前最大 sort_order（批量导入时从它往后排）。 */
export async function maxFreemodelSortOrder() {
  const { data, error } = await supabase
    .from(FREEMODELS_TABLE)
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.sort_order || 0);
}

/** 这批 model_id 里哪些已经存在（批量导入前查重，避免主键/唯一键冲突）。 */
export async function findExistingFreemodelIds(modelIds) {
  const ids = Array.isArray(modelIds) ? modelIds.filter(Boolean) : [];
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from(FREEMODELS_TABLE)
    .select('model_id')
    .in('model_id', ids);
  if (error) throw error;
  return new Set((data || []).map((row) => row.model_id));
}

/** 新增一条模型。 */
export async function insertFreemodel(row) {
  const { data, error } = await supabase
    .from(FREEMODELS_TABLE)
    .insert([row])
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 批量新增（批量导入用，调用方自己先算好 sort_order）。 */
export async function insertFreemodels(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return 0;
  const { error } = await supabase.from(FREEMODELS_TABLE).insert(list);
  if (error) throw error;
  return list.length;
}

/** 局部更新（编辑、启停、排序共用；只传要改的字段，避免整行覆盖）。 */
export async function updateFreemodel(id, patch) {
  const { error } = await supabase.from(FREEMODELS_TABLE).update(patch).eq('id', id);
  if (error) throw error;
}

/** 删除一条模型。 */
export async function deleteFreemodel(id) {
  const { error } = await supabase.from(FREEMODELS_TABLE).delete().eq('id', id);
  if (error) throw error;
}
