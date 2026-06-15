import { beforeEach, describe, expect, it, vi } from 'vitest';

const fm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
  supabaseAuth: { getUser: vi.fn() },
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fm.supabaseFrom,
    rpc: fm.supabaseRpc,
    auth: fm.supabaseAuth,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getPostsCount,
  getForumPostDraft,
  upsertForumPostDraft,
  deleteForumPostDraft,
  getWeeklyCheckinStatus,
  submitWeeklyCheckin,
} from '../../src/utils/api/forum/post-api.js';

function makeCountQuery(result) {
  const q = {
    select: vi.fn(() => q),
    or: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

function makeDeleteQuery(result) {
  const q = {
    eq: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('forum-post-api: getPostsCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns count from database', async () => {
    fm.supabaseFrom.mockReturnValue(makeCountQuery({ data: null, error: null, count: 42 }));

    const result = await getPostsCount();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(42);
  });

  it('handles error', async () => {
    fm.supabaseFrom.mockReturnValue(makeCountQuery({ data: null, error: { message: 'DB error' }, count: null }));

    const result = await getPostsCount();
    expect(result.ok).toBe(false);
    expect(result.count).toBe(0);
  });
});

describe('forum-post-api: getForumPostDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await getForumPostDraft('');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('fetches draft content', async () => {
    fm.supabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: { title: 'Draft Title', content: 'Draft content', tag: 'server', updated_at: '2024-06-15' },
            error: null,
          })),
        })),
      })),
    });

    const result = await getForumPostDraft('u1');
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('Draft Title');
    expect(result.data.tag).toBe('server');
  });

  it('returns null for missing draft', async () => {
    fm.supabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    });

    const result = await getForumPostDraft('u1');
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('forum-post-api: upsertForumPostDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await upsertForumPostDraft('');
    expect(result.ok).toBe(false);
  });

  it('deletes draft when both title and content are empty', async () => {
    fm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => makeDeleteQuery({ error: null })) });

    const result = await upsertForumPostDraft('u1', { title: '  ', content: '  ' });
    expect(result.ok).toBe(true);
  });

  it('upserts draft content', async () => {
    fm.supabaseFrom.mockReturnValue({
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { title: 'New Draft', content: 'New content', tag: 'discussion', updated_at: '2024-06-15' },
            error: null,
          })),
        })),
      })),
    });

    const result = await upsertForumPostDraft('u1', { title: 'New Draft', content: 'New content', tag: 'discussion' });
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('New Draft');
  });
});

describe('forum-post-api: deleteForumPostDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await deleteForumPostDraft('');
    expect(result.ok).toBe(false);
  });

  it('deletes draft successfully', async () => {
    fm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => makeDeleteQuery({ error: null })) });
    const result = await deleteForumPostDraft('u1');
    expect(result.ok).toBe(true);
  });
});

describe('forum-post-api: getWeeklyCheckinStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns RPC result normalized', async () => {
    fm.supabaseRpc.mockResolvedValue({
      data: { streak_total: 3, has_signed_this_week: false, points_awarded: 0, current_points: 500, message: '' },
      error: null,
    });

    const result = await getWeeklyCheckinStatus('u1');
    expect(result.ok).toBe(true);
    expect(result.data.streakTotal).toBe(3);
    expect(result.data.hasSignedThisWeek).toBe(false);
    expect(result.data.nextRewardIn).toBe(4);
  });

  it('handles array payload', async () => {
    fm.supabaseRpc.mockResolvedValue({
      data: [{ streak_total: 7, has_signed_this_week: true, cycle_progress: 3 }],
      error: null,
    });

    const result = await getWeeklyCheckinStatus('u1');
    expect(result.data.streakTotal).toBe(7);
    expect(result.data.hasSignedThisWeek).toBe(true);
    expect(result.data.rewardCompletedThisWeek).toBe(false);
  });
});

describe('forum-post-api: submitWeeklyCheckin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('submits checkin via RPC', async () => {
    fm.supabaseRpc.mockResolvedValue({
      data: { ok: true, streak_total: 4, has_signed_this_week: true, points_awarded: 10, current_points: 510 },
      error: null,
    });

    const result = await submitWeeklyCheckin();
    expect(result.ok).toBe(true);
    expect(result.data.streakTotal).toBe(4);
    expect(result.data.hasSignedThisWeek).toBe(true);
    expect(fm.supabaseRpc).toHaveBeenCalledWith('submit_weekly_checkin');
  });

  it('handles RPC error', async () => {
    fm.supabaseRpc.mockResolvedValue({
      data: null,
      error: { message: 'Already checked in' },
    });

    const result = await submitWeeklyCheckin();
    expect(result.ok).toBe(false);
  });
});