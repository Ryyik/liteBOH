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

/**
 * 管理员导入 JSONL 知识库（boh_ai_knowledge_bases + 向量切片即时入库）。
 *
 * 数据管理面板「官方事实」tab 的 JSONL 导入入口使用（2026-10-18）。EF 侧
 * `import_knowledge_base` 允许「管理员 JWT 或 sync secret」二选一 —— 面板走
 * 前者（invoke 自动带当前会话的 Authorization），密钥永远不进前端包。
 * 同 slug 重复导入按 chunk_index 覆盖 + 多余切片归档（EF 内部处理）。
 *
 * @param {object} payload
 * @param {string} payload.slug 知识库标识（同 slug 覆盖更新）
 * @param {string} [payload.title]
 * @param {string} [payload.visibility='public']
 * @param {string} payload.jsonl 每行一个 JSON：{ content 必填, title/summary/keywords/tags/chunk_id 选填 }
 * @param {Record<string, unknown>} [payload.metadata]
 * @returns {Promise<{knowledgeBaseId:string, slug:string, chunkCount:number, upsertedCount:number, embeddingModel:string}>}
 */
export async function importKnowledgeBaseByAdmin(payload) {
  const { data, error } = await supabase.functions.invoke('boh-ai-retrieval', {
    body: { action: 'import_knowledge_base', visibility: 'public', ...payload },
  });
  if (error) throw error;
  // ⚠️ EF 的响应体是 `{ ok, data }` 信封 —— 必须解一层，否则调用方读到 undefined
  return data?.data || {};
}

/**
 * 论坛事实卡摄取进度（数据管理面板「补扫存量」用）。
 * 已扫账本 boh_ai_forum_memory_scans 对 authenticated 管理员可读（admin_select 策略）。
 * @returns {Promise<{scanned:number, total:number, remaining:number}>}
 */
export async function getForumMemoryIngestProgress() {
  const [scansResult, postsResult] = await Promise.all([
    supabase.from('boh_ai_forum_memory_scans').select('post_id', { count: 'exact', head: true }),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
  ]);
  if (scansResult.error) throw scansResult.error;
  if (postsResult.error) throw postsResult.error;
  const scanned = scansResult.count || 0;
  const total = postsResult.count || 0;
  return { scanned, total, remaining: Math.max(0, total - scanned) };
}

/**
 * 手动触发一轮论坛事实卡摄取（管理员面板通道）。
 * EF `boh-ai-forum-memory` 单轮预算 110s、上限 12 帖（含 wait:true 同步返回统计）；
 * 「补扫存量」= 面板侧循环调用本函数直到进度追平。管理员 JWT 通道 2026-10-18 加入。
 * @param {number} [limit=12] 本轮最多处理多少帖（EF 侧 clamp 到 1-60，受预算提前收工）
 * @returns {Promise<{scanned:number, inserted:number, skipped:number, failed:number, archivedStale:number, indexed:boolean, errors:string[]}>}
 */
export async function runForumMemoryIngestBatch(limit = 12) {
  const { data, error } = await supabase.functions.invoke('boh-ai-forum-memory', {
    body: { limit, wait: true },
  });
  if (error) throw error;
  // ⚠️ EF 同步分支返回 `{ ok, data: stats }`（2026-10-19 实证）：
  // 少解一层会让面板永远读到 scanned=0 → 「连续两轮零进展」误停（实际已入库 20 条）。
  return data?.data || {};
}
