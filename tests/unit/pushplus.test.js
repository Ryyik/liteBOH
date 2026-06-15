import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger
vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  sendPushplusMessage,
  sendNotificationPush,
  validatePushplusToken,
  sendAdvancedMessage,
} from '@/utils/pushplus.js';

describe('pushplus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendPushplusMessage', () => {
    it('returns error when token is empty', async () => {
      const result = await sendPushplusMessage('', 'title', 'content');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Token');
    });

    it('sends request with correct payload', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      const result = await sendPushplusMessage('test-token', 'Hello', '<p>World</p>', 'html');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('pushplus.plus/send');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.token).toBe('test-token');
      expect(body.title).toBe('Hello');
    });

    it('includes topic when provided', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      await sendPushplusMessage('token', 'title', 'content', 'html', 'group1');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.topic).toBe('group1');
    });

    it('returns error on non-200 response code', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 903, msg: 'Invalid token' }),
      });

      const result = await sendPushplusMessage('bad-token', 'title', 'content');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Token 不正确');
    });

    it('returns error on unknown response code', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 999, msg: 'Server error' }),
      });

      const result = await sendPushplusMessage('token', 'title', 'content');
      expect(result.success).toBe(false);
      expect(result.message).toContain('服务端验证错误');
    });

    it('handles fetch network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await sendPushplusMessage('token', 'title', 'content');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Network error');
    });
  });

  describe('sendNotificationPush', () => {
    it('sends like notification', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      const result = await sendNotificationPush('token', 'like', {
        senderName: 'Alice',
        postContent: 'Great post!',
      });
      expect(result.success).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.title).toContain('Alice');
      expect(body.title).toContain('点赞');
    });

    it('sends comment notification', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      const result = await sendNotificationPush('token', 'comment', {
        senderName: 'Bob',
        commentContent: 'Nice!',
      });
      expect(result.success).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.title).toContain('Bob');
      expect(body.title).toContain('评论');
    });

    it('sends impression notification', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      const result = await sendNotificationPush('token', 'impression', {
        senderName: 'Charlie',
        impressionContent: 'Cool person',
      });
      expect(result.success).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.title).toContain('Charlie');
      expect(body.title).toContain('印象');
    });

    it('returns error for unknown notification type', async () => {
      const result = await sendNotificationPush('token', 'unknown_type', {});
      expect(result.success).toBe(false);
      expect(result.message).toContain('未知的通知类型');
    });

    it('rate limits duplicate notifications within interval', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      // Use unique token to avoid cross-test pollution of lastSendTime Map
      const uniqueToken = 'rate-limit-test-' + Date.now();

      // First call should succeed
      const result1 = await sendNotificationPush(uniqueToken, 'like', { senderName: 'A' });
      expect(result1.success).toBe(true);

      // Second call with same token+type should be rate limited
      const result2 = await sendNotificationPush(uniqueToken, 'like', { senderName: 'B' });
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('频繁');
    });
  });

  describe('validatePushplusToken', () => {
    it('returns error for short token', async () => {
      const result = await validatePushplusToken('short');
      expect(result.success).toBe(false);
      expect(result.message).toContain('格式不正确');
    });

    it('returns error for empty token', async () => {
      const result = await validatePushplusToken('');
      expect(result.success).toBe(false);
    });

    it('validates token by sending test message', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      const result = await validatePushplusToken('valid-token-12345');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns error when test message fails', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 903 }),
      });

      const result = await validatePushplusToken('invalid-token-12345');
      expect(result.success).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe('sendAdvancedMessage', () => {
    it('returns error when token is empty', async () => {
      const result = await sendAdvancedMessage({ token: '', title: 't', content: 'c' });
      expect(result.success).toBe(false);
    });

    it('returns error when content is empty', async () => {
      const result = await sendAdvancedMessage({ token: 't', title: 't', content: '' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('内容不能为空');
    });

    it('sends with channel parameter', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      await sendAdvancedMessage({
        token: 'token',
        title: 'title',
        content: 'content',
        channel: 'mail',
      });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.channel).toBe('mail');
    });

    it('includes optional parameters when provided', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ code: 200 }),
      });

      await sendAdvancedMessage({
        token: 'token',
        title: 'title',
        content: 'content',
        topic: 'group1',
        callbackUrl: 'https://example.com/cb',
        timestamp: 1234567890,
      });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.topic).toBe('group1');
      expect(body.callbackUrl).toBe('https://example.com/cb');
      expect(body.timestamp).toBe(1234567890);
    });
  });
});