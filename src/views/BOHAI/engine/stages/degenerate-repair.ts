/**
 * degenerate-repair.ts — **退化流修复**（plans/025 v2 · Step 5-3 第四刀）
 *
 * 流式输出被判为「退化」（连续重复标点 / 长串符号 / 无意义字符）时，**不落盘**，
 * 改用严格约束重试一次；重试仍退化则给固定话术。这条路径**自带早退**（调用方 `return`）。
 *
 * ⚠️ 两条**行为不可改**：
 *   1. 重试稿要过 `ensureGroundedReply`（依据护栏）→ `cleanAssistantVisibleReply` → 洗无证据断言，
 *      **三步顺序固定**；
 *   2. 无论成败都要 `captureMemoryFromConversation`（异步，不阻塞）。
 */
import { nextTick } from 'vue';

export interface DegenerateRepairDeps {
  appendPromptSection: (base: string, section: string, maxChars: number) => string;
  callModelInternal: (
    modelId: string,
    prompt: string,
    systemPrompt: string,
    history: unknown[],
    signal: AbortSignal,
    maxTokens: number,
    profile: unknown,
  ) => Promise<string>;
  filterThinkingContent: (text: string) => string;
  cleanAssistantVisibleReply: (text: string) => string;
  isDegenerateAssistantReply: (text: string) => boolean;
  ensureGroundedReply: (text: string) => string;
  sanitizeCommunityEvidenceClaims: (text: string) => string;
  updateContent: (text: string) => void;
  scrollToBottom: () => void;
  captureMemoryFromConversation: (input: {
    sessionIndex: number;
    userText: string;
    assistantText: string;
  }) => Promise<unknown>;
}

export interface DegenerateRepairOptions {
  finalPrompt: string;
  maxFinalPromptChars: number;
  generationModelId: string;
  systemPromptContent: string;
  recentMessages: unknown[];
  requestController: AbortController;
  generationProfile: unknown;
  sessionIndex: number;
  userText: string;
}

export const runDegenerateRepair = async (
  deps: DegenerateRepairDeps,
  {
    finalPrompt,
    maxFinalPromptChars,
    generationModelId,
    systemPromptContent,
    recentMessages,
    requestController,
    generationProfile,
    sessionIndex,
    userText,
  }: DegenerateRepairOptions,
): Promise<void> => {
  const retryPrompt = deps.appendPromptSection(
    finalPrompt,
    `\n<constraints>
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 输出必须是正常中文句子，结构清晰，不要输出长串符号。
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

  const repairedContent =
    !deps.isDegenerateAssistantReply(retryFiltered) && String(retryFiltered || '').trim()
      ? retryFiltered
      : '回答出现异常，可以切换到“思考”模式重试。';

  const groundedRepairedContent =
    deps.cleanAssistantVisibleReply(deps.ensureGroundedReply(repairedContent)) ||
    '我暂时没有生成到有效内容，请再试一次。';
  deps.updateContent(deps.sanitizeCommunityEvidenceClaims(groundedRepairedContent));
  nextTick(deps.scrollToBottom);

  void deps.captureMemoryFromConversation({
    sessionIndex,
    userText,
    assistantText: groundedRepairedContent,
  });
};
