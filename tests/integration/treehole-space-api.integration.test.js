import { beforeEach, describe, expect, it, vi } from 'vitest';

const sm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
  supabaseFunctions: { invoke: vi.fn() },
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: sm.supabaseFrom,
    rpc: sm.supabaseRpc,
    functions: sm.supabaseFunctions,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
// treehole-space-api exports
import {
  getMyTreeholeSpace,
  createMyTreeholeSpace,
  updateMyTreeholeSpace,
  deleteMyTreeholeSpace,
} from '../../src/utils/api/treehole/treehole-space-api.js';
// cloud-entry-api exports
import {
  getMyTreeholeMemories,
  getMyTreeholeStats,
  createTreeholeMemory,
  updateTreeholeMemory,
  deleteTreeholeMemory,
} from '../../src/utils/api/treehole/cloud-entry-api.js';

function makeSelectQuery(result) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    gte: vi.fn(() => q),
    lte: vi.fn(() => q),
    ilike: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    range: vi.fn(() => q),
    maybeSingle: vi.fn(() => q),
    single: vi.fn(() => q),
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

describe('treehole-space-api: getMyTreeholeSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await getMyTreeholeSpace('');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('fetches and normalizes space', async () => {
    sm.supabaseFrom.mockReturnValue(makeSelectQuery({
      data: { user_id: 'u1', title: 'My Space', description: 'About me', created_at: '2024-01-01', updated_at: '2024-01-02' },
      error: null,
    }));

    const result = await getMyTreeholeSpace('u1');
    expect(result.ok).toBe(true);
    expect(result.data.userId).toBe('u1');
    expect(result.data.title).toBe('My Space');
  });

  it('returns null for missing space', async () => {
    sm.supabaseFrom.mockReturnValue(makeSelectQuery({ data: null, error: null }));
    const result = await getMyTreeholeSpace('u1');
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('treehole-space-api: createMyTreeholeSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await createMyTreeholeSpace('');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('creates space with default title', async () => {
    sm.supabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: { user_id: 'u1', title: '我的 BOH 树洞', description: '', created_at: '2024-01-01', updated_at: '2024-01-02' },
            error: null,
          })),
        })),
      })),
    });

    const result = await createMyTreeholeSpace('u1');
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('我的 BOH 树洞');
    expect(result.alreadyExists).toBe(false);
  });

  it('handles duplicate (23505) by returning existing', async () => {
    sm.supabaseFrom
      .mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: null,
              error: { code: '23505', message: 'duplicate' },
            })),
          })),
        })),
      });

    // getMyTreeholeSpace retry
    sm.supabaseFrom.mockReturnValue(makeSelectQuery({
      data: { user_id: 'u1', title: 'Existing Space', description: '', created_at: '2024-01-01', updated_at: '2024-01-02' },
      error: null,
    }));

    const result = await createMyTreeholeSpace('u1');
    expect(result.ok).toBe(true);
    expect(result.alreadyExists).toBe(true);
  });
});

describe('treehole-space-api: updateMyTreeholeSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await updateMyTreeholeSpace('');
    expect(result.ok).toBe(false);
  });

  it('returns ok when no updates', async () => {
    const result = await updateMyTreeholeSpace('u1', {});
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });

  it('updates space fields', async () => {
    sm.supabaseFrom.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { user_id: 'u1', title: 'New Title', description: 'New desc', created_at: '2024-01-01', updated_at: '2024-06-15' },
              error: null,
            })),
          })),
        })),
      })),
    });

    const result = await updateMyTreeholeSpace('u1', { title: 'New Title', description: 'New desc' });
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('New Title');
  });
});

describe('treehole-space-api: deleteMyTreeholeSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await deleteMyTreeholeSpace('');
    expect(result.ok).toBe(false);
  });

  it('deletes space successfully', async () => {
    sm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => makeDeleteQuery({ error: null, count: 1 })) });
    const result = await deleteMyTreeholeSpace('u1');
    expect(result.ok).toBe(true);
  });

  it('returns error when count is 0', async () => {
    sm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => makeDeleteQuery({ error: null, count: 0 })) });
    const result = await deleteMyTreeholeSpace('u1');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('TREEHOLE_SPACE_NOT_FOUND');
  });
});

