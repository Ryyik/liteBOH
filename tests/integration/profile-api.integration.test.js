import { beforeEach, describe, expect, it, vi } from 'vitest';

const fm = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fm.fromMock,
    rpc: fm.rpcMock,
  },
}));

vi.mock('../../src/utils/cloudinary-client.js', () => ({
  getCloudinaryTransformedUrl: vi.fn((url) => url ? `transformed:${url}` : ''),
  getCloudinaryUrl: vi.fn((id) => `https://res.cloudinary.com/demo/image/upload/${id}`),
}));

vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  runKeywordPrecheck: vi.fn(() => ({ status: 'approved', message: 'OK' })),
  runAsyncRelaxedModeration: vi.fn(() => Promise.resolve({ status: 'approved' })),
  writeModerationAuditLog: vi.fn(() => Promise.resolve()),
  isMissingDbColumnError: vi.fn(() => false),
  UNIFIED_APPROVED_STATUS: 'approved',
  UNIFIED_REJECTED_STATUS: 'rejected',
}));

vi.mock('../../src/utils/forum-post-format.js', () => ({
  getForumPostParts: vi.fn((post) => ({
    title: post?.title || '',
    body: post?.body || post?.content || '',
  })),
  getForumPostExcerpt: vi.fn(() => 'excerpt'),
}));

