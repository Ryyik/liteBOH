import { beforeEach, describe, expect, it, vi } from 'vitest';

const fm = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  authGetUser: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fm.fromMock,
    rpc: fm.rpcMock,
    auth: { getUser: fm.authGetUser },
  },
}));

vi.mock('../../src/utils/cloudinary-client.js', () => ({
  markCloudinaryUploadsClaimed: vi.fn(() => Promise.resolve({ ok: true })),
  deleteCloudinaryAssetsByPublicIds: vi.fn(() => Promise.resolve({ ok: true })),
  getCloudinaryTransformedUrl: vi.fn((url) => url),
  getCloudinaryUrl: vi.fn((id) => `https://res.cloudinary.com/demo/image/upload/${id}`),
  getCloudinaryPublicId: vi.fn(() => 'mock-public-id'),
}));

vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  runKeywordPrecheck: vi.fn(() => ({ status: 'approved', message: 'OK' })),
  runAsyncRelaxedModeration: vi.fn(() => Promise.resolve({ status: 'approved' })),
  runSyncStrictModeration: vi.fn(() => Promise.resolve({ status: 'approved' })),
  writeModerationAuditLog: vi.fn(() => Promise.resolve()),
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  createPost,
  createPostWithImages,
  deletePost,
  updatePost,
  getPosts,
  getUserPosts,
  getPostsCount,
  getForumTagStats,
  getWeeklyCheckinStatus,
  submitWeeklyCheckin,
} from '../../src/utils/api/forum/post-api.js';
import {
  createComment,
  getComments,
  deleteComment,
} from '../../src/utils/api/forum/comment-api.js';
import {
  toggleLike,
  reportPost,
} from '../../src/utils/api/forum/forum-interaction-api.js';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    or: vi.fn((expr) => { calls.push({ method: 'or', expr }); return q; }),
    is: vi.fn((col, val) => { calls.push({ method: 'is', col, val }); return q; }),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    range: vi.fn(() => q),
    single: vi.fn(() => q),
    maybeSingle: vi.fn(() => q),
    not: vi.fn(() => q),
    ilike: vi.fn(() => q),
    lte: vi.fn(() => q),
    gt: vi.fn(() => q),
    in: vi.fn(() => q),
    insert: vi.fn(() => q),
    update: vi.fn(() => q),
    delete: vi.fn(() => q),
    upsert: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('forum-api integration: createPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty content', async () => {
    fm.authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@test.com', user_metadata: { username: 'author' } } }, error: null });
    const result = await createPost('', 'u1', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('EMPTY_POST_CONTENT');
  });

  it('rejects when not authenticated', async () => {
    fm.authGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });
    const result = await createPost('【标题】\n内容', null, '');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('creates post successfully with title and body', async () => {
    fm.authGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com', user_metadata: { username: 'author' } } },
      error: null,
    });

    const insertQuery = makeQuery({
      data: [{ id: 'post-1', content: '【标题】\n正文', author_id: 'u1', status: 'approved' }],
      error: null,
    });
    fm.fromMock.mockReturnValue(insertQuery);

    const result = await createPost('正文', 'u1', 'author', 'approved', '标题');
    expect(result.ok).toBe(true);
    expect(result.data[0].id).toBe('post-1');
  });
});

