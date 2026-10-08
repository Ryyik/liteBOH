import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAiQuotaDisplay } from '../../src/utils/ai-quota-display.js';
import { resolveTierQuotaPercent } from '../../src/utils/subscription-benefits.js';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// AI 额度**只显示百分比 + 主指标是剩余**（2026-10-08 用户口径 · 第二版）
//
//   「订阅页面、AI 页面统一不再展示额度，只用百分比显示，不再展示你还有多少 token；
//     若有附加包，则可以显示 150%，以此类推。」
//   →「还是显示用户当日剩余百分比额度比较好，Max 就显示剩余 625%。」
//
// **只有一把尺子**：最低付费档 Plus = 100% ⇒ Pro 250% / Max 625% / Ultra 1250%，
// 附加包在同一把尺子上相加。所以 Max 刚过 0 点、没消耗必然是「剩余 625%」。
//
// ⚠️ 第一版把分母设成「自己档位的基础额度」（恒 100%），Max 用户看到「剩余 100%」、
//    连问两次「我是 Max，为什么显示 100%」⇒ 本文件的核心就是锁住「不许再有第二把尺子」。
//
// 这条口径有三个极易写错、且**看截图看不出来**的点，本文件逐个锁：
//   ① 尺子选错看不出来：同一个 Max 账号，「以自己额度为 100%」得 100%、
//      「Plus = 100%」得 625% —— 两个都是「合理的百分比」，只有断言能分辨。
//   ② 分母错了看不出来：已用百分比必须相对**档位基础额度**（625 × 55/250 万 = 138%），
//      相对「基础 + 包」算会得到另一个同样合理的 125%。
//   ③ 剩余是 625% 这种三位数，直接当进度条 width 会让条长到容器外 6 倍 ⇒
//      必须走归一后的 meterPercent（已用 ÷ 总额）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');

const MAX_BASE = 2500000; // Max 档日额度（= Plus 的 625%）
const PACK_LITE = 250000; // Coding Lite 加成（= Plus 的 62.5%）

describe('resolveTierQuotaPercent：Plus = 100% 这把尺子的数值真源', () => {
  it('四档的百分比与订阅页对比表同一份（100/250/625/1250）', () => {
    expect(resolveTierQuotaPercent('plus')).toBe(100);
    expect(resolveTierQuotaPercent('pro')).toBe(250);
    expect(resolveTierQuotaPercent('max')).toBe(625);
    expect(resolveTierQuotaPercent('ultra')).toBe(1250);
  });

  it('free / guest / 空值 / 未知档 ⇒ null（没有 token 额度或没有订阅，不许硬套一把尺子）', () => {
    expect(resolveTierQuotaPercent('free')).toBeNull();
    expect(resolveTierQuotaPercent('guest')).toBeNull();
    expect(resolveTierQuotaPercent('')).toBeNull();
    expect(resolveTierQuotaPercent(undefined)).toBeNull();
    expect(resolveTierQuotaPercent('enterprise-unknown')).toBeNull();
  });

  it('别名与大小写走同一个归一（MAX / Max 都是 625）', () => {
    expect(resolveTierQuotaPercent('MAX')).toBe(625);
    expect(resolveTierQuotaPercent(' Max ')).toBe(625);
  });
});

