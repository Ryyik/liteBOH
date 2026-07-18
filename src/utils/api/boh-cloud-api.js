import { supabase } from '../supabase-client.js';
import { executeRead, invalidateByTags, normalizeDbError } from '../request-core.js';
import { CACHE_TTL_LEVELS } from '../cache-strategy.js';
import {
  buildCloudPreview,
  deriveCloudEntryType,
  flattenCloudBlocksToText,
  normalizeCloudBlocks,
  pickCloudCoverImage
} from '../boh-cloud-content.js';

const CLOUD_CACHE_TAG = 'boh-cloud';
const CLOUD_SHARE_CACHE_TAG = 'boh-cloud-share';
const CLOUD_COLUMNS = 'id, user_id, entry_date, legacy_note_date, title, entry_type, visibility, content_text, content_blocks, cover_image_url, mood, source, created_at, updated_at';
const LEGACY_NOTE_COLUMNS = 'user_id, note_date, content, mood, source, created_at, updated_at';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ENTRY_TYPES = new Set(['text', 'image', 'mixed']);

function toValidUUID(value) {
  const text = String(value || '').trim().toLowerCase();
  return UUID_REGEX.test(text) ? text : '';
}

function toText(value, maxLen = 0) {
  const text = String(value || '').trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function toDateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isLegacyCloudEntryId(value) {
  return String(value || '').trim().startsWith('legacy-');
}

function cloudSource(value) {
  const safe = String(value || '').trim().toLowerCase();
  if (safe === 'ai') return 'ai';
  if (safe === 'migrated') return 'migrated';
  if (safe === 'forum') return 'forum';
  return 'manual';
}

function cloudMood(value) {
  return toText(value, 24);
}

export function normalizeCloudShareToken(value = '') {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);
}

function normalizeCloudShareChannel(row = {}) {
  if (!row || typeof row !== 'object') return null;

  return {
    id: String(row.id || '').trim(),
    userId: String(row.userId || row.user_id || '').trim(),
    shareToken: normalizeCloudShareToken(row.shareToken || row.share_token || ''),
    isActive: row.isActive === undefined ? Boolean(row.is_active) : Boolean(row.isActive),
    visibility: 'token',
    description: toText(row.description, 160),
    viewCount: Math.max(0, Number(row.viewCount ?? row.view_count) || 0),
    lastViewedAt: String(row.lastViewedAt || row.last_viewed_at || '').trim(),
    createdAt: String(row.createdAt || row.created_at || '').trim(),
    updatedAt: String(row.updatedAt || row.updated_at || '').trim(),
    ownerUsername: String(row.ownerUsername || row.owner_username || '').trim(),
    ownerNickname: String(row.ownerNickname || row.owner_nickname || '').trim(),
    ownerAvatarUrl: String(row.ownerAvatarUrl || row.owner_avatar_url || '').trim(),
    entryCount: Math.max(0, Number(row.entryCount ?? row.entry_count) || 0),
    coverImageUrl: String(row.coverImageUrl || row.cover_image_url || '').trim(),
    latestEntryAt: String(row.latestEntryAt || row.latest_entry_at || '').trim()
  };
}

function normalizeCloudShareViewer(row = {}) {
  if (!row || typeof row !== 'object') return null;
  const viewerUserId = String(row.viewerUserId || row.viewer_user_id || '').trim();
  if (!viewerUserId) return null;

  return {
    viewerUserId,
    viewerUsername: String(row.viewerUsername || row.viewer_username || '').trim(),
    viewerAvatarUrl: String(row.viewerAvatarUrl || row.viewer_avatar_url || '').trim(),
    viewCount: Math.max(0, Number(row.viewCount ?? row.view_count) || 0),
    firstViewedAt: String(row.firstViewedAt || row.first_viewed_at || '').trim(),
    lastViewedAt: String(row.lastViewedAt || row.last_viewed_at || '').trim()
  };
}

