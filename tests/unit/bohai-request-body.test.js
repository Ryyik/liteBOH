/**
 * bohai-request-body.test.js — 锁请求体装配（plans/025 v2 · Step 5-3）
 *
 * 关键口径：
 *   ① messages = [system, ...recent, user]，且 `stream: true`；
 *   ② **无速度档位**时 temperature / top_p / max_tokens = profile 原值（不得叠加）；
 *   ③ **有速度档位**时叠加，且 temperature 夹 [0,2]、top_p 夹 [0,1]、max_tokens 乘 scale（下限 1）；
 *   ④ 预算日志只在 `high`/`full` 档位、且有 drops 时才打（用 getDegradationPlan 是否被调用来观测）。
 */
import { describe, expect, it, vi } from 'vitest';
import { buildRequestBody } from '../../src/views/BOHAI/engine/stages/request-body';

const PROFILE = { temperature: 0.6, top_p: 0.9, frequency_penalty: 0.2, max_tokens: 2048 };

const makeTracker = (over = {}) => ({
  addEstimate: vi.fn(),
  getUsage: vi.fn(() => ({ level: 'normal' })),
  getDegradationPlan: vi.fn(() => ({ drops: [] })),
  ...over,
});

const makeInput = (over = {}) => ({
  generationModel: { id: 'm1' },
  systemPromptContent: 'SYS',
  recentMessages: [{ role: 'user', content: 'hi' }],
  finalPrompt: 'FP',
  generationProfile: { ...PROFILE },
  thinkingSpeedDeltas: undefined,
  budgetTracker: makeTracker(),
  ...over,
});

describe('BOHAI 请求体装配（Step 5-3）', () => {
  it('messages 顺序 = system → recent → user，且 stream:true', () => {
    const { requestBody } = buildRequestBody(makeInput());
    expect(requestBody.stream).toBe(true);
    const msgs = requestBody.messages;
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(msgs[1]).toEqual({ role: 'user', content: 'hi' });
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'FP' });
    expect(requestBody.model).toBe('m1');
  });

  it('无速度档位 → 参数取 profile 原值', () => {
    const { requestBody } = buildRequestBody(makeInput());
    expect(requestBody.temperature).toBe(0.6);
    expect(requestBody.top_p).toBe(0.9);
    expect(requestBody.max_tokens).toBe(2048);
    expect(requestBody.frequency_penalty).toBe(0.2);
  });

  it('有速度档位 → 叠加并夹到 [0,2] / [0,1]，max_tokens 乘 scale', () => {
    const { requestBody } = buildRequestBody(
      makeInput({
        generationProfile: {
          temperature: 1.9,
          top_p: 0.95,
          frequency_penalty: 0,
          max_tokens: 1000,
        },
        thinkingSpeedDeltas: { temperature: 0.5, topP: 0.2, maxTokensScale: 2 },
      }),
    );
    expect(requestBody.temperature).toBe(2); // 1.9+0.5 夹到 2
    expect(requestBody.top_p).toBe(1); // 0.95+0.2 夹到 1
    expect(requestBody.max_tokens).toBe(2000); // 1000*2
  });

  it('预算：addEstimate 恒被调用；normal 档不打降级日志', () => {
    const tracker = makeTracker();
    buildRequestBody(makeInput({ budgetTracker: tracker }));
    expect(tracker.addEstimate).toHaveBeenCalled();
    expect(tracker.getDegradationPlan).not.toHaveBeenCalled();
  });

  it('预算：high 档且有 drops → 查询降级计划', () => {
    const tracker = makeTracker({
      getUsage: vi.fn(() => ({ level: 'high' })),
      getDegradationPlan: vi.fn(() => ({ drops: ['history'] })),
    });
    buildRequestBody(makeInput({ budgetTracker: tracker }));
    expect(tracker.getDegradationPlan).toHaveBeenCalled();
  });
});
