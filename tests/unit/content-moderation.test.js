import { describe, expect, it, vi } from 'vitest';
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

  // BUG-U13: 未成年 在 SEVERE_REASON_MARKERS 中
  it('rejects content with 未成年 in reason code at high confidence', () => {
    const result = __moderationTestUtils.parseAIModerationResult(
      '{"status":"rejected","confidence":0.99,"reason_code":"未成年","reason":"涉及未成年人内容"}'
    );
    expect(result.status).toBe('rejected');
  });

  it('rejects content with 未成年 in reason text at high confidence', () => {
    const result = __moderationTestUtils.parseAIModerationResult(
      '{"status":"rejected","confidence":0.99,"reason_code":"SEVERE","reason":"包含未成年相关违规"}'
    );
    expect(result.status).toBe('rejected');
  });

  // BUG-U3: failClosed 触发时应有 console.warn
  it('logs warning when failClosed triggers on parse failure', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = __moderationTestUtils.parseAIModerationResult('invalid json', { failClosed: true });
      expect(result.status).toBe('rejected');
      expect(result.source).toBe('fallback_parse');
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('failClosed');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn when failClosed is false on parse failure', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = __moderationTestUtils.parseAIModerationResult('invalid json', { failClosed: false });
      expect(result.status).toBe('approved');
      expect(result.source).toBe('fallback_parse');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
