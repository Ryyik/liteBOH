/**
 * bohai-finalize-reply.test.js — 锁回答定稿管线（plans/025 v2 · Step 5-3）
 *
 * 关键口径（顺序不可换）：
 *   ① 空正文 → 非流式补答；② 退化 → 严格重试一次；③ 依据护栏 → clean → 洗断言；
 *   ④ 仍为空 → 回落 lastVisibleStreamContent / noValidContent；⑤ `changed` 决定壳是否写回 UI。
 */
import { describe, expect, it, vi } from 'vitest';
import { finalizeAssistantReply } from '../../src/views/BOHAI/engine/stages/finalize-reply';

const makeDeps = (over = {}) => ({
  filterThinkingContent: vi.fn((t) => t),
  cleanAssistantVisibleReply: vi.fn((t) => String(t || '').trim()),
  isDegenerateAssistantReply: vi.fn((t) => /^!+$/.test(String(t || ''))),
  ensureGroundedReply: vi.fn((t) => t),
  sanitizeCommunityEvidenceClaims: vi.fn((t) => t),
  callModelInternal: vi.fn(async () => '补答内容'),
  getFallbackModel: vi.fn(() => ({ id: 'fb' })),
  appendPromptSection: vi.fn((base) => base),
  markGenerationProgress: vi.fn(),
  appendProgressContent: vi.fn(),
  stopThinkingWhenAnswerVisible: vi.fn(),
  ...over,
});

const makeOptions = (over = {}) => ({
  assistantMessage: '正常回答',
  lastVisibleStreamContent: '',
  finalPrompt: 'FP',
  maxFinalPromptChars: 9000,
  generationModelId: 'm1',
  systemPromptContent: 'SYS',
  recentMessages: [],
  requestController: new AbortController(),
  generationProfile: {},
  ...over,
});

describe('BOHAI 回答定稿（Step 5-3）', () => {
  it('正常内容 → 原样返回，changed=false', async () => {
    const deps = makeDeps();
    const r = await finalizeAssistantReply(deps, makeOptions());
    expect(r.finalContent).toBe('正常回答');
    expect(r.changed).toBe(false);
    expect(deps.callModelInternal).not.toHaveBeenCalled();
  });

  it('空正文 → 非流式补答，且 changed=true', async () => {
    const deps = makeDeps();
    const r = await finalizeAssistantReply(deps, makeOptions({ assistantMessage: '   ' }));
    expect(deps.callModelInternal).toHaveBeenCalled();
    expect(deps.getFallbackModel).toHaveBeenCalledWith('m1');
    expect(r.finalContent).toBe('补答内容');
    expect(r.changed).toBe(true);
  });

  it('退化 → 严格重试一次', async () => {
    const deps = makeDeps();
    const r = await finalizeAssistantReply(deps, makeOptions({ assistantMessage: '!!!!' }));
    expect(deps.appendProgressContent).toHaveBeenCalledWith(
      expect.stringContaining('回答异常，正在自动重试'),
    );
    expect(r.finalContent).toBe('补答内容');
  });

  it('退化且重试仍退化 → 固定话术', async () => {
    const deps = makeDeps({ callModelInternal: vi.fn(async () => '!!!!') });
    const r = await finalizeAssistantReply(deps, makeOptions({ assistantMessage: '!!!!' }));
    expect(r.finalContent).toContain('抱歉，本轮生成内容异常');
  });

  it('最终为空 → 回落 lastVisibleStreamContent', async () => {
    const deps = makeDeps({
      callModelInternal: vi.fn(async () => ''),
      ensureGroundedReply: vi.fn(() => ''),
      sanitizeCommunityEvidenceClaims: vi.fn((t) => String(t || '')),
    });
    const r = await finalizeAssistantReply(
      deps,
      makeOptions({ assistantMessage: '', lastVisibleStreamContent: '上一帧' }),
    );
    expect(r.finalContent).toBe('上一帧');
  });

  it('有可见正文时调用 stopThinkingWhenAnswerVisible', async () => {
    const deps = makeDeps();
    await finalizeAssistantReply(deps, makeOptions());
    expect(deps.stopThinkingWhenAnswerVisible).toHaveBeenCalled();
  });
});
