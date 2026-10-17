import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

describe('E3 服务端真全选批量删除（源码守卫）', () => {
  it('批量 API：RPC 参数形状（表/筛选/预期数）', () => {
    const api = read('src/utils/api/admin-batch-api.js');
    expect(api).toContain("rpc('admin_batch_delete'");
    expect(api).toContain('p_table');
    expect(api).toContain('p_filters');
    expect(api).toContain('p_expected_count');
  });

  it('selectAllResultsMode 真接线：入口 + 服务端分流 + 退出', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('enterSelectAllScope');
    expect(view).toContain('onBulkDeleteClick');
    expect(view).toMatch(/if \(selectAllResultsMode\.value\) batchDeleteAll\(\);/);
    expect(view).toContain('batchJobResult');
    // 全选态不再把 id 塞进 selectedItems
    expect(view).toContain('selectAllResultsMode.value = true;\n  selectedItems.value = [];');
  });

  it('服务端 RPC：白名单 + 列名校验 + op 白名单 + count 预检 + 上限 + or_ilike', () => {
    const sql = read('supabase/migrations/2026101703_admin_batch_delete.sql');
    expect(sql).toContain('not (p_table = any(v_allowed))');
    expect(sql).toContain('information_schema.columns');
    expect(sql).toContain("'or_ilike'");
    expect(sql).toContain('count mismatch');
    expect(sql).toContain('cap 5000');
    expect(sql).toContain('refusing to batch delete without any filter');
    // users/points/审计表自身必须不在白名单
    expect(sql).not.toContain("'users',");
    expect(sql).not.toContain("'points',");
    expect(sql).not.toContain("'admin_audit_logs',");
  });

  it('Danger zone：输入完整 record.id 确认，不匹配静默中止', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain('onDetailDangerDelete');
    expect(view).toContain("String(input ?? '').trim() !== String(record.id)");
    const aside = read('src/views/DataManagement/components/detail/DetailAside.vue');
    expect(aside).toContain('删除此记录');
  });
});
