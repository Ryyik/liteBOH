import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  channelMock: vi.fn(),
  subscribeMock: vi.fn()
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: testMocks.fromMock,
    rpc: testMocks.rpcMock,
    channel: testMocks.channelMock
  }
}));

vi.mock('../../src/utils/api/pushplus-api.js', () => ({
  getUserPushplusToken: vi.fn()
}));

vi.mock('../../src/utils/pushplus.js', () => ({
  sendNotificationPush: vi.fn()
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import { filterSelfActionNotifications, getUnreadNotificationCount, subscribeToNotifications } from '../../src/utils/api/notifications-api.js';

function createThenableQuery(result, calls = []) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column, value) => {
      calls.push({ method: 'eq', column, value });
      return query;
    }),
    is: vi.fn(() => query),
    then: (resolve) => Promise.resolve(result).then(resolve)
  };
  return query;
}

describe('notifications-api', () => {
  beforeEach(() => {
    testMocks.fromMock.mockReset();
    testMocks.rpcMock.mockReset();
    clearRequestCache();
  });

  it('filters self-like and self-comment notifications', () => {
    const input = [
      { sender_id: 'u1', recipient_id: 'u1', type: 'like' },
      { sender_id: 'u1', recipient_id: 'u1', type: 'comment' },
      { sender_id: 'u1', recipient_id: 'u1', type: 'impression' },
      { sender_id: 'u2', recipient_id: 'u1', type: 'like' }
    ];

    const output = filterSelfActionNotifications(input);
    expect(output).toHaveLength(2);
    expect(output[0].type).toBe('impression');
    expect(output[1].sender_id).toBe('u2');
  });

  it('counts unread notifications via RPC', async () => {
    testMocks.rpcMock.mockResolvedValue({
      data: [{ count: 1 }],
      error: null
    });

    const result = await getUnreadNotificationCount('u1');

    expect(result.ok).toBe(true);
    expect(result.notifCount).toBe(1);
    expect(result.mailCount).toBe(0);
    expect(result.count).toBe(1);
    expect(testMocks.rpcMock).toHaveBeenCalledTimes(1);
    expect(testMocks.rpcMock).toHaveBeenCalledWith('get_unread_notification_count', { p_recipient_id: 'u1' });
  });

  it('falls back to direct query when RPC function is missing', async () => {
    // RPC 返回函数缺失错误
    testMocks.rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'could not find the function get_unread_notification_count' }
    });

    // 降级查询返回结果
    const mockNotifications = [
      { id: 'n1', sender_id: 'u2', recipient_id: 'u1', type: 'like' },
      { id: 'n2', sender_id: 'u1', recipient_id: 'u1', type: 'like' }, // 自操作，应被过滤
      { id: 'n3', sender_id: 'u3', recipient_id: 'u1', type: 'comment' }
    ];
    testMocks.fromMock.mockReturnValue(createThenableQuery({ data: mockNotifications, error: null }));

    const result = await getUnreadNotificationCount('u1');

    expect(result.ok).toBe(true);
    expect(result.notifCount).toBe(2); // 过滤掉自操作通知后剩 2 条
    expect(result.count).toBe(2);
    expect(testMocks.fromMock).toHaveBeenCalledWith('notifications');
  });

  it('returns error when RPC fails with non-missing-function error', async () => {
    // RPC 返回非函数缺失错误（如网络错误）
    testMocks.rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Connection timeout' }
    });

    const result = await getUnreadNotificationCount('u1');

    expect(result.ok).toBe(false);
    expect(result.count).toBe(0);
    expect(result.notifCount).toBe(0);
    // 不应该触发降级查询
    expect(testMocks.fromMock).not.toHaveBeenCalled();
  });

  describe('subscribeToNotifications', () => {
    let mockChannel;
    let mockCallback;

    beforeEach(() => {
      mockCallback = vi.fn();
      mockChannel = {
        on: vi.fn(() => mockChannel),
        subscribe: vi.fn((callback) => {
          if (callback) callback('SUBSCRIBED');
          return mockChannel;
        })
      };
      testMocks.channelMock.mockReturnValue(mockChannel);
    });

    it('creates channel with correct configuration', async () => {
      const channelPromise = subscribeToNotifications('user-123', mockCallback);

      expect(testMocks.channelMock).toHaveBeenCalledWith(expect.stringMatching(/^notifications:user-123:[1-9]\d*$/));
      expect(mockChannel.on).toHaveBeenCalled();
      expect(mockChannel.subscribe).toHaveBeenCalled();

      const channel = await channelPromise;
      expect(channel).toBe(mockChannel);
    });

    it('handles callback errors without breaking subscription', async () => {
      // 模拟 callback 抛出异常
      mockCallback.mockImplementation(() => {
        throw new Error('Callback error');
      });

      const channelPromise = subscribeToNotifications('user-123', mockCallback);

      // 获取 postgres_changes 事件的 handler
      const onCalls = mockChannel.on.mock.calls;
      const postgresChangesCall = onCalls.find(call => call[0] === 'postgres_changes');
      const handler = postgresChangesCall?.[2];

      // 模拟 payload
      const payload = { new: { id: 'n1', type: 'like' } };

      // 调用 handler，应该捕获错误而不抛出
      if (handler) {
        handler(payload);
        expect(mockCallback).toHaveBeenCalled();
        expect(mockCallback).toHaveBeenCalledWith(payload.new);
      }

      await expect(channelPromise).resolves.toBe(mockChannel);
    });

    it('logs subscription status changes', async () => {
      const { logger } = await import('../../src/utils/logger.js');

      const channelPromise = subscribeToNotifications('user-123', mockCallback);

      // 验证 subscribe 回调被调用
      expect(mockChannel.subscribe).toHaveBeenCalled();

      // 清除之前的日志调用
      logger.debug.mockClear();

      // 模拟订阅状态回调
      const subscribeCall = mockChannel.subscribe.mock.calls[0];
      const statusCallback = subscribeCall?.[0];

      if (statusCallback) {
        statusCallback('SUBSCRIBED');
        expect(logger.info).toHaveBeenCalledWith('notifications-api', '实时订阅成功', { userId: 'user-123' });
      }

      await expect(channelPromise).resolves.toBe(mockChannel);
    });
  });
});
