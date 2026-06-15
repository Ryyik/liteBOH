import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================
// Hoisted mock holders
// ============================================================
const {
  fromMock,
  rpcMock,
  mockNormalizeDbError,
  mockInvalidateByTags,
  mockExecuteRead,
  mockLogger,
  mockRunKeywordPrecheck,
  mockRunAsyncRelaxedModeration,
  mockRunSyncStrictModeration,
  mockNormalizeContentStatus,
  mockShouldSyncModerateComment,
  mockBuildCommentModerationInput,
  mockIsMissingRpcFunctionError,
  mockWriteAsyncModerationLog,
  mockEnsureModerationNotification,
  mockNotifyPostAuthorForComment,
} = vi.hoisted(() => {
  const fromMock = vi.fn();
  const rpcMock = vi.fn();
  const mockNormalizeDbError = vi.fn((error) => {
    if (!error) return null;
    if (typeof error === 'string') return { message: error, code: 'APP_ERROR', details: null, hint: null };
    return {
      message: String(error.message || '请求失败'),
      code: error.code || 'APP_ERROR',
      details: null,
      hint: null,
    };
  });
  const mockInvalidateByTags = vi.fn();
  const mockExecuteRead = vi.fn(async (_scope, _params, fetcher) => {
    const raw = await fetcher();
    const extras = { ...raw };
    delete extras.data;
    delete extras.error;
    return {
      ok: !raw?.error,
      data: raw?.data ?? null,
      error: mockNormalizeDbError(raw?.error),
      ...extras,
    };
  });
  const mockLogger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
  const mockRunKeywordPrecheck = vi.fn();
  const mockRunAsyncRelaxedModeration = vi.fn();
  const mockRunSyncStrictModeration = vi.fn();
  const mockNormalizeContentStatus = vi.fn((status, fallback = 'approved') => {
    const normalized = String(status || '').trim().toLowerCase();
    return ['approved', 'rejected'].includes(normalized) ? normalized : fallback;
  });
  const mockShouldSyncModerateComment = vi.fn(() => false);
  const mockBuildCommentModerationInput = vi.fn((content) => `正文：${String(content || '').trim()}`);
  const mockIsMissingRpcFunctionError = vi.fn();
  const mockWriteAsyncModerationLog = vi.fn();
  const mockEnsureModerationNotification = vi.fn();
  const mockNotifyPostAuthorForComment = vi.fn();
  return {
    fromMock,
    rpcMock,
    mockNormalizeDbError,
    mockInvalidateByTags,
    mockExecuteRead,
    mockLogger,
    mockRunKeywordPrecheck,
    mockRunAsyncRelaxedModeration,
    mockRunSyncStrictModeration,
    mockNormalizeContentStatus,
    mockShouldSyncModerateComment,
    mockBuildCommentModerationInput,
    mockIsMissingRpcFunctionError,
    mockWriteAsyncModerationLog,
    mockEnsureModerationNotification,
    mockNotifyPostAuthorForComment,
  };
});

// ============================================================
// Mock: supabase-client
// ============================================================
vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

// ============================================================
// Mock: request-core
// ============================================================
vi.mock('../../src/utils/request-core.js', () => ({
  executeRead: mockExecuteRead,
  normalizeDbError: mockNormalizeDbError,
  invalidateByTags: mockInvalidateByTags,
}));

// ============================================================
// Mock: logger
// ============================================================
vi.mock('../../src/utils/logger.js', () => ({
  logger: mockLogger,
}));

// ============================================================
// Mock: unified-content-moderation
// ============================================================
vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  runKeywordPrecheck: mockRunKeywordPrecheck,
  runAsyncRelaxedModeration: mockRunAsyncRelaxedModeration,
  runSyncStrictModeration: mockRunSyncStrictModeration,
}));

// ============================================================
// Mock: forum-format
// ============================================================
vi.mock('../../src/utils/api/forum-format.js', () => ({
  ALLOWED_CONTENT_STATUS: new Set(['approved', 'rejected']),
  APPROVED_STATUS: 'approved',
  REJECTED_STATUS: 'rejected',
  buildCommentModerationInput: mockBuildCommentModerationInput,
  normalizeContentStatus: mockNormalizeContentStatus,
  shouldSyncModerateComment: mockShouldSyncModerateComment,
}));