function normalizeCloudShareRpcError(message = '') {
  const safeMessage = String(message || '').trim();
  if (safeMessage === 'NOT_AUTHENTICATED') return '请先登录';
  if (safeMessage === 'INVALID_TOKEN') return '访问令牌格式无效';
  if (safeMessage === 'TOKEN_NOT_FOUND') return '令牌无效，或对方已关闭共享';
  if (safeMessage === 'CHANNEL_NOT_FOUND') return '共享频道不存在';
  if (safeMessage === 'INVALID_VISIBILITY') return '频道可见性无效';
  if (safeMessage === 'TOKEN_GENERATION_FAILED') return '生成共享令牌失败，请稍后重试';
  return safeMessage || '请求失败';
}

function normalizeCloudEntryWriteError(error) {
  const code = String(error?.code || error?.message || '').trim();
  const message = String(error?.message || '').trim();
  const guardCode = [
    code,
    message,
    String(error?.details || '').trim(),
    String(error?.hint || '').trim()
  ].find((item) => /^CLOUD_|^INVALID_CLOUD_|^EMPTY_CLOUD_ENTRY$/.test(item));

  const messages = {
    EMPTY_CLOUD_ENTRY: '至少添加文字或图片后再发布',
    INVALID_CLOUD_BLOCKS: 'Cloud+ 内容结构无效，请刷新后重试',
    INVALID_CLOUD_BLOCK: 'Cloud+ 内容块无效，请重新编辑后发布',
    INVALID_CLOUD_BLOCK_TYPE: 'Cloud+ 内容类型无效，请重新编辑后发布',
    CLOUD_BLOCKS_TOO_MANY: '单条 Cloud+ 内容块过多，请拆成多条发布',
    CLOUD_TEXT_BLOCK_TOO_LONG: '单段文字过长，请拆分后发布',
    CLOUD_TEXT_BLOCKS_TOO_MANY: '文字段落过多，请拆成多条发布',
    CLOUD_ENTRY_IMAGE_LIMIT_EXCEEDED: '单条 Cloud+ 最多添加 9 张图片',
    CLOUD_IMAGE_LIMIT_EXCEEDED: 'Cloud+ 图片额度已满，请删除旧图片或升级方案',
    CLOUD_ENTRY_RATE_LIMITED: '发布过于频繁，请稍后再试',
    CLOUD_IMAGE_RATE_LIMITED: '图片上传过于频繁，请稍后再试',
    INVALID_CLOUD_IMAGE_URL: '图片来源异常，已阻止发布',
    INVALID_CLOUD_COVER_IMAGE_URL: '封面图片来源异常，已阻止发布',
    INVALID_CLOUD_IMAGE_PUBLIC_ID: '图片资源标识异常，已阻止发布',
    CLOUD_IMAGE_ALT_TOO_LONG: '图片描述过长，请缩短后再发布',
    INVALID_CLOUD_IMAGE_DIMENSIONS: '图片尺寸异常，请换一张图片'
  };

  if (guardCode && messages[guardCode]) {
    return normalizeDbError({ message: messages[guardCode], code: guardCode });
  }

  return normalizeDbError(error);
}

export function normalizeCloudEntryRow(row) {
  if (!row) return null;
  const entryDate = toDateKey(row.entry_date || row.note_date);
  if (!entryDate) return null;

  const blocks = normalizeCloudBlocks(row.content_blocks, row.content_text || row.content);
  const coverImageUrl = pickCloudCoverImage(blocks, row.cover_image_url);
  const previewText = buildCloudPreview(blocks, row.content_text || row.content, 180);

  return {
    id: String(row.id || ''),
    userId: String(row.user_id || ''),
    entryDate,
    legacyNoteDate: toDateKey(row.legacy_note_date),
    title: toText(row.title, 120),
    entryType: ENTRY_TYPES.has(String(row.entry_type || '').trim()) ? String(row.entry_type).trim() : deriveCloudEntryType(blocks, row.content_text || row.content),
    visibility: 'private',
    contentText: String(row.content_text || row.content || ''),
    contentBlocks: blocks,
    coverImageUrl,
    previewText,
    mood: cloudMood(row.mood),
    source: cloudSource(row.source),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || '')
  };
}

