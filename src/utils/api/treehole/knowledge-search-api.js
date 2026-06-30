import { supabase } from '../../supabase-client.js';
import { executeRead, normalizeDbError } from '../../request-core.js';
import { CACHE_TTL_LEVELS } from '../../cache-strategy.js';
import {
  toTrimmedText,
  TREEHOLE_SHARED_MEMORY_CACHE_TAG
} from '../treehole-helpers.js';

export async function searchBohAIKnowledgeForAI({
  query = '',
  sourceTypes = ['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'],
  limit = 8,
  ensureIndexed = true,
  syncLimit = 40,
  minSimilarity = 0.18
} = {}) {
  const safeQuery = toTrimmedText(query, 220);
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(24, Math.trunc(limit)))
    : 8;
  const safeSyncLimit = Number.isFinite(syncLimit)
    ? Math.max(1, Math.min(80, Math.trunc(syncLimit)))
    : 40;
  const safeSourceTypes = Array.isArray(sourceTypes)
    ? sourceTypes
      .map((item) => String(item || '').trim())
      .filter((item) => ['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'].includes(item))
    : ['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'];

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
      minSimilarity
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
          minSimilarity
        }
      });

      if (error) return { data: null, error };
      const payload = data && typeof data === 'object' ? data : {};
      if (payload.ok === false) {
        return {
          data: null,
          error: { message: payload.message || '向量检索失败', code: 'VECTOR_SEARCH_FAILED' }
        };
      }

      return {
        data: payload.data || { chunks: [], sourceTypes: safeSourceTypes },
        error: null
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.AI_DATA,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG],
      timeoutMs: 25000,
      retry: 0
    }
  );
}