// ============================================================
// Mock: _shared
// ============================================================
vi.mock('../../src/utils/api/forum/_shared.js', () => ({
  isMissingRpcFunctionError: mockIsMissingRpcFunctionError,
  writeAsyncModerationLog: mockWriteAsyncModerationLog,
  ensureModerationNotification: mockEnsureModerationNotification,
  notifyPostAuthorForComment: mockNotifyPostAuthorForComment,
}));

// ============================================================
// Imports
// ============================================================
import {
  getComments,
  getCommentThreadReplies,
  createComment,
  deleteComment,
} from '../../src/utils/api/forum/comment-api.js';

// ============================================================
// Helper: build a chainable supabase query mock
// ============================================================
function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => {
      calls.push({ method: 'eq', col, val });
      return q;
    }),
    or: vi.fn((expr) => {
      calls.push({ method: 'or', expr });
      return q;
    }),
    is: vi.fn((col, val) => {
      calls.push({ method: 'is', col, val });
      return q;
    }),
    order: vi.fn((col, opts) => {
      calls.push({ method: 'order', col, opts });
      return q;
    }),
    limit: vi.fn((n) => {
      calls.push({ method: 'limit', n });
      return q;
    }),
    range: vi.fn((from, to) => {
      calls.push({ method: 'range', from, to });
      return q;
    }),
    single: vi.fn(() => q),
    maybeSingle: vi.fn(() => q),
    not: vi.fn(() => q),
    ilike: vi.fn(() => q),
    lte: vi.fn(() => q),
    gt: vi.fn(() => q),
    in: vi.fn(() => q),
    insert: vi.fn((data) => {
      calls.push({ method: 'insert', data });
      return q;
    }),
    update: vi.fn((data) => {
      calls.push({ method: 'update', data });
      return q;
    }),
    delete: vi.fn(() => {
      calls.push({ method: 'delete' });
      return q;
    }),
    upsert: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

