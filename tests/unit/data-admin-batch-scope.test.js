import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildBatchDeleteConditions,
  buildBatchDeleteScope,
  getBaseScopeConditions,
} from '@/views/DataManagement/composables/data-admin-batch-scope.js';
import { buildSearchFilters, buildSearchMatchSpec } from '@/utils/search-core.js';
import {
  endOfDayIso,
  resolveAdvancedRules,
} from '@/views/DataManagement/composables/useDataAdminFilters.js';

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

  it('bohaiModels：基础过滤是 not_like，服务端不支持 → 明确 block，而不是丢掉这条条件', () => {
    // 丢掉这条条件会变成「连内部模型一起删」，所以宁可拒绝整次操作
    expect(getBaseScopeConditions('bohaiModels')).toEqual([
      { column: 'mode_id', op: 'not_like', value: 'moderation-%' },
    ]);
    const scope = buildBatchDeleteScope({
      tabId: 'bohaiModels',
      searchQuery: 'x',
      searchColumns: ['display_name'],
    });
    expect(scope.blocked?.code).toBe('base-scope-op');
    expect(scope.conditions).toEqual([]);
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
      // 截止日 = 当天 23:59:59（与列表 applySearchAndSort 同一换算），不是当天 00:00
      { column: 'created_at', op: 'lte', value: endOfDayIso('2026-01-31') },
    ]);
    expect(buildBatchDeleteConditions({ tabId: 'posts' })).toEqual([]);
  });
});

