import {
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS,
  ACTION_POST_TRIGGER_PATTERN,
  MAX_CONTEXT_MESSAGES,
  MAX_HISTORY_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
} from './chat-engine-config.js';
import { logger } from '@/utils/logger.js';

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

let aiMemoryCache = '';
let aiMemoryLoader = null;

// 历史摘要参数：配合放大的上下文窗口同步上调。
// - RECENT_MESSAGES=8: 摘要只覆盖"倒数第 8 条之前"，保留更多原文以减少摘要信息损失。
// - MIN_MESSAGES=10: 至少 10 条历史才触发摘要（从 16 下调，让中等长度对话也受益）。
// - MAX_CHARS=2000: 摘要本体上限 2000 字符（之前 900），让压缩后的早期上下文也尽量详细。
// - TWO_LEVEL_THRESHOLD=50: 超过 50 条消息时做二层摘要。
export const CONVERSATION_SUMMARY_RECENT_MESSAGES = 8;
export const CONVERSATION_SUMMARY_MIN_MESSAGES = 10;
export const CONVERSATION_SUMMARY_MAX_CHARS = 2000;
export const CONVERSATION_SUMMARY_TWO_LEVEL_THRESHOLD = 50;
export const CONVERSATION_SUMMARY_STORAGE_VERSION = 2;

export const GENERATION_STALL_TIMEOUT_MS = 120000;

const AI_MEMORY_RETRY_DELAY_MS = 30000;

export async function getAIMemory({ forceReload = false } = {}) {
  if (!forceReload && aiMemoryCache) return aiMemoryCache;
  if (!forceReload && aiMemoryLoader) return aiMemoryLoader;
  if (forceReload) {
    aiMemoryCache = '';
    aiMemoryLoader = null;
  }
  aiMemoryLoader = import('@/data/ai-memory.js')
    .then((module) => {
      aiMemoryCache = typeof module.AI_MEMORY === 'string' ? module.AI_MEMORY : '';
      return aiMemoryCache;
    })
    .catch((error) => {
      logger.error('boh-ai', 'Load AI memory failed', error);
      aiMemoryLoader = null;
      setTimeout(() => {
        if (aiMemoryCache === '') aiMemoryLoader = null;
      }, AI_MEMORY_RETRY_DELAY_MS).unref?.();
      return '';
    });
  return aiMemoryLoader;
}

export const normalizeMemoryCompareText = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '')
    .trim();

export const isLikelyMemoryDuplicate = (candidate, existingItems = []) => {
  const normalizedCandidate = normalizeMemoryCompareText(candidate);
  if (!normalizedCandidate) return false;

  return existingItems.some((item) => {
    const content = typeof item === 'string' ? item : item?.content;
    const normalized = normalizeMemoryCompareText(content);
    if (!normalized) return false;
    return (
      normalized === normalizedCandidate ||
      normalized.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalized)
    );
  });
};

export const extractExplicitMemoryContent = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const patterns = [
    /^(?:请|麻烦|帮我)?(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)[：:，,\s]*(.+)$/u,
    /^(?:我要|我想|请)?(?:上传|添加|保存|沉淀)(?:一条)?记忆[：:，,\s]*(.+)$/u,
    /^(?:记忆沉淀|记忆)[：:，,\s]*(.+)$/u,
    /^(?:请|麻烦|帮我)?把(.+?)(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)(?:吧|一下)?$/u,
  ];

  for (const pattern of patterns) {
    const matched = raw.match(pattern);
    if (!matched?.[1]) continue;
    const cleaned = stripWrappingQuotes(matched[1]);
    if (cleaned.length >= 2) return truncateText(cleaned, 320);
  }

  return '';
};

export const buildConversationSummaryFingerprint = (messages = []) => {
  const source = getStorableDialogueMessages(messages);
  if (source.length <= CONVERSATION_SUMMARY_RECENT_MESSAGES) return '';
  const summarized = source.slice(0, -CONVERSATION_SUMMARY_RECENT_MESSAGES);
  // fingerprint 之前依赖首尾消息内容前缀，流式过滤/编辑导致内容变化即失效。
  // 改为：对每条被摘要消息的 role + content 前 20 字符做轻量 hash，
  // 内容小幅变化（如末尾标点）不影响 hash，大幅变化（如编辑）才会失效。
  const parts = summarized.map((m) => `${m.role[0]}:${m.content.slice(0, 20)}`);
  let hash = 0x811c9dc5;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `${CONVERSATION_SUMMARY_STORAGE_VERSION}:${summarized.length}:${hash.toString(36)}`;
};

