import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useForumVirtualFeed } from '../../src/views/Forum/composables/useForumVirtualFeed.js';

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
      onLoadMore: () => {}
    });
    expect(feed.shouldVirtualizeForumFeed.value).toBe(true);
    expect(feed.visibleForumPosts.value).toHaveLength(30);
    expect(feed.virtualFeedBottomSpacerHeight.value).toBe(3300);
  });

  it('renders the full result for short feeds', () => {
    const forumData = ref([{ id: 1 }, { id: 2 }]);
    const feed = useForumVirtualFeed({
      feedMode: ref('posts'), forumData, forumPageRef: ref(null), loadMoreSentinelRef: ref(null),
      isLoading: ref(false), isLoadingMore: ref(false), hasMoreData: ref(true),
      getScrollContainer: () => null, onLoadMore: () => {}
    });
    expect(feed.shouldVirtualizeForumFeed.value).toBe(false);
    expect(feed.visibleForumPosts.value).toEqual(forumData.value);
  });
});
