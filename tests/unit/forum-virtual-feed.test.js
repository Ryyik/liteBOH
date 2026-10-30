import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  resolveWindowIndexFromScroll,
  useForumVirtualFeed,
} from '../../src/views/Forum/composables/useForumVirtualFeed.js';

describe('forum virtual feed', () => {
  it('keeps a bounded window once the feed becomes large', () => {
    const feedMode = ref('posts');
    const forumData = ref(Array.from({ length: 41 }, (_, index) => ({ id: index })));
    const feed = useForumVirtualFeed({
      feedMode,
      forumData,
      forumPageRef: ref(null),
      loadMoreSentinelRef: ref(null),
      isLoading: ref(false),
      isLoadingMore: ref(false),
      hasMoreData: ref(true),
      getScrollContainer: () => null,
      onLoadMore: () => {},
    });
    expect(feed.shouldVirtualizeForumFeed.value).toBe(true);
    expect(feed.visibleForumPosts.value).toHaveLength(30);
    expect(feed.virtualFeedBottomSpacerHeight.value).toBe(3300);
  });

  it('renders the full result for short feeds', () => {
    const forumData = ref([{ id: 1 }, { id: 2 }]);
    const feed = useForumVirtualFeed({
      feedMode: ref('posts'),
      forumData,
      forumPageRef: ref(null),
      loadMoreSentinelRef: ref(null),
      isLoading: ref(false),
      isLoadingMore: ref(false),
      hasMoreData: ref(true),
      getScrollContainer: () => null,
      onLoadMore: () => {},
    });
    expect(feed.shouldVirtualizeForumFeed.value).toBe(false);
    expect(feed.visibleForumPosts.value).toEqual(forumData.value);
  });
});

/* 2026-10-30 P1-3：跳跃滚动兜底的换算函数。
   这些用例锁的是「索引必须落在视口中心附近」与「边界不许越界」——
   浏览器侧的行为断言在 scripts/probes/probe-forum-virtual-jump.mjs。 */
describe('resolveWindowIndexFromScroll', () => {
  const H = 300; // 必须等于 VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT（spacer 与换算同源）

  it('视口中心对应第几条：scrollTop 0 时落在首屏中部', () => {
    expect(resolveWindowIndexFromScroll({ scrollTop: 0, viewportHeight: 900, total: 50 })).toBe(
      Math.floor(450 / H),
    );
  });

  it('拖到底部时索引推进到末尾附近（不是 0）', () => {
    // 50 条 × 300 = 15000，视口 900 ⇒ 底部 scrollTop = 14100。
    // 视口中心 14100+450 = 14550 ⇒ floor(14550/300) = 48（离末尾 49 差 1，
    // 因为视口中心落在最后一条的中点之上，属预期，不是越界）。
    const index = resolveWindowIndexFromScroll({
      scrollTop: 14100,
      viewportHeight: 900,
      total: 50,
    });
    expect(index).toBe(48);
    // 真正的判据是「窗口必须覆盖到末尾」：endIndex = min(total, idx + AFTER=30) === total
    expect(Math.min(50, index + 30)).toBe(50);
  });

  it('越界夹紧：超大 scrollTop 不许超过总数-1', () => {
    expect(resolveWindowIndexFromScroll({ scrollTop: 9e9, viewportHeight: 900, total: 50 })).toBe(
      49,
    );
  });

  it('空列表返回 0（不得返回 -1 让 slice 拿到倒序）', () => {
    expect(resolveWindowIndexFromScroll({ scrollTop: 5000, viewportHeight: 900, total: 0 })).toBe(
      0,
    );
  });

  it('非法入参归零而不是 NaN（NaN 会让窗口落空 → 整屏空白）', () => {
    const index = resolveWindowIndexFromScroll({
      scrollTop: Number.NaN,
      viewportHeight: undefined,
      total: 50,
    });
    expect(Number.isFinite(index)).toBe(true);
    expect(index).toBe(0);
  });
});
