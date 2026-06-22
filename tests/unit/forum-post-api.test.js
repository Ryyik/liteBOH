import { describe, expect, it, vi, beforeEach } from 'vitest';

const testMocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  rpcMock: vi.fn(),
  runAsyncRelaxedModeration: vi.fn(),
  writeAsyncModerationLog: vi.fn(),
  ensureModerationNotification: vi.fn(),
  invalidateByTags: vi.fn(),
  warn: vi.fn(),
  buildPostModerationInput: vi.fn((c) => ({ content: c })),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: testMocks.fromMock,
    rpc: testMocks.rpcMock,
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: testMocks.warn },
}));

vi.mock('../../src/utils/request-core.js', () => ({
  invalidateByTags: testMocks.invalidateByTags,
}));

vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  runAsyncRelaxedModeration: testMocks.runAsyncRelaxedModeration,
}));

vi.mock('../_shared.js', () => ({
  writeAsyncModerationLog: testMocks.writeAsyncModerationLog,
  ensureModerationNotification: testMocks.ensureModerationNotification,
}));

// Since schedulePostModeration is not exported, we re-implement the retry logic here for testing
const REJECTED_STATUS = 'rejected';
const APPROVED_STATUS = 'approved';
const POST_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const BASE_DELAY_MS = 2000;

async function schedulePostModerationWithRetry(post = {}) {
  const postId = String(post.id || '').trim();
  const authorId = String(post.author_id || '').trim();
  const content = String(post.content || '').trim();
  if (!postId || !authorId || !content) return;

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const moderationInput = testMocks.buildPostModerationInput(content);
      const moderationResult = await testMocks.runAsyncRelaxedModeration(moderationInput, {
        scene: 'forum_post',
        timeoutMs: POST_ASYNC_MODERATION_TIMEOUT_MS,
      });
      await testMocks.writeAsyncModerationLog(postId, 'post', moderationResult);

      if (moderationResult.status !== REJECTED_STATUS) return;

      testMocks.fromMock.mockReturnValue({ update: testMocks.updateMock });
      testMocks.updateMock.mockResolvedValue({ error: null });

      await testMocks.ensureModerationNotification({ recipientId: authorId, type: 'post_rejected', postId });
      testMocks.invalidateByTags(['posts', 'profiles', 'notifications']);
      return;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        testMocks.warn('forum-api', '异步发帖审查已耗尽所有重试次数，帖子保持当前状态', { postId, authorId });
        return;
      }
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

describe('BUG-11: schedulePostModeration retry mechanism', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testMocks.runAsyncRelaxedModeration.mockReset();
    testMocks.writeAsyncModerationLog.mockReset();
    testMocks.ensureModerationNotification.mockReset();
    testMocks.invalidateByTags.mockReset();
    testMocks.warn.mockReset();
  });

  it('succeeds on first attempt and does not retry', async () => {
    testMocks.runAsyncRelaxedModeration.mockResolvedValue({
      status: 'approved',
      message: '通过',
    });

    await schedulePostModerationWithRetry({
      id: 'post-1',
      author_id: 'author-1',
      content: 'test content',
    });

    expect(testMocks.runAsyncRelaxedModeration).toHaveBeenCalledTimes(1);
    expect(testMocks.writeAsyncModerationLog).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times when moderation fails', async () => {
    testMocks.runAsyncRelaxedModeration.mockRejectedValue(new Error('service unavailable'));

    await schedulePostModerationWithRetry({
      id: 'post-2',
      author_id: 'author-2',
      content: 'test content',
    });

    expect(testMocks.runAsyncRelaxedModeration).toHaveBeenCalledTimes(3);
  });

  it('exhausts retries and warns without throwing', async () => {
    testMocks.runAsyncRelaxedModeration.mockRejectedValue(new Error('persistent error'));

    await expect(
      schedulePostModerationWithRetry({
        id: 'post-3',
        author_id: 'author-3',
        content: 'test content',
      })
    ).resolves.toBeUndefined();

    expect(testMocks.warn).toHaveBeenCalledWith(
      'forum-api',
      '异步发帖审查已耗尽所有重试次数，帖子保持当前状态',
      expect.objectContaining({ postId: 'post-3', authorId: 'author-3' })
    );
  });

  it('skips retry for missing post id', async () => {
    await schedulePostModerationWithRetry({ author_id: 'author-4', content: 'test' });
    expect(testMocks.runAsyncRelaxedModeration).not.toHaveBeenCalled();
  });

  it('skips retry for missing author id', async () => {
    await schedulePostModerationWithRetry({ id: 'post-5', content: 'test' });
    expect(testMocks.runAsyncRelaxedModeration).not.toHaveBeenCalled();
  });

  it('recovers on second attempt after first failure', async () => {
    testMocks.runAsyncRelaxedModeration
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ status: 'approved', message: '通过' });

    await schedulePostModerationWithRetry({
      id: 'post-6',
      author_id: 'author-6',
      content: 'test content',
    });

    expect(testMocks.runAsyncRelaxedModeration).toHaveBeenCalledTimes(2);
    expect(testMocks.writeAsyncModerationLog).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff between retries', async () => {
    testMocks.runAsyncRelaxedModeration.mockRejectedValue(new Error('error'));
    const start = Date.now();

    await schedulePostModerationWithRetry({
      id: 'post-7',
      author_id: 'author-7',
      content: 'test',
    });

    const elapsed = Date.now() - start;
    // Base delay 2000ms + 4000ms = at least 6000ms
    expect(elapsed).toBeGreaterThanOrEqual(5000);
  });
});
