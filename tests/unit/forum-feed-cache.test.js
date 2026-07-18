import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildForumFeedSnapshotKey,
  readForumFeedSnapshot,
  writeForumFeedSnapshot
} from '../../src/utils/forum-feed-cache.js';

const createStorage = () => {
  const values = new Map();
  return {
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
});
