import { describe, expect, it } from 'vitest';
import { localizeSubscriptionMessage } from '../../src/utils/api/subscription-api.js';

/* 订阅 RPC 的失败文案（2026-11-24 plans/046 §P6 补漏）
   ══════════════════════════════════════════════════════════════════════════════
   这条链断在两个「看起来都正常」的地方，所以一直没有被任何测试发现：

     ① 订阅类 RPC 失败返回的是 **`{ok:false, message:'PLAN_NOT_AVAILABLE'}`**
        —— HTTP 200、**不带 PostgREST error**。于是 `normalizeDbError()` 那条
        「有 error 就翻译」的分支**根本接不到它**，它在代码审查里看起来是覆盖到的。
     ② `normalizeSubscribePayload()` 又把 `message` 原样透传，调用方是
        `notify('订阅失败', result.data?.message)` —— **直接上屏**。

   合起来：用户会看到「订阅失败 / PLAN_NOT_AVAILABLE」这种英文常量。

   ⚠️ 这条缺陷平时不出现，因为前端已经不会发 plus 了。它只在
      「旧 PWA 包发已下架档位」或「日后有档位下架」时露脸 —— 正是最难复现、
      最容易在事故里被当成新问题的形态。所以用单测钉死，而不是靠探针
      （探针要先造一个下架档位，代价大且会污染线上价目表）。
   ══════════════════════════════════════════════════════════════════════════════ */

describe('localizeSubscriptionMessage：订阅机器码 → 用户可读文案', () => {
  it('PLAN_NOT_AVAILABLE 翻成中文（本次补的核心缺口）', () => {
    expect(localizeSubscriptionMessage('PLAN_NOT_AVAILABLE')).toBe(
      '该档位已下架，请刷新页面后选择其他方案',
    );
  });

  it('不再把任何已知机器码原样返回（防回退成「英文常量上屏」）', () => {
    const known = [
      'PLAN_NOT_AVAILABLE',
      'INVALID_BILLING_CYCLE',
      'INSUFFICIENT_POINTS',
      'NOT_AUTHENTICATED',
      'PROFILE_NOT_FOUND',
      'LOWER_TIER_NOT_SUPPORTED',
      'INVALID_POINTS_COST',
    ];
    for (const code of known) {
      const out = localizeSubscriptionMessage(code);
      expect(out).not.toBe(code);
      // 必须是中文文案（含汉字），而不是「翻译成一个英文短语」的假成功
      expect(out).toMatch(/[\u4e00-\u9fa5]/);
    }
  });

  it('未知码原样透传（刻意不兜底成「请稍后重试」）', () => {
    // 兜底会把真错误淹掉：排查时看不到服务端到底说了什么。
    expect(localizeSubscriptionMessage('SOME_FUTURE_CODE')).toBe('SOME_FUTURE_CODE');
  });

  it('空值一律返回空串，让调用方的 `|| 请稍后重试` 兜底生效', () => {
    expect(localizeSubscriptionMessage('')).toBe('');
    expect(localizeSubscriptionMessage(null)).toBe('');
    expect(localizeSubscriptionMessage(undefined)).toBe('');
    expect(localizeSubscriptionMessage('   ')).toBe('');
  });

  it('首尾空白被裁掉后再查表（`PLAN_NOT_AVAILABLE\\n` 也要翻）', () => {
    expect(localizeSubscriptionMessage('  PLAN_NOT_AVAILABLE \n')).toBe(
      '该档位已下架，请刷新页面后选择其他方案',
    );
  });

  it('已经是中文的直接放过，不会被当成未知码二次包装', () => {
    const human = '积分不足，请先充值';
    expect(localizeSubscriptionMessage(human)).toBe(human);
  });
});
