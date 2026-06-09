import {
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_SUBJECT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS,
  ACTION_MAIL_TRIGGER_PATTERN,
  ACTION_POST_TRIGGER_PATTERN,
  DEGENERATE_PUNCT_REPEAT_COUNT,
  DEGENERATE_PUNCTUATION_RATIO,
  DEGENERATE_REPEAT_COUNT,
  DEGENERATE_STREAM_MIN_CHARS,
  DEGENERATE_STREAM_PUNCTUATION_RATIO,
  DEGENERATE_STREAM_REPEAT_COUNT,
  DEGENERATE_STREAM_WINDOW_CHARS,
  GENERATION_PROFILE_BY_MODE,
  KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS,
  KNOWLEDGE_CONTEXT_MAX_CHARS,
  KNOWLEDGE_MAX_CHUNKS,
  MAX_CONTEXT_MESSAGES,
  MAX_FINAL_PROMPT_CHARS,
  MAX_HISTORY_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_PROMPT_EXTRA_CHARS,
  MAX_SEARCH_RESULT_CONTENT_CHARS,
  MAX_USER_INPUT_CHARS,
  TAVILY_API_KEY
} from './chat-engine-config.js';
import { logger } from '@/utils/logger.js';
import { EVIDENCE_SOURCE_WEIGHTS, RANKING_SCORE_WEIGHTS, KEYWORD_CACHE_MAX_SIZE } from '@/utils/bohai-constants.js';

let aiMemoryCache = '';
let aiMemoryLoader = null;

// 历史摘要参数：配合放大的上下文窗口同步上调。
// - RECENT_MESSAGES=8: 摘要只覆盖"倒数第 8 条之前"，保留更多原文以减少摘要信息损失。
// - MIN_MESSAGES=16: 至少 16 条历史才触发摘要（避免短对话浪费一次摘要调用）。
// - MAX_CHARS=2000: 摘要本体上限 2000 字符（之前 900），让压缩后的早期上下文也尽量详细。
export const CONVERSATION_SUMMARY_RECENT_MESSAGES = 8;
export const CONVERSATION_SUMMARY_MIN_MESSAGES = 16;
export const CONVERSATION_SUMMARY_MAX_CHARS = 2000;
export const CONVERSATION_SUMMARY_STORAGE_VERSION = 1;
export const GENERATION_STALL_TIMEOUT_MS = 90000;

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

export const normalizeText = (text) => String(text || '').toLowerCase().trim();

export const splitKnowledgeChunks = (rawText) => {
  return String(rawText || '')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 16);
};

// 注意：当前实现是 FIFO 容量上限（按插入顺序淘汰最旧的 key），不是真 LRU。
// 命中率足够支撑现有调用频次；若未来需要 LRU，可改用 Map + 重新插入实现。
const keywordCache = new Map();

export const clearKeywordCache = () => {
  keywordCache.clear();
};

export const extractQueryKeywords = (text) => {
  const normalized = normalizeText(text);

  if (keywordCache.has(normalized)) {
    return keywordCache.get(normalized);
  }

  const tokens = normalized.match(/[a-z0-9_/-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const stopwords = new Set(['这个', '那个', '什么', '怎么', '如何', '请问', '一下', '以及', '然后', '可以', '一个', '我们', '你们']);
  const expanded = new Set();

  tokens.forEach((token) => {
    if (stopwords.has(token)) return;
    expanded.add(token);

    if (/^[\u4e00-\u9fa5]+$/.test(token) && token.length >= 4) {
      for (let len = 2; len <= 4; len += 1) {
        for (let i = 0; i <= token.length - len; i += 1) {
          expanded.add(token.slice(i, i + len));
        }
      }
    }
  });

  const result = [...expanded];

  if (keywordCache.size >= KEYWORD_CACHE_MAX_SIZE) {
    const firstKey = keywordCache.keys().next().value;
    keywordCache.delete(firstKey);
  }
  keywordCache.set(normalized, result);

  return result;
};

export const scoreChunk = (chunk, keywords) => {
  if (!chunk || keywords.length === 0) return 0;
  const normalizedChunk = normalizeText(chunk);
  return keywords.reduce((score, keyword) => {
    return score + (normalizedChunk.includes(keyword) ? Math.min(3, Math.ceil(keyword.length / 2)) : 0);
  }, 0);
};

export const selectRelevantChunks = (rawText, query, maxChunks = KNOWLEDGE_MAX_CHUNKS, { fallback = 'none' } = {}) => {
  const chunks = splitKnowledgeChunks(rawText);
  if (chunks.length === 0) return [];
  const keywords = extractQueryKeywords(query);
  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 && fallback === 'head') {
    return chunks.slice(0, Math.min(2, maxChunks));
  }

  if (scored.length === 0) return [];

  return scored.slice(0, maxChunks).map((item) => item.chunk);
};

export const trimKnowledgeChunk = (text, maxLength = 320) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
};

