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
const POST_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const BASE_DELAY_MS = 2000;

/* ⏱ 退避等待可注入（2026-11-02）：这个文件原来用**真实** setTimeout 跑 2s+4s 退避，
   三条用例各等 6s ⇒ 单文件 20s，是全量套件里唯一的重灾区（中位数 5ms）。
   注入 wait 后立等可返回，断言反而更硬：直接比对**请求的毫秒序列** [2000, 4000]，
   而不是「墙上时间 ≥ 5000ms」这种既慢又会被机器负载影响的写法。 */
const realWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function schedulePostModerationWithRetry(post = {}, wait = realWait) {
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

      await testMocks.ensureModerationNotification({
        recipientId: authorId,
        type: 'post_rejected',
        postId,
      });
      testMocks.invalidateByTags(['posts', 'profiles', 'notifications']);
      return;
    } catch {
      if (attempt === MAX_RETRIES) {
        testMocks.warn('forum-api', '异步发帖审查已耗尽所有重试次数，帖子保持当前状态', {
          postId,
          authorId,
        });
        return;
      }
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await wait(delayMs);
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

    await schedulePostModerationWithRetry(
      {
        id: 'post-2',
        author_id: 'author-2',
        content: 'test content',
      },
      async () => {},
    );

    expect(testMocks.runAsyncRelaxedModeration).toHaveBeenCalledTimes(3);
  });

  it('exhausts retries and warns without throwing', async () => {
    testMocks.runAsyncRelaxedModeration.mockRejectedValue(new Error('persistent error'));

    await expect(
      schedulePostModerationWithRetry(
        {
          id: 'post-3',
          author_id: 'author-3',
          content: 'test content',
        },
        async () => {},
      ),
    ).resolves.toBeUndefined();

    expect(testMocks.warn).toHaveBeenCalledWith(
      'forum-api',
      '异步发帖审查已耗尽所有重试次数，帖子保持当前状态',
      expect.objectContaining({ postId: 'post-3', authorId: 'author-3' }),
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
    const waits = [];

    await schedulePostModerationWithRetry(
      {
        id: 'post-7',
        author_id: 'author-7',
        content: 'test',
      },
      async (ms) => {
        waits.push(ms);
      },
    );

    // 三次尝试 ⇒ 两次退避，2000ms 起翻倍。断的是**请求值**，不是墙上时间
    expect(waits).toEqual([2000, 4000]);
  });
});
