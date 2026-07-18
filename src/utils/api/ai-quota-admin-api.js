import { supabase } from '@/utils/supabase-client.js';

export const getAiQuotaAdminConfig = async () => {
  const [tiers, modes] = await Promise.all([
    supabase.from('ai_quota_config')
      .select('tier, daily_token_limit, web_search_daily_limit, updated_at')
      .order('daily_token_limit', { ascending: true }),
    supabase.from('bohai_model_configs')
      .select('id, mode_id, display_name, provider, model_id, quota_multiplier, status, sort_order')
      .order('sort_order', { ascending: true })
  ]);
  if (tiers.error) throw tiers.error;
  if (modes.error) throw modes.error;
  return { tiers: tiers.data || [], modes: modes.data || [] };
};

export const saveAiQuotaAdminConfig = async ({ tiers = [], modes = [] } = {}) => {
  const tierRows = tiers.map((row) => ({
    tier: row.tier,
    daily_token_limit: Number(row.daily_token_limit),
    web_search_daily_limit: Number(row.web_search_daily_limit),
    updated_at: new Date().toISOString()
  }));
  const modeUpdates = modes.map((row) => supabase.from('bohai_model_configs')
    .update({ quota_multiplier: Number(row.quota_multiplier), updated_at: new Date().toISOString() })
    .eq('id', row.id));
  const [tierResult, modeResults] = await Promise.all([
    supabase.from('ai_quota_config').upsert(tierRows, { onConflict: 'tier' }),
    Promise.all(modeUpdates)
  ]);
  if (tierResult.error) throw tierResult.error;
  const failedMode = modeResults.find((result) => result.error);
  if (failedMode?.error) throw failedMode.error;
  return { ok: true };
};

export const resetAllAiQuotas = async () => {
  const { data, error } = await supabase.rpc('admin_reset_all_ai_quotas');
  if (error) throw error;
  return data;
};
