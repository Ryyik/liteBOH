import { supabase } from '../supabase-client.js';
import { executeRead, invalidateByTags, normalizeDbError } from '../request-core.js';
import { getMyCloudEntriesForAI } from './boh-cloud-api.js';

const NOTE_CACHE_TAG = 'boh-note';
const NOTE_COLUMNS = 'user_id, note_date, content, mood, source, created_at, updated_at';

const toText = (value, maxLen = 0) => {
  const text = String(value || '').trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
};

// UUID 验证正则
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 验证并返回有效的 UUID，无效则返回空字符串
const toValidUUID = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (UUID_REGEX.test(text)) return text;
  return '';
};

const toDateKey = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const noteSource = (value) => {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'ai') return 'ai';
  if (safe === 'migrated') return 'migrated';
  return 'manual';
};

const noteMood = (value) => toText(value, 24);

const normalizeNoteRow = (row) => {
  if (!row) return null;
  const noteDate = toDateKey(row.note_date);
  if (!noteDate) return null;
  const userId = String(row.user_id || '');
  return {
    id: `${userId}:${noteDate}`,
    userId,
    noteDate,
    content: String(row.content || ''),
    mood: noteMood(row.mood),
    source: noteSource(row.source),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || '')
  };
};

const invalidateNoteCache = (userId = '') => {
  invalidateByTags([NOTE_CACHE_TAG, userId ? `${NOTE_CACHE_TAG}:user:${userId}` : '']);
};

const isMissingNoteTableError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  if (code === '42P01' || code === 'PGRST205') return true;

  const message = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`
    .toLowerCase();
  if (!message.includes('boh_note_entries')) return false;

  return (
    message.includes('does not exist')
    || message.includes('not exist')
    || message.includes('undefined table')
    || message.includes('schema cache')
    || message.includes('could not find')
  );
};

const buildFallbackDailyRows = (rows = []) => {
  const map = new Map();
  const sorted = [...rows].sort((a, b) => {
    const aTs = Date.parse(a?.updated_at || a?.created_at || 0) || 0;
    const bTs = Date.parse(b?.updated_at || b?.created_at || 0) || 0;
    return aTs - bTs;
  });

  sorted.forEach((row) => {
    const key = toDateKey(row?.updated_at || row?.created_at);
    if (!key) return;
    const content = toText(row?.content, 12000);
    if (!content) return;
    const existed = map.get(key);
    const merged = existed ? `${existed.content}\n${content}` : content;
    const rowMood = noteMood(row?.mood);
    map.set(key, {
      userId: String(row?.user_id || ''),
      noteDate: key,
      content: merged,
      mood: rowMood || existed?.mood || '',
      source: 'migrated',
      createdAt: existed?.createdAt || String(row?.created_at || ''),
      updatedAt: String(row?.updated_at || row?.created_at || existed?.updatedAt || '')
    });
  });

  return [...map.values()].sort((a, b) => String(b.noteDate).localeCompare(String(a.noteDate)));
};

const loadLegacyFallbackNotes = async (userId) => {
  const { data, error } = await supabase
    .from('boh_treehole_memories')
    .select('user_id, content, mood, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(600);

  if (error) {
    return { ok: false, data: [], error: normalizeDbError(error) };
  }
  return { ok: true, data: buildFallbackDailyRows(Array.isArray(data) ? data : []), error: null };
};

export async function getMyNotesByRange({
  userId,
  startDate = '',
  endDate = ''
} = {}) {
  const safeUserId = toValidUUID(userId);
  const safeStart = toDateKey(startDate);
  const safeEnd = toDateKey(endDate);

  if (!safeUserId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeStart || !safeEnd || safeStart > safeEnd) {
    return { ok: false, data: [], error: normalizeDbError({ message: '日期范围无效', code: 'INVALID_DATE_RANGE' }) };
  }

  return executeRead(
    'note.getByRange',
    { userId: safeUserId, startDate: safeStart, endDate: safeEnd },
    async () => {
      const { data, error } = await supabase
        .from('boh_note_entries')
        .select(NOTE_COLUMNS)
        .eq('user_id', safeUserId)
        .gte('note_date', safeStart)
        .lte('note_date', safeEnd)
        .order('note_date', { ascending: false });

      if (error && isMissingNoteTableError(error)) {
        const fallback = await loadLegacyFallbackNotes(safeUserId);
        if (!fallback.ok) return { data: [], error: fallback.error };
        const inRange = fallback.data.filter((item) => item.noteDate >= safeStart && item.noteDate <= safeEnd);
        return { data: inRange, error: null };
      }

      return {
        data: (Array.isArray(data) ? data : []).map(normalizeNoteRow).filter(Boolean),
        error
      };
    },
    {
      ttlMs: 4000,
      tags: [NOTE_CACHE_TAG, `${NOTE_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function upsertMyNoteEntry(userId, payload = {}) {
  const safeUserId = toValidUUID(userId);
  const noteDate = toDateKey(payload.noteDate);
  const content = toText(payload.content, 40000);
  const mood = noteMood(payload.mood);
  const source = noteSource(payload.source);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  // 验证当前会话用户与传入的 userId 匹配
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id || '';
  if (currentUserId !== safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '用户认证不匹配，请重新登录', code: 'AUTH_MISMATCH' }) };
  }
  if (!noteDate) {
    return { ok: false, data: null, error: normalizeDbError({ message: '日记日期无效', code: 'INVALID_NOTE_DATE' }) };
  }
  if (!content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '日记内容不能为空', code: 'EMPTY_NOTE' }) };
  }

  const { data, error } = await supabase
    .from('boh_note_entries')
    .upsert(
      [{
        user_id: safeUserId,
        note_date: noteDate,
        content,
        mood,
        source
      }],
      { onConflict: 'user_id,note_date' }
    )
    .select(NOTE_COLUMNS)
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateNoteCache(safeUserId);
  return { ok: true, data: normalizeNoteRow(data), error: null };
}

