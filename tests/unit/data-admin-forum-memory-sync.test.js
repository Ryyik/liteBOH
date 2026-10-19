/**
 * data-admin-forum-memory-sync.test.js — 锁论坛事实卡审核闭环（2026-10-19）
 *
 * 背景：pending_review → active 不经过 DB 归档触发器（切片从未建过），
 * 只靠夜间 cron 的话审核闭环要等一天。保存策略必须允许审核状态，
 * 且保存后必须即时触发 forum_memory 向量同步（仅 active）。
 *
 * 断言口径（格式化宽容）：源码守卫用「数组项 / 正则」断言，不写连续子串 ——
 * lint-staged 重排文件曾令字面量断言假红（见 AGENTS.md 提交纪律）。
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SAVE_STRATEGIES } from '../../src/views/DataManagement/config/saveStrategies.js';
import { syncKnowledgeSources } from '../../src/utils/api/treehole/core-memory-api.js';
import { supabase } from '../../src/utils/supabase-client.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    functions: { invoke: vi.fn(async () => ({ data: { ok: true }, error: null })) },
  },
}));

describe('论坛事实卡审核闭环', () => {
  it('保存策略允许 pending_review / rejected（审核工作流的前提）', async () => {
    const pick = (status) =>
      SAVE_STRATEGIES.forumMemories({
        editingItem: { status },
        userId: '00000000-0000-0000-0000-000000000001',
      });

    for (const status of ['active', 'pending_review', 'archived', 'rejected']) {
      await expect(pick(status)).resolves.toMatchObject({ status });
    }
    await expect(pick('deleted')).rejects.toThrow(/仅允许/);
  });

  it('forum_memory 同步走 admin API 收口（视图层不得直连 functions.invoke）', async () => {
    await syncKnowledgeSources(['forum_memory'], 80);
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'boh-ai-retrieval',
      expect.objectContaining({
        body: expect.objectContaining({ action: 'sync', sourceTypes: ['forum_memory'] }),
      }),
    );
  });

  it('DataAdmin 保存后按 status=active 触发论坛事实卡同步（两条保存路径都有）', () => {
    const view = read('src/views/DataManagement/DataAdmin.vue');
    // 包装函数存在且收口在 syncKnowledgeSources
    expect(view).toMatch(/const syncForumMemoryIndex = async \(\) =>/);
    expect(view).toMatch(/syncKnowledgeSources\(\['forum_memory'\]\)/);
    // update / insert 两条保存路径都有「仅 active 才同步」的守卫
    const callSites = view.match(/forumMemories' && dataToSave\.status === 'active'/g) || [];
    expect(callSites.length).toBeGreaterThanOrEqual(2);
  });

  it('EF sync 通道允许管理员 JWT 同步 forum_memory（getAllowedSyncSourceTypes 口径）', () => {
    const ef = read('supabase/functions/boh-ai-retrieval/index.ts');
    expect(ef).toMatch(/forum_memory'\) return hasSecret \|\| isAdmin/);
  });
});
