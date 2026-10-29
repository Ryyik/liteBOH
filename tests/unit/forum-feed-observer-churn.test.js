/**
 * 发帖进度 tick → 虚拟列表 observer 重建次数的守卫（性能，确定性计数）
 *
 * 背景（2026-10-29）：发布进度 ticker 每 300ms 写一次进度，`updateOptimisticPost`
 * 把 `forumData`（shallowRef）换成**新数组引用**。旧实现 `watch(visibleForumPosts)`
 * 按数组引用比较 ⇒ 每次 tick 都 `disconnect()` + `querySelectorAll(≤50 节点)` +
 * 重新 `observe` 一遍，并把 nextTick 队列排满。用户感受就是发帖时「整页一阵一阵地卡」。
 *
 * 这里不看源码、不读字符串 —— 直接实例化**真实的 composable**，用可计数的
 * IntersectionObserver / querySelectorAll 桩统计「一次发布过程中 observer 重建了几次」。
 * 判据是**计数**而非耗时，所以不会因为机器快慢抖动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';

const makePosts = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `post-${index}`,
    title: `标题 ${index}`,
    body: '正文',
    images: [],
  }));

/** 把下一次微任务队列彻底抽干：setupForumWindowObserver 里有两级 nextTick。 */
const flushAll = async () => {
  for (let i = 0; i < 6; i += 1) await nextTick();
};

describe('forum feed observer churn（发帖进度不应重建 observer）', () => {
  let observerConstructions;
  let observeCalls;
  let scope;

  beforeEach(() => {
    observerConstructions = 0;
    observeCalls = 0;

    const nodes = Array.from({ length: 50 }, (_, index) => ({
      dataset: { forumVirtualIndex: String(index) },
    }));
    scope = { querySelectorAll: vi.fn(() => nodes) };

    class FakeIntersectionObserver {
      constructor() {
        observerConstructions += 1;
      }
      observe() {
        observeCalls += 1;
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }

    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    // setupForumWindowObserver 开头有 `typeof window === 'undefined'` 早退
    vi.stubGlobal('window', { innerHeight: 844 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const mountFeed = async (postCount = 60) => {
    const { useForumVirtualFeed } =
      await import('../../src/views/Forum/composables/useForumVirtualFeed.js');
    const forumData = shallowRef(makePosts(postCount));
    const feed = useForumVirtualFeed({
      feedMode: ref('posts'),
      forumData,
      forumPageRef: ref(scope),
      loadMoreSentinelRef: ref(null),
      isLoading: ref(false),
      isLoadingMore: ref(false),
      hasMoreData: ref(false),
      getScrollContainer: () => null,
      onLoadMore: () => {},
    });
    await flushAll();
    // 首次建 observer 不由 watch 触发（watch 无 immediate）；真实页里是 ForumMain 的
    // onMounted 调 setupForumWindowObserverOnce()。这里照样调一次，模拟挂载完成态。
    feed.setupForumWindowObserverOnce();
    await flushAll();
    return { feed, forumData };
  };

  it('60 帖（已虚拟化）挂载后只建 1 次 observer', async () => {
    await mountFeed(60);
    expect(observerConstructions).toBe(1);
    expect(scope.querySelectorAll).toHaveBeenCalledTimes(1);
    expect(observeCalls).toBe(50);
  });

  it('33 次进度 tick（同 id、只换对象/进度）一次都不重建', async () => {
    const { forumData } = await mountFeed(60);
    expect(observerConstructions).toBe(1);

    const before = {
      constructions: observerConstructions,
      queries: scope.querySelectorAll.mock.calls.length,
    };

    // 复刻 updateOptimisticPost 的写入形态：整列换新数组 + 目标帖换新对象
    for (let tick = 1; tick <= 33; tick += 1) {
      const next = forumData.value.map((post, index) =>
        index === 0 ? { ...post, _progress: tick, _publishState: 'uploading' } : post,
      );
      forumData.value = next;
      await flushAll();
    }

    expect(observerConstructions - before.constructions).toBe(0);
    expect(scope.querySelectorAll.mock.calls.length - before.queries).toBe(0);
  });

  it('真的插帖（id 序列变化）仍然重建，且只重建 1 次', async () => {
    const { forumData } = await mountFeed(60);
    const baseline = observerConstructions;

    forumData.value = [{ id: 'post-new', title: '新帖', body: '', images: [] }, ...forumData.value];
    await flushAll();

    expect(observerConstructions - baseline).toBe(1);
  });

  it('上下翻窗（窗口区间变化）仍然重建', async () => {
    const { feed } = await mountFeed(60);
    const baseline = observerConstructions;

    feed.activeForumWindowIndex.value = 30;
    await flushAll();

    expect(observerConstructions - baseline).toBe(1);
  });

  it('乐观卡换成真实卡（同位置 id 变化）仍然重建', async () => {
    const { forumData } = await mountFeed(60);
    const baseline = observerConstructions;

    forumData.value = forumData.value.map((post, index) =>
      index === 0 ? { ...post, id: 'real-post-id' } : post,
    );
    await flushAll();

    expect(observerConstructions - baseline).toBe(1);
  });
});