export const truncateText = (text, maxChars) => {
  const normalized = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
};

export const normalizeMemoryCompareText = (text) => String(text || '')
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
    return normalized === normalizedCandidate
      || normalized.includes(normalizedCandidate)
      || normalizedCandidate.includes(normalized);
  });
};

export const stripWrappingQuotes = (text) => {
  let output = String(text || '').trim();
  output = output.replace(/^[「『“"']+/, '');
  output = output.replace(/[」』”"']+$/, '');
  return output.trim();
};

export const extractExplicitMemoryContent = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const patterns = [
    /^(?:请|麻烦|帮我)?(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)[：:，,\s]*(.+)$/u,
    /^(?:我要|我想|请)?(?:上传|添加|保存|沉淀)(?:一条)?记忆[：:，,\s]*(.+)$/u,
    /^(?:记忆沉淀|记忆)[：:，,\s]*(.+)$/u,
    /^(?:请|麻烦|帮我)?把(.+?)(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)(?:吧|一下)?$/u
  ];

  for (const pattern of patterns) {
    const matched = raw.match(pattern);
    if (!matched?.[1]) continue;
    const cleaned = stripWrappingQuotes(matched[1]);
    if (cleaned.length >= 2) return truncateText(cleaned, 320);
  }

  return '';
};

export const appendPromptSection = (base, section, maxChars = MAX_FINAL_PROMPT_CHARS) => {
  const current = String(base || '');
  const addition = String(section || '');
  if (!addition) return current;
  const remaining = maxChars - current.length;
  if (remaining <= 0) return current;
  if (addition.length <= remaining) return current + addition;
  return current + addition.slice(0, Math.max(0, remaining));
};

export const normalizePromptLine = (text, maxChars = MAX_HISTORY_MESSAGE_CHARS) => {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  return truncateText(normalized, maxChars);
};

export const isContextDependentFollowUp = (text = '') => {
  const normalized = normalizePromptLine(text, 160);
  if (!normalized) return false;
  const explicitFollowUpPattern = /(这个|那个|上面|刚才|刚刚|前面|继续|展开|详细|多说|那|它|其|然后呢|还有呢)/i;
  const shortAttributeQuestionPattern = /^(?:这个|那个|它|那)?(?:作用|用途|原理|好处|区别|怎么做|怎么练|有什么用|为什么|是什么|怎么办|咋办)(?:是?什么|呢|吗|呀|啊)?$/i;
  return (explicitFollowUpPattern.test(normalized) || shortAttributeQuestionPattern.test(normalized))
    && normalized.length <= 42;
};

export const buildContextualFollowUpQuery = (
  userText = '',
  historyMessages = [],
  { maxChars = 900 } = {}
) => {
  const current = normalizePromptLine(userText, MAX_HISTORY_MESSAGE_CHARS);
  if (!current || !isContextDependentFollowUp(current)) return current;

  const source = Array.isArray(historyMessages) ? historyMessages : [];
  const previousTurns = [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const item = source[index];
    if (item?.meta?.kind === 'memory_saved_notice') continue;
    if (item?.role !== 'assistant' && item?.role !== 'user') continue;
    const content = normalizePromptLine(item?.content, 260);
    if (!content) continue;
    previousTurns.unshift(`${item.role === 'assistant' ? '助手' : '用户'}：${content}`);
    if (previousTurns.length >= 4) break;
  }

  if (previousTurns.length === 0) return current;
  return truncateText(`最近对话：${previousTurns.join(' | ')}\n当前追问：${current}`, maxChars);
};

export const buildHistoryMessagesWithinBudget = (
  messages,
  { maxChars = MAX_HISTORY_CONTEXT_CHARS, maxMessages = MAX_CONTEXT_MESSAGES, maxPerMessage = MAX_HISTORY_MESSAGE_CHARS } = {}
) => {
  const source = Array.isArray(messages) ? messages : [];
  const selected = [];
  let usedChars = 0;

  for (let index = source.length - 1; index >= 0; index -= 1) {
    const item = source[index];
    if (item?.meta?.kind === 'memory_saved_notice') continue;
    const content = normalizePromptLine(item?.content, maxPerMessage);
    if (!content) continue;

    const role = item?.role === 'assistant' || item?.role === 'system' ? item.role : 'user';
    const estimated = content.length + 20;
    if (selected.length > 0 && usedChars + estimated > maxChars) {
      break;
    }

    selected.unshift({ role, content });
    usedChars += estimated;
    if (selected.length >= maxMessages) break;
  }

  return selected;
};

export const getStorableDialogueMessages = (messages = []) => {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item?.meta?.kind !== 'memory_saved_notice')
    .filter((item) => item?.role === 'assistant' || item?.role === 'user')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: normalizePromptLine(item?.content, MAX_HISTORY_MESSAGE_CHARS)
    }))
    .filter((item) => item.content);
};

