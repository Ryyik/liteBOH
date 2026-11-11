import { describe, expect, it, vi } from 'vitest';

/**
 * 反证式回归（2026-11-11 审查 P0-3 的连带项）。
 *
 * 历史故障：`saveAiQuotaAdminConfig` 用 `Promise.all` + 首个 error 直接 throw，
 * 而 `ai_pricing_config` 当时缺 INSERT/UPDATE 授权 ⇒ 定价一路失败，
 * 明明写成功的 tiers / modes 也被判成「保存失败」，界面上看不到任何有效信息。
 *
 * 现在的契约：三块配置各自独立回执，`ok=false` 时 `failures` 必须点名是哪一块。
 */
vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    from: (table) => ({
      upsert: () => {
        if (table === 'ai_pricing_config') {
          return Promise.resolve({
            error: { message: 'permission denied for table ai_pricing_config' },
          });
        }
        return Promise.resolve({ error: null });
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

const baseArgs = () => ({
  tiers: [
    {
      tier: 'guest',
      daily_token_limit: 30000,
      web_search_daily_limit: 0,
      points_multiplier: 1,
    },
  ],
  modes: [{ id: 1, quota_multiplier: 1 }],
  pricing: { enabled: true, rate_tokens_per_point: 500000, daily_points_burn_cap: 20 },
});

describe('AI 额度保存：分项回执', () => {
  it('定价失败时不连坐，其余两块要明确报告为已保存', async () => {
    const { saveAiQuotaAdminConfig } = await import('@/utils/api/ai-quota-admin-api.js');
    const result = await saveAiQuotaAdminConfig(baseArgs());
    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.key)).toEqual(['pricing']);
    expect(result.failures[0].label).toBe('积分定价');
    expect(result.failures[0].message).toContain('permission denied');
    expect(result.saved).toEqual(['额度档位', '模型倍率']);
  });
});
