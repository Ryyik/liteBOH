import { beforeEach, describe, expect, it, vi } from 'vitest';

/* P3-3（2026-10-30）：`quotedPostCache` 原先是裸 `Map` —— 无上限、无淘汰、会话级存活。
   长会话里翻得越久记得越多且永不释放。改成 LRU（上限 200）。

   为什么不是「超限就 clear()」：这个缓存**刻意**存 null（表示「查过了，确认拿不到」，
   用于防重复查询）。整表清空会让已确认查不到的 id 重新发请求，反而制造流量。

   ⚠️ 测试要点：内存态 Map 是模块级的，`vi.resetModules()` + 动态 import 才能拿到
   干净实例，否则前一条用例灌进去的 200 个 key 会污染下一条。 */

const fm = vi.hoisted(() => ({ fromMock: vi.fn(), warn: vi.fn() }));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: { from: fm.fromMock },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: fm.warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/utils/api/notifications-api.js', () => ({
  createNotification: vi.fn(),
  sendPushplusForNotification: vi.fn(),
}));

vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  writeModerationAuditLog: vi.fn(),
}));

/** 拿一个「缓存为空」的模块实例。 */
async function freshShared() {
  vi.resetModules();
  return await import('../../src/utils/api/forum/_shared.js');
}

function mockPostsTable(rows = []) {
  const q = {
    select: vi.fn(() => q),
    in: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  fm.fromMock.mockReturnValue(q);
  return q;
}

const ids = (from, count) => Array.from({ length: count }, (_, i) => `p${from + i}`);

describe('quotedPostCache LRU 上限（P3-3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('上限内的条目命中时不重复发请求', async () => {
    const { fetchQuotedPostsByIds } = await freshShared();
    mockPostsTable([]);

    await fetchQuotedPostsByIds(ids(0, 10));
    expect(fm.fromMock).toHaveBeenCalledTimes(1);

    fm.fromMock.mockClear();
    await fetchQuotedPostsByIds(ids(0, 10));
    expect(fm.fromMock).not.toHaveBeenCalled();
  });

  it('「查不到」的 id 也缓存（null 语义，不得反复重查）', async () => {
    const { fetchQuotedPostsByIds } = await freshShared();
    mockPostsTable([]);

    const first = await fetchQuotedPostsByIds(['missing-1']);
    expect(first.get('missing-1')).toBeNull();

    fm.fromMock.mockClear();
    await fetchQuotedPostsByIds(['missing-1']);
    expect(fm.fromMock).not.toHaveBeenCalled();
  });

  it('灌满上限后继续写，最旧的条目被淘汰', async () => {
    const { fetchQuotedPostsByIds } = await freshShared();
    mockPostsTable([]);

    await fetchQuotedPostsByIds(ids(0, 200)); // 刚好到上限
    await fetchQuotedPostsByIds(['overflow-1']); // 201 条 ⇒ 淘汰 p0

    fm.fromMock.mockClear();
    await fetchQuotedPostsByIds(['overflow-1']);
    expect(fm.fromMock).not.toHaveBeenCalled();

    // p0 已被淘汰 ⇒ 需要重新查
    await fetchQuotedPostsByIds(['p0']);
    expect(fm.fromMock).toHaveBeenCalledTimes(1);
  });

  it('命中会刷新 LRU 顺序：刚访问过的不被优先淘汰', async () => {
    const { fetchQuotedPostsByIds } = await freshShared();
    mockPostsTable([]);

    await fetchQuotedPostsByIds(ids(0, 200));
    await fetchQuotedPostsByIds(['p0']); // 刷新 p0 到队尾
    await fetchQuotedPostsByIds(['overflow-1']); // ⇒ 淘汰 p1（不是 p0）

    fm.fromMock.mockClear();
    await fetchQuotedPostsByIds(['p0']);
    expect(fm.fromMock).not.toHaveBeenCalled();

    await fetchQuotedPostsByIds(['p1']);
    expect(fm.fromMock).toHaveBeenCalledTimes(1);
  });

  it('getCachedQuotedPost 对未命中和「命中 null」都返回 null', async () => {
    const { fetchQuotedPostsByIds, getCachedQuotedPost } = await freshShared();
    mockPostsTable([]);

    expect(getCachedQuotedPost('never-queried')).toBeNull();

    await fetchQuotedPostsByIds(['missing-2']);
    expect(getCachedQuotedPost('missing-2')).toBeNull();
    expect(getCachedQuotedPost('')).toBeNull();
    expect(getCachedQuotedPost(null)).toBeNull();
  });
});