function invalidateCloudCache(userId = '') {
  invalidateByTags([CLOUD_CACHE_TAG, userId ? `${CLOUD_CACHE_TAG}:user:${userId}` : '']);
}

function isMissingCloudTableError(error) {
  const code = String(error?.code || '').trim().toUpperCase();
  if (code === '42P01' || code === 'PGRST205') return true;
  const message = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`.toLowerCase();
  return message.includes('boh_cloud_entries') && (
    message.includes('does not exist')
    || message.includes('not exist')
    || message.includes('undefined table')
    || message.includes('schema cache')
    || message.includes('could not find')
  );
}

function normalizeLegacyNoteRowAsCloud(row) {
  if (!row) return null;
  const contentText = String(row.content || '');
  const blocks = normalizeCloudBlocks([], contentText);
  const coverImageUrl = pickCloudCoverImage(blocks, '');
  return {
    id: `legacy-${String(row.user_id || '')}-${toDateKey(row.note_date)}`,
    userId: String(row.user_id || ''),
    entryDate: toDateKey(row.note_date),
    legacyNoteDate: toDateKey(row.note_date),
    title: '',
    entryType: deriveCloudEntryType(blocks, contentText),
    visibility: 'private',
    contentText,
    contentBlocks: blocks,
    coverImageUrl,
    previewText: buildCloudPreview(blocks, contentText, 180),
    mood: cloudMood(row.mood),
    source: cloudSource(row.source),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || '')
  };
}

async function listLegacyNotesAsCloud({ safeUserId, safeStart, safeEnd, safeLimit }) {
  let query = supabase
    .from('boh_note_entries')
    .select(LEGACY_NOTE_COLUMNS)
    .eq('user_id', safeUserId)
    .order('updated_at', { ascending: false })
    .limit(safeLimit);

  if (safeStart) query = query.gte('note_date', safeStart);
  if (safeEnd) query = query.lte('note_date', safeEnd);

  const { data, error } = await query;
  if (error) return { data: [], error };
  return {
    data: (Array.isArray(data) ? data : []).map(normalizeLegacyNoteRowAsCloud).filter(Boolean),
    error: null
  };
}

export async function listMyCloudEntries({
  userId,
  startDate = '',
  endDate = '',
  limit = 240
} = {}) {
  const safeUserId = toValidUUID(userId);
  const safeStart = toDateKey(startDate);
  const safeEnd = toDateKey(endDate);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 240;

  if (!safeUserId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  return executeRead(
    'bohCloud.listEntries',
    { userId: safeUserId, startDate: safeStart, endDate: safeEnd, limit: safeLimit },
    async () => {
      let query = supabase
        .from('boh_cloud_entries')
        .select(CLOUD_COLUMNS)
        .eq('user_id', safeUserId)
        .order('updated_at', { ascending: false })
        .limit(safeLimit);

      if (safeStart) query = query.gte('entry_date', safeStart);
      if (safeEnd) query = query.lte('entry_date', safeEnd);

      const { data, error } = await query;
      if (error && isMissingCloudTableError(error)) {
        return listLegacyNotesAsCloud({ safeUserId, safeStart, safeEnd, safeLimit });
      }
      return {
        data: (Array.isArray(data) ? data : []).map(normalizeCloudEntryRow).filter(Boolean),
        error
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.REALTIME,
      tags: [CLOUD_CACHE_TAG, `${CLOUD_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function createMyCloudEntry(userId, payload = {}) {
  const safeUserId = toValidUUID(userId);
  const entryDate = toDateKey(payload.entryDate) || toDateKey(new Date());
  const title = toText(payload.title, 120);
  const contentText = toText(payload.contentText, 40000);
  const contentBlocks = normalizeCloudBlocks(payload.contentBlocks, contentText);
  const entryType = deriveCloudEntryType(contentBlocks, contentText);
  const visibility = 'private';
  const coverImageUrl = pickCloudCoverImage(contentBlocks, payload.coverImageUrl);
  const mood = cloudMood(payload.mood);
  const source = cloudSource(payload.source);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id || '';
  if (currentUserId !== safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '用户认证不匹配，请重新登录', code: 'AUTH_MISMATCH' }) };
  }

  if (!contentBlocks.length) {
    return { ok: false, data: null, error: normalizeDbError({ message: '至少添加文字或图片后再发布', code: 'EMPTY_CLOUD_ENTRY' }) };
  }

  const { data, error } = await supabase
    .from('boh_cloud_entries')
    .insert([{
      user_id: safeUserId,
      entry_date: entryDate,
      title,
      entry_type: entryType,
      visibility,
      content_text: contentText,
      content_blocks: contentBlocks,
      cover_image_url: coverImageUrl,
      mood,
      source
    }])
    .select(CLOUD_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isMissingCloudTableError(error)) {
      return { ok: false, data: null, error: normalizeDbError({ message: 'BOH Cloud+ 数据表尚未部署，请先执行最新 Supabase migration', code: 'CLOUD_TABLE_MISSING' }) };
    }
    return { ok: false, data: null, error: normalizeCloudEntryWriteError(error) };
  }

  invalidateCloudCache(safeUserId);
  void supabase.functions.invoke('boh-ai-retrieval', {
    body: {
      action: 'sync',
      sourceTypes: ['cloud_entry'],
      syncLimit: 8
    }
  }).catch(() => {});
  return { ok: true, data: normalizeCloudEntryRow(data), error: null };
}

