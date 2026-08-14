/**
 * DataAdmin 筛选状态 + 衍生 computed
 * 拆分自 DataAdmin.vue (P2 拆分第二阶段)
 *
 * 集中管理:
 *   - 搜索/排序/分页 refs (依赖从外部注入, 不持有)
 *   - 状态/日期/高级筛选 refs
 *   - 衍生 computed: hasActiveFilters / activeFilterSummary / 各种 filterLabel
 *   - 简单 action: resetFiltersForTab / clearSearch / clearAllFilters / handleSearch / handleFilterChange
 *
 * 不包含 fetchTabData 等副作用函数, 它们仍在 DataAdmin.vue
 *
 * 设计: 工厂模式 + 依赖注入, 避免 composable 直接持有响应式状态
 */

import { computed } from 'vue';

/**
 * 创建筛选状态中心
 * @param {Object} deps
 * @param {Object} deps.currentTab          - ref<string>
 * @param {Object} deps.searchQuery         - ref<string>
 * @param {Object} deps.statusFilter        - ref<string>
 * @param {Object} deps.dateFromFilter      - ref<string>
 * @param {Object} deps.dateToFilter        - ref<string>
 * @param {Object} deps.advancedFilterRules - ref<Array>
 * @param {Object} deps.currentPage         - ref<number>
 * @param {Object} deps.suppressNextPageFetch - ref<boolean>
 * @param {Object} deps.searchDebounceTimer   - ref<any>  (debounce timer for handleSearch)
 * @param {Object} deps.savedFilterViews    - ref<Object<tabId, view[]>>
 * @param {Object} deps.STATUS_FILTER_FIELDS - object
 * @param {Object} deps.DATE_FILTER_FIELDS  - object
 * @param {Function} deps.fetchTabData      - (tabId) => Promise<void>
 * @param {Function} deps.getCurrentFields  - () => currentFields.value
 * @param {Function} deps.getCurrentData    - () => currentData.value
 * @param {Function} deps.getCurrentColumns - () => currentColumns.value
 */
export const createFilterState = (deps) => {
  const {
    currentTab,
    searchQuery,
    statusFilter,
    dateFromFilter,
    dateToFilter,
    advancedFilterRules,
    currentPage,
    suppressNextPageFetch,
    searchDebounceTimer,
    savedFilterViews,
    STATUS_FILTER_FIELDS,
    DATE_FILTER_FIELDS,
    fetchTabData,
    getCurrentFields,
    getCurrentData,
    getCurrentColumns
  } = deps;

  // 当前 tab 的状态字段名
  const currentStatusFilterField = computed(() => STATUS_FILTER_FIELDS[currentTab.value] || '');

  // 当前 tab 的日期字段名
  const currentDateFilterField = computed(() => DATE_FILTER_FIELDS[currentTab.value] || '');

  // 当前 tab 已保存的筛选视图列表
  const currentSavedViews = computed(() => savedFilterViews.value?.[currentTab.value] || []);

  // 状态筛选可选项: 优先用字段声明的 options, 否则从当前数据反推 distinct
  const statusFilterOptions = computed(() => {
    const field = currentStatusFilterField.value;
    if (!field) return [];

    const configuredField = getCurrentFields().find((item) => item.key === field);
    if (Array.isArray(configuredField?.options)) {
      return configuredField.options.map((item) => ({
        value: item.value,
        label: item.label
      }));
    }

    const values = new Map();
    (getCurrentData() || []).forEach((row) => {
      const raw = row?.[field];
      if (raw === null || raw === undefined || raw === '') return;
      const key = String(raw);
      values.set(key, { value: raw, label: key });
    });
    return [...values.values()].slice(0, 12);
  });

  // 是否有任何活跃的筛选条件
  const hasActiveFilters = computed(() =>
    Boolean(searchQuery.value.trim()
      || statusFilter.value
      || dateFromFilter.value
      || dateToFilter.value
      || activeAdvancedRules.value.length)
  );

  // 当前生效的高级筛选规则 (从 advancedFilterRules 中提取启用的)
  const activeAdvancedRules = computed(() =>
    advancedFilterRules.value.filter((rule) =>
      String(rule.field || '').trim()
      && String(rule.operator || '').trim()
      && rule.value !== undefined
      && rule.value !== null
      && String(rule.value).trim() !== ''
    )
  );

  // 活跃筛选的简明摘要(供 UI badge 展示)
  const activeFilterSummary = computed(() => {
    const parts = [];
    if (searchQuery.value.trim()) parts.push(`关键词「${searchQuery.value.trim()}」`);
    if (statusFilter.value) parts.push(`状态 ${statusFilterLabel.value}`);
    if (dateFromFilter.value || dateToFilter.value) {
      parts.push(`${currentDateFilterLabel.value}${dateFromFilter.value || '最早'} - ${dateToFilter.value || '现在'}`);
    }
    if (activeAdvancedRules.value.length) parts.push(`${activeAdvancedRules.value.length} 个高级条件`);
    return parts.length ? `已应用 ${parts.join('、')}` : '未应用筛选';
  });

  // 状态筛选 chip 标签
  const statusFilterLabel = computed(() => {
    if (!statusFilter.value) return '';
    return statusFilterOptions.value.find((item) => String(item.value) === String(statusFilter.value))?.label || statusFilter.value;
  });

  // 日期筛选 chip 标签
  const currentDateFilterLabel = computed(() => {
    const field = getCurrentColumns().find((item) => item.key === currentDateFilterField.value)
      || getCurrentFields().find((item) => item.key === currentDateFilterField.value);
    return field?.label || '日期';
  });

  // 切换 tab 时重置筛选
  const resetFiltersForTab = () => {
    statusFilter.value = '';
    dateFromFilter.value = '';
    dateToFilter.value = '';
    advancedFilterRules.value = [];
  };

  // 统一的防抖拉取入口: 搜索/筛选/清空合并到同一个 300ms 防抖, 避免高频操作整页重查
  const debouncedRefetch = () => {
    if (searchDebounceTimer.value) clearTimeout(searchDebounceTimer.value);
    searchDebounceTimer.value = setTimeout(() => {
      searchDebounceTimer.value = null;
      fetchTabData(currentTab.value);
    }, 300);
  };

  // 搜索: 重置到第一页 + 防抖拉取数据
  const handleSearch = () => {
    if (currentPage.value !== 1) {
      suppressNextPageFetch.value = true;
      currentPage.value = 1;
    }
    debouncedRefetch();
  };

  // 筛选/排序变化: 重置到第一页 + 防抖拉取
  const handleFilterChange = () => {
    if (currentPage.value !== 1) {
      suppressNextPageFetch.value = true;
      currentPage.value = 1;
    }
    debouncedRefetch();
  };

  // 清空搜索
  const clearSearch = () => {
    searchQuery.value = '';
    if (currentPage.value !== 1) {
      suppressNextPageFetch.value = true;
      currentPage.value = 1;
    }
    debouncedRefetch();
  };

  // 清空所有筛选
  const clearAllFilters = () => {
    searchQuery.value = '';
    resetFiltersForTab();
    handleFilterChange();
  };

  return {
    // 衍生 computed
    currentStatusFilterField,
    currentDateFilterField,
    statusFilterOptions,
    hasActiveFilters,
    activeAdvancedRules,
    activeFilterSummary,
    statusFilterLabel,
    currentDateFilterLabel,
    currentSavedViews,
    // actions
    resetFiltersForTab,
    handleSearch,
    handleFilterChange,
    clearSearch,
    clearAllFilters
  };
};
