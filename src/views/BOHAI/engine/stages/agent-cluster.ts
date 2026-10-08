/**
 * agent-cluster.ts — **Agent 集群分支**阶段（plans/025 v2 · Step 5-2 第五刀）
 *
 * `sendMessage` 在四条捷径之后、主检索之前，有一个**自带早退**的分支：当前模式是
 * Agent 集群（`isAgentClusterMode`）时，走完全独立的「多任务处理」链路 —— 自己压上下文、
 * 自己开 AbortController、自己管 `finally` 收尾，最后 `return`，**不进入主检索/装配**。
 *
 * 抽出来的价值：这 147 行原先嵌在 1470 行的 `sendMessage` 里，且它的 refs 收尾
 * （`isStreamingGeneration` / `activeGenerationSessionIndex` / `abortController` / `stopThinkingTimer`）
 * 与主链路**同形但独立** —— 混在一起时极易改错一侧。现在它是一个有名字、可单测的单元。
 *
 * ⚠️ 阶段签名统一 `(ctx, options)`：`ctx` 注入**有状态的 handler 与响应式 ref**，
 * `options` 传本次调用的纯数据（`sessionIndex` / `userText` / `session`）。
 * 纯常量（`BASE_SYSTEM_PROMPT` / `BOH_DEFAULT_MODE_ID` / `TASK_GENERATION_PRESETS`）
 * 与无状态工具（`isAbortError` / `logger` / `searchWebForPrompt`）**直接 import**，不进 ctx。
 */
import { nextTick } from 'vue';
import { BASE_SYSTEM_PROMPT, BOH_DEFAULT_MODE_ID } from '../../composables/chat-engine-config.js';
import { TASK_GENERATION_PRESETS } from '../../generation-params.js';
import { isAbortError } from '../../utils/chatErrorMessages.js';
import { searchWebForPrompt } from '../../utils/web/search.js';
import { logger } from '@/utils/logger.js';

/** 会话消息（集群分支只碰 role / content）。 */
export interface ClusterMessageLike {
  role?: string;
  content?: string;
  meta?: Record<string, unknown>;
}

/** 会话对象（集群分支只碰这几个字段）。 */
export interface ClusterSessionLike {
  isLoading?: boolean;
  isThinking?: boolean;
  contextSummary?: { content?: string } | null;
  messages: ClusterMessageLike[];
}

