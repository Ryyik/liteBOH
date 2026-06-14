import { supabase } from '../../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../../request-core.js';
import {
  toTrimmedText,
  normalizeTags,
  normalizeMemoryRow,
  TREEHOLE_CACHE_TAG,
  TREEHOLE_MEMORY_FETCH_PAGE_SIZE,
  decodeCursorToken,
  buildNextUpdatedAtCursor,
  normalizeDateRangeBoundary,
  toTimestamp,
  toDateKey
} from '../treehole-helpers.js';

const TREEHOLE_MEMORY_COLUMNS = 'id, user_id, content, mood, tags, is_starred, source, created_at, updated_at';

export const invalidateTreeholeCache = (userId) => {
  invalidateByTags([
    TREEHOLE_CACHE_TAG,
    userId ? `${TREEHOLE_CACHE_TAG}:user:${userId}` : ''
  ].filter(Boolean));
};

export async function getMyTreeholeMemories({
  userId,
  page = 1,
  pageSize = 20,
  search = '',
  starredOnly = false,
  cursor = '',
  countMode = 'planned'
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 20;
  const safeSearch = toTrimmedText(search, 80);
  const safeStarredOnly = Boolean(starredOnly);
  const safeCursorToken = toTrimmedText(cursor, 500);
  const safeCursor = decodeCursorToken(safeCursorToken, 'updatedAt');
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const useCursorMode = Boolean(safeCursor);

  return executeRead(
    'treehole.getMyMemories',
    {
      userId: safeUserId,
      page: safePage,
      pageSize: safePageSize,
      search: safeSearch,
      starredOnly: safeStarredOnly,
      cursor: safeCursorToken,
      countMode: safeCountMode
    },
    async () => {
      if (useCursorMode) {
        let cursorQuery = supabase
          .from('boh_treehole_memories')
          .select(TREEHOLE_MEMORY_COLUMNS)
          .eq('user_id', safeUserId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(safePageSize + 1);

        if (safeStarredOnly) {
          cursorQuery = cursorQuery.eq('is_starred', true);
        }
        if (safeSearch) {
          cursorQuery = cursorQuery.ilike('content', `%${safeSearch}%`);
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
            items: pagedRows.map(normalizeMemoryRow),
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
        .from('boh_treehole_memories')
        .select(TREEHOLE_MEMORY_COLUMNS, { count: safeCountMode })
        .eq('user_id', safeUserId)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (safeStarredOnly) {
        query = query.eq('is_starred', true);
      }
      if (safeSearch) {
        query = query.ilike('content', `%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      return {
        data: {
          items: Array.isArray(data) ? data.map(normalizeMemoryRow) : [],
          total: Number(count || 0),
          page: safePage,
          pageSize: safePageSize,
          nextCursor: ''
        },
        error
      };
    },
    {
      ttlMs: 4000,
      tags: [TREEHOLE_CACHE_TAG, `${TREEHOLE_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function getMyTreeholeMemoriesByRange({
  userId,
  startAt = '',
  endAt = '',
  page = 1,
  pageSize = 20,
  search = '',
  starredOnly = false,
  cursor = '',
  countMode = 'planned'
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeStartAt = normalizeDateRangeBoundary(startAt);
  const safeEndAt = normalizeDateRangeBoundary(endAt);
  if (!safeStartAt || !safeEndAt || toTimestamp(safeStartAt) > toTimestamp(safeEndAt)) {
    return { ok: false, data: null, error: normalizeDbError({ message: '时间范围无效', code: 'INVALID_DATE_RANGE' }) };
  }

  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 20;
  const safeSearch = toTrimmedText(search, 80);
  const safeStarredOnly = Boolean(starredOnly);
  const safeCursorToken = toTrimmedText(cursor, 500);
  const safeCursor = decodeCursorToken(safeCursorToken, 'updatedAt');
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const useCursorMode = Boolean(safeCursor);

  return executeRead(
    'treehole.getMyMemoriesByRange',
    {
      userId: safeUserId,
      startAt: safeStartAt,
      endAt: safeEndAt,
      page: safePage,
      pageSize: safePageSize,
      search: safeSearch,
      starredOnly: safeStarredOnly,
      cursor: safeCursorToken,
      countMode: safeCountMode
    },
    async () => {
      if (useCursorMode) {
        let cursorQuery = supabase
          .from('boh_treehole_memories')
          .select(TREEHOLE_MEMORY_COLUMNS)
          .eq('user_id', safeUserId)
          .gte('updated_at', safeStartAt)
          .lte('updated_at', safeEndAt)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(safePageSize + 1);

        if (safeStarredOnly) {
          cursorQuery = cursorQuery.eq('is_starred', true);
        }
        if (safeSearch) {
          cursorQuery = cursorQuery.ilike('content', `%${safeSearch}%`);
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
            items: pagedRows.map(normalizeMemoryRow),
            total: 0,
            page: safePage,
            pageSize: safePageSize,
            startAt: safeStartAt,
            endAt: safeEndAt,
            nextCursor
          },
          error,
          hasMore,
          nextCursor
        };
      }

      let query = supabase
        .from('boh_treehole_memories')
        .select(TREEHOLE_MEMORY_COLUMNS, { count: safeCountMode })
        .eq('user_id', safeUserId)
        .gte('updated_at', safeStartAt)
        .lte('updated_at', safeEndAt)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (safeStarredOnly) {
        query = query.eq('is_starred', true);
      }
      if (safeSearch) {
        query = query.ilike('content', `%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      return {
        data: {
          items: Array.isArray(data) ? data.map(normalizeMemoryRow) : [],
          total: Number(count || 0),
          page: safePage,
          pageSize: safePageSize,
          startAt: safeStartAt,
          endAt: safeEndAt,
          nextCursor: ''
        },
        error
      };
    },
    {
      ttlMs: 4000,
      tags: [TREEHOLE_CACHE_TAG, `${TREEHOLE_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function getMyTreeholeMemoryDensity({
  userId,
  startAt = '',
  endAt = ''
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeStartAt = normalizeDateRangeBoundary(startAt);
  const safeEndAt = normalizeDateRangeBoundary(endAt);
  if (!safeStartAt || !safeEndAt || toTimestamp(safeStartAt) > toTimestamp(safeEndAt)) {
    return { ok: false, data: null, error: normalizeDbError({ message: '时间范围无效', code: 'INVALID_DATE_RANGE' }) };
  }

  return executeRead(
    'treehole.getMyMemoryDensity',
    { userId: safeUserId, startAt: safeStartAt, endAt: safeEndAt },
    async () => {
      const counts = {};
      let total = 0;
      const pageSize = 1000;
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .from('boh_treehole_memories')
          .select('updated_at, created_at')
          .eq('user_id', safeUserId)
          .gte('updated_at', safeStartAt)
          .lte('updated_at', safeEndAt)
          .order('updated_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) {
          return { data: null, error };
        }

        const batch = Array.isArray(data) ? data : [];
        for (const row of batch) {
          const key = toDateKey(row?.updated_at || row?.created_at);
          if (!key) continue;
          counts[key] = Number(counts[key] || 0) + 1;
          total += 1;
        }

        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      return {
        data: {
          total,
          counts,
          startAt: safeStartAt,
          endAt: safeEndAt
        },
        error: null
      };
    },
    {
      ttlMs: 3500,
      tags: [TREEHOLE_CACHE_TAG, `${TREEHOLE_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function getMyTreeholeMemoriesForAI(userId, { limit = 0, pageSize = TREEHOLE_MEMORY_FETCH_PAGE_SIZE } = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(500, Math.max(20, Math.trunc(pageSize))) : TREEHOLE_MEMORY_FETCH_PAGE_SIZE;

  const rows = [];
  let offset = 0;
  let shouldContinue = true;

  while (shouldContinue) {
    const rangeEnd = offset + safePageSize - 1;
    const effectiveRangeEnd = safeLimit > 0 ? Math.min(rangeEnd, safeLimit - 1) : rangeEnd;

    if (safeLimit > 0 && offset > effectiveRangeEnd) {
      break;
    }

    const { data, error } = await supabase
      .from('boh_treehole_memories')
      .select(TREEHOLE_MEMORY_COLUMNS)
      .eq('user_id', safeUserId)
      .order('updated_at', { ascending: false })
      .range(offset, effectiveRangeEnd);

    if (error) {
      return { ok: false, data: [], error: normalizeDbError(error) };
    }

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);

    if (batch.length < safePageSize) {
      shouldContinue = false;
    } else {
      offset += safePageSize;
    }

    if (safeLimit > 0 && rows.length >= safeLimit) {
      rows.length = safeLimit;
      shouldContinue = false;
    }
  }

  return {
    ok: true,
    data: rows.map(normalizeMemoryRow),
    error: null
  };
}

export async function getMyTreeholeStats(userId) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const [totalResult, starredResult] = await Promise.all([
    supabase
      .from('boh_treehole_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', safeUserId),
    supabase
      .from('boh_treehole_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', safeUserId)
      .eq('is_starred', true)
  ]);

  if (totalResult.error) {
    return { ok: false, data: null, error: normalizeDbError(totalResult.error) };
  }
  if (starredResult.error) {
    return { ok: false, data: null, error: normalizeDbError(starredResult.error) };
  }

  return {
    ok: true,
    data: {
      totalMemories: Number(totalResult.count || 0),
      starredMemories: Number(starredResult.count || 0)
    },
    error: null
  };
}

export async function createTreeholeMemory(userId, payload = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const content = toTrimmedText(payload.content, 12000);
  const mood = toTrimmedText(payload.mood, 24);
  const source = payload.source === 'ai' ? 'ai' : 'manual';
  const isStarred = Boolean(payload.isStarred);
  const tags = normalizeTags(payload.tags);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆内容不能为空', code: 'EMPTY_MEMORY' }) };
  }

  const { data, error } = await supabase
    .from('boh_treehole_memories')
    .insert([{
      user_id: safeUserId,
      content,
      mood,
      tags,
      is_starred: isStarred,
      source
    }])
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ message: '请先创建记忆空间', code: 'TREEHOLE_SPACE_REQUIRED' })
      };
    }
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: normalizeMemoryRow(data), error: null };
}

export async function updateTreeholeMemory(userId, memoryId, updates = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeMemoryId = toTrimmedText(memoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆 ID 无效', code: 'INVALID_MEMORY_ID' }) };
  }

  const patch = {};
  if (typeof updates.content !== 'undefined') {
    patch.content = toTrimmedText(updates.content, 12000);
  }
  if (typeof updates.mood !== 'undefined') {
    patch.mood = toTrimmedText(updates.mood, 24);
  }
  if (typeof updates.tags !== 'undefined') {
    patch.tags = normalizeTags(updates.tags);
  }
  if (typeof updates.isStarred !== 'undefined') {
    patch.is_starred = Boolean(updates.isStarred);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'content') && !patch.content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆内容不能为空', code: 'EMPTY_MEMORY' }) };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, data: null, error: null };
  }

  const { data, error } = await supabase
    .from('boh_treehole_memories')
    .update(patch)
    .eq('id', safeMemoryId)
    .eq('user_id', safeUserId)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '记忆不存在或无权限', code: 'TREEHOLE_MEMORY_NOT_FOUND' })
    };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: normalizeMemoryRow(data), error: null };
}

export async function deleteTreeholeMemory(userId, memoryId) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeMemoryId = toTrimmedText(memoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆 ID 无效', code: 'INVALID_MEMORY_ID' }) };
  }

  const { error, count } = await supabase
    .from('boh_treehole_memories')
    .delete({ count: 'exact' })
    .eq('id', safeMemoryId)
    .eq('user_id', safeUserId);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (Number(count || 0) === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '记忆不存在或无权限', code: 'TREEHOLE_MEMORY_NOT_FOUND' })
    };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: null, error: null };
}
