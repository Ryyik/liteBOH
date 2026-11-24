import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOUD_IMAGE_LIMIT,
  PLAN_AI_POINT_MULTIPLIERS,
  PLAN_AI_TOKEN_BASELINE_TIER,
  PLAN_AI_TOKEN_LIMITS,
  PLAN_AI_TOKEN_PERCENTS,
  PLAN_CLOUD_IMAGE_LIMITS,
  PLAN_DISPLAY_NAMES,
  PLAN_LOTTERY_PITY_THRESHOLDS,
  PLAN_PHOTO_ALBUM_COUNTS,
  PLAN_PHOTO_ALBUM_EXPORTS,
  PLAN_PHOTO_ALBUM_PHOTOS,
  TIER_DISPLAY_LABELS,
  TIER_NICKNAME_COLORS,
  TIER_ORDER,
  resolveCloudBenefitFromPlanCodes,
  resolveCloudBenefitFromSubscriptions,
  resolveHighestTierCode,
} from '../../src/utils/subscription-benefits.js';

/* ⚠️ 2026-11-24（plans/046）：四档制 —— Plus 已并入 Pro。
   本文件此前锁的是五档（free/plus/pro/max/ultra），合并后：
   · 8 张 MAP 少一个键（plus）；
   · 百分比尺子从 plus 换成 pro（绝对 token 数一个没动，5/100/250/500）；
   · 昵称蓝退场（银/金/虹）；
   · 保底 24 场（Plus）消失。 */
const SHOWCASE_PLAN_CODES = ['free', 'pro', 'max', 'ultra'];

