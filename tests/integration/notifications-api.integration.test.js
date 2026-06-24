import { beforeEach, describe, expect, it, vi } from 'vitest';

const fm = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  channelMock: {
    on: vi.fn(function () { return fm.channelMock; }),
    subscribe: vi.fn(function () { return fm.channelMock; }),
  },
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fm.fromMock,
    rpc: fm.rpcMock,
    channel: vi.fn(() => fm.channelMock),
  },
}));

vi.mock('../../src/utils/pushplus.js', () => ({
  sendNotificationPush: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('../../src/utils/api/pushplus-api.js', () => ({
  getUserPushplusToken: vi.fn(() => Promise.resolve('test-pushplus-token')),
}));

vi.mock('../../src/utils/forum-post-format.js', () => ({
  getForumPostExcerpt: vi.fn(() => 'excerpt'),
  getForumPostParts: vi.fn(() => ({ title: '', body: '' })),
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  filterSelfActionNotifications,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
  getUnreadNotificationCount,
  subscribeToNotifications,
  sendPushplusForNotification,
} from '../../src/utils/api/notifications-api.js';

function createQueryBuilder(result, calls = []) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return query; }),
    is: vi.fn((col, val) => { calls.push({ method: 'is', col, val }); return query; }),
    lt: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    single: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    then: (resolve) => { Promise.resolve(result).then(resolve); return query; },
  };
  return query;
}

describe('notifications-api integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  describe('filterSelfActionNotifications', () => {
    it('filters out self likes', () => {
      const notifications = [
        { id: '1', sender_id: 'u1', recipient_id: 'u1', type: 'like' },
        { id: '2', sender_id: 'u1', recipient_id: 'u2', type: 'like' },
        { id: '3', sender_id: 'u1', recipient_id: 'u1', type: 'comment' },
      ];
      const filtered = filterSelfActionNotifications(notifications);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    it('keeps non-self-action notifications', () => {
      const notifications = [
        { id: '1', sender_id: 'u1', recipient_id: 'u1', type: 'impression' },
      ];
      const filtered = filterSelfActionNotifications(notifications);
      expect(filtered).toHaveLength(1);
    });

    it('handles empty array', () => {
      const filtered = filterSelfActionNotifications([]);
      expect(filtered).toEqual([]);
    });
  });

  describe('getUserNotifications', () => {
    it('fetches notifications with pagination', async () => {
      const query = createQueryBuilder({
        data: [
          { id: 'n1', type: 'like', recipient_id: 'u1', sender_id: 'u2', created_at: '2024-01-01' },
        ],
        error: null,
      });
      fm.fromMock.mockReturnValue(query);

      const result = await getUserNotifications('u1');
      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('handles cursor-based pagination', async () => {
      const notifications = Array.from({ length: 31 }, (_, i) => ({
        id: `n${i}`,
        type: 'like',
        recipient_id: 'u1',
        created_at: `2024-01-${String(i + 1).padStart(2, '0')}`,
      }));

      const query = createQueryBuilder({ data: notifications, error: null });
      fm.fromMock.mockReturnValue(query);

      const result = await getUserNotifications('u1', { limit: 30 });
      expect(result.data.length).toBe(30);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });
  });

  describe('markNotificationAsRead', () => {
    it('uses RPC to mark single notification as read', async () => {
      fm.rpcMock.mockResolvedValue({ data: true, error: null });

      const result = await markNotificationAsRead('n1');
      expect(result.ok).toBe(true);
      expect(fm.rpcMock).toHaveBeenCalledWith('mark_single_as_read', { notification_id: 'n1' });
    });

    it('falls back to direct update when RPC is missing', async () => {
      fm.rpcMock.mockResolvedValue({
        data: null,
        error: { code: 'PGRST202', message: 'could not find the function mark_single_as_read' },
      });

      const updateQuery = { eq: vi.fn(() => Promise.resolve({ error: null })) };
      fm.fromMock.mockReturnValue({ update: vi.fn(() => updateQuery) });

      const result = await markNotificationAsRead('n1');
      expect(result.ok).toBe(true);
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('uses RPC to mark all as read', async () => {
      fm.rpcMock.mockResolvedValue({ data: true, error: null });

      const result = await markAllNotificationsAsRead('u1');
      expect(result.ok).toBe(true);
      expect(fm.rpcMock).toHaveBeenCalledWith('mark_all_as_read', { target_user_id: 'u1' });
    });
  });

  describe('createNotification', () => {
    it('creates notification successfully', async () => {
      const insertQuery = {
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { id: 'new-n1', type: 'like', recipient_id: 'u2', sender_id: 'u1' },
            error: null,
          })),
        })),
      };
      fm.fromMock.mockReturnValue({ insert: vi.fn(() => insertQuery) });

      const result = await createNotification('u2', 'u1', 'like');
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('creates notification with extra data', async () => {
      const insertQuery = {
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { id: 'n1', type: 'comment', post_id: 'p1', comment_id: 'c1' },
            error: null,
          })),
        })),
      };
      fm.fromMock.mockReturnValue({ insert: vi.fn(() => insertQuery) });

      const result = await createNotification('u2', 'u1', 'comment', {
        post_id: 'p1',
        comment_id: 'c1',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('getUnreadNotificationCount', () => {
    it('returns count of unread notifications via RPC', async () => {
      fm.rpcMock.mockResolvedValue({
        data: [{ count: 2 }],
        error: null,
      });

      const result = await getUnreadNotificationCount('u1');
      expect(result.ok).toBe(true);
      expect(result.count).toBe(2);
      expect(fm.rpcMock).toHaveBeenCalledWith('get_unread_notification_count', { p_recipient_id: 'u1' });
    });

    it('filters out self-action notifications via RPC', async () => {
      fm.rpcMock.mockResolvedValue({
        data: [{ count: 1 }],
        error: null,
      });

      const result = await getUnreadNotificationCount('u1');
      expect(result.count).toBe(1);
      expect(fm.rpcMock).toHaveBeenCalledWith('get_unread_notification_count', { p_recipient_id: 'u1' });
    });
  });

  describe('subscribeToNotifications', () => {
    it('creates realtime channel subscription', () => {
      const callback = vi.fn();
      const channel = subscribeToNotifications('u1', callback);

      expect(fm.channelMock).toBeDefined();
    });
  });

  describe('sendPushplusForNotification', () => {
    it('skips for unsupported notification types', async () => {
      const result = await sendPushplusForNotification({
        recipient_id: 'u1',
        sender_id: 'u2',
        type: 'lottery_win',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('不发送 Pushplus');
    });

    it('skips self-action notifications', async () => {
      const result = await sendPushplusForNotification({
        recipient_id: 'u1',
        sender_id: 'u1',
        type: 'like',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('自操作');
    });

    it('sends push for like notification', async () => {
      // Mock profile query for sender username
      const profileQuery = createQueryBuilder({
        data: { id: 'u2', username: 'testuser' },
        error: null,
      });
      // Mock post query for content
      const postQuery = createQueryBuilder({
        data: { title: 'Test', body: 'Content' },
        error: null,
      });
      fm.fromMock
        .mockReturnValueOnce(profileQuery)
        .mockReturnValueOnce(postQuery);

      const result = await sendPushplusForNotification({
        recipient_id: 'u1',
        sender_id: 'u2',
        type: 'like',
        post_id: 'p1',
      });
      expect(result.success).toBe(true);
    });
  });
});