export async function deleteMyNoteEntry(userId, noteDate) {
  const safeUserId = toValidUUID(userId);
  const safeDate = toDateKey(noteDate);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeDate) {
    return { ok: false, data: null, error: normalizeDbError({ message: '日记日期无效', code: 'INVALID_NOTE_DATE' }) };
  }

  const { error } = await supabase
    .from('boh_note_entries')
    .delete()
    .eq('user_id', safeUserId)
    .eq('note_date', safeDate);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateNoteCache(safeUserId);
  return { ok: true, data: null, error: null };
}

export async function getMyNotesForAI(userId, { limit = 120 } = {}) {
  const safeUserId = toValidUUID(userId);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(365, Math.trunc(limit))) : 120;

  if (!safeUserId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const cloudResult = await getMyCloudEntriesForAI(safeUserId, { limit: safeLimit });
  if (cloudResult.ok) {
    return cloudResult;
  }

  const { data, error } = await supabase
    .from('boh_note_entries')
    .select(NOTE_COLUMNS)
    .eq('user_id', safeUserId)
    .order('note_date', { ascending: false })
    .limit(safeLimit);

  if (error && isMissingNoteTableError(error)) {
    const fallback = await loadLegacyFallbackNotes(safeUserId);
    if (!fallback.ok) return fallback;
    const limited = fallback.data.slice(0, safeLimit);
    return {
      ok: true,
      data: limited.map((item) => ({
        id: `${item.userId}:${item.noteDate}`,
        userId: item.userId,
        content: item.content,
        mood: item.mood || '',
        tags: ['BOH Cloud+'],
        isStarred: false,
        source: item.source === 'ai' ? 'ai' : 'manual',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt || `${item.noteDate}T00:00:00+08:00`
      })),
      error: null
    };
  }

  if (error) {
    return { ok: false, data: [], error: normalizeDbError(error) };
  }

  const rows = (Array.isArray(data) ? data : [])
    .map(normalizeNoteRow)
    .filter(Boolean)
    .map((item) => ({
      id: `${item.userId}:${item.noteDate}`,
      userId: item.userId,
      content: item.content,
      mood: item.mood || '',
      tags: ['BOH Cloud+'],
      isStarred: false,
      source: item.source === 'ai' ? 'ai' : 'manual',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || `${item.noteDate}T00:00:00+08:00`,
      noteDate: item.noteDate
    }));

  return { ok: true, data: rows, error: null };
}
