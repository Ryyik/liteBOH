/**
 * 「我的印象」数据层 —— 全站单一实现点。
 *
 * 这段逻辑原先自持在 `ForumSectionShell.vue` 里（那时印象是论坛的第 7 席）。2026-10-01
 * 按 plans/022 把印象搬进「我」页成为第三个分段，若再抄一份必然漂移，故抽成本 composable：
 *   · `ProfileImpressionsSection.vue`（我页「印象」分段）—— 唯一消费方
 *
 * 能力面与搬迁前完全一致（自持 TTL 缓存 / AbortController 取消 / 服务端分页增量 /
 * 5s 节流），没有顺手改口径。差异只有一处：删除结果不再自己弹 Alert，改为回调 `notify`，
 * 因为 Alert 弹窗的宿主是组件而非数据层（搬迁前也在同一个壳里，但现在两个宿主形态不同）。
 *
 * ⚠️ 缓存/节流状态是**模块级 Map 之外、实例级**的：本 composable 每次调用创建一份新的
 * cache 与 token，所以「我页印象分段」与将来可能的其它宿主互不干扰。这是刻意的 ——
 * 搬迁前它是组件级状态，语义一致。
 */

import { ref, shallowRef } from 'vue';
import { storeToRefs } from 'pinia';
import { deleteUserImpression, getUserImpressions } from '@/utils/api/profile-api.js';
import { useAuthStore } from '@/stores/auth';
import { logger } from '@/utils/logger.js';
import { createMemoryTtlCache } from './useMemoryTtlCache.js';

/** 单页条数：与搬迁前的常量同值，服务端分页口径不变 */
export const IMPRESSIONS_PAGE_SIZE = 30;
/** 内存缓存 TTL：与搬迁前一致 */
const USERSPACE_CACHE_TTL_IMPRESSIONS = 60 * 1000;
/** 重入节流窗口：5s 内重复进入不重复取数 */
const REENTRY_THROTTLE_MS = 5000;

/**
 * @param {object} [options]
 * @param {(type: string, title: string, message: string) => void} [options.notify]
 *        删除结果通知（success / error）。
 */
export function useProfileImpressions(options = {}) {
  const notify = typeof options.notify === 'function' ? options.notify : () => {};

  const authStore = useAuthStore();
  const { isLoggedIn, userInfo } = storeToRefs(authStore);

  const cache = createMemoryTtlCache();
  const profileImpressions = shallowRef([]);
  const impressionsLoading = ref(false);
  const impressionsHasMore = ref(false);
  const isLoadingMoreImpressions = ref(false);
  const impressionsPage = ref(1);
  let lastFetchAt = 0;
  let fetchToken = 0;
  let abortController = null;

  const cacheKey = (userId) => `profile-impressions:${userId}`;

  const abort = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  const fetchImpressions = async ({ force = false, loadMore = false } = {}) => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!isLoggedIn.value || !userId) {
      profileImpressions.value = [];
      impressionsHasMore.value = false;
      return;
    }

    const key = cacheKey(userId);
    const now = Date.now();

    // 「加载更多」：追加下一页，不读缓存、不受节流限制
    if (loadMore) {
      if (isLoadingMoreImpressions.value || !impressionsHasMore.value) return;
      const loadMoreToken = ++fetchToken;
      abort();
      abortController = new AbortController();
      const { signal } = abortController;
      isLoadingMoreImpressions.value = true;
      try {
        const nextPage = impressionsPage.value + 1;
        const { data, error } = await getUserImpressions(userId, {
          signal,
          page: nextPage,
          pageSize: IMPRESSIONS_PAGE_SIZE,
        });
        if (loadMoreToken !== fetchToken || signal.aborted) return;
        if (error) {
          logger.warn('profile-impressions', '加载更多印象失败:', error);
          return;
        }
        const rows = data || [];
        impressionsPage.value = nextPage;
        profileImpressions.value = [...profileImpressions.value, ...rows];
        impressionsHasMore.value = rows.length >= IMPRESSIONS_PAGE_SIZE;
      } catch (error) {
        if (error.name !== 'AbortError')
          logger.warn('profile-impressions', '加载更多印象异常:', error);
      } finally {
        if (loadMoreToken === fetchToken) isLoadingMoreImpressions.value = false;
      }
      return;
    }

    // 5s 内重复进入不重复取数：先吃内存缓存（与搬迁前的 lastFetchTime 节流同口径）
    if (!force && now - lastFetchAt < REENTRY_THROTTLE_MS) {
      const cached = cache.get(key, USERSPACE_CACHE_TTL_IMPRESSIONS);
      if (cached) {
        profileImpressions.value = cached;
        impressionsHasMore.value = cached.length >= IMPRESSIONS_PAGE_SIZE;
        impressionsLoading.value = false;
        return;
      }
    }

    if (!force) {
      const cached = cache.get(key, USERSPACE_CACHE_TTL_IMPRESSIONS);
      if (cached) {
        profileImpressions.value = cached;
        impressionsHasMore.value = cached.length >= IMPRESSIONS_PAGE_SIZE;
        impressionsLoading.value = false;
        return;
      }
    }

    const token = ++fetchToken;
    abort();
    abortController = new AbortController();
    const { signal } = abortController;
    impressionsLoading.value = true;
    try {
      const { data, error } = await getUserImpressions(userId, {
        signal,
        page: 1,
        pageSize: IMPRESSIONS_PAGE_SIZE,
      });
      if (token !== fetchToken || signal.aborted) return;
      if (error) {
        logger.warn('profile-impressions', '读取我的印象失败:', error);
        profileImpressions.value = [];
        return;
      }
      const rows = data || [];
      profileImpressions.value = rows;
      impressionsPage.value = 1;
      impressionsHasMore.value = rows.length >= IMPRESSIONS_PAGE_SIZE;
      cache.set(key, rows);
      lastFetchAt = now;
    } catch (error) {
      if (error.name === 'AbortError') return;
      logger.warn('profile-impressions', '读取我的印象异常:', error);
      profileImpressions.value = [];
    } finally {
      if (token === fetchToken) impressionsLoading.value = false;
    }
  };

  const loadMoreImpressions = () => {
    void fetchImpressions({ loadMore: true });
  };

  const handleDeleteImpression = async (impressionId) => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId) {
      notify('error', '删除失败', '当前登录状态异常，请刷新后重试');
      return;
    }
    try {
      const { error } = await deleteUserImpression(impressionId, userId);
      if (error) {
        notify('error', '删除失败', error.message || '请稍后重试');
        return;
      }
      profileImpressions.value = profileImpressions.value.filter((imp) => imp.id !== impressionId);
      cache.set(cacheKey(userId), profileImpressions.value);
      notify('success', '删除成功', '该印象已被移除');
    } catch (error) {
      logger.warn('profile-impressions', '删除我的印象异常:', error);
      notify('error', '删除失败', '网络错误');
    }
  };

  /** 离开宿主时调用：取消在途请求（缓存保留，回来仍走 TTL） */
  const dispose = () => {
    abort();
  };

  return {
    profileImpressions,
    impressionsLoading,
    impressionsHasMore,
    isLoadingMoreImpressions,
    fetchImpressions,
    loadMoreImpressions,
    handleDeleteImpression,
    dispose,
  };
}