export const buildConversationSummaryFingerprint = (messages = []) => {
  const source = getStorableDialogueMessages(messages);
  if (source.length <= CONVERSATION_SUMMARY_RECENT_MESSAGES) return '';
  const summarized = source.slice(0, -CONVERSATION_SUMMARY_RECENT_MESSAGES);
  const lastSummarized = summarized[summarized.length - 1];
  const firstSummarized = summarized[0];
  return [
    CONVERSATION_SUMMARY_STORAGE_VERSION,
    summarized.length,
    normalizePromptLine(firstSummarized?.content, 80),
    normalizePromptLine(lastSummarized?.content, 120)
  ].join('|');
};

export const buildHistoryMessagesWithCachedSummary = (
  session = {},
  { maxChars = MAX_HISTORY_CONTEXT_CHARS, maxMessages = MAX_CONTEXT_MESSAGES, maxPerMessage = MAX_HISTORY_MESSAGE_CHARS } = {}
) => {
  const allMessages = getStorableDialogueMessages(session?.messages);
  const recentSource = allMessages.slice(-CONVERSATION_SUMMARY_RECENT_MESSAGES);
  const summary = session?.contextSummary;
  const expectedFingerprint = buildConversationSummaryFingerprint(session?.messages);
  const hasUsableSummary = Boolean(
    summary
    && summary.version === CONVERSATION_SUMMARY_STORAGE_VERSION
    && summary.fingerprint === expectedFingerprint
    && normalizePromptLine(summary.content, 20)
  );

  const recentMessages = buildHistoryMessagesWithinBudget(recentSource, {
    maxChars,
    maxMessages,
    maxPerMessage
  });

  if (!hasUsableSummary) return recentMessages;

  const summaryContent = normalizePromptLine(summary.content, CONVERSATION_SUMMARY_MAX_CHARS);
  if (!summaryContent) return recentMessages;

  return [
    {
      role: 'system',
      content: `【此前对话摘要】${summaryContent}`
    },
    ...recentMessages
  ];
};

