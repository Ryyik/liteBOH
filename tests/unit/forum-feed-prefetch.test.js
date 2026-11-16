import { afterEach, describe, expect, it, vi } from 'vitest';

// A1「开场画期间预发首屏 feed」的三条不变量。
//
// 为什么值得锁：
//   ① 预发的唯一生效机制是 `request-core` 的 in-flight 去重，而它只认 params 的
//      **稳定序列化**（键名排序后 JSON.stringify）。预发与 ForumMain 的 params
//      差一个字段 ⇒ 不是"命中在途"，而是"多发一笔请求"，比不预发更糟。
//   ② 预发必须只覆盖**默认分区**（最新 / 无筛选 / keyset 首页）。关注、新闻、活动、
//      影集都会改参数，拿默认值去预发等于白打一笔。
//   ③ 预发本身不能抛（它跑在宿主组件的 setup 同步体里，抛了会连带整页白屏）。
//
// 反证：把 `buildForumFeedParams` 的 `limit` 默认值改成 `POSTS_PER_PAGE`
//       → 第 1 条必红（ForumMain 传的是 +1 的 overfetch 值）。

const { buildForumFeedParams, POSTS_PER_PAGE } =
  await import('../../src/views/Forum/forum-config.js');

describe('buildForumFeedParams：预发与首屏共用的唯一参数真源', () => {
  it('默认值等于 ForumMain 首次进入的形态', () => {
    const p = buildForumFeedParams();
    expect(p).toEqual({
      page: 1,
      pageSize: POSTS_PER_PAGE,
      sortMode: 'latest',
      searchQuery: '',
      tagFilter: '',
      kindFilter: '',
      albumOnly: false,
      cursorMode: 'keyset',
      cursor: '',
      signal: undefined,
      limit: POSTS_PER_PAGE + 1,
      includeUnapprovedForAuthor: false,
      followingUserIds: undefined,
    });
  });

  it('overfetch 与 keyset 是硬要求，不是可选项', () => {
    const p = buildForumFeedParams();
    // hasMore 判定依赖多取一条；keyset 决定走直连表而不是 RPC
    expect(p.limit).toBe(p.pageSize + 1);
    expect(p.cursorMode).toBe('keyset');
  });

  it('显式传参可覆盖（筛选用例不能靠默认值）', () => {
    const p = buildForumFeedParams({
      page: 3,
      sortMode: 'hottest',
      searchQuery: '方块',
      cursor: 'abc',
      albumOnly: true,
    });
    expect(p).toMatchObject({
      page: 3,
      sortMode: 'hottest',
      searchQuery: '方块',
      cursor: 'abc',
      albumOnly: true,
      cursorMode: 'keyset',
    });
  });
});

describe('ForumMain 只能用单源参数（防两处字面量漂移）', () => {
  it('分页对象由 buildForumFeedParams 构造', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const root = resolve(import.meta.dirname, '../..');
    const src = readFileSync(resolve(root, 'src/views/Forum/ForumMain.vue'), 'utf8');
    expect(src).toMatch(/const pagination = buildForumFeedParams\(\{/);
    expect(src).toMatch(/from '\.\/forum-config\.js'/);
  });
});

describe('prefetchForumFirstPage：只在默认分区、只发一笔、不抛', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('用单源参数发一笔，且带当前登录用户 id', async () => {
    const getPosts = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.doMock('@/utils/api/forum/post-api.js', () => ({ getPosts }));
    vi.doMock('@/stores/auth', () => ({
      useAuthStore: () => ({ isLoggedIn: true, userInfo: { id: 'user-1' } }),
    }));

    const { prefetchForumFirstPage } = await import('../../src/views/Forum/forum-feed-prefetch.js');
    const result = prefetchForumFirstPage();

    expect(getPosts).toHaveBeenCalledTimes(1);
    const [userId, params] = getPosts.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(params).toEqual(buildForumFeedParams());
    expect(result).toBeInstanceOf(Promise);
  });

  it('未登录时 userId 传 null（key 里是 guest）', async () => {
    const getPosts = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.doMock('@/utils/api/forum/post-api.js', () => ({ getPosts }));
    vi.doMock('@/stores/auth', () => ({
      useAuthStore: () => ({ isLoggedIn: false, userInfo: { id: 'stale' } }),
    }));

    const { prefetchForumFirstPage } = await import('../../src/views/Forum/forum-feed-prefetch.js');
    prefetchForumFirstPage();

    expect(getPosts.mock.calls[0][0]).toBeNull();
  });

  it('没有活跃 pinia 时返回 null 且不抛（setup 同步体里不能炸整页）', async () => {
    const getPosts = vi.fn();
    vi.doMock('@/utils/api/forum/post-api.js', () => ({ getPosts }));
    vi.doMock('@/stores/auth', () => ({
      useAuthStore: () => {
        throw new Error('no active pinia');
      },
    }));

    const { prefetchForumFirstPage } = await import('../../src/views/Forum/forum-feed-prefetch.js');
    expect(() => prefetchForumFirstPage()).not.toThrow();
    expect(prefetchForumFirstPage()).toBeNull();
    expect(getPosts).not.toHaveBeenCalled();
  });
});
