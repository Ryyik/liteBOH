import { supabase } from '@/utils/supabase-client.js';

export const getAiQuotaAdminConfig = async () => {
  const [tiers, modes, pricing] = await Promise.all([
    supabase
      .from('ai_quota_config')
      .select('tier, daily_token_limit, web_search_daily_limit, points_multiplier, updated_at')
      .order('daily_token_limit', { ascending: true }),
    supabase
      .from('bohai_model_configs')
      .select('id, mode_id, display_name, provider, model_id, quota_multiplier, status, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('ai_pricing_config')
      .select('id, enabled, rate_tokens_per_point, daily_points_burn_cap, updated_at')
      .eq('id', 1)
      .maybeSingle(),
  ]);
  if (tiers.error) throw tiers.error;
  if (modes.error) throw modes.error;
  if (pricing.error) throw pricing.error;
  return {
    tiers: tiers.data || [],
    modes: modes.data || [],
    pricing: pricing.data || null,
  };
};

export const saveAiQuotaAdminConfig = async ({ tiers = [], modes = [], pricing = null } = {}) => {
  const tierRows = tiers.map((row) => ({
    tier: row.tier,
    daily_token_limit: Number(row.daily_token_limit),
    web_search_daily_limit: Number(row.web_search_daily_limit),
    points_multiplier: Number(row.points_multiplier ?? 1),
    updated_at: new Date().toISOString(),
  }));
  const modeUpdates = modes.map((row) =>
    supabase
      .from('bohai_model_configs')
      .update({
        quota_multiplier: Number(row.quota_multiplier),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id),
  );
  const pricingRow = pricing
    ? {
        id: 1,
        enabled: Boolean(pricing.enabled),
        rate_tokens_per_point: Number(pricing.rate_tokens_per_point),
        daily_points_burn_cap: Number(pricing.daily_points_burn_cap),
        updated_at: new Date().toISOString(),
      }
    : null;

  const [tierResult, modeResults, pricingResult] = await Promise.all([
    supabase.from('ai_quota_config').upsert(tierRows, { onConflict: 'tier' }),
    Promise.all(modeUpdates),
    pricingRow
      ? supabase.from('ai_pricing_config').upsert(pricingRow)
      : Promise.resolve({ error: null }),
  ]);
  if (tierResult.error) throw tierResult.error;
  if (pricingResult?.error) throw pricingResult.error;
  const failedMode = modeResults.find((result) => result.error);
  if (failedMode?.error) throw failedMode.error;
  return { ok: true };
};

export const resetAllAiQuotas = async () => {
  const { data, error } = await supabase.rpc('admin_reset_all_ai_quotas');
  if (error) throw error;
  return data;
};

/* 2026-10-20：Coding 附加包价格读写接口随附加包下线删除（plans/030 §5）。
   删除：CODING_PACK_CODES / getCodingPackPrices / saveCodingPackPrices。
   数据侧：subscription_plan_prices 的 coding-* 已置 is_active=false（迁移 2026102003），
   行保留，仍可通过通用订阅查询读到；如需恢复写入能力，从 git 历史取实现。 */
