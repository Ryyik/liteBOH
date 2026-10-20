import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOUD_IMAGE_LIMIT,
  PLAN_AI_TOKEN_BASELINE_TIER,
  PLAN_AI_TOKEN_LIMITS,
  PLAN_AI_TOKEN_PERCENTS,
  PLAN_CLOUD_IMAGE_LIMITS,
  PLAN_LOTTERY_PITY_THRESHOLDS,
  PLAN_PHOTO_ALBUM_COUNTS,
  PLAN_PHOTO_ALBUM_EXPORTS,
  PLAN_PHOTO_ALBUM_PHOTOS,
  TIER_NICKNAME_COLORS,
  resolveCloudBenefitFromPlanCodes,
  resolveCloudBenefitFromSubscriptions,
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
    const benefit = resolveCloudBenefitFromSubscriptions(
      [
        { planCode: 'max', status: 'active', expiresAt: '2026-05-20T00:00:00Z' },
        { planCode: 'pro', status: 'active', expiresAt: '2026-05-22T00:00:00Z' },
      ],
      nowTs,
    );

    expect(benefit.cloudImageLimit).toBe(450);
  });
});

describe('plan benefit showcase single source (订阅页卡片与对比表共用)', () => {
  const SHOWCASE_PLAN_CODES = ['free', 'plus', 'pro', 'max', 'ultra'];

  it('defines every showcase benefit for all five tiers (卡片/表格不会缺值)', () => {
    SHOWCASE_PLAN_CODES.forEach((code) => {
      expect(PLAN_AI_TOKEN_PERCENTS[code]).toBeTruthy();
      expect(PLAN_CLOUD_IMAGE_LIMITS[code]).toBeGreaterThan(0);
      expect(Object.prototype.hasOwnProperty.call(TIER_NICKNAME_COLORS, code)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(PLAN_LOTTERY_PITY_THRESHOLDS, code)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(PLAN_PHOTO_ALBUM_COUNTS, code)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(PLAN_PHOTO_ALBUM_PHOTOS, code)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(PLAN_PHOTO_ALBUM_EXPORTS, code)).toBe(true);
    });
  });

  it('keeps Cloud+ showcase limits identical to granted quotas', () => {
    expect(PLAN_CLOUD_IMAGE_LIMITS).toEqual({
      free: 150,
      plus: 300,
      pro: 450,
      max: 900,
      ultra: 1200,
    });
  });

  it('keeps nickname showcase aligned with tier color classes', () => {
    expect(TIER_NICKNAME_COLORS).toEqual({
      free: '',
      plus: 'nickname-blue',
      pro: 'nickname-silver',
      max: 'nickname-gold',
      ultra: 'nickname-rainbow',
    });
  });

  it('keeps lottery pity thresholds aligned with PityIslandCard copy (Plus 24 · Pro 18 · Max 12 · Ultra 8, 场)', () => {
    expect(PLAN_LOTTERY_PITY_THRESHOLDS).toEqual({
      free: null,
      plus: 24,
      pro: 18,
      max: 12,
      ultra: 8,
    });
  });

  it('keeps photo album showcase aligned with quota.js enforcement maps (utils/photo-albums/quota.js 三张 MAP)', () => {
    expect(PLAN_PHOTO_ALBUM_COUNTS).toEqual({
      free: '1 本',
      plus: '3 本',
      pro: '5 本',
      max: '10 本',
      ultra: '不限',
    });
    expect(PLAN_PHOTO_ALBUM_PHOTOS).toEqual({
      free: '12 张',
      plus: '24 张',
      pro: '40 张',
      max: '60 张',
      ultra: '不限',
    });
    expect(PLAN_PHOTO_ALBUM_EXPORTS).toEqual({
      free: '2 次 / 月',
      plus: '5 次 / 月',
      pro: '10 次 / 月',
      max: '20 次 / 月',
      ultra: '不限',
    });
  });
});

/* 2026-10-08 用户口径：「订阅页面、AI 页面统一不再展示额度，只用百分比显示，
   不再展示你还有多少 token；若有附加包，则可以显示 150%」。
   这一组锁住**订阅页那条横向对比尺子**：
     · 档位百分比以最低付费档 Plus = 100% 为基准；
     · 附加包百分比 = 包加成 ÷ 档位基础额度，取整到 5%。
   自己当天用了多少的百分比在 utils/ai-quota-display.js（另一把尺子，分母是自身档位）。 */
describe('AI 额度百分比口径（界面不再展示 Token 绝对值）', () => {
  it('档位百分比以最低付费档为基准：free 13% / Plus 100% / Pro 250% / Max 625% / Ultra 1250%', () => {
    expect(PLAN_AI_TOKEN_BASELINE_TIER).toBe('plus');
    // 2026-10-20（plans/030 §3.3）：free 额度 0 → 50000 ⇒ 由「—」变成 13%
    // （50000 / 400000 = 12.5%，Math.round 后为 13）。
    // 这是**有意的展示变化**：免费档现在真有每日额度，不再是"无额度、纯积分"。
    expect(PLAN_AI_TOKEN_PERCENTS).toEqual({
      free: '13%',
      plus: '100%',
      pro: '250%',
      max: '625%',
      ultra: '1250%',
    });
  });

  it('绝对值底数与百分比同步单调递增（防止只改一边）', () => {
    const order = ['plus', 'pro', 'max', 'ultra'];
    for (let i = 1; i < order.length; i += 1) {
      expect(PLAN_AI_TOKEN_LIMITS[order[i]]).toBeGreaterThan(PLAN_AI_TOKEN_LIMITS[order[i - 1]]);
      const prev = Number(PLAN_AI_TOKEN_PERCENTS[order[i - 1]].replace('%', ''));
      const cur = Number(PLAN_AI_TOKEN_PERCENTS[order[i]].replace('%', ''));
      expect(cur).toBeGreaterThan(prev);
    }
  });

  // 2026-10-20：Coding 附加包整体下线（plans/030 §5），
  // 原先锁 resolvePackQuotaPercent 的两条用例随源一起删除。
  // 若恢复附加包，断言应一并恢复（口径：包加成 ÷ 档位基础额度，取整到 5% 的倍数）。
});
