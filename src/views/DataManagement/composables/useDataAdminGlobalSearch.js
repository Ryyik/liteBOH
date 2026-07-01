import { ref } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { dataConfig, tabs } from '../config.js';
import { TAB_SEARCH_FIELDS, TAB_SELECT_COLUMNS } from '../query-config.js';
import {
  buildSearchFilters as buildSearchFiltersUtil,
  getSearchablePreviewFields as getSearchablePreviewFieldsUtil,
  sanitizeSearchTerm
} from './useDataAdminFilters.js';

export const createGlobalSearchCenter = ({
  searchQueryRef,
  showToast,
  buildActionErrorMessage,
  switchTab,
  addRecentRecord
}) => {
  const globalSearchQuery = ref('');
  const globalSearchResults = ref([]);
  const isGlobalSearching = ref(false);
  const showGlobalSearchPanel = ref(false);
  let abortController = null;

  const runGlobalSearch = async () => {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    const keyword = sanitizeSearchTerm(globalSearchQuery.value || searchQueryRef.value);
    if (!keyword) {
      showToast('请输入跨表搜索关键词', 'error');
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
          .limit(5);

        if (tab.id === 'reportedPosts') query = query.eq('status', 'limited');
        if (tab.id === 'reviewPosts') query = query.ilike('status', 'rejected');
        if (tab.id === 'reviewComments') query = query.ilike('status', 'rejected');

        const { data, error } = await query;
        if (error) {
          logger.warn('data-admin', `跨表搜索 ${tab.id} 失败:`, error);
          return [];
        }

        return (Array.isArray(data) ? data : []).map((row) => {
          const previewFields = getSearchablePreviewFieldsUtil(tab.id, dataConfig, TAB_SEARCH_FIELDS);
          const preview = previewFields
            .map((field) => row?.[field])
            .find((value) => String(value || '').toLowerCase().includes(keyword.toLowerCase()))
            || row.title
            || row.username
            || row.email
            || row.content
            || row.id;
          return {
            tabId: tab.id,
            tabLabel: tab.label,
            id: row.id,
            title: String(row.title || row.username || row.email || row.plan_name || row.prize_title || row.gift_content || row.id || '').slice(0, 80),
            preview: String(preview || '').slice(0, 160),
            row
          };
        });
      });

      const settled = await Promise.allSettled(tasks);
      if (signal.aborted) return;
      globalSearchResults.value = settled.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : []);
      showToast(
        globalSearchResults.value.length ? `跨表搜索完成，命中 ${globalSearchResults.value.length} 条` : '没有找到跨表结果',
        globalSearchResults.value.length ? 'success' : 'info'
      );
    } catch (error) {
      logger.error('data-admin', '跨表搜索失败:', error);
      showToast('跨表搜索失败: ' + buildActionErrorMessage(error, '跨表搜索失败'), 'error');
    } finally {
      isGlobalSearching.value = false;
    }
  };

  const openGlobalSearchResult = (result) => {
    if (!result?.tabId) return;
    addRecentRecord(result.row || { id: result.id, title: result.title }, result.tabId);
    switchTab(result.tabId, { search: String(result.id || globalSearchQuery.value) });
  };

  const abortGlobalSearch = () => {
    if (abortController) abortController.abort();
  };

  return {
    globalSearchQuery,
    globalSearchResults,
    isGlobalSearching,
    showGlobalSearchPanel,
    runGlobalSearch,
    openGlobalSearchResult,
    abortGlobalSearch
  };
};
