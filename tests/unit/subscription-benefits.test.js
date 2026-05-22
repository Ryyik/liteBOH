import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOUD_IMAGE_LIMIT,
  resolveCloudBenefitFromPlanCodes,
  resolveCloudBenefitFromSubscriptions
} from '../../src/utils/subscription-benefits.js';

describe('subscription Cloud+ benefits', () => {
  it('uses 150 images as the free Cloud+ quota', () => {
    expect(DEFAULT_CLOUD_IMAGE_LIMIT).toBe(150);
    expect(resolveCloudBenefitFromPlanCodes([]).cloudImageLimit).toBe(150);
  });

  it('resolves Cloud+ image limits by the highest active plan', () => {
    expect(resolveCloudBenefitFromPlanCodes(['boh-ai-plus']).cloudImageLimit).toBe(300);
    expect(resolveCloudBenefitFromPlanCodes(['boh-plus']).cloudImageLimit).toBe(300);
    expect(resolveCloudBenefitFromPlanCodes(['boh-pro']).cloudImageLimit).toBe(500);
    expect(resolveCloudBenefitFromPlanCodes(['boh-max']).cloudImageLimit).toBe(800);
    expect(resolveCloudBenefitFromPlanCodes(['boh-ai-plus', 'boh-pro']).cloudImageLimit).toBe(500);
  });

  it('ignores expired subscription records', () => {
    const nowTs = Date.parse('2026-05-21T00:00:00Z');
    const benefit = resolveCloudBenefitFromSubscriptions([
      { planCode: 'boh-max', status: 'active', expiresAt: '2026-05-20T00:00:00Z' },
      { planCode: 'boh-pro', status: 'active', expiresAt: '2026-05-22T00:00:00Z' }
    ], nowTs);

    expect(benefit.cloudImageLimit).toBe(500);
  });
});