describe('与列表查询同口径（plans/042 B3 前置）', () => {
  const SEARCH_FIELDS = {
    products: [
      { column: 'id', type: 'number' },
      { column: 'title', type: 'text' },
      { column: 'description', type: 'text' },
    ],
    forum: [
      { column: 'id', type: 'uuid' },
      { column: 'author_id', type: 'uuid' },
      { column: 'content', type: 'text' },
    ],
  };

  it('LIKE 通配符按字面量转义（搜「50%」不能被当成通配符）', () => {
    const scope = buildBatchDeleteScope({
      tabId: 'products',
      searchFields: SEARCH_FIELDS.products,
      searchQuery: '50%',
    });
    expect(scope.conditions).toEqual([
      { op: 'or_ilike', columns: ['title', 'description'], value: '%50\\%%' },
    ]);
    // 列表侧拼出来的 or() 片段与这里列一致
    expect(buildSearchFilters('products', '50%', SEARCH_FIELDS)).toEqual([
      'title.ilike.%50\\%%',
      'description.ilike.%50\\%%',
    ]);
  });

  it('uuid 字段不参与 contains（列表也跳过），只有文本列进 or_ilike', () => {
    const scope = buildBatchDeleteScope({
      tabId: 'forum',
      searchFields: SEARCH_FIELDS.forum,
      searchQuery: '围巾',
    });
    expect(scope.conditions).toEqual([{ op: 'or_ilike', columns: ['content'], value: '%围巾%' }]);
    expect(buildSearchFilters('forum', '围巾', SEARCH_FIELDS)).toEqual(['content.ilike.%围巾%']);
  });

  it('单列搜索也保留 or_ilike 分组（与历史条件形状一致，语义等价）', () => {
    const scope = buildBatchDeleteScope({
      tabId: 'lotteries',
      searchFields: [{ column: 'title', type: 'text' }],
      searchQuery: '中秋',
    });
    expect(scope.conditions).toEqual([{ op: 'or_ilike', columns: ['title'], value: '%中秋%' }]);
  });

  it('关键词是 UUID → 列表会额外精确匹配 id，删除侧无法表达 → block', () => {
    const keyword = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
    const spec = buildSearchMatchSpec('forum', keyword, SEARCH_FIELDS);
    expect(spec.columns.some((item) => item.op === 'eq')).toBe(true);
    const scope = buildBatchDeleteScope({
      tabId: 'forum',
      searchFields: SEARCH_FIELDS.forum,
      searchQuery: keyword,
    });
    expect(scope.blocked?.code).toBe('mixed-search');
  });

  it('数字主键表：纯数字关键词同样 block（不能悄悄只删文本命中的那部分）', () => {
    const scope = buildBatchDeleteScope({
      tabId: 'products',
      searchFields: SEARCH_FIELDS.products,
      searchQuery: '42',
    });
    expect(scope.blocked?.code).toBe('mixed-search');
  });

  it('`id:` 前缀只命中主键，单条条件 → 可以删（与列表等价）', () => {
    const scope = buildBatchDeleteScope({
      tabId: 'forum',
      searchFields: SEARCH_FIELDS.forum,
      searchQuery: 'id:00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
    });
    expect(scope.blocked).toBeNull();
    expect(scope.conditions).toEqual([
      { column: 'id', op: 'eq', value: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b' },
    ]);
  });
});

describe('接线守卫（plans/042 B3）', () => {
  const view = () =>
    readFileSync(
      resolve(import.meta.dirname, '../..', 'src/views/DataManagement/DataAdmin.vue'),
      'utf8',
    );

  it('高级筛选不再被前端直接拦死，且把规则/白名单交给条件装配', () => {
    const source = view();
    expect(source).not.toContain('高级筛选下的全量删除暂不支持');
    expect(source).toContain('buildBatchDeleteScope(');
    expect(source).toContain('advancedRules: activeAdvancedRules.value');
    // 白名单必须与列表用同一份（虚拟列排除）
    expect(source).toMatch(
      /allowedAdvancedFields: \(currentColumns\.value \|\| \[\]\)\.filter\(\(c\) => !c\.virtual\)/,
    );
  });

  it('blocked 走提示而不是静默 return', () => {
    const source = view();
    expect(source).toContain('if (blocked) {');
    expect(source).toContain('showToast(blocked.message,');
  });
});

describe('高级筛选编译成服务端条件（plans/042 B3）', () => {
  const ALLOWED = ['title', 'points_cost', 'category'];

  it('contains / starts / eq 三种算子', () => {
    expect(
      buildBatchDeleteConditions({
        tabId: 'products',
        advancedRules: [
          { field: 'title', operator: 'contains', value: '围巾' },
          { field: 'category', operator: 'starts', value: '冬' },
          { field: 'points_cost', operator: 'eq', value: '100' },
        ],
        allowedAdvancedFields: ALLOWED,
      }),
    ).toEqual([
      { column: 'title', op: 'ilike', value: '%围巾%' },
      { column: 'category', op: 'ilike', value: '冬%' },
      { column: 'points_cost', op: 'eq', value: '100' },
    ]);
  });

  it('LIKE 类规则也转义（与列表 applyAdvancedFilters 一致）', () => {
    expect(
      buildBatchDeleteConditions({
        tabId: 'products',
        advancedRules: [{ field: 'title', operator: 'contains', value: '50%' }],
        allowedAdvancedFields: ALLOWED,
      }),
    ).toEqual([{ column: 'title', op: 'ilike', value: '%50\\%%' }]);
  });

  it('不在白名单 / 值为空 / 算子非法的规则被忽略 —— 列表也是这么做的', () => {
    const rules = [
      { field: 'id', operator: 'eq', value: '1' },
      { field: 'title', operator: 'contains', value: '   ' },
      { field: 'title', operator: 'regex', value: 'x' },
      { field: 'title', operator: 'contains', value: '围巾' },
    ];
    expect(resolveAdvancedRules(rules, ALLOWED)).toEqual([
      { field: 'title', operator: 'contains', value: '围巾' },
    ]);
    expect(
      buildBatchDeleteConditions({
        tabId: 'products',
        advancedRules: rules,
        allowedAdvancedFields: ALLOWED,
      }),
    ).toEqual([{ column: 'title', op: 'ilike', value: '%围巾%' }]);
  });

  it('搜索 + 状态 + 高级规则可以叠加，顺序稳定', () => {
    expect(
      buildBatchDeleteConditions({
        tabId: 'products',
        statusField: 'category',
        statusFilter: 'winter',
        searchFields: [{ column: 'title', type: 'text' }],
        searchQuery: '围巾',
        advancedRules: [{ field: 'points_cost', operator: 'gte', value: '100' }],
        allowedAdvancedFields: ALLOWED,
      }),
    ).toEqual([
      { column: 'category', op: 'eq', value: 'winter' },
      { op: 'or_ilike', columns: ['title'], value: '%围巾%' },
      { column: 'points_cost', op: 'gte', value: '100' },
    ]);
  });
});
