import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { fetchOfflineOverview, OVERVIEW_DEFAULT_LIMIT } from '@/utils/api/overview-api.js';
import { logger } from '@/utils/logger.js';

// 模块级单例（同 useNews 惯例）：同一 SPA 会话内跨组件挂载保留状态，
// 使「点击过的卡片返回概览后不再展示」在会话内持续生效。
const items = ref([]);
const anchorTime = ref(null);
const anchorSource = ref('');
const isFirstLogin = ref(false);
const totalCount = ref(0);
const hasMore = ref(false);
const isLoading = ref(true);
const isLoadMore = ref(false);
const loadError = ref(null);
const dismissedKeys = ref(new Set());
const loadedUserId = ref('');
// 请求时序守卫：refresh 与 loadMore 并发时，只让最后一次请求的结果生效，
// 防止慢的旧响应把旧窗口数据拼进新列表（重复/错序）
let requestSeq = 0;

/**
 * 离线回顾智能概览
 * 锚点来源：authStore.offlineAnchorAt（updateOnlineStatus 首次刷新前的会话级快照）。
 * 首期无持久化阅读记录，点击过的卡片仅在当前会话内移除。
 */
export function useOfflineOverview() {
  const authStore = useAuthStore();

  const visibleItems = computed(() =>
    items.value.filter((item) => !dismissedKeys.value.has(`${item.type}:${item.id}`))
  );

  const offlineMs = computed(() => {
    if (!anchorTime.value) return 0;
    const then = new Date(anchorTime.value).getTime();
    if (!Number.isFinite(then)) return 0;
    return Math.max(0, Date.now() - then);
  });

  const offlineDays = computed(() => Math.floor(offlineMs.value / 86400000));

  const resetForUserChange = () => {
    items.value = [];
    dismissedKeys.value = new Set();
    anchorTime.value = null;
    anchorSource.value = '';
    isFirstLogin.value = false;
    totalCount.value = 0;
    hasMore.value = false;
  };

  const load = async ({ offset = 0, append = false } = {}) => {
    if (loadedUserId.value && authStore.userInfo?.id && loadedUserId.value !== authStore.userInfo.id) {
      resetForUserChange();
    }
    isLoading.value = !append;
    isLoadMore.value = append;
    loadError.value = null;
    const seq = ++requestSeq;

    try {
      // 等待初始化完成，确保锚点快照已捕获（与路由守卫共用同一去重 Promise）
      await authStore.initLoginState();
      if (!authStore.isLoggedIn) {
        if (seq !== requestSeq) return;
        loadError.value = '请先登录后再查看智能概览';
        return;
      }

      const result = await fetchOfflineOverview({
        anchor: authStore.offlineAnchorAt,
        limit: OVERVIEW_DEFAULT_LIMIT,
        offset
      });

      // 时序守卫：refresh 与 loadMore 并发时，慢的旧响应不得覆盖新结果
      if (seq !== requestSeq) return;

      loadedUserId.value = authStore.userInfo.id || '';
      anchorTime.value = result.anchor;
      anchorSource.value = result.anchorSource;
      isFirstLogin.value = result.isFirstLogin;
      totalCount.value = result.total;
      hasMore.value = result.hasMore;
      items.value = append ? items.value.concat(result.items) : result.items;
    } catch (error) {
      if (seq !== requestSeq) return; // 旧请求的失败同样不覆盖新状态
      logger.error('offline-overview', '加载离线概览失败', error);
      loadError.value = error?.message || '加载失败，请稍后重试';
      if (!append) items.value = [];
    } finally {
      // 只有最后一次请求有权收敛加载态，避免旧请求提前关闭新请求的 loading
      if (seq === requestSeq) {
        isLoading.value = false;
        isLoadMore.value = false;
      }
    }
  };

  const refresh = () => load();

  const loadMore = () => {
    if (hasMore.value && !isLoadMore.value && !isLoading.value) {
      load({ offset: items.value.length, append: true });
    }
  };

  const dismissItem = (item) => {
    if (!item) return;
    const key = `${item.type}:${item.id}`;
    if (dismissedKeys.value.has(key)) return;
    const next = new Set(dismissedKeys.value);
    next.add(key);
    dismissedKeys.value = next;
  };

  return {
    items,
    visibleItems,
    anchorTime,
    anchorSource,
    isFirstLogin,
    totalCount,
    hasMore,
    offlineDays,
    isLoading,
    isLoadMore,
    loadError,
    load,
    refresh,
    loadMore,
    dismissItem
  };
}
