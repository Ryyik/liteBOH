/**
 * 活动平台化 API（BETA 6 P1-3）
 * 依赖 supabase/migrations/2026090802_activity_campaign_platform.sql 的三表：
 * activity_campaigns / activity_entries / activity_rewards。
 * 注意：migration 应用到远程库之前调用会报表不存在，UI 接入时需先确认。
 */
import { supabase } from '@/utils/supabase-client.js';

export const CAMPAIGN_STAGES = ['draft', 'signup', 'submission', 'judging', 'result', 'fulfilled'];

const normalizeCampaign = (row) => ({
  id: row?.id || '',
  slug: row?.slug || '',
  title: row?.title || '',
  description: row?.description || '',
  stage: row?.stage || 'draft',
  signupStartAt: row?.signup_start_at || null,
  signupEndAt: row?.signup_end_at || null,
  startAt: row?.start_at || null,
  endAt: row?.end_at || null,
  config: row?.config || {},
  createdAt: row?.created_at || null
});

/**
 * 活动列表（公开）。
 *
 * ⚠️ 草稿隔离靠的是这里的 API 层过滤，**不是 RLS**：
 * 2026090802 迁移里 activity_campaigns_select 是 `using (true)`，
 * anon 也可以直查 /rest/v1/activity_campaigns 拿到 stage='draft' 的行。
 * 若要让数据库兜底，需另发迁移把 policy 收紧成
 * `using (stage <> 'draft' or public.current_user_is_admin())`。
 */
export async function listActivityCampaigns({ stage = '', includeDrafts = false, limit = 50 } = {}) {
  try {
    let query = supabase
      .from('activity_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(limit) || 50, 100));
    if (stage) query = query.eq('stage', stage);
    else if (!includeDrafts) query = query.neq('stage', 'draft');
    const { data, error } = await query;
    if (error) throw error;
    return { ok: true, data: (data || []).map(normalizeCampaign) };
  } catch (error) {
    return { ok: false, data: [], error };
  }
}

/** 按 slug 取单个活动（含私有 config，报名表单由 config 渲染） */
export async function getActivityCampaignBySlug(slug) {
  try {
    const { data, error } = await supabase
      .from('activity_campaigns')
      .select('*')
      .eq('slug', String(slug || '').trim())
      .maybeSingle();
    if (error) throw error;
    return { ok: true, data: data ? normalizeCampaign(data) : null };
  } catch (error) {
    return { ok: false, data: null, error };
  }
}

/** 我的报名/投稿记录（单个活动） */
export async function getMyCampaignEntries(campaignId, userId) {
  try {
    const { data, error } = await supabase
      .from('activity_entries')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { ok: true, data: data || [] };
  } catch (error) {
    return { ok: false, data: [], error };
  }
}

/**
 * 批量取「我在这些活动下是否已报名」——一次往返替代逐活动 N+1。
 * 返回的 Set 直接用于渲染报名按钮的已报名态。
 */
export async function getMyCampaignSignupIds(campaignIds = [], userId) {
  const ids = (Array.isArray(campaignIds) ? campaignIds : []).filter(Boolean);
  if (!ids.length || !userId) return { ok: true, data: new Set() };
  try {
    const { data, error } = await supabase
      .from('activity_entries')
      .select('campaign_id')
      .in('campaign_id', ids)
      .eq('user_id', userId)
      .eq('kind', 'signup');
    if (error) throw error;
    return { ok: true, data: new Set((data || []).map((row) => row.campaign_id)) };
  } catch (error) {
    return { ok: false, data: new Set(), error };
  }
}

/** 报名活动（kind=signup；成功返回 { ok, data: entry }） */
export async function signupCampaignEntry(campaignId, userId) {
  try {
    if (!campaignId || !userId) throw new Error('缺少活动或用户标识');
    const { data, error } = await supabase
      .from('activity_entries')
      .insert([{ campaign_id: campaignId, user_id: userId, kind: 'signup' }])
      .select('id, campaign_id, user_id, kind, status, created_at')
      .single();
    if (error) throw error;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, data: null, error };
  }
}
