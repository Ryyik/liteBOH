import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildForumFeedSnapshotKey,
  clearForumFeedSnapshots,
  readForumFeedSnapshot,
  writeForumFeedSnapshot,
} from '../../src/utils/forum-feed-cache.js';

/* ⚠️ tests/setup.js 里的 localStorage 是**非可配置**的全局 mock（Object.defineProperty 无 writable/configurable），
   所以这里既不能 vi.stubGlobal('localStorage', …) 也不能 unstub —— 直接用 setup 那份，
   每例前 clear()。sessionStorage 没有预置，才可以 stub。 */
const createStorage = () => {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: vi.fn((index) => Array.from(values.keys())[index] || null),
    getItem: vi.fn((key) => values.get(key) || null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn((key) => values.delete(key)),
  };
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('forum-feed-cache', () => {
  it('keeps filter variants isolated', () => {
    const latest = buildForumFeedSnapshotKey({ sortMode: 'latest' });
    const hottest = buildForumFeedSnapshotKey({ sortMode: 'hottest' });
    expect(latest).not.toBe(hottest);
  });

  it('stores and restores a feed snapshot', () => {
    const key = buildForumFeedSnapshotKey({ userId: 'u1' });
    expect(
      writeForumFeedSnapshot(key, {
        posts: [{ id: 'p1' }],
        currentPage: 2,
        hasMoreData: true,
      }),
    ).toBe(true);
    expect(readForumFeedSnapshot(key)?.posts).toEqual([{ id: 'p1' }]);
  });

  /* 2026-11-14：快照从 sessionStorage 迁到 localStorage（跨会话可用），
     否则「关掉标签页再回来」这条最快的路永远走不到。 */
  it('persists in localStorage rather than sessionStorage', () => {
    const session = createStorage();
    vi.stubGlobal('sessionStorage', session);
    const key = buildForumFeedSnapshotKey({ userId: 'u1' });
    writeForumFeedSnapshot(key, { posts: [{ id: 'p1' }] });
    expect(localStorage.getItem(key)).toBeTruthy();
    expect(session.setItem).not.toHaveBeenCalled();
  });

  it('drops expired snapshots', () => {
    const key = buildForumFeedSnapshotKey({ userId: 'u1' });
    localStorage.setItem(key, JSON.stringify({ savedAt: 1, posts: [{ id: 'old' }] }));
    expect(readForumFeedSnapshot(key, 16 * 60 * 1000)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('keeps snapshots inside the widened 15-minute window', () => {
    const key = buildForumFeedSnapshotKey({ userId: 'u1' });
    localStorage.setItem(key, JSON.stringify({ savedAt: 0, posts: [{ id: 'recent' }] }));
    expect(readForumFeedSnapshot(key, 10 * 60 * 1000)?.posts).toEqual([{ id: 'recent' }]);
  });

  /* 配额满 / 隐私模式：快照是纯优化，写不进去只能返回 false，不能抛 */
  it('degrades quietly when the storage rejects writes', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const key = buildForumFeedSnapshotKey({ userId: 'u1' });
    expect(writeForumFeedSnapshot(key, { posts: [{ id: 'p1' }] })).toBe(false);
    // 读路径不能因为「从没写进去」就抛，只能当作没有快照
    expect(readForumFeedSnapshot(key)).toBeNull();
    // ⚠️ setup 里的 localStorage.setItem 本身就是 vi.fn，restoreAllMocks 不一定能还原，
    // 显式还原，否则后面的用例会踩到「一直在抛」的实现。
    setItemSpy.mockRestore();
  });

  it('clears every forum feed snapshot while preserving unrelated data', () => {
    const firstKey = buildForumFeedSnapshotKey({ userId: 'u1' });
    const secondKey = buildForumFeedSnapshotKey({ userId: 'u2', tagFilter: 'daily' });
    localStorage.setItem(firstKey, JSON.stringify({ posts: [] }));
    localStorage.setItem(secondKey, JSON.stringify({ posts: [] }));
    localStorage.setItem('boh_forum_return_state:forum', JSON.stringify({ scrollY: 400 }));

    expect(clearForumFeedSnapshots()).toBe(true);
    expect(localStorage.getItem(firstKey)).toBeNull();
    expect(localStorage.getItem(secondKey)).toBeNull();
    expect(localStorage.getItem('boh_forum_return_state:forum')).not.toBeNull();
  });

  /* 前缀升到 v2 后，老标签页里残留的 v1 快照必须一起清掉，
     否则它会以旧的 2 分钟语义继续被读到。 */
  it('purges legacy v1 snapshots from every storage', () => {
    const session = createStorage();
    vi.stubGlobal('sessionStorage', session);
    const legacyKey = 'boh_forum_feed_snapshot_v1:%7B%22userId%22%3A%22guest%22%7D';
    session.setItem(legacyKey, JSON.stringify({ posts: [{ id: 'legacy' }] }));

    expect(clearForumFeedSnapshots()).toBe(true);
    expect(session.getItem(legacyKey)).toBeNull();
  });
});
