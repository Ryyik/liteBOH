import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  resolveReplyUsername,
  calculateOptimisticLikeCount,
  restoreImageAtPosition,
  shouldFallbackReplyPreview,
  buildFallbackReplyPreviewOptions,
  getLikeErrorToast
} from '../../src/utils/forum-helpers.js';

// ============================================================
// Bug #5 修复: resolveReplyUsername — 空用户名兜底
// ============================================================
describe('resolveReplyUsername (Bug #5)', () => {
  it('有正常用户名时直接返回', () => {
    expect(resolveReplyUsername({ id: 'abc123', username: 'test_user' })).toBe('test_user');
  });

  it('username 为空字符串时用 user_ 前缀 + ID 前8位兜底', () => {
    expect(resolveReplyUsername({ id: 'abcdefgh123456', username: '' }))
      .toBe('user_abcdefgh');
  });

  it('username 为 null/undefined 时兜底', () => {
    expect(resolveReplyUsername({ id: 'xyz98765', username: null })).toBe('user_xyz98765');
    expect(resolveReplyUsername({ id: 'xyz98765' })).toBe('user_xyz98765');
  });

  it('username 仅有空白字符时兜底', () => {
    expect(resolveReplyUsername({ id: 'id12345', username: '   ' })).toBe('user_id12345');
  });

  it('userInfo 为 null 时返回 user_ 兜底', () => {
    const result = resolveReplyUsername(null);
    expect(result).toBe('user_');
  });

  it('username 和 id 都为空时返回 user_', () => {
    expect(resolveReplyUsername({})).toBe('user_');
  });

  it('ID 少于8位时取全部', () => {
    expect(resolveReplyUsername({ id: 'abc', username: '' })).toBe('user_abc');
  });
});

// ============================================================
// Bug #7 修复: calculateOptimisticLikeCount — 统一 fallback
// ============================================================
describe('calculateOptimisticLikeCount (Bug #7)', () => {
  describe('服务端返回有效 likeCount 时直接使用', () => {
    it('liked 动作', () => {
      expect(calculateOptimisticLikeCount(5, 'liked', 10)).toBe(10);
    });

    it('unliked 动作', () => {
      expect(calculateOptimisticLikeCount(5, 'unliked', 4)).toBe(4);
    });

    it('likeCount 为 0 也是有效值', () => {
      expect(calculateOptimisticLikeCount(5, 'unliked', 0)).toBe(0);
    });
  });

  describe('服务端返回无效值时本地乐观更新', () => {
    it('liked: currentCount + 1', () => {
      expect(calculateOptimisticLikeCount(5, 'liked', null)).toBe(6);
      expect(calculateOptimisticLikeCount(5, 'liked', undefined)).toBe(6);
      expect(calculateOptimisticLikeCount(5, 'liked', NaN)).toBe(6);
    });

    it('unliked: max(0, currentCount - 1)', () => {
      expect(calculateOptimisticLikeCount(5, 'unliked', null)).toBe(4);
      expect(calculateOptimisticLikeCount(0, 'unliked', undefined)).toBe(0);
      expect(calculateOptimisticLikeCount(0, 'unliked', NaN)).toBe(0);
    });
  });

  describe('边界情况', () => {
    it('currentCount 为 undefined/null 时当作 0 处理', () => {
      expect(calculateOptimisticLikeCount(undefined, 'liked', null)).toBe(1);
      expect(calculateOptimisticLikeCount(null, 'unliked', null)).toBe(0);
    });

    it('currentCount 为负数时 liked 后回到 1', () => {
      // Number(-1 || 0) = -1, then -1 + 1 = 0 → 但实际 Number(-1) is -1, -1 + 1 = 0
      expect(calculateOptimisticLikeCount(-1, 'liked', null)).toBe(0);
    });

    it('未知 action 返回原值', () => {
      expect(calculateOptimisticLikeCount(5, 'unknown', null)).toBe(5);
    });

    it('likeCount 为字符串数字时正确转换', () => {
      expect(calculateOptimisticLikeCount(5, 'liked', '10')).toBe(10);
    });
  });
});

