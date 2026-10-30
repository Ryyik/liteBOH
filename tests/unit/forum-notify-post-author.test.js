import { beforeEach, describe, expect, it, vi } from 'vitest';

/* 三个「给帖子作者发 Pushplus 推送」的函数（comment / like / repost）此前是
   三份 37 行的复制粘贴，差异只有 4 处：`type`、两处日志文案、comment 多一个 `comment_id`。
   合并前先把这 4 处差异**逐条锁死** —— 没有这组用例，合并后「点赞通知写成评论文案」
   这类错没有任何东西能抓到（全仓测试此前对这个模块只有 1 处引用，且是 mock 条目）。
   ⚠️ 这组用例必须对**旧实现**（三份副本）全绿，合并后仍全绿 —— 这才是等价性证据。 */

const fm = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendPushplus: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: { from: fm.fromMock },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: fm.warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/utils/api/notifications-api.js', () => ({
  createNotification: vi.fn(),
  sendPushplusForNotification: fm.sendPushplus,
}));

vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  writeModerationAuditLog: vi.fn(),
}));

import {
  notifyPostAuthorForComment,
  notifyPostAuthorForLike,
  notifyPostAuthorForRepost,
} from '../../src/utils/api/forum/_shared.js';

/** 帖子作者查询链：from('posts').select('author_id').eq('id', x).single() */
function mockPostLookup({ authorId = 'author-1', error = null } = {}) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    single: vi.fn(() =>
      Promise.resolve({ data: authorId ? { author_id: authorId } : null, error }),
    ),
  };
  fm.fromMock.mockReturnValue(q);
  return q;
}

const KINDS = [
  {
    type: 'comment',
    label: '评论',
    fn: notifyPostAuthorForComment,
    args: { postId: 'post-1', senderId: 'sender-1', commentId: 'comment-1' },
    extraPushFields: { comment_id: 'comment-1' },
  },
  {
    type: 'like',
    label: '点赞',
    fn: notifyPostAuthorForLike,
    args: { postId: 'post-1', senderId: 'sender-1' },
    extraPushFields: {},
  },
  {
    type: 'repost',
    label: '转发',
    fn: notifyPostAuthorForRepost,
    args: { postId: 'post-1', senderId: 'sender-1' },
    extraPushFields: {},
  },
];

describe('给帖子作者发推送（三个入口的等价性基线）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const kind of KINDS) {
    describe(kind.label, () => {
      it('查到作者且作者 ≠ 发送者时，按本类型的 type 与字段推送', async () => {
        mockPostLookup({ authorId: 'author-1' });
        fm.sendPushplus.mockResolvedValue({ success: true });

        await kind.fn(kind.args);

        expect(fm.sendPushplus).toHaveBeenCalledTimes(1);
        expect(fm.sendPushplus).toHaveBeenCalledWith({
          recipient_id: 'author-1',
          sender_id: 'sender-1',
          type: kind.type,
          post_id: 'post-1',
          ...kind.extraPushFields,
        });
        expect(fm.warn).not.toHaveBeenCalled();
      });

      it('作者就是发送者时完全不推送', async () => {
        mockPostLookup({ authorId: 'sender-1' });

        await kind.fn(kind.args);

        expect(fm.sendPushplus).not.toHaveBeenCalled();
        expect(fm.warn).not.toHaveBeenCalled();
      });

      it('查帖子失败时静默返回，不推送也不告警', async () => {
        mockPostLookup({ authorId: null, error: { message: 'Not found' } });

        await kind.fn(kind.args);

        expect(fm.sendPushplus).not.toHaveBeenCalled();
        expect(fm.warn).not.toHaveBeenCalled();
      });

      it('推送未成功时按本类型的文案告警', async () => {
        mockPostLookup({ authorId: 'author-1' });
        fm.sendPushplus.mockResolvedValue({ success: false, message: '接收者未启用 Pushplus' });

        await kind.fn(kind.args);

        expect(fm.warn).toHaveBeenCalledTimes(1);
        const [scope, message, payload] = fm.warn.mock.calls[0];
        expect(scope).toBe('forum-api');
        expect(message).toBe(`${kind.label} Pushplus 推送未发送`);
        expect(payload).toEqual(
          expect.objectContaining({
            reason: '接收者未启用 Pushplus',
            postId: 'post-1',
            recipientId: 'author-1',
          }),
        );
        // comment 的日志带 commentId，like/repost 不带 —— 合并时别顺手统一掉
        if (kind.extraPushFields.comment_id) {
          expect(payload.commentId).toBe('comment-1');
        } else {
          expect(payload).not.toHaveProperty('commentId');
        }
      });

      it('推送抛错时按本类型的「失败(静默)」文案告警', async () => {
        mockPostLookup({ authorId: 'author-1' });
        const boom = new Error('push service down');
        fm.sendPushplus.mockRejectedValue(boom);

        await kind.fn(kind.args);

        expect(fm.warn).toHaveBeenCalledWith(
          'forum-api',
          `${kind.label} Pushplus 推送失败(静默)`,
          boom,
        );
      });

      it('缺 postId 或 senderId 时直接返回，连帖子都不查', async () => {
        await kind.fn({ ...kind.args, postId: '' });
        await kind.fn({ ...kind.args, senderId: '   ' });

        expect(fm.fromMock).not.toHaveBeenCalled();
        expect(fm.sendPushplus).not.toHaveBeenCalled();
      });

      it('入参为 undefined 时不抛错', async () => {
        await expect(kind.fn()).resolves.toBeUndefined();
        expect(fm.fromMock).not.toHaveBeenCalled();
      });
    });
  }

  it('comment 缺 commentId 时也直接返回（与 like/repost 的唯一必填差异）', async () => {
    await notifyPostAuthorForComment({ postId: 'post-1', senderId: 'sender-1' });

    expect(fm.fromMock).not.toHaveBeenCalled();
    expect(fm.sendPushplus).not.toHaveBeenCalled();
  });
});
