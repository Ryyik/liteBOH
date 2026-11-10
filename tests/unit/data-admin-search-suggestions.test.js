import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  RECENT_SEARCH_LIMIT,
  SUGGESTION_LIMIT,
  buildSearchSuggestions,
  collectEnumOptions,
  pushRecentSearch,
} from '@/views/DataManagement/composables/data-admin-search-suggestions.js';

describe('pushRecentSearch：去重 + 提前 + 上限', () => {
  it('新词插到最前', () => {
    expect(pushRecentSearch(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('重复词（大小写不同）提到最前，不产生第二条', () => {
    expect(pushRecentSearch(['a', 'Abc', 'b'], 'abc')).toEqual(['abc', 'a', 'b']);
  });

  it('超过上限截断，保留最近的', () => {
    const list = Array.from({ length: RECENT_SEARCH_LIMIT }, (_, i) => `k${i}`);
    const next = pushRecentSearch(list, 'new');
    expect(next).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`k${RECENT_SEARCH_LIMIT - 1}`);
  });

  it('空词不入库（点 × 清空不污染历史）', () => {
    expect(pushRecentSearch(['a'], '   ')).toEqual(['a']);
  });
});

describe('collectEnumOptions：只收短枚举', () => {
  it('取 label 与字段名，供联想区分来源', () => {
    const options = collectEnumOptions([
      {
        key: 'status',
        label: '状态',
        options: [
          { value: 'approved', label: '已通过' },
          { value: 'rejected', label: '已拒绝' },
        ],
      },
    ]);
    expect(options).toEqual([
      { field: 'status', fieldLabel: '状态', value: 'approved', label: '已通过' },
      { field: 'status', fieldLabel: '状态', value: 'rejected', label: '已拒绝' },
    ]);
  });

  it('超过 24 个值的列不收（那不是联想，是列表）', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ value: `v${i}`, label: `v${i}` }));
    expect(collectEnumOptions([{ key: 'city', label: '城市', options: many }])).toEqual([]);
  });

  it('没有 options 的列被忽略', () => {
    expect(collectEnumOptions([{ key: 'title', label: '标题' }])).toEqual([]);
  });
});

describe('buildSearchSuggestions', () => {
  const enumOptions = [
    { field: 'status', fieldLabel: '状态', value: 'approved', label: '已通过' },
    { field: 'status', fieldLabel: '状态', value: 'rejected', label: '已拒绝' },
  ];
  const tabs = [
    { id: 'products', label: '商品管理' },
    { id: 'users', label: '用户管理' },
  ];

  it('空输入给三条前缀提示 + 最近搜索', () => {
    const list = buildSearchSuggestions({ query: '', recent: ['围巾'], tabs });
    expect(list.some((item) => item.kind === 'prefix')).toBe(true);
    expect(list.find((item) => item.kind === 'recent').label).toBe('围巾');
  });

  it('输入词匹配枚举值时给枚举候选，并标出字段名', () => {
    const list = buildSearchSuggestions({ query: '通过', enumOptions });
    const hit = list.find((item) => item.kind === 'enum');
    expect(hit.label).toBe('已通过');
    expect(hit.hint).toBe('状态');
  });

  it('tab: 模式只给表跳转', () => {
    const list = buildSearchSuggestions({ query: 'tab:商品', tabs, enumOptions, recent: ['x'] });
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('tab');
    expect(list[0].tabId).toBe('products');
  });

  it('id: / @ 模式给一句「会怎么搜」，不给枚举噪音', () => {
    const list = buildSearchSuggestions({ query: 'id:', enumOptions });
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('prefix');
    expect(list[0].hint).toBe('id:');
  });

  it('结果条数不超过 SUGGESTION_LIMIT', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      field: 'status',
      fieldLabel: '状态',
      value: `v${i}`,
      label: `状态值${i}`,
    }));
    const list = buildSearchSuggestions({ query: '状态', enumOptions: many });
    expect(list.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
  });

  it('没有匹配时返回空数组（面板据此不渲染）', () => {
    expect(buildSearchSuggestions({ query: 'zzz', enumOptions, tabs, recent: [] })).toEqual([]);
  });
});

describe('跨表搜索接线（plans/042 A1 / C3，2026-11-10 复核修复）', () => {
  const source = readFileSync(
    resolve(
      import.meta.dirname,
      '../../src/views/DataManagement/composables/useDataAdminGlobalSearch.js',
    ),
    'utf8',
  );

  it('前缀必须原样传给 buildSearchFilters（否则 @ / id: 退化成全字段）', () => {
    // 反证：旧实现传的是 parsed.value（已去前缀）⇒ 重新解析成 text 模式
    expect(source).toContain('buildSearchFiltersUtil(tab.id, rawText');
    expect(source).not.toContain('buildSearchFiltersUtil(tab.id, keyword');
  });

  it('取消请求走 builder 的 abortSignal，而不是塞进 select(options)', () => {
    // postgrest-js 的 select(columns, options) 只消费 { head, count }，signal 会被静默丢弃
    expect(source).toContain('.abortSignal(signal)');
    expect(source).not.toContain('.select(selectColumns, { signal })');
  });

  it('abort 时把 isGlobalSearching 复位（否则停在「搜索中…」）', () => {
    const abort = source.match(/const abortGlobalSearch = \(\) => \{([\s\S]*?)\n  \};/);
    expect(abort, '找不到 abortGlobalSearch').toBeTruthy();
    expect(abort[1]).toContain('isGlobalSearching.value = false');
  });

  it('收起面板要撤掉待触发的去抖（否则 250ms 后自己弹回来）', () => {
    const close = source.match(/const closeGlobalSearchPanel = \(\) => \{([\s\S]*?)\n  \};/);
    expect(close, '找不到 closeGlobalSearchPanel').toBeTruthy();
    expect(close[1]).toContain('clearTimeout(debounceTimer)');
  });
});
