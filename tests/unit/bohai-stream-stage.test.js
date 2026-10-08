/**
 * bohai-stream-stage.test.js — 锁流式消费阶段（plans/025 v2 · Step 5-3 收干）
 *
 * 关键口径：
 *   ① 逐块累积进 `state.assistantMessage` 并写 UI；
 *   ② 首个**可见** token 才触发 `stopThinkingWhenAnswerVisible`（= firstToken 埋点）；
 *   ③ 判退化后**立即 `reader.cancel()` 并跳出**，且此后不再写 UI；
 *   ④ 正常收尾要 `flush` 缓冲区剩余内容；
 *   ⑤ SSE error 事件 → **抛出**（由壳的 catch 收）。
 */
import { describe, expect, it, vi } from 'vitest';
import { runStreamStage } from '../../src/views/BOHAI/engine/stages/stream';

const chunkOf = (text) =>
  new TextEncoder().encode(JSON.stringify({ choices: [{ delta: { content: text } }] }));

const setup = ({ chunks = [], parserIsDone = false, parserError = null, depsOver = {} } = {}) => {
  let i = 0;
  const reader = {
    read: vi.fn(async () =>
      i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
    ),
    cancel: vi.fn(async () => {}),
  };
  let onPayload = null;
  const parser = {
    push: vi.fn((chunk) => {
      if (onPayload) onPayload(chunk);
    }),
    isDone: vi.fn(() => parserIsDone),
    flush: vi.fn(),
    getError: vi.fn(() => parserError),
  };
  const state = {
    assistantMessage: '',
    lastVisibleStreamContent: '',
    shouldRepairDegenerateStream: false,
    hasReceivedVisibleAnswer: false,
  };
  const idleTimerRef = { current: null };
  const deps = {
    callVaultSiliconChatStream: vi.fn(async () => ({ body: { getReader: () => reader } })),
    createThinkingState: vi.fn(() => ({})),
    createSseLineParser: vi.fn((cb) => {
      onPayload = cb;
      return parser;
    }),
    filterThinkingContentStream: vi.fn((c) => c),
    flushThinkingBuffer: vi.fn(() => ''),
    safeChunkToString: vi.fn((r) => String(r)),
    isDegenerateStreamOutput: vi.fn(() => false),
    filterThinkingContent: vi.fn((t) => t),
    cleanAssistantVisibleReply: vi.fn((t) => String(t || '').trim()),
    resetGenerationStallTimeout: vi.fn(),
    updateContent: vi.fn(),
    scrollToBottom: vi.fn(),
    markGenerationProgress: vi.fn(),
    appendProgressContent: vi.fn(),
    stopThinkingWhenAnswerVisible: vi.fn(),
    ...depsOver,
  };
  const options = {
    provider: 'siliconflow',
    purpose: 'chat',
    mode: 'auto',
    apiUrl: 'u',
    timeoutMs: 1000,
    signal: new AbortController().signal,
    payload: {},
    state,
    idleTimerRef,
  };
  return { reader, parser, state, idleTimerRef, deps, options };
};

describe('BOHAI 流式消费阶段（Step 5-3）', () => {
  it('逐块累积进 state 并写 UI；首个可见 token 触发 firstToken 回调', async () => {
    const { state, deps, options } = setup({ chunks: [chunkOf('你好'), chunkOf('世界')] });
    await runStreamStage(deps, options);
    expect(state.assistantMessage).toBe('你好世界');
    expect(deps.updateContent).toHaveBeenCalledWith('你好世界');
    expect(deps.stopThinkingWhenAnswerVisible).toHaveBeenCalled();
    expect(state.lastVisibleStreamContent).toBe('你好世界');
  });

  it('判退化 → 立即 cancel 并跳出，后续块不再写 UI', async () => {
    let n = 0;
    const { reader, state, deps, options } = setup({
      chunks: [chunkOf('!!!'), chunkOf('!!!')],
      depsOver: {
        isDegenerateStreamOutput: vi.fn(() => {
          n += 1;
          return n >= 1; // 第一块就判退化
        }),
      },
    });
    await runStreamStage(deps, options);
    expect(state.shouldRepairDegenerateStream).toBe(true);
    expect(reader.cancel).toHaveBeenCalled();
    // 只处理了第一块
    expect(deps.updateContent).toHaveBeenCalledTimes(1);
  });

  it('正常收尾 flush 缓冲区剩余内容', async () => {
    const { state, deps, options } = setup({
      chunks: [chunkOf('正文')],
      depsOver: { flushThinkingBuffer: vi.fn(() => '尾部') },
    });
    await runStreamStage(deps, options);
    expect(state.assistantMessage).toBe('正文尾部');
  });

  it('SSE error 事件 → 抛出', async () => {
    const boom = new Error('sse error');
    const { deps, options } = setup({ chunks: [chunkOf('x')], parserError: boom });
    await expect(runStreamStage(deps, options)).rejects.toThrow('sse error');
  });

  it('parser 已 done → 不再 flush（避免重复追加）', async () => {
    const flush = vi.fn(() => '尾部');
    const { deps, options } = setup({
      chunks: [chunkOf('x')],
      parserIsDone: true,
      depsOver: { flushThinkingBuffer: flush },
    });
    await runStreamStage(deps, options);
    expect(flush).not.toHaveBeenCalled();
  });

  it('请求参数透传（provider/purpose/mode/apiUrl/timeout/payload）', async () => {
    const { deps, options } = setup({ chunks: [chunkOf('x')] });
    await runStreamStage(deps, options);
    expect(deps.callVaultSiliconChatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'siliconflow',
        purpose: 'chat',
        mode: 'auto',
        apiUrl: 'u',
        timeoutMs: 1000,
      }),
    );
  });
});
