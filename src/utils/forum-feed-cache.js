/**
 * 论坛 feed 会话快照（首屏「先渲染、后刷新」的数据基座）。
 *
 * ── 2026-11-14 两项调整（实测见 scripts/probes/probe-forum-feed-causal.mjs）──
 * 1. **sessionStorage → localStorage**：会话快照原来关掉标签页就没了，
 *    只有「同一次会话内往返」才吃到。实测有快照的首帖 837ms、清掉快照 1335ms，
 *    **净收益 498ms**，而这条快路每天只走一次太浪费。
 * 2. **TTL 2min → 15min**：配合 localStorage 的持久性，让「当天第二次进站」也命中。
 *
 * ⚠️ 为什么敢放宽：这条路径天生是 stale-while-revalidate —— 命中快照后立刻
 * `fetchForumData(false, { background: true })` 拉真值覆盖（见 ForumMain.initializeForumData），
 * 快照只是把「白屏等数据」换成「先给上一版、随后静默校正」。所以 TTL 的语义是
 * 「最多陈旧这么久」，不是「内容保证新鲜」。
 *
 * ⚠️ 前缀升到 v2：旧 v1 快照存在 sessionStorage 里，语义（2min）与现在不同，
 * 直接沿用会让老标签页里的短期快照与新 TTL 混用。读取只认 v2，清理时两个前缀都扫。
 */
const CACHE_PREFIX = 'boh_forum_feed_snapshot_v2';
const LEGACY_PREFIXES = ['boh_forum_feed_snapshot_v1'];
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SNAPSHOT_POSTS = 40;

/* localStorage 优先（跨会话可用）；隐私模式/被禁时退 sessionStorage，
   两者都不可用返回 null（调用方按「没有快照」处理，不影响功能）。 */
const getStorage = () => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // Safari 隐私模式下访问 localStorage 会抛 —— 落回 sessionStorage
  }
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) return sessionStorage;
  } catch {
    return null;
  }
  return null;
};

const allStorages = () => {
  const list = [];
  try {
    if (typeof localStorage !== 'undefined' && localStorage) list.push(localStorage);
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) list.push(sessionStorage);
  } catch {
    /* ignore */
  }
  return list;
};

export function buildForumFeedSnapshotKey(filters = {}) {
  const normalized = {
    userId: String(filters.userId || 'guest'),
    viewMode: String(filters.viewMode || 'all'),
    sortMode: String(filters.sortMode || 'latest'),
    searchKeyword: String(filters.searchKeyword || '').trim(),
    tagFilter: String(filters.tagFilter || '').trim(),
    contentType: String(filters.contentType || '').trim(),
    followingOnly: Boolean(filters.followingOnly),
  };
  return `${CACHE_PREFIX}:${encodeURIComponent(JSON.stringify(normalized))}`;
}

export function readForumFeedSnapshot(key, now = Date.now()) {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      !Array.isArray(parsed.posts) ||
      now - Number(parsed.savedAt || 0) > CACHE_TTL_MS
    ) {
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
    storage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        posts: (Array.isArray(snapshot.posts) ? snapshot.posts : []).slice(0, MAX_SNAPSHOT_POSTS),
        currentPage: Math.max(1, Number(snapshot.currentPage || 1)),
        nextPageCursor: String(snapshot.nextPageCursor || ''),
        hasMoreData: Boolean(snapshot.hasMoreData),
      }),
    );
    return true;
  } catch {
    // 配额满 / 被禁：快照是纯优化，写不进去就算了
    return false;
  }
}

/** 清掉所有论坛 feed 快照（含 v1 遗留），不动同域其他数据。 */
export function clearForumFeedSnapshots() {
  const prefixes = [CACHE_PREFIX, ...LEGACY_PREFIXES];
  let touched = false;
  for (const storage of allStorages()) {
    try {
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && prefixes.some((prefix) => key.startsWith(`${prefix}:`))) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
      if (keys.length) touched = true;
    } catch {
      // 某个 storage 不可访问就跳过，继续清另一个
    }
  }
  return touched;
}
