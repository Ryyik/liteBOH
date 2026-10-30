import { computed, nextTick, ref, watch } from 'vue';

const VIRTUAL_FEED_MIN_COUNT = 40;
const VIRTUAL_FEED_BEFORE = 20;
const VIRTUAL_FEED_AFTER = 30;
const VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT = 300;

/**
 * 由滚动位置反推「窗口锚点应落在第几条」—— 只给**兜底**用（见 syncWindowFromScroll）。
 *
 * 为什么需要：窗口索引原本只由 `forumWindowObserver` 推进，而它 observe 的是
 * **已经在 DOM 里的卡片**。用户拖滚动条直达底部时，视口落在「底部 spacer」里，
 * 上方那批卡全部 isIntersecting=false ⇒ 没有任何 entry 能把索引推下去 ⇒
 * 整屏空白且不自愈（2026-10-30 探针 `probe-forum-virtual-jump` 实测：可见卡 = 0，
 * scrollTop 22877/23777）。这条纯函数把 scrollTop 换算成索引，是那个缺口的补丁。
 *
 * 口径与 spacer 严格自洽：spacer 用 `VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT` 撑高，
 * 这里就必须用同一个常量换算（换成实测高度会让「spacer 高度」与「索引换算」两套
 * 单位打架，表现为跳完再跳）。`cardHeight` 只为测试注入，生产不传。
 */
export function resolveWindowIndexFromScroll({
  scrollTop = 0,
  viewportHeight = 0,
  total = 0,
  cardHeight = VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT,
} = {}) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  if (!safeTotal) return 0;
  const h = Number(cardHeight) > 0 ? Number(cardHeight) : VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT;
  const center = (Number(scrollTop) || 0) + (Number(viewportHeight) || 0) / 2;
  const index = Math.floor(Math.max(0, center) / h);
  return Math.min(safeTotal - 1, Math.max(0, index));
}