export const rankEvidenceContextBlocks = (results = [], queryText = '') => {
  const source = Array.isArray(results) ? results : [];
  const keywords = extractQueryKeywords(queryText);

  return source
    .filter((result) => result?.ok && normalizePromptLine(result?.context, 20))
    .map((result, index) => {
      const connectorId = String(result?.connectorId || result?.connector?.id || '').trim();
      const context = String(result.context || '').trim();
      const lexicalScore = scoreChunk(context, keywords);
      const confidenceScore = Math.round(Number(result.confidence || 0) * RANKING_SCORE_WEIGHTS.confidenceMultiplier);
      const sourceScore = EVIDENCE_SOURCE_WEIGHTS[connectorId] || RANKING_SCORE_WEIGHTS.defaultSourceScore;
      return {
        context,
        result,
        index,
        score: (lexicalScore * RANKING_SCORE_WEIGHTS.lexicalMultiplier) + sourceScore + confidenceScore
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
};

export const buildStructuredUserPrompt = ({
  userText = '',
  evidenceContext = '',
  searchContext = '',
  responseRules = '',
  communityRules = '',
  evidenceRules = '',
  operationRules = '',
  availableEvidenceRefs = []
} = {}) => {
  const sections = [
    `<task>\n${truncateText(userText, MAX_USER_INPUT_CHARS)}\n</task>`
  ];

  if (evidenceContext) {
    sections.push(`<internal_evidence>\n${evidenceContext}\n</internal_evidence>`);
  }

  if (searchContext) {
    sections.push(`<web_evidence>\n${searchContext}\n</web_evidence>`);
  }

  if (Array.isArray(availableEvidenceRefs) && availableEvidenceRefs.length > 0) {
    sections.push(`<available_internal_refs>\n${availableEvidenceRefs.join('、')}\n</available_internal_refs>`);
  }

  const ruleSections = [
    responseRules,
    communityRules,
    evidenceRules,
    operationRules
  ].map((item) => String(item || '').trim()).filter(Boolean);

  if (ruleSections.length > 0) {
    sections.push(`<response_rules>\n${ruleSections.join('\n\n')}\n</response_rules>`);
  }

  return truncateText(sections.join('\n\n'), MAX_FINAL_PROMPT_CHARS);
};

export const containsAnyKeyword = (normalizedText, keywords = []) => {
  const source = String(normalizedText || '');
  if (!source) return false;
  return keywords.some((keyword) => source.includes(String(keyword || '').toLowerCase()));
};

export const isMissingRelationError = (error, relation = '') => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const target = String(relation || '').toLowerCase();
  if (code === '42P01') return true;
  if (!target) return false;
  return message.includes(target);
};

export const parsePostTitleAndBody = (rawContent) => {
  const raw = String(rawContent || '').trim();
  if (!raw) {
    return { title: '无标题', body: '' };
  }

  const matched = raw.match(/^【([^】]{1,80})】\s*([\s\S]*)$/u);
  if (matched) {
    const parsedTitle = normalizePromptLine(matched[1], 48) || '无标题';
    const parsedBody = normalizePromptLine(matched[2], 600);
    return { title: parsedTitle, body: parsedBody };
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const firstLine = normalizePromptLine(lines[0], 48) || '无标题';
  return { title: firstLine, body: normalizePromptLine(raw, 600) };
};

export const getPostTitleAndBody = (post = {}) => {
  const explicitTitle = normalizePromptLine(post?.title, 80);
  const explicitBody = normalizePromptLine(post?.body, 900);
  if (explicitTitle || explicitBody) {
    return {
      title: explicitTitle || '无标题',
      body: explicitBody || normalizePromptLine(post?.content, 900)
    };
  }
  return parsePostTitleAndBody(post?.content);
};

export const formatPromptDate = (value, fallback = '未知') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizePromptLine(value, 32) || fallback;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatPromptDateTime = (value, fallback = '未知') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizePromptLine(value, 40) || fallback;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const parseBirthdayValue = (monthText, dayText) => {
  const month = Number(String(monthText || '').trim());
  const day = Number(String(dayText || '').trim());
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
};

export const getBirthdayCountdown = (monthText, dayText) => {
  const parsed = parseBirthdayValue(monthText, dayText);
  if (!parsed) return null;

  const now = new Date();
  const year = now.getFullYear();
  let nextBirthday = new Date(year, parsed.month - 1, parsed.day, 0, 0, 0, 0);
  if (Number.isNaN(nextBirthday.getTime())) return null;

  if (nextBirthday < new Date(year, now.getMonth(), now.getDate(), 0, 0, 0, 0)) {
    nextBirthday = new Date(year + 1, parsed.month - 1, parsed.day, 0, 0, 0, 0);
  }

  const diffMs = nextBirthday.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const days = Math.max(0, Math.round(diffMs / 86400000));
  return {
    month: parsed.month,
    day: parsed.day,
    nextDate: formatPromptDate(nextBirthday, '未知'),
    daysUntil: days
  };
};

export const formatBillingCycleLabel = (cycle) => {
  const normalized = String(cycle || '').toLowerCase().trim();
  if (normalized === 'yearly') return '年付';
  if (normalized === 'monthly') return '月付';
  return '未知';
};

export const escapePromptXmlAttr = (text) => String(text || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const buildSearchResultsContext = (results = []) => {
  if (!Array.isArray(results) || results.length === 0) return '';

  const SEARCH_SUFFIX_TEMPLATE = '\n\n以下是实时搜索结果，请根据这些信息回答用户，如果搜索结果不相关，请忽略：\n<search_results>\n\n</search_results>\n\n请在回答时，在引用搜索结果的地方标注编号，如 [W1], [W2]。并在回答结束时列出参考来源。\n\n';
  const effectiveMax = Math.max(0, MAX_PROMPT_EXTRA_CHARS - SEARCH_SUFFIX_TEMPLATE.length);

  let body = '';
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i];
    const ref = `W${i + 1}`;
    const title = escapePromptXmlAttr(normalizePromptLine(item?.title, 120));
    const url = escapePromptXmlAttr(normalizePromptLine(item?.url, 240));
    const content = escapePromptXmlAttr(normalizePromptLine(item?.content, MAX_SEARCH_RESULT_CONTENT_CHARS));
    const line = `<result index="${i + 1}" ref="${ref}" title="${title}" url="${url}">${content}</result>\n`;
    if (body.length + line.length > effectiveMax) break;
    body += line;
  }

  if (!body) return '';

  return `\n\n以下是实时搜索结果，请根据这些信息回答用户，如果搜索结果不相关，请忽略：\n<search_results>\n${body}</search_results>\n\n请在回答时，在引用搜索结果的地方标注编号，如 [W1], [W2]。并在回答结束时列出参考来源。\n\n`;
};

export const searchWebForPrompt = async (queryText, requestSignal = undefined) => {
  if (!TAVILY_API_KEY) {
    return {
      ok: false,
      disabled: true,
      count: 0,
      context: '',
      message: '未配置联网搜索 Key（VITE_TAVILY_API_KEY）'
    };
  }

  const searchResponse = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    signal: requestSignal,
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: queryText,
      search_depth: 'basic',
      include_answer: false,
      max_results: 3
    })
  });

  if (!searchResponse.ok) {
    let searchErrorMessage = `HTTP ${searchResponse.status}`;
    try {
      const searchErrorData = await searchResponse.json();
      const maybeMessage = String(
        searchErrorData?.message
        || searchErrorData?.error
        || searchErrorData?.detail
        || ''
      ).trim();
      if (maybeMessage) {
        searchErrorMessage = maybeMessage;
      }
    } catch (_parseError) {
      // Ignore non-json error body.
    }
    return {
      ok: false,
      disabled: false,
      count: 0,
      context: '',
      message: searchErrorMessage
    };
  }

  const searchData = await searchResponse.json();
  const results = Array.isArray(searchData?.results) ? searchData.results : [];
  return {
    ok: true,
    disabled: false,
    count: results.length,
    context: buildSearchResultsContext(results),
    results
  };
};