vi.mock('../../src/utils/api/notifications-api.js', () => ({
  createNotification: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getUserImpressions,
  addUserImpression,
  deleteUserImpression,
  getProfileByUsername,
  getPostsByUsername,
  getCommentsByUsername,
  updateProfile,
  updateProfileBio,
  updateProfileAvatar,
  createShopOrderWithPoints,
} from '../../src/utils/api/profile-api.js';

function createQueryBuilder(result, calls = []) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return query; }),
    ilike: vi.fn((col, val) => { calls.push({ method: 'ilike', col, val }); return query; }),
    limit: vi.fn((n) => { calls.push({ method: 'limit', n }); return query; }),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    in: vi.fn(() => query),
    or: vi.fn(() => query),
    single: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    not: vi.fn(() => query),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe('profile-api integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  describe('getUserImpressions', () => {
    it('fetches impressions with moderation filter', async () => {
      const query = createQueryBuilder({
        data: [{ id: 'imp1', content: 'Nice!', author_id: 'u1', target_id: 'u2' }],
        error: null,
      });
      fm.fromMock.mockReturnValue(query);

      const result = await getUserImpressions('u2');
      expect(result.data).toBeDefined();
      expect(result.error).toBeNull();
      expect(fm.fromMock).toHaveBeenCalledWith('user_impressions');
    });
  });

  describe('addUserImpression', () => {
    it('inserts impression and returns ok', async () => {
      const insertQuery = {
        select: vi.fn(() => Promise.resolve({
          data: [{ id: 'new-imp', content: 'Hello', author_id: 'u1', target_id: 'u2' }],
          error: null,
        })),
      };
      fm.fromMock.mockReturnValue({ insert: vi.fn(() => insertQuery) });

      const result = await addUserImpression('u1', 'u2', 'Hello');
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('blocks content that fails keyword check', async () => {
      const { runKeywordPrecheck } = await import('../../src/utils/unified-content-moderation.js');
      runKeywordPrecheck.mockReturnValue({ status: 'rejected', message: '包含违禁词' });

      const result = await addUserImpression('u1', 'u2', 'bad content');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('deleteUserImpression', () => {
    it('deletes own impression', async () => {
      const selectQuery = createQueryBuilder({
        data: { id: 'imp1', author_id: 'u1', target_id: 'u2' },
        error: null,
      });
      const deleteQuery = { eq: vi.fn(() => Promise.resolve({ error: null })) };
      fm.fromMock
        .mockReturnValueOnce(selectQuery)
        .mockReturnValueOnce({ delete: vi.fn(() => deleteQuery) });

      const result = await deleteUserImpression('imp1', 'u1');
      expect(result.ok).toBe(true);
    });

    it('rejects deletion by non-owner', async () => {
      const selectQuery = createQueryBuilder({
        data: { id: 'imp1', author_id: 'u1', target_id: 'u2' },
        error: null,
      });
      fm.fromMock.mockReturnValue(selectQuery);

      const result = await deleteUserImpression('imp1', 'u3');
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('权限');
    });
  });

  describe('getProfileByUsername', () => {
    it('fetches profile by username', async () => {
      const query = createQueryBuilder({
        data: { id: 'u1', username: 'testuser', bio: 'Hello' },
        error: null,
      });
      fm.fromMock.mockReturnValue(query);

      const result = await getProfileByUsername('testuser');
      expect(result.data).toBeDefined();
      expect(result.data.username).toBe('testuser');
    });
  });

  describe('getPostsByUsername', () => {
    it('fetches posts by username with author_id', async () => {
      const query = createQueryBuilder({
        data: [{ id: 'p1', title: 'Post 1', body: 'Content', author_id: 'u1', forum_post_images: [] }],
        error: null,
      });
      fm.fromMock.mockReturnValue(query);

      const result = await getPostsByUsername('testuser', 'u1');
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('returns empty array for empty username and no userId', async () => {
      const result = await getPostsByUsername('', null);
      // Falls back to no query, returns empty
      expect(result.data).toBeDefined();
    });
  });

  describe('getCommentsByUsername', () => {
    it('fetches comments by username', async () => {
      const query = createQueryBuilder({
        data: [{ id: 'c1', content: 'Comment', author_id: 'u1' }],
        error: null,
      });
      fm.fromMock.mockReturnValue(query);

      const result = await getCommentsByUsername('testuser', 'u1');
      expect(result.data).toBeDefined();
    });
  });

  describe('updateProfile', () => {
    it('updates profile fields', async () => {
      const updateQuery = {
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'u1', bio: 'new bio' }], error: null })),
        })),
      };
      fm.fromMock.mockReturnValue({ update: vi.fn(() => updateQuery) });

      const result = await updateProfile('u1', { bio: 'new bio' });
      expect(result.ok).toBe(true);
    });

    it('blocks direct points update', async () => {
      const result = await updateProfile('u1', { points: 999 });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NO_ALLOWED_FIELDS');
    });
  });

  describe('updateProfileBio', () => {
    it('delegates to updateProfile', async () => {
      const updateQuery = {
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'u1', bio: 'hello' }], error: null })),
        })),
      };
      fm.fromMock.mockReturnValue({ update: vi.fn(() => updateQuery) });

      const result = await updateProfileBio('u1', 'hello');
      expect(result.ok).toBe(true);
    });
  });

  describe('updateProfileAvatar', () => {
    it('delegates to updateProfile with avatar_url', async () => {
      const updateQuery = {
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'u1' }], error: null })),
        })),
      };
      fm.fromMock.mockReturnValue({ update: vi.fn(() => updateQuery) });

      const result = await updateProfileAvatar('u1', 'https://example.com/avatar.jpg');
      expect(result.ok).toBe(true);
    });
  });

  describe('createShopOrderWithPoints', () => {
    it('rejects empty items', async () => {
      const result = await createShopOrderWithPoints({ items: [] });
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('为空');
    });

    it('creates order with valid items', async () => {
      fm.rpcMock.mockResolvedValue({
        data: { ok: true, order_id: 'order-1', order_no: 'NO-001', points_deducted: 100, current_points: 900 },
        error: null,
      });

      const result = await createShopOrderWithPoints({
        items: [{ id: 1, quantity: 2, selectedSpec: 'S', selectedSpecLabel: 'Small' }],
      });
      expect(result.ok).toBe(true);
      expect(result.data.orderId).toBe('order-1');
    });

    it('handles RPC error', async () => {
      fm.rpcMock.mockResolvedValue({
        data: null,
        error: { message: 'Insufficient points', code: 'INSUFFICIENT_POINTS' },
      });

      const result = await createShopOrderWithPoints({
        items: [{ id: 1, quantity: 1 }],
      });
      expect(result.ok).toBe(false);
    });
  });
});