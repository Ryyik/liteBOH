import { describe, expect, it } from 'vitest';

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
