import { supabase } from '../../supabase-client.js';
import { executeRead } from '../../request-core.js';
import { CACHE_TTL_LEVELS } from '../../cache-strategy.js';
import { toTrimmedText, TREEHOLE_SHARED_MEMORY_CACHE_TAG } from '../treehole-helpers.js';

/**
 * 允许检索的知识源类型（单一真源）。
 *
 * 必须与 EF `boh-ai-retrieval` 的 `SOURCE_TYPES` 集合、以及迁移里
 * `boh_ai_knowledge_chunks_source_type_check` 的 CHECK 白名单保持一致 ——
 * 三处任一漏加都会表现为「检索静默少一类结果」，不报错。
 * 2026-10-16 新增 `forum_memory`（论坛事实卡）；
 * 2026-10-17 新增 `site_news` / `site_activity`（官方新闻与活动自动扩充知识库）。
 * （三处一致性守卫：tests/unit/bohai-knowledge-source-types-consistency.test.js）
 */
const ALLOWED_KNOWLEDGE_SOURCE_TYPES = [
  'core_memory',
  'shared_memory',
  'cloud_entry',
  'knowledge_base',
  'forum_memory',
  'site_news',
  'site_activity',
];

export async function searchBohAIKnowledgeForAI({
  query = '',
  sourceTypes = ALLOWED_KNOWLEDGE_SOURCE_TYPES,
  limit = 8,
  ensureIndexed = true,
  syncLimit = 40,
  minSimilarity = 0.18,
} = {}) {
  const safeQuery = toTrimmedText(query, 220);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(24, Math.trunc(limit))) : 8;
  const safeSyncLimit = Number.isFinite(syncLimit)
    ? Math.max(1, Math.min(80, Math.trunc(syncLimit)))
    : 40;
  const safeSourceTypes = Array.isArray(sourceTypes)
    ? sourceTypes
        .map((item) => String(item || '').trim())
        .filter((item) => ALLOWED_KNOWLEDGE_SOURCE_TYPES.includes(item))
    : ALLOWED_KNOWLEDGE_SOURCE_TYPES;

  if (!safeQuery || safeSourceTypes.length === 0) {
    return { ok: true, data: { chunks: [], sourceTypes: safeSourceTypes }, error: null };
  }

  return executeRead(
    'bohAIKnowledge.vectorSearch',
    {
      query: safeQuery,
      sourceTypes: safeSourceTypes,
      limit: safeLimit,
      ensureIndexed: Boolean(ensureIndexed),
      syncLimit: safeSyncLimit,
      minSimilarity,
    },
    async () => {
      const { data, error } = await supabase.functions.invoke('boh-ai-retrieval', {
        body: {
          action: 'search',
          query: safeQuery,
          sourceTypes: safeSourceTypes,
          matchCount: safeLimit,
          ensureIndexed: Boolean(ensureIndexed),
          syncLimit: safeSyncLimit,
          minSimilarity,
        },
      });

      if (error) return { data: null, error };
      const payload = data && typeof data === 'object' ? data : {};
      if (payload.ok === false) {
        return {
          data: null,
          error: { message: payload.message || '向量检索失败', code: 'VECTOR_SEARCH_FAILED' },
        };
      }

      return {
        data: payload.data || { chunks: [], sourceTypes: safeSourceTypes },
        error: null,
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.AI_DATA,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG],
      timeoutMs: 25000,
      retry: 0,
    },
  );
}
