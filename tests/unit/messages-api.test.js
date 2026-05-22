import { describe, expect, it, vi, beforeEach } from 'vitest';

const testMocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  runAsyncRelaxedModerationMock: vi.fn(),
  runKeywordPrecheckMock: vi.fn(),
  writeModerationAuditLogMock: vi.fn(),
  sendPushplusForMessageMock: vi.fn()
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: testMocks.fromMock
  }
}));

vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  UNIFIED_APPROVED_STATUS: 'approved',
  UNIFIED_REJECTED_STATUS: 'rejected',
  runAsyncRelaxedModeration: testMocks.runAsyncRelaxedModerationMock,
  runKeywordPrecheck: testMocks.runKeywordPrecheckMock,
  writeModerationAuditLog: testMocks.writeModerationAuditLogMock,
  isMissingDbColumnError: (error, columnName = '') => {
    const text = `${String(error?.message || '').toLowerCase()} ${String(error?.details || '').toLowerCase()}`;
    const needle = String(columnName || '').trim().toLowerCase();
    return Boolean(needle && text.includes(needle));
  }
}));

vi.mock('../../src/utils/api/notifications-api.js', () => ({
  sendPushplusForMessage: testMocks.sendPushplusForMessageMock
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import { getUserMessages, markMessagesAsRead, sendModeratedMessages } from '../../src/utils/api/messages-api.js';

function createThenableQuery(result, calls = []) {
  const query = {
    select: vi.fn(() => query),
    or: vi.fn((value) => {
      calls.push({ method: 'or', value });
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    lt: vi.fn(() => query),
    then: (resolve) => Promise.resolve(result).then(resolve)
  };
  return query;
}

describe('messages-api.sendModeratedMessages', () => {
  beforeEach(() => {
    testMocks.fromMock.mockReset();
    testMocks.insertMock.mockReset();
    testMocks.runAsyncRelaxedModerationMock.mockReset();
    testMocks.runKeywordPrecheckMock.mockReset();
    testMocks.writeModerationAuditLogMock.mockReset();
    testMocks.sendPushplusForMessageMock.mockReset();
    clearRequestCache();

    testMocks.fromMock.mockReturnValue({
      insert: testMocks.insertMock
    });
    testMocks.runKeywordPrecheckMock.mockReturnValue({
      status: 'approved',
      message: '通过'
    });
    testMocks.runAsyncRelaxedModerationMock.mockResolvedValue({
      status: 'approved',
      message: '通过'
    });
    testMocks.writeModerationAuditLogMock.mockResolvedValue({ ok: true });
    testMocks.sendPushplusForMessageMock.mockResolvedValue({ success: true });
  });

  it('blocks sending when local keyword precheck rejects and failClosed is true', async () => {
    testMocks.runKeywordPrecheckMock.mockReturnValue({
      status: 'rejected',
      message: '命中高风险违禁词，已拒绝'
    });

    const result = await sendModeratedMessages({
      senderId: 'u1',
      senderName: 'alice',
      recipients: [{ id: 'u2', username: 'bob' }],
      content: 'test',
      failClosed: true
    });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.failedCount).toBe(1);
    expect(testMocks.insertMock).not.toHaveBeenCalled();
  });

  it('checks both subject and content during moderation', async () => {
    testMocks.insertMock.mockResolvedValue({ error: null, data: [{ id: 'm1' }] });

    const result = await sendModeratedMessages({
      senderId: 'u1',
      senderName: 'alice',
      recipients: [{ id: 'u2', username: 'bob' }],
      subject: '出售毒品',
      content: '正文看起来正常',
      failClosed: true,
      pushplus: false
    });

    expect(result.ok).toBe(true);
    expect(testMocks.runKeywordPrecheckMock).toHaveBeenCalledWith(
      expect.stringContaining('主题：出售毒品'),
      { scene: 'mail' }
    );
    expect(testMocks.runAsyncRelaxedModerationMock).toHaveBeenCalledWith(
      expect.stringContaining('主题：出售毒品'),
      { scene: 'mail' }
    );
  });

  it('falls back to legacy insert when moderation columns are missing', async () => {
    testMocks.insertMock
      .mockResolvedValueOnce({
        error: { message: 'column "moderation_status" does not exist', code: '42703' }
      })
      .mockResolvedValueOnce({ error: null });

    const result = await sendModeratedMessages({
      senderId: 'u1',
      senderName: 'alice',
      recipients: [{ id: 'u2', username: 'bob' }],
      subject: 'hello',
      content: 'normal content',
      failClosed: true,
      pushplus: true
    });

    expect(result.ok).toBe(true);
    expect(result.sentCount).toBe(1);
    expect(testMocks.insertMock).toHaveBeenCalledTimes(2);

    const firstPayload = testMocks.insertMock.mock.calls[0][0];
    const secondPayload = testMocks.insertMock.mock.calls[1][0];
    expect(firstPayload.moderation_status).toBe('approved');
    expect(Object.prototype.hasOwnProperty.call(secondPayload, 'moderation_status')).toBe(false);
    expect(testMocks.sendPushplusForMessageMock).toHaveBeenCalledTimes(1);
  });

  it('allows sending with rejected status when failClosed is false', async () => {
    testMocks.runKeywordPrecheckMock.mockReturnValue({
      status: 'rejected',
      message: '内容审查未通过'
    });
    testMocks.insertMock.mockResolvedValue({ error: null });

    const result = await sendModeratedMessages({
      senderId: 'u1',
      senderName: 'alice',
      recipients: [{ id: 'u2', username: 'bob' }],
      content: 'test',
      failClosed: false,
      pushplus: true
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(testMocks.insertMock).toHaveBeenCalledTimes(1);
    expect(testMocks.insertMock.mock.calls[0][0].moderation_status).toBe('rejected');
    expect(testMocks.sendPushplusForMessageMock).not.toHaveBeenCalled();
  });

  it('sends first and reviews approved messages asynchronously', async () => {
    testMocks.insertMock.mockResolvedValue({ error: null, data: [{ id: 'm1' }] });

    const result = await sendModeratedMessages({
      senderId: 'u1',
      senderName: 'alice',
      recipients: [{ id: 'u2', username: 'bob' }],
      content: 'normal content',
      failClosed: true,
      pushplus: true
    });

    expect(result.ok).toBe(true);
    expect(result.sentCount).toBe(1);
    expect(result.results[0].messageId).toBe('m1');
    expect(testMocks.runAsyncRelaxedModerationMock).toHaveBeenCalledTimes(1);
    expect(testMocks.writeModerationAuditLogMock).toHaveBeenCalledTimes(1);
  });
});

describe('messages-api.getUserMessages', () => {
  beforeEach(() => {
    testMocks.fromMock.mockReset();
    clearRequestCache();
  });

  it('falls back to legacy list query when moderation_status is missing', async () => {
    const queryCalls = [];
    const moderationQuery = createThenableQuery({
      data: null,
      error: { message: 'column "moderation_status" does not exist', code: '42703' }
    }, queryCalls);
    const legacyQuery = createThenableQuery({
      data: [{ id: 'm1', created_at: '2026-05-13T00:00:00Z' }],
      error: null
    }, queryCalls);

    testMocks.fromMock
      .mockReturnValueOnce(moderationQuery)
      .mockReturnValueOnce(legacyQuery);

    const result = await getUserMessages('u1', { limit: 10 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(testMocks.fromMock).toHaveBeenCalledTimes(2);
    expect(queryCalls.map((call) => call.value)).toEqual([
      'sender_id.eq.u1,and(receiver_id.eq.u1,moderation_status.eq.approved)',
      'sender_id.eq.u1,receiver_id.eq.u1'
    ]);
  });
});

describe('messages-api.markMessagesAsRead', () => {
  beforeEach(() => {
    testMocks.fromMock.mockReset();
    clearRequestCache();
  });

  it('updates unique message ids in one batch', async () => {
    const calls = [];
    const query = {
      update: vi.fn((value) => {
        calls.push({ method: 'update', value });
        return query;
      }),
      in: vi.fn((column, values) => {
        calls.push({ method: 'in', column, values });
        return Promise.resolve({ error: null });
      })
    };
    testMocks.fromMock.mockReturnValue(query);

    const result = await markMessagesAsRead(['m1', 'm2', 'm1', '', null]);

    expect(result.ok).toBe(true);
    expect(testMocks.fromMock).toHaveBeenCalledWith('messages');
    expect(calls).toEqual([
      { method: 'update', value: { status: 'read' } },
      { method: 'in', column: 'id', values: ['m1', 'm2'] }
    ]);
  });

  it('rejects an empty batch', async () => {
    const result = await markMessagesAsRead([]);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('MISSING_MESSAGE_ID');
    expect(testMocks.fromMock).not.toHaveBeenCalled();
  });
});
