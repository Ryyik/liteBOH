import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveEmptyState } from '@/views/DataManagement/composables/data-admin-empty-state.js';

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
});
