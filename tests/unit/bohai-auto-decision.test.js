import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasExplicitAutoSaveIntent,
  isLookupOrSummaryRequest,
  resolveAutoModeDecisionLocally,
} from '../../src/views/BOHAI/engine/bohai-auto-decision.js';
import { clearRouteDecisionCache } from '../../src/views/BOHAI/engine/bohai-auto-router.js';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-02 收口：本文件原先覆盖 16 个导出（含 mergeAutoDecisionWithLocalGuardrails
// 合并链、safeParseAutoClassifierJson 解析器、modeId 推导等）。那些函数在生产代码里
// 没有消费方，只被本文件引用 —— 即「测试给死代码续命」。相关代码与断言已一并删除。
// 依据见 plans/024-bohai-rules-and-latency-slimming.md §1.4。
// ─────────────────────────────────────────────────────────────────────────────

// 2026-10-04：Cloud+ 写入与「两处同存」下线 ⇒ 保存字段只剩这两个。
const SAVE_KEYS = ['shouldSaveSharedMemory', 'saveDestination'];

describe('bohai-auto-decision: 纯判定函数', () => {
  it('hasExplicitAutoSaveIntent 只在显式表达保存时返回 true', () => {
    expect(hasExplicitAutoSaveIntent('把这条存到我的 Cloud+ 随手记里')).toBe(true);
    expect(hasExplicitAutoSaveIntent('这条写入公共记忆库')).toBe(true);
    expect(hasExplicitAutoSaveIntent('帮我记一下今天的想法')).toBe(true);
    expect(hasExplicitAutoSaveIntent('今天天气不错')).toBe(false);
    expect(hasExplicitAutoSaveIntent('')).toBe(false);
  });

  it('isLookupOrSummaryRequest 要求「动作词 + 数据源」同时出现', () => {
    expect(isLookupOrSummaryRequest('总结一下论坛最近发生的事')).toBe(true);
    expect(isLookupOrSummaryRequest('看看我的 Cloud+ 记录')).toBe(true);
    // 只有动作词、没有数据源
    expect(isLookupOrSummaryRequest('总结一下这段话')).toBe(false);
    // 只有数据源、没有动作词
    expect(isLookupOrSummaryRequest('论坛里的帖子')).toBe(false);
    // ⚠️「公告」本身就在动作词表里，所以这句算查询请求
    expect(isLookupOrSummaryRequest('论坛最近有什么公告')).toBe(true);
  });
});

describe('bohai-auto-decision: resolveAutoModeDecisionLocally 裁剪', () => {
  beforeEach(() => {
    clearRouteDecisionCache();
  });

  it('普通保存请求不被裁剪', () => {
    const result = resolveAutoModeDecisionLocally('这条写入公共记忆库');
    expect(result.shouldSaveSharedMemory).toBe(true);
    expect(result.saveDestination).toBe('shared');
  });

  it('发帖草稿请求一律裁掉保存意图', () => {
    // 用户既说要写帖子、又说了保存 —— 沿用收口前的既有行为：草稿态不弹保存追问
    const result = resolveAutoModeDecisionLocally('帮我写一篇帖子，记一下今天的活动', {
      helpers: { isPostDraftRequest: () => true },
    });
    for (const key of SAVE_KEYS) {
      expect(result[key]).toBe(key === 'saveDestination' ? 'none' : false);
    }
  });

  it('查询/总结请求在没有显式保存意图时裁掉保存意图', () => {
    const result = resolveAutoModeDecisionLocally('总结一下论坛最近发生的事');
    expect(result.saveDestination).toBe('none');
    expect(result.shouldSaveSharedMemory).toBe(false);
  });

  it('查询/总结请求若同时显式表达了保存意图，则保留', () => {
    const text = '总结一下论坛最近的帖子，写入公共记忆库';
    const result = resolveAutoModeDecisionLocally(text);
    expect(result.shouldSaveSharedMemory).toBe(true);
    expect(result.saveDestination).toBe('shared');
  });

  it('裁剪不会动 shouldReferenceCloud', () => {
    const result = resolveAutoModeDecisionLocally('根据我的 Cloud+ 最近记录总结一下我最近的日常', {
      helpers: { isPostDraftRequest: () => true },
    });
    expect(result.shouldReferenceCloud).toBe(true);
  });

  it('返回 3 个字段的浅拷贝，不污染缓存对象', () => {
    const first = resolveAutoModeDecisionLocally('这条写入公共记忆库', {
      helpers: { isPostDraftRequest: () => true },
    });
    const second = resolveAutoModeDecisionLocally('这条写入公共记忆库');
    expect(first.saveDestination).toBe('none');
    // 若裁剪写回了缓存对象，第二次会拿到被改过的 none
    expect(second.saveDestination).toBe('shared');
  });
});