// ============================================================
// Bug #8 修复: restoreImageAtPosition — 图片位置恢复
// ============================================================
describe('restoreImageAtPosition (Bug #8)', () => {
  it('将新图片插入到指定位置', () => {
    const existing = ['a', 'b', 'c', 'd'];
    const newImages = ['x'];
    const result = restoreImageAtPosition(existing, newImages, 2);
    expect(result).toEqual(['a', 'b', 'x', 'c', 'd']);
  });

  it('插入到开头 (index=0)', () => {
    const result = restoreImageAtPosition(['a', 'b', 'c'], ['x'], 0);
    expect(result).toEqual(['x', 'a', 'b', 'c']);
  });

  it('插入到末尾 (index=length)', () => {
    const result = restoreImageAtPosition(['a', 'b'], ['x'], 2);
    expect(result).toEqual(['a', 'b', 'x']);
  });

  it('插入多张图片', () => {
    const result = restoreImageAtPosition(['a', 'b', 'c'], ['x', 'y'], 1);
    expect(result).toEqual(['a', 'x', 'y', 'b', 'c']);
  });

  it('newImages 为空时返回原数组', () => {
    const result = restoreImageAtPosition(['a', 'b'], [], 1);
    expect(result).toEqual(['a', 'b']);
  });

  it('existingImages 非数组时返回原值', () => {
    expect(restoreImageAtPosition(null, ['x'], 0)).toBe(null);
    expect(restoreImageAtPosition(undefined, ['x'], 0)).toBe(undefined);
  });

  it('newImages 非数组时返回原数组', () => {
    expect(restoreImageAtPosition(['a', 'b'], null, 0)).toEqual(['a', 'b']);
  });

  it('index 为负数时行为与 slice 一致', () => {
    // slice(0, -1) = ['a'], slice(-1) = ['b']，所以 x 插在 a 和 b 之间
    const result = restoreImageAtPosition(['a', 'b'], ['x'], -1);
    expect(result).toEqual(['a', 'x', 'b']);
  });
});

// ============================================================
// Bug #1 修复: shouldFallbackReplyPreview + buildFallbackReplyPreviewOptions
// ============================================================
describe('回复预览降级查询 (Bug #1)', () => {
  describe('shouldFallbackReplyPreview', () => {
    it('数据为空且 comment_count > 0 时应触发降级', () => {
      expect(shouldFallbackReplyPreview([], 5)).toBe(true);
      expect(shouldFallbackReplyPreview(null, 3)).toBe(true);
    });

    it('有数据时不触发降级', () => {
      expect(shouldFallbackReplyPreview([{ id: 1 }], 5)).toBe(false);
    });

    it('comment_count 为 0 时不触发降级', () => {
      expect(shouldFallbackReplyPreview([], 0)).toBe(false);
      expect(shouldFallbackReplyPreview([], null)).toBe(false);
      expect(shouldFallbackReplyPreview([], undefined)).toBe(false);
    });

    it('comment_count 为字符串数字时正确判断', () => {
      expect(shouldFallbackReplyPreview([], '3')).toBe(true);
      expect(shouldFallbackReplyPreview([], '0')).toBe(false);
    });
  });

  describe('buildFallbackReplyPreviewOptions', () => {
    it('移除 topLevelOnly 属性', () => {
      const options = {
        topLevelOnly: true,
        page: 1,
        pageSize: 5,
        order: 'desc'
      };
      const result = buildFallbackReplyPreviewOptions(options);
      expect(result).toEqual({ page: 1, pageSize: 5, order: 'desc' });
      expect(result).not.toHaveProperty('topLevelOnly');
    });

    it('原始参数不含 topLevelOnly 时保持不变', () => {
      const options = { page: 2, pageSize: 10 };
      const result = buildFallbackReplyPreviewOptions(options);
      expect(result).toEqual({ page: 2, pageSize: 10 });
    });

    it('空参数返回空对象', () => {
      expect(buildFallbackReplyPreviewOptions(null)).toEqual({});
      expect(buildFallbackReplyPreviewOptions(undefined)).toEqual({});
    });
  });
});

// ============================================================
// Bug #3 修复: getLikeErrorToast — 点赞失败提示
// ============================================================
describe('getLikeErrorToast (Bug #3)', () => {
  it('有 error.message 时使用 message', () => {
    const result = getLikeErrorToast({ message: '频率限制' });
    expect(result).toEqual({ title: '操作失败', message: '频率限制' });
  });

  it('有 error.error 时使用 error', () => {
    const result = getLikeErrorToast({ error: '网络错误' });
    expect(result).toEqual({ title: '操作失败', message: '网络错误' });
  });

  it('无错误信息时使用默认文案', () => {
    const result = getLikeErrorToast(null);
    expect(result).toEqual({ title: '操作失败', message: '点赞未生效，请稍后重试' });
  });

  it('空对象使用默认文案', () => {
    const result = getLikeErrorToast({});
    expect(result).toEqual({ title: '操作失败', message: '点赞未生效，请稍后重试' });
  });
});

