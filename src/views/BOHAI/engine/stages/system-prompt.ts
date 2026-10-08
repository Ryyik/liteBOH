/**
 * system-prompt.ts — **system prompt 段落拼装**（plans/025 v2 · Step 5-3 第三刀）
 *
 * 两件事：
 *   ① `contextBlock` —— 页面上下文 + 证据块 + 会话摘要，**替换进** `BASE_SYSTEM_PROMPT` 的占位符
 *      （而不是作为独立 system 消息，部分模型处理不一致）；
 *   ② `systemPromptContent` —— 主 prompt + 结构化记忆 + Plan 附录 + 健康附录 + 访谈三块 + 风格附录。
 *
 * 纯函数：只做字符串拼装与「去空段」。
 *
 * ⚠️ 两条**顺序不可换**：
 *   1. `contextBlock` 的拼接顺序 = 页面 → 证据 → 摘要（摘要最后，因为它最长、最"背景"）；
 *   2. `systemPromptContent` 的段落顺序固定（见实现）—— 顺序变了就是改提示词优先级。
 */
import {
  BASE_SYSTEM_PROMPT,
  CONTEXT_PLACEHOLDER,
  HEALTH_ANALYSIS_PROMPT_APPENDIX,
  PLAN_MODE_PROMPT_APPENDIX,
} from '../../composables/chat-engine-config.js';

export interface SystemPromptInput {
  pageContextBlock: string;
  evidenceContextBlock: string;
  /** 会话摘要（无则空/undefined） */
  cachedSummary: string | null | undefined;
  structuredMemoryBlock: string;
  isPlanMode: boolean;
  healthAnalysisActive: boolean;
  psychInterviewProtocol: string;
  psychStateBlock: string;
  psychRulesBlock: string;
  stylePromptAppendix: string;
}

export interface SystemPromptSections {
  contextBlock: string;
  systemPromptContent: string;
}

export const buildSystemPromptSections = ({
  pageContextBlock,
  evidenceContextBlock,
  cachedSummary,
  structuredMemoryBlock,
  isPlanMode,
  healthAnalysisActive,
  psychInterviewProtocol,
  psychStateBlock,
  psychRulesBlock,
  stylePromptAppendix,
}: SystemPromptInput): SystemPromptSections => {
  // 摘要并入主 system prompt 的 context 段落（之前作为独立 system 消息，部分模型处理不一致）
  const contextBlock = [
    pageContextBlock,
    evidenceContextBlock,
    cachedSummary ? `\n<conversation_summary>\n${cachedSummary}\n</conversation_summary>\n` : '',
  ]
    .filter((s) => String(s || '').trim())
    .join('\n');

  const systemPromptContent = [
    BASE_SYSTEM_PROMPT.replace(
      `\n${CONTEXT_PLACEHOLDER}\n`,
      contextBlock ? `\n${contextBlock}\n` : '',
    ),
    structuredMemoryBlock,
    isPlanMode ? PLAN_MODE_PROMPT_APPENDIX : '',
    healthAnalysisActive ? HEALTH_ANALYSIS_PROMPT_APPENDIX : '',
    psychInterviewProtocol,
    psychStateBlock,
    psychRulesBlock,
    stylePromptAppendix,
  ]
    .filter((section) => String(section || '').trim())
    .join('\n');

  return { contextBlock, systemPromptContent };
};
