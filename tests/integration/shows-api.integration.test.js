import { beforeEach, describe, expect, it, vi } from 'vitest';

const sm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: sm.supabaseFrom,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getCreatorShows,
  createCreatorShow,
  deleteCreatorShow,
  validateCreatorShowPayload,
  CREATOR_SHOW_PLATFORMS,
} from '../../src/utils/api/shows-api.js';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    order: vi.fn(() => q),
    limit: vi.fn((n) => { calls.push({ method: 'limit', n }); return q; }),
    single: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('shows-api: validateCreatorShowPayload', () => {
  it('rejects empty title', () => {
    const result = validateCreatorShowPayload({ title: '', creatorPlatform: 'bilibili', videoUrl: 'https://bilibili.com/video/123' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('标题');
  });

  it('rejects empty description', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: '  ', creatorPlatform: 'bilibili', videoUrl: 'https://bilibili.com/video/123' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('简介');
  });

  it('rejects unsupported platform', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: 'Desc', creatorPlatform: 'youtube', videoUrl: 'https://youtube.com/watch?v=123' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('平台');
  });

  it('rejects invalid URL', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: 'Desc', creatorPlatform: 'bilibili', videoUrl: 'not-a-url' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('链接');
  });

  it('rejects non-http URL', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: 'Desc', creatorPlatform: 'bilibili', videoUrl: 'ftp://bilibili.com/video/123' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('链接');
  });

  it('rejects URL with wrong host for platform', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: 'Desc', creatorPlatform: 'bilibili', videoUrl: 'https://youtube.com/watch?v=123' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('哔哩哔哩');
  });

  it('accepts valid bilibili URL', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: 'Desc', creatorPlatform: 'bilibili', videoUrl: 'https://www.bilibili.com/video/BV123456/' });
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('Show 1');
    expect(result.data.creator_platform).toBe('bilibili');
  });

  it('accepts xiaohongshu URL', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: 'Desc', creatorPlatform: 'xiaohongshu', videoUrl: 'https://www.xiaohongshu.com/explore/abc123' });
    expect(result.ok).toBe(true);
  });

  it('accepts douyin URL', () => {
    const result = validateCreatorShowPayload({ title: 'Show 1', description: 'Desc', creatorPlatform: 'douyin', videoUrl: 'https://www.douyin.com/video/123' });
    expect(result.ok).toBe(true);
  });

  it('truncates long title and description', () => {
    const longTitle = 'A'.repeat(200);
    const longDesc = 'B'.repeat(500);
    const result = validateCreatorShowPayload({ title: longTitle, description: longDesc, creatorPlatform: 'bilibili', videoUrl: 'https://bilibili.com/video/123' });
    expect(result.ok).toBe(true);
    expect(result.data.title.length).toBe(80);
    expect(result.data.description.length).toBe(320);
  });
});

describe('shows-api: getCreatorShows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('fetches and normalizes creator shows', async () => {
    sm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { id: 'show1', author_id: 'u1', author_username: 'creator1', creator_platform: 'bilibili', creator_platform_id: '123', title: 'My Show', description: 'Great show', video_url: 'https://bilibili.com/video/123', created_at: '2024-01-01', updated_at: '2024-01-02' },
      ],
      error: null,
    }));

    const result = await getCreatorShows();
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe('My Show');
    expect(result.data[0].videoPlatform).toBe('bilibili');
    expect(result.data[0].videoPlatformLabel).toBe('哔哩哔哩');
  });

  it('handles unknown platform', async () => {
    sm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { id: 'show2', author_id: 'u1', author_username: 'creator1', creator_platform: 'unknown', creator_platform_id: '', title: 'Unknown', description: '', video_url: '', created_at: '2024-01-01', updated_at: '2024-01-02' },
      ],
      error: null,
    }));

    const result = await getCreatorShows();
    expect(result.data[0].videoPlatformLabel).toBe('unknown');
  });

  it('returns empty on database error', async () => {
    sm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'DB error' },
    }));

    const result = await getCreatorShows();
    expect(result.data).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('clamps limit to valid range', async () => {
    sm.supabaseFrom.mockReturnValue(makeQuery({
      data: [],
      error: null,
    }));

    await getCreatorShows({ limit: 999 });
    // Should clamp to max 100 without throwing
  });
});