describe('treehole-space-api: getMyTreeholeMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await getMyTreeholeMemories({ userId: '' });
    expect(result.ok).toBe(false);
  });

  it('fetches paginated memories', async () => {
    sm.supabaseFrom.mockReturnValue(makeSelectQuery({
      data: [
        { id: 'm1', user_id: 'u1', content: 'Memory 1', mood: 'happy', tags: ['work'], is_starred: true, source: 'manual', created_at: '2024-01-01', updated_at: '2024-01-02' },
      ],
      error: null,
      count: 1,
    }));

    const result = await getMyTreeholeMemories({ userId: 'u1', page: 1, pageSize: 10 });
    expect(result.ok).toBe(true);
    expect(result.data.items.length).toBe(1);
    expect(result.data.items[0].content).toBe('Memory 1');
    expect(result.data.total).toBe(1);
  });
});

describe('treehole-space-api: getMyTreeholeStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty userId', async () => {
    const result = await getMyTreeholeStats('');
    expect(result.ok).toBe(false);
  });

  it('fetches memory and starred counts', async () => {
    sm.supabaseFrom
      .mockReturnValueOnce(makeSelectQuery({ data: null, error: null, count: 42 }))
      .mockReturnValueOnce(makeSelectQuery({ data: null, error: null, count: 10 }));

    const result = await getMyTreeholeStats('u1');
    expect(result.ok).toBe(true);
    expect(result.data.totalMemories).toBe(42);
    expect(result.data.starredMemories).toBe(10);
  });
});

describe('treehole-space-api: createTreeholeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await createTreeholeMemory('', { content: 'Hello' });
    expect(result.ok).toBe(false);
  });

  it('rejects empty content', async () => {
    const result = await createTreeholeMemory('u1', { content: '' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('EMPTY_MEMORY');
  });

  it('creates memory successfully', async () => {
    sm.supabaseFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: { id: 'mem1', user_id: 'u1', content: 'Hello', mood: '', tags: [], is_starred: false, source: 'manual', created_at: '2024-01-01', updated_at: '2024-01-02' },
            error: null,
          })),
        })),
      })),
    });

    const result = await createTreeholeMemory('u1', { content: 'Hello' });
    expect(result.ok).toBe(true);
    expect(result.data.content).toBe('Hello');
    expect(result.data.source).toBe('manual');
  });
});

describe('treehole-space-api: updateTreeholeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty userId', async () => {
    const result = await updateTreeholeMemory('', 'm1', {});
    expect(result.ok).toBe(false);
  });

  it('rejects empty memoryId', async () => {
    const result = await updateTreeholeMemory('u1', '', {});
    expect(result.ok).toBe(false);
  });

  it('returns ok when no updates', async () => {
    const result = await updateTreeholeMemory('u1', 'm1', {});
    expect(result.ok).toBe(true);
  });

  it('updates memory content', async () => {
    sm.supabaseFrom.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { id: 'm1', user_id: 'u1', content: 'Updated', mood: 'happy', tags: [], is_starred: true, source: 'manual', created_at: '2024-01-01', updated_at: '2024-06-15' },
                error: null,
              })),
            })),
          })),
        })),
      })),
    });

    const result = await updateTreeholeMemory('u1', 'm1', { content: 'Updated', mood: 'happy', isStarred: true });
    expect(result.ok).toBe(true);
    expect(result.data.content).toBe('Updated');
  });
});

describe('treehole-space-api: deleteTreeholeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty userId', async () => {
    const result = await deleteTreeholeMemory('', 'm1');
    expect(result.ok).toBe(false);
  });

  it('rejects empty memoryId', async () => {
    const result = await deleteTreeholeMemory('u1', '');
    expect(result.ok).toBe(false);
  });

  it('deletes memory successfully', async () => {
    sm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => makeDeleteQuery({ error: null, count: 1 })) });
    const result = await deleteTreeholeMemory('u1', 'm1');
    expect(result.ok).toBe(true);
  });

  it('returns not found when count is 0', async () => {
    sm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => makeDeleteQuery({ error: null, count: 0 })) });
    const result = await deleteTreeholeMemory('u1', 'm1');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('TREEHOLE_MEMORY_NOT_FOUND');
  });
});