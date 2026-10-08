/**
 * stream.ts — **流式消费**阶段（plans/025 v2 · Step 5-3 第六刀，5-3 收干）
 *
 * 发请求 → 读 SSE → 逐块过滤思考内容 → 打字机写 UI → 判退化 → 收尾 flush。
 *
 * ⚠️ 三条**设计取舍**（与 `retrieval.ts` 同源）：
 *   1. **可变状态放进 `state` 对象**（stage 就地读写）：`assistantMessage` / `lastVisibleStreamContent` /
 *      `shouldRepairDegenerateStream` / `hasReceivedVisibleAnswer` / `idleTimer` —— 它们全都要跨到
 *      后面的「心理守门 / 回答定稿」阶段，放壳里由 `state` 承载最省心；
 *   2. **`stopThinkingWhenAnswerVisible` 由壳持有**（`deps` 注入）：它闭包 `markTiming` /
 *      `clearThinkingStatus`，且 `finalize-reply` 阶段还要用它 —— 若放 stage 里就得把闭包**当返回值**传出去；
 *   3. **`thinkingState` / `sseParser` / `idleTimer` 是纯局部**，不暴露。
 *
 * ⚠️ 两条**行为不可改**：
 *   ① 收到首个**可见** token 才 `markTiming('firstTokenMs')`（否则量到的是「请求发出」不是「用户看到」）；
 *   ② 退化被判定后**立即 `reader.cancel()` 并跳出循环**（不再消费剩余流），且此后不再写 UI。
 */
import { nextTick } from 'vue';
import { logger } from '@/utils/logger.js';

/** 空闲超时计时器的**引用容器**（壳持有 ⇒ `finally` 里能清；避免 stage 私有计时器泄漏）。 */
export interface IdleTimerRef {
  current: ReturnType<typeof setTimeout> | null;
}

export interface StreamStageState {
  assistantMessage: string;
  lastVisibleStreamContent: string;
  shouldRepairDegenerateStream: boolean;
  hasReceivedVisibleAnswer: boolean;
}

export interface SseLineParserLike {
  push: (chunk: string) => void;
  isDone: () => boolean;
  flush: () => void;
  getError?: () => unknown;
}

export interface StreamStageDeps {
  callVaultSiliconChatStream: (input: Record<string, unknown>) => Promise<{
    body: ReadableStream<Uint8Array>;
  }>;
  createThinkingState: () => unknown;
  createSseLineParser: (onPayload: (payload: string) => void) => SseLineParserLike;
  filterThinkingContentStream: (content: string, state: unknown) => string;
  flushThinkingBuffer: (state: unknown) => string;
  safeChunkToString: (raw: unknown) => string;
  isDegenerateStreamOutput: (text: string) => boolean;
  filterThinkingContent: (text: string) => string;
  cleanAssistantVisibleReply: (text: string) => string;
  resetGenerationStallTimeout: (reason: string) => void;
  updateContent: (text: string) => void;
  scrollToBottom: () => void;
  markGenerationProgress: (status: string) => void;
  appendProgressContent: (text: string) => void;
  stopThinkingWhenAnswerVisible: () => void;
}

export interface StreamStageOptions {
  provider: string;
  purpose: string;
  mode: string;
  apiUrl: string;
  timeoutMs: number;
  signal: AbortSignal;
  payload: unknown;
  state: StreamStageState;
  idleTimerRef: IdleTimerRef;
}

export const runStreamStage = async (
  deps: StreamStageDeps,
  {
    provider,
    purpose,
    mode,
    apiUrl,
    timeoutMs,
    signal,
    payload,
    state,
    idleTimerRef,
  }: StreamStageOptions,
): Promise<void> => {
  // 创建流专用的思考过滤状态
  const thinkingState = deps.createThinkingState();

  const response = await deps.callVaultSiliconChatStream({
    provider,
    purpose,
    mode,
    apiUrl,
    timeoutMs,
    signal,
    payload,
  });

  // B9 fix: callVaultSiliconChatStream 已在内部对 !response.ok 抛出错误，
  // 此处 response 必定 ok 且 body 为可读流，移除不可达的 !response.ok 检查。
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  idleTimerRef.current = null;
  const readNextStreamChunk = async (): Promise<{
    done: boolean;
    value?: Uint8Array;
    idleTimeout?: boolean;
  }> => {
    if (!state.hasReceivedVisibleAnswer) return reader.read();
    return Promise.race([
      reader.read(),
      new Promise<{ done: boolean; value?: undefined; idleTimeout: boolean }>((resolve) => {
        idleTimerRef.current = setTimeout(() => {
          resolve({ done: true, value: undefined, idleTimeout: true });
        }, 2500);
      }),
    ]).finally(() => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    });
  };
  const sseParser = deps.createSseLineParser((payloadChunk) => {
    try {
      const data = JSON.parse(payloadChunk);
      const delta = data.choices?.[0]?.delta || {};
      const rawContent = delta.content || '';

      if (rawContent) {
        deps.resetGenerationStallTimeout('正在接收模型输出');
        const content = deps.safeChunkToString(rawContent);
        const filteredContent = deps.filterThinkingContentStream(content, thinkingState);
        if (filteredContent && filteredContent !== '[object Object]') {
          if (state.shouldRepairDegenerateStream) {
            return;
          }
          if (String(filteredContent).trim()) {
            deps.stopThinkingWhenAnswerVisible();
          }
          state.assistantMessage += filteredContent;
          const visibleStreamContent = deps.cleanAssistantVisibleReply(
            deps.filterThinkingContent(state.assistantMessage),
          );
          if (visibleStreamContent) {
            state.lastVisibleStreamContent = visibleStreamContent;
          }
          deps.updateContent(state.assistantMessage);
          nextTick(deps.scrollToBottom);

          if (deps.isDegenerateStreamOutput(state.assistantMessage)) {
            state.shouldRepairDegenerateStream = true;
            deps.markGenerationProgress('生成内容异常，正在自动修复...');
            deps.appendProgressContent('回答异常，正在自动修复...\n\n');
          }
        }
      }
    } catch (e) {
      logger.error('boh-ai', 'Parse error', e);
    }
  });

  while (true) {
    const { done, value, idleTimeout } = await readNextStreamChunk();
    if (idleTimeout) {
      try {
        await reader.cancel();
      } catch (_cancelError) {
        // Ignore reader cancel errors.
      }
      break;
    }
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    sseParser.push(chunk);
    if (sseParser.isDone()) break;
    if (state.shouldRepairDegenerateStream) {
      try {
        await reader.cancel();
      } catch (_cancelError) {
        // Ignore reader cancel errors.
      }
      break;
    }
  }

  if (!state.shouldRepairDegenerateStream && !sseParser.isDone()) {
    sseParser.push(decoder.decode());
    sseParser.flush();

    // 流式处理结束，刷新缓冲区并添加剩余内容
    const remainingContent = deps.flushThinkingBuffer(thinkingState);
    if (remainingContent) {
      state.assistantMessage += remainingContent;
      const visibleStreamContent = deps.cleanAssistantVisibleReply(
        deps.filterThinkingContent(state.assistantMessage),
      );
      if (visibleStreamContent) {
        state.lastVisibleStreamContent = visibleStreamContent;
        deps.updateContent(state.assistantMessage);
        nextTick(deps.scrollToBottom);
      }
    }
  }

  // SSE error 事件处理：边缘函数在流中发送 event: error 时，抛出错误让上层捕获
  const sseError = sseParser.getError?.();
  if (sseError) {
    throw sseError;
  }
};