export const buildHistoryMessagesWithCachedSummary = (
  session = {},
  {
    maxChars = MAX_HISTORY_CONTEXT_CHARS,
    maxMessages = MAX_CONTEXT_MESSAGES,
    maxPerMessage = MAX_HISTORY_MESSAGE_CHARS,
  } = {},
) => {
  const allMessages = getStorableDialogueMessages(session?.messages);
  const cachedSummary = getCachedSummaryIfUsable({
    ...(session || {}),
    messages: allMessages,
  });
  // 摘要可用前必须保留完整预算内历史。旧实现无条件只取最近 8 条，导致第 9 条开始
  // 早期消息可能在摘要尚未生成时就从模型上下文消失。
  const coveredMessageCount = Math.max(
    0,
    Math.trunc(Number(session?.contextSummary?.coveredMessageCount) || 0),
  );
  const historySource = cachedSummary
    ? allMessages.slice(
        coveredMessageCount > 0 ? coveredMessageCount : -CONVERSATION_SUMMARY_RECENT_MESSAGES,
      )
    : allMessages;

  // 只返回历史消息，摘要由 useChatEngine 并入主 system prompt 的 context 段落。
  return buildHistoryMessagesWithinBudget(historySource, {
    maxChars,
    maxMessages,
    maxPerMessage,
  });
};

// 独立导出：供 useChatEngine 判断摘要是否可用并取出内容，并入主 system prompt
export const getCachedSummaryIfUsable = (session = {}) => {
  const summary = session?.contextSummary;
  if (!summary || summary.version !== CONVERSATION_SUMMARY_STORAGE_VERSION) return '';
  const content = normalizePromptLine(summary.content, CONVERSATION_SUMMARY_MAX_CHARS);
  if (!content) return '';

  const allMessages = getStorableDialogueMessages(session?.messages);
  const sourceMessageCount = Math.max(0, Math.trunc(Number(summary.sourceMessageCount) || 0));
  if (sourceMessageCount > 0 && sourceMessageCount <= allMessages.length) {
    const sourceFingerprint = buildConversationSummaryFingerprint(
      allMessages.slice(0, sourceMessageCount),
    );
    return summary.fingerprint === sourceFingerprint ? content : '';
  }

  // 兼容尚未带覆盖范围元数据的旧会话摘要。
  const expectedFingerprint = buildConversationSummaryFingerprint(allMessages);
  return summary.fingerprint === expectedFingerprint ? content : '';
};

export const normalizeActionInput = (text) =>
  String(text || '')
    .replace(/\r/g, '')
    .trim();

export const stripLeadingActionPhrase = (text) => {
  let output = String(text || '').trim();
  output = output.replace(/^(请你|请帮我|帮我|替我|代我|我想|我要|帮忙)\s*/i, '');
  output = output.replace(/^(给我|帮我)\s*/i, '');
  return output.trim();
};

export const extractSingleLineField = (text, labels = []) => {
  const safeText = String(text || '');
  const joined = labels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!joined) return '';
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${joined})\\s*[：:]\\s*([^\\n]{1,220})`, 'i');
  const matched = safeText.match(pattern);
  return normalizePromptLine(matched?.[1] || '', 220);
};

export const extractMultilineField = (
  text,
  labels = [],
  maxChars = ACTION_DRAFT_CONTENT_MAX_CHARS,
) => {
  const safeText = String(text || '');
  const joined = labels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!joined) return '';
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${joined})\\s*[：:]\\s*([\\s\\S]+)$`, 'i');
  const matched = safeText.match(pattern);
  return normalizePromptLine(matched?.[1] || '', maxChars);
};

export const trimLeadingDraftDelimiters = (text) =>
  String(text || '')
    .replace(/^[，,。；;、\s]+/g, '')
    .trim();

export const extractFieldUntilNextLabel = (
  text,
  labels = [],
  nextLabels = [],
  maxChars = ACTION_DRAFT_CONTENT_MAX_CHARS,
) => {
  const safeText = String(text || '');
  const joined = labels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!joined) return '';

  const nextJoined = nextLabels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const lookAhead = nextJoined ? `(?=(?:\\s*(?:${nextJoined})\\s*[：:])|$)` : '$';
  const pattern = new RegExp(`(?:${joined})\\s*[：:]\\s*([\\s\\S]*?)${lookAhead}`, 'i');
  const matched = safeText.match(pattern);
  return normalizePromptLine(trimLeadingDraftDelimiters(matched?.[1] || ''), maxChars);
};

