/**
 * system-prompt.ts — **system prompt 段落拼装**（plans/025 v2 · Step 5-3 第三刀）
 *
 * 两件事：
 *   ① `contextBlock` —— **时间锚点** + 页面上下文 + 证据块 + 会话摘要，**替换进**
 *      `BASE_SYSTEM_PROMPT` 的占位符（而不是作为独立 system 消息，部分模型处理不一致）；
 *   ② `systemPromptContent` —— 主 prompt + 结构化记忆 + Plan 附录 + 访谈三块 + 风格附录。
 *
 * 纯函数：只做字符串拼装与「去空段」。
 *
 * ⚠️ 两条**顺序不可换**：
 *   1. `contextBlock` 的拼接顺序 = **时间锚点 → 页面 → 证据 → 摘要**（摘要最后，因为它最长、最"背景"；
 *      时间锚点必须最前 —— 模型要先知道「今天几号」，后面所有日期才有参照系）；
 *   2. `systemPromptContent` 的段落顺序固定（见实现）—— 顺序变了就是改提示词优先级。
 *
 * 2026-10-16：BOH Health 功能整体下线，健康分析附录（`HEALTH_ANALYSIS_PROMPT_APPENDIX`）
 * 与其开关一并移除。
 * 2026-11-12：补时间锚点（此前 prompt 全链路没有「今天几号」，模型只能拿训练数据猜，
 *   于是把 `2026-11-11` 的帖子说成「上个月」这类错判无法自查）。真源在
 *   `utils/temporal-anchor.js`，本文件只负责把它排到 `<context>` 的第一段。
 */
import {
  BASE_SYSTEM_PROMPT,
  CONTEXT_PLACEHOLDER,
  PLAN_MODE_PROMPT_APPENDIX,
} from '../../composables/chat-engine-config.js';
import { formatTemporalAnchor } from '../../utils/temporal-anchor.js';

export interface SystemPromptInput {
  pageContextBlock: string;
  evidenceContextBlock: string;
  /** 会话摘要（无则空/undefined） */
  cachedSummary: string | null | undefined;
  structuredMemoryBlock: string;
  isPlanMode: boolean;
  psychInterviewProtocol: string;
  psychStateBlock: string;
  psychRulesBlock: string;
  stylePromptAppendix: string;
  /**
   * 知识库变更单协议（2026-11-12）。**只在管理员调试模式下**由调用方传入，
   * 普通用户传空串 —— 让普通用户看到「说一句就能改知识库」的协议比不给他看更糟。
   */
  knowledgePatchAppendix?: string;
  /**
   * 时间锚点的取时点（默认 `new Date()`）。仅供测试注入固定时间 ——
   * 生产调用方**不要**传，让每轮生成各自取当前时刻（长会话跨天也不会用旧锚点）。
   */
  now?: Date;
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
  psychInterviewProtocol,
  psychStateBlock,
  psychRulesBlock,
  stylePromptAppendix,
  knowledgePatchAppendix,
  now,
}: SystemPromptInput): SystemPromptSections => {
  // 时间锚点：必须是 contextBlock 的第一段（没有它，后面所有日期都没有参照系）。
  // `formatTemporalAnchor` 对非法时间返回空串，会被下面的 filter 丢掉，不会留空标签。
  const temporalAnchor = formatTemporalAnchor(now);

  // 摘要并入主 system prompt 的 context 段落（之前作为独立 system 消息，部分模型处理不一致）
  const contextBlock = [
    temporalAnchor,
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
    psychInterviewProtocol,
    psychStateBlock,
    psychRulesBlock,
    // 变更单协议（仅管理员调试态）—— 放在风格附录之前：它是**能力约束**，不是表达风格
    knowledgePatchAppendix || '',
    stylePromptAppendix,
  ]
    .filter((section) => String(section || '').trim())
    .join('\n');

  return { contextBlock, systemPromptContent };
};
