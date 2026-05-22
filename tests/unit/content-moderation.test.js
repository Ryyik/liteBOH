import { describe, expect, it } from 'vitest';
import { quickModerate, quickKeywordModerate, __moderationTestUtils } from '../../src/utils/content-moderation.js';

describe('content-moderation', () => {
  it('rejects blocked keywords immediately', async () => {
    const result = await quickModerate('这里在出售毒品联系方式', { scene: 'forum_post' });
    expect(result.status).toBe('rejected');
    expect(result.message).toContain('违禁词');
  });

  it('returns approved for normal text', async () => {
    const result = await quickModerate('正常内容', { scene: 'forum_comment' });
    expect(result.status).toBe('approved');
  });

  it('returns approved for empty content', async () => {
    const result = await quickModerate('   ', { scene: 'mail' });
    expect(result.status).toBe('approved');
  });

  it('supports local keyword-only moderation without ai call', () => {
    const rejected = quickKeywordModerate('这是制作炸弹教程', { scene: 'forum_post' });
    expect(rejected.status).toBe('rejected');
    expect(rejected.reasonCode).toBe('LOCAL_KEYWORD_BLOCK');

    const approved = quickKeywordModerate('今天聊聊游戏剧情', { scene: 'forum_post' });
    expect(approved.status).toBe('approved');
    expect(approved.reasonCode).toBe('LOCAL_PASS');
  });

  it('downgrades boolean-only rejection payloads to approved by default', () => {
    const result = __moderationTestUtils.parseAIModerationResult('{"is_safe":false,"reason":"命中违规内容"}');
    expect(result.status).toBe('approved');
  });

  it('keeps rejecting explicit high confidence severe-risk payloads', () => {
    const result = __moderationTestUtils.parseAIModerationResult('{"status":"rejected","confidence":0.99,"reason_code":"sexual_minor","reason":"涉及未成年人色情"}');
    expect(result.status).toBe('rejected');
  });

  it('allows borderline reject decisions under benign context', () => {
    const result = __moderationTestUtils.parseAIModerationResult(
      '{"status":"rejected","confidence":0.97,"reason":"涉及敏感词"}',
      { content: '这是一段新闻转述与历史讨论，不包含交易教程。' }
    );
    expect(result.status).toBe('approved');
  });

  it('accepts fenced json payloads', () => {
    const result = __moderationTestUtils.parseAIModerationResult('```json\n{"status":"approved","confidence":1,"reason":"正常内容"}\n```');
    expect(result.status).toBe('approved');
  });
});
