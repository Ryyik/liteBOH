import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EMPTY_ACTIONS,
  resolveEmptyState,
} from '@/views/DataManagement/composables/data-admin-empty-state.js';

describe('resolveEmptyState', () => {
  it('有数据时返回 null', () => {
    expect(resolveEmptyState({ totalCount: 3 })).toBeNull();
  });

  it('搜索无结果 → no-match，且不给新增', () => {
    const s = resolveEmptyState({
      totalCount: 0,
      searchQuery: '周年',
      hasActiveFilters: true,
      canCreate: true,
    });
    expect(s.kind).toBe('no-match');
    expect(s.showClear).toBe(true);
    expect(s.showCreate).toBe(false);
    expect(s.description).toContain('周年');
  });

  it('只有筛选无搜索 → filtered-out', () => {
    const s = resolveEmptyState({
      totalCount: 0,
      searchQuery: '',
      hasActiveFilters: true,
      canCreate: true,
    });
    expect(s.kind).toBe('filtered-out');
    expect(s.showClear).toBe(true);
    expect(s.showCreate).toBe(false);
  });

  it('真空表 → empty，允许新增', () => {
    const s = resolveEmptyState({
      totalCount: 0,
      searchQuery: '',
      hasActiveFilters: false,
      canCreate: true,
    });
    expect(s.kind).toBe('empty');
    expect(s.showClear).toBe(false);
    expect(s.showCreate).toBe(true);
  });

  it('无权限时不给新增', () => {
    expect(resolveEmptyState({ totalCount: 0, canCreate: false }).showCreate).toBe(false);
  });
});

describe('空态一定是可行动的（plans/042 C4 / AC-4）', () => {
  const cases = [
    ['no-match', { totalCount: 0, searchQuery: '周年', hasActiveFilters: true, canCreate: true }],
    ['filtered-out', { totalCount: 0, searchQuery: '', hasActiveFilters: true, canCreate: true }],
    ['empty', { totalCount: 0, searchQuery: '', hasActiveFilters: false, canCreate: true }],
    ['empty-无权限', { totalCount: 0, searchQuery: '', hasActiveFilters: false, canCreate: false }],
  ];

  it.each(cases)('%s 至少给一个动作，且动作 id 不重复', (_name, input) => {
    const state = resolveEmptyState(input);
    expect(Array.isArray(state.actions)).toBe(true);
    expect(state.actions.length).toBeGreaterThanOrEqual(1);
    const ids = state.actions.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    state.actions.forEach((action) => {
      expect(action.label).toBeTruthy();
      expect(Object.values(EMPTY_ACTIONS)).toContain(action.id);
    });
  });

  it('搜索无结果给「搜索全部表」而不是只给清空', () => {
    const state = resolveEmptyState({ totalCount: 0, searchQuery: '周年' });
    expect(state.actions.map((a) => a.id)).toContain(EMPTY_ACTIONS.GLOBAL_SEARCH);
  });

  it('筛选挡住时给清除入口', () => {
    const state = resolveEmptyState({ totalCount: 0, hasActiveFilters: true });
    expect(state.actions.map((a) => a.id)).toContain(EMPTY_ACTIONS.CLEAR_FILTERS);
  });

  it('真空表有权限给新增，无权限退化为去全部表搜', () => {
    expect(
      resolveEmptyState({ totalCount: 0, canCreate: true }).actions.map((a) => a.id),
    ).toContain(EMPTY_ACTIONS.CREATE);
    expect(
      resolveEmptyState({ totalCount: 0, canCreate: false }).actions.map((a) => a.id),
    ).toContain(EMPTY_ACTIONS.GLOBAL_SEARCH);
  });
});

describe('empty state wiring', () => {
  const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

  it('DataAdmin 空状态消费 emptyState 且判定顺序先搜索后筛选', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('resolveEmptyState');
    expect(view).toContain('data-empty-kind');
    // 纯函数真源里搜索分支必须在筛选分支之前（hasActiveFilters 包含 searchQuery）
    const pure = read('src/views/DataManagement/composables/data-admin-empty-state.js');
    expect(pure.indexOf('no-match')).toBeLessThan(pure.indexOf('filtered-out'));
  });

  it('空状态样式挂在 console.css（筛选行摘要 + 操作区）', () => {
    const css = read('src/views/DataManagement/styles/console.css');
    expect(css).toContain('.empty-state-filters');
    expect(css).toContain('.empty-state-actions');
  });

  it('空态按钮由 actions 驱动，不是写死的两个按钮', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('runEmptyStateAction');
    expect(view).toContain('v-for="action in emptyState.actions"');
  });

  it('搜索只有一个关键词状态（globalSearchQuery 已并入 searchQuery）', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).not.toContain('globalSearchQuery');
    expect(view).toContain('searchScope');
    expect(view).toContain('isGlobalSearchScope');
    // 旧的「跨表搜索」独立输入框不得复活（注释里提到不算）
    const template = view.slice(0, view.indexOf('<script'));
    expect(view).not.toContain('class="editor-panel search-panel"');
    expect(template).not.toMatch(/>\s*跨表搜索\s*</);
  });
});