/** 集群分支需要的注入（全部由 `useChatEngine` 提供）。 */
export interface AgentClusterStageCtx {
  // ── 响应式 ref（阶段内读写）──
  isStreamingGeneration: { value: boolean };
  activeGenerationSessionIndex: { value: number | null };
  abortController: { value: AbortController | null };
  currentModeId: { value: string };
  runtimeChatModes: { value: Array<{ id: string; promptAppendix?: string }> };
  runtimeAvailableModels: { value: Array<{ id: string }> };
  currentModel: { value: { id: string } | null | undefined };
  isSearching: { value: boolean };
  userInfo: { value: { id?: string } | null | undefined };
  // ── UI / 会话操作 ──
  appendUserMessageWithTitle: (sessionIndex: number, userText: string) => void;
  resetComposerInput: () => void;
  clearAttachedContext: () => void;
  scrollToBottom: (force?: boolean) => void;
  ensureContextCompression: (
    sessionIndex: number,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  getSessionByIndex: (index: number) => ClusterSessionLike | null | undefined;
  stopThinkingTimer: () => void;
  // ── 集群 ──
  runAgentClusterBranch: (
    input: Record<string, unknown>,
  ) => Promise<{ answer?: string; degraded?: boolean } | null | undefined>;
  applyAgentClusterEvent: (event: {
    type: string;
    payload: { message: string };
    createdAt: number;
  }) => void;
  resetAgentClusterState: () => void;
  agentClusterState: { lastError?: unknown };
  clusterSources: { invokeRetriever: unknown; invokeSharedMemory: unknown; invokeCloud: unknown };
  // ── 模型 ──
  getModelForModeId: (
    modeId: string,
    options?: Record<string, unknown>,
  ) => { id: string } | null | undefined;
  callModelInternal: (
    modelId: string,
    query: string,
    systemPrompt: string,
    history: ClusterMessageLike[],
    signal: AbortSignal,
    maxTokens: number,
    preset: unknown,
  ) => Promise<string>;
}

export interface AgentClusterStageOptions {
  sessionIndex: number;
  userText: string;
  session: ClusterSessionLike;
}

/**
 * 跑 Agent 集群分支（**调用方在此之后必须 `return`**，不再走主检索/装配）。
 */
export const runAgentClusterStage = async (
  ctx: AgentClusterStageCtx,
  { sessionIndex, userText, session }: AgentClusterStageOptions,
): Promise<void> => {
  ctx.isStreamingGeneration.value = true;
  ctx.appendUserMessageWithTitle(sessionIndex, userText);
  ctx.resetComposerInput();
  ctx.clearAttachedContext();
  ctx.scrollToBottom(true);
  // Agent 集群分支同样会携带历史消息，先压缩上下文让 BOH AI 看到的就是压缩后窗口
  await ctx.ensureContextCompression(sessionIndex);
  session.isLoading = true;
  session.isThinking = true;
  ctx.activeGenerationSessionIndex.value = sessionIndex;
  const clusterController = new AbortController();
  ctx.abortController.value = clusterController;
  session.messages.push({ role: 'assistant', content: '' });
  const clusterMessageIndex = session.messages.length - 1;
  await nextTick();
  ctx.scrollToBottom();
  ctx.resetAgentClusterState();
  try {
    const historyForCluster = Array.isArray(session.messages) ? session.messages.slice(0, -1) : [];
    // 真实 contextSummary：把已经压缩过的旧历史摘要喂给 Orchestrator，避免它把全量历史当 cold start 处理
    const sessionSummaryContent =
      session?.contextSummary && typeof session.contextSummary === 'object'
        ? String(session.contextSummary.content || '').trim()
        : '';
    // P1-7：把主 ChatEngine 的真实调用链注入 cluster 的 chat-engine Agent，
    // 这样集群里的"对话"Agent 与主 ChatEngine 共享 system prompt、上下文压缩与所有自动注入。
    const clusterInvokeChatEngine = async ({
      query,
      history,
      signal,
      onStream,
    }: {
      query?: string;
      history?: ClusterMessageLike[];
      signal?: AbortSignal;
      onStream?: (text: string) => void;
    }) => {
      try {
        const activeModeId = ctx.runtimeChatModes.value.some(
          (mode) => mode.id === ctx.currentModeId.value,
        )
          ? ctx.currentModeId.value
          : BOH_DEFAULT_MODE_ID;
        const generationModel =
          ctx.getModelForModeId(activeModeId, { userText: query }) ||
          ctx.currentModel.value ||
          ctx.runtimeAvailableModels.value[0];
        const modeAppendix = String(
          ctx.runtimeChatModes.value.find((mode) => mode.id === activeModeId)?.promptAppendix || '',
        ).trim();
        const systemPromptContent = [BASE_SYSTEM_PROMPT, modeAppendix].filter(Boolean).join('\n');
        const content = await ctx.callModelInternal(
          generationModel.id,
          String(query || ''),
          systemPromptContent,
          Array.isArray(history) ? history : [],
          signal as AbortSignal,
          0,
          TASK_GENERATION_PRESETS.clusterChatMain,
        );
        const answerText = String(content || '').trim();
        if (typeof onStream === 'function' && answerText) {
          onStream(answerText);
        }
        return {
          ok: true,
          answer: answerText,
          mode: ctx.currentModeId.value,
          sources: [],
          notes: ['对话 Agent 走主 ChatEngine'],
          tokens: Math.max(400, Math.round(answerText.length / 1.5)),
        };
      } catch (error) {
        if (isAbortError(error)) {
          return { ok: false, status: 'cancelled', answer: '', error: { message: '已取消' } };
        }
        return {
          ok: false,
          status: 'failed',
          answer: '',
          error: { message: (error as Error)?.message || String(error) },
          notes: [`对话 Agent 失败：${(error as Error)?.message || String(error)}`],
        };
      }
    };
    const result = await ctx.runAgentClusterBranch({
      userText,
      history: historyForCluster,
      historySummary: sessionSummaryContent,
      clusterMode: 'auto',
      signal: clusterController.signal,
      invokeChatEngine: clusterInvokeChatEngine,
      onEvent: ctx.applyAgentClusterEvent,
      webSearch: ctx.isSearching.value ? searchWebForPrompt : undefined,
      invokeRetriever: ctx.clusterSources.invokeRetriever,
      invokeSharedMemory: ctx.clusterSources.invokeSharedMemory,
      invokeCloud: ctx.clusterSources.invokeCloud,
      userId: ctx.userInfo.value?.id || '',
      onStream: (text: string) => {
        const target = ctx.getSessionByIndex(sessionIndex);
        const message = target?.messages?.[clusterMessageIndex];
        if (message) {
          message.content = String(text || '');
          ctx.scrollToBottom();
        }
      },
    });
    // 兜底：onStream 可能因中间层未透传而丢失，这里确保最终答案一定写入消息
    const target = ctx.getSessionByIndex(sessionIndex);
    const message = target?.messages?.[clusterMessageIndex];
    if (message && result?.answer && !message.content) {
      message.content = String(result.answer);
      ctx.scrollToBottom();
    }
    if (result?.degraded) {
      if (message) {
        const note = ctx.agentClusterState.lastError
          ? `\n\n（Agent 集群已降级：${String(ctx.agentClusterState.lastError).slice(0, 80)}）`
          : '';
        message.content = `${message.content || ''}${note}`;
      }
    }
    return;
  } catch (clusterError) {
    if (!isAbortError(clusterError)) {
      logger.error('boh-ai', 'Agent cluster branch failed', clusterError);
    }
    ctx.applyAgentClusterEvent({
      type: isAbortError(clusterError) ? 'cancelled' : 'error',
      payload: { message: (clusterError as Error)?.message || String(clusterError || '') },
      createdAt: Date.now(),
    });
    const target = ctx.getSessionByIndex(sessionIndex);
    if (target?.messages?.[clusterMessageIndex]) {
      target.messages[clusterMessageIndex].content = isAbortError(clusterError)
        ? '已停止生成。'
        : `多任务处理失败，请重试。`;
    }
    return;
  } finally {
    session.isLoading = false;
    session.isThinking = false;
    ctx.isStreamingGeneration.value = false;
    if (ctx.activeGenerationSessionIndex.value === sessionIndex) {
      ctx.activeGenerationSessionIndex.value = null;
    }
    if (ctx.abortController.value === clusterController) {
      ctx.abortController.value = null;
    }
    ctx.stopThinkingTimer();
  }
};