export async function deleteMyCloudEntry(userId, entryId, options = {}) {
  const safeUserId = toValidUUID(userId);
  const safeEntryId = toValidUUID(entryId);
  const legacyNoteDate = toDateKey(options.legacyNoteDate);
  const validateOnly = Boolean(options.validateOnly);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeEntryId && !(isLegacyCloudEntryId(entryId) && legacyNoteDate)) {
    return { ok: false, data: null, error: normalizeDbError({ message: '内容标识无效', code: 'INVALID_ENTRY_ID' }) };
  }

  if (!safeEntryId && isLegacyCloudEntryId(entryId) && legacyNoteDate) {
    if (validateOnly) {
      return { ok: true, data: { id: String(entryId || ''), source: 'manual' }, error: null };
    }

    const { error } = await supabase
      .from('boh_note_entries')
      .delete()
      .eq('user_id', safeUserId)
      .eq('note_date', legacyNoteDate);

    if (error) {
      return { ok: false, data: null, error: normalizeDbError(error) };
    }

    invalidateCloudCache(safeUserId);
    return { ok: true, data: null, error: null };
  }

  const { data: entryRow, error: entryLookupError } = await supabase
    .from('boh_cloud_entries')
    .select('id, source')
    .eq('id', safeEntryId)
    .eq('user_id', safeUserId)
    .maybeSingle();

  if (entryLookupError) {
    if (isMissingCloudTableError(entryLookupError)) {
      return { ok: false, data: null, error: normalizeDbError({ message: 'BOH Cloud+ 数据表尚未部署，请先执行最新 Supabase migration', code: 'CLOUD_TABLE_MISSING' }) };
    }
    return { ok: false, data: null, error: normalizeDbError(entryLookupError) };
  }

  if (!entryRow) {
    return { ok: false, data: null, error: normalizeDbError({ message: '内容不存在或已删除', code: 'ENTRY_NOT_FOUND' }) };
  }

  if (String(entryRow.source || '').trim() === 'forum') {
    return { ok: false, data: null, error: normalizeDbError({
      code: 'FORUM_SYNCED_CLOUD_ENTRY_LOCKED',
      message: '这条内容来自论坛同步，不能在 Cloud+ 里单独删除，请到论坛删除原帖'
    }) };
  }

  if (validateOnly) {
    return { ok: true, data: entryRow, error: null };
  }

  const { error } = await supabase
    .from('boh_cloud_entries')
    .delete()
    .eq('id', safeEntryId)
    .eq('user_id', safeUserId);

  if (error) {
    if (isMissingCloudTableError(error)) {
      return { ok: false, data: null, error: normalizeDbError({ message: 'BOH Cloud+ 数据表尚未部署，请先执行最新 Supabase migration', code: 'CLOUD_TABLE_MISSING' }) };
    }
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateCloudCache(safeUserId);
  return { ok: true, data: null, error: null };
}