export const cleanPostDraftIdeaText = (text) => {
  let ideaText = stripLeadingActionPhrase(text);
  ideaText = ideaText.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
  ideaText = ideaText.replace(/(?:标题|title)\s*[：:][^\n]+/gi, ' ');
  ideaText = ideaText.replace(/(?:内容|正文|body|想法)(?:是)?\s*[：:]/gi, ' ');
  ideaText = ideaText.replace(/^(?:请你|请帮我|帮我|替我|代我|我想|我要|帮忙|麻烦你?)\s*/gi, ' ');
  ideaText = ideaText.replace(
    /^(?:起草|生成|写|整理)\s*(?:一条|一篇|一个)?\s*(?:论坛|社区|帖子|发布文案|标题和正文)\s*/gi,
    ' ',
  );
  return normalizePromptLine(trimLeadingDraftDelimiters(ideaText), ACTION_DRAFT_CONTENT_MAX_CHARS);
};

export const stripPostDraftTitleNoise = (text) =>
  normalizePromptLine(text, ACTION_DRAFT_TITLE_MAX_CHARS)
    .replace(/^(?:AI草稿|草稿|标题|帖子|论坛|社区)\s*[：:：-]?\s*/i, '')
    .replace(/^(?:关于|有关)\s*/, '')
    .replace(/^(?:我最近|最近|我发现|我想|想问问大家|想和大家聊聊|请教一下)\s*/i, '')
    .replace(/(?:想问问大家|大家怎么看|有没有人遇到|有没有遇到过|欢迎大家).*/i, '')
    .trim();

export const buildLocalPostDraftTitle = (text) => {
  const safeText = normalizePromptLine(text, ACTION_DRAFT_CONTENT_MAX_CHARS);
  const firstSentence =
    safeText
      .split(/[。！？!?；;\n]/)
      .map((item) => item.trim())
      .find(Boolean) || safeText;
  const cleaned = stripPostDraftTitleNoise(firstSentence)
    .replace(/^(?:这个|这件事|这个情况)\s*/, '')
    .replace(/[，,、：:]\s*$/g, '')
    .trim();

  if (cleaned.length >= 4) {
    const clipped = cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
    return normalizePromptLine(clipped, ACTION_DRAFT_TITLE_MAX_CHARS);
  }

  return '想听听大家的看法';
};

export const buildLocalPostDraftContent = (text) => {
  const ideaText = cleanPostDraftIdeaText(text);
  if (!ideaText) return '';

  const hasQuestionTone =
    /(吗|么|怎么办|怎么|如何|为什么|原因|有没有|是否|可不可以|行不行|建议|办法|解决)/.test(
      ideaText,
    );
  const endMark = /[。！？!?]$/.test(ideaText) ? '' : '。';
  const lead = hasQuestionTone ? '我想和大家请教一下：' : '我想和大家分享一个想法：';
  const tail = hasQuestionTone
    ? '如果你也遇到过类似情况，欢迎分享一下原因、处理办法或经验。'
    : '也想听听大家怎么看，欢迎补充不同的经验或建议。';

  return normalizePromptLine(
    `${lead}${ideaText}${endMark}\n\n${tail}`,
    ACTION_DRAFT_CONTENT_MAX_CHARS,
  );
};

export const isWeakPostDraftTitle = (title, rawText, content) => {
  const normalizedTitle = normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS);
  if (!normalizedTitle) return true;
  if (/^(?:AI草稿|草稿|帮我|请帮我|请你|我要|我想|生成|起草|写|整理|发帖)/i.test(normalizedTitle))
    return true;

  const compactTitle = normalizedTitle.replace(/\s+/g, '');
  const compactRaw = normalizePromptLine(rawText, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(
    /\s+/g,
    '',
  );
  const compactContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(
    /\s+/g,
    '',
  );
  if (compactRaw && compactTitle === compactRaw) return true;
  if (compactContent && compactTitle.length > 18 && compactContent.startsWith(compactTitle))
    return true;
  return false;
};

