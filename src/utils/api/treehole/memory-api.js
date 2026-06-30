import { supabase } from '../../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../../request-core.js';
import { CACHE_TTL_LEVELS } from '../../cache-strategy.js';
import {
  UNIFIED_APPROVED_STATUS,
  UNIFIED_REJECTED_STATUS,
  runKeywordPrecheck,
  runAsyncRelaxedModeration,
  writeModerationAuditLog,
  isMissingDbColumnError
} from '../../unified-content-moderation.js';
import {
  toTrimmedText,
  normalizeTags,
  clampNumber,
  normalizeEvidence,
  normalizeSharedMemoryRow,
  buildSharedMemoryOwnerTag,
  TREEHOLE_SHARED_MEMORY_CACHE_TAG,
  TREEHOLE_SHARED_MEMORY_FETCH_LIMIT,
  TREEHOLE_SHARED_MEMORY_SEARCH_LIMIT,
  SHARED_MEMORY_ASYNC_MODERATION_TIMEOUT_MS,
  decodeCursorToken,
  buildNextUpdatedAtCursor,
  tokenizeSharedMemoryQuery,
  scoreSharedMemoryByQuery,
  buildSharedMemoryModerationInput,
  isMissingSharedMemoryTableError
} from '../treehole-helpers.js';

const TREEHOLE_SHARED_MEMORY_COLUMNS = `
  id,
  owner_user_id,
  content,
  mood,
  tags,
  confidence,
  evidence,
  source,
  status,
  created_at,
  updated_at
`;
const TREEHOLE_SHARED_MEMORY_COLUMNS_WITH_MODERATION = `
  id,
  owner_user_id,
  content,
  mood,
  tags,
  confidence,
  evidence,
  source,
  status,
  moderation_status,
  moderation_reason,
  created_at,
  updated_at
`;

export const invalidateSharedMemoryCache = (userId = '') => {
  invalidateByTags([
    TREEHOLE_SHARED_MEMORY_CACHE_TAG,
    buildSharedMemoryOwnerTag(userId)
  ].filter(Boolean));
};

const isMissingSharedMemoryModerationColumnError = (error) => {
  return isMissingDbColumnError(error, 'moderation_status')
    || isMissingDbColumnError(error, 'moderation_reason');
};

const isMissingSharedMemorySearchFunctionError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST202'
    || code === '42883'
    || message.includes('search_boh_ai_shared_memories');
};

async function insertSharedMemoryWithModerationCompatibility(basePayload = {}) {
  const enhancedPayload = {
    ...basePayload,
    moderation_status: UNIFIED_APPROVED_STATUS,
    moderation_reason: null
  };

  let result = await supabase
    .from('boh_ai_shared_memories')
    .insert([enhancedPayload])
    .select()
    .maybeSingle();

  if (!result.error) return result;
  if (!isMissingSharedMemoryModerationColumnError(result.error)) return result;

  result = await supabase
    .from('boh_ai_shared_memories')
    .insert([basePayload])
    .select()
    .maybeSingle();
  return result;
}

async function applySharedMemoryModerationDecision(sharedMemoryId, moderationResult = {}) {
  const safeId = toTrimmedText(sharedMemoryId, 64);
  if (!safeId) return;

  const normalizedStatus = moderationResult?.status === UNIFIED_REJECTED_STATUS
    ? UNIFIED_REJECTED_STATUS
    : UNIFIED_APPROVED_STATUS;
  const reason = toTrimmedText(
    moderationResult?.reason ||
    moderationResult?.message ||
    moderationResult?.reasonCode ||
    '',
    240
  );

  const patch = {
    moderation_status: normalizedStatus,
    moderation_reason: normalizedStatus === UNIFIED_APPROVED_STATUS ? null : (reason || null),
    updated_at: new Date().toISOString()
  };

  if (normalizedStatus === UNIFIED_REJECTED_STATUS) {
    // 兼容旧查询：被拒绝内容统一归档，避免继续在 active 流中被检索。
    patch.status = 'archived';
  }

  let result = await supabase
    .from('boh_ai_shared_memories')
    .update(patch)
    .eq('id', safeId);

  if (!result.error) return;
  if (!isMissingSharedMemoryModerationColumnError(result.error)) return;

  const fallbackPatch = {
    updated_at: new Date().toISOString()
  };
  if (normalizedStatus === UNIFIED_REJECTED_STATUS) {
    fallbackPatch.status = 'archived';
  }

  await supabase
    .from('boh_ai_shared_memories')
    .update(fallbackPatch)
    .eq('id', safeId);
}