export function useForumVirtualFeed({
  feedMode,
  forumData,
  forumPageRef,
  loadMoreSentinelRef,
  isLoading,
  isLoadingMore,
  hasMoreData,
  getScrollContainer,
  onLoadMore,
}) {
  const activeForumWindowIndex = ref(0);
  let forumLoadMoreObserver = null;
  let forumWindowObserver = null;
  let forumWindowObserverAborted = false;
  let forumWindowObserverPending = false;
  let scrollFallbackRoot = null;
  let scrollFallbackRaf = 0;

  const shouldVirtualizeForumFeed = computed(
    () => feedMode.value === 'posts' && forumData.value.length > VIRTUAL_FEED_MIN_COUNT,
  );
  const virtualFeedStartIndex = computed(() =>
    shouldVirtualizeForumFeed.value
      ? Math.max(0, activeForumWindowIndex.value - VIRTUAL_FEED_BEFORE)
      : 0,
  );
  const virtualFeedEndIndex = computed(() =>
    shouldVirtualizeForumFeed.value
      ? Math.min(forumData.value.length, activeForumWindowIndex.value + VIRTUAL_FEED_AFTER)
      : forumData.value.length,
  );
  const visibleForumPosts = computed(() =>
    forumData.value.slice(virtualFeedStartIndex.value, virtualFeedEndIndex.value),
  );
  const virtualFeedTopSpacerHeight = computed(() =>
    shouldVirtualizeForumFeed.value
      ? virtualFeedStartIndex.value * VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT
      : 0,
  );
  const virtualFeedBottomSpacerHeight = computed(() =>
    shouldVirtualizeForumFeed.value
      ? Math.max(0, forumData.value.length - virtualFeedEndIndex.value) *
        VIRTUAL_FEED_ESTIMATED_CARD_HEIGHT
      : 0,
  );
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
    forumLoadMoreObserver = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          feedMode.value === 'posts' &&
          !isLoading.value &&
          !isLoadingMore.value &&
          hasMoreData.value
        ) {
          onLoadMore();
        }
      },
      {
        root: root && root !== window ? root : null,
        rootMargin: '800px 0px',
        threshold: 0.01,
      },
    );
    forumLoadMoreObserver.observe(sentinel);
  };

  const cleanupForumWindowObserver = () => {
    forumWindowObserver?.disconnect();
    forumWindowObserver = null;
  };

  /* ── 跳跃滚动兜底（2026-10-30 P1-3）────────────────────────────────────
     窗口索引只由 observer 推进的漏洞：拖滚动条直达底部时视口落在底部 spacer 里，
     已渲染的卡全在上方 ⇒ 没有任何 intersecting entry ⇒ 索引不动 ⇒ 整屏空白。
     这里在**真实滚动容器**上挂一个 rAF 节流的监听，**只在「当前一张可见卡都没有」时**
     才按 scrollTop 反推索引 —— 正常滚动一律让位给 observer（它用真实可见卡，更准）。

     ⚠️ 为什么自己解析宿主、不信 `getScrollContainer()`：宿主传进来的那个函数在
     UserSpace 宿主下**恒回退 window** —— 它找 `.tab-page.posts-tab`，而实测真实
     滚动容器是 `.tab-page.community-shell`（2026-10-30 实测 tabPageExists=false、
     docScrollable=0、realScrollerScrollable=5637）。挂在 window 上的监听一次都不会
     触发，这正是第一版修复「单测绿、探针仍红」的原因。observer 那边靠 root=null
     （视口）也能工作，所以这个错位一直没暴露 ⇒ 别顺手去改 `getScrollContainer()`，
     那会动到 observer 的 root 语义（改它是另一件事）。 */
  const resolveScrollHost = () => {
    if (typeof window === 'undefined') return null;
    // 单测会把 window 桩成 { innerHeight } 这种裸对象（见 forum-feed-observer-churn），
    // 没有 getComputedStyle / addEventListener ⇒ 兜底直接放弃，不许抛。
    if (typeof window.getComputedStyle !== 'function') return null;
    const seeds = [loadMoreSentinelRef?.value, forumPageRef?.value];
    for (const seed of seeds) {
      let el = seed?.parentElement || null;
      while (el && el !== document.body) {
        const cs = window.getComputedStyle(el);
        if (
          ['auto', 'scroll', 'overlay'].includes(cs.overflowY) &&
          el.scrollHeight > el.clientHeight + 24
        ) {
          return el;
        }
        el = el.parentElement;
      }
    }
    const declared = getScrollContainer?.();
    return declared && declared !== window ? declared : null; // null ⇒ 用 window
  };

  const detachScrollFallback = () => {
    if (scrollFallbackRaf) {
      cancelAnimationFrame(scrollFallbackRaf);
      scrollFallbackRaf = 0;
    }
    scrollFallbackRoot?.removeEventListener?.('scroll', handleScrollFallback);
    scrollFallbackRoot = null;
  };

  const syncWindowFromScroll = () => {
    if (!shouldVirtualizeForumFeed.value) return;
    const host = resolveScrollHost();
    const scroller = host || null;
    const isWindow = !scroller;
    const scrollTop = isWindow ? window.scrollY : scroller.scrollTop;
    const viewportHeight = isWindow ? window.innerHeight : scroller.clientHeight;
    if (!viewportHeight) return;
    // 还有可见卡 ⇒ observer 正在正常工作，不要插手
    const viewTop =
      isWindow || typeof scroller.getBoundingClientRect !== 'function'
        ? 0
        : scroller.getBoundingClientRect().top;
    const scope = forumPageRef?.value || document;
    const hasVisibleCard = [...scope.querySelectorAll('[data-forum-virtual-index]')].some(
      (element) => {
        const rect = element.getBoundingClientRect();
        return rect.height > 0 && rect.bottom > viewTop && rect.top < viewTop + viewportHeight;
      },
    );
    if (hasVisibleCard) return;
    const next = resolveWindowIndexFromScroll({
      scrollTop,
      viewportHeight,
      total: forumData.value.length,
    });
    if (next !== activeForumWindowIndex.value) activeForumWindowIndex.value = next;
  };

  function handleScrollFallback() {
    if (scrollFallbackRaf) return;
    scrollFallbackRaf = requestAnimationFrame(() => {
      scrollFallbackRaf = 0;
      syncWindowFromScroll();
    });
  }

  const attachScrollFallback = () => {
    if (typeof window === 'undefined') return;
    if (!shouldVirtualizeForumFeed.value) {
      detachScrollFallback();
      return;
    }
    const target = resolveScrollHost() || window;
    // 宿主拿不到 addEventListener（jsdom 桩 / 非 DOM 宿主）⇒ 放弃兜底，不许抛：
    // 这条是「尽力而为」的补偿路径，不能因为它让整页挂掉。
    if (typeof target?.addEventListener !== 'function') return;
    if (scrollFallbackRoot === target) return; // 幂等：signature 变化会反复调到这里
    detachScrollFallback();
    scrollFallbackRoot = target;
    target.addEventListener('scroll', handleScrollFallback, { passive: true });
  };

  const setupForumWindowObserver = async () => {
    if (typeof window === 'undefined') return;
    await nextTick();
    // stop() 可能发生在 nextTick 挂起期间：卸载后不得再挂 scroll 兜底、也不得重建 observer。
    // 少了这条守卫，卸载后 attachScrollFallback 会给 window 补一个**永不释放**的 scroll 监听
    // （2026-10-30 复核实测：add=1 / remove=0）。与 setupForumLoadMoreObserver 的守卫对称。
    if (forumWindowObserverAborted) return;
    cleanupForumWindowObserver();
    // 兜底监听跟窗口同在：不虚拟化时它自己 detach（见 attachScrollFallback 内的分支）
    attachScrollFallback();
    if (!shouldVirtualizeForumFeed.value || typeof IntersectionObserver === 'undefined') {
      activeForumWindowIndex.value = Math.min(
        activeForumWindowIndex.value,
        Math.max(0, forumData.value.length - 1),
      );
      return;
    }
    const root = getScrollContainer();
    forumWindowObserver = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => ({
            index: Number(entry.target?.dataset?.forumVirtualIndex || 0),
            distance: Math.abs(
              entry.boundingClientRect.top -
                (root && root !== window ? root.clientHeight : window.innerHeight) / 2,
            ),
          }))
          .sort((a, b) => a.distance - b.distance);
        if (visibleEntries.length) activeForumWindowIndex.value = visibleEntries[0].index;
      },
      {
        root: root && root !== window ? root : null,
        rootMargin: '900px 0px',
        threshold: 0.01,
      },
    );
    const scope = forumPageRef.value || document;
    scope
      .querySelectorAll('[data-forum-virtual-index]')
      .forEach((element) => forumWindowObserver.observe(element));
  };

  const setupForumWindowObserverOnce = () => {
    if (forumWindowObserverPending) return;
    forumWindowObserverPending = true;
    nextTick(() => {
      forumWindowObserverPending = false;
      if (!forumWindowObserverAborted) setupForumWindowObserver();
    });
  };

  /* ⚠️ 不能按 visibleForumPosts 的**数组引用** watch：forumData 是 shallowRef，
     「发帖进度」每 300ms 一次 updateOptimisticPost 都会把数组换成新引用 ⇒
     visibleForumPosts 每次 slice 出的都是新数组 ⇒ observer 每 300ms 被
     disconnect + querySelectorAll + 重新 observe 一遍（≤50 个节点），
     并把 nextTick 队列排满。用户感受就是「发帖时整页一阵一阵地卡」。
     观察者真正要跟的是「渲染出来的卡片集合」：窗口区间 + 卡片 id 序列。
     进度 tick 不改变这两者（同一张卡只换对象）⇒ 不再重建；
     插入 / 删除 / 上下翻窗 / 乐观卡换真实卡（id 变）仍然触发。 */
  const visibleForumPostSignature = computed(
    () =>
      `${virtualFeedStartIndex.value}:${virtualFeedEndIndex.value}:${visibleForumPosts.value
        .map((post) => String(post?.id ?? ''))
        .join('|')}`,
  );

  watch(visibleForumPostSignature, setupForumWindowObserverOnce, { flush: 'post' });

  const stop = () => {
    forumWindowObserverAborted = true;
    detachScrollFallback();
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
    syncWindowFromScroll,
    stop,
  };
}
