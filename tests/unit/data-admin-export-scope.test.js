import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCsvContent } from '@/views/DataManagement/composables/csv-export.js';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const COLS = [
  { key: 'name', label: '名称' },
  { key: 'count', label: '数量' },
];

describe('buildCsvContent', () => {
  it('表头用列 label，行数 = 数据行数', () => {
    const csv = buildCsvContent([{ name: '活动A', count: 3 }], COLS);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('名称');
    expect(lines[1]).toContain('活动A');
  });

  it('保留 CSV 注入防护', () => {
    const csv = buildCsvContent([{ name: '=cmd|calc', count: 1 }], COLS);
    expect(csv).toContain(`"'=cmd|calc"`);
  });

  it('空数组只出表头', () => {
    expect(buildCsvContent([], COLS).split('\n')).toHaveLength(1);
  });

  it('对象值序列化为 JSON', () => {
    const csv = buildCsvContent([{ name: { a: 1 }, count: 1 }], COLS);
    // JSON.stringify({a:1}) = {"a":1}，写入 CSV 时内部引号翻倍
    expect(csv).toContain('{""a"":1}');
  });
});

describe('export menu wiring', () => {
  it('导出菜单有两项且文案带条数', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('exportMenuItems');
    expect(view).toContain('导出当前页');
    expect(view).toContain('导出全部筛选结果');
    expect(view).toContain('ExportMenu');
  });

  it('全量导出走独立函数且回执条数', () => {
    const exp = read('src/views/DataManagement/composables/useDataAdminExport.js');
    expect(exp).toContain('exportAllFiltered');
    expect(exp).toContain('fetchAllFilteredRows');
    expect(exp).toContain('已导出');
  });

  it('全量导出复刻列表的 tab 级基础过滤（plans/027 S2 验收：条数=页脚）', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    // decorateQuery 必须带上 fetchTabData 同款的特殊基础过滤，
    // 否则 reportedPosts / reviewPosts / reviewComments / bohaiModels 四个 tab
    // 的「全部筛选结果」条数与页脚「共 N 条」对不上。
    expect(view).toContain('fetchAllFilteredRows');
    expect(view).toContain("decorated = decorated.eq('status', 'limited')");
    expect(view).toContain("decorated = decorated.ilike('status', 'rejected')");
    expect(view).toContain('excludeInternalBohaiModes(decorated)');
    expect(view).toContain('decorateQuery');
  });

  it('supabase.from 收口在 api 层，且每轮重建 query（.range() 原地改状态）', () => {
    const api = read('src/utils/api/data-admin-table-api.js');
    expect(api).toContain('fetchAllRows');
    expect(api).toContain('supabase.from(table).select(columns)');
    expect(api).toContain('legacyFallback');
  });

  it('超过导出上限给出明确报错而非静默截断', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('EXPORT_MAX_ROWS');
    const api = read('src/utils/api/data-admin-table-api.js');
    expect(api).toContain('请先缩小筛选范围再导出');
  });
});
