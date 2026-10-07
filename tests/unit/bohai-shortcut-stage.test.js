/**
 * bohai-shortcut-stage.test.js — 锁「前置捷径」阶段的**顺序与短路语义**（plans/025 v2 · Step 5-1）
 *
 * 为什么必须锁顺序：这四条是「谁先命中谁负责」的链，顺序错了不会报错 ——
 * 只会让发帖草稿被资源搜索抢走输入（资源搜索最"宽"），症状是「偶尔不出草稿」。
 */
import { describe, expect, it, vi } from 'vitest';
import { runShortcutBranches } from '../../src/views/BOHAI/engine/stages/shortcuts';

const makeCtx = (results = {}) => {
  const calls = [];
  const mk = (name) =>
    vi.fn(async () => {
      calls.push(name);
      return Boolean(results[name]);
    });
  return {
    calls,
    ctx: {
      handlePendingTreeholeCreationReply: mk('treehole'),
      tryStartActionDraftFromUserInput: mk('draft'),
      tryStartPageCreationFromUserInput: mk('page'),
      handleResourceSearchRequest: mk('resource'),
    },
  };
};

describe('BOHAI 前置捷径阶段（Step 5-1）', () => {
  it('全不命中 → false，且四条都跑过（顺序固定）', async () => {
    const { calls, ctx } = makeCtx();
    await expect(runShortcutBranches(ctx, { userText: 'hi', sessionIndex: 0 })).resolves.toBe(
      false,
    );
    expect(calls).toEqual(['treehole', 'draft', 'page', 'resource']);
  });

  it('树洞回复命中 → 短路，后面三条不再跑', async () => {
    const { calls, ctx } = makeCtx({ treehole: true });
    await expect(runShortcutBranches(ctx, { userText: 'x', sessionIndex: 0 })).resolves.toBe(true);
    expect(calls).toEqual(['treehole']);
  });

  it('发帖草稿命中 → 只跑到第二条', async () => {
    const { calls, ctx } = makeCtx({ draft: true });
    await expect(runShortcutBranches(ctx, { userText: 'x', sessionIndex: 3 })).resolves.toBe(true);
    expect(calls).toEqual(['treehole', 'draft']);
  });

  it('资源搜索命中 → 跑满四条才短路（它必须在最后）', async () => {
    const { calls, ctx } = makeCtx({ resource: true });
    await expect(runShortcutBranches(ctx, { userText: 'x', sessionIndex: 0 })).resolves.toBe(true);
    expect(calls).toEqual(['treehole', 'draft', 'page', 'resource']);
  });

  it('userText / sessionIndex 按约定透传', async () => {
    const { ctx } = makeCtx();
    await runShortcutBranches(ctx, { userText: 'q', sessionIndex: 7 });
    expect(ctx.handlePendingTreeholeCreationReply).toHaveBeenCalledWith('q');
    expect(ctx.tryStartActionDraftFromUserInput).toHaveBeenCalledWith('q', 7);
    expect(ctx.tryStartPageCreationFromUserInput).toHaveBeenCalledWith('q', 7);
    expect(ctx.handleResourceSearchRequest).toHaveBeenCalledWith('q');
  });
});
