/**
 * finalize-reply.ts — **回答定稿**（plans/025 v2 · Step 5-3 第五刀）
 *
 * 流式结束后对完整内容做「二次过滤 → 补答 → 退化重试 → 依据护栏 → 洗无证据断言」的定稿管线，
 * 返回最终文本与「是否需要写回 UI」。
 *
 * 纯计算 + 少数回调；**写 UI（updateContent / nextTick）留给壳**（返回 `changed` 由壳决定）。
 *
 * ⚠️ 四条**顺序不可换**（每步都会改 `finalFilteredContent`）：
 *   ① 空正文 → 非流式补答；② 退化 → 严格重试一次；③ `ensureGroundedReply` → `clean` → 洗断言；
 *   ④ 仍为空 → 回落到「上一帧可见内容 / noValidContent」并**再洗一次**。
 */
import { CHAT_ERROR_MESSAGES } from '../../utils/chatErrorMessages.js';
import { logger } from '@/utils/logger.js';

export interface FinalizeReplyDeps {
  filterThinkingContent: (text: string) => string;
  cleanAssistantVisibleReply: (text: string) => string;
  isDegenerateAssistantReply: (text: string) => boolean;
  ensureGroundedReply: (text: string) => string;
  sanitizeCommunityEvidenceClaims: (text: string) => string;
  callModelInternal: (
    modelId: string,
    prompt: string,
    systemPrompt: string,
    history: unknown[],
    signal: AbortSignal,
    maxTokens: number,
    profile: unknown,
  ) => Promise<string>;
  getFallbackModel: (modelId: string) => { id: string } | null | undefined;
  appendPromptSection: (base: string, section: string, maxChars: number) => string;
  markGenerationProgress: (status: string) => void;
  appendProgressContent: (text: string) => void;
  stopThinkingWhenAnswerVisible: () => void;
}

export interface FinalizeReplyOptions {
  /** 流式累积的原始内容 */
  assistantMessage: string;
  /** 最后一帧可见内容（兜底用） */
  lastVisibleStreamContent: string;
  finalPrompt: string;
  maxFinalPromptChars: number;
  generationModelId: string;
  systemPromptContent: string;
  recentMessages: unknown[];
  requestController: AbortController;
  generationProfile: { max_tokens?: number } & Record<string, unknown>;
}

export interface FinalizeReplyResult {
  finalContent: string;
  /** 与「流式打字机内容」不同 ⇒ 壳需写回 UI */
  changed: boolean;
}

export const finalizeAssistantReply = async (
  deps: FinalizeReplyDeps,
  {
    assistantMessage,
    lastVisibleStreamContent,
    finalPrompt,
    maxFinalPromptChars,
    generationModelId,
    systemPromptContent,
    recentMessages,
    requestController,
    generationProfile,
  }: FinalizeReplyOptions,
): Promise<FinalizeReplyResult> => {
  // 对完整内容进行二次过滤，确保所有思考内容都被过滤掉
  let finalFilteredContent = deps.filterThinkingContent(assistantMessage);
  if (String(finalFilteredContent || '').trim()) {
    deps.stopThinkingWhenAnswerVisible();
  }

  if (!deps.cleanAssistantVisibleReply(finalFilteredContent)) {
    logger.warn(
      'boh-ai',
      'Stream completed without visible assistant content, retrying non-stream fallback',
    );
    deps.markGenerationProgress('正在补全回答...');
    try {
      const fallbackModel = deps.getFallbackModel(generationModelId);
      const fallbackReply = await deps.callModelInternal(
        fallbackModel?.id || generationModelId,
        deps.appendPromptSection(
          finalPrompt,
          '\n<constraints>\n- 补答：上一轮流式输出没有生成可见正文\n- 直接给出最终回答，不要输出思考过程、检索日志或空内容\n</constraints>',
          maxFinalPromptChars,
        ),
        systemPromptContent,
        recentMessages,
        requestController.signal,
        0,
        {
          ...generationProfile,
          max_tokens: Math.min(Number(generationProfile.max_tokens || 1200), 1200),
        },
      );
      finalFilteredContent = deps.filterThinkingContent(fallbackReply);
    } catch (fallbackError) {
      logger.warn('boh-ai', 'Non-stream fallback after empty stream failed', fallbackError);
    }
  }

  if (deps.isDegenerateAssistantReply(finalFilteredContent)) {
    logger.warn('boh-ai', 'Detected degenerate output, retrying once with strict settings');
    deps.markGenerationProgress('生成内容异常，正在自动重试...');
    deps.appendProgressContent('回答异常，正在自动重试...\n\n');

    const retryPrompt = deps.appendPromptSection(
      finalPrompt,
      `\n<constraints>
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 若信息不足，请直接说明"我暂时无法确认"，不要输出占位符。
</constraints>`,
      maxFinalPromptChars,
    );

    const retryReply = await deps.callModelInternal(
      generationModelId,
      retryPrompt,
      systemPromptContent,
      recentMessages,
      requestController.signal,
      0,
      generationProfile,
    );
    const retryFiltered = deps.filterThinkingContent(retryReply);

    if (!deps.isDegenerateAssistantReply(retryFiltered) && String(retryFiltered || '').trim()) {
      finalFilteredContent = retryFiltered;
    } else {
      finalFilteredContent =
        '抱歉，本轮生成内容异常。你可以切到“思考/专业”模式重试，我也可以继续帮你完成这个问题。';
    }
  }

  finalFilteredContent = deps.ensureGroundedReply(finalFilteredContent);
  finalFilteredContent = deps.cleanAssistantVisibleReply(finalFilteredContent);
  finalFilteredContent = deps.sanitizeCommunityEvidenceClaims(finalFilteredContent);
  if (!finalFilteredContent) {
    finalFilteredContent = lastVisibleStreamContent || CHAT_ERROR_MESSAGES.noValidContent;
    finalFilteredContent = deps.sanitizeCommunityEvidenceClaims(finalFilteredContent);
  }

  const typedVisibleContent = deps.cleanAssistantVisibleReply(
    deps.filterThinkingContent(assistantMessage),
  );
  return {
    finalContent: finalFilteredContent,
    changed: finalFilteredContent !== typedVisibleContent,
  };
};