describe('shows-api: createCreatorShow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects invalid payload', async () => {
    const result = await createCreatorShow({ title: '' }, { userId: 'u1', username: 'creator1' });
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('标题');
  });

  it('rejects when author is missing', async () => {
    const result = await createCreatorShow(
      { title: 'Show', description: 'Desc', creatorPlatform: 'bilibili', videoUrl: 'https://bilibili.com/video/123' },
      {}
    );
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('creates show successfully', async () => {
    sm.supabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => makeQuery({
          data: { id: 'show-new', author_id: 'u1', author_username: 'creator1', creator_platform: 'bilibili', creator_platform_id: '', title: 'Show', description: 'Desc', video_url: 'https://bilibili.com/video/123', created_at: '2024-01-01', updated_at: '2024-01-02' },
          error: null,
        })),
        single: vi.fn(() => Promise.resolve({
          data: { id: 'show-new', author_id: 'u1', author_username: 'creator1', creator_platform: 'bilibili', creator_platform_id: '', title: 'Show', description: 'Desc', video_url: 'https://bilibili.com/video/123', created_at: '2024-01-01', updated_at: '2024-01-02' },
          error: null,
        })),
      })),
    });

    const result = await createCreatorShow(
      { title: 'Show', description: 'Desc', creatorPlatform: 'bilibili', videoUrl: 'https://bilibili.com/video/123' },
      { userId: 'u1', username: 'creator1' }
    );
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('Show');
  });

  it('handles insert error', async () => {
    sm.supabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: null,
            error: { message: 'Duplicate entry' },
          })),
        })),
      })),
    });

    const result = await createCreatorShow(
      { title: 'Show', description: 'Desc', creatorPlatform: 'bilibili', videoUrl: 'https://bilibili.com/video/123' },
      { userId: 'u1', username: 'creator1' }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('shows-api: deleteCreatorShow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty show ID', async () => {
    const result = await deleteCreatorShow('', { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_SHOW_ID');
  });

  it('rejects missing author', async () => {
    const result = await deleteCreatorShow('show1', {});
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('deletes show successfully', async () => {
    const deleteQuery = {
      eq: vi.fn(() => deleteQuery),
      then: (resolve) => Promise.resolve({ error: null, count: 1 }).then(resolve),
    };
    sm.supabaseFrom.mockReturnValue({
      delete: vi.fn(() => deleteQuery),
    });

    const result = await deleteCreatorShow('show1', { userId: 'u1' });
    expect(result.ok).toBe(true);
  });

  it('handles not found / forbidden (count=0)', async () => {
    const deleteQuery = {
      eq: vi.fn(() => deleteQuery),
      then: (resolve) => Promise.resolve({ error: null, count: 0 }).then(resolve),
    };
    sm.supabaseFrom.mockReturnValue({
      delete: vi.fn(() => deleteQuery),
    });

    const result = await deleteCreatorShow('show1', { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SHOW_NOT_FOUND_OR_FORBIDDEN');
  });

  it('handles database error on delete', async () => {
    const deleteQuery = {
      eq: vi.fn(() => deleteQuery),
      then: (resolve) => Promise.resolve({ error: { message: 'DB error' }, count: null }).then(resolve),
    };
    sm.supabaseFrom.mockReturnValue({
      delete: vi.fn(() => deleteQuery),
    });

    const result = await deleteCreatorShow('show1', { userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('shows-api: CREATOR_SHOW_PLATFORMS', () => {
  it('contains the three supported platforms', () => {
    expect(CREATOR_SHOW_PLATFORMS).toHaveLength(3);
    const keys = CREATOR_SHOW_PLATFORMS.map((p) => p.key);
    expect(keys).toContain('bilibili');
    expect(keys).toContain('xiaohongshu');
    expect(keys).toContain('douyin');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(CREATOR_SHOW_PLATFORMS)).toBe(true);
  });
});