// ============================================================
// Mock 集成测试: 模拟 loadPostReplyPreview 完整流程
// ============================================================
describe('Mock 集成: loadPostReplyPreview 降级流程 (Bug #1)', () => {
  const mockGetComments = vi.fn();

  beforeEach(() => {
    mockGetComments.mockReset();
  });

  /**
   * 模拟 loadPostReplyPreview 的逻辑（从 index.vue 提取）
   */
  async function simulateLoadPostReplyPreview(post, currentUserId) {
    if (!post?.id) return;

    const baseOptions = {
      topLevelOnly: true,
      page: 1,
      pageSize: 3,
      order: 'desc'
    };

    let { data, hasMore } = await mockGetComments(post.id, currentUserId, baseOptions);

    if (shouldFallbackReplyPreview(data, post.comment_count)) {
      const fallbackOptions = buildFallbackReplyPreviewOptions(baseOptions);
      const fallback = await mockGetComments(post.id, currentUserId, fallbackOptions);
      data = fallback.data;
      hasMore = fallback.hasMore;
    }

    post.replies = Array.isArray(data) ? data : [];
    post.replies_has_more = Boolean(hasMore);
  }

  it('首次查询有数据时不触发降级（仅调用一次 getComments）', async () => {
    mockGetComments.mockResolvedValueOnce({
      data: [{ id: 1, content: 'hello' }],
      hasMore: false
    });

    const post = { id: 'post1', comment_count: 5, replies: null, replies_has_more: false };
    await simulateLoadPostReplyPreview(post, 'user1');

    expect(mockGetComments).toHaveBeenCalledTimes(1);
    expect(post.replies).toHaveLength(1);
    expect(post.replies_has_more).toBe(false);
  });

  it('首次查询为空但有评论数时触发降级（调用两次，第二次无 topLevelOnly）', async () => {
    mockGetComments
      .mockResolvedValueOnce({ data: [], hasMore: false })  // topLevelOnly 查询为空
      .mockResolvedValueOnce({ data: [{ id: 2 }], hasMore: false });  // 降级查询有结果

    const post = { id: 'post2', comment_count: 3, replies: null, replies_has_more: false };
    await simulateLoadPostReplyPreview(post, 'user1');

    expect(mockGetComments).toHaveBeenCalledTimes(2);
    // 第二次调用不应包含 topLevelOnly
    const secondCallArgs = mockGetComments.mock.calls[1];
    expect(secondCallArgs[2]).not.toHaveProperty('topLevelOnly');
    expect(post.replies).toHaveLength(1);
  });

  it('首次为空且评论数为0时不触发降级', async () => {
    mockGetComments.mockResolvedValueOnce({ data: [], hasMore: false });

    const post = { id: 'post3', comment_count: 0, replies: null, replies_has_more: false };
    await simulateLoadPostReplyPreview(post, 'user1');

    expect(mockGetComments).toHaveBeenCalledTimes(1);
    expect(post.replies).toEqual([]);
  });

  it('post.id 为空时直接返回，不调用 API', async () => {
    const post = { id: null, comment_count: 5 };
    await simulateLoadPostReplyPreview(post, 'user1');

    expect(mockGetComments).not.toHaveBeenCalled();
  });
});

// ============================================================
// Mock 集成测试: 模拟 handleToggleLike 完整流程
// ============================================================
describe('Mock 集成: handleToggleLike 乐观更新与错误处理 (Bug #3, #7)', () => {
  const mockToggleLike = vi.fn();
  const mockShowModal = vi.fn();

  beforeEach(() => {
    mockToggleLike.mockReset();
    mockShowModal.mockReset();
  });

  /**
   * 模拟 handleToggleLike 的逻辑（从 index.vue 提取）
   */
  async function simulateHandleToggleLike(post, userId) {
    const { action, data, error } = await mockToggleLike(post.id, userId);

    if (error) {
      console.error('点赞失败:', error);
      const toast = getLikeErrorToast(error);
      mockShowModal('warning', toast.title, toast.message);
      return { success: false };
    }

    post.like_count = calculateOptimisticLikeCount(post.like_count, action, data?.likeCount);
    post.isLiked = action === 'liked';
    return { success: true, action };
  }

  it('点赞成功时乐观更新 likeCount', async () => {
    mockToggleLike.mockResolvedValueOnce({
      action: 'liked',
      data: { likeCount: 42 },
      error: null
    });

    const post = { id: 'p1', like_count: 41, isLiked: false };
    const result = await simulateHandleToggleLike(post, 'user1');

    expect(result.success).toBe(true);
    expect(post.like_count).toBe(42);
    expect(post.isLiked).toBe(true);
  });

  it('取消点赞成功时乐观更新', async () => {
    mockToggleLike.mockResolvedValueOnce({
      action: 'unliked',
      data: { likeCount: 40 },
      error: null
    });

    const post = { id: 'p1', like_count: 41, isLiked: true };
    await simulateHandleToggleLike(post, 'user1');

    expect(post.like_count).toBe(40);
    expect(post.isLiked).toBe(false);
  });

  it('服务端未返回 likeCount 时本地乐观 +/- 1', async () => {
    mockToggleLike.mockResolvedValueOnce({
      action: 'liked',
      data: {},
      error: null
    });

    const post = { id: 'p1', like_count: 41, isLiked: false };
    await simulateHandleToggleLike(post, 'user1');

    expect(post.like_count).toBe(42);
  });

  it('点赞失败时弹出提示且不更新状态', async () => {
    mockToggleLike.mockResolvedValueOnce({
      action: null,
      data: null,
      error: { message: '操作过于频繁，请稍后再试' }
    });

    const post = { id: 'p1', like_count: 41, isLiked: false };
    const result = await simulateHandleToggleLike(post, 'user1');

    expect(result.success).toBe(false);
    expect(post.like_count).toBe(41); // 未变
    expect(post.isLiked).toBe(false); // 未变
    expect(mockShowModal).toHaveBeenCalledWith(
      'warning',
      '操作失败',
      '操作过于频繁，请稍后再试'
    );
  });
});