export const buildPostDraftFromText = (text) => {
  const safeText = normalizeActionInput(text);
  const normalized = stripLeadingActionPhrase(safeText);
  const explicitTitle =
    extractFieldUntilNextLabel(
      normalized,
      ['标题', 'title'],
      ['内容', '正文', 'body'],
      ACTION_DRAFT_TITLE_MAX_CHARS,
    ) || extractSingleLineField(normalized, ['标题', 'title']);
  let content =
    extractFieldUntilNextLabel(
      normalized,
      ['内容', '正文', 'body'],
      [],
      ACTION_DRAFT_CONTENT_MAX_CHARS,
    ) ||
    extractMultilineField(normalized, ['内容', '正文', 'body'], ACTION_DRAFT_CONTENT_MAX_CHARS);

  if (!content) {
    let fallback = normalized;
    fallback = fallback.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
    fallback = fallback.replace(/(?:标题|title)\s*[：:][^\n]+/gi, '');
    fallback = fallback.replace(/(?:内容|正文|body|想法)(?:是)?\s*[：:]/gi, '');
    content = buildLocalPostDraftContent(trimLeadingDraftDelimiters(fallback));
  }

  if (!content) {
    content = '（请在这里填写帖子正文）';
  }

  const suggestedTitle = buildLocalPostDraftTitle(content);
  const title = normalizePromptLine(explicitTitle || suggestedTitle, ACTION_DRAFT_TITLE_MAX_CHARS);

  return {
    title,
    content: normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS),
  };
};

/**
 * Noise pattern for post draft idea extraction.
 *
 * NOTE (2026-06-09): Core Chinese conjunctions (和/与/并且/然后/可以/需要)
 * are intentionally excluded from noise removal per P1-B-6 fix.
 * Only directive/action verbs are stripped.
 */
export const POST_DRAFT_IDEA_NOISE_PATTERN =
  /(帮我|替我|代我|请帮我|请你|我想|我要|想要|麻烦|先|直接|自动|起草|生成|写|整理|发布|发出去|标题|正文|内容|文案|草稿|一下|一条|一篇|一个|论坛|社区|帖子|发帖|发布文案|编辑后|可直接)/g;
export const POST_DRAFT_PLACEHOLDER_PATTERN =
  /(请在这里填写帖子正文|先起草标题和正文|起草标题和正文|标题和正文|发帖内容|发布文案)/;

