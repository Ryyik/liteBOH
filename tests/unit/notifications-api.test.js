import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  fromMock: vi.fn()
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: testMocks.fromMock
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
    then: (resolve) => Promise.resolve(result).then(resolve)
  };
  return query;
}

describe('notifications-api', () => {
  beforeEach(() => {
    testMocks.fromMock.mockReset();
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

  it('falls back to legacy unread mail count when moderation_status is missing', async () => {
    const calls = [];
    const notificationsQuery = createThenableQuery({
      data: [
        { id: 'n1', sender_id: 'u2', recipient_id: 'u1', type: 'like' },
        { id: 'n2', sender_id: 'u1', recipient_id: 'u1', type: 'comment' }
      ],
      error: null
    }, calls);
    const moderationMailQuery = createThenableQuery({
      count: 0,
      error: { message: 'column "moderation_status" does not exist', code: '42703' }
    }, calls);
    const legacyMailQuery = createThenableQuery({
      count: 2,
      error: null
    }, calls);

    testMocks.fromMock
      .mockReturnValueOnce(notificationsQuery)
      .mockReturnValueOnce(moderationMailQuery)
      .mockReturnValueOnce(legacyMailQuery);

    const result = await getUnreadNotificationCount('u1');

    expect(result.ok).toBe(true);
    expect(result.notifCount).toBe(1);
    expect(result.mailCount).toBe(2);
    expect(result.count).toBe(3);
    expect(testMocks.fromMock).toHaveBeenCalledTimes(3);
    expect(calls).toContainEqual({ method: 'eq', column: 'moderation_status', value: 'approved' });
  });
});
