import { describe, expect, it } from 'vitest';
import { dataConfig, tabs, TABS_ACTIONS } from '@/views/DataManagement/config.js';
import { TAB_SEARCH_FIELDS, TAB_SELECT_COLUMNS } from '@/views/DataManagement/query-config.js';
import { buildSearchSuggestions } from '@/views/DataManagement/composables/data-admin-search-suggestions.js';
import { buildSearchFilters } from '@/utils/search-core.js';

/**
 * 搜索链路的配置不变量（2026-11-11）。
 *
 * 背景：用户搜「广告」什么都搜不到，实测暴露了三类**静默**故障 ——
 *   ① 页签/功能名压根不参与匹配（只有 `tab:` 前缀能匹配，用户不可能知道）
 *   ② 搜索字段里混进了 `timestamptz` 列 ⇒ `ilike` 42883 ⇒ 整表查询 400，
 *      而跨表搜索把错误 `logger.warn` 掉了，界面显示「没有匹配」
 *   ③ 有表的页签没配搜索字段 ⇒ 被 `filters.length === 0` 直接跳过
 *
 * 这三条都不会报错、不会变红，只会让搜索「看起来能用」。所以用配置级断言锁住。
 */
describe('搜索配置不变量', () => {
  it('有表且配了 select 列的页签，必须有搜索字段', () => {
    const missing = tabs
      .filter((tab) => dataConfig[tab.id]?.table && TAB_SELECT_COLUMNS[tab.id])
      .filter((tab) => !(TAB_SEARCH_FIELDS[tab.id] || []).length)
      .map((tab) => tab.id);
    expect(missing).toEqual([]);
  });

  it('搜索字段必须出现在该页签的 select 列里', () => {
    const missing = [];
    for (const [tabId, fields] of Object.entries(TAB_SEARCH_FIELDS)) {
      const select = TAB_SELECT_COLUMNS[tabId];
      if (!select) continue;
      const flat = String(select).replace(/\s+/g, ' ');
      for (const field of fields) {
        const column = String(field?.column || '');
        if (!column) continue;
        // 列名要作为独立 token 出现（`id` 不能因为 `user_id` 而误判命中）
        const tokenRe = new RegExp(`(^|[,( ])${column}($|[ ,)])`);
        if (!tokenRe.test(flat)) missing.push(`${tabId}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('日期/时间列必须显式声明 type: date（否则会被当成 text 拼 ilike → 42883）', () => {
    const offenders = [];
    for (const [tabId, fields] of Object.entries(TAB_SEARCH_FIELDS)) {
      for (const field of fields) {
        const column = String(field?.column || '');
        if (/_at$/i.test(column) || /_date$/i.test(column)) {
          if (field.type !== 'date') offenders.push(`${tabId}.${column}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('date 字段只做日期精确匹配，绝不生成 ilike', () => {
    const fields = {
      t: [
        { column: 'start_at', type: 'date' },
        { column: 'title', type: 'text' },
      ],
    };
    expect(buildSearchFilters('t', '广告', fields)).toEqual(['title.ilike.%广告%']);
    expect(buildSearchFilters('t', '2026-11-11', fields)).toEqual([
      'start_at.eq.2026-11-11',
      'title.ilike.%2026-11-11%',
    ]);
  });

  it('策略型页签不能出现「删一行 = 删账号」的入口', () => {
    // points / users 都是 profiles 表；users 的 delete 走 admin_delete_user_account（删账号，合理），
    // points 只是同表的另一种视角，给它 delete 等于在「积分」页面上误删账号。
    expect(TABS_ACTIONS.points).not.toContain('delete');
  });
});

describe('搜索联想：功能名也要能搜到', () => {
  it('普通关键词命中页签名 → 给出「跳到某功能」候选', () => {
    const suggestions = buildSearchSuggestions({
      query: '广告',
      recent: ['积分明细'],
      enumOptions: [],
      tabs: [
        { id: 'ads', label: '广告管理' },
        { id: 'users', label: '用户管理' },
      ],
    });
    const tabSuggestion = suggestions.find((item) => item.kind === 'tab');
    expect(tabSuggestion).toBeTruthy();
    expect(tabSuggestion.tabId).toBe('ads');
    expect(tabSuggestion.label).toContain('广告管理');
  });

  it('功能名候选排在最近搜索之前（找功能的人不该先被历史词挡住）', () => {
    const suggestions = buildSearchSuggestions({
      query: '广告',
      recent: ['广告位 A'],
      enumOptions: [],
      tabs: [{ id: 'ads', label: '广告管理' }],
    });
    const kinds = suggestions.map((item) => item.kind);
    expect(kinds.indexOf('tab')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('tab')).toBeLessThan(kinds.indexOf('recent'));
  });

  it('关键词不命中任何页签名时，不凭空造功能候选', () => {
    const suggestions = buildSearchSuggestions({
      query: '斜挎包',
      recent: [],
      enumOptions: [],
      tabs: [{ id: 'ads', label: '广告管理' }],
    });
    expect(suggestions.some((item) => item.kind === 'tab')).toBe(false);
  });

  it('tab: 前缀仍然只给功能候选（不混入历史/枚举）', () => {
    const suggestions = buildSearchSuggestions({
      query: 'tab:广告',
      recent: ['随便一个词'],
      enumOptions: [{ field: 'status', fieldLabel: '状态', value: 'active', label: '广告' }],
      tabs: [{ id: 'ads', label: '广告管理' }],
    });
    expect(suggestions.every((item) => item.kind === 'tab')).toBe(true);
    expect(suggestions[0].tabId).toBe('ads');
  });
});