async function scheduleSharedMemoryModeration(sharedMemoryRow = {}) {
  const sharedMemoryId = toTrimmedText(sharedMemoryRow?.id, 64);
  const ownerUserId = toTrimmedText(sharedMemoryRow?.owner_user_id || sharedMemoryRow?.ownerUserId, 64);
  const content = toTrimmedText(sharedMemoryRow?.content, 1200);
  if (!sharedMemoryId || !ownerUserId || !content) return;

  try {
    const moderationInput = buildSharedMemoryModerationInput(content);
    const moderationResult = await runAsyncRelaxedModeration(moderationInput, {
      scene: 'boh_shared_memory',
      timeoutMs: SHARED_MEMORY_ASYNC_MODERATION_TIMEOUT_MS
    });

    await writeModerationAuditLog({
      targetId: sharedMemoryId,
      targetType: 'shared_memory',
      result: moderationResult,
      moderatorId: null
    });

    if (moderationResult.status !== UNIFIED_REJECTED_STATUS) return;

    await applySharedMemoryModerationDecision(sharedMemoryId, moderationResult);
    invalidateSharedMemoryCache(ownerUserId);
  } catch (error) {
    console.warn('公共记忆异步审查失败（不阻断）:', error);
  }
}

export async function getSharedAIMemoriesForAI({ limit = TREEHOLE_SHARED_MEMORY_FETCH_LIMIT } = {}) {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(TREEHOLE_SHARED_MEMORY_FETCH_LIMIT, Math.trunc(limit)))
    : TREEHOLE_SHARED_MEMORY_FETCH_LIMIT;

  return executeRead(
    'sharedMemory.getForAI',
    { limit: safeLimit },
    async () => {
      let result = await supabase
        .from('boh_ai_shared_memories')
        .select(TREEHOLE_SHARED_MEMORY_COLUMNS_WITH_MODERATION)
        .eq('status', 'active')
        .eq('moderation_status', UNIFIED_APPROVED_STATUS)
        .order('updated_at', { ascending: false })
        .limit(safeLimit);

      if (result.error && isMissingSharedMemoryModerationColumnError(result.error)) {
        result = await supabase
          .from('boh_ai_shared_memories')
          .select(TREEHOLE_SHARED_MEMORY_COLUMNS)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(safeLimit);
      }

      return {
        data: Array.isArray(result.data) ? result.data.map(normalizeSharedMemoryRow).filter(Boolean) : [],
        error: result.error || null
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.USER_DATA,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function searchSharedAIMemoriesForAI({ query = '', limit = 12 } = {}) {
  const safeQuery = toTrimmedText(query, 180);
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(TREEHOLE_SHARED_MEMORY_SEARCH_LIMIT, Math.trunc(limit)))
    : 12;

  return executeRead(
    'sharedMemory.searchForAI',
    { query: safeQuery, limit: safeLimit },
    async () => {
      if (!safeQuery) {
        const latestResult = await getSharedAIMemoriesForAI({ limit: safeLimit });
        return {
          data: Array.isArray(latestResult?.data) ? latestResult.data : [],
          error: latestResult?.error || null
        };
      }

      const { data, error } = await supabase.rpc('search_boh_ai_shared_memories', {
        p_query: safeQuery,
        p_limit: safeLimit
      });

      if (!error) {
        return {
          data: Array.isArray(data) ? data.map(normalizeSharedMemoryRow).filter(Boolean) : [],
          error: null
        };
      }

      if (!isMissingSharedMemorySearchFunctionError(error)) {
        return { data: [], error };
      }

      // 兼容旧环境：RPC 未部署时回退到本地打分筛选。
      const fallbackLimit = Math.min(
        TREEHOLE_SHARED_MEMORY_FETCH_LIMIT,
        Math.max(80, safeLimit * 8)
      );
      const fallbackResult = await getSharedAIMemoriesForAI({ limit: fallbackLimit });
      if (!fallbackResult.ok) {
        return {
          data: [],
          error: fallbackResult.error
        };
      }

      const source = Array.isArray(fallbackResult.data) ? fallbackResult.data : [];
      const tokens = tokenizeSharedMemoryQuery(safeQuery);
      const ranked = source
        .map((row) => ({
          row,
          score: scoreSharedMemoryByQuery(row, safeQuery, tokens)
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(b.row?.updatedAt || '').localeCompare(String(a.row?.updatedAt || ''));
        })
        .map((item) => item.row);

      const selected = (ranked.length > 0 ? ranked : source).slice(0, safeLimit);
      return {
        data: selected,
        error: null
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.AI_DATA,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function createSharedAIMemory(userId, payload = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const content = toTrimmedText(payload.content, 1200);
  const mood = toTrimmedText(payload.mood, 24);
  const tags = normalizeTags(payload.tags);
  const confidence = clampNumber(payload.confidence, 0, 1, 0);
  const evidence = normalizeEvidence(payload.evidence);
  const source = payload.source === 'manual' ? 'manual' : 'capture';
  const status = payload.status === 'archived' ? 'archived' : 'active';

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆内容不能为空', code: 'EMPTY_SHARED_MEMORY' }) };
  }

  const moderationInput = buildSharedMemoryModerationInput(content);
  const keywordCheckResult = runKeywordPrecheck(moderationInput, { scene: 'boh_shared_memory' });
  if (keywordCheckResult.status === UNIFIED_REJECTED_STATUS) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        message: keywordCheckResult.message || '命中高风险违禁词，已拒绝写入公共记忆',
        code: 'LOCAL_KEYWORD_BLOCK'
      })
    };
  }

  const basePayload = {
    owner_user_id: safeUserId,
    content,
    mood,
    tags,
    confidence,
    evidence,
    source,
    status
  };
  const { data, error } = await insertSharedMemoryWithModerationCompatibility(basePayload);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '公共记忆不存在或无权限', code: 'SHARED_MEMORY_NOT_FOUND' })
    };
  }

  const insertedSharedMemoryId = toTrimmedText(data?.id, 64);
  invalidateSharedMemoryCache(safeUserId);
  if (status === 'active') {
    void supabase.functions.invoke('boh-ai-retrieval', {
      body: {
        action: 'sync',
        sourceTypes: ['shared_memory'],
        syncLimit: 8
      }
    }).catch(() => { });
  }
  if (insertedSharedMemoryId) {
    void scheduleSharedMemoryModeration({
      id: insertedSharedMemoryId,
      owner_user_id: safeUserId,
      content
    });
  }
  return { ok: true, data: normalizeSharedMemoryRow(data), error: null };
}

