import { describe, expect, it } from 'vitest';
import {
  dataConfig,
  tabs,
  TABS_ACTIONS,
  TAB_WRITABLE_FIELDS,
} from '@/views/DataManagement/config.js';
import { SAVE_STRATEGIES } from '@/views/DataManagement/config/saveStrategies.js';

/**
 * 有 create/edit 动作的**表格 tab** 必须有可写字段与表单字段。
 * 漏了 `TAB_WRITABLE_FIELDS` 不会报错：`pickWritableFields` 会静默返回 {}，
 * 用户点保存什么都不发生（2026-10-17 审查 photoAlbums 实测）。
 * 页面型 tab（keys-models / api-keys 等）由各自的 Console 组件维护，不在本断言内。
 */
describe('data admin write config', () => {
  it('create/edit 表格 tab 都有可写字段 + 表单字段', () => {
    const missing = [];
    for (const tab of tabs) {
      const tabId = tab.id;
      const actions = TABS_ACTIONS[tabId] || [];
      const wantsWrite = actions.includes('create') || actions.includes('edit');
      const table = dataConfig[tabId]?.table;
      if (!wantsWrite || !table) continue;
      if (!(TAB_WRITABLE_FIELDS[tabId] || []).length) missing.push(`${tabId}: 无可写字段`);
      if (!(dataConfig[tabId]?.fields || []).length) missing.push(`${tabId}: 无表单字段`);
      if (typeof SAVE_STRATEGIES[tabId] !== 'function') missing.push(`${tabId}: 无保存策略`);
    }
    expect(missing).toEqual([]);
  });
});
