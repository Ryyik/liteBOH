import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';

const CREATOR_SHOWS_TAG = 'creator-shows';

export const CREATOR_SHOW_PLATFORMS = Object.freeze([
  { key: 'bilibili', label: '哔哩哔哩', hosts: ['bilibili.com', 'b23.tv'] },
  { key: 'xiaohongshu', label: '小红书', hosts: ['xiaohongshu.com', 'xhslink.com'] },
  { key: 'douyin', label: '抖音', hosts: ['douyin.com', 'iesdouyin.com'] }
]);

const PLATFORM_MAP = CREATOR_SHOW_PLATFORMS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

function normalizeText(value, maxLength) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function matchHost(hostname, allowHosts = []) {
  const safeHostname = String(hostname || '').toLowerCase();
  if (!safeHostname) return false;
  return allowHosts.some((host) =>
    safeHostname === host || safeHostname.endsWith(`.${host}`)
  );
}

function parseHttpUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeShowRow(row = {}) {
  const platformKey = normalizeText(row.creator_platform, 24).toLowerCase();
  const platformMeta = PLATFORM_MAP[platformKey] || { key: platformKey, label: platformKey || '未知平台' };

  return {
    id: row.id || '',
    title: normalizeText(row.title, 80),
    description: normalizeText(row.description, 320),
    videoPlatform: platformMeta.key,
    videoPlatformLabel: platformMeta.label,
    videoUrl: normalizeText(row.video_url, 500),
    creatorPlatformId: normalizeText(row.creator_platform_id, 64),
    authorId: row.author_id || '',
    authorUsername: normalizeText(row.author_username, 64),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function validateCreatorShowPayload(payload = {}) {
  const title = normalizeText(payload.title, 80);
  const description = normalizeText(payload.description, 320);
  const creatorPlatform = normalizeText(payload.creatorPlatform || payload.creator_platform, 24).toLowerCase();
  const videoUrl = normalizeText(payload.videoUrl || payload.video_url, 500);
  const platformMeta = PLATFORM_MAP[creatorPlatform];

  if (!title) {
    return { ok: false, message: '节目标题不能为空' };
  }
  if (!description) {
    return { ok: false, message: '节目简介不能为空' };
  }
  if (!platformMeta) {
    return { ok: false, message: '请选择受支持的发布平台' };
  }

  const parsedUrl = parseHttpUrl(videoUrl);
  if (!parsedUrl) {
    return { ok: false, message: '请填写有效的视频链接（http/https）' };
  }
  if (!matchHost(parsedUrl.hostname, platformMeta.hosts)) {
    return { ok: false, message: `当前链接不是${platformMeta.label}视频链接` };
  }

  return {
    ok: true,
    message: '',
    data: {
      title,
      description,
      creator_platform: creatorPlatform,
      video_url: videoUrl
    }
  };
}

export async function getCreatorShows(options = {}) {
  const limit = Number.isFinite(Number(options.limit))
    ? Math.min(100, Math.max(1, Math.trunc(Number(options.limit))))
    : 24;

  return executeRead(
    'creatorShows.getList',
    { limit },
    async () => {
      const { data, error } = await supabase
        .from('boh_creator_shows')
        .select(`
          id,
          author_id,
          author_username,
          creator_platform,
          creator_platform_id,
          title,
          description,
          video_url,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return { data: [], error };
      return { data: (data || []).map((item) => normalizeShowRow(item)), error: null };
    },
    { ttlMs: 10000, tags: [CREATOR_SHOWS_TAG], timeoutMs: 8000, retry: 1 }
  );
}

export async function createCreatorShow(payload = {}, author = {}) {
  const validated = validateCreatorShowPayload(payload);
  if (!validated.ok) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: validated.message, code: 'VALIDATION_ERROR' })
    };
  }

  const authorId = normalizeText(author.userId || author.authorId || payload.author_id, 80);
  if (!authorId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '用户未登录或身份无效', code: 'NOT_AUTHENTICATED' })
    };
  }

  const insertRow = {
    ...validated.data,
    author_id: authorId,
    author_username: normalizeText(author.username, 64)
  };

  const { data, error } = await supabase
    .from('boh_creator_shows')
    .insert([insertRow])
    .select(`
      id,
      author_id,
      author_username,
      creator_platform,
      creator_platform_id,
      title,
      description,
      video_url,
      created_at,
      updated_at
    `)
    .single();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateByTags([CREATOR_SHOWS_TAG, 'profiles']);
  return { ok: true, data: normalizeShowRow(data), error: null };
}

export async function deleteCreatorShow(showId, author = {}) {
  const safeShowId = normalizeText(showId, 80);
  if (!safeShowId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '节目 ID 无效', code: 'INVALID_SHOW_ID' })
    };
  }

  const authorId = normalizeText(author.userId || author.authorId, 80);
  if (!authorId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '用户未登录或身份无效', code: 'NOT_AUTHENTICATED' })
    };
  }

  const { error, count } = await supabase
    .from('boh_creator_shows')
    .delete({ count: 'exact' })
    .eq('id', safeShowId)
    .eq('author_id', authorId);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (Number(count || 0) === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '节目不存在或你没有删除权限', code: 'SHOW_NOT_FOUND_OR_FORBIDDEN' })
    };
  }

  invalidateByTags([CREATOR_SHOWS_TAG, 'profiles']);
  return { ok: true, data: null, error: null };
}
