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

const CODING_PACK_CODES = ['coding-lite', 'coding-plus', 'coding-pro', 'coding-ultra'];

// Coding 附加包价格（服务端取价真源）。面板改这里，订阅页购买即时生效。
export const getCodingPackPrices = async () => {
  const { data, error } = await supabase
    .from('subscription_plan_prices')
    .select('plan_code, billing_cycle, points_cost, duration_months, is_active')
    .in('plan_code', CODING_PACK_CODES)
    .order('plan_code');
  if (error) throw error;
  return data || [];
};

export const saveCodingPackPrices = async (packs = []) => {
  const rows = [];
  for (const pack of packs) {
    for (const cycle of ['monthly', 'yearly']) {
      const row = pack.cycles[cycle];
      if (!row) continue;
      rows.push({
        plan_code: pack.plan_code,
        billing_cycle: cycle,
        points_cost: Number(row.points_cost),
        duration_months: Number(row.duration_months),
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }
  }
  if (!rows.length) return { ok: true };
  const { error } = await supabase
    .from('subscription_plan_prices')
    .upsert(rows, { onConflict: 'plan_code,billing_cycle' });
  if (error) throw error;
  return { ok: true };
};
