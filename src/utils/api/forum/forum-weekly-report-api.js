import { supabase } from '../../supabase-client.js';

const asArray = (value) => Array.isArray(value) ? value : [];

const normalizeReport = (row) => {
  if (!row) return null;
  return {
    ...row,
    summary: String(row.summary || '').trim(),
    metrics: row.metrics && typeof row.metrics === 'object' ? row.metrics : {},
    topics: asArray(row.topics),
    featured_posts: asArray(row.featured_posts),
    open_questions: asArray(row.open_questions),
  };
};

export async function getLatestForumWeeklyReport() {
  const { data, error } = await supabase
    .from('forum_weekly_reports')
    .select('*')
    .eq('status', 'published')
    .order('week_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: normalizeReport(data), error };
}

export async function generateForumWeeklyReport(payload = {}) {
  const { data, error } = await supabase.functions.invoke('generate-forum-weekly-report', { body: payload });
  if (error) {
    const body = await error.context?.clone?.().json?.().catch(() => null);
    const contextMessage = String(body?.message || body?.error || error.context?.message || '').trim();
    const message = contextMessage || String(error.message || '周报生成请求失败');
    return { data: data?.data || null, error: new Error(message) };
  }
  return {
    data: data?.data || null,
    error: data?.ok === false ? new Error(data.message || '生成周报失败') : null,
  };
}
