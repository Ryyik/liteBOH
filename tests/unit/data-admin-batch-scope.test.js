import { describe, expect, it } from 'vitest';
import {
  buildBatchDeleteConditions,
  getBaseScopeConditions,
} from '@/views/DataManagement/composables/data-admin-batch-scope.js';

describe('buildBatchDeleteConditions（plans/027 E6.3）', () => {
  it('普通表：只拼用户条件，不带基础过滤', () => {
    expect(getBaseScopeConditions('lotteries')).toEqual([]);
    expect(
      buildBatchDeleteConditions({
        tabId: 'lotteries',
        statusField: 'status',
        statusFilter: 'open',
        searchColumns: ['title'],
        searchQuery: '中秋',
      }),
    ).toEqual([
      { column: 'status', op: 'eq', value: 'open' },
      { op: 'or_ilike', columns: ['title'], value: '%中秋%' },
    ]);
  });

  it('reportedPosts：基础过滤 status=limited 必须在条件里（否则 count 对不上）', () => {
    const conditions = buildBatchDeleteConditions({
      tabId: 'reportedPosts',
      searchColumns: ['title'],
      searchQuery: '测试',
    });
    expect(conditions).toContainEqual({ column: 'status', op: 'eq', value: 'limited' });
    expect(conditions).toContainEqual({
      op: 'or_ilike',
      columns: ['title'],
      value: '%测试%',
    });
  });

  it('reviewPosts / reviewComments：基础过滤 status ilike rejected', () => {
    for (const tabId of ['reviewPosts', 'reviewComments']) {
      expect(getBaseScopeConditions(tabId)).toEqual([
        { column: 'status', op: 'ilike', value: 'rejected' },
      ]);
    }
  });

  it('bohaiModels：基础过滤排除 moderation- 前缀', () => {
    expect(getBaseScopeConditions('bohaiModels')).toEqual([
      { column: 'mode_id', op: 'not_like', value: 'moderation-%' },
    ]);
  });

  it('日期范围与无筛选', () => {
    expect(
      buildBatchDeleteConditions({
        tabId: 'posts',
        dateField: 'created_at',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      }),
    ).toEqual([
      { column: 'created_at', op: 'gte', value: '2026-01-01' },
      { column: 'created_at', op: 'lte', value: '2026-01-31' },
    ]);
    expect(buildBatchDeleteConditions({ tabId: 'posts' })).toEqual([]);
  });
});
