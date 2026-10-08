/**
 * bohai-psych-guard.test.js — 锁心理访谈守门 + 状态推进（plans/025 v2 · Step 5-3 收干）
 *
 * 关键口径：
 *   ① 非访谈 → 完全不跑（连 detectViolations 都不调）；
 *   ② `shouldRepairDegenerateStream` 为真时**守门跳过**（退化修复优先级更高），但状态推进照跑；
 *   ③ **只在 `shouldAdoptRewrite` 为真时**才 `updateContent`（守门误报不得把回答改差）；
 *   ④ 留痕 `lastViolations` / `guardStats` 写入 expertState；
 *   ⑤ 状态推进用 `recordAssistantTurn(expertState, 本轮回复)`。
 */
import { describe, expect, it, vi } from 'vitest';
import { runPsychGuardStage } from '../../src/views/BOHAI/engine/stages/psych-guard';

const makeSession = () => ({
  messages: [{ content: 'a0' }, { content: 'u1' }, { content: 'a1' }],
  expertState: { guardStats: { base: 1 } },
});

const makeDeps = (session, over = {}) => ({
  cleanAssistantVisibleReply: vi.fn((t) => String(t || '').trim()),
  filterThinkingContent: vi.fn((t) => t),
  detectViolations: vi.fn(() => [{ type: 'multi-question' }]),
  shouldRewrite: vi.fn(() => true),
  buildRewriteInstruction: vi.fn(() => 'INSTR'),
  appendPromptSection: vi.fn((base, section) => base + section),
  callModelInternal: vi.fn(async () => '重写稿'),
  shouldAdoptRewrite: vi.fn(() => true),
  updateContent: vi.fn(),
  scrollToBottom: vi.fn(),
  summarizeViolations: vi.fn(() => ['multi-question']),
  bumpGuardStats: vi.fn((stats, delta) => ({ ...(stats || {}), ...delta })),
  getSessionByIndex: vi.fn(() => session),
  recordAssistantTurn: vi.fn((state, reply) => ({ ...state, advanced: true, reply })),
  ...over,
});

const makeOptions = (over = {}) => ({
  psychInterviewActive: true,
  shouldRepairDegenerateStream: false,
  assistantMessage: '本轮回答',
  session: makeSession(),
  messageIndex: 2,
  finalPrompt: 'FP',
  maxFinalPromptChars: 9000,
  generationModelId: 'm1',
  systemPromptContent: 'SYS',
  recentMessages: [],
  requestController: new AbortController(),
  generationProfile: {},
  sessionIndex: 0,
  ...over,
});

describe('BOHAI 心理守门 + 状态推进（Step 5-3）', () => {
  it('非访谈 → 完全不跑（连违规检测都不调）', async () => {
    const session = makeSession();
    const deps = makeDeps(session);
    await runPsychGuardStage(deps, makeOptions({ psychInterviewActive: false, session }));
    expect(deps.detectViolations).not.toHaveBeenCalled();
    expect(deps.recordAssistantTurn).not.toHaveBeenCalled();
  });

  it('访谈 + 违规 + 重写更优 → 替换回答', async () => {
    const session = makeSession();
    const deps = makeDeps(session);
    await runPsychGuardStage(deps, makeOptions({ session }));
    expect(deps.shouldAdoptRewrite).toHaveBeenCalled();
    expect(deps.updateContent).toHaveBeenCalledWith('重写稿');
  });

  it('访谈 + 违规但重写**不更优** → 不替换（守门不得把回答改差）', async () => {
    const session = makeSession();
    const deps = makeDeps(session, { shouldAdoptRewrite: vi.fn(() => false) });
    await runPsychGuardStage(deps, makeOptions({ session }));
    expect(deps.updateContent).not.toHaveBeenCalled();
  });

  it('退化修复中 → 守门跳过，但状态推进照跑', async () => {
    const session = makeSession();
    const deps = makeDeps(session);
    await runPsychGuardStage(deps, makeOptions({ session, shouldRepairDegenerateStream: true }));
    expect(deps.detectViolations).not.toHaveBeenCalled();
    expect(deps.recordAssistantTurn).toHaveBeenCalled();
  });

  it('留痕：lastViolations + guardStats 写入 expertState', async () => {
    const session = makeSession();
    const deps = makeDeps(session);
    await runPsychGuardStage(deps, makeOptions({ session }));
    expect(session.expertState.lastViolations).toEqual(['multi-question']);
    expect(session.expertState.guardStats).toMatchObject({
      base: 1,
      triggered: true,
      adopted: true,
    });
  });

  it('状态推进：recordAssistantTurn 收到本轮 assistant 内容', async () => {
    const session = makeSession();
    const deps = makeDeps(session);
    await runPsychGuardStage(deps, makeOptions({ session }));
    expect(deps.recordAssistantTurn).toHaveBeenCalledWith(expect.anything(), 'a1');
  });
});
