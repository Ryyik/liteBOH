import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRecordBreadcrumb } from '@/views/DataManagement/composables/detail-breadcrumb.js';

const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

describe('buildRecordBreadcrumb', () => {
  it('正常：4 级面包屑', () => {
    expect(
      buildRecordBreadcrumb({
        moduleLabel: '运营',
        tabLabel: '活动管理',
        recordTitle: '八周年庆典',
      }),
    ).toEqual(['数据管理', '运营', '活动管理', '八周年庆典']);
  });

  it('缺 recordTitle：回退「未命名记录」', () => {
    expect(buildRecordBreadcrumb({ moduleLabel: '运营', tabLabel: '活动管理' })).toEqual([
      '数据管理',
      '运营',
      '活动管理',
      '未命名记录',
    ]);
  });

  it('缺 tabLabel：该级被过滤，不出现空串', () => {
    const crumbs = buildRecordBreadcrumb({ moduleLabel: '运营', recordTitle: 'R' });
    expect(crumbs).toEqual(['数据管理', '运营', 'R']);
    expect(crumbs).not.toContain('');
  });

  it('特殊字符：原样保留不转义', () => {
    expect(
      buildRecordBreadcrumb({ moduleLabel: '运营', tabLabel: '活动管理', recordTitle: '<b>&"' }),
    ).toContain('<b>&"');
  });
});

describe('detail route wiring', () => {
  it('路由与 DataAdmin 分支接线存在', () => {
    const routes = read('src/router/routes/admin.ts');
    expect(routes).toContain('DataManagementRecord');
    expect(routes).toContain("path: '/admin/data-management/:tab/:id'");
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('<RecordPane');
    expect(view).toContain('openRecordDetail');
    expect(view).toContain('goBackToList');
    // 详情路由的 tab 必须进 currentTab（2026-10-17 审查 P0：否则编辑/删除指向 users）
    expect(view).toContain('router.currentRoute.value?.params?.tab');
    expect(view).toContain('initialDetailTab');
    expect(view).toContain('activeModule.value = detailModule');
    // 取数走 api 收口（layering：UI 层不新增直连出口）
    expect(read('src/utils/api/data-admin-table-api.js')).toContain('fetchRecordById');
  });
});
