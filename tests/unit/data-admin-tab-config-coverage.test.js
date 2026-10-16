import { describe, expect, it } from 'vitest';
import { tabs, TABS_ACTIONS } from '@/views/DataManagement/config/tabs.js';
import { dataConfig } from '@/views/DataManagement/config/tables.js';
import {
  DATE_FILTER_FIELDS,
  STATUS_FILTER_FIELDS,
  TAB_DEFAULT_SORT,
  TAB_SELECT_COLUMNS,
} from '@/views/DataManagement/query-config.js';

// =====================================================================
// 数据管理面板 · tab 查询配置覆盖守卫
//
//   事故背景（2026-10-16）：活动平台三 tab 里，campaignEntries（活动报名明细）
//   与 campaignRewards（活动发放台账）在 query-config.js 里**没有任何一张地图的条目**。
//   于是 fetchTabData 取不到 selectColumns 直接 return ——
//   页签永远显示「暂无数据」、连一个 REST 请求都不发，管理员以为「没有数据」，
//   实际是「没法管理」。活动页面的报名/投稿记录因此完全不可见、不可删。
//
//   守卫口径：凡是「tabs.js 里定义了、且在 dataConfig 里有表配置」的表格类 tab，
//   六张查询地图必须齐备。page 型 tab（points-grant / keys-models / ai-quota…）
//   不在 dataConfig 里，天然不适用。
//
//   反证：把 query-config.js 里 campaignEntries 的条目删掉 → 第 3 条必红；
//        把 TABS_ACTIONS.campaignEntries 的 delete 去掉 → 第 5 条必红。
// =====================================================================

// 表格类 tab = tabs.js 中有定义、且 dataConfig 里有对应表配置的 tab
const tableTabs = tabs.filter((tab) => Boolean(dataConfig[tab.id]));

describe('数据管理面板 · tab 查询配置覆盖', () => {
  it('表格类 tab 样本非空（防止选择器写错导致空断言假绿）', () => {
    // 目前 40+ 个；断言只做下界保护，数字随功能增长不受影响
    expect(tableTabs.length).toBeGreaterThan(30);
  });

  it('每个表格类 tab 都必须有 TAB_SELECT_COLUMNS（缺失 = 列表静默空白，连请求都不发）', () => {
    const missing = tableTabs
      .filter((tab) => !TAB_SELECT_COLUMNS[tab.id])
      .map((tab) => `${tab.id}(${tab.label})`);
    expect(missing).toEqual([]);
  });

  it('每个表格类 tab 都必须有 TABS_ACTIONS 动作集合', () => {
    const missing = tableTabs
      .filter((tab) => !Array.isArray(TABS_ACTIONS[tab.id]))
      .map((tab) => `${tab.id}(${tab.label})`);
    expect(missing).toEqual([]);
  });

  it('活动平台三 tab 的筛选/排序配置齐备', () => {
    for (const id of ['campaigns', 'campaignEntries', 'campaignRewards']) {
      expect(TAB_SELECT_COLUMNS[id], `${id} 缺 TAB_SELECT_COLUMNS`).toBeTruthy();
      expect(TAB_DEFAULT_SORT[id], `${id} 缺 TAB_DEFAULT_SORT`).toBeTruthy();
    }
    expect(STATUS_FILTER_FIELDS.campaignEntries).toBe('status');
    expect(STATUS_FILTER_FIELDS.campaignRewards).toBe('status');
    expect(DATE_FILTER_FIELDS.campaignEntries).toBe('created_at');
    expect(DATE_FILTER_FIELDS.campaignRewards).toBe('created_at');
  });

  it('活动报名明细开放删除（管理员清理报名/投稿记录，DB 删除政策本就含管理员分支）', () => {
    expect(TABS_ACTIONS.campaignEntries).toContain('delete');
  });
});