export const hasPostDraftUserIdea = (rawText, draft = {}) => {
  const raw = normalizePromptLine(rawText, ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (!raw) return false;
  const fallbackContent = normalizePromptLine(draft.content, ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (!fallbackContent || POST_DRAFT_PLACEHOLDER_PATTERN.test(fallbackContent)) return false;

  const explicitBody = extractFieldUntilNextLabel(
    raw,
    ['内容', '正文', 'body', '想法'],
    [],
    ACTION_DRAFT_CONTENT_MAX_CHARS,
  );
  if (explicitBody && explicitBody.replace(/\s+/g, '').length >= 4) return true;

  let ideaText = raw;
  ideaText = ideaText.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
  ideaText = ideaText.replace(/(?:标题|title)\s*[：:][^\n]+/gi, ' ');
  ideaText = ideaText.replace(/(?:内容|正文|body|想法)\s*[：:]/gi, ' ');
  ideaText = ideaText.replace(POST_DRAFT_IDEA_NOISE_PATTERN, ' ');
  ideaText = normalizePromptLine(ideaText, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(/\s+/g, '');
  return ideaText.length >= 4;
};

export const buildPageDraftFromText = (text) => {
  const safeText = normalizeActionInput(text);
  const normalized = stripLeadingActionPhrase(safeText);
  const pageTypeMatched = normalized.match(
    /(首页|主页|落地页|活动页|公告页|展示页|介绍页|个人介绍|作品集|登录页|注册页|关于页|联系我们|产品页|宣传页|推广页|营销页)/,
  );
  const pageType = pageTypeMatched?.[1] || '展示页';
  const description =
    extractMultilineField(normalized, ['描述', '要求', '需求', '说明'], 420) ||
    normalized
      .replace(
        /(创建网页|创建页面|生成网页|生成页面|做个网页|做个页面|做个主页|做个落地页|搭建网页|搭建页面|设计网页|设计页面|建个网页|建个页面|制作网页|制作页面|网页设计|页面设计)/gi,
        '',
      )
      .replace(
        /(首页|主页|落地页|活动页|公告页|展示页|介绍页|个人介绍|作品集|登录页|注册页|关于页|联系我们|产品页|宣传页|推广页|营销页)/g,
        '',
      )
      .replace(/(帮我|替我|代我|请帮我|请你|我想|我要|想要|需要|帮忙)/gi, '')
      .trim();
  return {
    pageType,
    description: normalizePromptLine(description || '一个简洁美观的展示页面', 420),
  };
};

// 优化 1: Token 预算监控 — ContextManager
// 跟踪每种上下文的 token 用量，超出时提供降级建议。
// ============================================================

export const CONTEXT_CATEGORIES = {
  SYSTEM_PROMPT: 'systemPrompt',
  HISTORY: 'history',
  EVIDENCE: 'evidence',
  RULES: 'rules',
  USER_INPUT: 'userInput',
  STRUCTURED_MEMORY: 'structuredMemory',
};

export const CONTEXT_BUDGET_DEFAULTS = {
  systemPrompt: { max: 4000, priority: 0 },
  history: { max: 10000, priority: 2 },
  evidence: { max: 5000, priority: 3 },
  rules: { max: 2000, priority: 1 },
  userInput: { max: 3000, priority: 0 },
  structuredMemory: { max: 800, priority: 1 },
};

export const createContextBudgetTracker = (budgets = {}) => {
  const merged = {};
  for (const [key, def] of Object.entries(CONTEXT_BUDGET_DEFAULTS)) {
    merged[key] = { ...def, ...(budgets[key] || {}) };
  }

  const usage = {};
  for (const key of Object.keys(merged)) {
    usage[key] = 0;
  }

  const addEstimate = (category, text) => {
    if (!usage.hasOwnProperty(category)) return;
    usage[category] += estimateTokens(String(text || ''));
  };

  const getUsage = () => {
    const totalUsed = Object.values(usage).reduce((a, b) => a + b, 0);
    const totalBudget = Object.values(merged).reduce((a, b) => a + b.max, 0);

    const byCategory = {};
    for (const [key, val] of Object.entries(usage)) {
      const budget = merged[key];
      byCategory[key] = {
        used: val,
        max: budget.max,
        percent: budget.max > 0 ? Math.min(100, (val / budget.max) * 100) : 0,
        priority: budget.priority,
      };
    }

    return {
      total: {
        used: totalUsed,
        max: totalBudget,
        percent: totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0,
      },
      byCategory,
      level:
        totalBudget > 0 && totalUsed / totalBudget >= 0.95
          ? 'full'
          : totalBudget > 0 && totalUsed / totalBudget >= 0.8
            ? 'high'
            : totalBudget > 0 && totalUsed / totalBudget >= 0.55
              ? 'mid'
              : 'low',
    };
  };

  const getDegradationPlan = () => {
    const state = getUsage();
    const drops = [];

    if (state.level === 'full' || state.level === 'high') {
      const sorted = Object.entries(state.byCategory)
        .filter(([_, v]) => v.percent > 50)
        .sort((a, b) => b[1].priority - a[1].priority);

      for (const [cat, info] of sorted) {
        if (info.percent > 80) {
          drops.push({ category: cat, action: 'truncate', target: Math.round(info.max * 0.5) });
        } else if (info.percent > 60) {
          drops.push({ category: cat, action: 'summarize', target: Math.round(info.max * 0.6) });
        }
      }
    }

    return { level: state.level, drops };
  };

  const reset = () => {
    for (const key of Object.keys(usage)) {
      usage[key] = 0;
    }
  };

  return { addEstimate, getUsage, getDegradationPlan, reset };
};

// ============================================================
// 优化 4: 子代理上下文构建
// 根据 agent 角色构建最小化的上下文
// ============================================================

export const AGENT_CONTEXT_BUDGETS = {
  orchestrator: { historyMax: 600 },
  retriever: { historyMax: 800 },
  memory: { historyMax: 400 },
  ops: { historyMax: 800 },
  synthesizer: { historyMax: 1200 },
  'chat-engine': { historyMax: 12000 },
};

export const buildAgentContext = (history = [], agentName = '', _query = '') => {
  const budget = AGENT_CONTEXT_BUDGETS[agentName] || AGENT_CONTEXT_BUDGETS['chat-engine'];
  const safeHistory = Array.isArray(history) ? history : [];

  if (agentName === 'orchestrator' || agentName === 'memory') {
    return { context: '', history: [] };
  }

  const recent = buildHistoryMessagesWithinBudget(safeHistory, {
    maxChars: budget.historyMax,
    maxMessages: agentName === 'chat-engine' ? 30 : 8,
    maxPerMessage: agentName === 'chat-engine' ? 2000 : 800,
  });

  return { context: '', history: recent };
};
