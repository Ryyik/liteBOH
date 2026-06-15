import { beforeEach, describe, expect, it, vi } from 'vitest';

const im = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: im.supabaseFrom,
    rpc: im.supabaseRpc,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  toggleLike,
  checkIfLiked,
  reportPost,
} from '../../src/utils/api/forum/forum-interaction-api.js';

function makeSingleQuery(result) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    single: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('forum-interaction-api: toggleLike', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('likes post via RPC', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: [{ action: 'liked', like_count: 1, is_liked: true }],
      error: null,
    });

    const result = await toggleLike('post1', 'u1');
    expect(result.ok).toBe(true);
    expect(result.action).toBe('liked');
    expect(result.data.isLiked).toBe(true);
    expect(im.supabaseRpc).toHaveBeenCalledWith('toggle_forum_like', { p_post_id: 'post1' });
  });

  it('unlikes post via RPC', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: [{ action: 'unliked', like_count: 0, is_liked: false }],
      error: null,
    });

    const result = await toggleLike('post2', 'u1');
    expect(result.ok).toBe(true);
    expect(result.action).toBe('unliked');
    expect(result.data.isLiked).toBe(false);
  });

  it('falls back to direct operation when RPC missing', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'could not find the function toggle_forum_like', code: 'PGRST202' },
    });

    im.supabaseFrom
      .mockReturnValueOnce(makeSingleQuery({
        data: null,
        error: { code: 'PGRST116' },
      }));

    const insertQuery = { then: (resolve) => Promise.resolve({ error: null }).then(resolve) };
    im.supabaseFrom.mockReturnValueOnce({
      insert: vi.fn(() => insertQuery),
    });

    const result = await toggleLike('post1', 'u1');
    expect(result.ok).toBe(true);
    expect(result.action).toBe('liked');
  });

  it('unlikes when existing like found in fallback', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'could not find the function toggle_forum_like', code: 'PGRST202' },
    });

    im.supabaseFrom
      .mockReturnValueOnce(makeSingleQuery({
        data: { id: 'like1' },
        error: null,
      }));

    const deleteQuery = { eq: vi.fn(() => deleteQuery), then: (resolve) => Promise.resolve({ error: null }).then(resolve) };
    im.supabaseFrom.mockReturnValueOnce({
      delete: vi.fn(() => deleteQuery),
    });

    const result = await toggleLike('post1', 'u1');
    expect(result.ok).toBe(true);
    expect(result.action).toBe('unliked');
  });
});

describe('forum-interaction-api: checkIfLiked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when no userId', async () => {
    const result = await checkIfLiked('post1', null);
    expect(result).toBe(false);
  });

  it('returns true when like exists', async () => {
    im.supabaseFrom.mockReturnValue(makeSingleQuery({ data: { id: 'like1' }, error: null }));
    const result = await checkIfLiked('post1', 'u1');
    expect(result).toBe(true);
  });

  it('returns false when no like', async () => {
    im.supabaseFrom.mockReturnValue(makeSingleQuery({ data: null, error: null }));
    const result = await checkIfLiked('post1', 'u1');
    expect(result).toBe(false);
  });
});

describe('forum-interaction-api: reportPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty postId', async () => {
    const result = await reportPost('', 'spam', 'This is spam');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_POST_ID');
  });

  it('submits report via RPC', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: { ok: true, reportId: 'rpt1', reportCount: 3, threshold: 5, limited: false, message: 'Reported' },
      error: null,
    });

    const result = await reportPost('post1', 'spam', 'This is spam');
    expect(result.ok).toBe(true);
    expect(result.data.reportId).toBe('rpt1');
    expect(result.data.reportCount).toBe(3);
    expect(im.supabaseRpc).toHaveBeenCalledWith('submit_forum_post_report', {
      p_post_id: 'post1',
      p_reason: 'spam',
      p_detail: 'This is spam',
    });
  });

  it('handles RPC returning ok:false', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: { ok: false, code: 'DUPLICATE_REPORT', message: 'Already reported' },
      error: null,
    });

    const result = await reportPost('post1', 'spam');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('DUPLICATE_REPORT');
  });

  it('handles missing RPC function', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'could not find the function submit_forum_post_report' },
    });

    const result = await reportPost('post1', 'spam');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('FORUM_REPORT_MIGRATION_REQUIRED');
  });

  it('defaults reason to "other" when empty', async () => {
    im.supabaseRpc.mockResolvedValue({
      data: { ok: true, reportId: 'rpt1' },
      error: null,
    });

    await reportPost('post1');
    expect(im.supabaseRpc.mock.calls[0][1].p_reason).toBe('other');
  });
});