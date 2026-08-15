import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildForumFeedSnapshotKey,
  clearForumFeedSnapshots,
  readForumFeedSnapshot,
  writeForumFeedSnapshot
} from '../../src/utils/forum-feed-cache.js';

const createStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: vi.fn((index) => Array.from(values.keys())[index] || null),
    getItem: vi.fn((key) => values.get(key) || null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn((key) => values.delete(key))
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('forum-feed-cache', () => {
  it('keeps filter variants isolated', () => {
    const latest = buildForumFeedSnapshotKey({ sortMode: 'latest' });
    const hottest = buildForumFeedSnapshotKey({ sortMode: 'hottest' });
    expect(latest).not.toBe(hottest);
  });

  it('stores and restores a feed snapshot', () => {
    vi.stubGlobal('sessionStorage', createStorage());
    const key = buildForumFeedSnapshotKey({ userId: 'u1' });
    expect(writeForumFeedSnapshot(key, {
      posts: [{ id: 'p1' }],
      currentPage: 2,
      hasMoreData: true
    })).toBe(true);
    expect(readForumFeedSnapshot(key)?.posts).toEqual([{ id: 'p1' }]);
  });

  it('drops expired snapshots', () => {
    const storage = createStorage();
    vi.stubGlobal('sessionStorage', storage);
    const key = buildForumFeedSnapshotKey({ userId: 'u1' });
    storage.setItem(key, JSON.stringify({ savedAt: 1, posts: [{ id: 'old' }] }));
    expect(readForumFeedSnapshot(key, 3 * 60 * 1000)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(key);
  });

  it('clears every forum feed snapshot while preserving unrelated session data', () => {
    const storage = createStorage();
    vi.stubGlobal('sessionStorage', storage);
    const firstKey = buildForumFeedSnapshotKey({ userId: 'u1' });
    const secondKey = buildForumFeedSnapshotKey({ userId: 'u2', tagFilter: 'daily' });
    storage.setItem(firstKey, JSON.stringify({ posts: [] }));
    storage.setItem(secondKey, JSON.stringify({ posts: [] }));
    storage.setItem('boh_forum_return_state:forum', JSON.stringify({ scrollY: 400 }));

    expect(clearForumFeedSnapshots()).toBe(true);
    expect(storage.getItem(firstKey)).toBeNull();
    expect(storage.getItem(secondKey)).toBeNull();
    expect(storage.getItem('boh_forum_return_state:forum')).not.toBeNull();
  });
});