describe('resolveAiQuotaDisplay：档位百分比 × 用量占比，主指标是剩余', () => {
  it('Max 无消耗 ⇒ 剩余 625%（用户点名的那个数）', () => {
    const d = resolveAiQuotaDisplay({
      tier: 'max',
      usedTokens: 0,
      baseTokenLimit: MAX_BASE,
      tokenLimit: MAX_BASE,
    });
    expect(d.tierPercent).toBe(625);
    expect(d.remainingLabel).toBe('625%');
    expect(d.usedLabel).toBe('0%');
    expect(d.totalLabel).toBe('625%');
    expect(d.meterText).toBe('0%');
    expect(d.hasPack).toBe(false);
    expect(d.degraded).toBe(false);
  });

  it('Max 带附加包且已用 55 万：已用 138% / 总额 688% / 剩余 550% / 条宽 20%', () => {
    const d = resolveAiQuotaDisplay({
      tier: 'max',
      usedTokens: 550000,
      baseTokenLimit: MAX_BASE,
      bonusTokens: PACK_LITE,
      tokenLimit: MAX_BASE + PACK_LITE,
    });
    // 已用相对**基础额度**：625 × (55/250) = 137.5 → 138%（相对总量算会是 125%）
    expect(d.usedLabel).toBe('138%');
    // 总额在同尺相加：625 + 62.5 = 687.5 → 688%
    expect(d.totalLabel).toBe('688%');
    expect(d.remainingLabel).toBe('550%');
    expect(d.packPercent).toBeCloseTo(62.5, 5);
    // 剩余 550% 若被当成 width 会撑破容器 ⇒ 条宽必须是 137.5/687.5 = 20%
    expect(d.meterText).toBe('20%');
    expect(d.meterPercent).toBeCloseTo(20, 5);
    expect(d.hasPack).toBe(true);
  });

  it('吃进附加包 / 超额：已用百分比不封顶，条宽仍被归一', () => {
    const over = resolveAiQuotaDisplay({
      tier: 'pro',
      usedTokens: 1500000,
      baseTokenLimit: 1000000,
      tokenLimit: 1000000,
    });
    // 250 × 1.5 = 375% > 总额 250% —— 不许被 Math.min(100) 压平
    expect(over.usedLabel).toBe('375%');
    expect(over.totalLabel).toBe('250%');
    expect(over.remainingPercent).toBe(0);
    expect(over.remainingLabel).toBe('0%');
    expect(over.meterPercent).toBe(100);
  });

  it('老 EF 不返回基础额度 ⇒ 降级：总量当分母、包归零、尺子退回 100%', () => {
    const d = resolveAiQuotaDisplay({ tier: 'plus', usedTokens: 88000, tokenLimit: 100000 });
    expect(d.degraded).toBe(true);
    expect(d.hasPack).toBe(false);
    expect(d.usedLabel).toBe('88%');
    expect(d.totalLabel).toBe('100%');
    expect(d.remainingLabel).toBe('12%');
  });

  it('档位未知（guest 等）⇒ 降级成「相对自己额度」的 100% 尺子，不猜 Plus 基准', () => {
    const d = resolveAiQuotaDisplay({
      tier: 'guest',
      usedTokens: 3000,
      baseTokenLimit: 30000,
      tokenLimit: 30000,
    });
    expect(d.tierPercent).toBeNull();
    expect(d.degraded).toBe(true);
    expect(d.totalLabel).toBe('100%');
    expect(d.usedLabel).toBe('10%');
    expect(d.remainingLabel).toBe('90%');
  });

  it('free 档基础额度为 0 且有包 ⇒ 包即全部额度，量程回到 100%（不是 200%）', () => {
    const d = resolveAiQuotaDisplay({
      tier: 'free',
      usedTokens: 25000,
      baseTokenLimit: 0,
      bonusTokens: PACK_LITE,
      tokenLimit: PACK_LITE,
    });
    expect(d.degraded).toBe(true);
    expect(d.hasPack).toBe(false);
    expect(d.totalLabel).toBe('100%');
    expect(d.usedLabel).toBe('10%');
    expect(d.remainingLabel).toBe('90%');
  });

  it('不限量（limit = -1）⇒ 主指标 ∞，不参与百分比运算', () => {
    const d = resolveAiQuotaDisplay({ tier: 'max', usedTokens: 0, tokenLimit: -1 });
    expect(d.isUnlimited).toBe(true);
    expect(d.remainingLabel).toBe('∞');
    // 「已用 ∞」会被读成「用了无穷多」⇒ 已用那一格给 —
    expect(d.usedLabel).toBe('—');
    expect(d.totalLabel).toBe('不限量');
  });

  it('空输入不炸（未登录 / 接口没回来时组件仍会渲染）', () => {
    const d = resolveAiQuotaDisplay();
    expect(d.isUnlimited).toBe(false);
    expect(d.degraded).toBe(true);
    expect(d.usedLabel).toBe('0%');
  });

  it('百分比文案分档：<1% 两位小数、<10% 一位小数、其余整数', () => {
    const mk = (used) =>
      resolveAiQuotaDisplay({
        tier: 'plus',
        usedTokens: used,
        baseTokenLimit: 1000000,
        tokenLimit: 1000000,
      });
    expect(mk(5000).usedLabel).toBe('0.50%');
    expect(mk(50000).usedLabel).toBe('5.0%');
    expect(mk(500000).usedLabel).toBe('50%');
  });

  it('tooltip 里保留「档位 + 附加包」明细，可见文案里只说含附加包（避免与订阅页口径打架）', () => {
    const d = resolveAiQuotaDisplay({
      tier: 'max',
      usedTokens: 0,
      baseTokenLimit: MAX_BASE,
      bonusTokens: PACK_LITE,
      tokenLimit: MAX_BASE + PACK_LITE,
    });
    expect(d.packLabel).toBe('+63%');
    expect(d.titleLabel).toContain('+63%');
    expect(d.detailLabel).not.toContain('63%');
    expect(d.detailLabel).toContain('含附加包');
  });
});

