import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  rpcMock: vi.fn()
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: testMocks.fromMock,
    rpc: testMocks.rpcMock
  }
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}));

import { writeModerationAuditLog } from '../../src/utils/unified-content-moderation.js';

describe('unified-content-moderation.writeModerationAuditLog', () => {
  beforeEach(() => {
    testMocks.fromMock.mockReset();
    testMocks.insertMock.mockReset();
    testMocks.rpcMock.mockReset();
    testMocks.fromMock.mockReturnValue({
      insert: testMocks.insertMock
    });
    testMocks.insertMock.mockResolvedValue({ error: null });
  });

  it('skips synthetic fail-open moderation results', async () => {
    const result = await writeModerationAuditLog({
      targetId: '00000000-0000-0000-0000-000000000001',
      targetType: 'message',
      result: {
        status: 'approved',
        message: '通过',
        source: 'fallback_error'
      }
    });

    expect(result.skipped).toBe(true);
    expect(testMocks.fromMock).not.toHaveBeenCalled();
  });

  it('writes real ai moderation decisions', async () => {
    const result = await writeModerationAuditLog({
      targetId: '00000000-0000-0000-0000-000000000002',
      targetType: 'post',
      result: {
        status: 'rejected',
        reason: '高风险',
        source: 'ai'
      }
    });

    expect(result.ok).toBe(true);
    expect(testMocks.fromMock).toHaveBeenCalledWith('moderation_logs');
    expect(testMocks.insertMock).toHaveBeenCalledWith([expect.objectContaining({
      target_type: 'post',
      ai_result: 'rejected',
      ai_reason: '高风险'
    })]);
  });
});
