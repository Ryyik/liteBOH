import { supabase } from '../supabase-client.js';
import { executeRead } from '../request-core.js';
import { logger } from '../logger.js';

const NEWS_DETAIL_TIMEOUT_MS = 12000;

export const fetchNewsDetail = async (newsId, { signal = null } = {}) => {
  const { data, error } = await executeRead(
    'news.detail',
    { newsId: String(newsId) },
    async () => {
      const { data, error } = await supabase
        .from('news')
        .select('id, title, excerpt, date, author, image, category, content')
        .eq('id', newsId)
        .maybeSingle();
      return { data, error };
    },
    { ttlMs: 0, timeoutMs: NEWS_DETAIL_TIMEOUT_MS, retry: 1, signal },
  );

  if (error) {
    logger.error('news-api', '获取新闻详情失败', error);
    throw error;
  }
  return data || null;
};