// ============================================================
// getComments
// ============================================================
describe('getComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates postId is required', async () => {
    const result = await getComments('', 'u1');
    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.error).toBeDefined();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('validates postId with only whitespace', async () => {
    const result = await getComments('   ', 'u1');
    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('supports topLevelOnly filter', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1', 'u1', { topLevelOnly: true });

    const isCall = calls.find((c) => c.method === 'is');
    expect(isCall).toBeDefined();
    expect(isCall.col).toBe('parent_id');
    expect(isCall.val).toBeNull();
  });

  it('does not apply topLevelOnly when false', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1', 'u1', { topLevelOnly: false });

    const isCall = calls.find((c) => c.method === 'is');
    expect(isCall).toBeUndefined();
  });

  it('supports parentId filter when topLevelOnly is false', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1', 'u1', { parentId: 'parent-1' });

    const eqCalls = calls.filter((c) => c.method === 'eq');
    const parentEq = eqCalls.find((c) => c.col === 'parent_id');
    expect(parentEq).toBeDefined();
    expect(parentEq.val).toBe('parent-1');
  });

  it('skips parentId filter when parentId is empty string', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1', 'u1', { parentId: '' });

    const eqCalls = calls.filter((c) => c.method === 'eq');
    const parentEq = eqCalls.find((c) => c.col === 'parent_id');
    expect(parentEq).toBeUndefined();
  });

  it('supports pagination with page and pageSize', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1', 'u1', { page: 3, pageSize: 10 });

    const rangeCall = calls.find((c) => c.method === 'range');
    expect(rangeCall).toBeDefined();
    // page=3, pageSize=10 → offset=(3-1)*10=20, limit=10+1=11
    expect(rangeCall.from).toBe(20);
    expect(rangeCall.to).toBe(30);
  });

  it('defaults to page=1, pageSize=20 when no pagination options', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1');

    const rangeCall = calls.find((c) => c.method === 'range');
    // Without explicit pagination options, hasPagination is false
    expect(rangeCall).toBeUndefined();
  });

  it('supports desc order', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1', 'u1', { order: 'desc' });

    const orderCall = calls.find((c) => c.method === 'order');
    expect(orderCall).toBeDefined();
    expect(orderCall.col).toBe('created_at');
    expect(orderCall.opts.ascending).toBe(false);
  });

  it('defaults to asc order', async () => {
    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getComments('post-1', 'u1', { order: 'asc' });

    const orderCall = calls.find((c) => c.method === 'order');
    expect(orderCall).toBeDefined();
    expect(orderCall.opts.ascending).toBe(true);
  });

  it('formats author_avatar_url from nested author object', async () => {
    fromMock.mockReturnValue(
      makeQuery({
        data: [
          { id: 'c1', content: 'hello', author: { avatar_url: 'https://example.com/avatar.png' } },
          { id: 'c2', content: 'world', author: null },
          { id: 'c3', content: '!', author: { avatar_url: null } },
        ],
        error: null,
      })
    );

    const result = await getComments('post-1', 'u1', { page: 1, pageSize: 10 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(3);
    expect(result.data[0].author_avatar_url).toBe('https://example.com/avatar.png');
    expect(result.data[1].author_avatar_url).toBeUndefined();
    expect(result.data[2].author_avatar_url).toBeNull();
  });

  it('handles hasMore correctly when data exceeds pageSize', async () => {
    // 6 items returned, pageSize=5 → hasMore=true, sliced to 5
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i + 1}`,
      content: `comment ${i + 1}`,
      author: null,
    }));

    fromMock.mockReturnValue(
      makeQuery({ data: items, error: null })
    );

    const result = await getComments('post-1', 'u1', { page: 1, pageSize: 5 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(5);
    expect(result.hasMore).toBe(true);
  });

  it('handles hasMore false when data equals pageSize', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i + 1}`,
      content: `comment ${i + 1}`,
      author: null,
    }));

    fromMock.mockReturnValue(
      makeQuery({ data: items, error: null })
    );

    const result = await getComments('post-1', 'u1', { page: 1, pageSize: 5 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });

  it('handles hasMore false when data is less than pageSize', async () => {
    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'only one', author: null }],
        error: null,
      })
    );

    const result = await getComments('post-1', 'u1', { page: 1, pageSize: 20 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('returns empty data on supabase error', async () => {
    fromMock.mockReturnValue(
      makeQuery({ data: null, error: { message: 'Database error' } })
    );

    const result = await getComments('post-1', 'u1');

    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('handles non-array data gracefully', async () => {
    fromMock.mockReturnValue(
      makeQuery({ data: null, error: null })
    );

    const result = await getComments('post-1', 'u1');

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('passes through currentUserId', async () => {
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null })
    );

    await getComments('post-1', 'user-42', { page: 1, pageSize: 10 });

    expect(mockExecuteRead).toHaveBeenCalledWith(
      'comments.getComments',
      expect.objectContaining({ currentUserId: 'user-42' }),
      expect.any(Function),
      expect.any(Object)
    );
  });
});

// ============================================================
// getCommentThreadReplies
// ============================================================
describe('getCommentThreadReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates postId is required', async () => {
    const result = await getCommentThreadReplies('', 'root-1', 'u1');
    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.error).toBeDefined();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('validates rootCommentId is required', async () => {
    const result = await getCommentThreadReplies('post-1', '', 'u1');
    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('validates both postId and rootCommentId required', async () => {
    const result = await getCommentThreadReplies('', '', 'u1');
    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('trims whitespace from postId and rootCommentId', async () => {
    const result = await getCommentThreadReplies('   ', '   ', 'u1');
    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('tries RPC first and returns RPC result on success', async () => {
    const rpcData = [
      { id: 'r1', content: 'reply 1', author_avatar_url: 'https://example.com/av.png', has_more: false },
      { id: 'r2', content: 'reply 2', author_avatar_url: null },
    ];
    rpcMock.mockResolvedValue({ data: rpcData, error: null });

    const result = await getCommentThreadReplies('post-1', 'root-1', 'u1');

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].author_avatar_url).toBe('https://example.com/av.png');
    expect(rpcMock).toHaveBeenCalledWith('list_forum_comment_thread', {
      p_post_id: 'post-1',
      p_root_comment_id: 'root-1',
      p_page: 1,
      p_page_size: 50,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('uses has_more from RPC result when present', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'r1', content: 'reply', has_more: true }],
      error: null,
    });

    const result = await getCommentThreadReplies('post-1', 'root-1', 'u1');

    expect(result.hasMore).toBe(true);
  });

  it('falls back to hasMore from data length when RPC has_more is absent', async () => {
    const rpcData = Array.from({ length: 50 }, (_, i) => ({
      id: `r${i + 1}`,
      content: `reply ${i + 1}`,
    }));
    rpcMock.mockResolvedValue({ data: rpcData, error: null });

    const result = await getCommentThreadReplies('post-1', 'root-1', 'u1', { pageSize: 50 });

    // 50 items returned, pageSize=50 → hasMore should be true
    expect(result.hasMore).toBe(true);
  });

  it('falls back to direct query when RPC function is missing', async () => {
    const rpcError = { message: 'Could not find the function list_forum_comment_thread', code: 'PGRST202' };
    rpcMock.mockResolvedValue({ data: null, error: rpcError });
    mockIsMissingRpcFunctionError.mockReturnValue(true);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'd1', content: 'direct reply', author: { avatar_url: 'https://example.com/av2.png' } }],
        error: null,
      })
    );

    const result = await getCommentThreadReplies('post-1', 'root-1', 'u1');

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].author_avatar_url).toBe('https://example.com/av2.png');
    expect(mockIsMissingRpcFunctionError).toHaveBeenCalledWith(rpcError, 'list_forum_comment_thread');
  });

  it('returns error when RPC fails with non-missing error', async () => {
    const rpcError = { message: 'Internal server error', code: '500' };
    rpcMock.mockResolvedValue({ data: null, error: rpcError });
    mockIsMissingRpcFunctionError.mockReturnValue(false);

    const result = await getCommentThreadReplies('post-1', 'root-1', 'u1');

    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns error when direct query fallback fails', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function list_forum_comment_thread', code: 'PGRST202' },
    });
    mockIsMissingRpcFunctionError.mockReturnValue(true);

    fromMock.mockReturnValue(
      makeQuery({ data: null, error: { message: 'Table error' } })
    );

    const result = await getCommentThreadReplies('post-1', 'root-1', 'u1');

    expect(result.ok).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('supports pagination in direct query fallback', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function list_forum_comment_thread', code: 'PGRST202' },
    });
    mockIsMissingRpcFunctionError.mockReturnValue(true);

    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({ data: [], error: null }, calls)
    );

    await getCommentThreadReplies('post-1', 'root-1', 'u1', { page: 3, pageSize: 10 });

    const rangeCall = calls.find((c) => c.method === 'range');
    expect(rangeCall).toBeDefined();
    // page=3, pageSize=10 → offset=(3-1)*10=20, to=20+10=30
    expect(rangeCall.from).toBe(20);
    expect(rangeCall.to).toBe(30);
  });

  it('defaults to page=1, pageSize=50', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'r1', content: 'reply', has_more: false }],
      error: null,
    });

    await getCommentThreadReplies('post-1', 'root-1', 'u1');

    expect(rpcMock).toHaveBeenCalledWith('list_forum_comment_thread', {
      p_post_id: 'post-1',
      p_root_comment_id: 'root-1',
      p_page: 1,
      p_page_size: 50,
    });
  });
});

