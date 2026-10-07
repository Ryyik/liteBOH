/**
 * bohai-intent-stage.test.js — 锁意图标志阶段的**组合口径**（plans/025 v2 · Step 5-2）
 *
 * 只断言**不变式**（不复制谓词的内部实现）—— 谓词本身有各自的单测，
 * 这里要锁的是「6 个标志之间怎么组合」：社区创作 ⊂ 社区问题、factual ⊇ bohInternal。
 */
import { describe, expect, it } from 'vitest';
import { computeIntentFlags } from '../../src/views/BOHAI/engine/stages/intent';

const CASES = [
  { routingQueryText: '入口在哪', userText: '入口在哪' },
  { routingQueryText: '社区最近有什么新帖', userText: '社区最近有什么新帖' },
  { routingQueryText: '社区有什么', userText: '帮我写个帖子发到社区' },
  { routingQueryText: '你好呀', userText: '你好呀' },
  { routingQueryText: '', userText: '' },
];

describe('BOHAI 意图标志阶段（Step 5-2）', () => {
  it('返回全部 6 个标志，且都是布尔', () => {
    const f = computeIntentFlags(CASES[0]);
    expect(Object.keys(f).sort()).toEqual([
      'bohInternalFactualQuestion',
      'communityCreativeRequest',
      'communityNeedsEvidence',
      'communityQuestion',
      'factualQuestion',
      'operationQuestion',
    ]);
    Object.values(f).forEach((v) => expect(typeof v).toBe('boolean'));
  });

  it('不变式：社区创作请求 ⊂ 社区问题；needsEvidence = community && !creative', () => {
    for (const c of CASES) {
      const f = computeIntentFlags(c);
      if (f.communityCreativeRequest) expect(f.communityQuestion).toBe(true);
      expect(f.communityNeedsEvidence).toBe(f.communityQuestion && !f.communityCreativeRequest);
    }
  });

  it('不变式：factualQuestion ⊇ bohInternalFactualQuestion', () => {
    for (const c of CASES) {
      const f = computeIntentFlags(c);
      if (f.bohInternalFactualQuestion) expect(f.factualQuestion).toBe(true);
    }
  });

  it('站点操作类问题命中 operationQuestion', () => {
    expect(
      computeIntentFlags({ routingQueryText: '入口在哪', userText: '入口在哪' }).operationQuestion,
    ).toBe(true);
  });

  it('空输入安全（不抛，且全 false）', () => {
    const f = computeIntentFlags({ routingQueryText: '', userText: '' });
    expect(f.operationQuestion).toBe(false);
    expect(f.communityQuestion).toBe(false);
    expect(f.communityCreativeRequest).toBe(false);
    expect(f.bohInternalFactualQuestion).toBe(false);
    expect(f.factualQuestion).toBe(false);
  });
});
