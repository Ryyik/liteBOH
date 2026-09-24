import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOUD_IMAGE_LIMIT,
  PLAN_AI_TOKENS,
  PLAN_CLOUD_IMAGE_LIMITS,
  PLAN_LAB_QUOTAS,
  PLAN_LOTTERY_PITY_THRESHOLDS,
  TIER_NICKNAME_COLORS,
  resolveCloudBenefitFromPlanCodes,
  resolveCloudBenefitFromSubscriptions
} from '../../src/utils/subscription-benefits.js';

describe('subscription Cloud+ benefits', () => {
  it('uses 150 images as the free Cloud+ quota', () => {
    expect(DEFAULT_CLOUD_IMAGE_LIMIT).toBe(150);
    expect(resolveCloudBenefitFromPlanCodes([]).cloudImageLimit).toBe(150);
  });

  it('resolves Cloud+ image limits by the highest active plan', () => {
    expect(resolveCloudBenefitFromPlanCodes(['plus']).cloudImageLimit).toBe(300);
    expect(resolveCloudBenefitFromPlanCodes(['pro']).cloudImageLimit).toBe(450);
    expect(resolveCloudBenefitFromPlanCodes(['max']).cloudImageLimit).toBe(900);
    expect(resolveCloudBenefitFromPlanCodes(['ultra']).cloudImageLimit).toBe(1200);
    expect(resolveCloudBenefitFromPlanCodes(['plus', 'pro']).cloudImageLimit).toBe(450);
  });

  it('ignores expired subscription records', () => {
    const nowTs = Date.parse('2026-05-21T00:00:00Z');
    const benefit = resolveCloudBenefitFromSubscriptions([
      { planCode: 'max', status: 'active', expiresAt: '2026-05-20T00:00:00Z' },
      { planCode: 'pro', status: 'active', expiresAt: '2026-05-22T00:00:00Z' }
    ], nowTs);

    expect(benefit.cloudImageLimit).toBe(450);
  });
});

describe('plan benefit showcase single source (订阅页卡片与对比表共用)', () => {
  const SHOWCASE_PLAN_CODES = ['free', 'plus', 'pro', 'max', 'ultra'];

  it('defines every showcase benefit for all five tiers (卡片/表格不会缺值)', () => {
    SHOWCASE_PLAN_CODES.forEach((code) => {
      expect(PLAN_AI_TOKENS[code]).toBeTruthy();
      expect(PLAN_LAB_QUOTAS[code]).toBeTruthy();
      expect(PLAN_CLOUD_IMAGE_LIMITS[code]).toBeGreaterThan(0);
      expect(Object.prototype.hasOwnProperty.call(TIER_NICKNAME_COLORS, code)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(PLAN_LOTTERY_PITY_THRESHOLDS, code)).toBe(true);
    });
  });

  it('keeps Cloud+ showcase limits identical to granted quotas', () => {
    expect(PLAN_CLOUD_IMAGE_LIMITS).toEqual({ free: 150, plus: 300, pro: 450, max: 900, ultra: 1200 });
  });

  it('keeps nickname showcase aligned with tier color classes', () => {
    expect(TIER_NICKNAME_COLORS).toEqual({
      free: '',
      plus: 'nickname-blue',
      pro: 'nickname-silver',
      max: 'nickname-gold',
      ultra: 'nickname-rainbow'
    });
  });

  it('keeps lottery pity thresholds aligned with PityIslandCard copy (Plus 24 · Pro 18 · Max 12 · Ultra 8, 场)', () => {
    expect(PLAN_LOTTERY_PITY_THRESHOLDS).toEqual({ free: null, plus: 24, pro: 18, max: 12, ultra: 8 });
  });
});
