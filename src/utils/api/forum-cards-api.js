import { supabase } from '../supabase-client.js';
import { logger } from '../logger.js';

const COLUMNS =
  'id,label,kind,hero_id,hero_ids,status,priority,starts_at,ends_at,version,updated_at';

const asTime = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

export const normalizeForumCardItem = (row = {}) => ({
  id: String(row.id || ''),
  label: String(row.label || '').trim(),
  kind: row.kind === 'carousel' ? 'carousel' : 'hero',
  hero_id: row.hero_id ? String(row.hero_id) : null,
  hero_ids: Array.isArray(row.hero_ids) ? row.hero_ids.map(String) : [],
  status: row.status === 'inactive' ? 'inactive' : 'active',
  enabled: row.status !== 'inactive',
  priority: Number(row.priority) || 100,
  starts_at: asTime(row.starts_at),
  ends_at: asTime(row.ends_at),
  version: Math.max(1, Number(row.version) || 1),
  updated_at: row.updated_at || null,
});

export const isForumCardInSchedule = (item, now = Date.now()) =>
  Boolean(item?.enabled) &&
  (!item.starts_at || item.starts_at <= now) &&
  (!item.ends_at || item.ends_at > now);

export async function listForumCardItems() {
  try {
    const { data, error } = await supabase
      .from('forum_card_items')
      .select(COLUMNS)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(10);
    if (error) throw error;
    const now = Date.now();
    return (data || [])
      .map((item) => normalizeForumCardItem(item))
      .filter((item) => isForumCardInSchedule(item, now));
  } catch (error) {
    logger.warn('forum-cards-api', '读取论坛卡位配置失败:', error);
    return [];
  }
}
