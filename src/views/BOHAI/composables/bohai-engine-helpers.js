import {
  POST_DRAFT_IDEA_NOISE_PATTERN,
  POST_DRAFT_PLACEHOLDER_PATTERN,
  buildLocalPostDraftContent,
  buildLocalPostDraftTitle,
  buildPageDraftFromText,
  buildPostDraftFromText,
  cleanPostDraftIdeaText,
  extractFieldUntilNextLabel,
  extractMultilineField,
  extractSingleLineField,
  hasPostDraftUserIdea,
  isWeakPostDraftTitle,
  normalizeActionInput,
  stripLeadingActionPhrase,
  stripPostDraftTitleNoise,
  trimLeadingDraftDelimiters,
} from '../domain/post-draft.js';
import {
  AGENT_CONTEXT_BUDGETS,
  CONTEXT_BUDGET_DEFAULTS,
  CONTEXT_CATEGORIES,
  buildAgentContext,
  createContextBudgetTracker,
} from '../utils/context-budget.js';

// ────────────────────────────────────────────────────────────
// plans/025 v2 · Step 3「utils 归位」：本文件保留为**临时 barrel**。
// 已拆出的模块在此转出口 ⇒ 所有既有 import 点**零改动**；
// 消费方重写时改为直连具体模块，最后删掉本 barrel。
// ────────────────────────────────────────────────────────────
import {
  TOKEN_ESTIMATE_ROLE_OVERHEAD,
  estimateMessagesTokens,
  estimateTokens,
} from '../utils/tokens.js';
import {
  containsAnyKeyword,
  escapePromptXmlAttr,
  normalizePromptLine,
  normalizeText,
  stripWrappingQuotes,
  truncateText,
} from '../utils/text/normalize.js';
import {
  clearKeywordCache,
  extractQueryKeywords,
  splitKnowledgeChunks,
} from '../utils/text/keywords.js';
import {
  formatBillingCycleLabel,
  formatPromptDate,
  formatPromptDateTime,
  getBirthdayCountdown,
  parseBirthdayValue,
} from '../utils/format/display.js';
import {
  getPostTitleAndBody,
  isMissingRelationError,
  parsePostTitleAndBody,
} from '../utils/format/post.js';
import { isOperationQuestion, shouldUseSiteGuide } from '../utils/intent/rules.js';
import {
  buildSharedEvidenceContext,
  compressKnowledgeContextBlocks,
  rankEvidenceContextBlocks,
  scoreChunk,
  selectRelevantChunks,
  trimKnowledgeChunk,
} from '../utils/retrieval/scoring.js';
import {
  ESTIMATED_SYSTEM_PROMPT_CHARS,
  buildHistoryMessagesWithinBudget,
  getStorableDialogueMessages,
  trimMessagesToBudget,
} from '../utils/retrieval/budget.js';
import {
  appendPromptSection,
  buildStructuredUserPrompt,
  buildSystemEvidenceContext,
  isEmptyAssistantPlaceholder,
} from '../utils/prompt/assembly.js';
import {
  buildContextualFollowUpQuery,
  buildContextualWebSearchQuery,
  isContextDependentFollowUp,
  isEllipticalElaborationFollowUp,
} from '../utils/prompt/followup.js';
import {
  buildSearchResultsContext,
  getWebSearchFreshnessDays,
  resetTavilySearchAvailability,
  searchWebForPrompt,
} from '../utils/web/search.js';
export {
  TOKEN_ESTIMATE_ROLE_OVERHEAD,
  estimateMessagesTokens,
  estimateTokens,
  containsAnyKeyword,
  escapePromptXmlAttr,
  normalizePromptLine,
  normalizeText,
  stripWrappingQuotes,
  truncateText,
  clearKeywordCache,
  extractQueryKeywords,
  splitKnowledgeChunks,
  formatBillingCycleLabel,
  formatPromptDate,
  formatPromptDateTime,
  getBirthdayCountdown,
  parseBirthdayValue,
  getPostTitleAndBody,
  isMissingRelationError,
  parsePostTitleAndBody,
  isOperationQuestion,
  shouldUseSiteGuide,
  buildSharedEvidenceContext,
  compressKnowledgeContextBlocks,
  rankEvidenceContextBlocks,
  scoreChunk,
  selectRelevantChunks,
  trimKnowledgeChunk,
  ESTIMATED_SYSTEM_PROMPT_CHARS,
  buildHistoryMessagesWithinBudget,
  getStorableDialogueMessages,
  trimMessagesToBudget,
  appendPromptSection,
  buildStructuredUserPrompt,
  buildSystemEvidenceContext,
  isEmptyAssistantPlaceholder,
  buildContextualFollowUpQuery,
  buildContextualWebSearchQuery,
  isContextDependentFollowUp,
  isEllipticalElaborationFollowUp,
  buildSearchResultsContext,
  getWebSearchFreshnessDays,
  resetTavilySearchAvailability,
  searchWebForPrompt,
};
export * from '../utils/degenerate-guard.js';
export * from '../utils/structured-memory.js';
export * from '../utils/page-context.js';
export * from '../utils/generation-profile.js';
import {
  CONVERSATION_SUMMARY_MAX_CHARS,
  CONVERSATION_SUMMARY_MIN_MESSAGES,
  CONVERSATION_SUMMARY_RECENT_MESSAGES,
  CONVERSATION_SUMMARY_STORAGE_VERSION,
  CONVERSATION_SUMMARY_TWO_LEVEL_THRESHOLD,
  buildConversationSummaryFingerprint,
  buildHistoryMessagesWithCachedSummary,
  getAIMemory,
  getCachedSummaryIfUsable,
} from '../utils/memory/store.js';
import {
  extractExplicitMemoryContent,
  isLikelyMemoryDuplicate,
  normalizeMemoryCompareText,
} from '../utils/memory/dedupe.js';
export {
  CONVERSATION_SUMMARY_MAX_CHARS,
  CONVERSATION_SUMMARY_MIN_MESSAGES,
  CONVERSATION_SUMMARY_RECENT_MESSAGES,
  CONVERSATION_SUMMARY_STORAGE_VERSION,
  CONVERSATION_SUMMARY_TWO_LEVEL_THRESHOLD,
  buildConversationSummaryFingerprint,
  buildHistoryMessagesWithCachedSummary,
  getAIMemory,
  getCachedSummaryIfUsable,
  extractExplicitMemoryContent,
  isLikelyMemoryDuplicate,
  normalizeMemoryCompareText,
};
export {
  POST_DRAFT_IDEA_NOISE_PATTERN,
  POST_DRAFT_PLACEHOLDER_PATTERN,
  buildLocalPostDraftContent,
  buildLocalPostDraftTitle,
  buildPageDraftFromText,
  buildPostDraftFromText,
  cleanPostDraftIdeaText,
  extractFieldUntilNextLabel,
  extractMultilineField,
  extractSingleLineField,
  hasPostDraftUserIdea,
  isWeakPostDraftTitle,
  normalizeActionInput,
  stripLeadingActionPhrase,
  stripPostDraftTitleNoise,
  trimLeadingDraftDelimiters,
  AGENT_CONTEXT_BUDGETS,
  CONTEXT_BUDGET_DEFAULTS,
  CONTEXT_CATEGORIES,
  buildAgentContext,
  createContextBudgetTracker,
};