export const isOperationQuestion = (text) => {
  const normalized = normalizeText(text);
  const operationKeywords = [
    '如何', '怎么', '步骤', '入口', '路径', '路由', '在哪', '在哪里', '使用', '操作', '教程', '指引',
    '写印象', '发帖', '发布', '查看', '进入', '打开'
  ];
  return operationKeywords.some((keyword) => normalized.includes(keyword));
};

export const shouldUseSiteGuide = (text) => {
  return isOperationQuestion(text);
};

export const normalizeActionInput = (text) => String(text || '')
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

export const extractMultilineField = (text, labels = [], maxChars = ACTION_DRAFT_CONTENT_MAX_CHARS) => {
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

export const trimLeadingDraftDelimiters = (text) => String(text || '').replace(/^[，,。；;、\s]+/g, '').trim();

export const extractFieldUntilNextLabel = (
  text,
  labels = [],
  nextLabels = [],
  maxChars = ACTION_DRAFT_CONTENT_MAX_CHARS
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
  ideaText = ideaText.replace(/(?:标题|title)\s*[：:][^\n]+/ig, ' ');
  ideaText = ideaText.replace(/(?:内容|正文|body|想法)(?:是)?\s*[：:]/ig, ' ');
  ideaText = ideaText.replace(/^(?:请你|请帮我|帮我|替我|代我|我想|我要|帮忙|麻烦你?)\s*/ig, ' ');
  ideaText = ideaText.replace(/^(?:起草|生成|写|整理)\s*(?:一条|一篇|一个)?\s*(?:论坛|社区|帖子|发布文案|标题和正文)\s*/ig, ' ');
  return normalizePromptLine(trimLeadingDraftDelimiters(ideaText), ACTION_DRAFT_CONTENT_MAX_CHARS);
};

export const stripPostDraftTitleNoise = (text) => normalizePromptLine(text, ACTION_DRAFT_TITLE_MAX_CHARS)
  .replace(/^(?:AI草稿|草稿|标题|帖子|论坛|社区)\s*[：:：-]?\s*/i, '')
  .replace(/^(?:关于|有关)\s*/, '')
  .replace(/^(?:我最近|最近|我发现|我想|想问问大家|想和大家聊聊|请教一下)\s*/i, '')
  .replace(/(?:想问问大家|大家怎么看|有没有人遇到|有没有遇到过|欢迎大家).*/i, '')
  .trim();

export const buildLocalPostDraftTitle = (text) => {
  const safeText = normalizePromptLine(text, ACTION_DRAFT_CONTENT_MAX_CHARS);
  const firstSentence = safeText.split(/[。！？!?；;\n]/).map((item) => item.trim()).find(Boolean) || safeText;
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

  const hasQuestionTone = /(吗|么|怎么办|怎么|如何|为什么|原因|有没有|是否|可不可以|行不行|建议|办法|解决)/.test(ideaText);
  const endMark = /[。！？!?]$/.test(ideaText) ? '' : '。';
  const lead = hasQuestionTone ? '我想和大家请教一下：' : '我想和大家分享一个想法：';
  const tail = hasQuestionTone
    ? '如果你也遇到过类似情况，欢迎分享一下原因、处理办法或经验。'
    : '也想听听大家怎么看，欢迎补充不同的经验或建议。';

  return normalizePromptLine(`${lead}${ideaText}${endMark}\n\n${tail}`, ACTION_DRAFT_CONTENT_MAX_CHARS);
};

export const isWeakPostDraftTitle = (title, rawText, content) => {
  const normalizedTitle = normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS);
  if (!normalizedTitle) return true;
  if (/^(?:AI草稿|草稿|帮我|请帮我|请你|我要|我想|生成|起草|写|整理|发帖)/i.test(normalizedTitle)) return true;

  const compactTitle = normalizedTitle.replace(/\s+/g, '');
  const compactRaw = normalizePromptLine(rawText, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(/\s+/g, '');
  const compactContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(/\s+/g, '');
  if (compactRaw && compactTitle === compactRaw) return true;
  if (compactContent && compactTitle.length > 18 && compactContent.startsWith(compactTitle)) return true;
  return false;
};


export const buildPostDraftFromText = (text) => {
  const safeText = normalizeActionInput(text);
  const normalized = stripLeadingActionPhrase(safeText);
  const explicitTitle = extractFieldUntilNextLabel(
    normalized,
    ['标题', 'title'],
    ['内容', '正文', 'body'],
    ACTION_DRAFT_TITLE_MAX_CHARS
  ) || extractSingleLineField(normalized, ['标题', 'title']);
  let content = extractFieldUntilNextLabel(
    normalized,
    ['内容', '正文', 'body'],
    [],
    ACTION_DRAFT_CONTENT_MAX_CHARS
  ) || extractMultilineField(normalized, ['内容', '正文', 'body'], ACTION_DRAFT_CONTENT_MAX_CHARS);

  if (!content) {
    let fallback = normalized;
    fallback = fallback.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
    fallback = fallback.replace(/(?:标题|title)\s*[：:][^\n]+/ig, '');
    fallback = fallback.replace(/(?:内容|正文|body|想法)(?:是)?\s*[：:]/ig, '');
    content = buildLocalPostDraftContent(trimLeadingDraftDelimiters(fallback));
  }

  if (!content) {
    content = '（请在这里填写帖子正文）';
  }

  const suggestedTitle = buildLocalPostDraftTitle(content);
  const title = normalizePromptLine(explicitTitle || suggestedTitle, ACTION_DRAFT_TITLE_MAX_CHARS);

  return {
    title,
    content: normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS)
  };
};