export async function getMySharedAIMemories({
  userId,
  page = 1,
  pageSize = 20,
  status = 'all',
  cursor = '',
  countMode = 'planned'
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 20;
  const safeStatus = status === 'active' || status === 'archived' ? status : 'all';
  const safeCursorToken = toTrimmedText(cursor, 500);
  const safeCursor = decodeCursorToken(safeCursorToken, 'updatedAt');
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const useCursorMode = Boolean(safeCursor);

  return executeRead(
    'sharedMemory.getMine',
    {
      userId: safeUserId,
      page: safePage,
      pageSize: safePageSize,
      status: safeStatus,
      cursor: safeCursorToken,
      countMode: safeCountMode
    },
    async () => {
      if (useCursorMode) {
        let cursorQuery = supabase
          .from('boh_ai_shared_memories')
          .select(TREEHOLE_SHARED_MEMORY_COLUMNS)
          .eq('owner_user_id', safeUserId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(safePageSize + 1);

        if (safeStatus !== 'all') {
          cursorQuery = cursorQuery.eq('status', safeStatus);
        }
        if (safeCursor?.updatedAt) {
          cursorQuery = cursorQuery.lt('updated_at', safeCursor.updatedAt);
        }

        const { data, error } = await cursorQuery;
        const safeRows = Array.isArray(data) ? data : [];
        const hasMore = safeRows.length > safePageSize;
        const pagedRows = safeRows.slice(0, safePageSize);
        const nextCursor = buildNextUpdatedAtCursor(pagedRows, hasMore);

        return {
          data: {
            items: pagedRows.map(normalizeSharedMemoryRow).filter(Boolean),
            total: 0,
            page: safePage,
            pageSize: safePageSize,
            nextCursor
          },
          error,
          hasMore,
          nextCursor
        };
      }

      let query = supabase
        .from('boh_ai_shared_memories')
        .select(TREEHOLE_SHARED_MEMORY_COLUMNS, { count: safeCountMode })
        .eq('owner_user_id', safeUserId)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (safeStatus !== 'all') {
        query = query.eq('status', safeStatus);
      }

      const { data, error, count } = await query;
      return {
        data: {
          items: Array.isArray(data) ? data.map(normalizeSharedMemoryRow).filter(Boolean) : [],
          total: Number(count || 0),
          page: safePage,
          pageSize: safePageSize,
          nextCursor: ''
        },
        error
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.REALTIME,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG, buildSharedMemoryOwnerTag(safeUserId)],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function updateSharedAIMemory(userId, sharedMemoryId, updates = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeSharedMemoryId = toTrimmedText(sharedMemoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeSharedMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆 ID 无效', code: 'INVALID_SHARED_MEMORY_ID' }) };
  }

  const patch = {};
  if (typeof updates.content !== 'undefined') {
    patch.content = toTrimmedText(updates.content, 1200);
  }
  if (typeof updates.mood !== 'undefined') {
    patch.mood = toTrimmedText(updates.mood, 24);
  }
  if (typeof updates.tags !== 'undefined') {
    patch.tags = normalizeTags(updates.tags);
  }
  if (typeof updates.status !== 'undefined') {
    const safeStatus = updates.status === 'archived' ? 'archived' : (updates.status === 'active' ? 'active' : '');
    if (!safeStatus) {
      return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆状态无效', code: 'INVALID_SHARED_MEMORY_STATUS' }) };
    }
    patch.status = safeStatus;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'content') && !patch.content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆内容不能为空', code: 'EMPTY_SHARED_MEMORY' }) };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, data: null, error: null };
  }

  const { data, error } = await supabase
    .from('boh_ai_shared_memories')
    .update(patch)
    .eq('id', safeSharedMemoryId)
    .eq('owner_user_id', safeUserId)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '公共记忆不存在或无权限', code: 'SHARED_MEMORY_NOT_FOUND' })
    };
  }

  invalidateSharedMemoryCache(safeUserId);
  return { ok: true, data: normalizeSharedMemoryRow(data), error: null };
}

export async function updateSharedAIMemoryStatus(userId, sharedMemoryId, status = 'active') {
  return updateSharedAIMemory(userId, sharedMemoryId, { status });
}

export async function deleteSharedAIMemory(userId, sharedMemoryId) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeSharedMemoryId = toTrimmedText(sharedMemoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeSharedMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆 ID 无效', code: 'INVALID_SHARED_MEMORY_ID' }) };
  }

  const { error, count } = await supabase
    .from('boh_ai_shared_memories')
    .delete({ count: 'exact' })
    .eq('id', safeSharedMemoryId)
    .eq('owner_user_id', safeUserId);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (Number(count || 0) === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '公共记忆不存在或无权限', code: 'SHARED_MEMORY_NOT_FOUND' })
    };
  }

  invalidateSharedMemoryCache(safeUserId);
  return { ok: true, data: null, error: null };
}
