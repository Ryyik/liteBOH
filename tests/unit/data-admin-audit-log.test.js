import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// mock supabase 客户端：避免顶层初始化依赖 env（同 csv-export 拆分理由的镜像面）
vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from '@/utils/supabase-client.js';
import { logAdminAction, AUDIT_ACTIONS } from '@/utils/api/admin-audit-api.js';

const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logAdminAction（审计埋点）', () => {
  it('RPC 成功：参数按 p_* 形状透传，返回 { ok: true }（不 throw）', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null });
    await expect(
      logAdminAction({
        action: 'delete',
        table: 'lotteries',
        id: 'a1',
        diff: null,
        meta: { tab: 'lotteries' },
      }),
    ).resolves.toEqual({ ok: true, error: null });
    expect(supabase.rpc).toHaveBeenCalledWith('log_admin_action', {
      p_action: 'delete',
      p_resource_table: 'lotteries',
      p_resource_id: 'a1',
      p_diff: null,
      p_meta: { tab: 'lotteries' },
    });
  });

  it('RPC 返回 error：只 warn 不抛出，但把失败暴露给调用方（ok: false）', async () => {
    const error = { message: 'PGRST202 未部署' };
    supabase.rpc.mockResolvedValueOnce({ error });
    await expect(logAdminAction({ action: 'delete', table: 't' })).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it('RPC 抛异常（网络/权限）：吞掉不向上传播，同样返回 ok: false', async () => {
    const boom = new Error('boom');
    supabase.rpc.mockRejectedValueOnce(boom);
    await expect(logAdminAction({ action: 'delete', table: 't' })).resolves.toEqual({
      ok: false,
      error: boom,
    });
  });

  it('action 白名单与服务端 log_admin_action 保持一致', () => {
    expect(AUDIT_ACTIONS).toEqual([
      'create',
      'update',
      'delete',
      'batch_delete',
      'grant',
      'moderate',
      'export',
    ]);
  });
});

describe('审计埋点接线（源码守卫）', () => {
  it('六类动作都有埋点：删除/批量/保存(带diff)/发放/审核/导出', () => {
    const mutations = read('src/views/DataManagement/composables/useDataAdminMutations.js');
    expect(mutations).toContain("action: 'delete'");
    expect(mutations).toContain("action: 'batch_delete'");
    expect(mutations).toContain("action: 'moderate'");
    const view = read('src/views/DataManagement/DataAdmin.vue');
    expect(view).toContain("action: 'update'");
    expect(view).toContain("action: 'create'");
    const exp = read('src/views/DataManagement/composables/useDataAdminExport.js');
    expect(exp).toContain("action: 'export'");
    // 旧的单数表直插已收口
    expect(exp).not.toContain("from('admin_audit_log')");
  });

  it('审计失败必须让人看见（plans/042 B3）：删除/批量删除不能用 success 文案盖过去', () => {
    const mutations = read('src/views/DataManagement/composables/useDataAdminMutations.js');
    expect(mutations).toContain('审计日志未写入');
    // 关键点：成功文案只在 audit.ok 时出现，否则 warning
    expect(mutations).toContain('if (audit.ok) showToast');
    expect(mutations).not.toMatch(
      /logAdminAction\(\{[\s\S]{0,400}?\}\);\s*showToast\('批量删除成功'/,
    );
  });

  it('审计页三处配置齐备（tabs/tabIds/TABS_ACTIONS）', () => {
    const tabs = read('src/views/DataManagement/config/tabs.js');
    expect(tabs).toContain("id: 'adminAuditLogs'");
    expect(tabs).toContain("'adminAuditLogs',");
    expect(tabs).toContain("adminAuditLogs: ['view']");
    const tables = read('src/views/DataManagement/config/tables.js');
    expect(tables).toContain("table: 'admin_audit_logs'");
  });
});
