import { beforeEach, describe, expect, it, vi } from 'vitest';

/* P3-9（2026-10-30）：点赞降级通道是 check-then-insert，**没有**处理唯一约束冲突。
   双击 / 弱网重试会让两个请求都通过 check，第一个插入成功、第二个撞 likes 的
   (post_id, user_id) 唯一约束（PG 23505）⇒ 旧实现返回 ok:false ⇒ UI 弹「点赞失败」，
   而数据库里这次点赞其实**已经成功**。

   这组用例锁的就是「23505 必须归一为成功」，并且顺带锁住三件不该被顺手改掉的事：
   - 23505 不重复发推送（否则作者收两条）
   - 23505 不重复 invalidate（真正插入成功的那个请求已经做过）
   - 其他错误码仍然报失败（别把 23505 的宽恕扩大到全部错误） */

const fm = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  invalidate: vi.fn(),
  notifyLike: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: { from: fm.fromMock, rpc: fm.rpcMock },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: fm.loggerError, info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/utils/request-core.js', () => ({
  normalizeDbError: (e) => (e ? String(e.message || e) : null),
  invalidateByTags: fm.invalidate,
}));

vi.mock('../../src/utils/forum-format.js', () => ({
  normalizeForumReportError: (e) => String(e?.message || e || ''),
}));

vi.mock('../../src/utils/api/forum/_shared.js', () => ({
  // 恒判「RPC 函数缺失」⇒ 强制走降级通道（这是本文件唯一关心的路径）
  isMissingRpcFunctionError: () => true,
  notifyPostAuthorForLike: fm.notifyLike,
  notifyPostAuthorForRepost: vi.fn(),
}));

import { toggleLike } from '../../src/utils/api/forum/forum-interaction-api.js';

/**
 * 按操作分派 likes 表的链式 mock（**不依赖调用顺序**）。
 * 踩过的坑：用 mockReturnValueOnce 排队时，check 的 select 会吃掉 insert 那条，
 * 表现为「明明设了 23505 却走了别的分支」。
 */
function mockLikesTable({ existingLike = null, checkError = null, insertError = null } = {}) {
  const calls = [];
  fm.fromMock.mockImplementation(() => {
    const q = {
      select: vi.fn(() => {
        calls.push('select');
        q.eq = vi.fn(() => q);
        q.single = vi.fn(() => Promise.resolve({ data: existingLike, error: checkError }));
        return q;
      }),
      insert: vi.fn(() => {
        calls.push('insert');
        return Promise.resolve({ error: insertError });
      }),
      delete: vi.fn(() => {
        calls.push('delete');
        return { eq: vi.fn(() => Promise.resolve({ error: null })) };
      }),
    };
    return q;
  });
  return calls;
}

describe('toggleLike 降级通道：23505 归一（P3-9）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fm.rpcMock.mockResolvedValue({ data: null, error: { message: 'function not found', code: '42883' } });
  });

  it('insert 撞唯一约束时返回成功而不是失败', async () => {
    mockLikesTable({ existingLike: null, insertError: { code: '23505', message: 'duplicate key' } });

    const result = await toggleLike('post-1', 'user-1');

    expect(result.ok).toBe(true);
    expect(result.action).toBe('liked');
    expect(result.data.isLiked).toBe(true);
    expect(result.error).toBeNull();
  });

  it('23505 不重复发作者推送（真正插入的那次已发过）', async () => {
    mockLikesTable({ existingLike: null, insertError: { code: '23505', message: 'duplicate key' } });

    await toggleLike('post-1', 'user-1');

    expect(fm.notifyLike).not.toHaveBeenCalled();
  });

  it('23505 不重复 invalidate（真正插入的那次已 invalidate 过）', async () => {
    mockLikesTable({ existingLike: null, insertError: { code: '23505', message: 'duplicate key' } });

    await toggleLike('post-1', 'user-1');

    expect(fm.invalidate).not.toHaveBeenCalled();
  });

  it('23505 时 likeCount 为 null（无准确计数，调用方须沿用乐观值）', async () => {
    mockLikesTable({ existingLike: null, insertError: { code: '23505', message: 'duplicate key' } });

    const result = await toggleLike('post-1', 'user-1');

    // 不能写 0：Number(null || 0) 会把「未知」渲染成「零赞」（见 toggleLike 的 JSDoc）
    expect(result.data.likeCount).toBeNull();
  });

  it('其他错误码仍然报失败（宽恕不外溢）', async () => {
    mockLikesTable({
      existingLike: null,
      insertError: { code: '42501', message: 'row-level security' },
    });

    const result = await toggleLike('post-1', 'user-1');

    expect(result.ok).toBe(false);
    expect(result.action).toBeNull();
    expect(result.data.isLiked).toBe(false);
    expect(result.error).toContain('row-level security');
  });

  it('插入成功时照常 invalidate 并推送', async () => {
    mockLikesTable({ existingLike: null, insertError: null });

    const result = await toggleLike('post-1', 'user-1');

    expect(result.ok).toBe(true);
    expect(result.action).toBe('liked');
    expect(fm.invalidate).toHaveBeenCalledWith(['likes', 'posts', 'notifications']);
    expect(fm.notifyLike).toHaveBeenCalledWith({ postId: 'post-1', senderId: 'user-1' });
  });

  it('已点赞时走 delete 分支，返回 unliked', async () => {
    const calls = mockLikesTable({ existingLike: { id: 'like-1' } });

    const result = await toggleLike('post-1', 'user-1');

    expect(result.ok).toBe(true);
    expect(result.action).toBe('unliked');
    expect(result.data.isLiked).toBe(false);
    expect(calls).toContain('delete');
  });
});