/**
 * Noise pattern for post draft idea extraction.
 *
 * NOTE (2026-06-09): Core Chinese conjunctions (和/与/并且/然后/可以/需要)
 * are intentionally excluded from noise removal per P1-B-6 fix.
 * Only directive/action verbs are stripped.
 */
export const POST_DRAFT_IDEA_NOISE_PATTERN = /(帮我|替我|代我|请帮我|请你|我想|我要|想要|麻烦|先|直接|自动|起草|生成|写|整理|发布|发出去|标题|正文|内容|文案|草稿|一下|一条|一篇|一个|论坛|社区|帖子|发帖|发布文案|编辑后|可直接)/g;
export const POST_DRAFT_PLACEHOLDER_PATTERN = /(请在这里填写帖子正文|先起草标题和正文|起草标题和正文|标题和正文|发帖内容|发布文案)/;

export const hasPostDraftUserIdea = (rawText, draft = {}) => {
  const raw = normalizePromptLine(rawText, ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (!raw) return false;
  const fallbackContent = normalizePromptLine(draft.content, ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (!fallbackContent || POST_DRAFT_PLACEHOLDER_PATTERN.test(fallbackContent)) return false;

  const explicitBody = extractFieldUntilNextLabel(raw, ['内容', '正文', 'body', '想法'], [], ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (explicitBody && explicitBody.replace(/\s+/g, '').length >= 4) return true;

  let ideaText = raw;
  ideaText = ideaText.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
  ideaText = ideaText.replace(/(?:标题|title)\s*[：:][^\n]+/ig, ' ');
  ideaText = ideaText.replace(/(?:内容|正文|body|想法)\s*[：:]/ig, ' ');
  ideaText = ideaText.replace(POST_DRAFT_IDEA_NOISE_PATTERN, ' ');
  ideaText = normalizePromptLine(ideaText, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(/\s+/g, '');
  return ideaText.length >= 4;
};

export const extractRecipientName = (text) => {
  const safeText = normalizeActionInput(text);
  const byLabel = extractSingleLineField(safeText, ['收件人', '接收人', 'recipient', 'to']);
  if (byLabel) {
    return normalizePromptLine(byLabel.replace(/^@/, ''), 40);
  }

  const normalized = stripLeadingActionPhrase(safeText);
  const matched = normalized.match(/给\s*([^\s，,。；;:：]{1,30})\s*发(?:邮件|私信|信)/i);
  return normalizePromptLine((matched?.[1] || '').replace(/^@/, ''), 40);
};

export const buildMailDraftFromText = (text) => {
  const safeText = normalizeActionInput(text);
  const normalized = stripLeadingActionPhrase(safeText);
  const recipientName = extractRecipientName(normalized);
  const subject = extractSingleLineField(normalized, ['主题', '标题', 'subject']) || 'AI草稿私信';

  let content = extractMultilineField(normalized, ['内容', '正文', 'body'], ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (!content) {
    let fallback = normalized;
    fallback = fallback.replace(ACTION_MAIL_TRIGGER_PATTERN, '');
    fallback = fallback.replace(/给\s*[^\s，,。；;:：]{1,30}\s*发(?:邮件|私信|信)/ig, '');
    fallback = fallback.replace(/(?:收件人|接收人|recipient|to)\s*[：:][^\n]+/ig, '');
    fallback = fallback.replace(/(?:主题|标题|subject)\s*[：:][^\n]+/ig, '');
    fallback = fallback.replace(/(?:内容|正文|body)\s*[：:]/ig, '');
    content = normalizePromptLine(fallback, ACTION_DRAFT_CONTENT_MAX_CHARS);
  }
  if (!content) {
    content = '（请在这里填写信件正文）';
  }

  return {
    recipientName,
    subject: normalizePromptLine(subject, ACTION_DRAFT_SUBJECT_MAX_CHARS),
    content: normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS)
  };
};

export const buildPageDraftFromText = (text) => {
  const safeText = normalizeActionInput(text);
  const normalized = stripLeadingActionPhrase(safeText);
  const pageTypeMatched = normalized.match(/(首页|主页|落地页|活动页|公告页|展示页|介绍页|个人介绍|作品集|登录页|注册页|关于页|联系我们|产品页|宣传页|推广页|营销页)/);
  const pageType = pageTypeMatched?.[1] || '展示页';
  const description = extractMultilineField(normalized, ['描述', '要求', '需求', '说明'], 420)
    || normalized
        .replace(/(创建网页|创建页面|生成网页|生成页面|做个网页|做个页面|做个主页|做个落地页|搭建网页|搭建页面|设计网页|设计页面|建个网页|建个页面|制作网页|制作页面|网页设计|页面设计)/ig, '')
        .replace(/(首页|主页|落地页|活动页|公告页|展示页|介绍页|个人介绍|作品集|登录页|注册页|关于页|联系我们|产品页|宣传页|推广页|营销页)/g, '')
        .replace(/(帮我|替我|代我|请帮我|请你|我想|我要|想要|需要|帮忙)/ig, '')
        .trim();
  return {
    pageType,
    description: normalizePromptLine(description || '一个简洁美观的展示页面', 420)
  };
};

export const compressKnowledgeContextBlocks = (
  blocks = [],
  { maxChars = KNOWLEDGE_CONTEXT_MAX_CHARS, maxPerBlock = KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS } = {}
) => {
  const source = Array.isArray(blocks) ? blocks : [];
  const normalizedBlocks = source
    .map((block) => normalizePromptLine(block, maxPerBlock))
    .filter(Boolean);
  if (normalizedBlocks.length === 0) return '';

  let merged = '';
  for (let i = 0; i < normalizedBlocks.length; i += 1) {
    const block = normalizedBlocks[i];
    const candidate = merged ? `${merged}\n\n${block}` : block;
    if (candidate.length <= maxChars) {
      merged = candidate;
      continue;
    }
    const remain = maxChars - merged.length - (merged ? 2 : 0);
    if (remain <= 48) break;
    const clipped = truncateText(block, remain);
    merged = merged ? `${merged}\n\n${clipped}` : clipped;
    break;
  }

  return merged;
};

export const getGenerationProfile = (modeId, { factualQuestion = false, operationQuestion = false } = {}) => {
  const fallback = { temperature: 0.24, top_p: 0.76, frequency_penalty: 0.08, max_tokens: 1800 };
  const base = GENERATION_PROFILE_BY_MODE[modeId] || fallback;
  const profile = { ...base };
  if (factualQuestion || operationQuestion) {
    profile.temperature = Math.min(profile.temperature, operationQuestion ? 0.14 : 0.16);
    profile.top_p = Math.min(profile.top_p, operationQuestion ? 0.68 : 0.72);
    profile.frequency_penalty = Math.min(profile.frequency_penalty, 0.08);
  }
  return profile;
};

export const INTERNAL_PROGRESS_LINE_PATTERNS = [
  /^\s*>\s*\*\*(?:正在搜索|找到\s*\d+\s*个结果|未找到相关结果|自动检索中|知识路由|已完成内部检索|未检索到匹配内部资料)\*\*.*$/u,
  /^\s*>\s*(?:⚠️|✅|❌|⚙️)\s*\*\*.*\*\*.*$/u,
  /^\s*>\s*\d+\.\s*\[[^\]]+\]\((?:https?:\/\/|www\.)[^)]+\)\s*$/u
];

export const cleanAssistantVisibleReply = (text) => {
  const raw = String(text || '');
  if (!raw) return '';

  const filteredLines = raw
    .split('\n')
    .filter((line) => !INTERNAL_PROGRESS_LINE_PATTERNS.some((pattern) => pattern.test(line)));

  const compacted = [];
  for (let i = 0; i < filteredLines.length; i += 1) {
    const current = filteredLines[i];
    const prev = compacted[compacted.length - 1];
    if (current.trim() === '' && String(prev || '').trim() === '') continue;
    compacted.push(current);
  }
  return compacted.join('\n').trim();
};

export const normalizeCompactText = (text) => String(text || '').replace(/\s+/g, '');

export const normalizeEscapedLineBreaks = (text) => {
  const raw = String(text || '');
  const escapedBreakCount = (raw.match(/\\[rn]/g) || []).length;
  if (escapedBreakCount < 2) return raw;

  return raw
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
};

export const hasEscapedLineBreakFlood = (text) => {
  const raw = String(text || '');
  if (raw.length < 24) return false;

  const escapedBreaks = raw.match(/\\[rn]/g) || [];
  if (escapedBreaks.length >= 14) return true;

  const compact = raw.replace(/\s+/g, '');
  if (/(?:\\[rn]["'`]?){8,}/i.test(compact)) return true;

  const tail = compact.slice(-DEGENERATE_STREAM_WINDOW_CHARS);
  return /(?:\\[rn]["'`]?){6,}$/i.test(tail);
};

// 退化判定中识别的标点/符号字符集。中英文、全半角混排统一纳入。
// 字符级正则源串：用于构造 RegExp。已对 \ ] 等字符做转义。
const PUNCT_REPEAT_CHAR_CLASS = '[!！?？。．.，,、~～\\-_=+*#@%^&|/\\\\:;\`\'"\\[\\]{}]';
// 字符级正则源串：用于 match 中提取标点（不含 [ ] { }，与原始实现保持一致）。
const PUNCT_DENSITY_CHAR_CLASS = '[!！?？。．.，,、~～\\-_=+*#@%^&|/\\\\:;\`\'"]';

const buildPunctRepeatRegex = (repeatCount) => new RegExp(`(${PUNCT_REPEAT_CHAR_CLASS})\\1{${repeatCount},}`, 'u');
const buildPunctDensityRegex = () => new RegExp(PUNCT_DENSITY_CHAR_CLASS, 'gu');

export const isDegenerateAssistantReply = (text) => {
  const normalized = normalizeEscapedLineBreaks(text).trim();
  if (!normalized) return true;
  if (hasEscapedLineBreakFlood(text)) return true;

  const compact = normalizeCompactText(normalized);
  if (!compact) return true;
  if (new RegExp(`(.)\\1{${DEGENERATE_REPEAT_COUNT},}`, 'u').test(compact)) return true;
  if (buildPunctRepeatRegex(DEGENERATE_PUNCT_REPEAT_COUNT).test(compact)) return true;

  if (compact.length < 40) return false;
  const punctCount = (compact.match(buildPunctDensityRegex()) || []).length;
  return punctCount / compact.length >= DEGENERATE_PUNCTUATION_RATIO;
};

export const isDegenerateStreamOutput = (text) => {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  if (hasEscapedLineBreakFlood(normalized)) return true;

  const compact = normalizeCompactText(normalized.slice(-DEGENERATE_STREAM_WINDOW_CHARS));
  const tailPunctuationRun = compact.match(new RegExp(`(${PUNCT_DENSITY_CHAR_CLASS.slice(1, -1)}){18,}$`, 'u'));
  if (tailPunctuationRun && tailPunctuationRun[1].length / Math.max(1, compact.length) >= 0.08) {
    return true;
  }
  if (compact.length < DEGENERATE_STREAM_MIN_CHARS) return false;

  if (buildPunctRepeatRegex(DEGENERATE_STREAM_REPEAT_COUNT).test(compact)) {
    return true;
  }

  const punctCount = (compact.match(buildPunctDensityRegex()) || []).length;
  return punctCount / compact.length >= DEGENERATE_STREAM_PUNCTUATION_RATIO;
};
