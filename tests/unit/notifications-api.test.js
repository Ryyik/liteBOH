import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn()
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: testMocks.fromMock,
    rpc: testMocks.rpcMock
  }
}));

vi.mock('../../src/utils/api/pushplus-api.js', () => ({
  getUserPushplusToken: vi.fn()
}));

vi.mock('../../src/utils/pushplus.js', () => ({
  sendNotificationPush: vi.fn()
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import { filterSelfActionNotifications, getUnreadNotificationCount } from '../../src/utils/api/notifications-api.js';

function createThenableQuery(result, calls = []) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column, value) => {
      calls.push({ method: 'eq', column, value });
      return query;
    }),
    then: (resolve) => { Promise.resolve(result).then(resolve); return query; }
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
});
