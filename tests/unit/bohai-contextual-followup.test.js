import { describe, expect, it } from 'vitest';
import {
  buildContextualFollowUpQuery,
  isContextDependentFollowUp
} from '../../src/views/BOHAI/composables/bohai-engine-helpers.js';

describe('bohai contextual follow-up query', () => {
  it('carries recent topic into short follow-up questions', () => {
    const query = buildContextualFollowUpQuery('作用是什么', [
      { role: 'user', content: '介绍一下共振呼吸法' },
      { role: 'assistant', content: '共振呼吸法是一种通过调节呼吸节奏促进身心平衡的技巧。' }
    ]);

    expect(isContextDependentFollowUp('作用是什么')).toBe(true);
    expect(query).toContain('共振呼吸法');
    expect(query).toContain('作用是什么');
  });

  it('leaves complete standalone questions unchanged', () => {
    const question = '介绍一下共振呼吸法的作用和适合场景';
    const query = buildContextualFollowUpQuery(question, [
      { role: 'user', content: '为什么天空是蓝的' },
      { role: 'assistant', content: '主要和瑞利散射有关。' }
    ]);

    expect(query).toBe(question);
  });
});
