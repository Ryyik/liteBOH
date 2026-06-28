/**
 * DataAdmin 变更日志 + 最近访问 + 固定 Tab 相关
 * 拆分自 DataAdmin.vue (P2 拆分第二阶段)
 *
 * 工厂模式, 依赖通过参数注入:
 *   - 响应式状态 (changeLogEntries, recentRecords, pinnedTabIds, currentTab, currentTabLabel)
 *   - 持久化函数 (persistChangeLog, persistRecentRecords, persistPinnedTabs)
 *   - tabs 配置 + userInfo
 *
 * 业务规则:
 *   - 变更日志最多保留 300 条, 后续 push 时会 trim
 *   - 最近访问最多 20 条, 重复访问同一记录会移至最前
 *   - 固定 Tab 最多 8 个, 新增在头部
 */

import { computed } from 'vue';

/**
 * 创建变更日志 / 最近访问 / 固定 Tab 集合
 * @param {Object} deps
 * @param {Object} deps.changeLogEntries    - ref<Array<ChangeLogEntry>>
 * @param {Object} deps.recentRecords       - ref<Array<RecentRecord>>
 * @param {Object} deps.pinnedTabIds        - ref<Array<string>>
 * @param {Object} deps.currentTab          - ref<string>
 * @param {Object} deps.currentTabLabel     - computed<string>
 * @param {Function} deps.getUserInfo       - () => userInfo
 * @param {Array}  deps.tabs                - tab 配置数组
 * @param {Function} deps.persistChangeLog  - () => void
 * @param {Function} deps.persistRecentRecords - () => void
 * @param {Function} deps.persistPinnedTabs - () => void
 * @param {Function} deps.switchTab         - (tabId, options) => void
 */
export const createChangeLogCenter = (deps) => {
  const {
    changeLogEntries,
    recentRecords,
    pinnedTabIds,
    currentTab,
    currentTabLabel,
    getUserInfo,
    tabs,
    persistChangeLog,
    persistRecentRecords,
    persistPinnedTabs,
    switchTab
  } = deps;

  const addChangeLogEntry = (action, item = {}, detail = {}) => {
    const userInfo = getUserInfo();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      tabId: currentTab.value,
      tabLabel: currentTabLabel.value,
      recordId: item?.id || detail.recordId || '',
      detail,
      operator: userInfo?.username || userInfo?.email || 'admin',
      createdAt: new Date().toISOString()
    };
    changeLogEntries.value = [entry, ...changeLogEntries.value].slice(0, 300);
    persistChangeLog();
  };

  const addRecentRecord = (item, tabId = currentTab.value) => {
    const id = String(item?.id || '').trim();
    if (!id) return;
    const tabLabel = tabs.find((tab) => tab.id === tabId)?.label || tabId;
    const title = String(
      item.title || item.username || item.email || item.plan_name || item.prize_title || item.gift_content || id
    ).trim();
    const record = { tabId, tabLabel, id, title, visitedAt: new Date().toISOString() };
    recentRecords.value = [
      record,
      ...recentRecords.value.filter((entry) => !(entry.tabId === tabId && String(entry.id) === id))
    ].slice(0, 20);
    persistRecentRecords();
  };

  const togglePinnedTab = (tabId) => {
    if (pinnedTabIds.value.includes(tabId)) {
      pinnedTabIds.value = pinnedTabIds.value.filter((id) => id !== tabId);
    } else {
      pinnedTabIds.value = [tabId, ...pinnedTabIds.value].slice(0, 8);
    }
    persistPinnedTabs();
  };

  const isTabPinned = (tabId) => pinnedTabIds.value.includes(tabId);

  const jumpToRecentRecord = (record) => {
    if (!record?.tabId) return;
    switchTab(record.tabId, { search: String(record.id || record.title || '') });
  };

  // 衍生 computed: 当前 tab 的变更日志(最多 30 条)
  const currentChangeLogEntries = computed(() =>
    changeLogEntries.value
      .filter((entry) => !entry.tabId || entry.tabId === currentTab.value)
      .slice(0, 30)
  );

  // 衍生 computed: 当前固定的 tab 列表(从 tabs 中过滤出 pinned 的)
  const currentPinnedTabs = computed(() => {
    const pinned = new Set(pinnedTabIds.value);
    return tabs.filter((tab) => pinned.has(tab.id));
  });

  // 衍生 computed: 侧边栏展示的最近访问(最多 8 条)
  const recentRecordsForSidebar = computed(() => recentRecords.value.slice(0, 8));

  return {
    // mutations
    addChangeLogEntry,
    addRecentRecord,
    togglePinnedTab,
    isTabPinned,
    jumpToRecentRecord,
    // computeds
    currentChangeLogEntries,
    currentPinnedTabs,
    recentRecordsForSidebar
  };
};
