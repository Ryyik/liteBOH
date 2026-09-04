import { supabase } from '../supabase-client.js';
import { executeRead } from '../request-core.js';
import { logger } from '../logger.js';

const OVERVIEW_TIMEOUT_MS = 12000;

export const OVERVIEW_DEFAULT_LIMIT = 30;

// 个性化数据：ttlMs 固定为 0，只复用 executeRead 的超时与重试，不进共享缓存
const normalizeItem = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  return {
    type: raw.type === 'news' ? 'news' : 'post',
    id: String(raw.id ?? ''),
    title: String(raw.title ?? '').trim() || '无标题',
    excerpt: String(raw.excerpt ?? '').trim(),
    author: String(raw.author ?? '').trim() || '方块之家',
    authorAvatar: raw.author_avatar || '',
    publishedAt: raw.published_at || null,
    image: raw.image || '',
    category: String(raw.category ?? '').trim()
  };
};

export const fetchOfflineOverview = async ({
  anchor = null,
  limit = OVERVIEW_DEFAULT_LIMIT,
  offset = 0,
  signal = null
} = {}) => {
  const { data, error } = await executeRead(
    'overview.offline',
    { anchor: anchor || null, limit, offset },
    async () => {
      const rpcParams = { p_limit: limit, p_offset: offset };
      if (anchor) rpcParams.p_anchor = anchor;
      const { data, error } = await supabase.rpc('get_offline_overview', rpcParams);
      return { data, error };
    },
    { ttlMs: 0, timeoutMs: OVERVIEW_TIMEOUT_MS, retry: 1, signal }
  );

  if (error) {
    logger.error('overview-api', '获取离线概览失败', error);
    throw error;
  }

  const payload = data && typeof data === 'object' ? data : {};
  return {
    anchor: payload.anchor || null,
    anchorSource: String(payload.anchor_source || 'profile'),
    isFirstLogin: Boolean(payload.is_first_login),
    serverTime: payload.server_time || null,
    total: Number(payload.total) || 0,
    hasMore: Boolean(payload.has_more),
    items: Array.isArray(payload.items)
      ? payload.items.map(normalizeItem).filter(Boolean)
      : []
  };
};

// 灵动岛摘要：p_limit=ISLAND_PREVIEW_COUNT 同时取回前几条用于卡片预览
const ISLAND_PREVIEW_COUNT = 3;

export const fetchOfflineOverviewSummary = async ({ anchor = null } = {}) => {
  const { data, error } = await executeRead(
    'overview.summary',
    { anchor: anchor || null },
    async () => {
      const rpcParams = { p_limit: ISLAND_PREVIEW_COUNT, p_offset: 0 };
      if (anchor) rpcParams.p_anchor = anchor;
      const { data, error } = await supabase.rpc('get_offline_overview', rpcParams);
      return { data, error };
    },
    { ttlMs: 0, timeoutMs: OVERVIEW_TIMEOUT_MS, retry: 1 }
  );

  if (error) {
    logger.error('overview-api', '获取离线概览摘要失败', error);
    throw error;
  }

  const payload = data && typeof data === 'object' ? data : {};
  return {
    anchor: payload.anchor || null,
    isFirstLogin: Boolean(payload.is_first_login),
    total: Number(payload.total) || 0,
    items: Array.isArray(payload.items)
      ? payload.items.map(normalizeItem).filter(Boolean)
      : []
  };
};

export const fetchNewsDetail = async (newsId, { signal = null } = {}) => {
  const { data, error } = await executeRead(
    'overview.newsDetail',
    { newsId: String(newsId) },
    async () => {
      const { data, error } = await supabase
        .from('news')
        .select('id, title, excerpt, date, author, image, category, content')
        .eq('id', newsId)
        .maybeSingle();
      return { data, error };
    },
    { ttlMs: 0, timeoutMs: OVERVIEW_TIMEOUT_MS, retry: 1, signal }
  );

  if (error) {
    logger.error('overview-api', '获取新闻详情失败', error);
    throw error;
  }
  return data || null;
};