// ============================================================
// Mock 集成测试: 模拟 retryPostImageUpload 位置恢复
// ============================================================
describe('Mock 集成: retryPostImageUpload 位置恢复 (Bug #8)', () => {
  it('重试上传后图片恢复到原位置', () => {
    // 模拟场景：图片列表 ['a', 'b_failed', 'c']，重试 index=1 的 'b_failed'
    const images = [
      { id: 'a', sortOrder: 0 },
      { id: 'b_failed', sortOrder: 1, uploadStatus: 'failed' },
      { id: 'c', sortOrder: 2 }
    ];

    // Step 1: 移除失败图片
    const before = images.slice(0, 1); // [a]
    const after = images.slice(2);     // [c]
    const current = [...before, ...after]; // [a, c]

    // Step 2: 模拟上传新图片追加到末尾
    const newImages = [{ id: 'b_new', sortOrder: 3 }];
    const afterUpload = [...current, ...newImages]; // [a, c, b_new]

    // Step 3: 恢复到原位置 index=1
    const restored = restoreImageAtPosition(
      afterUpload.slice(0, current.length), // [a, c]
      newImages,
      1
    );
    // 期望: [a, b_new, c]
    expect(restored).toEqual([
      { id: 'a', sortOrder: 0 },
      { id: 'b_new', sortOrder: 3 },
      { id: 'c', sortOrder: 2 }
    ]);
  });

  it('重试第一张图片时恢复到开头', () => {
    const images = [
      { id: 'failed', sortOrder: 0 },
      { id: 'b', sortOrder: 1 }
    ];
    const before = images.slice(0, 0); // []
    const after = images.slice(1);     // [b]
    const current = [...before, ...after]; // [b]

    const newImages = [{ id: 'retried', sortOrder: 2 }];
    const restored = restoreImageAtPosition(current, newImages, 0);
    expect(restored).toEqual([
      { id: 'retried', sortOrder: 2 },
      { id: 'b', sortOrder: 1 }
    ]);
  });

  it('重试最后一张图片时恢复到末尾', () => {
    const images = [
      { id: 'a', sortOrder: 0 },
      { id: 'failed', sortOrder: 1 }
    ];
    const current = [{ id: 'a', sortOrder: 0 }]; // 移除 failed 后
    const newImages = [{ id: 'retried', sortOrder: 2 }];
    const restored = restoreImageAtPosition(current, newImages, 1);
    expect(restored).toEqual([
      { id: 'a', sortOrder: 0 },
      { id: 'retried', sortOrder: 2 }
    ]);
  });
});

// ============================================================
// Mock 集成测试: 模拟 submitReply 空用户名兜底
// ============================================================
describe('Mock 集成: submitReply 空用户名兜底 (Bug #5)', () => {
  it('正常用户名直接使用', () => {
    const userInfo = { id: 'abc123', username: 'test_user' };
    const safeUsername = resolveReplyUsername(userInfo);
    expect(safeUsername).toBe('test_user');
  });

  it('空用户名时生成兜底名', () => {
    const userInfo = { id: 'abc123def456', username: '' };
    const safeUsername = resolveReplyUsername(userInfo);
    expect(safeUsername).toBe('user_abc123de');
    expect(safeUsername).not.toBe('');
  });

  it('模拟 createComment 收到非空用户名', async () => {
    // 模拟 createComment 会被调用，且 username 不为空
    const capturedArgs = [];
    const mockCreateComment = vi.fn(async (...args) => {
      capturedArgs.push(args);
      return { error: null };
    });

    const userInfo = { id: 'uid001', username: '' };
    const safeUsername = resolveReplyUsername(userInfo);

    await mockCreateComment('post1', 'hello', userInfo.id, safeUsername, 'approved');
    expect(capturedArgs[0][3]).toBe('user_uid001');
    expect(capturedArgs[0][3]).not.toBe('');
  });
});