describe('百分比口径的源码守卫：三个页面都不再自算 Token 数', () => {
  const MAIN = 'src/views/BOHAI/BOHAI/BOHAIMain.vue';
  const COMPOSER = 'src/views/BOHAI/BOHAI/components/BohComposer.vue';
  const SETTINGS = 'src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue';
  const SIDEBAR = 'src/views/BOHAI/BOHAI/components/BohSidebar.vue';
  const PLANS = 'src/components/SubscriptionPlans.vue';
  const VAULT = 'supabase/functions/api-key-vault/index.ts';

  it('壳层不再有 Token 数字格式化，且把 tier 一起交给口径函数（尺子就是按它选的）', () => {
    const src = squeezeSource(read(MAIN));
    expect(src).toContain("from '@/utils/ai-quota-display.js'");
    // 旧实现：formatTodayToken(used) / '还可使用 Z Tokens' —— 用户点名要去掉的就是这句
    expect(src).not.toContain('formatTodayToken');
    expect(src).not.toContain('还可使用');
    // 额度百分比不再被 Math.min(100) 封顶（超额时 percent 会超过总额）
    expect(src).not.toContain('(Number(usage.used || 0) / limit) * 100');
    // ⚠️ 少了这一行，尺子会退回「相对自己」的 100%，即第一版那个被用户否掉的口径
    expect(src).toContain('tier: String(result.data.tier');
  });

  it('输入区浮层抬头写「今日剩余」，条宽用归一值', () => {
    const src = squeezeSource(read(COMPOSER));
    expect(src).toContain('今日剩余');
    expect(src).toContain('usage.quotaRemainingText');
    expect(src).toContain('width: usage.quotaMeterText');
    // 剩余是 625% 这种三位数，绝不能直接当宽度
    expect(src).not.toContain('width: usage.quotaRemainingText');
  });

  it('设置页用量卡显示「今日剩余」，条宽与 aria 都按消耗归一', () => {
    const src = squeezeSource(read(SETTINGS));
    expect(src).toContain('今日剩余');
    expect(src).not.toContain('今日已用');
    expect(src).not.toContain('剩余 ${formatTokenCount(quotaRemaining)} Tokens');
    expect(src).not.toContain('总额 ${formatTokenCount(quotaLimit)}');
    expect(src).toContain('quotaMeterText');
    // 条宽用归一值（已用 ÷ 总额）；aria 量程固定 0–100，读屏不会把 625% 报成量程
    expect(src).toContain('quotaDisplay.meterPercent');
    expect(src).toContain('aria-valuemax="100"');
    // 积分余额是「余额」不是「日额度」，仍显示绝对值 —— 别被这轮口径一起改掉
    expect(src).toContain('formatTokenCount(pointsBalance)');
  });

  it('侧栏账号浮层写「今日剩余」并用归一后的条宽', () => {
    const src = squeezeSource(read(SIDEBAR));
    expect(src).toContain('今日剩余');
    expect(src).toContain('quota.meterPercent');
    expect(src).toContain('quota.remainingLabel');
    expect(src).not.toContain('quota.percent}%');
  });

  it('订阅页改用档位百分比，不再引用已删除的 PLAN_AI_TOKENS', () => {
    const src = squeezeSource(read(PLANS));
    expect(src).toContain('PLAN_AI_TOKEN_PERCENTS');
    expect(src).toContain('formatPackQuotaPercent');
    expect(src).not.toContain('PLAN_AI_TOKENS');
    // 附加包卡片不再直接渲染 Token 数字（字段已改成数值）
    expect(src).not.toContain('{{ pack.tokenBonus }}');
  });

  it('Edge Function 的 quota-status 返回基础额度与包加成两个分量', () => {
    // 本机到 *.supabase.co 间歇不通，端到端拉不到，所以先锁源码：
    // 少这两个字段，前端就只能降级成「量程永远 100%」，包区段永不显示。
    const src = squeezeSource(read(VAULT));
    expect(src).toContain('baseTokenLimit:');
    expect(src).toContain('bonusTokens,');
    expect(src).toContain('let bonusTokens = 0;');
  });
});