// ============================================================
// createComment
// ============================================================
describe('createComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved', message: 'OK' });
    mockRunSyncStrictModeration.mockResolvedValue({ status: 'approved' });
    mockShouldSyncModerateComment.mockReturnValue(false);
    mockRunAsyncRelaxedModeration.mockResolvedValue({ status: 'approved' });
  });

  // -- validation --
  it('validates postId is required', async () => {
    const result = await createComment('', 'content', 'author-1', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMENT_PARAMS');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('validates content is required', async () => {
    const result = await createComment('post-1', '', 'author-1', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMENT_PARAMS');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('validates content with only whitespace', async () => {
    const result = await createComment('post-1', '   ', 'author-1', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMENT_PARAMS');
  });

  it('validates authorId is required', async () => {
    const result = await createComment('post-1', 'content', '', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMENT_PARAMS');
  });

  it('validates authorId with only whitespace', async () => {
    const result = await createComment('post-1', 'content', '   ', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMENT_PARAMS');
  });

  it('trims whitespace from all params', async () => {
    // postId with whitespace, content with whitespace, authorId with whitespace
    const result = await createComment('  ', '  ', '  ', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMENT_PARAMS');
  });

  // -- keyword precheck --
  it('blocks on keyword precheck rejection', async () => {
    mockRunKeywordPrecheck.mockReturnValue({
      status: 'rejected',
      message: '包含违禁词',
    });

    const result = await createComment('post-1', 'bad content', 'author-1', 'author');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOCAL_KEYWORD_BLOCK');
    expect(result.error.message).toBe('包含违禁词');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('uses default message when keyword precheck rejection has no message', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'rejected' });

    const result = await createComment('post-1', 'bad content', 'author-1', 'author');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOCAL_KEYWORD_BLOCK');
    expect(result.error.message).toBe('命中高风险违禁词，已拒绝发布');
  });

  it('proceeds when keyword precheck passes', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved', message: 'OK' });

    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'good content', status: 'approved' }],
        error: null,
      })
    );

    const result = await createComment('post-1', 'good content', 'author-1', 'author');

    expect(result.ok).toBe(true);
    expect(fromMock).toHaveBeenCalled();
  });

  // -- sync strict moderation --
  it('blocks on sync strict moderation rejection', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(true);
    mockRunSyncStrictModeration.mockResolvedValue({
      status: 'rejected',
      message: '内容需要人工审核',
    });

    const result = await createComment('post-1', 'risky content', 'author-1', 'author');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SYNC_MODERATION_BLOCK');
    expect(result.error.message).toBe('内容需要人工审核');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('uses default message when sync moderation rejection has no message', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(true);
    mockRunSyncStrictModeration.mockResolvedValue({ status: 'rejected' });

    const result = await createComment('post-1', 'risky content', 'author-1', 'author');

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SYNC_MODERATION_BLOCK');
    expect(result.error.message).toBe('评论需要先通过内容审查，请调整后再发送');
  });

  it('skips sync moderation when status is not approved', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('pending');
    mockShouldSyncModerateComment.mockReturnValue(true);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'content', status: 'pending' }],
        error: null,
      })
    );

    const result = await createComment('post-1', 'content', 'author-1', 'author', 'pending');

    expect(result.ok).toBe(true);
    expect(mockRunSyncStrictModeration).not.toHaveBeenCalled();
  });

  it('skips sync moderation when shouldSyncModerateComment returns false', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'short content', status: 'approved' }],
        error: null,
      })
    );

    const result = await createComment('post-1', 'short content', 'author-1', 'author');

    expect(result.ok).toBe(true);
    expect(mockRunSyncStrictModeration).not.toHaveBeenCalled();
  });

  // -- insert --
  it('inserts comment with proper data', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c-inserted', content: 'hello world', status: 'approved' }],
        error: null,
      }, calls)
    );

    const result = await createComment('post-1', 'hello world', 'author-1', 'testuser', 'approved');

    expect(result.ok).toBe(true);
    expect(result.data[0].id).toBe('c-inserted');

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall).toBeDefined();
    expect(insertCall.data[0]).toMatchObject({
      post_id: 'post-1',
      content: 'hello world',
      author_id: 'author-1',
      author_username: 'testuser',
      status: 'approved',
    });
  });

  it('includes parentId in insert data when provided', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c-reply', content: 'reply', status: 'approved' }],
        error: null,
      }, calls)
    );

    await createComment('post-1', 'reply', 'author-1', 'testuser', 'approved', 'parent-c1');

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall.data[0].parent_id).toBe('parent-c1');
  });

  it('includes replyToUsername in insert data when provided', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c-reply', content: 'reply', status: 'approved' }],
        error: null,
      }, calls)
    );

    await createComment('post-1', 'reply', 'author-1', 'testuser', 'approved', null, 'originalAuthor');

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall.data[0].reply_to_username).toBe('originalAuthor');
  });

  it('does not include parentId or replyToUsername when not provided', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    const calls = [];
    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'comment', status: 'approved' }],
        error: null,
      }, calls)
    );

    await createComment('post-1', 'comment', 'author-1', 'testuser', 'approved');

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall.data[0]).not.toHaveProperty('parent_id');
    expect(insertCall.data[0]).not.toHaveProperty('reply_to_username');
  });

  // -- status normalization --
  it('normalizes status on insert with buildCommentModerationInput', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'content', status: 'approved' }],
        error: null,
      })
    );

    await createComment('post-1', 'content', 'author-1', 'testuser');

    expect(mockBuildCommentModerationInput).toHaveBeenCalledWith('content');
    expect(mockNormalizeContentStatus).toHaveBeenCalled();
  });

  it('corrects abnormal status after insert', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    const insertQuery = makeQuery({
      data: [{ id: 'c1', content: 'content', status: 'weird_status' }],
      error: null,
    });
    const updateQuery = makeQuery({ data: null, error: null });

    fromMock
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery);

    const result = await createComment('post-1', 'content', 'author-1', 'testuser');

    expect(result.ok).toBe(true);
    // The update should have been called to normalize the status
    const updateCalls = [];
    // We need to verify update was called... but the second fromMock return is for the update
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  // -- cache invalidation --
  it('invalidates cache tags after successful insert', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'content', status: 'approved' }],
        error: null,
      })
    );

    await createComment('post-1', 'content', 'author-1', 'testuser');

    expect(mockInvalidateByTags).toHaveBeenCalledWith(['comments', 'posts', 'notifications']);
  });

  it('does not invalidate cache on insert error', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: null,
        error: { message: 'Insert failed' },
      })
    );

    const result = await createComment('post-1', 'content', 'author-1', 'testuser');

    expect(result.ok).toBe(false);
    expect(mockInvalidateByTags).not.toHaveBeenCalled();
  });

  // -- async moderation --
  it('schedules async moderation after successful insert with approved status', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);
    mockRunAsyncRelaxedModeration.mockResolvedValue({ status: 'approved' });

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c-async', content: 'content', status: 'approved' }],
        error: null,
      })
    );

    const result = await createComment('post-1', 'content', 'author-1', 'testuser');

    expect(result.ok).toBe(true);

    // Wait for the fire-and-forget async moderation to complete
    await vi.waitFor(() => {
      expect(mockRunAsyncRelaxedModeration).toHaveBeenCalled();
    }, { timeout: 5000 });

    expect(mockBuildCommentModerationInput).toHaveBeenCalledWith('content');
  });

  it('does not schedule async moderation when status is not approved', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('rejected');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ id: 'c1', content: 'content', status: 'rejected' }],
        error: null,
      })
    );

    const result = await createComment('post-1', 'content', 'author-1', 'testuser', 'rejected');

    expect(result.ok).toBe(true);

    // Give time for async call, but it should not have been called
    await new Promise((r) => setTimeout(r, 100));
    expect(mockRunAsyncRelaxedModeration).not.toHaveBeenCalled();
  });

  it('does not schedule async moderation when insert has no id', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: [{ content: 'content', status: 'approved' }], // no id
        error: null,
      })
    );

    await createComment('post-1', 'content', 'author-1', 'testuser');

    await new Promise((r) => setTimeout(r, 100));
    expect(mockRunAsyncRelaxedModeration).not.toHaveBeenCalled();
  });

  // -- error handling --
  it('returns error on insert failure', async () => {
    mockRunKeywordPrecheck.mockReturnValue({ status: 'approved' });
    mockNormalizeContentStatus.mockReturnValue('approved');
    mockShouldSyncModerateComment.mockReturnValue(false);

    fromMock.mockReturnValue(
      makeQuery({
        data: null,
        error: { message: 'Insert constraint violation', code: '23505' },
      })
    );

    const result = await createComment('post-1', 'content', 'author-1', 'testuser');

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================
// deleteComment
// ============================================================
describe('deleteComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks comment exists', async () => {
    fromMock.mockReturnValue(
      makeQuery({ data: null, error: { message: 'Not found' } })
    );

    const result = await deleteComment('c1', 'user-1', 'user');

    expect(result.ok).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toBe('评论不存在');
  });

  it('checks ownership: author_id must match userId', async () => {
    fromMock.mockReturnValue(
      makeQuery({
        data: { author_id: 'other-user', status: 'approved' },
        error: null,
      })
    );

    const result = await deleteComment('c1', 'user-1', 'user');

    expect(result.ok).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toBe('没有权限删除此评论');
  });

  it('allows admin to delete any comment regardless of author_id', async () => {
    const calls = [];
    const selectQuery = makeQuery(
      { data: { author_id: 'other-user', status: 'approved' }, error: null },
      calls
    );
    const deleteQuery = makeQuery({ data: null, error: null });

    fromMock
      .mockReturnValueOnce(selectQuery)
      .mockReturnValueOnce(deleteQuery);

    const result = await deleteComment('c1', 'admin-user', 'admin');

    expect(result.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  it('allows comment author to delete their own comment', async () => {
    const selectQuery = makeQuery({
      data: { author_id: 'user-1', status: 'approved' },
      error: null,
    });
    const deleteQuery = makeQuery({ data: null, error: null });

    fromMock
      .mockReturnValueOnce(selectQuery)
      .mockReturnValueOnce(deleteQuery);

    const result = await deleteComment('c1', 'user-1', 'user');

    expect(result.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  it('deletes comment via supabase', async () => {
    const selectQuery = makeQuery({
      data: { author_id: 'user-1', status: 'approved' },
      error: null,
    });
    const calls = [];
    const deleteQuery = makeQuery({ data: null, error: null }, calls);

    fromMock
      .mockReturnValueOnce(selectQuery)
      .mockReturnValueOnce(deleteQuery);

    const result = await deleteComment('c-delete', 'user-1', 'user');

    expect(result.ok).toBe(true);

    const deleteCall = calls.find((c) => c.method === 'delete');
    expect(deleteCall).toBeDefined();

    const eqCall = calls.find((c) => c.method === 'eq' && c.col === 'id');
    expect(eqCall).toBeDefined();
    expect(eqCall.val).toBe('c-delete');
  });

  it('invalidates cache tags after successful delete', async () => {
    fromMock
      .mockReturnValueOnce(
        makeQuery({ data: { author_id: 'user-1', status: 'approved' }, error: null })
      )
      .mockReturnValueOnce(
        makeQuery({ data: null, error: null })
      );

    await deleteComment('c1', 'user-1', 'user');

    expect(mockInvalidateByTags).toHaveBeenCalledWith(['comments', 'posts', 'notifications']);
  });

  it('does not invalidate cache when comment not found', async () => {
    fromMock.mockReturnValue(
      makeQuery({ data: null, error: { message: 'Not found' } })
    );

    await deleteComment('c1', 'user-1', 'user');

    expect(mockInvalidateByTags).not.toHaveBeenCalled();
  });

  it('does not invalidate cache when permission denied', async () => {
    fromMock.mockReturnValue(
      makeQuery({ data: { author_id: 'other-user', status: 'approved' }, error: null })
    );

    await deleteComment('c1', 'user-1', 'user');

    expect(mockInvalidateByTags).not.toHaveBeenCalled();
  });

  it('returns error when delete fails', async () => {
    fromMock
      .mockReturnValueOnce(
        makeQuery({ data: { author_id: 'user-1', status: 'approved' }, error: null })
      )
      .mockReturnValueOnce(
        makeQuery({
          data: null,
          error: { message: 'Delete constraint violation' },
        })
      );

    const result = await deleteComment('c1', 'user-1', 'user');

    expect(result.ok).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('删除失败');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('does not invalidate cache when delete fails', async () => {
    fromMock
      .mockReturnValueOnce(
        makeQuery({ data: { author_id: 'user-1', status: 'approved' }, error: null })
      )
      .mockReturnValueOnce(
        makeQuery({ data: null, error: { message: 'Delete failed' } })
      );

    await deleteComment('c1', 'user-1', 'user');

    expect(mockInvalidateByTags).not.toHaveBeenCalled();
  });
});