describe('forum-api integration: createPostWithImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects too many images', async () => {
    const tooManyImages = Array.from({ length: 7 }, (_, i) => ({ id: `img-${i}`, url: `url-${i}` }));
    fm.authGetUser.mockResolvedValue({
      data: { user: { id: 'u1', user_metadata: { username: 'author' } } },
      error: null,
    });

    const result = await createPostWithImages('正文', 'u1', 'author', 'approved', '标题', tooManyImages);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('FORUM_IMAGE_LIMIT');
  });

  it('creates image post via RPC', async () => {
    fm.authGetUser.mockResolvedValue({
      data: { user: { id: 'u1', user_metadata: { username: 'author' } } },
      error: null,
    });

    fm.rpcMock.mockResolvedValue({
      data: { id: 'post-img-1', content: '【标题】\n正文', image_count: 1 },
      error: null,
    });

    const result = await createPostWithImages('正文', 'u1', 'author', 'approved', '标题', [{ url: 'https://img.url', public_id: 'pub-1' }]);
    expect(result.ok).toBe(true);
    expect(fm.rpcMock).toHaveBeenCalledWith('create_forum_post_with_images', expect.any(Object));
  });

  it('uses the idempotent RPC when a submission id is provided', async () => {
    fm.authGetUser.mockResolvedValue({
      data: { user: { id: 'u1', user_metadata: { username: 'author' } } },
      error: null,
    });
    fm.rpcMock.mockResolvedValue({
      data: { id: 'post-img-2', content: '【标题】\n正文', image_count: 1 },
      error: null,
    });

    const result = await createPostWithImages(
      '正文',
      'u1',
      'author',
      'approved',
      '标题',
      [{ url: 'https://img.url', public_id: 'pub-1' }],
      '',
      null,
      { submissionId: 'b3eacb6a-1b8e-4cf5-8fd4-7140e0252e89' }
    );

    expect(result.ok).toBe(true);
    expect(fm.rpcMock).toHaveBeenCalledWith(
      'create_forum_post_with_images_idempotent',
      expect.objectContaining({ p_submission_id: 'b3eacb6a-1b8e-4cf5-8fd4-7140e0252e89' })
    );
  });
});

describe('forum-api integration: deletePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects when post not found', async () => {
    const selectQuery = makeQuery({ data: null, error: { message: 'Not found' } });
    fm.fromMock.mockReturnValue(selectQuery);

    const result = await deletePost('post-1', 'u1', 'user');
    expect(result.ok).toBe(false);
  });

  it('rejects non-author non-admin deletion', async () => {
    const selectQuery = makeQuery({ data: { author_id: 'other_user' }, error: null });
    fm.fromMock.mockReturnValue(selectQuery);

    const result = await deletePost('post-1', 'u1', 'user');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('没有权限删除此帖子');
  });

  it('admin can delete any post', async () => {
    const calls = [];
    const selectQuery = makeQuery({ data: { author_id: 'other_user' }, error: null }, calls);
    // Mock chain: select → eq → single → then
    fm.fromMock.mockReturnValue(selectQuery);

    const deleteQuery = makeQuery({ data: null, error: null });
    // Second from() call for delete
    fm.fromMock
      .mockReturnValueOnce(selectQuery)  // first: select post
      .mockReturnValueOnce(makeQuery({ data: [], error: null }))  // getForumPostImages
      .mockReturnValueOnce(deleteQuery);  // delete

    const result = await deletePost('post-1', 'u1', 'admin');
    expect(result.ok).toBe(true);
  });
});

describe('forum-api integration: getPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns posts via RPC', async () => {
    fm.rpcMock.mockResolvedValue({
      data: [
        {
          id: 'p1',
          title: 'Title 1',
          body: 'Body 1',
          comment_count: 1,
          like_count: 2,
          is_liked: true,
          replies: [{ id: 'c1', content: 'Nice', author_username: 'reader', author_avatar_url: null }],
          replies_has_more: false,
          author_username: 'author1',
          author_avatar_url: null,
          status: 'approved',
          has_more: false,
        },
      ],
      error: null,
    });

    const result = await getPosts('u1', { page: 1, pageSize: 10 });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].isLiked).toBe(true);
    expect(result.data[0].replies).toHaveLength(1);
    expect(result.data[0].replies_preloaded).toBe(true);
    expect(fm.fromMock).not.toHaveBeenCalled();
  });

  it('returns empty array on error', async () => {
    fm.rpcMock.mockResolvedValue({ data: null, error: { message: 'RPC failed', code: 'PGRST202' } });
    fm.fromMock.mockReturnValue(makeQuery({ data: [], error: { message: 'table error' } }));

    const result = await getPosts(null, { page: 1, pageSize: 10 });
    expect(result.data).toHaveLength(0);
  });
});

describe('forum-api integration: getPostsCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns post count', async () => {
    fm.fromMock.mockReturnValue(makeQuery({ data: null, count: 42, error: null }));
    const result = await getPostsCount();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(42);
  });
});

