/**
 * DataAdmin 本地持久化相关工具
 * 拆分自 DataAdmin.vue (P2 拆分第一阶段)
 *
 * 全部 localStorage 读写统一收敛在此, 便于后续:
 *  - 替换为 IndexedDB / Supabase user_preferences
 *  - 增加统一的过期/版本管理
 *  - 单元测试
 */

import { logger } from '@/utils/logger.js';

export const ADMIN_STORAGE_KEYS = Object.freeze({
  columns: 'boh-admin-table-columns-v1',
  savedViews: 'boh-admin-saved-filter-views-v1',
  pinnedTabs: 'boh-admin-pinned-tabs-v1',
  recentRecords: 'boh-admin-recent-records-v1',
  changeLog: 'boh-admin-change-log-v1',
  drafts: 'boh-admin-edit-drafts-v1',
  /* 删除前快照（2026-11-09）：删除是物理删除、无法从库里找回，这里留一份本机副本，
     误删后能原样插回去。只覆盖本浏览器、保留最近 30 条 —— 不是跨设备回收站。 */
  deletedSnapshots: 'boh-admin-deleted-snapshots-v1',
  /* 最近搜索（plans/042 C3）：只存关键词字符串，10 条封顶。 */
  recentSearches: 'boh-admin-recent-searches-v1',
});

/**
 * 读取 localStorage 中的 JSON, 失败时返回 fallback
 */
export const readLocalJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    logger.warn('data-admin', '读取本地配置失败:', key, error);
    return fallback;
  }
};

/**
 * 将 value 序列化后写入 localStorage, 静默吞掉异常
 */
export const writeLocalJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logger.warn('data-admin', '写入本地配置失败:', key, error);
  }
};

/**
 * 启动时从 localStorage 回填所有偏好到响应式 ref 中
 * @param {Object} refs 各个 ref 对象, 按 key 写入
 *   { columnSettings, savedFilterViews, pinnedTabIds, recentRecords, changeLogEntries }
 */
export const hydrateAdminPreferences = (refs) => {
  refs.columnSettings.value = readLocalJson(ADMIN_STORAGE_KEYS.columns, {});
  refs.savedFilterViews.value = readLocalJson(ADMIN_STORAGE_KEYS.savedViews, {});
  refs.pinnedTabIds.value = readLocalJson(ADMIN_STORAGE_KEYS.pinnedTabs, []);
  refs.recentRecords.value = readLocalJson(ADMIN_STORAGE_KEYS.recentRecords, []);
  refs.changeLogEntries.value = readLocalJson(ADMIN_STORAGE_KEYS.changeLog, []);
};

/**
 * 创建各类 persist 函数集合, 返回的对象可直接绑定到响应式 ref
 *   使用方式: const { persistColumnSettings, persistSavedViews } = createPersisters({ columnSettings, ... });
 */
export const createPersisters = (refs) => ({
  persistColumnSettings: () =>
    writeLocalJson(ADMIN_STORAGE_KEYS.columns, refs.columnSettings.value),
  persistSavedViews: () =>
    writeLocalJson(ADMIN_STORAGE_KEYS.savedViews, refs.savedFilterViews.value),
  persistPinnedTabs: () => writeLocalJson(ADMIN_STORAGE_KEYS.pinnedTabs, refs.pinnedTabIds.value),
  persistRecentRecords: () =>
    writeLocalJson(ADMIN_STORAGE_KEYS.recentRecords, refs.recentRecords.value),
  persistChangeLog: () => writeLocalJson(ADMIN_STORAGE_KEYS.changeLog, refs.changeLogEntries.value),
  persistRecentSearches: () =>
    writeLocalJson(ADMIN_STORAGE_KEYS.recentSearches, refs.recentSearches.value),
});
