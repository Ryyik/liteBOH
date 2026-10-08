/**
 * bohai-agent-cluster-stage.test.js — 锁 Agent 集群分支阶段（plans/025 v2 · Step 5-2）
 *
 * 关键口径：
 *   ① 成功 → 答案写进消息；② degraded → 追加降级说明；
 *   ③ AbortError → 写「已停止生成。」；④ **finally 一定复位**（4 个状态 + 计时器）；
 *   ⑤ `webSearch` 只在 `isSearching` 为真时注入。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runAgentClusterStage } from '../../src/views/BOHAI/engine/stages/agent-cluster';

const CHAT_ENGINE = 'src/views/BOHAI/composables/useChatEngine.js';
const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');

const makeSession = () => ({ messages: [], isLoading: false, isThinking: false });

const makeCtx = (over = {}) => ({
  isStreamingGeneration: { value: false },
  activeGenerationSessionIndex: { value: null },
  abortController: { value: null },
  currentModeId: { value: 'agent-cluster' },
  runtimeChatModes: { value: [] },
  runtimeAvailableModels: { value: [{ id: 'm1' }] },
  currentModel: { value: { id: 'm1' } },
  isSearching: { value: false },
  userInfo: { value: { id: 'u1' } },
  appendUserMessageWithTitle: vi.fn(),
  resetComposerInput: vi.fn(),
  clearAttachedContext: vi.fn(),
  scrollToBottom: vi.fn(),
  ensureContextCompression: vi.fn(async () => {}),
  getSessionByIndex: vi.fn(() => null),
  stopThinkingTimer: vi.fn(),
  runAgentClusterBranch: vi.fn(async () => ({ answer: '答案' })),
  applyAgentClusterEvent: vi.fn(),
  resetAgentClusterState: vi.fn(),
  agentClusterState: { lastError: null },
  clusterSources: {
    invokeRetriever: () => {},
    invokeSharedMemory: () => {},
    invokeCloud: () => {},
  },
  getModelForModeId: vi.fn(() => ({ id: 'm1' })),
  callModelInternal: vi.fn(async () => 'x'),
  ...over,
});

const abortError = () => {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
};

describe('BOHAI Agent 集群分支阶段（Step 5-2）', () => {
  it('成功后答案写进消息；finally 复位 4 个状态 + 计时器', async () => {
    const session = makeSession();
    const ctx = makeCtx({ getSessionByIndex: () => session });
    await runAgentClusterStage(ctx, { sessionIndex: 0, userText: '你好', session });

    expect(session.messages).toHaveLength(1);
    expect(session.messages[0]).toMatchObject({ role: 'assistant', content: '答案' });
    // finally 收尾
    expect(session.isLoading).toBe(false);
    expect(session.isThinking).toBe(false);
    expect(ctx.isStreamingGeneration.value).toBe(false);
    expect(ctx.activeGenerationSessionIndex.value).toBe(null);
    expect(ctx.abortController.value).toBe(null);
    expect(ctx.stopThinkingTimer).toHaveBeenCalled();
  });

  it('degraded → 在答案后追加降级说明（取 agentClusterState.lastError）', async () => {
    const session = makeSession();
    const ctx = makeCtx({
      getSessionByIndex: () => session,
      runAgentClusterBranch: vi.fn(async () => ({ answer: 'a', degraded: true })),
      agentClusterState: { lastError: 'boom' },
    });
    await runAgentClusterStage(ctx, { sessionIndex: 0, userText: 'x', session });
    expect(session.messages[0].content).toContain('a');
    expect(session.messages[0].content).toContain('Agent 集群已降级');
    expect(session.messages[0].content).toContain('boom');
  });

  it('AbortError → 写「已停止生成。」并派发 cancelled 事件', async () => {
    const session = makeSession();
    const ctx = makeCtx({
      getSessionByIndex: () => session,
      runAgentClusterBranch: vi.fn(async () => {
        throw abortError();
      }),
    });
    await runAgentClusterStage(ctx, { sessionIndex: 0, userText: 'x', session });
    expect(session.messages[0].content).toBe('已停止生成。');
    expect(ctx.applyAgentClusterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cancelled' }),
    );
  });

  it('非 abort 失败 → 写「多任务处理失败，请重试。」并派发 error 事件', async () => {
    const session = makeSession();
    const ctx = makeCtx({
      getSessionByIndex: () => session,
      runAgentClusterBranch: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await runAgentClusterStage(ctx, { sessionIndex: 0, userText: 'x', session });
    expect(session.messages[0].content).toBe('多任务处理失败，请重试。');
    expect(ctx.applyAgentClusterEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
  });

  it('webSearch 只在 isSearching 为真时注入；userId 透传', async () => {
    const session = makeSession();
    const ctx = makeCtx({ getSessionByIndex: () => session, isSearching: { value: false } });
    await runAgentClusterStage(ctx, { sessionIndex: 0, userText: 'x', session });
    let arg = ctx.runAgentClusterBranch.mock.calls[0][0];
    expect(arg.webSearch).toBeUndefined();
    expect(arg.userId).toBe('u1');

    const ctx2 = makeCtx({ getSessionByIndex: () => session, isSearching: { value: true } });
    await runAgentClusterStage(ctx2, { sessionIndex: 0, userText: 'x', session });
    arg = ctx2.runAgentClusterBranch.mock.calls[0][0];
    expect(typeof arg.webSearch).toBe('function');
  });

  it('壳仍接线：sendMessage 里调用该 stage 并在其后 return', () => {
    const code = read(CHAT_ENGINE);
    expect(code).toContain('await runAgentClusterStage(');
    // 集群分支必须在 stage 调用之后立刻 return（不再落入主检索）
    const idx = code.indexOf('await runAgentClusterStage(');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 900)).toContain('return;');
  });
});