describe('forum-api integration: getForumTagStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns tag stats from RPC', async () => {
    fm.rpcMock.mockResolvedValue({
      data: [{ tag: 'tech', post_count: 10 }, { tag: 'life', post_count: 5 }],
      error: null,
    });

    const result = await getForumTagStats();
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe('forum-api integration: comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('getComments returns approved comments', async () => {
    fm.fromMock.mockReturnValue(makeQuery({
      data: [{ id: 'c1', content: 'Nice post', author_id: 'u2', author: { avatar_url: null } }],
      error: null,
    }));

    const result = await getComments('post-1', 'u1');
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('createComment rejects empty content', async () => {
    const result = await createComment('post-1', '', 'u1', 'author');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_COMMENT_PARAMS');
  });

  it('createComment succeeds with valid content', async () => {
    fm.fromMock.mockReturnValue(makeQuery({
      data: [{ id: 'c1', content: 'Great post', status: 'approved' }],
      error: null,
    }));

    const result = await createComment('post-1', 'Great post', 'u1', 'author');
    expect(result.ok).toBe(true);
    expect(result.data[0].id).toBe('c1');
  });

  it('deleteComment requires permission', async () => {
    fm.fromMock.mockReturnValue(makeQuery({
      data: { author_id: 'other_user', status: 'approved' },
      error: null,
    }));

    const result = await deleteComment('c1', 'u1', 'user');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('没有权限删除此评论');
  });
});

describe('forum-api integration: toggleLike', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('toggles like via RPC', async () => {
    fm.rpcMock.mockResolvedValue({
      data: [{ action: 'liked', like_count: 5, is_liked: true }],
      error: null,
    });

    const result = await toggleLike('post-1', 'u1');
    expect(result.ok).toBe(true);
    expect(result.action).toBe('liked');
  });

  it('handles missing RPC gracefully', async () => {
    // Mock RPC not found
    fm.rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function toggle_forum_like', code: 'PGRST202' },
    });

    // Fallback: check existing like
    fm.fromMock.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'Not found', code: 'PGRST116' },
    }));

    // Fallback: insert new like
    fm.fromMock.mockReturnValue(makeQuery({
      data: null,
      error: null,
    }));

    const result = await toggleLike('post-1', 'u1');
    // Should fall through to manual insert
    expect(result.ok).toBe(true);
  });
});

describe('forum-api integration: reportPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty post ID', async () => {
    const result = await reportPost('', 'spam', 'This is spam');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_POST_ID');
  });

  it('reports post via RPC', async () => {
    fm.rpcMock.mockResolvedValue({
      data: { ok: true, reportId: 'r1', reportCount: 1, threshold: 3, limited: false, message: '举报已提交' },
      error: null,
    });

    const result = await reportPost('post-1', 'spam', 'Spam content');
    expect(result.ok).toBe(true);
    expect(result.data.reportId).toBe('r1');
  });
});

describe('forum-api integration: weekly checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('getWeeklyCheckinStatus returns status', async () => {
    fm.authGetUser.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    });

    fm.rpcMock.mockResolvedValue({
      data: { ok: true, has_signed_this_week: false, current_streak: 3, cycle_size: 4 },
      error: null,
    });

    const result = await getWeeklyCheckinStatus('u1');
    expect(result.ok).toBe(true);
    expect(result.data.currentStreak).toBe(3);
  });

  it('submitWeeklyCheckin works', async () => {
    fm.rpcMock.mockResolvedValue({
      data: { ok: true, has_signed_this_week: true, current_streak: 4, points_awarded: 10 },
      error: null,
    });

    const result = await submitWeeklyCheckin();
    expect(result.ok).toBe(true);
    expect(result.data.pointsAwarded).toBe(10);
  });
});

describe('forum-api integration: getUserPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns user posts', async () => {
    fm.rpcMock.mockResolvedValue({
      data: [{
        id: 'p1',
        title: 'My Post',
        author_id: 'u1',
        is_liked: true,
        replies: [],
        replies_has_more: false,
        has_more: false,
      }],
      error: null,
    });

    const result = await getUserPosts('u1', 'u1', { page: 1, pageSize: 10 });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].isLiked).toBe(true);
    expect(result.data[0].replies_preloaded).toBe(true);
    expect(fm.fromMock).not.toHaveBeenCalled();
  });
});

describe('forum-api integration: updatePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty content', async () => {
    const result = await updatePost('post-1', '', 'u1', 'user', '');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('帖子内容不能为空');
  });

  it('rejects if post not found', async () => {
    fm.fromMock.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'Not found' },
    }));

    const result = await updatePost('post-1', 'updated content', 'u1', 'user', 'Updated Title');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('帖子不存在');
  });
});
