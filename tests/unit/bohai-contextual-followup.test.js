import { describe, expect, it } from 'vitest';
import {
  buildContextualWebSearchQuery,
  buildContextualFollowUpQuery,
  buildConversationSummaryFingerprint,
  buildHistoryMessagesWithCachedSummary,
  getWebSearchFreshnessDays,
  isEllipticalElaborationFollowUp,
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

  it('resolves a referentless introduction request from the previous turn', () => {
    const followUp = '介绍一下';
    const history = [
      { role: 'user', content: 'Kimi 目前最新的模型是什么？' },
      { role: 'assistant', content: '目前 Kimi 的最新模型是 Kimi K3。' }
    ];

    expect(isEllipticalElaborationFollowUp(followUp)).toBe(true);
    expect(isContextDependentFollowUp(followUp)).toBe(true);
    expect(isEllipticalElaborationFollowUp('介绍一下 Kimi K3')).toBe(false);

    const contextualQuery = buildContextualFollowUpQuery(followUp, history);
    const searchQuery = buildContextualWebSearchQuery(followUp, history);
    expect(contextualQuery).toContain('Kimi K3');
    expect(searchQuery).toContain('Kimi K3');
    expect(searchQuery).toContain('请联网核实');
    expect(searchQuery).toContain('当前追问：介绍一下');
  });

  it('carries the prior subject into a short temporal clarification', () => {
    const followUp = '最近呢，就这几天？';
    const query = buildContextualFollowUpQuery(followUp, [
      { role: 'user', content: '索尼最近发布了什么相机？' },
      { role: 'assistant', content: '索尼最近发布了 Alpha 7 V 和 Alpha 7R VI。' }
    ]);

    expect(isContextDependentFollowUp(followUp)).toBe(true);
    expect(isContextDependentFollowUp('最近几天呢？')).toBe(true);
    expect(isContextDependentFollowUp('那过去两天呢？')).toBe(true);
    expect(query).toContain('索尼最近发布了什么相机');
    expect(query).toContain(followUp);

    const searchQuery = buildContextualWebSearchQuery(followUp, [
      { role: 'user', content: '索尼最近发布了什么相机？' },
      { role: 'assistant', content: '未经证实的型号 Alpha 7 V。' }
    ]);
    expect(searchQuery).toContain('索尼最近发布了什么相机');
    expect(searchQuery).not.toContain('未经证实');
  });

  it('does not treat a complete recent-events question as a follow-up', () => {
    const question = '最近有什么相机发布？';

    expect(isContextDependentFollowUp(question)).toBe(false);
    expect(buildContextualFollowUpQuery(question, [
      { role: 'user', content: '最近有什么好电影？' },
      { role: 'assistant', content: '这里有几部近期上映的电影。' }
    ])).toBe(question);
  });

  it('only applies freshness filters to time-sensitive searches', () => {
    expect(getWebSearchFreshnessDays('索尼最近几天发布了什么相机')).toBe(7);
    expect(getWebSearchFreshnessDays('索尼最新发布了什么相机')).toBe(30);
    expect(getWebSearchFreshnessDays('如何清洁相机传感器')).toBeNull();
  });

  it('keeps full history until a valid summary can replace older turns', () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index + 1}`
    }));

    const withoutSummary = buildHistoryMessagesWithCachedSummary({ messages });
    expect(withoutSummary).toHaveLength(12);
    expect(withoutSummary[0].content).toBe('message-1');

    const fingerprint = buildConversationSummaryFingerprint(messages);
    const withSummary = buildHistoryMessagesWithCachedSummary({
      messages,
      contextSummary: {
        version: 2,
        fingerprint,
        content: '<facts>earlier context</facts>'
      }
    });
    expect(withSummary).toHaveLength(8);
    expect(withSummary[0].content).toBe('message-5');

    const appendedMessages = [
      ...messages,
      { role: 'user', content: 'message-13' },
      { role: 'assistant', content: 'message-14' }
    ];
    const withPersistentSummary = buildHistoryMessagesWithCachedSummary({
      messages: appendedMessages,
      contextSummary: {
        version: 2,
        fingerprint,
        content: '<facts>earlier context</facts>',
        coveredMessageCount: 4,
        sourceMessageCount: 12
      }
    });
    expect(withPersistentSummary).toHaveLength(10);
    expect(withPersistentSummary[0].content).toBe('message-5');
    expect(withPersistentSummary[9].content).toBe('message-14');
  });
});