describe('subscription Cloud+ benefits', () => {
  it('uses 150 images as the free Cloud+ quota', () => {
    expect(DEFAULT_CLOUD_IMAGE_LIMIT).toBe(150);
    expect(resolveCloudBenefitFromPlanCodes([]).cloudImageLimit).toBe(150);
  });

  it('resolves Cloud+ image limits by the highest active plan', () => {
    expect(resolveCloudBenefitFromPlanCodes(['pro']).cloudImageLimit).toBe(450);
    expect(resolveCloudBenefitFromPlanCodes(['max']).cloudImageLimit).toBe(900);
    expect(resolveCloudBenefitFromPlanCodes(['ultra']).cloudImageLimit).toBe(1200);
    // 历史 plus 折到 pro ⇒ 拿到 Pro 的 450（不是已下架的 300）
    expect(resolveCloudBenefitFromPlanCodes(['plus']).cloudImageLimit).toBe(450);
    expect(resolveCloudBenefitFromPlanCodes(['plus', 'max']).cloudImageLimit).toBe(900);
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
  it('defines every showcase benefit for all four tiers (卡片/表格不会缺值)', () => {
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

  it('四档制：各权益 MAP 里都没有 plus 这个键（否则等于还留着一个虚档）', () => {
    [
      PLAN_CLOUD_IMAGE_LIMITS,
      PLAN_AI_TOKEN_LIMITS,
      PLAN_AI_TOKEN_PERCENTS,
      PLAN_AI_POINT_MULTIPLIERS,
      PLAN_LOTTERY_PITY_THRESHOLDS,
      PLAN_PHOTO_ALBUM_COUNTS,
      PLAN_PHOTO_ALBUM_PHOTOS,
      PLAN_PHOTO_ALBUM_EXPORTS,
      TIER_NICKNAME_COLORS,
    ].forEach((map) => {
      expect(Object.keys(map)).not.toContain('plus');
    });
  });

  it('keeps Cloud+ showcase limits identical to granted quotas', () => {
    expect(PLAN_CLOUD_IMAGE_LIMITS).toEqual({
      free: 150,
      pro: 450,
      max: 900,
      ultra: 1200,
    });
  });

  it('keeps nickname showcase aligned with tier color classes (银/金/虹，蓝已退场)', () => {
    expect(TIER_NICKNAME_COLORS).toEqual({
      free: '',
      pro: 'nickname-silver',
      max: 'nickname-gold',
      ultra: 'nickname-rainbow',
    });
  });

  it('keeps lottery pity thresholds aligned with PityIslandCard copy (Pro 18 · Max 12 · Ultra 8, 场)', () => {
    expect(PLAN_LOTTERY_PITY_THRESHOLDS).toEqual({
      free: null,
      pro: 18,
      max: 12,
      ultra: 8,
    });
  });

  it('keeps photo album showcase aligned with quota.js enforcement maps (utils/photo-albums/quota.js 三张 MAP)', () => {
    expect(PLAN_PHOTO_ALBUM_COUNTS).toEqual({
      free: '1 本',
      pro: '5 本',
      max: '10 本',
      ultra: '不限',
    });
    expect(PLAN_PHOTO_ALBUM_PHOTOS).toEqual({
      free: '12 张',
      pro: '40 张',
      max: '60 张',
      ultra: '不限',
    });
    expect(PLAN_PHOTO_ALBUM_EXPORTS).toEqual({
      free: '2 次 / 月',
      pro: '10 次 / 月',
      max: '20 次 / 月',
      ultra: '不限',
    });
  });

  it('免费档显示名是 Standard（plan_code 仍为 free）', () => {
    expect(PLAN_DISPLAY_NAMES.free).toBe('Standard');
    expect(PLAN_DISPLAY_NAMES).not.toHaveProperty('plus');
    // 口语标签与产品名分工不同，但同样四档且不含 plus
    expect(TIER_DISPLAY_LABELS.free).toBe('标准用户');
    expect(TIER_DISPLAY_LABELS).not.toHaveProperty('plus');
    // guest 是 TIER_DISPLAY_LABELS 独有的未登录档，别跟着四档化一起删掉
    expect(TIER_DISPLAY_LABELS.guest).toBe('未登录用户');
  });
});

/* 2026-10-08 用户口径：「订阅页面、AI 页面统一不再展示额度，只用百分比显示，
   不再展示你还有多少 token；若有附加包，则可以显示 150%」。
   这一组锁住**订阅页那条横向对比尺子**：
     · 档位百分比以最低付费档 Pro = 100% 为基准；
     · 附加包百分比 = 包加成 ÷ 档位基础额度，取整到 5%。
   自己当天用了多少的百分比在 utils/ai-quota-display.js（另一把尺子，分母是自身档位）。 */
describe('AI 额度百分比口径（界面不再展示 Token 绝对值）', () => {
  it('尺子是 Pro：free 5% / Pro 100% / Max 250% / Ultra 500%', () => {
    expect(PLAN_AI_TOKEN_BASELINE_TIER).toBe('pro');
    // 2026-11-24（plans/046）：基准档从 plus(400000) 换成 pro(1000000)，
    // 绝对 token 数一个没动 ⇒ 百分比整体缩小（625%→250%、1250%→500%、13%→5%）。
    // 这是**有意的展示变化**，须写进更新说明：用户看到「数字变小」但实际额度不变。
    expect(PLAN_AI_TOKEN_PERCENTS).toEqual({
      free: '5%',
      pro: '100%',
      max: '250%',
      ultra: '500%',
    });
  });

  it('绝对值底数与百分比同步单调递增（防止只改一边）', () => {
    const order = ['pro', 'max', 'ultra'];
    for (let i = 1; i < order.length; i += 1) {
      expect(PLAN_AI_TOKEN_LIMITS[order[i]]).toBeGreaterThan(PLAN_AI_TOKEN_LIMITS[order[i - 1]]);
      const prev = Number(PLAN_AI_TOKEN_PERCENTS[order[i - 1]].replace('%', ''));
      const cur = Number(PLAN_AI_TOKEN_PERCENTS[order[i]].replace('%', ''));
      expect(cur).toBeGreaterThan(prev);
    }
  });

  it('免费档仍低于最低付费档（free 50000 < Pro 1000000）', () => {
    expect(PLAN_AI_TOKEN_LIMITS.free).toBeLessThan(PLAN_AI_TOKEN_LIMITS.pro);
  });

  // 2026-10-20：Coding 附加包整体下线（plans/030 §5），
  // 原先锁 resolvePackQuotaPercent 的两条用例随源一起删除。
  // 若恢复附加包，断言应一并恢复（口径：包加成 ÷ 档位基础额度，取整到 5% 的倍数）。
});

describe('resolveHighestTierCode 走单一真源档位序', () => {
  const future = '2099-01-01T00:00:00Z';
  const rec = (code) => ({ planCode: code, status: 'active', expiresAt: future });

  it('多档取最高；历史 plus 视同 pro', () => {
    expect(resolveHighestTierCode([rec('free'), rec('max')])).toBe('max');
    expect(resolveHighestTierCode([rec('plus'), rec('pro')])).toBe(
      resolveHighestTierCode([rec('pro')]),
    );
    // 只有 plus 时结果是 pro（归一后的代号），不是原始 'plus'
    expect(resolveHighestTierCode([rec('plus')])).toBe('pro');
  });

  it('无有效订阅返回空串', () => {
    expect(resolveHighestTierCode([])).toBe('');
    expect(
      resolveHighestTierCode([{ planCode: 'max', status: 'expired', expiresAt: future }]),
    ).toBe('');
  });

  it('TIER_ORDER 与展示 MAP 的键集合一致（少一个就会在卡片上渲染出 undefined）', () => {
    expect(Object.keys(PLAN_CLOUD_IMAGE_LIMITS)).toEqual(TIER_ORDER);
    expect(Object.keys(TIER_NICKNAME_COLORS)).toEqual(TIER_ORDER);
  });
});
