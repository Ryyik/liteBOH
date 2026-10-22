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
  createThinkingState: (hint?: string) => unknown;
  createSseLineParser: (onPayload: (payload: string) => void) => SseLineParserLike;
  filterThinkingContentStream: (content: string, state: unknown) => string;
  flushThinkingBuffer: (state: unknown) => string;
  /** 取本轮累积的推理内容（思考块里的原文，不再丢弃 ⇒ 渲染成可展开块） */
  getThinkingReasoning: (state: unknown) => string;
  safeChunkToString: (raw: unknown) => string;
  isDegenerateStreamOutput: (text: string) => boolean;
  filterThinkingContent: (text: string) => string;
  cleanAssistantVisibleReply: (text: string) => string;
  resetGenerationStallTimeout: (reason: string) => void;
  updateContent: (text: string) => void;
  /** 把推理内容写进当前 assistant 消息（与 updateContent 并列） */
  updateReasoning: (text: string) => void;
  scrollToBottom: () => void;
  markGenerationProgress: (status: string) => void;
  appendProgressContent: (text: string) => void;
  stopThinkingWhenAnswerVisible: () => void;
}

export interface StreamStageOptions {
  provider: string;
  purpose: string;
  mode: string;
  /**
   * 模型提示（displayName / mode_id）—— 只用来判断「这个模型要不要先按住开头等判定」
   * （GLM-Z1 系的思考只有闭合标签，见 `src/utils/reasoning-tags.js` 文件头）。
   * 真实上游模型名在服务端定，前端只能给这个启发式提示；不影响任何可见文本。
   */
  modelHint?: string;
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
    modelHint,
    apiUrl,
    timeoutMs,
    signal,
    payload,
    state,
    idleTimerRef,
  }: StreamStageOptions,
): Promise<void> => {
  // 创建流专用的思考过滤状态
  const thinkingState = deps.createThinkingState(modelHint);

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
  // 推理内容与正文走同一股流：每块推一次，**长度没变就不重复写**（避免无谓响应式触发）。
  // 2026-10-10「推理过程可展开」：思考块里的原文由 filterThinkingContentStream 分流累积，
  // 这里负责把它落到消息上，渲染层才有东西可展开。
  let lastReasoningLength = 0;
  const pushReasoning = () => {
    const reasoning = deps.getThinkingReasoning(thinkingState);
    if (reasoning.length === lastReasoningLength) return;
    lastReasoningLength = reasoning.length;
    deps.updateReasoning(reasoning);
  };

  const sseParser = deps.createSseLineParser((payloadChunk) => {
    try {
      const data = JSON.parse(payloadChunk);
      // 真实模型名 / 「思考走独立字段」只在上游报文里（前端拿到的是 boh:<mode_id>）——
      // 前导暂存的判定与解除都依赖它，见 createThinkingState 的 notePayload。
      (thinkingState as { notePayload?: (d?: unknown) => unknown }).notePayload?.(data);
      const delta = data.choices?.[0]?.delta || {};
      const rawContent = delta.content || '';

      if (rawContent) {
        deps.resetGenerationStallTimeout('正在接收模型输出');
        const content = deps.safeChunkToString(rawContent);
        const filteredContent = deps.filterThinkingContentStream(content, thinkingState);
        pushReasoning();
        if (filteredContent && filteredContent !== '[object Object]') {
          (thinkingState as { noteEmitted?: (t?: string) => void }).noteEmitted?.(filteredContent);
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
    pushReasoning(); // 思考块内被截断的残留也归推理（见 flushThinkingBuffer）
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
