import { computed, nextTick, ref, watch } from 'vue';

const VIRTUAL_FEED_MIN_COUNT = 40;
const VIRTUAL_FEED_BEFORE = 20;
const VIRTUAL_FEED_AFTER = 30;
const VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT = 300;

export function useForumVirtualFeed({
  feedMode,
  forumData,
  forumPageRef,
  loadMoreSentinelRef,
  isLoading,
  isLoadingMore,
  hasMoreData,
  getScrollContainer,
  onLoadMore
}) {
  const activeForumWindowIndex = ref(0);
  let forumLoadMoreObserver = null;
  let forumWindowObserver = null;
  let forumWindowObserverAborted = false;
  let forumWindowObserverPending = false;

  const shouldVirtualizeForumFeed = computed(() => (
    feedMode.value === 'posts' && forumData.value.length > VIRTUAL_FEED_MIN_COUNT
  ));
  const virtualFeedStartIndex = computed(() => (
    shouldVirtualizeForumFeed.value ? Math.max(0, activeForumWindowIndex.value - VIRTUAL_FEED_BEFORE) : 0
  ));
  const virtualFeedEndIndex = computed(() => (
    shouldVirtualizeForumFeed.value
      ? Math.min(forumData.value.length, activeForumWindowIndex.value + VIRTUAL_FEED_AFTER)
      : forumData.value.length
  ));
  const visibleForumPosts = computed(() => forumData.value.slice(
    virtualFeedStartIndex.value,
    virtualFeedEndIndex.value
  ));
  const virtualFeedTopSpacerHeight = computed(() => (
    shouldVirtualizeForumFeed.value ? virtualFeedStartIndex.value * VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT : 0
  ));
  const virtualFeedBottomSpacerHeight = computed(() => (
    shouldVirtualizeForumFeed.value
      ? Math.max(0, forumData.value.length - virtualFeedEndIndex.value) * VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT
      : 0
  ));
  const getVisiblePostIndex = (visibleIndex) => virtualFeedStartIndex.value + visibleIndex;

  const cleanupForumLoadMoreObserver = () => {
    forumLoadMoreObserver?.disconnect();
    forumLoadMoreObserver = null;
  };

  const setupForumLoadMoreObserver = async () => {
    if (typeof window === 'undefined') return;
    await nextTick();
    // stop() 可能发生在 nextTick 挂起期间，卸载后不得重建 observer（与 window observer 的守卫对称）
    if (forumWindowObserverAborted) return;
    cleanupForumLoadMoreObserver();
    const sentinel = loadMoreSentinelRef.value;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const root = getScrollContainer();
    forumLoadMoreObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && feedMode.value === 'posts'
        && !isLoading.value && !isLoadingMore.value && hasMoreData.value) {
        onLoadMore();
      }
    }, {
      root: root && root !== window ? root : null,
      rootMargin: '800px 0px',
      threshold: 0.01
    });
    forumLoadMoreObserver.observe(sentinel);
  };

  const cleanupForumWindowObserver = () => {
    forumWindowObserver?.disconnect();
    forumWindowObserver = null;
  };

  const setupForumWindowObserver = async () => {
    if (typeof window === 'undefined') return;
    await nextTick();
    cleanupForumWindowObserver();
    if (!shouldVirtualizeForumFeed.value || typeof IntersectionObserver === 'undefined') {
      activeForumWindowIndex.value = Math.min(activeForumWindowIndex.value, Math.max(0, forumData.value.length - 1));
      return;
    }
    const root = getScrollContainer();
    forumWindowObserver = new IntersectionObserver((entries) => {
      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => ({
          index: Number(entry.target?.dataset?.forumVirtualIndex || 0),
          distance: Math.abs(entry.boundingClientRect.top - ((root && root !== window) ? root.clientHeight : window.innerHeight) / 2)
        }))
        .sort((a, b) => a.distance - b.distance);
      if (visibleEntries.length) activeForumWindowIndex.value = visibleEntries[0].index;
    }, {
      root: root && root !== window ? root : null,
      rootMargin: '900px 0px',
      threshold: 0.01
    });
    const scope = forumPageRef.value || document;
    scope.querySelectorAll('[data-forum-virtual-index]').forEach((element) => forumWindowObserver.observe(element));
  };

  const setupForumWindowObserverOnce = () => {
    if (forumWindowObserverPending) return;
    forumWindowObserverPending = true;
    nextTick(() => {
      forumWindowObserverPending = false;
      if (!forumWindowObserverAborted) setupForumWindowObserver();
    });
  };

  watch(visibleForumPosts, setupForumWindowObserverOnce, { flush: 'post' });

  const stop = () => {
    forumWindowObserverAborted = true;
    cleanupForumLoadMoreObserver();
    cleanupForumWindowObserver();
  };

  return {
    activeForumWindowIndex,
    shouldVirtualizeForumFeed,
    visibleForumPosts,
    virtualFeedTopSpacerHeight,
    virtualFeedBottomSpacerHeight,
    getVisiblePostIndex,
    setupForumLoadMoreObserver,
    setupForumWindowObserver,
    setupForumWindowObserverOnce,
    cleanupForumLoadMoreObserver,
    cleanupForumWindowObserver,
    stop
  };
}
