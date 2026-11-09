import { computed, ref } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { dataConfig, tabs } from '../config.js';
import { TAB_SEARCH_FIELDS, TAB_SELECT_COLUMNS } from '../query-config.js';
import {
  buildSearchFilters as buildSearchFiltersUtil,
  getSearchablePreviewFields as getSearchablePreviewFieldsUtil,
} from './useDataAdminFilters.js';
import { findMatchedField, groupByTab, normalizeKeyword } from '@/utils/search-core.js';

/** 单表单次取多少条（plans/042 C6：原 5 条太少，合并后容易漏掉更相关的行） */
const PER_TAB_LIMIT = 8;
/** 合并后最多展示多少条 */
const MERGED_LIMIT = 50;
/** 输入去抖：与列表搜索同一个量级，避免每敲一个字打 N 张表 */
const DEBOUNCE_MS = 250;

/**
 * 跨表搜索（plans/042 A1 / C2）。
 *
 * 与列表搜索**共用同一个关键词**（searchQueryRef）和同一个转义口径，
 * 不再有自己的输入框与 globalSearchQuery —— 那正是「同一关键词四种结论」的来源之一。
 * 结果合并后按相关性统一排序，而不是按 tabs 的声明顺序拼接。
 */
export const createGlobalSearchCenter = ({
  searchQueryRef,
  showToast,
  buildActionErrorMessage,
  switchTab,
  addRecentRecord,
}) => {
  const globalSearchResults = ref([]);
  const isGlobalSearching = ref(false);
  const showGlobalSearchPanel = ref(false);
  const globalSearchKeyword = ref('');
  let abortController = null;
  let debounceTimer = null;

  /** 结果按表分组（A1 的分组视图；items 已按相关性排好） */
  const globalSearchGroups = computed(() => groupByTab(globalSearchResults.value));

  const runGlobalSearch = async (rawKeyword) => {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const signal = abortController.signal;

    const keyword = normalizeKeyword(rawKeyword ?? searchQueryRef.value);
    globalSearchKeyword.value = keyword;
    if (!keyword) {
      globalSearchResults.value = [];
      showGlobalSearchPanel.value = false;
      return;
    }

    isGlobalSearching.value = true;
    showGlobalSearchPanel.value = true;
    globalSearchResults.value = [];

    try {
      const tasks = tabs.map(async (tab) => {
        if (signal.aborted) return [];
        const table = dataConfig[tab.id]?.table;
        const selectColumns = TAB_SELECT_COLUMNS[tab.id];
        const filters = buildSearchFiltersUtil(tab.id, keyword, TAB_SEARCH_FIELDS);
        if (!table || !selectColumns || filters.length === 0) return [];

        let query = supabase
          .from(table)
          .select(selectColumns, { signal })
          .or(filters.join(','))
          .limit(PER_TAB_LIMIT);

        if (tab.id === 'reportedPosts') query = query.eq('status', 'limited');
        if (tab.id === 'reviewPosts') query = query.ilike('status', 'rejected');
        if (tab.id === 'reviewComments') query = query.ilike('status', 'rejected');

        const { data, error } = await query;
        if (error) {
          logger.warn('data-admin', `跨表搜索 ${tab.id} 失败:`, error);
          return [];
        }

        return (Array.isArray(data) ? data : []).map((row) => {
          const fields = TAB_SEARCH_FIELDS[tab.id] || [];
          const matched = findMatchedField(row, keyword, fields);
          const previewFields = getSearchablePreviewFieldsUtil(
            tab.id,
            dataConfig,
            TAB_SEARCH_FIELDS,
          );
          // 预览优先用「真正命中的那一列」，否则退回任何非空可读列
          const preview =
            (matched && row?.[matched.column]) ||
            previewFields.map((field) => row?.[field]).find((value) => value) ||
            row.title ||
            row.username ||
            row.content ||
            row.id;
          return {
            tabId: tab.id,
            tabLabel: tab.label,
            id: row.id,
            title: String(
              row.title ||
                row.username ||
                row.plan_name ||
                row.prize_title ||
                row.gift_content ||
                row.id ||
                '',
            ).slice(0, 80),
            preview: String(preview || '').slice(0, 160),
            matchedColumn: matched?.column || '',
            score: matched?.score || 0,
            row,
          };
        });
      });

      const settled = await Promise.allSettled(tasks);
      if (signal.aborted) return;
      // 合并后统一排序：原来的 flatMap 是按 tabs 声明顺序拼的，等于没有排序
      const merged = settled.flatMap((entry) => (entry.status === 'fulfilled' ? entry.value : []));
      merged.sort((a, b) => b.score - a.score);
      globalSearchResults.value = merged.slice(0, MERGED_LIMIT);
    } catch (error) {
      if (signal.aborted) return;
      logger.error('data-admin', '跨表搜索失败:', error);
      showToast('跨表搜索失败: ' + buildActionErrorMessage(error, '跨表搜索失败'), 'error');
    } finally {
      if (!signal.aborted) isGlobalSearching.value = false;
    }
  };

  /** 输入即搜（去抖）；同一时刻只有最后一次输入会真正发请求 */
  const scheduleGlobalSearch = (rawKeyword) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runGlobalSearch(rawKeyword);
    }, DEBOUNCE_MS);
  };

  const openGlobalSearchResult = (result) => {
    if (!result?.tabId) return;
    addRecentRecord(result.row || { id: result.id, title: result.title }, result.tabId);
    switchTab(result.tabId, { search: String(result.id || globalSearchKeyword.value) });
    closeGlobalSearchPanel();
  };

  const closeGlobalSearchPanel = () => {
    showGlobalSearchPanel.value = false;
    globalSearchResults.value = [];
  };

  const abortGlobalSearch = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (abortController) abortController.abort();
  };

  return {
    globalSearchKeyword,
    globalSearchResults,
    globalSearchGroups,
    isGlobalSearching,
    showGlobalSearchPanel,
    runGlobalSearch,
    scheduleGlobalSearch,
    openGlobalSearchResult,
    closeGlobalSearchPanel,
    abortGlobalSearch,
  };
};