export async function getMyCloudEntriesForAI(userId, { limit = 120 } = {}) {
  const safeUserId = toValidUUID(userId);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(365, Math.trunc(limit))) : 120;

  if (!safeUserId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  return executeRead(
    'bohCloud.entriesForAI',
    { userId: safeUserId, limit: safeLimit },
    async (signal) => {
      let query = supabase
        .from('boh_cloud_entries')
        .select(CLOUD_COLUMNS)
        .eq('user_id', safeUserId)
        .order('updated_at', { ascending: false })
        .limit(safeLimit);
      if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);

      const { data, error } = await query;
      if (error) return { data: [], error };

      const rows = (Array.isArray(data) ? data : [])
        .map(normalizeCloudEntryRow)
        .filter(Boolean)
        .map((item) => ({
          id: item.id,
          userId: item.userId,
          content: flattenCloudBlocksToText(item.contentBlocks, item.contentText),
          mood: item.mood || '',
          tags: ['BOH Cloud+'],
          isStarred: false,
          source: item.source === 'ai' ? 'ai' : 'manual',
          createdAt: item.createdAt,
          updatedAt: item.updatedAt || `${item.entryDate}T00:00:00+08:00`,
          noteDate: item.entryDate
        }));

      return { data: rows, error: null };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.USER_DATA,
      tags: [CLOUD_CACHE_TAG, `${CLOUD_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 0
    }
  );
}

export async function getMyCloudShareChannel() {
  return executeRead(
    'bohCloudShare.getMine',
    {},
    async () => {
      const { data, error } = await supabase.rpc('get_my_boh_cloud_share_channel');
      if (error) return { data: null, error };

      const payload = data && typeof data === 'object' ? data : {};
      if (payload.ok === false) {
        return {
          data: null,
          error: { message: normalizeCloudShareRpcError(payload.message), code: payload.message || 'RPC_ERROR' }
        };
      }

      return { data: normalizeCloudShareChannel(payload.channel), error: null };
    },
    { ttlMs: CACHE_TTL_LEVELS.REALTIME, tags: [CLOUD_SHARE_CACHE_TAG], timeoutMs: 8000, retry: 0 }
  );
}

const TOKEN_SHARE_VISIBILITY = 'token';

export async function getMyCloudShareViewers({ limit = 50 } = {}) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 50;

  return executeRead(
    'bohCloudShare.getViewers',
    { limit: safeLimit },
    async () => {
      const { data, error } = await supabase.rpc('get_my_boh_cloud_share_viewers', {
        p_limit: safeLimit,
        p_visibility: TOKEN_SHARE_VISIBILITY
      });
      if (error) return { data: null, error };

      const payload = data && typeof data === 'object' ? data : {};
      if (payload.ok === false) {
        return {
          data: null,
          error: { message: normalizeCloudShareRpcError(payload.message), code: payload.message || 'RPC_ERROR' }
        };
      }

      const viewers = (Array.isArray(payload.viewers) ? payload.viewers : [])
        .map((item) => normalizeCloudShareViewer(item))
        .filter(Boolean);

      return { data: viewers, error: null };
    },
    { ttlMs: CACHE_TTL_LEVELS.REALTIME, tags: [CLOUD_SHARE_CACHE_TAG, `${CLOUD_SHARE_CACHE_TAG}:viewers`], timeoutMs: 8000, retry: 0 }
  );
}

export async function upsertMyCloudShareChannel({ regenerate = false, description = null } = {}) {
  const { data, error } = await supabase.rpc('upsert_my_boh_cloud_share_channel', {
    p_regenerate: Boolean(regenerate),
    p_visibility: TOKEN_SHARE_VISIBILITY,
    p_description: description === null ? null : toText(description, 160)
  });

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  const payload = data && typeof data === 'object' ? data : {};
  if (payload.ok === false) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: normalizeCloudShareRpcError(payload.message), code: payload.message || 'RPC_ERROR' })
    };
  }

  invalidateByTags([CLOUD_SHARE_CACHE_TAG]);
  return { ok: true, data: normalizeCloudShareChannel(payload.channel), error: null };
}

export async function revokeMyCloudShareToken({ description = null } = {}) {
  return upsertMyCloudShareChannel({ regenerate: true, description });
}

export async function setMyCloudShareDescription(description) {
  const { data, error } = await supabase.rpc('set_my_boh_cloud_share_description', {
    p_description: toText(description, 160),
    p_visibility: TOKEN_SHARE_VISIBILITY
  });

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  const payload = data && typeof data === 'object' ? data : {};
  if (payload.ok === false) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: normalizeCloudShareRpcError(payload.message), code: payload.message || 'RPC_ERROR' })
    };
  }

  invalidateByTags([CLOUD_SHARE_CACHE_TAG]);
  return { ok: true, data: normalizeCloudShareChannel(payload.channel), error: null };
}

export async function disableMyCloudShareChannel() {
  const { data, error } = await supabase.rpc('disable_my_boh_cloud_share_channel', {
    p_visibility: TOKEN_SHARE_VISIBILITY
  });

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  const payload = data && typeof data === 'object' ? data : {};
  if (payload.ok === false) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: normalizeCloudShareRpcError(payload.message), code: payload.message || 'RPC_ERROR' })
    };
  }

  invalidateByTags([CLOUD_SHARE_CACHE_TAG]);
  return { ok: true, data: normalizeCloudShareChannel(payload.channel), error: null };
}

export async function deleteMyCloudShareChannel() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const currentUserId = user?.id || '';

  if (authError) {
    return { ok: false, data: null, error: normalizeDbError(authError) };
  }
  if (!toValidUUID(currentUserId)) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const { data, error } = await supabase
    .from('boh_cloud_share_channels')
    .delete()
    .eq('user_id', currentUserId)
    .eq('visibility', TOKEN_SHARE_VISIBILITY)
    .select('id, user_id, share_token, is_active, visibility, description, view_count, last_viewed_at, created_at, updated_at')
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return { ok: false, data: null, error: normalizeDbError({ message: normalizeCloudShareRpcError('CHANNEL_NOT_FOUND'), code: 'CHANNEL_NOT_FOUND' }) };
  }

  invalidateByTags([CLOUD_SHARE_CACHE_TAG, `${CLOUD_SHARE_CACHE_TAG}:token:${normalizeCloudShareToken(data.share_token)}`]);
  return { ok: true, data: normalizeCloudShareChannel(data), error: null };
}

export async function getSharedCloudChannelByToken(shareToken, { limit = 500 } = {}) {
  const safeShareToken = normalizeCloudShareToken(shareToken);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 500;

  if (safeShareToken.length < 12) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '访问令牌格式无效', code: 'INVALID_TOKEN' })
    };
  }

  return executeRead(
    'bohCloudShare.getByToken',
    { shareToken: safeShareToken, limit: safeLimit },
    async () => {
      const { data, error } = await supabase.rpc('get_shared_boh_cloud_channel_by_token', {
        p_share_token: safeShareToken,
        p_limit: safeLimit
      });
      if (error) return { data: null, error };

      const payload = data && typeof data === 'object' ? data : {};
      if (payload.ok === false) {
        return {
          data: null,
          error: { message: normalizeCloudShareRpcError(payload.message), code: payload.message || 'RPC_ERROR' }
        };
      }

      const entries = (Array.isArray(payload.entries) ? payload.entries : [])
        .map((item) => normalizeCloudEntryRow(item))
        .filter(Boolean);

      return {
        data: {
          channel: normalizeCloudShareChannel(payload.channel),
          entries
        },
        error: null
      };
    },
    {
      ttlMs: 0,
      tags: [CLOUD_SHARE_CACHE_TAG, `${CLOUD_SHARE_CACHE_TAG}:token:${safeShareToken}`],
      timeoutMs: 9000,
      retry: 0
    }
  );
}
