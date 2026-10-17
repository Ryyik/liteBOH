import { supabase } from '../../supabase-client.js';

/**
 * 官方事实（boh_ai_core_memories）管理侧写入 —— 数据管理面板「速记输入框」使用。
 *
 * 收口目的：视图层不得直连 `supabase.from`（scripts/check-layering.mjs 棘轮，
 * 2026-10-16 速记入库首版因此在 verify 红过一次）。抽屉新增/编辑仍走
 * DataAdmin 的 SAVE_STRATEGIES 存量通道；这里只收口速记条的新增。
 *
 * @param {Record<string, unknown>} payload 已经 SAVE_STRATEGIES.coreMemories
 *   归一化（含 title/content/category/tags/priority/source_label/status/updated_by）的行。
 * @returns {Promise<Record<string, unknown> | null>} 插入后的完整行（用于 toast「编辑」直达）。
 */
export async function createCoreMemoryRow(payload) {
  const { data, error } = await supabase.from('boh_ai_core_memories').insert([payload]).select();
  if (error) throw error;
  return Array.isArray(data) && data[0] ? data[0] : null;
}

/**
 * 触发 `boh-ai-retrieval` 的向量索引同步（admin 面板保存后即时同步用）。
 * 收口目的同上：视图层不得直连 `supabase.functions.invoke`（layering 棘轮，
 * 2026-10-17 syncSiteContentIndex 首版因此红过 CI）。
 * @param {string[]} sourceTypes 允许同步的知识源（须在 EF SOURCE_TYPES 白名单内）。
 * @param {number} [syncLimit=80]
 */
export async function syncKnowledgeSources(sourceTypes, syncLimit = 80) {
  const { error } = await supabase.functions.invoke('boh-ai-retrieval', {
    body: { action: 'sync', sourceTypes, syncLimit },
  });
  if (error) throw error;
}
