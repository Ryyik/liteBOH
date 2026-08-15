const CACHE_PREFIX = 'boh_forum_feed_snapshot_v1';
const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_SNAPSHOT_POSTS = 40;

const getStorage = () => {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
};

export function buildForumFeedSnapshotKey(filters = {}) {
  const normalized = {
    userId: String(filters.userId || 'guest'),
    viewMode: String(filters.viewMode || 'all'),
    sortMode: String(filters.sortMode || 'latest'),
    searchKeyword: String(filters.searchKeyword || '').trim(),
    tagFilter: String(filters.tagFilter || '').trim(),
    followingOnly: Boolean(filters.followingOnly)
  };
  return `${CACHE_PREFIX}:${encodeURIComponent(JSON.stringify(normalized))}`;
}

export function readForumFeedSnapshot(key, now = Date.now()) {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.posts) || now - Number(parsed.savedAt || 0) > CACHE_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeForumFeedSnapshot(key, snapshot = {}) {
  try {
    const storage = getStorage();
    if (!storage || !key) return false;
    storage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      posts: (Array.isArray(snapshot.posts) ? snapshot.posts : []).slice(0, MAX_SNAPSHOT_POSTS),
      currentPage: Math.max(1, Number(snapshot.currentPage || 1)),
      nextPageCursor: String(snapshot.nextPageCursor || ''),
      hasMoreData: Boolean(snapshot.hasMoreData)
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearForumFeedSnapshots() {
  try {
    const storage = getStorage();
    if (!storage) return false;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(`${CACHE_PREFIX}:`)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    return true;
  } catch {
    return false;
  }
}
