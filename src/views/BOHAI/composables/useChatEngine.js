import { ref, reactive, computed, nextTick, watch, onScopeDispose } from 'vue';
import { storeToRefs } from 'pinia';
import {
  getRelevantCommandInstructions,
  getCommandSystemPrompt,
  detectCommandIntent,
  validateCommandOutput,
  buildCommandRepairPrompt
} from '@/utils/minecraft-command-helper.js';
import { createPost, getPosts, getUserPosts } from '@/utils/api/forum-api.js';
import {
  createMyTreeholeSpace,
  getSharedAIMemoriesForAI,
  searchSharedAIMemoriesForAI,
  searchBohAIKnowledgeForAI,
  createSharedAIMemory,
  createTreeholeMemory,
  captureTreeholeMemoriesFromDialogue
} from '@/utils/api/treehole-api.js';
import { createMyCloudEntry, getMyCloudEntriesForAI } from '@/utils/api/boh-cloud-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import { sendModeratedMessages } from '@/utils/api/messages-api.js';
import {
  isLikelyBohInternalFactualQuestion,
  isLikelyFactualQuestion,
  extractCitationIdsFromText,
  shouldRepairUngroundedReply,
  resolveKnowledgeRoutingPlanCore
} from '@/utils/ai-chat-grounding.js';
import { useAuthStore } from '@/stores/auth.js';
import { supabase } from '@/utils/supabase-client.js';
import { isModerationApproved } from '@/utils/content-moderation.js';
import {
  normalizeActionDecisionText,
  isActionDraftCancelIntent,
  isPostDraftConfirmIntent,
  isMailDraftConfirmIntent,
  isPostDraftRequest,
  isMailDraftRequest
} from '@/utils/bohai-action-draft-intent.js';
import {
  BOH_AUTO_MODE_ID,
  resolveBOHAIAutoModeDecision
} from '@/utils/bohai-auto-router.js';
import {
  BOHAI_ACTION_IDS,
  BOHAI_CONNECTOR_IDS,
  buildBohAIConnectorActionNote,
  createBohAIAction,
  createBohAIConnector,
  runBohAIAction,
  runBohAIReadConnectors,
  summarizeBohAIConnectorResults
} from '@/utils/bohai-connectors.js';
import { SITE_OPERATION_MEMORY } from '@/data/ai-site-guide.js';
import { logger } from '@/utils/logger.js';
import {
  ACCURACY_PREFERRED_MODEL_ID,
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_SUBJECT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS,
  ACTION_MAIL_TRIGGER_PATTERN,
  ACTION_POST_TRIGGER_PATTERN,
  AUTO_ROUTER_MODEL_ID,
  BASE_SYSTEM_PROMPT,
  BLOCK_DURATION_MS,
  CLOUD_REFERENCE_CONSENT_KEY,
  DEGENERATE_PUNCT_REPEAT_COUNT,
  DEGENERATE_PUNCTUATION_RATIO,
  DEGENERATE_REPEAT_COUNT,
  DEGENERATE_STREAM_MIN_CHARS,
  DEGENERATE_STREAM_PUNCTUATION_RATIO,
  DEGENERATE_STREAM_REPEAT_COUNT,
  DEGENERATE_STREAM_WINDOW_CHARS,
  FORUM_MAX_CHARS_PER_POST,
  FORUM_MAX_POSTS,
  GENERATION_PROFILE_BY_MODE,
  GIFT_STATUS_LABELS,
  KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS,
  KNOWLEDGE_CONTEXT_MAX_CHARS,
  KNOWLEDGE_MAX_CHUNKS,
  LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY,
  MAX_CONTEXT_MESSAGES,
  MAX_FINAL_PROMPT_CHARS,
  MAX_HISTORY_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_MESSAGES_PER_WINDOW,
  MAX_PROMPT_EXTRA_CHARS,
  MAX_SEARCH_RESULT_CONTENT_CHARS,
  MAX_USER_INPUT_CHARS,
  MEMORY_CAPTURE_CONTEXT_ITEMS,
  MEMORY_CAPTURE_MIN_DIALOGUE_ITEMS,
  MEMORY_CAPTURE_MIN_USER_CHARS,
  MEMORY_CAPTURE_SETTING_KEY,
  MEMORY_CAPTURE_STATUS_TIMEOUT_MS,
  MEMORY_MAX_CHUNKS,
  MEMORY_NOTICE_MAX_ITEMS,
  MIN_INTERVAL_MS,
  OPERATION_MAX_STEPS,
  QUICK_NOTE_CONTENT_MAX_CHARS,
  QUICK_NOTE_SETTING_KEY,
  QUICK_NOTE_TITLE_MAX_CHARS,
  RAG_PREFERRED_MODEL_ID,
  RATE_LIMIT_WINDOW_MS,
  ROUTING_FORUM_REALTIME_PATTERN,
  ROUTING_HISTORY_FACT_PATTERN,
  SESSION_SAVE_DEBOUNCE_MS,
  SESSION_SAVE_IDLE_TIMEOUT_MS,
  SHARED_MEMORY_CACHE_TTL_MS,
  SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS,
  SHARED_MEMORY_CONTEXT_MAX_ITEMS,
  SHARED_MEMORY_LIMIT,
  SHARED_MEMORY_SEARCH_FETCH_LIMIT,
  SHARED_MEMORY_TRIGGER_KEYWORDS,
  SHOW_INTERNAL_PROGRESS_NOTES,
  SITE_GUIDE_MAX_CHUNKS,
  SUBSCRIPTION_STATUS_LABELS,
  TAVILY_API_KEY,
  TREEHOLE_CONTEXT_MAX_ITEM_CHARS,
  TREEHOLE_CONTEXT_MAX_ITEMS,
  TREEHOLE_MEMORY_CACHE_TTL_MS,
  TREEHOLE_MEMORY_LIMIT,
  TREEHOLE_MEMORY_SYNC_SETTING_KEY,
  USER_PRIVATE_ALL_KEYWORDS,
  USER_PRIVATE_BIRTHDAY_KEYWORDS,
  USER_PRIVATE_CONTEXT_CACHE_TTL_MS,
  USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS,
  USER_PRIVATE_CONTEXT_MAX_ITEMS,
  USER_PRIVATE_GIFT_KEYWORDS,
  USER_PRIVATE_GIFTS_FETCH_LIMIT,
  USER_PRIVATE_MAIL_FETCH_LIMIT,
  USER_PRIVATE_MAIL_KEYWORDS,
  USER_PRIVATE_PERSONAL_PATTERN,
  USER_PRIVATE_POST_KEYWORDS,
  USER_PRIVATE_POSTS_FETCH_LIMIT,
  USER_PRIVATE_PUSHPLUS_KEYWORDS,
  USER_PRIVATE_SUBSCRIPTION_KEYWORDS,
  USER_PRIVATE_SUMMARY_KEYWORDS,
  availableModels,
  chatModes
} from './chat-engine-config.js';

export { availableModels, chatModes } from './chat-engine-config.js';

let aiMemoryCache = '';
let aiMemoryLoader = null;

async function getAIMemory() {
  if (aiMemoryCache) return aiMemoryCache;
  if (!aiMemoryLoader) {
    aiMemoryLoader = import('@/data/ai-memory.js')
      .then((module) => {
        aiMemoryCache = typeof module.AI_MEMORY === 'string' ? module.AI_MEMORY : '';
        return aiMemoryCache;
      })
      .catch((error) => {
        logger.error('boh-ai', 'Load AI memory failed', error);
        return '';
      });
  }
  return aiMemoryLoader;
}

const normalizeText = (text) => String(text || '').toLowerCase().trim();

const splitKnowledgeChunks = (rawText) => {
  return String(rawText || '')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 16);
};

const extractQueryKeywords = (text) => {
  const normalized = normalizeText(text);
  const tokens = normalized.match(/[a-z0-9_/-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const stopwords = new Set(['这个', '那个', '什么', '怎么', '如何', '请问', '一下', '以及', '然后', '可以', '一个', '我们', '你们']);
  const expanded = new Set();

  tokens.forEach((token) => {
    if (stopwords.has(token)) return;
    expanded.add(token);

    // 中文长词做子串切分，提升“如何给别人写印象”这类问题的召回率
    if (/^[\u4e00-\u9fa5]+$/.test(token) && token.length >= 4) {
      for (let len = 2; len <= 4; len += 1) {
        for (let i = 0; i <= token.length - len; i += 1) {
          expanded.add(token.slice(i, i + len));
        }
      }
    }
  });

  return [...expanded];
};

const scoreChunk = (chunk, keywords) => {
  if (!chunk || keywords.length === 0) return 0;
  const normalizedChunk = normalizeText(chunk);
  return keywords.reduce((score, keyword) => {
    return score + (normalizedChunk.includes(keyword) ? Math.min(3, Math.ceil(keyword.length / 2)) : 0);
  }, 0);
};

const selectRelevantChunks = (rawText, query, maxChunks = KNOWLEDGE_MAX_CHUNKS, { fallback = 'none' } = {}) => {
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

const trimKnowledgeChunk = (text, maxLength = 320) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
};

const truncateText = (text, maxChars) => {
  const normalized = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
};

const normalizeMemoryCompareText = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '')
  .trim();

const isLikelyMemoryDuplicate = (candidate, existingItems = []) => {
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

const stripWrappingQuotes = (text) => {
  let output = String(text || '').trim();
  output = output.replace(/^[「『“"']+/, '');
  output = output.replace(/[」』”"']+$/, '');
  return output.trim();
};

const extractExplicitMemoryContent = (text) => {
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

const appendPromptSection = (base, section, maxChars = MAX_FINAL_PROMPT_CHARS) => {
  const current = String(base || '');
  const addition = String(section || '');
  if (!addition) return current;
  const remaining = maxChars - current.length;
  if (remaining <= 0) return current;
  if (addition.length <= remaining) return current + addition;
  return current + addition.slice(0, Math.max(0, remaining));
};

const normalizePromptLine = (text, maxChars = MAX_HISTORY_MESSAGE_CHARS) => {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  return truncateText(normalized, maxChars);
};

const buildHistoryMessagesWithinBudget = (
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

const containsAnyKeyword = (normalizedText, keywords = []) => {
  const source = String(normalizedText || '');
  if (!source) return false;
  return keywords.some((keyword) => source.includes(String(keyword || '').toLowerCase()));
};

const isMissingRelationError = (error, relation = '') => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const target = String(relation || '').toLowerCase();
  if (code === '42P01') return true;
  if (!target) return false;
  return message.includes(target);
};

const parsePostTitleAndBody = (rawContent) => {
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

const formatPromptDate = (value, fallback = '未知') => {
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

const parseBirthdayValue = (monthText, dayText) => {
  const month = Number(String(monthText || '').trim());
  const day = Number(String(dayText || '').trim());
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
};

const getBirthdayCountdown = (monthText, dayText) => {
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

const formatBillingCycleLabel = (cycle) => {
  const normalized = String(cycle || '').toLowerCase().trim();
  if (normalized === 'yearly') return '年付';
  if (normalized === 'monthly') return '月付';
  return '未知';
};

const escapePromptXmlAttr = (text) => String(text || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const buildSearchResultsContext = (results = []) => {
  if (!Array.isArray(results) || results.length === 0) return '';

  let body = '';
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i];
    const ref = `W${i + 1}`;
    const title = escapePromptXmlAttr(normalizePromptLine(item?.title, 120));
    const url = escapePromptXmlAttr(normalizePromptLine(item?.url, 240));
    const content = escapePromptXmlAttr(normalizePromptLine(item?.content, MAX_SEARCH_RESULT_CONTENT_CHARS));
    const line = `<result index="${i + 1}" ref="${ref}" title="${title}" url="${url}">${content}</result>\n`;
    if (body.length + line.length > MAX_PROMPT_EXTRA_CHARS) break;
    body += line;
  }

  if (!body) return '';

  return `\n\n以下是实时搜索结果，请根据这些信息回答用户，如果搜索结果不相关，请忽略：\n<search_results>\n${body}</search_results>\n\n请在回答时，在引用搜索结果的地方标注编号，如 [W1], [W2]。并在回答结束时列出参考来源。\n\n`;
};

const searchWebForPrompt = async (queryText, requestSignal = undefined) => {
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

const isOperationQuestion = (text) => {
  const normalized = normalizeText(text);
  const operationKeywords = [
    '如何', '怎么', '步骤', '入口', '路径', '路由', '在哪', '在哪里', '使用', '操作', '教程', '指引',
    '写印象', '发帖', '发布', '查看', '进入', '打开'
  ];
  return operationKeywords.some((keyword) => normalized.includes(keyword));
};

const shouldUseSiteGuide = (text) => {
  return isOperationQuestion(text);
};

const normalizeActionInput = (text) => String(text || '')
  .replace(/\r/g, '')
  .trim();

const stripLeadingActionPhrase = (text) => {
  let output = String(text || '').trim();
  output = output.replace(/^(请你|请帮我|帮我|替我|代我|我想|我要|帮忙)\s*/i, '');
  output = output.replace(/^(给我|帮我)\s*/i, '');
  return output.trim();
};

const extractSingleLineField = (text, labels = []) => {
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

const extractMultilineField = (text, labels = [], maxChars = ACTION_DRAFT_CONTENT_MAX_CHARS) => {
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

const trimLeadingDraftDelimiters = (text) => String(text || '').replace(/^[，,。；;、\s]+/g, '').trim();

const extractFieldUntilNextLabel = (
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


const buildPostDraftFromText = (text) => {
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
    fallback = fallback.replace(/(?:内容|正文|body)\s*[：:]/ig, '');
    content = normalizePromptLine(trimLeadingDraftDelimiters(fallback), ACTION_DRAFT_CONTENT_MAX_CHARS);
  }

  if (!content) {
    content = '（请在这里填写帖子正文）';
  }

  const compact = content.replace(/\s+/g, '');
  const suggestedTitle = compact
    ? `AI草稿：${compact.slice(0, 18)}${compact.length > 18 ? '...' : ''}`
    : 'AI草稿';
  const title = normalizePromptLine(explicitTitle || suggestedTitle, ACTION_DRAFT_TITLE_MAX_CHARS);

  return {
    title,
    content: normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS)
  };
};

const extractRecipientName = (text) => {
  const safeText = normalizeActionInput(text);
  const byLabel = extractSingleLineField(safeText, ['收件人', '接收人', 'recipient', 'to']);
  if (byLabel) {
    return normalizePromptLine(byLabel.replace(/^@/, ''), 40);
  }

  const normalized = stripLeadingActionPhrase(safeText);
  const matched = normalized.match(/给\s*([^\s，,。；;:：]{1,30})\s*发(?:邮件|私信|信)/i);
  return normalizePromptLine((matched?.[1] || '').replace(/^@/, ''), 40);
};

const buildMailDraftFromText = (text) => {
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

const compressKnowledgeContextBlocks = (
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

const getGenerationProfile = (modeId, { factualQuestion = false, operationQuestion = false } = {}) => {
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

const INTERNAL_PROGRESS_LINE_PATTERNS = [
  /^\s*>\s*\*\*(?:正在搜索|找到|未找到|自动检索中|知识路由|已完成内部检索|未检索到匹配内部资料)\*\*.*$/u,
  /^\s*>\s*(?:⚠️|✅|❌|⚙️)\s*\*\*.*\*\*.*$/u,
  /^\s*>\s*\d+\.\s*\[[^\]]+\]\((?:https?:\/\/|www\.)[^)]+\)\s*$/u
];

const cleanAssistantVisibleReply = (text) => {
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

const normalizeCompactText = (text) => String(text || '').replace(/\s+/g, '');

const normalizeEscapedLineBreaks = (text) => {
  const raw = String(text || '');
  const escapedBreakCount = (raw.match(/\\[rn]/g) || []).length;
  if (escapedBreakCount < 2) return raw;

  return raw
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
};

const hasEscapedLineBreakFlood = (text) => {
  const raw = String(text || '');
  if (raw.length < 24) return false;

  const escapedBreaks = raw.match(/\\[rn]/g) || [];
  if (escapedBreaks.length >= 14) return true;

  const compact = raw.replace(/\s+/g, '');
  if (/(?:\\[rn]["'`]?){8,}/i.test(compact)) return true;

  const tail = compact.slice(-DEGENERATE_STREAM_WINDOW_CHARS);
  return /(?:\\[rn]["'`]?){6,}$/i.test(tail);
};

const isDegenerateAssistantReply = (text) => {
  const normalized = normalizeEscapedLineBreaks(text).trim();
  if (!normalized) return true;
  if (hasEscapedLineBreakFlood(text)) return true;

  const compact = normalizeCompactText(normalized);
  if (!compact) return true;
  if (new RegExp(`(.)\\1{${DEGENERATE_REPEAT_COUNT},}`, 'u').test(compact)) return true;
  if (new RegExp(`([!！?？。．.，,、~～\\-_=+*#@%^&|/\\\\:;\`'"])\\1{${DEGENERATE_PUNCT_REPEAT_COUNT},}`, 'u').test(compact)) return true;

  if (compact.length < 40) return false;
  const punctCount = (compact.match(/[!！?？。．.，,、~～\-_=+*#@%^&|/\\:;`'"]/gu) || []).length;
  return punctCount / compact.length >= DEGENERATE_PUNCTUATION_RATIO;
};

const isDegenerateStreamOutput = (text) => {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  if (hasEscapedLineBreakFlood(normalized)) return true;

  const compact = normalizeCompactText(normalized.slice(-DEGENERATE_STREAM_WINDOW_CHARS));
  if (compact.length < DEGENERATE_STREAM_MIN_CHARS) return false;

  if (new RegExp(`([!！?？。．.，,、~～\\-_=+*#@%^&|/\\\\:;\`'"])\\1{${DEGENERATE_STREAM_REPEAT_COUNT},}`, 'u').test(compact)) {
    return true;
  }

  const punctCount = (compact.match(/[!！?？。．.，,、~～\-_=+*#@%^&|/\\:;`'"]/gu) || []).length;
  return punctCount / compact.length >= DEGENERATE_STREAM_PUNCTUATION_RATIO;
};

export function useChatEngine() {
  const authStore = useAuthStore();
  const { isLoggedIn, userInfo } = storeToRefs(authStore);

  // State
  const chatSessions = reactive([
    { title: '新对话', messages: [], timestamp: Date.now(), isLoading: false, isThinking: false }
  ]);
  const currentSessionIndex = ref(0);
  const activeGenerationSessionIndex = ref(null);
  const treeholeMemoryCache = reactive({
    userId: '',
    fetchedAt: 0,
    items: []
  });
  const sharedMemoryCache = reactive({
    fetchedAt: 0,
    items: []
  });
  const sharedMemorySearchCache = new Map();
  const pendingTreeholeCreation = reactive({
    awaitingConfirmation: false,
    userId: '',
    sessionIndex: -1
  });
  const pendingCloudReferenceConsent = reactive({
    awaitingConfirmation: false,
    userId: '',
    sessionIndex: -1
  });
  const pendingSharedMemoryCapture = reactive({
    awaitingConfirmation: false,
    userId: '',
    sessionIndex: -1,
    content: '',
    destination: 'ask'
  });
  const pendingQuickNote = reactive({
    visible: false,
    busy: false,
    userId: '',
    sessionIndex: -1,
    messageIndex: -1,
    title: '',
    content: '',
    error: ''
  });
  const pendingActionDraft = reactive({
    active: false,
    type: '',
    userId: '',
    sessionIndex: -1,
    postTitle: '',
    postContent: '',
    mailReceiverId: '',
    mailReceiverName: '',
    mailSubject: '',
    mailContent: ''
  });
  const userPrivateContextCache = reactive({
    userId: '',
    fetchedAt: 0,
    snapshot: null
  });

  const resetUserPrivateContextCache = () => {
    userPrivateContextCache.userId = '';
    userPrivateContextCache.fetchedAt = 0;
    userPrivateContextCache.snapshot = null;
  };

  const resetSharedMemorySearchCache = () => {
    sharedMemorySearchCache.clear();
  };

  const resetPendingTreeholeCreation = () => {
    pendingTreeholeCreation.awaitingConfirmation = false;
    pendingTreeholeCreation.userId = '';
    pendingTreeholeCreation.sessionIndex = -1;
  };
  const resetPendingCloudReferenceConsent = () => {
    pendingCloudReferenceConsent.awaitingConfirmation = false;
    pendingCloudReferenceConsent.userId = '';
    pendingCloudReferenceConsent.sessionIndex = -1;
  };
  const resetPendingSharedMemoryCapture = () => {
    pendingSharedMemoryCapture.awaitingConfirmation = false;
    pendingSharedMemoryCapture.userId = '';
    pendingSharedMemoryCapture.sessionIndex = -1;
    pendingSharedMemoryCapture.content = '';
    pendingSharedMemoryCapture.destination = 'ask';
  };
  const resetPendingQuickNote = () => {
    pendingQuickNote.visible = false;
    pendingQuickNote.busy = false;
    pendingQuickNote.userId = '';
    pendingQuickNote.sessionIndex = -1;
    pendingQuickNote.messageIndex = -1;
    pendingQuickNote.title = '';
    pendingQuickNote.content = '';
    pendingQuickNote.error = '';
  };
  const resetPendingActionDraft = () => {
    pendingActionDraft.active = false;
    pendingActionDraft.type = '';
    pendingActionDraft.userId = '';
    pendingActionDraft.sessionIndex = -1;
    pendingActionDraft.postTitle = '';
    pendingActionDraft.postContent = '';
    pendingActionDraft.mailReceiverId = '';
    pendingActionDraft.mailReceiverName = '';
    pendingActionDraft.mailSubject = '';
    pendingActionDraft.mailContent = '';
  };

  const isEmptyAssistantPlaceholder = (message) => {
    if (!message || message.role !== 'assistant') return false;
    if (String(message.content || '').trim()) return false;
    const meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
    return !meta || Object.keys(meta).length === 0;
  };

  const sanitizeChatSessionForStorage = (session = {}) => {
    const rawMessages = Array.isArray(session.messages) ? session.messages : [];
    const messages = rawMessages
      .filter((message) => !isEmptyAssistantPlaceholder(message))
      .map((message) => ({
        ...message,
        content: typeof message.content === 'string'
          ? message.content
          : String(message.content || '')
      }));

    return {
      title: String(session.title || '新对话'),
      messages,
      timestamp: Number.isFinite(Number(session.timestamp)) ? Number(session.timestamp) : Date.now(),
      isLoading: false,
      isThinking: false
    };
  };

  // Load sessions from local storage
  const loadSessions = () => {
    const savedSessions = localStorage.getItem('boh_chat_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 兼容旧数据：清掉生成中的瞬时状态和空白助手占位，避免刷新后白屏/发送被锁住。
          const migratedSessions = parsed.map(sanitizeChatSessionForStorage);
          chatSessions.splice(0, chatSessions.length, ...migratedSessions);
        }
      } catch (e) {
        logger.error('boh-ai', 'Failed to load chat sessions', e);
      }
    }
  };

  // Save sessions to local storage
  const saveSessions = () => {
    const sessionsToSave = chatSessions.slice(0, 20).map(sanitizeChatSessionForStorage);
    localStorage.setItem('boh_chat_sessions', JSON.stringify(sessionsToSave));
  };
  let saveDebounceTimer = null;
  let saveIdleTimer = null;
  let saveIdleCallbackId = null;

  const clearSaveTimers = () => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    if (saveIdleTimer) {
      clearTimeout(saveIdleTimer);
      saveIdleTimer = null;
    }
    if (typeof window !== 'undefined' && saveIdleCallbackId !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(saveIdleCallbackId);
      saveIdleCallbackId = null;
    }
  };

  const scheduleSaveSessions = () => {
    clearSaveTimers();
    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;

      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        saveIdleCallbackId = window.requestIdleCallback(() => {
          saveIdleCallbackId = null;
          saveSessions();
        }, { timeout: SESSION_SAVE_IDLE_TIMEOUT_MS });
        return;
      }

      saveIdleTimer = setTimeout(() => {
        saveIdleTimer = null;
        saveSessions();
      }, 0);
    }, SESSION_SAVE_DEBOUNCE_MS);
  };

  // Clear cache
  const clearCache = () => {
    clearSaveTimers();
    if (memoryCaptureStatusTimer) {
      clearTimeout(memoryCaptureStatusTimer);
      memoryCaptureStatusTimer = null;
    }
    memoryCaptureStatusMessage.value = '';
    localStorage.removeItem('boh_chat_sessions');
    chatSessions.splice(0, chatSessions.length, { title: '新对话', messages: [], timestamp: Date.now(), isLoading: false, isThinking: false });
    currentSessionIndex.value = 0;
    activeGenerationSessionIndex.value = null;
    localStorage.removeItem('hasSeenAiWelcome_2025_02');
    treeholeMemoryCache.userId = '';
    treeholeMemoryCache.fetchedAt = 0;
    treeholeMemoryCache.items = [];
    sharedMemoryCache.fetchedAt = 0;
    sharedMemoryCache.items = [];
    resetSharedMemorySearchCache();
    resetUserPrivateContextCache();
    resetPendingTreeholeCreation();
    resetPendingCloudReferenceConsent();
    resetPendingSharedMemoryCapture();
    resetPendingQuickNote();
    resetPendingActionDraft();
  };

  watch(chatSessions, scheduleSaveSessions, { deep: true });

  watch(() => userInfo.value?.id || '', (nextId, prevId) => {
    if (nextId === prevId) return;
    treeholeMemoryCache.userId = '';
    treeholeMemoryCache.fetchedAt = 0;
    treeholeMemoryCache.items = [];
    sharedMemoryCache.fetchedAt = 0;
    sharedMemoryCache.items = [];
    resetSharedMemorySearchCache();
    resetUserPrivateContextCache();
    resetPendingTreeholeCreation();
    resetPendingCloudReferenceConsent();
    resetPendingSharedMemoryCapture();
    resetPendingQuickNote();
    resetPendingActionDraft();
    if (!nextId && isQuickNoteEnabled.value) {
      isQuickNoteEnabled.value = false;
      persistQuickNoteSetting();
    }
  });

  loadSessions();

  const inputMessage = ref('');
  const thinkingTime = ref(0);
  const thinkingStatus = ref('');
  const thinkingTimer = ref(null);
  const abortController = ref(null);
  const textareaRef = ref(null);

  // 计算属性：当前会话的加载状态
  const isLoading = computed(() => chatSessions[currentSessionIndex.value]?.isLoading || false);
  const isThinking = computed(() => chatSessions[currentSessionIndex.value]?.isThinking || false);

  // 当前模式 - 默认 Auto，由路由器根据用户意图选择快速/思考/专业。
  const currentModeId = ref(BOH_AUTO_MODE_ID);
  const currentMode = computed(() => chatModes.find(m => m.id === currentModeId.value) || chatModes[0]);
  const currentModelId = computed(() => currentMode.value.model);
  const currentModel = computed(() => availableModels.find(m => m.id === currentModelId.value) || availableModels[0]);

  const getModelForModeId = (modeId) => {
    const mode = chatModes.find((item) => item.id === modeId) || chatModes.find((item) => item.id === 'fast') || chatModes[0];
    return availableModels.find((item) => item.id === mode?.model) || currentModel.value || availableModels[0];
  };

  const isCommandMode = ref(false);
  const isSearching = ref(false);
  const isMemoryCaptureEnabled = ref(
    typeof window === 'undefined' ? false : localStorage.getItem(MEMORY_CAPTURE_SETTING_KEY) === '1'
  );
  const isTreeholeMemoryEnabled = ref(
    typeof window === 'undefined'
      ? false
      : (
          localStorage.getItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
          || localStorage.getItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
        )
  );
  const isQuickNoteEnabled = ref(
    typeof window === 'undefined' ? false : localStorage.getItem(QUICK_NOTE_SETTING_KEY) === '1'
  );
  const cloudReferenceConsent = ref(
    typeof window === 'undefined'
      ? 'unknown'
      : (
          localStorage.getItem(CLOUD_REFERENCE_CONSENT_KEY)
          || (
            localStorage.getItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
            || localStorage.getItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY) === '1'
              ? 'granted'
              : 'unknown'
          )
        )
  );
  const isTreeholeMemoryToggling = ref(false);
  const memoryCaptureStatusMessage = ref('');
  let memoryCaptureStatusTimer = null;

  const setMemoryCaptureStatusMessage = (text) => {
    memoryCaptureStatusMessage.value = String(text || '').trim();
    if (memoryCaptureStatusTimer) {
      clearTimeout(memoryCaptureStatusTimer);
      memoryCaptureStatusTimer = null;
    }
    if (memoryCaptureStatusMessage.value) {
      memoryCaptureStatusTimer = setTimeout(() => {
        memoryCaptureStatusMessage.value = '';
        memoryCaptureStatusTimer = null;
      }, MEMORY_CAPTURE_STATUS_TIMEOUT_MS);
    }
  };

  const appendSessionMessage = (sessionIndex, role, content, meta = null) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;
    const safeContent = String(content || '').trim();
    if (!safeContent) return false;
    const payload = { role, content: safeContent };
    if (meta && typeof meta === 'object') payload.meta = meta;
    targetSession.messages.push(payload);
    nextTick(() => scrollToBottom());
    return true;
  };

  const normalizeActionNotes = (notes = []) => {
    const source = Array.isArray(notes) ? notes : [notes];
    return [...new Set(
      source
        .map((item) => normalizePromptLine(item, 120))
        .filter(Boolean)
    )].slice(0, 4);
  };

  const updateAssistantActionNotes = (sessionIndex, messageIndex, notes = []) => {
    const targetSession = getSessionByIndex(sessionIndex);
    const targetMessage = targetSession?.messages?.[messageIndex];
    if (!targetMessage || targetMessage.role !== 'assistant') return;
    const currentNotes = Array.isArray(targetMessage.meta?.actionNotes)
      ? targetMessage.meta.actionNotes
      : [];
    const nextNotes = normalizeActionNotes([...currentNotes, ...normalizeActionNotes(notes)]);
    if (nextNotes.length === 0) return;
    targetMessage.meta = {
      ...(targetMessage.meta && typeof targetMessage.meta === 'object' ? targetMessage.meta : {}),
      actionNotes: nextNotes
    };
  };

  const appendUserMessageWithTitle = (sessionIndex, text) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;
    const safeText = String(text || '').trim();
    if (!safeText) return false;
    const shouldInitTitle = targetSession.messages.length === 0;
    const appended = appendSessionMessage(sessionIndex, 'user', safeText);
    if (appended && shouldInitTitle) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }
    return appended;
  };

  const resetComposerInput = () => {
    inputMessage.value = '';
    if (textareaRef.value) textareaRef.value.style.height = 'auto';
  };

  const getLocalDateKey = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const extractQuickNoteContent = (text) => {
    const safeText = String(text || '').trim();
    if (!safeText) return '';
    if (safeText.length <= QUICK_NOTE_CONTENT_MAX_CHARS) return safeText;
    return `${safeText.slice(0, QUICK_NOTE_CONTENT_MAX_CHARS - 3)}...`;
  };

  const buildQuickNoteTitle = (content) => {
    const firstLine = String(content || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || '';
    const normalized = normalizePromptLine(firstLine.replace(/^#+\s*/, ''), QUICK_NOTE_TITLE_MAX_CHARS);
    return normalized || 'BOH AI 随手记';
  };

  const generateQuickNoteTitle = async (content, requestSignal = undefined, modelId = '') => {
    const fallbackTitle = buildQuickNoteTitle(content);
    const noteContent = extractQuickNoteContent(content);
    if (!noteContent) return fallbackTitle;

    try {
      const titleModelId = modelId || currentModel.value?.id || availableModels[0]?.id;
      if (!titleModelId) return fallbackTitle;
      const rawTitle = await callModelInternal(
        titleModelId,
        [
          '请为下面这段用户原文生成一个适合 Cloud+ 随手记的短标题。',
          '要求：只输出标题本身，不要引号，不要解释，中文优先，最多 18 个汉字或 36 个英文字符。',
          '',
          `用户原文：${noteContent}`
        ].join('\n'),
        '你是 BOH AI 的随手记标题生成器，只输出简短标题。',
        [],
        requestSignal,
        0,
        { max_tokens: 80, temperature: 0.2, top_p: 0.8, frequency_penalty: 0.1 }
      );
      const cleanTitle = normalizePromptLine(
        String(rawTitle || '')
          .replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, '')
          .replace(/^(标题|Title)\s*[:：]\s*/i, ''),
        QUICK_NOTE_TITLE_MAX_CHARS
      );
      return cleanTitle || fallbackTitle;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        logger.warn('boh-ai', '随手记标题生成失败，使用原文首句兜底', error);
      }
      return fallbackTitle;
    }
  };

  const queueQuickNoteConfirmation = async ({
    rawText,
    sessionIndex,
    requestSignal = undefined,
    modelId = ''
  } = {}) => {
    if (!isQuickNoteEnabled.value) return false;
    const userId = String(userInfo.value?.id || '').trim();
    if (!isLoggedIn.value || !userId) return false;

    const content = extractQuickNoteContent(rawText);
    if (!content) return false;

    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;

    const title = buildQuickNoteTitle(content);

    pendingQuickNote.visible = true;
    pendingQuickNote.busy = false;
    pendingQuickNote.userId = userId;
    pendingQuickNote.sessionIndex = sessionIndex;
    pendingQuickNote.messageIndex = targetSession.messages.length;
    pendingQuickNote.title = title;
    pendingQuickNote.content = content;
    pendingQuickNote.error = '';
    appendSessionMessage(
      sessionIndex,
      'assistant',
      `要把这条内容记录到 Cloud+ 吗？\n\n${title}\n${content}`,
      { kind: 'quick_note_confirm' }
    );

    generateQuickNoteTitle(content, requestSignal, modelId)
      .then((generatedTitle) => {
        const nextTitle = normalizePromptLine(generatedTitle, QUICK_NOTE_TITLE_MAX_CHARS);
        if (!nextTitle || nextTitle === title) return;
        if (!pendingQuickNote.visible || pendingQuickNote.busy) return;
        if (pendingQuickNote.userId !== userId || pendingQuickNote.sessionIndex !== sessionIndex) return;
        pendingQuickNote.title = nextTitle;
        const sessionToUpdate = getSessionByIndex(sessionIndex);
        const confirmMessage = sessionToUpdate?.messages?.[pendingQuickNote.messageIndex];
        if (confirmMessage?.meta?.kind === 'quick_note_confirm') {
          confirmMessage.content = `要把这条内容记录到 Cloud+ 吗？\n\n${nextTitle}\n${content}`;
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          logger.warn('boh-ai', '随手记标题后台更新失败，保留兜底标题', error);
        }
      });

    return true;
  };

  const resolveMailRecipientProfile = async (name) => {
    const safeName = normalizePromptLine(String(name || '').replace(/^@/, ''), 40);
    if (!safeName) {
      return { ok: false, code: 'EMPTY_NAME', message: '请提供收件人用户名。', candidates: [] };
    }

    const exactResult = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', safeName)
      .maybeSingle();

    if (exactResult.error && exactResult.error.code !== 'PGRST116') {
      return { ok: false, code: 'QUERY_FAILED', message: exactResult.error.message || '查询收件人失败。', candidates: [] };
    }

    if (exactResult.data?.id) {
      return {
        ok: true,
        data: {
          id: String(exactResult.data.id),
          username: normalizePromptLine(exactResult.data.username, 40)
        },
        candidates: []
      };
    }

    const fuzzyResult = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${safeName}%`)
      .order('username')
      .limit(5);

    if (fuzzyResult.error) {
      return { ok: false, code: 'QUERY_FAILED', message: fuzzyResult.error.message || '查询收件人失败。', candidates: [] };
    }

    const candidates = (Array.isArray(fuzzyResult.data) ? fuzzyResult.data : [])
      .map((item) => ({
        id: String(item?.id || ''),
        username: normalizePromptLine(item?.username, 40)
      }))
      .filter((item) => item.id && item.username);

    if (candidates.length === 1) {
      return { ok: true, data: candidates[0], candidates };
    }

    if (candidates.length > 1) {
      return {
        ok: false,
        code: 'AMBIGUOUS',
        message: `找到多个匹配用户 ${candidates.map((item) => item.username).join('、')}。请直接回复准确用户名指定。`,
        candidates
      };
    }

    return { ok: false, code: 'NOT_FOUND', message: `没有找到用户名“${safeName}”。请检查后重试。`, candidates: [] };
  };

  const formatPostDraftPreview = () => {
    return [
      '我已为你起草发帖内容。',
      pendingActionDraft.postTitle || '（未填写标题）',
      pendingActionDraft.postContent || '（未填写正文）',
      '',
      '你可以继续发来新的标题或正文。',
      '确认后回复“确认发布”，放弃回复“取消”。'
    ].join('\n');
  };

  const formatMailDraftPreview = () => {
    return [
      '我已为你起草私信内容。',
      `发给 ${pendingActionDraft.mailReceiverName || '（未指定）'}`,
      pendingActionDraft.mailSubject || '（无主题）',
      pendingActionDraft.mailContent || '（未填写正文）',
      '',
      '你可以继续发来新的收件人、主题或正文。',
      '确认后回复“确认发送”，放弃回复“取消”。'
    ].join('\n');
  };

  const updatePostDraftByUserInput = (text) => {
    const safeText = String(text || '').trim();
    if (!safeText) return false;
    let changed = false;

    const nextTitle = normalizePromptLine(
      extractFieldUntilNextLabel(safeText, ['标题', 'title'], ['内容', '正文', 'body'], ACTION_DRAFT_TITLE_MAX_CHARS)
      || extractSingleLineField(safeText, ['标题', 'title']),
      ACTION_DRAFT_TITLE_MAX_CHARS
    );
    if (nextTitle) {
      pendingActionDraft.postTitle = nextTitle;
      changed = true;
    }

    const nextContent = normalizePromptLine(
      extractFieldUntilNextLabel(safeText, ['内容', '正文', 'body'], [], ACTION_DRAFT_CONTENT_MAX_CHARS)
      || extractMultilineField(safeText, ['内容', '正文', 'body'], ACTION_DRAFT_CONTENT_MAX_CHARS),
      ACTION_DRAFT_CONTENT_MAX_CHARS
    );
    if (nextContent) {
      pendingActionDraft.postContent = nextContent;
      changed = true;
    }

    if (!changed) {
      pendingActionDraft.postContent = normalizePromptLine(safeText, ACTION_DRAFT_CONTENT_MAX_CHARS);
      changed = true;
    }

    return changed;
  };

  const updateMailDraftByUserInput = async (text) => {
    const safeText = String(text || '').trim();
    if (!safeText) return { changed: false, feedback: '' };
    let changed = false;
    let feedback = '';

    const receiverNameInput = extractRecipientName(safeText);
    if (receiverNameInput) {
      const resolved = await resolveMailRecipientProfile(receiverNameInput);
      if (resolved.ok) {
        const receiverId = String(resolved.data?.id || '');
        if (receiverId && receiverId !== String(userInfo.value?.id || '')) {
          pendingActionDraft.mailReceiverId = receiverId;
          pendingActionDraft.mailReceiverName = normalizePromptLine(resolved.data?.username, 40);
          changed = true;
        } else {
          feedback = '不能给自己发送私信，请指定其他收件人。';
        }
      } else {
        feedback = resolved.message || '收件人不存在，请检查用户名。';
      }
    }

    const nextSubject = normalizePromptLine(
      extractSingleLineField(safeText, ['主题', '标题', 'subject']),
      ACTION_DRAFT_SUBJECT_MAX_CHARS
    );
    if (nextSubject) {
      pendingActionDraft.mailSubject = nextSubject;
      changed = true;
    }

    const nextContent = normalizePromptLine(
      extractMultilineField(safeText, ['内容', '正文', 'body'], ACTION_DRAFT_CONTENT_MAX_CHARS),
      ACTION_DRAFT_CONTENT_MAX_CHARS
    );
    if (nextContent) {
      pendingActionDraft.mailContent = nextContent;
      changed = true;
    }

    if (!changed && !feedback) {
      pendingActionDraft.mailContent = normalizePromptLine(safeText, ACTION_DRAFT_CONTENT_MAX_CHARS);
      changed = true;
    }

    return { changed, feedback };
  };

  const getActionAuthContext = () => ({
    isLoggedIn: Boolean(isLoggedIn.value),
    userId: String(userInfo.value?.id || '').trim(),
    username: normalizePromptLine(userInfo.value?.username, 40)
  });

  const createActionRegistry = () => ({
    [BOHAI_ACTION_IDS.createPost]: createBohAIAction({
      id: BOHAI_ACTION_IDS.createPost,
      label: '发布论坛帖子',
      source: '论坛',
      validate: ({ title = '', content = '' } = {}, { auth } = {}) => {
        if (!normalizePromptLine(auth?.username, 40)) {
          return { ok: false, error: { message: '请先登录后再发布帖子。' } };
        }
        if (!normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS)) {
          return { ok: false, error: { message: '草稿还不完整，请先补充标题和正文再确认发布。' } };
        }
        const safeContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS);
        if (!safeContent || safeContent === '（请在这里填写帖子正文）') {
          return { ok: false, error: { message: '草稿还不完整，请先补充标题和正文再确认发布。' } };
        }
        return { ok: true };
      },
      execute: async ({ title = '', content = '' } = {}, { auth } = {}) => {
        const result = await createPost(
          normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS),
          auth.userId,
          auth.username,
          'approved',
          normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS)
        );
        if (!result.ok || result.error) {
          return { ok: false, error: result.error || { message: '请稍后重试。' } };
        }
        const createdRow = Array.isArray(result.data) ? result.data[0] : null;
        const createdPostId = String(createdRow?.id || '');
        return {
          ok: true,
          message: createdPostId
            ? `帖子已发布成功（ID: ${createdPostId}），系统将异步完成内容审查。`
            : '帖子已发布成功，系统将异步完成内容审查。',
          data: { id: createdPostId }
        };
      }
    }),
    [BOHAI_ACTION_IDS.sendMail]: createBohAIAction({
      id: BOHAI_ACTION_IDS.sendMail,
      label: '发送私信',
      source: '私信',
      validate: ({ receiverId = '', receiverName = '', content = '' } = {}, { auth } = {}) => {
        if (!normalizePromptLine(auth?.username, 40)) {
          return { ok: false, error: { message: '请先登录后再发送私信。' } };
        }
        if (!String(receiverId || '').trim() || !normalizePromptLine(receiverName, 40)) {
          return { ok: false, error: { message: '请先指定有效收件人，再确认发送。' } };
        }
        const safeContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS);
        if (!safeContent || safeContent === '（请在这里填写信件正文）') {
          return { ok: false, error: { message: '邮件正文还是空的，请补充后再确认发送。' } };
        }
        if (String(receiverId || '').trim() === String(auth?.userId || '').trim()) {
          return { ok: false, error: { message: '不能给自己发送私信，请重新指定收件人。' } };
        }
        return { ok: true };
      },
      execute: async ({ receiverId = '', receiverName = '', subject = '', content = '' } = {}, { auth } = {}) => {
        const sendResult = await sendModeratedMessages({
          senderId: auth.userId,
          senderName: auth.username,
          recipients: [{ id: String(receiverId || '').trim(), username: normalizePromptLine(receiverName, 40) }],
          subject: normalizePromptLine(subject, ACTION_DRAFT_SUBJECT_MAX_CHARS),
          content: normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS),
          scene: 'mail',
          failClosed: true,
          pushplus: true
        });

        if (sendResult.blocked) {
          return { ok: false, error: { message: `信件内容审查未通过：${sendResult.moderation?.message || '请修改后重试。'}` } };
        }
        if (!sendResult.ok) {
          return { ok: false, error: sendResult.error || { message: '请稍后重试。' } };
        }
        return {
          ok: true,
          message: `私信已成功发送给 ${normalizePromptLine(receiverName, 40)}。`,
          data: sendResult
        };
      }
    }),
    [BOHAI_ACTION_IDS.saveCloud]: createBohAIAction({
      id: BOHAI_ACTION_IDS.saveCloud,
      label: '保存到 BOH Cloud+',
      source: 'BOH Cloud+',
      validate: ({ content = '' } = {}) => {
        if (!normalizePromptLine(content, 320)) {
          return { ok: false, error: { message: '保存内容不能为空。' } };
        }
        return { ok: true };
      },
      execute: async ({ content = '', title = '' } = {}, { auth } = {}) => {
        const safeContent = normalizePromptLine(content, 320);
        const cloudResult = await createMyCloudEntry(auth.userId, {
          entryDate: getLocalDateKey(),
          title: normalizePromptLine(title, QUICK_NOTE_TITLE_MAX_CHARS) || buildQuickNoteTitle(safeContent),
          contentText: safeContent,
          contentBlocks: [{ type: 'text', text: safeContent }],
          mood: '',
          source: 'ai'
        });
        if (!cloudResult.ok) {
          return { ok: false, error: cloudResult.error || { message: '保存失败' } };
        }
        treeholeMemoryCache.userId = '';
        treeholeMemoryCache.fetchedAt = 0;
        treeholeMemoryCache.items = [];
        return { ok: true, message: '已记录到 BOH Cloud+。', data: cloudResult.data };
      }
    }),
    [BOHAI_ACTION_IDS.quickNote]: createBohAIAction({
      id: BOHAI_ACTION_IDS.quickNote,
      label: '保存随手记到 BOH Cloud+',
      source: 'BOH Cloud+',
      validate: ({ content = '' } = {}) => {
        if (!extractQuickNoteContent(content)) {
          return { ok: false, error: { message: '摘录内容不能为空。' } };
        }
        return { ok: true };
      },
      execute: async ({ content = '', title = '' } = {}, { auth } = {}) => {
        const safeContent = extractQuickNoteContent(content);
        const cloudResult = await createMyCloudEntry(auth.userId, {
          entryDate: getLocalDateKey(),
          title: normalizePromptLine(title, QUICK_NOTE_TITLE_MAX_CHARS) || buildQuickNoteTitle(safeContent),
          contentText: safeContent,
          contentBlocks: [{ type: 'text', text: safeContent }],
          mood: '',
          source: 'ai'
        });
        if (!cloudResult.ok) {
          return { ok: false, error: cloudResult.error || { message: '记录失败，请稍后重试。' } };
        }
        treeholeMemoryCache.userId = '';
        treeholeMemoryCache.fetchedAt = 0;
        treeholeMemoryCache.items = [];
        return { ok: true, message: '已记录到 BOH Cloud+。', data: cloudResult.data };
      }
    }),
    [BOHAI_ACTION_IDS.saveSharedMemory]: createBohAIAction({
      id: BOHAI_ACTION_IDS.saveSharedMemory,
      label: '写入 BOH AI 公共记忆库',
      source: 'BOH AI 公共记忆库',
      validate: ({ content = '' } = {}) => {
        if (!normalizePromptLine(content, 320)) {
          return { ok: false, error: { message: '公共记忆内容不能为空。' } };
        }
        return { ok: true };
      },
      execute: async ({ content = '' } = {}, { auth } = {}) => {
        const safeContent = normalizePromptLine(content, 320);
        const existingShared = await getSharedMemoriesCached();
        if (isLikelyMemoryDuplicate(safeContent, existingShared)) {
          return { ok: false, error: { message: '公共记忆库已有相近内容，已跳过重复写入。' }, metadata: { duplicate: true } };
        }
        const saveResult = await createSharedAIMemory(auth.userId, {
          content: safeContent,
          mood: '',
          tags: ['Auto确认', '社群记忆'],
          confidence: 0.9,
          evidence: [{ messageId: 'auto_confirmed', quote: truncateText(safeContent, 240) }],
          source: 'auto_confirmed',
          status: 'active'
        });
        if (!saveResult.ok) {
          return { ok: false, error: saveResult.error || { message: '写入失败' } };
        }
        sharedMemoryCache.fetchedAt = 0;
        sharedMemoryCache.items = [];
        resetSharedMemorySearchCache();
        return { ok: true, message: '已写入 BOH AI 公共记忆库。', data: saveResult.data };
      }
    })
  });

  const runRegisteredAction = async (actionId, payload = {}) => {
    const registry = createActionRegistry();
    return runBohAIAction({
      action: registry[actionId],
      payload,
      auth: getActionAuthContext(),
      logger
    });
  };

  const submitPostDraft = async (sessionIndex) => {
    const title = normalizePromptLine(pendingActionDraft.postTitle, ACTION_DRAFT_TITLE_MAX_CHARS);
    const content = normalizePromptLine(pendingActionDraft.postContent, ACTION_DRAFT_CONTENT_MAX_CHARS);
    const result = await runRegisteredAction(BOHAI_ACTION_IDS.createPost, { title, content });
    if (!result.ok) {
      appendSessionMessage(sessionIndex, 'assistant', result.errorMessage || '发布失败：请稍后重试。');
      if (result.metadata?.reason === 'login_required') {
        resetPendingActionDraft();
        return;
      }
      appendSessionMessage(sessionIndex, 'assistant', formatPostDraftPreview(), { kind: 'action_draft_preview' });
      return;
    }

    resetPendingActionDraft();
    appendSessionMessage(
      sessionIndex,
      'assistant',
      result.message || '帖子已发布成功，系统将异步完成内容审查。',
      { kind: 'action_committed' }
    );

  };

  const submitMailDraft = async (sessionIndex) => {
    const receiverId = String(pendingActionDraft.mailReceiverId || '').trim();
    const receiverName = normalizePromptLine(pendingActionDraft.mailReceiverName, 40);
    const subject = normalizePromptLine(pendingActionDraft.mailSubject, ACTION_DRAFT_SUBJECT_MAX_CHARS);
    const content = normalizePromptLine(pendingActionDraft.mailContent, ACTION_DRAFT_CONTENT_MAX_CHARS);

    const result = await runRegisteredAction(BOHAI_ACTION_IDS.sendMail, {
      receiverId,
      receiverName,
      subject,
      content
    });
    if (!result.ok) {
      appendSessionMessage(sessionIndex, 'assistant', result.errorMessage || '发送失败：请稍后重试。');
      if (result.metadata?.reason === 'login_required') {
        resetPendingActionDraft();
        return;
      }
      appendSessionMessage(sessionIndex, 'assistant', formatMailDraftPreview(), { kind: 'action_draft_preview' });
      return;
    }

    resetPendingActionDraft();
    appendSessionMessage(sessionIndex, 'assistant', result.message || `私信已成功发送给 ${receiverName}。`, { kind: 'action_committed' });
  };

  const handlePendingActionDraftReply = async (rawText) => {
    if (!pendingActionDraft.active) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const currentSession = currentSessionIndex.value;
    if (pendingActionDraft.sessionIndex !== currentSession) {
      resetPendingActionDraft();
      return false;
    }

    const targetSession = getSessionByIndex(currentSession);
    if (!targetSession) {
      resetPendingActionDraft();
      return false;
    }

    appendUserMessageWithTitle(currentSession, safeText);
    resetComposerInput();

    if (isActionDraftCancelIntent(safeText)) {
      const draftTypeLabel = pendingActionDraft.type === 'mail' ? '私信' : '发帖';
      resetPendingActionDraft();
      appendSessionMessage(currentSession, 'assistant', `好的，已取消本次${draftTypeLabel}草稿。`);
      return true;
    }

    if (pendingActionDraft.type === 'post') {
      if (isPostDraftConfirmIntent(safeText)) {
        await submitPostDraft(currentSession);
        return true;
      }

      const changed = updatePostDraftByUserInput(safeText);
      if (changed) {
        appendSessionMessage(currentSession, 'assistant', formatPostDraftPreview(), { kind: 'action_draft_preview' });
      } else {
        appendSessionMessage(currentSession, 'assistant', '我没识别到可更新字段。你可以直接发来新的标题或正文。');
      }
      return true;
    }

    if (pendingActionDraft.type === 'mail') {
      if (isMailDraftConfirmIntent(safeText)) {
        await submitMailDraft(currentSession);
        return true;
      }

      const updateResult = await updateMailDraftByUserInput(safeText);
      if (updateResult.feedback) {
        appendSessionMessage(currentSession, 'assistant', updateResult.feedback);
      }
      if (updateResult.changed) {
        appendSessionMessage(currentSession, 'assistant', formatMailDraftPreview(), { kind: 'action_draft_preview' });
      } else if (!updateResult.feedback) {
        appendSessionMessage(currentSession, 'assistant', '我没识别到可更新字段。你可以直接发来新的收件人、主题或正文。');
      }
      return true;
    }

    resetPendingActionDraft();
    return false;
  };

  const tryStartActionDraftFromUserInput = async (rawText, sessionIndex) => {
    const safeText = String(rawText || '').trim();
    if (!safeText) return false;
    if (pendingActionDraft.active) return false;

    const wantsPostDraft = isPostDraftRequest(safeText);
    const wantsMailDraft = isMailDraftRequest(safeText);
    if (!wantsPostDraft && !wantsMailDraft) return false;

    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;

    appendUserMessageWithTitle(sessionIndex, safeText);
    resetComposerInput();

    if (!isLoggedIn.value || !userInfo.value?.id) {
      appendSessionMessage(sessionIndex, 'assistant', '请先登录，登录后我就可以帮你起草并执行发帖/发私信。');
      return true;
    }

    if (wantsPostDraft && wantsMailDraft) {
      appendSessionMessage(sessionIndex, 'assistant', '我识别到你可能同时想发帖和发私信。请先回复“发帖”或“发私信”，我会逐个帮你起草。');
      return true;
    }

    const userId = String(userInfo.value?.id || '').trim();
    pendingActionDraft.active = true;
    pendingActionDraft.userId = userId;
    pendingActionDraft.sessionIndex = sessionIndex;

    if (wantsPostDraft) {
      const draft = buildPostDraftFromText(safeText);
      pendingActionDraft.type = 'post';
      pendingActionDraft.postTitle = draft.title;
      pendingActionDraft.postContent = draft.content;
      appendSessionMessage(sessionIndex, 'assistant', formatPostDraftPreview(), { kind: 'action_draft_preview' });
      return true;
    }

    const draft = buildMailDraftFromText(safeText);
    pendingActionDraft.type = 'mail';
    pendingActionDraft.mailSubject = draft.subject;
    pendingActionDraft.mailContent = draft.content;

    if (draft.recipientName) {
      const resolved = await resolveMailRecipientProfile(draft.recipientName);
      if (resolved.ok) {
        const receiverId = String(resolved.data?.id || '');
        if (receiverId && receiverId !== userId) {
          pendingActionDraft.mailReceiverId = receiverId;
          pendingActionDraft.mailReceiverName = normalizePromptLine(resolved.data?.username, 40);
        } else {
          appendSessionMessage(sessionIndex, 'assistant', '不能给自己发送私信，请重新指定收件人。');
        }
      } else {
        appendSessionMessage(sessionIndex, 'assistant', resolved.message || '收件人不存在，请重新指定。');
      }
    }

    appendSessionMessage(sessionIndex, 'assistant', formatMailDraftPreview(), { kind: 'action_draft_preview' });
    return true;
  };

  const activeActionDraft = computed(() => {
    if (!pendingActionDraft.active) return null;
    if (pendingActionDraft.sessionIndex !== currentSessionIndex.value) return null;
    return {
      active: true,
      type: pendingActionDraft.type,
      sessionIndex: pendingActionDraft.sessionIndex,
      postTitle: pendingActionDraft.postTitle,
      postContent: pendingActionDraft.postContent,
      mailReceiverId: pendingActionDraft.mailReceiverId,
      mailReceiverName: pendingActionDraft.mailReceiverName,
      mailSubject: pendingActionDraft.mailSubject,
      mailContent: pendingActionDraft.mailContent
    };
  });

  const updatePendingPostDraftFromUI = ({ title, content } = {}) => {
    if (!pendingActionDraft.active || pendingActionDraft.type !== 'post') return false;
    if (pendingActionDraft.sessionIndex !== currentSessionIndex.value) return false;
    if (typeof title === 'string') {
      pendingActionDraft.postTitle = normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS);
    }
    if (typeof content === 'string') {
      pendingActionDraft.postContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS);
    }
    return true;
  };

  const updatePendingMailDraftFromUI = async ({ receiverName, subject, content } = {}) => {
    if (!pendingActionDraft.active || pendingActionDraft.type !== 'mail') {
      return { ok: false, changed: false, feedback: '' };
    }
    if (pendingActionDraft.sessionIndex !== currentSessionIndex.value) {
      return { ok: false, changed: false, feedback: '' };
    }

    let changed = false;
    let feedback = '';

    if (typeof receiverName === 'string') {
      const normalizedReceiver = normalizePromptLine(receiverName.replace(/^@/, ''), 40);
      if (!normalizedReceiver) {
        pendingActionDraft.mailReceiverId = '';
        pendingActionDraft.mailReceiverName = '';
        changed = true;
      } else {
        const resolved = await resolveMailRecipientProfile(normalizedReceiver);
        if (resolved.ok) {
          const receiverId = String(resolved.data?.id || '');
          if (receiverId && receiverId !== String(userInfo.value?.id || '')) {
            pendingActionDraft.mailReceiverId = receiverId;
            pendingActionDraft.mailReceiverName = normalizePromptLine(resolved.data?.username, 40);
            changed = true;
          } else {
            feedback = '不能给自己发送私信，请指定其他收件人。';
          }
        } else {
          feedback = resolved.message || '收件人不存在，请检查用户名。';
        }
      }
    }

    if (typeof subject === 'string') {
      pendingActionDraft.mailSubject = normalizePromptLine(subject, ACTION_DRAFT_SUBJECT_MAX_CHARS);
      changed = true;
    }

    if (typeof content === 'string') {
      pendingActionDraft.mailContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS);
      changed = true;
    }

    return { ok: true, changed, feedback };
  };

  const cancelPendingActionDraftFromUI = () => {
    if (!pendingActionDraft.active) return false;
    const sessionIndex = currentSessionIndex.value;
    if (pendingActionDraft.sessionIndex !== sessionIndex) return false;
    const draftTypeLabel = pendingActionDraft.type === 'mail' ? '私信' : '发帖';
    resetPendingActionDraft();
    appendSessionMessage(sessionIndex, 'assistant', `好的，已取消本次${draftTypeLabel}草稿。`);
    return true;
  };

  const confirmPendingActionDraftFromUI = async () => {
    if (!pendingActionDraft.active) return false;
    const sessionIndex = currentSessionIndex.value;
    if (pendingActionDraft.sessionIndex !== sessionIndex) return false;
    if (pendingActionDraft.type === 'post') {
      await submitPostDraft(sessionIndex);
      return true;
    }
    if (pendingActionDraft.type === 'mail') {
      await submitMailDraft(sessionIndex);
      return true;
    }
    return false;
  };

  const isTreeholeCreateConfirm = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    const allowList = new Set([
      '是', '是的', '好', '好的', '可以', '行', '确认', '同意', '需要',
      '创建', '创建树洞', '帮我创建', '帮我创建树洞', 'ok', 'yes', 'y'
    ]);
    return allowList.has(normalized);
  };

  const isTreeholeCreateReject = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    const denyList = new Set([
      '否', '不用', '不需要', '取消', '算了', '暂不', '不要', 'no', 'n'
    ]);
    return denyList.has(normalized);
  };

  const _requestTreeholeCreationConfirmation = () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      setMemoryCaptureStatusMessage('请先登录，再开启树洞记忆同步。');
      return;
    }

    const sessionIndex = currentSessionIndex.value;
    if (
      pendingTreeholeCreation.awaitingConfirmation
      && pendingTreeholeCreation.userId === userId
      && pendingTreeholeCreation.sessionIndex === sessionIndex
    ) {
      setMemoryCaptureStatusMessage('请在对话中回复“是”或“否”，确认是否由我代你创建树洞。');
      return;
    }

    pendingTreeholeCreation.awaitingConfirmation = true;
    pendingTreeholeCreation.userId = userId;
    pendingTreeholeCreation.sessionIndex = sessionIndex;
    appendSessionMessage(
      sessionIndex,
      'assistant',
      '你还没有创建树洞。要我现在帮你创建并开启树洞记忆吗？\n请回复“是”确认，回复“否”取消。',
      { kind: 'treehole_create_confirm' }
    );
    setMemoryCaptureStatusMessage('请在对话中回复“是”确认创建树洞，回复“否”取消。');
  };

  const handlePendingTreeholeCreationReply = async (rawText) => {
    if (!pendingTreeholeCreation.awaitingConfirmation) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const sessionIndex = Number.isInteger(pendingTreeholeCreation.sessionIndex)
      ? pendingTreeholeCreation.sessionIndex
      : currentSessionIndex.value;
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) {
      resetPendingTreeholeCreation();
      return false;
    }

    appendSessionMessage(sessionIndex, 'user', safeText);
    if (targetSession.messages.length === 1) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }

    inputMessage.value = '';
    if (textareaRef.value) textareaRef.value.style.height = 'auto';

    if (isTreeholeCreateReject(safeText)) {
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('已取消创建树洞。');
      appendSessionMessage(sessionIndex, 'assistant', '好的，已取消。本次不会开启树洞记忆。');
      return true;
    }

    if (!isTreeholeCreateConfirm(safeText)) {
      appendSessionMessage(sessionIndex, 'assistant', '请回复“是”来创建树洞，或回复“否”取消。');
      setMemoryCaptureStatusMessage('等待你的确认：回复“是”创建树洞，回复“否”取消。');
      return true;
    }

    const pendingUserId = String(pendingTreeholeCreation.userId || '').trim();
    if (!pendingUserId || !isLoggedIn.value || String(userInfo.value?.id || '').trim() !== pendingUserId) {
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('登录状态已变化，请重新开启树洞记忆。');
      appendSessionMessage(sessionIndex, 'assistant', '登录状态发生变化，请重新点击“树洞记忆”后再试。');
      return true;
    }

    setMemoryCaptureStatusMessage('正在为你创建树洞...');
    const createResult = await createMyTreeholeSpace(pendingUserId);
    if (!createResult.ok) {
      resetPendingTreeholeCreation();
      const message = createResult.error?.message || '创建树洞失败，请稍后重试。';
      setMemoryCaptureStatusMessage(message);
      appendSessionMessage(sessionIndex, 'assistant', `创建树洞失败：${message}`);
      return true;
    }

    isTreeholeMemoryEnabled.value = true;
    persistTreeholeMemorySetting();
    resetPendingTreeholeCreation();
    setMemoryCaptureStatusMessage('已为你创建树洞，并开启树洞记忆（私密）。');
    appendSessionMessage(
      sessionIndex,
      'assistant',
      createResult.alreadyExists
        ? '已检测到你的树洞，已帮你开启树洞记忆（私密）。'
        : '已帮你创建树洞，并开启树洞记忆（私密）。'
    );
    return true;
  };

  const persistMemoryCaptureSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MEMORY_CAPTURE_SETTING_KEY, isMemoryCaptureEnabled.value ? '1' : '0');
  };
  const persistTreeholeMemorySetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY, isTreeholeMemoryEnabled.value ? '1' : '0');
    localStorage.removeItem(LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY);
  };
  const persistQuickNoteSetting = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(QUICK_NOTE_SETTING_KEY, isQuickNoteEnabled.value ? '1' : '0');
  };
  const persistCloudReferenceConsent = () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CLOUD_REFERENCE_CONSENT_KEY, String(cloudReferenceConsent.value || 'unknown'));
  };

  const toggleMemoryCapture = () => {
    isMemoryCaptureEnabled.value = !isMemoryCaptureEnabled.value;
    persistMemoryCaptureSetting();
    setMemoryCaptureStatusMessage(
      isMemoryCaptureEnabled.value
        ? '公共记忆已开启：将写入 BOH AI 公共记忆库。'
        : '公共记忆已关闭：本轮不会写入 BOH AI 公共记忆库。'
    );
  };

  const toggleQuickNoteMode = () => {
    if (!isLoggedIn.value || !userInfo.value?.id) {
      isQuickNoteEnabled.value = false;
      persistQuickNoteSetting();
      resetPendingQuickNote();
      setMemoryCaptureStatusMessage('请先登录，再开启随手记。');
      return;
    }

    isQuickNoteEnabled.value = !isQuickNoteEnabled.value;
    persistQuickNoteSetting();
    if (!isQuickNoteEnabled.value) {
      resetPendingQuickNote();
    }
    setMemoryCaptureStatusMessage(
      isQuickNoteEnabled.value
        ? '随手记已开启：AI 回答后可选择记录到 Cloud+。'
        : '随手记已关闭。'
    );
  };

  const updatePendingQuickNoteDraft = ({ title, content } = {}) => {
    if (!pendingQuickNote.visible || pendingQuickNote.busy) return false;
    if (typeof title === 'string') {
      pendingQuickNote.title = normalizePromptLine(title, QUICK_NOTE_TITLE_MAX_CHARS);
    }
    if (typeof content === 'string') {
      pendingQuickNote.content = extractQuickNoteContent(content);
    }
    pendingQuickNote.error = '';
    return true;
  };

  const dismissQuickNoteDraft = () => {
    if (pendingQuickNote.busy) return false;
    const sessionIndex = Number.isInteger(pendingQuickNote.sessionIndex)
      ? pendingQuickNote.sessionIndex
      : currentSessionIndex.value;
    resetPendingQuickNote();
    setMemoryCaptureStatusMessage('已跳过本条随手记。');
    appendSessionMessage(sessionIndex, 'assistant', '好的，本条随手记不记录到 Cloud+。');
    return true;
  };

  const confirmQuickNoteDraft = async () => {
    if (!pendingQuickNote.visible || pendingQuickNote.busy) return false;

    const userId = String(userInfo.value?.id || '').trim();
    if (!isLoggedIn.value || !userId || userId !== String(pendingQuickNote.userId || '').trim()) {
      pendingQuickNote.error = '登录状态已变化，请重新发送后再记录。';
      isQuickNoteEnabled.value = false;
      persistQuickNoteSetting();
      return false;
    }

    const content = extractQuickNoteContent(pendingQuickNote.content);
    const title = normalizePromptLine(pendingQuickNote.title, QUICK_NOTE_TITLE_MAX_CHARS) || buildQuickNoteTitle(content);
    if (!content) {
      pendingQuickNote.error = '摘录内容不能为空。';
      return false;
    }

    pendingQuickNote.busy = true;
    pendingQuickNote.error = '';
    const result = await runRegisteredAction(BOHAI_ACTION_IDS.quickNote, { title, content });

    if (!result.ok) {
      pendingQuickNote.busy = false;
      pendingQuickNote.error = result.errorMessage || '记录失败，请稍后重试。';
      return false;
    }

    const sessionIndex = Number.isInteger(pendingQuickNote.sessionIndex)
      ? pendingQuickNote.sessionIndex
      : currentSessionIndex.value;
    resetPendingQuickNote();
    setMemoryCaptureStatusMessage('已记录到 BOH Cloud+。');
    appendSessionMessage(sessionIndex, 'assistant', '已记录到 BOH Cloud+。');
    return true;
  };

  const requestCloudReferenceConsent = () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      setMemoryCaptureStatusMessage('请先登录，再开启 Cloud+ 参考。');
      return;
    }

    const sessionIndex = currentSessionIndex.value;
    if (
      pendingCloudReferenceConsent.awaitingConfirmation
      && pendingCloudReferenceConsent.userId === userId
      && pendingCloudReferenceConsent.sessionIndex === sessionIndex
    ) {
      setMemoryCaptureStatusMessage('请先选择是否同意 BOH AI 读取你的 Cloud+ 全部内容。');
      return;
    }

    pendingCloudReferenceConsent.awaitingConfirmation = true;
    pendingCloudReferenceConsent.userId = userId;
    pendingCloudReferenceConsent.sessionIndex = sessionIndex;
    appendSessionMessage(
      sessionIndex,
      'assistant',
      '请问是否同意 BOH AI 在回答时查看你的 Cloud+ 全部内容？这只会用于当前账号的私有参考，不会公开给其他人。',
      { kind: 'cloud_reference_consent' }
    );
    setMemoryCaptureStatusMessage('请先确认是否同意 Cloud+ 全量参考。');
  };

  const applyCloudReferenceConsent = (allowed) => {
    const sessionIndex = Number.isInteger(pendingCloudReferenceConsent.sessionIndex)
      ? pendingCloudReferenceConsent.sessionIndex
      : currentSessionIndex.value;

    cloudReferenceConsent.value = allowed ? 'granted' : 'denied';
    persistCloudReferenceConsent();
    isTreeholeMemoryEnabled.value = Boolean(allowed);
    persistTreeholeMemorySetting();
    resetPendingCloudReferenceConsent();

    if (allowed) {
      setMemoryCaptureStatusMessage('Cloud+ 参考已开启：AI 将可查看你的全部 Cloud+ 内容作为私有参考。');
      appendSessionMessage(sessionIndex, 'assistant', '已收到你的同意。Cloud+ 参考已开启，后续回答可以结合你的全部 Cloud+ 内容。');
      return;
    }

    setMemoryCaptureStatusMessage('已拒绝 Cloud+ 参考，本次不会读取你的 Cloud+ 内容。');
    appendSessionMessage(sessionIndex, 'assistant', '已收到你的选择。Cloud+ 参考保持关闭，后续不会读取你的 Cloud+ 内容。');
  };

  const approveCloudReferenceConsent = () => {
    if (!pendingCloudReferenceConsent.awaitingConfirmation) return;
    applyCloudReferenceConsent(true);
  };

  const rejectCloudReferenceConsent = () => {
    if (!pendingCloudReferenceConsent.awaitingConfirmation) return;
    applyCloudReferenceConsent(false);
  };

  const handlePendingCloudReferenceConsentReply = async (rawText) => {
    if (!pendingCloudReferenceConsent.awaitingConfirmation) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const normalized = normalizeActionDecisionText(safeText);
    if (!normalized) return false;

    const sessionIndex = Number.isInteger(pendingCloudReferenceConsent.sessionIndex)
      ? pendingCloudReferenceConsent.sessionIndex
      : currentSessionIndex.value;
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) {
      resetPendingCloudReferenceConsent();
      return false;
    }

    appendSessionMessage(sessionIndex, 'user', safeText);
    if (targetSession.messages.length === 1) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }

    inputMessage.value = '';
    if (textareaRef.value) textareaRef.value.style.height = 'auto';

    const allowList = new Set(['是', '是的', '好', '好的', '可以', '行', '确认', '确定', '同意', '允许', 'ok', 'yes', 'y']);
    const denyList = new Set(['否', '不用', '不需要', '取消', '算了', '暂不', '不要', '拒绝', '不同意', 'no', 'n']);

    if (denyList.has(normalized)) {
      applyCloudReferenceConsent(false);
      return true;
    }

    if (allowList.has(normalized)) {
      applyCloudReferenceConsent(true);
      return true;
    }

    appendSessionMessage(sessionIndex, 'assistant', '请点击“同意”或“拒绝”，也可以直接回复“同意”或“拒绝”。');
    setMemoryCaptureStatusMessage('等待你的选择：同意或拒绝 Cloud+ 参考。');
    return true;
  };

  const isSharedMemorySaveConfirm = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    return new Set(['是', '是的', '好', '好的', '可以', '行', '确认', '确定', '同意', '写入', '保存', '记录', '加入记忆库', 'ok', 'yes', 'y']).has(normalized);
  };

  const isSharedMemorySaveReject = (text) => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return false;
    return new Set(['否', '不用', '不需要', '取消', '算了', '暂不', '不要', '不写入', '不保存', '不记录', 'no', 'n']).has(normalized);
  };

  const resolveMemorySaveDestinationFromText = (text, fallback = 'ask') => {
    const normalized = normalizeActionDecisionText(text);
    if (!normalized) return fallback;
    if (/(两者|两个都|都存|都保存|都写入|同时|一起|cloud\+和公共|公共记忆和cloud)/i.test(normalized)) return 'both';
    if (/(cloud\+|cloud|随手记|日记|私有|私人|个人记录)/i.test(normalized)) return 'cloud';
    if (/(公共记忆|公共|共享记忆|社群记忆|记忆库)/i.test(normalized)) return 'shared';
    if (isSharedMemorySaveConfirm(text) && ['cloud', 'shared', 'both'].includes(fallback)) return fallback;
    return fallback;
  };

  const formatMemorySavePrompt = (content, destination = 'ask') => {
    const safeContent = normalizePromptLine(content, 320);
    if (destination === 'cloud') {
      return `要把这条内容记录到 BOH Cloud+ 吗？\n\n${safeContent}\n\n回复“确认”保存，回复“取消”跳过。`;
    }
    if (destination === 'shared') {
      return `要把这条内容写入 BOH AI 公共记忆库吗？\n\n${safeContent}\n\n回复“确认”写入，回复“取消”跳过。`;
    }
    if (destination === 'both') {
      return `要把这条内容同时保存到 BOH Cloud+ 和 BOH AI 公共记忆库吗？\n\n${safeContent}\n\n回复“确认”保存到两处，回复“取消”跳过。`;
    }
    return `这条内容要保存到哪里？\n\n${safeContent}\n\n可以回复 Cloud+、公共记忆、两者都保存，或“不保存”。`;
  };

  const requestSharedMemorySaveConfirmation = ({ content, sessionIndex, destination = 'ask' } = {}) => {
    const safeContent = normalizePromptLine(content, 320);
    if (!safeContent) return false;

    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      appendSessionMessage(
        sessionIndex,
        'assistant',
        '保存到 BOH Cloud+ 或公共记忆库需要先登录；我这次先不保存。',
        { kind: 'shared_memory_login_required' }
      );
      return true;
    }

    pendingSharedMemoryCapture.awaitingConfirmation = true;
    pendingSharedMemoryCapture.userId = userId;
    pendingSharedMemoryCapture.sessionIndex = sessionIndex;
    pendingSharedMemoryCapture.content = safeContent;
    pendingSharedMemoryCapture.destination = ['cloud', 'shared', 'both', 'ask'].includes(destination) ? destination : 'ask';
    appendSessionMessage(
      sessionIndex,
      'assistant',
      formatMemorySavePrompt(safeContent, pendingSharedMemoryCapture.destination),
      { kind: 'shared_memory_capture_confirm' }
    );
    return true;
  };

  const saveConfirmedAutoMemory = async ({ userId, content, destination, sessionIndex } = {}) => {
    const safeUserId = String(userId || '').trim();
    const safeContent = normalizePromptLine(content, 320);
    if (!safeUserId || safeUserId !== String(userInfo.value?.id || '').trim()) {
      appendSessionMessage(sessionIndex, 'assistant', '登录状态已变化，本次保存已取消，请重新发送后再试。');
      return;
    }
    const targetDestination = ['cloud', 'shared', 'both'].includes(destination) ? destination : 'shared';
    const shouldSaveCloud = targetDestination === 'cloud' || targetDestination === 'both';
    const shouldSaveShared = targetDestination === 'shared' || targetDestination === 'both';
    const savedTargets = [];
    const errors = [];

    if (shouldSaveCloud) {
      const cloudResult = await runRegisteredAction(BOHAI_ACTION_IDS.saveCloud, {
        title: buildQuickNoteTitle(safeContent),
        content: safeContent
      });
      if (cloudResult.ok) {
        savedTargets.push('BOH Cloud+');
      } else {
        errors.push(`Cloud+：${cloudResult.errorMessage || '保存失败'}`);
      }
    }

    if (shouldSaveShared) {
      const saveResult = await runRegisteredAction(BOHAI_ACTION_IDS.saveSharedMemory, {
        content: safeContent
      });
      if (saveResult.ok) {
          savedTargets.push('BOH AI 公共记忆库');
      } else if (saveResult.metadata?.duplicate) {
        errors.push('公共记忆库：已有相近内容，已跳过重复写入');
      } else {
        errors.push(`公共记忆库：${saveResult.errorMessage || '写入失败'}`);
      }
    }

    if (savedTargets.length > 0) {
      const savedText = `已保存到 ${savedTargets.join(' 和 ')}。`;
      setMemoryCaptureStatusMessage(savedText);
      appendSessionMessage(sessionIndex, 'assistant', savedText, { kind: 'memory_saved_notice' });
      if (errors.length > 0) {
        appendSessionMessage(sessionIndex, 'assistant', errors.join('\n'));
      }
      return true;
    }

    appendSessionMessage(sessionIndex, 'assistant', errors.length > 0 ? errors.join('\n') : '保存失败，请稍后重试。');
    return true;
  };

  const handlePendingSharedMemoryCaptureReply = async (rawText) => {
    if (!pendingSharedMemoryCapture.awaitingConfirmation) return false;

    const safeText = String(rawText || '').trim();
    if (!safeText) return false;

    const sessionIndex = Number.isInteger(pendingSharedMemoryCapture.sessionIndex)
      ? pendingSharedMemoryCapture.sessionIndex
      : currentSessionIndex.value;
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) {
      resetPendingSharedMemoryCapture();
      return false;
    }

    appendSessionMessage(sessionIndex, 'user', safeText);
    if (targetSession.messages.length === 1) {
      targetSession.title = safeText.slice(0, 30) + (safeText.length > 30 ? '...' : '');
    }
    resetComposerInput();

    if (isSharedMemorySaveReject(safeText)) {
      resetPendingSharedMemoryCapture();
      appendSessionMessage(sessionIndex, 'assistant', '好的，这条社群记忆不写入公共记忆库。');
      return true;
    }

    let destination = resolveMemorySaveDestinationFromText(safeText, pendingSharedMemoryCapture.destination);
    if (destination === 'ask') {
      appendSessionMessage(sessionIndex, 'assistant', '请回复“Cloud+”、“公共记忆”、“两者都保存”，或回复“不保存”。');
      return true;
    }

    if (!['cloud', 'shared', 'both'].includes(destination)) {
      appendSessionMessage(sessionIndex, 'assistant', '请回复“Cloud+”、“公共记忆”、“两者都保存”，或回复“不保存”。');
      return true;
    }

    const pendingUserId = String(pendingSharedMemoryCapture.userId || '').trim();
    const content = normalizePromptLine(pendingSharedMemoryCapture.content, 320);
    if (!pendingUserId || !content || !isLoggedIn.value || String(userInfo.value?.id || '').trim() !== pendingUserId) {
      resetPendingSharedMemoryCapture();
      appendSessionMessage(sessionIndex, 'assistant', '登录状态发生变化，这条记忆暂时没有写入。请重新发送后再确认。');
      return true;
    }

    resetPendingSharedMemoryCapture();
    await saveConfirmedAutoMemory({
      userId: pendingUserId,
      content,
      destination,
      sessionIndex
    });
    return true;
  };

  const toggleTreeholeMemory = async () => {
    if (isTreeholeMemoryToggling.value) return;

    if (!isLoggedIn.value || !userInfo.value?.id) {
      setMemoryCaptureStatusMessage('请先登录，再开启 Cloud+ 参考。');
      return;
    }

    if (isTreeholeMemoryEnabled.value) {
      isTreeholeMemoryEnabled.value = false;
      persistTreeholeMemorySetting();
      setMemoryCaptureStatusMessage('Cloud+ 参考已关闭。');
      return;
    }

    isTreeholeMemoryToggling.value = true;
    try {
      if (cloudReferenceConsent.value !== 'granted') {
        requestCloudReferenceConsent();
        return;
      }
      isTreeholeMemoryEnabled.value = true;
      persistTreeholeMemorySetting();
      resetPendingTreeholeCreation();
      setMemoryCaptureStatusMessage('Cloud+ 参考已开启：AI 将可查看你的全部 Cloud+ 内容作为私有参考。');
    } finally {
      isTreeholeMemoryToggling.value = false;
    }
  };

  const shouldSuppressMemoryStatusEcho = (baseText, statusText) => {
    const base = String(baseText || '').trim();
    const status = String(statusText || '').trim();
    if (!base || !status) return false;

    const normalizeForCompare = (text) => String(text || '')
      .replace(/[：:；;，,。.\s]/g, '')
      .replace(/默认|同步/g, '')
      .trim();
    const normalizedBase = normalizeForCompare(base);
    const normalizedStatus = normalizeForCompare(status);
    if (!normalizedBase || !normalizedStatus) return false;
    if (normalizedBase.includes(normalizedStatus) || normalizedStatus.includes(normalizedBase)) return true;

    const stateEchoRules = [
      /^公共记忆已开启/u,
      /^公共记忆已关闭/u,
      /^Cloud\+ 参考已开启/u,
      /^Cloud\+ 参考已关闭/u,
      /^随手记已开启/u,
      /^随手记已关闭/u
    ];
    if (!stateEchoRules.some((rule) => rule.test(status))) return false;

    if (status.includes('公共记忆') && base.includes('公共记忆已')) return true;
    if (status.includes('Cloud+') && base.includes('Cloud+ 参考')) return true;
    if (status.includes('随手记') && base.includes('随手记已')) return true;
    return false;
  };

  const memoryCaptureTip = computed(() => {
    const base = (() => {
      if (!isLoggedIn.value) return '登录后可开启公共记忆、Cloud+ 参考与随手记。';
      const parts = [
        isMemoryCaptureEnabled.value
          ? '公共记忆已开启：写入 BOH AI 公共记忆库'
          : '公共记忆已关闭',
        isTreeholeMemoryEnabled.value
          ? 'Cloud+ 参考已开启：回答可参考你的全部 Cloud+ 内容'
          : 'Cloud+ 参考已关闭',
        isQuickNoteEnabled.value
          ? '随手记已开启'
          : '随手记已关闭'
      ];
      return `${parts.join('；')}。`;
    })();
    const status = String(memoryCaptureStatusMessage.value || '').trim();
    if (!status) return base;
    if (shouldSuppressMemoryStatusEcho(base, status)) return base;
    return `${base} ${status}`;
  });

  // 功能互斥：避免“指令模式 + 联网搜索”同时开启造成行为与 UI 不一致
  watch(isCommandMode, (enabled) => {
    if (enabled && isSearching.value) {
      isSearching.value = false;
    }
  });
  watch(isSearching, (enabled) => {
    if (enabled && isCommandMode.value) {
      isCommandMode.value = false;
    }
  });

  // Rate Limiting
  const lastMessageTime = ref(0);
  const messageCount = ref(0);
  const windowStartTime = ref(Date.now());
  const isRateLimited = ref(false);
  const rateLimitMessage = ref('');

  const messages = computed(() => chatSessions[currentSessionIndex.value]?.messages || []);

  const getSessionByIndex = (index) => {
    if (!Number.isInteger(index)) return null;
    if (index < 0 || index >= chatSessions.length) return null;
    return chatSessions[index];
  };

  // Timer Logic
  const startThinkingTimer = () => {
    thinkingTime.value = 0;
    if (thinkingTimer.value) clearInterval(thinkingTimer.value);
    thinkingTimer.value = setInterval(() => {
      thinkingTime.value = parseFloat((thinkingTime.value + 0.1).toFixed(1));
    }, 100);
  };

  const stopThinkingTimer = () => {
    if (thinkingTimer.value) {
      clearInterval(thinkingTimer.value);
      thinkingTimer.value = null;
    }
  };

  const setThinkingStatus = (text) => {
    thinkingStatus.value = String(text || '').trim();
  };

  const clearThinkingStatus = () => {
    thinkingStatus.value = '';
  };

  // Scroll Helper
  const scrollToBottomCallback = ref(null);
  const onScrollToBottom = (callback) => {
    scrollToBottomCallback.value = callback;
  };
  const scrollToBottom = (force = false) => {
    if (scrollToBottomCallback.value) {
      scrollToBottomCallback.value(force);
    }
  };

  // Session Management
  const startNewChat = () => {
    chatSessions.unshift({
      title: '新对话',
      messages: [],
      timestamp: Date.now(),
      isLoading: false,
      isThinking: false
    });
    currentSessionIndex.value = 0;
    isCommandMode.value = false; // Reset modes
    isSearching.value = false;
    currentModeId.value = BOH_AUTO_MODE_ID;
  };

  const deleteSession = (index) => {
    if (activeGenerationSessionIndex.value === index) {
      return;
    }

    if (chatSessions.length === 1) {
      chatSessions[0] = { title: '新对话', messages: [], timestamp: Date.now(), isLoading: false, isThinking: false };
      return;
    }
    chatSessions.splice(index, 1);

    if (activeGenerationSessionIndex.value !== null && activeGenerationSessionIndex.value > index) {
      activeGenerationSessionIndex.value -= 1;
    }

    if (currentSessionIndex.value >= chatSessions.length) {
      currentSessionIndex.value = chatSessions.length - 1;
    }
  };

  const switchSession = (index) => {
    currentSessionIndex.value = index;
    nextTick(() => scrollToBottom(true));
  };

  const stopGeneration = () => {
    const activeIndex = activeGenerationSessionIndex.value;

    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }

    if (activeIndex !== null) {
      const activeSession = getSessionByIndex(activeIndex);
      if (activeSession) {
        activeSession.isLoading = false;
        activeSession.isThinking = false;
      }
    }

    activeGenerationSessionIndex.value = null;
    stopThinkingTimer();
    nextTick(() => {
      if (textareaRef.value) textareaRef.value.focus();
    });
  };

  const handleSsePayloadLine = (line, onPayload) => {
    const normalized = String(line || '').trim();
    if (!normalized || !normalized.startsWith('data:')) {
      return false;
    }
    const payload = normalized.slice(5).trimStart();
    if (!payload) {
      return false;
    }
    if (payload === '[DONE]') {
      return true;
    }
    onPayload(payload);
    return false;
  };

  const createSseLineParser = (onPayload) => {
    let lineBuffer = '';
    let done = false;

    return {
      push(chunkText) {
        if (!chunkText || done) return;
        lineBuffer += chunkText;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';
        for (const line of lines) {
          if (handleSsePayloadLine(line, onPayload)) {
            done = true;
            lineBuffer = '';
            break;
          }
        }
      },
      flush() {
        if (!lineBuffer || done) return;
        if (handleSsePayloadLine(lineBuffer, onPayload)) {
          done = true;
        }
        lineBuffer = '';
      },
      isDone() {
        return done;
      }
    };
  };

  onScopeDispose(() => {
    clearSaveTimers();
    if (memoryCaptureStatusTimer) {
      clearTimeout(memoryCaptureStatusTimer);
      memoryCaptureStatusTimer = null;
    }
    resetPendingTreeholeCreation();
    resetPendingCloudReferenceConsent();
    resetPendingSharedMemoryCapture();
    resetPendingQuickNote();
    resetPendingActionDraft();
    stopThinkingTimer();
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    activeGenerationSessionIndex.value = null;
  });

  // Helper Functions
  const _safeJsonParse = (str) => {
    try {
      return JSON.parse(str);
    } catch (e) {
      // Try to find the first '{' and the last '}'
      const start = str.indexOf('{');
      const end = str.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
          return JSON.parse(str.substring(start, end + 1));
        } catch (_e2) {
          throw new Error("JSON Parsing Failed after cleanup");
        }
      }
      throw e;
    }
  };

  // 指令模式 - 优化版
  const handleCommandModeGeneration = async (rawUserText = '', { appendUser = true } = {}) => {
    if (abortController.value) return;

    const userText = String(rawUserText || inputMessage.value || '').trim();
    if (!userText) return;
    const sessionIndex = currentSessionIndex.value;
    const session = getSessionByIndex(sessionIndex);
    if (!session) return;

    if (appendUser) {
      inputMessage.value = '';
      if (textareaRef.value) textareaRef.value.style.height = 'auto';
      session.messages.push({ role: 'user', content: userText });
      if (session.messages.length === 1) {
        session.title = userText.slice(0, 30) + (userText.length > 30 ? '...' : '');
      }
    }

    nextTick(() => scrollToBottom());
    session.isLoading = true;
    session.isThinking = true;
    const requestController = new AbortController();
    abortController.value = requestController;
    let activeCommandController = requestController;
    let activeCommandSignal = requestController.signal;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();

    session.messages.push({ role: 'assistant', content: '' });
    const messageIndex = session.messages.length - 1;
    setThinkingStatus(`正在分析 Minecraft 指令需求：${summarizeThinkingSubject(userText)}`);

    const updateContent = (text) => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession || !targetSession.messages[messageIndex]) return;
      targetSession.messages[messageIndex].content = text;
      nextTick(() => scrollToBottom());
    };

    try {
      const commandModel = getModelForModeId('pro') || currentModel.value || availableModels.find((m) => m.id === 'Qwen/Qwen2.5-7B-Instruct') || availableModels[0];
      if (!commandModel) throw new Error('指令模式模型不可用');
      const commandIntent = detectCommandIntent(userText);
      const formattedInstructions = getRelevantCommandInstructions(userText, commandIntent);
      const recentHistory = buildHistoryMessagesWithinBudget(session.messages.slice(0, -2), {
        maxChars: 5200,
        maxMessages: 6,
        maxPerMessage: 900
      });
      const systemPrompt = getCommandSystemPrompt(formattedInstructions, commandIntent);
      let streamedContent = '';
      let shouldRepairDegenerateCommandStream = false;

      try {
        setThinkingStatus('正在生成可直接执行的指令...');
        await callModelStream(
          commandModel.id,
          userText,
          systemPrompt,
          recentHistory,
          (chunk) => {
            if (shouldRepairDegenerateCommandStream) return;
            const targetSession = getSessionByIndex(sessionIndex);
            const previous = targetSession?.messages?.[messageIndex]?.content || '';
            streamedContent = previous + chunk;
            if (String(chunk || '').trim()) {
              clearThinkingStatus();
            }
            updateContent(streamedContent);
            if (isDegenerateStreamOutput(streamedContent)) {
              shouldRepairDegenerateCommandStream = true;
              setThinkingStatus('检测到指令输出异常，正在自动修复...');
              if (requestController.signal.aborted === false) {
                requestController.abort();
              }
            }
          },
          { max_tokens: 4096, temperature: 0.3 },
          requestController.signal
        );
      } catch (streamError) {
        if (!shouldRepairDegenerateCommandStream || streamError.name !== 'AbortError') {
          throw streamError;
        }
      }

      let finalContent = getSessionByIndex(sessionIndex)?.messages?.[messageIndex]?.content || '';
      let finalFilteredContent = normalizeEscapedLineBreaks(filterThinkingContent(finalContent));
      if (shouldRepairDegenerateCommandStream || isDegenerateAssistantReply(finalFilteredContent)) {
        setThinkingStatus('检测到指令输出异常，正在自动修复...');
        const retryPrompt = `${userText}

【稳定性约束】
- 直接输出最终 Minecraft 指令方案。
- 禁止输出字面量 \\n、\\r、JSON 字符串或连续重复占位符。
- 使用真实 Markdown 换行和 mcfunction 代码块。
- 如果基岩版能力不足，请给出可执行的分步替代方案。`;

        try {
          const repaired = await callModelInternal(
            commandModel.id,
            retryPrompt,
            systemPrompt,
            recentHistory,
            activeCommandSignal,
            0,
            { max_tokens: 2200, temperature: 0.16, top_p: 0.7, frequency_penalty: 0.6 }
          );
          const repairedContent = normalizeEscapedLineBreaks(filterThinkingContent(repaired));
          finalFilteredContent = (!isDegenerateAssistantReply(repairedContent) && repairedContent.trim())
            ? repairedContent
            : '抱歉，指令模式本轮输出异常。请再试一次，或切换到“专业”模式后重新发送需求。';
        } catch (repairError) {
          if (repairError.name === 'AbortError' && shouldRepairDegenerateCommandStream) {
            const retryController = new AbortController();
            activeCommandController = retryController;
            activeCommandSignal = retryController.signal;
            abortController.value = retryController;
            const repaired = await callModelInternal(
              commandModel.id,
              retryPrompt,
              systemPrompt,
              recentHistory,
              retryController.signal,
              0,
              { max_tokens: 2200, temperature: 0.16, top_p: 0.7, frequency_penalty: 0.6 }
            );
            const repairedContent = normalizeEscapedLineBreaks(filterThinkingContent(repaired));
            finalFilteredContent = (!isDegenerateAssistantReply(repairedContent) && repairedContent.trim())
              ? repairedContent
              : '抱歉，指令模式本轮输出异常。请再试一次，或切换到“专业”模式后重新发送需求。';
          } else {
            throw repairError;
          }
        }
      }

      const validation = validateCommandOutput(finalFilteredContent, commandIntent);
      if (!validation.ok) {
        setThinkingStatus('正在核验指令语法并修正冲突...');
        updateContent(`${finalFilteredContent}\n\n> ⚙️ 检测到指令语法冲突，正在自动修正...`);
        try {
          const repairPrompt = buildCommandRepairPrompt(userText, finalFilteredContent, validation);
          const repaired = await callModelInternal(
            commandModel.id,
            repairPrompt,
            systemPrompt,
            recentHistory,
            activeCommandSignal
          );
          const repairedContent = normalizeEscapedLineBreaks(filterThinkingContent(repaired));
          updateContent(`${repairedContent}\n\n> ✅ 已完成自动语法修正`);
        } catch (repairError) {
          logger.warn('boh-ai', 'Command output repair failed, fallback to original output', repairError);
          updateContent(`${finalFilteredContent}\n\n> ⚠️ 自动修正失败，已保留原始结果。`);
        }
      } else {
        updateContent(finalFilteredContent);
      }
      nextTick(() => scrollToBottom());
      await queueQuickNoteConfirmation({
        rawText: userText,
        sessionIndex,
        requestSignal: activeCommandSignal,
        modelId: commandModel.id
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        const currentContent = getSessionByIndex(sessionIndex)?.messages?.[messageIndex]?.content || '';
        updateContent(currentContent + '\n\n(已停止生成)');
      } else {
        logger.error('boh-ai', 'Command Mode Error', error);
        const currentContent = getSessionByIndex(sessionIndex)?.messages?.[messageIndex]?.content || '';
        updateContent(currentContent + `\n\n❌ **Error**: ${error.message}`);
      }
    } finally {
      clearThinkingStatus();
      const targetSession = getSessionByIndex(sessionIndex);
      if (targetSession) {
        targetSession.isLoading = false;
        targetSession.isThinking = false;
      }
      if (abortController.value === requestController || abortController.value === activeCommandController) {
        abortController.value = null;
      }
      if (activeGenerationSessionIndex.value === sessionIndex) {
        activeGenerationSessionIndex.value = null;
      }
      stopThinkingTimer();
    }
  };

  // Helper: Get Fallback Model
  const getFallbackModel = (failedModelId) => {
    const fallbackIdsByModel = {
      [AUTO_ROUTER_MODEL_ID]: ['Qwen/Qwen3-8B', 'THUDM/GLM-4-9B-0414'],
      [ACCURACY_PREFERRED_MODEL_ID]: [RAG_PREFERRED_MODEL_ID, 'Qwen/Qwen3-8B', 'THUDM/GLM-4-9B-0414'],
      [RAG_PREFERRED_MODEL_ID]: [ACCURACY_PREFERRED_MODEL_ID, 'Qwen/Qwen3-8B', 'THUDM/GLM-4-9B-0414'],
      'Qwen/Qwen3-8B': ['THUDM/GLM-4-9B-0414', 'Qwen/Qwen2.5-7B-Instruct'],
      'Qwen/Qwen2.5-7B-Instruct': ['Qwen/Qwen3-8B', 'THUDM/GLM-4-9B-0414'],
      'THUDM/GLM-4-9B-0414': ['Qwen/Qwen3-8B', 'Qwen/Qwen2.5-7B-Instruct']
    };
    const candidates = fallbackIdsByModel[failedModelId] || ['Qwen/Qwen3-8B', 'THUDM/GLM-4-9B-0414', 'Qwen/Qwen2.5-7B-Instruct'];
    const fallback = candidates
      .map((id) => availableModels.find((model) => model.id === id))
      .find((model) => model && model.id !== failedModelId);
    return fallback || availableModels.find((model) => model.id !== AUTO_ROUTER_MODEL_ID && model.id !== failedModelId) || availableModels[0];
  };

  const toFiniteNumber = (value, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  const callModelInternal = async (
    modelId,
    prompt,
    systemPrompt,
    history = [],
    requestSignal = undefined,
    retryCount = 0,
    options = {}
  ) => {
    const model = availableModels.find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    const resolvedOptions = {
      max_tokens: Math.trunc(toFiniteNumber(options.max_tokens, 1800, { min: 256, max: 4096 })),
      temperature: toFiniteNumber(options.temperature, 0.22, { min: 0, max: 1.2 }),
      top_p: toFiniteNumber(options.top_p, 0.75, { min: 0.1, max: 1 }),
      frequency_penalty: toFiniteNumber(options.frequency_penalty, 0.08, { min: 0, max: 2 })
    };

    try {
      const response = await fetch(model.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey}`
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: prompt }
          ],
          stream: false,
          max_tokens: resolvedOptions.max_tokens,
          temperature: resolvedOptions.temperature,
          top_p: resolvedOptions.top_p,
          frequency_penalty: resolvedOptions.frequency_penalty
        }),
        signal: requestSignal || (abortController.value ? abortController.value.signal : undefined)
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      if (retryCount < 1 && error.name !== 'AbortError') {
        logger.warn('boh-ai', `Model ${modelId} failed, trying fallback`, error);
        const fallbackModel = getFallbackModel(modelId);
        if (fallbackModel && fallbackModel.id !== modelId) {
          return callModelInternal(
            fallbackModel.id,
            prompt,
            systemPrompt,
            history,
            requestSignal,
            retryCount + 1,
            options
          );
        }
      }
      throw error;
    }
  };

  const normalizeAutoClassifierBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

  const createNeutralAutoDecision = () => ({
    modeId: 'fast',
    codeOrCommand: false,
    minecraftCommand: false,
    dailySummary: false,
    bohInternalFactual: false,
    complexQuestion: false,
    communityMemoryShare: false,
    shouldSearchWeb: false,
    shouldReferenceCloud: false,
    shouldSaveCloud: false,
    shouldSaveSharedMemory: false,
    saveDestination: 'none',
    shouldAskMemoryDestination: false,
    forceCloudReference: false,
    shouldAskSharedMemory: false,
    actionNotes: [],
    confidence: 0
  });

  const resolveAutoModeDecisionLocally = (userText) => ({
    ...createNeutralAutoDecision(),
    ...resolveBOHAIAutoModeDecision(userText, {
      isAutoMode: currentModeId.value === BOH_AUTO_MODE_ID,
      cloudReferenceEnabled: Boolean(isTreeholeMemoryEnabled.value),
      isLoggedIn: Boolean(isLoggedIn.value && userInfo.value?.id)
    })
  });

  const shouldAskModelForAutoDecision = (userText) => {
    const normalized = normalizePromptLine(userText, 1000);
    if (!normalized) return false;
    return true;
  };

  const hasExplicitAutoSaveIntent = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,20}(cloud\+|cloud|随手记|日记|笔记|公共记忆|共享记忆|社群记忆|记忆库|私有记录|私人记录))|((记一下|记录一下|帮我记|帮我保存|帮我存一下).{0,20}(这|这条|这段|内容|事情|事|到|进)?)/i.test(normalized);
  };

  const isLookupOrSummaryRequest = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    const requestPattern = /(总结|复盘|回顾|梳理|概括|说说|讲讲|介绍|查询|搜索|找一下|看看|最近发生|发生了什么|最新动态|热帖|公告|大家在聊)/i;
    const sourcePattern = /(论坛|帖子|社区|社群|方块之家|boh|公共记忆|共享记忆|记忆库|cloud\+|cloud|随手记|日记|笔记|记录)/i;
    return requestPattern.test(normalized) && sourcePattern.test(normalized);
  };

  const sanitizeAutoDecisionForUserText = (decision, userText) => {
    if (!decision) return decision;
    const explicitSave = hasExplicitAutoSaveIntent(userText);
    if (explicitSave || !isLookupOrSummaryRequest(userText)) return decision;

    return {
      ...decision,
      communityMemoryShare: false,
      shouldSaveCloud: false,
      shouldSaveSharedMemory: false,
      saveDestination: 'none',
      shouldAskMemoryDestination: false,
      shouldAskSharedMemory: false,
      actionNotes: normalizeActionNotes(
        (decision.actionNotes || []).filter((note) => !/记忆|保存|写入/.test(String(note || '')))
      )
    };
  };

  const normalizeAutoSaveDestination = (value, decision = {}) => {
    const normalized = String(value || '').toLowerCase().trim();
    if (['cloud', 'cloud+', 'private', 'quick_note', 'note'].includes(normalized)) return 'cloud';
    if (['shared', 'public', 'memory', 'public_memory', 'shared_memory'].includes(normalized)) return 'shared';
    if (['both', 'all', 'cloud_and_shared', 'cloud+public'].includes(normalized)) return 'both';
    if (['ask', 'unclear'].includes(normalized)) return 'ask';
    if (decision.shouldSaveCloud && decision.shouldSaveSharedMemory) return 'both';
    if (decision.shouldSaveCloud) return 'cloud';
    if (decision.shouldSaveSharedMemory) return 'shared';
    return 'none';
  };

  const AUTO_MODE_RANK = { fast: 1, think: 2, pro: 3 };
  const pickMoreCapableAutoMode = (left = 'fast', right = 'fast') => {
    const safeLeft = ['fast', 'think', 'pro'].includes(left) ? left : 'fast';
    const safeRight = ['fast', 'think', 'pro'].includes(right) ? right : 'fast';
    return (AUTO_MODE_RANK[safeLeft] >= AUTO_MODE_RANK[safeRight]) ? safeLeft : safeRight;
  };

  const mergeAutoDecisionWithLocalGuardrails = (modelDecision = {}, localDecision = {}) => {
    const merged = {
      ...createNeutralAutoDecision(),
      ...modelDecision
    };

    const hardBooleanFields = [
      'codeOrCommand',
      'minecraftCommand',
      'dailySummary',
      'complexQuestion',
      'shouldSearchWeb',
      'shouldReferenceCloud',
      'forceCloudReference',
      'bohInternalFactual'
    ];
    hardBooleanFields.forEach((field) => {
      merged[field] = Boolean(merged[field] || localDecision[field]);
    });

    if (localDecision.shouldSaveCloud || localDecision.shouldSaveSharedMemory || localDecision.shouldAskMemoryDestination) {
      merged.shouldSaveCloud = Boolean(merged.shouldSaveCloud || localDecision.shouldSaveCloud);
      merged.shouldSaveSharedMemory = Boolean(merged.shouldSaveSharedMemory || localDecision.shouldSaveSharedMemory);
      merged.shouldAskMemoryDestination = Boolean(merged.shouldAskMemoryDestination || localDecision.shouldAskMemoryDestination);
      merged.communityMemoryShare = Boolean(merged.communityMemoryShare || localDecision.communityMemoryShare);
      merged.saveDestination = localDecision.saveDestination || merged.saveDestination || 'ask';
    }

    if (merged.codeOrCommand || merged.minecraftCommand) {
      merged.modeId = 'pro';
    } else if (
      merged.dailySummary
      || merged.complexQuestion
      || merged.shouldReferenceCloud
      || merged.bohInternalFactual
      || merged.shouldSearchWeb
    ) {
      merged.modeId = pickMoreCapableAutoMode(merged.modeId, 'think');
    } else {
      merged.modeId = pickMoreCapableAutoMode(merged.modeId, localDecision.modeId || 'fast');
    }

    merged.forceCloudReference = Boolean(merged.forceCloudReference || merged.shouldReferenceCloud || merged.dailySummary);
    merged.shouldAskSharedMemory = Boolean(merged.shouldSaveSharedMemory || merged.communityMemoryShare || localDecision.shouldAskSharedMemory);
    merged.confidence = Math.max(Number(merged.confidence || 0), Number(localDecision.confidence || 0));
    merged.actionNotes = normalizeActionNotes([
      ...(Array.isArray(localDecision.actionNotes) ? localDecision.actionNotes : []),
      ...(Array.isArray(merged.actionNotes) ? merged.actionNotes : [])
    ]);

    return merged;
  };

  const resolveAutoModeDecisionWithFastModel = async (userText, requestSignal = undefined) => {
    const fallback = resolveAutoModeDecisionLocally(userText);
    if (!shouldAskModelForAutoDecision(userText)) {
      return sanitizeAutoDecisionForUserText(fallback, userText);
    }

    const autoRouterModel = availableModels.find((item) => item.id === AUTO_ROUTER_MODEL_ID) || getModelForModeId('fast');
    if (!autoRouterModel?.id) return sanitizeAutoDecisionForUserText(fallback, userText);

    try {
      const raw = await callModelInternal(
        autoRouterModel.id,
        [
          '请判断下面这条用户消息应该如何路由。',
          '只输出 JSON，不要解释，不要 Markdown。',
          '',
          '字段要求：',
          '- modeId: "fast" | "think" | "pro"',
          '- codeOrCommand: boolean，代码、报错、编程、SQL、终端命令、Minecraft 指令等为 true',
          '- minecraftCommand: boolean，仅 Minecraft/我的世界指令需求为 true',
          '- dailySummary: boolean，总结/复盘“我的最近日常、生活、状态、Cloud+记录”等为 true',
          '- complexQuestion: boolean，复杂方案、设计、优化、深度分析、推理、排查为 true',
          '- communityMemoryShare: boolean，用户在陈述/分享方块之家社群事实、成员事件、活动经过，且不是提问时为 true',
          '- shouldSearchWeb: boolean，用户需要外部世界资料时为 true，包括实时信息、新闻、官网资料、价格、政策法规、版本、天气、赛程比分、健康/医学/营养/补剂/训练安全、通用事实、产品、软件/API/技术文档、研究资料等；BOH 站内/Cloud+/公共记忆/用户私域问题不要设为 true',
          '- shouldReferenceCloud: boolean，回答前应该参考用户 BOH Cloud+ 私有内容时为 true，例如总结我的最近日常/根据我的记录复盘/结合我的 Cloud+',
          '- shouldSaveCloud: boolean，用户想把当前内容保存为自己的 Cloud+ 随手记/日记/私有记录时为 true',
          '- shouldSaveSharedMemory: boolean，用户想把当前内容保存到 BOH AI 公共记忆/社群记忆库，或内容明显是社群公共事实且适合询问写入时为 true',
          '- saveDestination: "none" | "cloud" | "shared" | "both" | "ask"，用户明确说同时保存到 Cloud+ 和公共记忆时输出 "both"；只明确一种就输出对应值；不清楚存哪里但应该询问时输出 "ask"',
          '- shouldAskMemoryDestination: boolean，当应该主动询问“存到 Cloud+、公共记忆还是两者”时为 true',
          '- confidence: 0 到 1',
          '',
          '路由规则：',
          '1. codeOrCommand 或 minecraftCommand 为 true 时，modeId 必须是 "pro"。',
          '2. dailySummary、complexQuestion、shouldReferenceCloud、shouldSearchWeb 为 true 时，modeId 至少必须是 "think"，除非同时是 codeOrCommand。',
          '3. 普通闲聊和简单问答用 "fast"。',
          '4. 涉及写入 Cloud+ 或公共记忆时，只做判断，不要代替用户确认。',
          '5. 如果用户在分享社群事实但没有明确说存到哪里，shouldAskMemoryDestination=true，saveDestination="ask"。',
          '6. 如果用户明确说“同时上传/两边都存/Cloud+和公共记忆都保存”，saveDestination="both"。',
          '7. 只要问题明显和 BOH 记忆库、Cloud+、论坛/社区、用户私域、站点操作无关，而是在问外部世界/通用知识/专业建议，就必须设 shouldSearchWeb=true，不要硬走记忆库。',
          '8. 外部实时信息、健康/医学/营养/补剂/训练安全、产品/软件/API/技术文档、研究资料、法律政策、旅游学校等外部问题都设 shouldSearchWeb=true。',
          '9. BOH 站内资料、用户私有资料和公共记忆优先走内部检索，不要联网，除非用户明确要求官网/外部/网上资料。',
          '10. “总结/复盘/看看/查询/说说论坛或社区最近发生的事、最新动态、热帖、公告”是读取和回答请求，不是保存请求；这类消息 shouldSaveCloud=false、shouldSaveSharedMemory=false、shouldAskMemoryDestination=false。',
          '11. 只有用户明确表达“保存/存到/写入/记录到/加入 Cloud+ 或公共记忆”，或用户是在陈述一条新的社群事实而不是提问/总结请求，才可以触发保存相关字段。',
          '12. 用户要求你“判断/选择/权衡/比较/给方案/排查/优化/分析原因/要不要/该不该/值不值得/怎么处理”时，complexQuestion=true，modeId="think"。',
          '13. 用户只要贴了报错、代码片段、SQL、终端输出、API 字段、前端组件/样式问题，codeOrCommand=true，modeId="pro"。',
          '',
          `用户消息：${truncateText(userText, 900)}`
        ].join('\n'),
        '你是 BOH AI 的轻量 Auto 路由分类器。你只输出严格 JSON。',
        [],
        requestSignal,
        0,
        { max_tokens: 320, temperature: 0.02, top_p: 0.45, frequency_penalty: 0 }
      );
      const parsed = _safeJsonParse(String(raw || '').trim());
      const confidence = Number(parsed?.confidence);
      if (!Number.isFinite(confidence) || confidence < 0.35) {
        return sanitizeAutoDecisionForUserText(fallback, userText);
      }

      const modelDecision = {
        modeId: ['fast', 'think', 'pro'].includes(parsed?.modeId) ? parsed.modeId : fallback.modeId,
        codeOrCommand: normalizeAutoClassifierBoolean(parsed?.codeOrCommand),
        minecraftCommand: normalizeAutoClassifierBoolean(parsed?.minecraftCommand),
        dailySummary: normalizeAutoClassifierBoolean(parsed?.dailySummary),
        complexQuestion: normalizeAutoClassifierBoolean(parsed?.complexQuestion),
        communityMemoryShare: normalizeAutoClassifierBoolean(parsed?.communityMemoryShare),
        shouldSearchWeb: normalizeAutoClassifierBoolean(parsed?.shouldSearchWeb),
        shouldReferenceCloud: normalizeAutoClassifierBoolean(parsed?.shouldReferenceCloud),
        shouldSaveCloud: normalizeAutoClassifierBoolean(parsed?.shouldSaveCloud),
        shouldSaveSharedMemory: normalizeAutoClassifierBoolean(parsed?.shouldSaveSharedMemory),
        shouldAskMemoryDestination: normalizeAutoClassifierBoolean(parsed?.shouldAskMemoryDestination)
      };

      const decision = mergeAutoDecisionWithLocalGuardrails(modelDecision, fallback);
      decision.saveDestination = normalizeAutoSaveDestination(parsed?.saveDestination, decision);
      if (decision.saveDestination === 'both') {
        decision.shouldSaveCloud = true;
        decision.shouldSaveSharedMemory = true;
      } else if (decision.saveDestination === 'cloud') {
        decision.shouldSaveCloud = true;
      } else if (decision.saveDestination === 'shared') {
        decision.shouldSaveSharedMemory = true;
      } else if (decision.saveDestination === 'ask' && (decision.communityMemoryShare || decision.shouldAskMemoryDestination)) {
        decision.shouldAskMemoryDestination = true;
      }

      if (decision.codeOrCommand || decision.minecraftCommand) {
        decision.modeId = 'pro';
      } else if (decision.dailySummary || decision.complexQuestion || decision.shouldReferenceCloud || decision.shouldSearchWeb || decision.bohInternalFactual) {
        decision.modeId = pickMoreCapableAutoMode(decision.modeId, 'think');
      } else {
        decision.modeId = decision.modeId || 'fast';
      }

      decision.forceCloudReference = Boolean(decision.shouldReferenceCloud || decision.dailySummary);
      decision.shouldAskSharedMemory = Boolean(decision.shouldSaveSharedMemory || decision.communityMemoryShare);
      return sanitizeAutoDecisionForUserText(decision, userText);
    } catch (error) {
      logger.warn('boh-ai', 'Auto 快速分类失败，使用中性路由兜底', error);
      return sanitizeAutoDecisionForUserText(fallback, userText);
    }
  };

  // Helper to safely convert to string
  const safeChunkToString = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch (_e) {
        return '[Invalid Object Content]'
      }
    }
    return String(value)
  }

  // 用于流式处理的思考内容过滤状态（使用普通变量，非响应式）
  let inThinkingBlock = false
  let thinkingBuffer = ''

  // 重置思考过滤状态
  const resetThinkingState = () => {
    inThinkingBlock = false
    thinkingBuffer = ''
  }

  // Filter out thinking content (between <think> and </think> tags)
  const filterThinkingContent = (content) => {
    if (!content) return ''
    let filtered = content

    // 循环多次过滤，确保所有嵌套的标签都被清除
    let previousFiltered
    do {
      previousFiltered = filtered

      // 1. 过滤完整的 <think>...</think> 标签（不区分大小写，包括属性）
      filtered = filtered.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '')

      // 2. 过滤不完整的 <think> 标签（只有开头，直到结束）
      filtered = filtered.replace(/<think[^>]*>[\s\S]*$/gi, '')

      // 3. 过滤不完整的 </think> 标签（从开头到结束标签）
      filtered = filtered.replace(/^[\s\S]*<\/think>/gi, '')

      // 4. 过滤单独的标签残留
      filtered = filtered.replace(/<\/?think[^>]*>/gi, '')

      // 5. 过滤中文的思考内容标记
      filtered = filtered.replace(/\*\*思考\*\*[\s\S]*?(?=\*\*回答\*\*|$)/g, '')
      filtered = filtered.replace(/思考过程[\s\S]*?(?=回答|$)/g, '')

    } while (previousFiltered !== filtered)

    // 6. 去除多余的空行
    filtered = filtered.replace(/\n{3,}/g, '\n\n')

    return filtered.trim()
  }

  // 流式处理时的思考内容过滤（带状态跟踪）
  const filterThinkingContentStream = (chunk) => {
    if (!chunk) return ''

    // 将新内容添加到缓冲区
    thinkingBuffer += chunk
    let output = ''

    // 循环处理，直到没有更多可处理的内容
    while (true) {
      // 如果在思考块内，寻找结束标签
      if (inThinkingBlock) {
        const endMatch = thinkingBuffer.match(/<\/think>/i)
        if (endMatch) {
          // 找到了结束标签，保留结束标签之后的内容并继续处理
          thinkingBuffer = thinkingBuffer.slice(endMatch.index + endMatch[0].length)
          inThinkingBlock = false
          continue // 继续循环处理剩余内容
        } else {
          // 还在思考块内，清空缓冲区
          thinkingBuffer = ''
          return output
        }
      }

      // 检查是否有开始标签（支持带属性的标签，如 <think lang="zh">）
      const startMatch = thinkingBuffer.match(/<think[^>]*>/i)
      if (startMatch) {
        // 找到了开始标签
        const beforeThink = thinkingBuffer.slice(0, startMatch.index)
        const afterThink = thinkingBuffer.slice(startMatch.index + startMatch[0].length)

        // 检查是否有结束标签
        const endMatch = afterThink.match(/<\/think>/i)
        if (endMatch) {
          // 完整的思考块，过滤掉，保留之前的内容和之后的内容
          output += beforeThink
          thinkingBuffer = afterThink.slice(endMatch.index + endMatch[0].length)
          continue // 继续循环处理剩余内容
        } else {
          // 不完整的思考块，标记状态，输出之前的内容
          inThinkingBlock = true
          output += beforeThink
          thinkingBuffer = ''
          return output
        }
      }

      // 没有更多标签，跳出循环
      break
    }

    // 检查是否有可能是不完整标签的结尾
    // 匹配可能的不完整标签：<, </, <t, <th, <thi, <thin, <think 等
    const potentialTagMatch = thinkingBuffer.match(/<\/?(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i)
    if (potentialTagMatch) {
      // 保留可能是不完整标签的部分在缓冲区
      output += thinkingBuffer.slice(0, potentialTagMatch.index)
      thinkingBuffer = potentialTagMatch[0]
      return output
    }

    // 没有不完整标签，返回全部内容并清空缓冲区
    output += thinkingBuffer
    thinkingBuffer = ''
    return output
  }

  // 流式处理结束时刷新缓冲区，返回剩余内容
  const flushThinkingBuffer = () => {
    const remaining = thinkingBuffer
    thinkingBuffer = ''
    inThinkingBlock = false
    return remaining
  }

  const callModelStream = async (modelId, prompt, systemPrompt, history = [], onChunk, options = {}, requestSignal = undefined, retryCount = 0) => {
    const model = availableModels.find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    // 重置思考过滤状态
    resetThinkingState();

    try {
      const response = await fetch(model.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey}`
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: prompt }
          ],
          stream: true,
          max_tokens: options.max_tokens || 4096,
          temperature: options.temperature || 0.7
        }),
        signal: requestSignal || (abortController.value ? abortController.value.signal : undefined)
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sseParser = createSseLineParser((payload) => {
        try {
          const data = JSON.parse(payload);
          const delta = data.choices?.[0]?.delta || {};
          const rawContent = delta.content || '';

          if (rawContent) {
            const content = safeChunkToString(rawContent);
            const filteredContent = filterThinkingContentStream(content);
            if (filteredContent && filteredContent !== '[object Object]') onChunk(filteredContent);
          }
        } catch {
          // Ignore malformed partial payloads and continue streaming.
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sseParser.push(chunk);
        if (sseParser.isDone()) break;
      }
      if (!sseParser.isDone()) {
        sseParser.push(decoder.decode());
        sseParser.flush();
      }

      // 流式处理结束，刷新缓冲区并输出剩余内容
      const remainingContent = flushThinkingBuffer();
      if (remainingContent && remainingContent !== '[object Object]') {
        onChunk(remainingContent);
      }
    } catch (error) {
      if (retryCount < 1 && error.name !== 'AbortError') {
        logger.warn('boh-ai', `Model ${modelId} failed (Stream), trying fallback`, error);
        const fallbackModel = getFallbackModel(modelId);
        if (fallbackModel && fallbackModel.id !== modelId) {
          await callModelStream(fallbackModel.id, prompt, systemPrompt, history, onChunk, options, requestSignal, retryCount + 1);
          return;
        }
      }
      throw error;
    }
  };

  // Helper: Smart Context (Dynamic Compression)
  const _getSmartContext = async (messages, requestSignal = undefined) => {
    if (messages.length <= 10) {
      return messages.slice(-MAX_CONTEXT_MESSAGES).map(m => ({ role: m.role, content: m.content }));
    }

    const olderMessages = messages.slice(0, -5);
    const recentMessages = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));

    try {
      const summaryPrompt = `
      Please summarize the following conversation history into a concise paragraph (max 300 words).
      Focus on the core user requirements, project goals, and key decisions.
      
      History:
      ${olderMessages.map(m => `${m.role}: ${m.content}`).join('\n')}
      `;

      const summaryModel = availableModels.find(m => m.id === 'Qwen/Qwen2.5-7B-Instruct') || availableModels[0];
      const summary = await callModelInternal(summaryModel.id, summaryPrompt, "You are a helpful summarizer.", [], requestSignal);

      return [
        { role: 'system', content: `【Previous Conversation Summary】: ${summary}` },
        ...recentMessages
      ];
    } catch (e) {
      logger.warn('boh-ai', 'Smart Context summary failed, falling back to slice', e);
      return messages.slice(-MAX_CONTEXT_MESSAGES).map(m => ({ role: m.role, content: m.content }));
    }
  };

  // 检测是否是社群相关问题
  const isCommunityQuestion = (text) => {
    const communityKeywords = [
      '方块之家', 'boh', '社区', '成员', 'ryyik', 'lf', '小牛', '橙子', 'eleven',
      '论坛', '帖子', '公告', '活动', '周年庆', '内战', '服务器', '联机',
      '雨芙蕖', '白烨', '丁老师', '汉堡', 'end', '百城', '小天光', '小仙',
      'hypixel', '我的世界', 'minecraft', 'mc', '英雄联盟', 'lol', '王者荣耀'
    ];
    const normalized = normalizeText(text);
    return communityKeywords.some(keyword => normalized.includes(keyword));
  };

  const isCommunityCreativeRequest = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return /(写|生成|创作|改写|润色|设计|起草|文案|口号|标题|祝福|海报|宣传语|故事|诗|歌词|设定|梗图)/.test(normalized);
  };

  const shouldUseForumPosts = (text) => {
    const normalized = normalizeText(text);
    const forumKeywords = [
      '论坛', '帖子', '发帖', '热帖', '最新', '最近', '动态', '讨论', '公告', '活动', '大家在聊'
    ];
    const asksRealtime = /(现在|最近|最新|今天|近期)/.test(normalized) && isCommunityQuestion(normalized);
    if (isOperationQuestion(normalized)) return false;
    return asksRealtime || forumKeywords.some((keyword) => normalized.includes(keyword));
  };

  const shouldUseMemoryContext = (text) => {
    if (isOperationQuestion(text)) return false;
    return isCommunityQuestion(text);
  };

  const buildKnowledgeContextBlock = (title, chunks, { citationPrefix = 'K' } = {}) => {
    if (!chunks || chunks.length === 0) return '';
    const body = chunks
      .map((chunk, index) => `[${citationPrefix}${index + 1}] ${trimKnowledgeChunk(chunk)}`)
      .join('\n\n');
    return `【${title}】\n${body}`;
  };

  const getVectorKnowledgeChunks = async (queryText, {
    sourceTypes = ['shared_memory'],
    limit = 8,
    syncLimit = 40,
    minSimilarity = 0.18
  } = {}) => {
    const safeQuery = normalizePromptLine(queryText, 220);
    if (!safeQuery) return [];

    const result = await searchBohAIKnowledgeForAI({
      query: safeQuery,
      sourceTypes,
      limit,
      syncLimit,
      minSimilarity,
      ensureIndexed: true
    });

    if (!result.ok) {
      logger.warn('boh-ai', '向量检索失败，回退关键词检索', result.error?.message || result.error);
      return [];
    }

    const chunks = Array.isArray(result.data?.chunks) ? result.data.chunks : [];
    return chunks.filter((chunk) => normalizePromptLine(chunk?.content, 20));
  };

  const buildVectorKnowledgeContext = (title, chunks, {
    citationPrefix = 'V',
    maxItems = 8,
    maxContentChars = 320
  } = {}) => {
    const source = Array.isArray(chunks) ? chunks.slice(0, maxItems) : [];
    if (source.length === 0) return '';

    const body = source.map((chunk, index) => {
      const metadata = chunk?.metadata && typeof chunk.metadata === 'object' ? chunk.metadata : {};
      const content = normalizePromptLine(chunk?.content, maxContentChars);
      const chunkTitle = normalizePromptLine(chunk?.title, 80);
      const time = normalizePromptLine(metadata.updatedAt || metadata.entryDate || chunk?.updated_at, 40) || '未知';
      const mood = normalizePromptLine(metadata.mood, 24);
      const tags = Array.isArray(metadata.tags) && metadata.tags.length > 0
        ? metadata.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '';
      const similarity = Number(chunk?.similarity);
      const retrievalMethod = normalizePromptLine(
        metadata.retrievalMethod || chunk?.retrievalMethod,
        20
      );
      const scoreText = Number.isFinite(similarity) && similarity > 0
        ? `\n相关度: ${Math.round(similarity * 100)}%`
        : '';
      const methodText = retrievalMethod ? `\n检索: ${retrievalMethod}` : '';
      const titleText = chunkTitle ? `\n标题: ${chunkTitle}` : '';
      const moodText = mood ? `\n心情: ${mood}` : '';
      const tagsText = tags ? `\n标签: ${tags}` : '';
      return `[${citationPrefix}${index + 1}] 时间: ${time}${titleText}${moodText}${tagsText}${scoreText}${methodText}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return `【${title}】\n${body}`;
  };

  const getMemoryContext = async (queryText) => {
    const vectorChunks = await getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['core_memory', 'knowledge_base'],
      limit: Math.max(MEMORY_MAX_CHUNKS, 8),
      syncLimit: 60,
      minSimilarity: 0.1
    });
    if (vectorChunks.length > 0) {
      return buildVectorKnowledgeContext('官方事实与导入知识库语义检索结果', vectorChunks, {
        citationPrefix: 'K',
        maxItems: MEMORY_MAX_CHUNKS,
        maxContentChars: 520
      });
    }

    const memory = await getAIMemory();
    if (!memory) return '';
    const chunks = selectRelevantChunks(memory, queryText, MEMORY_MAX_CHUNKS);
    return buildKnowledgeContextBlock('核心记忆库检索结果', chunks, { citationPrefix: 'K' });
  };

  const shouldUseSharedMemoryContext = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    if (isOperationQuestion(normalized)) return false;

    // 先做关键词判断：只有“可能涉及公共记忆事实”的问题才触发共享记忆检索。
    if (containsAnyKeyword(normalized, SHARED_MEMORY_TRIGGER_KEYWORDS)) {
      return true;
    }

    if (!isCommunityQuestion(normalized)) {
      return false;
    }

    const memoryJudgementPattern = /(谁|什么|发生|提到|记得|之前|曾经|最近|历史|往事|来源|细节|介绍)/;
    return memoryJudgementPattern.test(normalized);
  };

  const getSharedMemoriesCached = async () => {
    const now = Date.now();
    const shouldUseCache = (now - sharedMemoryCache.fetchedAt) < SHARED_MEMORY_CACHE_TTL_MS
      && Array.isArray(sharedMemoryCache.items);

    if (shouldUseCache) {
      return sharedMemoryCache.items;
    }

    const result = await getSharedAIMemoriesForAI({ limit: SHARED_MEMORY_LIMIT });
    if (!result.ok) {
      logger.warn('boh-ai', '读取 AI 公共记忆失败', result.error?.message || result.error);
      sharedMemoryCache.fetchedAt = now;
      sharedMemoryCache.items = [];
      return [];
    }

    const items = Array.isArray(result.data) ? result.data : [];
    sharedMemoryCache.fetchedAt = now;
    sharedMemoryCache.items = items;
    return items;
  };

  const selectSharedMemoriesByQuery = (memories, queryText, maxItems = SHARED_MEMORY_CONTEXT_MAX_ITEMS) => {
    const source = Array.isArray(memories) ? memories : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    const scored = source.map((item) => {
      const content = normalizePromptLine(item?.content, SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24);
      const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
      const merged = `${content}\n${mood}\n${tags}`;
      return {
        item,
        score: scoreChunk(merged, keywords)
      };
    });

    const matched = scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map((entry) => entry.item);

    if (matched.length > 0) return matched;
    return [];
  };

  const getSharedMemoriesByQuery = async (queryText = '', { limit = SHARED_MEMORY_SEARCH_FETCH_LIMIT } = {}) => {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(60, Math.trunc(limit)))
      : SHARED_MEMORY_SEARCH_FETCH_LIMIT;
    const safeQuery = normalizePromptLine(queryText, 220);
    const cacheKey = normalizeText(safeQuery) || '__empty_query__';
    const now = Date.now();
    const cached = sharedMemorySearchCache.get(cacheKey);
    if (cached && (now - cached.fetchedAt) < SHARED_MEMORY_CACHE_TTL_MS && Array.isArray(cached.items)) {
      return cached.items;
    }

    if (safeQuery) {
      const searchResult = await searchSharedAIMemoriesForAI({
        query: safeQuery,
        limit: safeLimit
      });
      if (searchResult.ok && Array.isArray(searchResult.data)) {
        sharedMemorySearchCache.set(cacheKey, {
          fetchedAt: now,
          items: searchResult.data
        });
        return searchResult.data;
      }
      if (!searchResult.ok) {
        logger.warn('boh-ai', '共享记忆搜索 RPC 失败，回退本地筛选', searchResult.error?.message || searchResult.error);
      }
    }

    const fallbackSource = await getSharedMemoriesCached();
    const fallbackItems = safeQuery
      ? selectSharedMemoriesByQuery(fallbackSource, safeQuery, safeLimit)
      : fallbackSource.slice(0, safeLimit);
    sharedMemorySearchCache.set(cacheKey, {
      fetchedAt: now,
      items: fallbackItems
    });
    return fallbackItems;
  };

  const getSharedMemoryContext = async (queryText) => {
    const vectorChunks = await getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['shared_memory'],
      limit: SHARED_MEMORY_CONTEXT_MAX_ITEMS,
      syncLimit: SHARED_MEMORY_SEARCH_FETCH_LIMIT,
      minSimilarity: 0.12
    });
    if (vectorChunks.length > 0) {
      return {
        context: buildVectorKnowledgeContext('AI公共记忆库语义检索结果', vectorChunks, {
          citationPrefix: 'S',
          maxItems: SHARED_MEMORY_CONTEXT_MAX_ITEMS,
          maxContentChars: SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS
        }),
        total: vectorChunks.length
      };
    }

    const memories = await getSharedMemoriesByQuery(queryText, { limit: SHARED_MEMORY_SEARCH_FETCH_LIMIT });
    if (!Array.isArray(memories) || memories.length === 0) {
      return { context: '', total: 0 };
    }

    const selected = selectSharedMemoriesByQuery(memories, queryText, SHARED_MEMORY_CONTEXT_MAX_ITEMS);
    if (selected.length === 0) {
      return { context: '', total: 0 };
    }

    const body = selected.map((item, index) => {
      const content = normalizePromptLine(item?.content, SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24) || '未标注';
      const tags = Array.isArray(item?.tags) && item.tags.length > 0
        ? item.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '无';
      const time = normalizePromptLine(item?.updatedAt || item?.createdAt, 40) || '未知';
      return `[S${index + 1}] 时间: ${time}\n心情: ${mood}\n标签: ${tags}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【AI公共记忆库检索结果】\n${body}`,
      total: selected.length
    };
  };

  const getSiteGuideContext = (queryText) => {
    const chunks = selectRelevantChunks(SITE_OPERATION_MEMORY, queryText, SITE_GUIDE_MAX_CHUNKS);
    return buildKnowledgeContextBlock('站点操作与路径知识库', chunks, { citationPrefix: 'G' });
  };

  const isTreeholeReflectionQuestion = (text) => {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    if (isOperationQuestion(normalized)) return false;

    const explicitKeywords = [
      'note', '日记', '笔记', '记录', '记忆', '复盘', '回顾', '总结我', '我的情况', '我的状态',
      '我的情绪', '我的习惯', '我最近', '我一直', '我总是', '给我建议', '我的计划'
    ];
    if (explicitKeywords.some((keyword) => normalized.includes(keyword))) {
      return true;
    }

    const reflectivePattern = /(我|我的|自己).*(最近|一直|总是|复盘|回顾|习惯|情绪|状态|变化|记录|记忆|总结|日记|笔记)/;
    return reflectivePattern.test(normalized);
  };

  const shouldUseTreeholeContext = (text) => {
    if (!isTreeholeMemoryEnabled.value) return false;
    if (!isLoggedIn.value || !userInfo.value?.id) return false;
    return isTreeholeReflectionQuestion(text);
  };

  const resolveKnowledgeRoutingPlan = (queryText) => {
    const normalized = normalizeText(queryText);
    const operation = isOperationQuestion(normalized);
    const community = isCommunityQuestion(normalized);
    const forumRealtime = community && ROUTING_FORUM_REALTIME_PATTERN.test(normalized);
    const communityHistory = community && ROUTING_HISTORY_FACT_PATTERN.test(normalized);
    const userPrivatePlan = resolveUserPrivateRetrievalPlan(normalized);
    const hasSharedMemoryTrigger = containsAnyKeyword(normalized, SHARED_MEMORY_TRIGGER_KEYWORDS);

    const basePlan = {
      treehole: shouldUseTreeholeContext(normalized),
      sharedMemory: shouldUseSharedMemoryContext(normalized),
      memory: shouldUseMemoryContext(normalized),
      siteGuide: shouldUseSiteGuide(normalized),
      forum: shouldUseForumPosts(normalized),
      userPrivate: userPrivatePlan.shouldUse
    };

    return resolveKnowledgeRoutingPlanCore({
      basePlan,
      operation,
      community,
      forumRealtime,
      communityHistory,
      hasSharedMemoryTrigger
    });
  };

  const summarizeThinkingSubject = (text) => {
    const normalized = normalizePromptLine(text, 28);
    if (!normalized) return '这个问题';
    return normalized.length >= 28 ? `${normalized.slice(0, 25)}...` : normalized;
  };

  const getRetrievalTargetLabels = (plan = {}) => {
    const labels = [];
    if (plan.forum) labels.push('社区帖子');
    if (plan.memory) labels.push('核心记忆库/导入知识库');
    if (plan.sharedMemory) labels.push('AI 公共记忆');
    if (plan.siteGuide) labels.push('站点操作手册');
    if (plan.treehole) labels.push('BOH Cloud+');
    if (plan.userPrivate) labels.push('当前账号资料');
    return labels;
  };

  const buildVisibleRetrievalActionNote = (retrievalPlan = {}, {
    treeholeTotal = 0,
    sharedMemoryTotal = 0,
    userPrivateLabels = []
  } = {}) => {
    const parts = [];
    if (retrievalPlan.treehole) {
      parts.push(treeholeTotal > 0 ? `看了你的 BOH Cloud+ ${treeholeTotal} 条内容` : '看了你的 BOH Cloud+');
    }
    if (retrievalPlan.memory) parts.push('查看了 BOH 历史背景与导入知识库');
    if (retrievalPlan.sharedMemory) {
      parts.push(sharedMemoryTotal > 0 ? `查看了公共记忆库 ${sharedMemoryTotal} 条内容` : '查看了公共记忆库');
    }
    if (retrievalPlan.forum) parts.push('浏览了社区帖子');
    if (retrievalPlan.siteGuide) parts.push('查看了站点操作手册');
    if (retrievalPlan.userPrivate) {
      const labelText = Array.isArray(userPrivateLabels) && userPrivateLabels.length > 0
        ? userPrivateLabels.slice(0, 2).join('、')
        : '当前账号资料';
      parts.push(`查看了${labelText}`);
    }
    if (parts.length === 0) return '';
    return `${parts.join('，')}。`;
  };

  const getTreeholeMemoriesCached = async () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      treeholeMemoryCache.userId = '';
      treeholeMemoryCache.fetchedAt = 0;
      treeholeMemoryCache.items = [];
      return [];
    }

    const now = Date.now();
    const shouldUseCache = treeholeMemoryCache.userId === userId
      && (now - treeholeMemoryCache.fetchedAt) < TREEHOLE_MEMORY_CACHE_TTL_MS
      && Array.isArray(treeholeMemoryCache.items);

    if (shouldUseCache) {
      return treeholeMemoryCache.items;
    }

    const result = await getMyCloudEntriesForAI(userId, { limit: TREEHOLE_MEMORY_LIMIT });
    if (!result.ok) {
      logger.warn('boh-ai', '读取 BOH Cloud+ 上下文失败', result.error?.message || result.error);
      treeholeMemoryCache.userId = userId;
      treeholeMemoryCache.fetchedAt = now;
      treeholeMemoryCache.items = [];
      return [];
    }

    const items = Array.isArray(result.data) ? result.data : [];
    treeholeMemoryCache.userId = userId;
    treeholeMemoryCache.fetchedAt = now;
    treeholeMemoryCache.items = items;
    return items;
  };

  const selectTreeholeMemoriesByQuery = (memories, queryText) => {
    const source = Array.isArray(memories) ? memories : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    if (keywords.length === 0) {
      return source.slice(0, TREEHOLE_CONTEXT_MAX_ITEMS);
    }

    const scored = source
      .map((item, index) => {
        const content = normalizePromptLine(item?.content, TREEHOLE_CONTEXT_MAX_ITEM_CHARS);
        const mood = normalizePromptLine(item?.mood, 24);
        const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
        const title = normalizePromptLine(item?.title, 80);
        return {
          item,
          index,
          score: scoreChunk(`${title}\n${content}\n${mood}\n${tags}`, keywords)
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, TREEHOLE_CONTEXT_MAX_ITEMS)
      .map((entry) => entry.item);

    return scored.length > 0 ? scored : source.slice(0, TREEHOLE_CONTEXT_MAX_ITEMS);
  };

  const getTreeholeContext = async (queryText) => {
    const vectorChunks = await getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['cloud_entry'],
      limit: Math.min(12, TREEHOLE_CONTEXT_MAX_ITEMS),
      syncLimit: Math.min(80, TREEHOLE_MEMORY_LIMIT)
    });
    if (vectorChunks.length > 0) {
      return {
        context: buildVectorKnowledgeContext('用户 BOH Cloud+ 语义检索结果', vectorChunks, {
          citationPrefix: 'T',
          maxItems: Math.min(12, TREEHOLE_CONTEXT_MAX_ITEMS),
          maxContentChars: TREEHOLE_CONTEXT_MAX_ITEM_CHARS
        }),
        total: vectorChunks.length
      };
    }

    const memories = await getTreeholeMemoriesCached();
    if (!Array.isArray(memories) || memories.length === 0) {
      return { context: '', total: 0 };
    }

    const selected = selectTreeholeMemoriesByQuery(memories, queryText);
    if (selected.length === 0) {
      return { context: '', total: memories.length };
    }

    const body = selected.map((item, index) => {
      const content = normalizePromptLine(item?.content, TREEHOLE_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24) || '未标注';
      const tags = Array.isArray(item?.tags) && item.tags.length > 0
        ? item.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '无';
      const time = normalizePromptLine(item?.updatedAt || item?.createdAt, 40) || '未知';
      return `[T${index + 1}] 时间: ${time}\n心情: ${mood}\n标签: ${tags}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【用户 BOH Cloud+ 全部内容】\n${body}`,
      total: memories.length
    };
  };

  const rankForumPostsByQuery = (posts, queryText) => {
    const keywords = extractQueryKeywords(queryText);
    return [...posts]
      .map((post) => {
        const content = String(post?.content || '');
        const parsed = parsePostTitleAndBody(content);
        const merged = `${parsed.title}\n${parsed.body}`;
        return {
          post,
          score: scoreChunk(merged, keywords)
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.post);
  };

  // 获取论坛数据
  const getForumContext = async (queryText = '') => {
    try {
      const { data: posts } = await getPosts(null, { page: 1, pageSize: 12, limit: 12 });
      if (!Array.isArray(posts) || posts.length === 0) return '';

      const rankedPosts = rankForumPostsByQuery(posts, queryText);
      const selectedPosts = rankedPosts.slice(0, FORUM_MAX_POSTS);
      const forumContext = selectedPosts.map((post, index) => {
        const parsed = parsePostTitleAndBody(post?.content);
        const title = parsed.title || '无标题';
        const author = String(post?.author_username || '未知作者');
        const preview = String(parsed.body || '').slice(0, FORUM_MAX_CHARS_PER_POST);
        const likes = Number(post?.like_count || post?.likes_count || 0);
        const comments = Number(post?.comment_count || 0);
        return `[F${index + 1}] 【帖子】${title}\n作者：${author}\n内容：${preview}${parsed.body.length > FORUM_MAX_CHARS_PER_POST ? '...' : ''}\n点赞：${likes}  评论：${comments}`;
      }).join('\n\n');

      return `【社区帖子检索结果】\n${forumContext}`;
    } catch (error) {
      logger.error('boh-ai', '获取论坛数据失败', error);
      return '';
    }
  };

  const resolveUserPrivateRetrievalPlan = (queryText = '') => {
    const normalized = normalizeText(queryText);
    if (!normalized) {
      return {
        shouldUse: false,
        overview: false,
        posts: false,
        mailbox: false,
        gifts: false,
        birthday: false,
        pushplus: false,
        subscriptions: false
      };
    }

    const hasPersonalPronoun = USER_PRIVATE_PERSONAL_PATTERN.test(normalized);
    const asksSummary = containsAnyKeyword(normalized, USER_PRIVATE_SUMMARY_KEYWORDS)
      || (hasPersonalPronoun && /(信息|资料|状态|情况|数据|内容|账户|账号)/.test(normalized));
    const asksAll = (asksSummary || hasPersonalPronoun)
      && containsAnyKeyword(normalized, USER_PRIVATE_ALL_KEYWORDS);

    const posts = containsAnyKeyword(normalized, USER_PRIVATE_POST_KEYWORDS)
      || (hasPersonalPronoun && /(帖子|发帖|论坛)/.test(normalized));
    const mailbox = containsAnyKeyword(normalized, USER_PRIVATE_MAIL_KEYWORDS)
      || (hasPersonalPronoun && /(邮件|信件|私信|消息|收件箱|发件)/.test(normalized));
    const gifts = containsAnyKeyword(normalized, USER_PRIVATE_GIFT_KEYWORDS)
      || (hasPersonalPronoun && /(礼物|礼品)/.test(normalized));
    const birthday = containsAnyKeyword(normalized, USER_PRIVATE_BIRTHDAY_KEYWORDS)
      || (hasPersonalPronoun && /生日/.test(normalized));
    const pushplus = containsAnyKeyword(normalized, USER_PRIVATE_PUSHPLUS_KEYWORDS)
      || (hasPersonalPronoun && /推送/.test(normalized));
    const subscriptions = containsAnyKeyword(normalized, USER_PRIVATE_SUBSCRIPTION_KEYWORDS)
      || (hasPersonalPronoun && /(订阅|会员|积分|套餐)/.test(normalized));

    const shouldUseByIntent = asksSummary || asksAll || posts || mailbox || gifts || birthday || pushplus || subscriptions;
    if (!shouldUseByIntent) {
      return {
        shouldUse: false,
        overview: false,
        posts: false,
        mailbox: false,
        gifts: false,
        birthday: false,
        pushplus: false,
        subscriptions: false
      };
    }

    // “如何发帖”等纯操作问题优先走站点操作知识，不触发用户私域读库。
    if (
      isOperationQuestion(normalized)
      && !asksSummary
      && !asksAll
      && !mailbox
      && !gifts
      && !birthday
      && !pushplus
      && !subscriptions
      && !containsAnyKeyword(normalized, ['我的帖子', '我发的帖子', '我的发帖'])
    ) {
      return {
        shouldUse: false,
        overview: false,
        posts: false,
        mailbox: false,
        gifts: false,
        birthday: false,
        pushplus: false,
        subscriptions: false
      };
    }

    return {
      shouldUse: true,
      overview: asksSummary || asksAll || posts || mailbox || gifts || birthday || pushplus || subscriptions,
      posts: asksAll || posts,
      mailbox: asksAll || mailbox,
      gifts: asksAll || gifts,
      birthday: asksAll || birthday,
      pushplus: asksAll || pushplus,
      subscriptions: asksAll || subscriptions
    };
  };

  const getUserPrivateSnapshotCached = async () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      resetUserPrivateContextCache();
      return null;
    }

    const now = Date.now();
    const shouldUseCache = userPrivateContextCache.userId === userId
      && (now - userPrivateContextCache.fetchedAt) < USER_PRIVATE_CONTEXT_CACHE_TTL_MS
      && userPrivateContextCache.snapshot;
    if (shouldUseCache) {
      return userPrivateContextCache.snapshot;
    }

    const [
      profileResult,
      postResult,
      messageResult,
      giftResult,
      subscriptionResult
    ] = await Promise.allSettled([
      supabase
        .from('profiles')
        .select(`
          id,
          username,
          role,
          points,
          join_date,
          birth_month,
          birth_day,
          pushplus_enabled,
          gift_status,
          gift_content,
          gift_no,
          gift_price
        `)
        .eq('id', userId)
        .maybeSingle(),
      getUserPosts(userId, userId, { page: 1, pageSize: USER_PRIVATE_POSTS_FETCH_LIMIT, limit: USER_PRIVATE_POSTS_FETCH_LIMIT }),
      supabase
        .from('messages')
        .select(`
          id,
          sender_id,
          sender_name,
          receiver_id,
          receiver_name,
          subject,
          content,
          status,
          moderation_status,
          created_at
        `)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(USER_PRIVATE_MAIL_FETCH_LIMIT),
      supabase
        .from('user_gifts')
        .select(`
          id,
          user_id,
          gift_no,
          gift_content,
          gift_price,
          gift_status,
          is_active,
          completed_at,
          created_at,
          updated_at
        `)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(USER_PRIVATE_GIFTS_FETCH_LIMIT),
      getMySubscriptions(userId, { includeExpired: true })
    ]);

    const profileValue = profileResult.status === 'fulfilled' ? profileResult.value : null;
    if (profileValue?.error && !isMissingRelationError(profileValue.error, 'profiles')) {
      logger.warn('boh-ai', '读取当前用户档案失败', profileValue.error?.message || profileValue.error);
    }

    const postValue = postResult.status === 'fulfilled' ? postResult.value : null;
    if (postValue?.error && !isMissingRelationError(postValue.error, 'posts')) {
      logger.warn('boh-ai', '读取当前用户帖子失败', postValue.error?.message || postValue.error);
    }

    const messageValue = messageResult.status === 'fulfilled' ? messageResult.value : null;
    if (messageValue?.error && !isMissingRelationError(messageValue.error, 'messages')) {
      logger.warn('boh-ai', '读取当前用户邮件失败', messageValue.error?.message || messageValue.error);
    }

    const giftValue = giftResult.status === 'fulfilled' ? giftResult.value : null;
    if (giftValue?.error && !isMissingRelationError(giftValue.error, 'user_gifts')) {
      logger.warn('boh-ai', '读取当前用户礼物失败', giftValue.error?.message || giftValue.error);
    }

    const subscriptionValue = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
    if (subscriptionValue?.error && !isMissingRelationError(subscriptionValue.error, 'user_subscriptions')) {
      logger.warn('boh-ai', '读取当前用户订阅失败', subscriptionValue.error?.message || subscriptionValue.error);
    }

    const mergedProfile = {
      id: userId,
      username: String(userInfo.value?.username || ''),
      role: String(userInfo.value?.role || 'user'),
      points: Number(userInfo.value?.points || 0),
      join_date: userInfo.value?.joinDate || null,
      birth_month: userInfo.value?.birthMonth || '',
      birth_day: userInfo.value?.birthDay || '',
      pushplus_enabled: false,
      gift_status: '',
      gift_content: '',
      gift_no: '',
      gift_price: 0,
      ...(profileValue?.data || {})
    };
    mergedProfile.points = Number(mergedProfile.points || 0);
    mergedProfile.gift_price = Number(mergedProfile.gift_price || 0);
    mergedProfile.pushplus_enabled = Boolean(mergedProfile.pushplus_enabled);

    const snapshot = {
      userId,
      profile: mergedProfile,
      posts: Array.isArray(postValue?.data) ? postValue.data : [],
      messages: Array.isArray(messageValue?.data) ? messageValue.data : [],
      gifts: Array.isArray(giftValue?.data) ? giftValue.data : [],
      subscriptions: Array.isArray(subscriptionValue?.data) ? subscriptionValue.data : []
    };

    userPrivateContextCache.userId = userId;
    userPrivateContextCache.fetchedAt = now;
    userPrivateContextCache.snapshot = snapshot;
    return snapshot;
  };

  const selectItemsByQuery = (items, queryText, projector, maxItems = USER_PRIVATE_CONTEXT_MAX_ITEMS) => {
    const source = Array.isArray(items) ? items : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    if (keywords.length === 0) {
      return source.slice(0, maxItems);
    }

    const scored = source.map((item) => ({
      item,
      score: scoreChunk(String(projector(item) || ''), keywords)
    }));

    const matched = scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map((entry) => entry.item);

    if (matched.length > 0) return matched;
    return source.slice(0, maxItems);
  };

  const getUserOverviewContext = (snapshot) => {
    const profile = snapshot?.profile || {};
    const username = normalizePromptLine(profile?.username, 32) || '未知';
    const role = normalizePromptLine(profile?.role, 16) || 'user';
    const points = Number(profile?.points || 0);
    const joinDate = formatPromptDate(profile?.join_date, '未知');

    return {
      context: `【当前登录用户概览】\n用户名: ${username}\n角色: ${role}\n当前积分: ${points}\n加入时间: ${joinDate}`,
      label: '当前用户概览'
    };
  };

  const getUserPostsPrivateContext = (snapshot, queryText) => {
    const posts = Array.isArray(snapshot?.posts) ? snapshot.posts : [];
    const selected = selectItemsByQuery(
      posts,
      queryText,
      (post) => {
        const parsed = parsePostTitleAndBody(post?.content);
        return `${parsed.title}\n${parsed.body}`;
      }
    );

    if (posts.length === 0) {
      return {
        context: '【当前用户发帖记录】\n当前账号暂无发帖记录。',
        total: 0,
        label: '我的帖子(0条)'
      };
    }

    const body = selected.map((post, index) => {
      const parsed = parsePostTitleAndBody(post?.content);
      const preview = normalizePromptLine(parsed.body, USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS);
      const time = formatPromptDate(post?.created_at, '未知');
      const likes = Number(post?.like_count || post?.likes_count || 0);
      const comments = Number(post?.comment_count || 0);
      const status = normalizePromptLine(post?.status, 12) || 'approved';
      return `[${index + 1}] ${parsed.title}\n时间: ${time}  状态: ${status}\n互动: 点赞 ${likes} / 评论 ${comments}\n内容: ${preview || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【当前用户发帖记录】\n总帖数: ${posts.length}\n${body}`,
      total: posts.length,
      label: `我的帖子(${posts.length}条)`
    };
  };

  const getUserMailboxPrivateContext = (snapshot, queryText) => {
    const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
    const userId = String(snapshot?.userId || '');
    const isVisibleInboxMail = (mail) => isModerationApproved(mail?.moderation_status);

    const inbox = messages
      .filter((mail) => String(mail?.receiver_id || '') === userId)
      .filter(isVisibleInboxMail);
    const sent = messages
      .filter((mail) => String(mail?.sender_id || '') === userId)
      .filter(isVisibleInboxMail);
    const unreadCount = inbox.filter((mail) => String(mail?.status || '').toLowerCase() === 'unread').length;
    const combined = [...inbox, ...sent];

    if (combined.length === 0) {
      return {
        context: '【当前用户邮件/私信】\n当前账号暂无邮件记录。',
        unreadCount: 0,
        total: 0,
        label: '邮箱(0封)'
      };
    }

    const selected = selectItemsByQuery(
      combined,
      queryText,
      (mail) => `${mail?.subject || ''}\n${mail?.content || ''}\n${mail?.sender_name || ''}\n${mail?.receiver_name || ''}`
    );

    const body = selected.map((mail, index) => {
      const isInbox = String(mail?.receiver_id || '') === userId;
      const direction = isInbox ? '收件' : '发件';
      const peerName = isInbox
        ? normalizePromptLine(mail?.sender_name, 24) || '未知'
        : normalizePromptLine(mail?.receiver_name, 24) || '未知';
      const subject = normalizePromptLine(mail?.subject, 40) || '(无主题)';
      const preview = normalizePromptLine(mail?.content, USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS) || '（空）';
      const status = normalizePromptLine(mail?.status, 12) || 'unknown';
      const time = formatPromptDate(mail?.created_at, '未知');
      return `[${index + 1}] ${direction} / 对方: ${peerName}\n主题: ${subject}\n状态: ${status}  时间: ${time}\n内容: ${preview}`;
    }).join('\n\n');

    return {
      context: `【当前用户邮件/私信】\n收件箱: ${inbox.length} 封（未读 ${unreadCount}）\n已发送: ${sent.length} 封\n${body}`,
      unreadCount,
      total: combined.length,
      label: unreadCount > 0 ? `邮箱(未读${unreadCount}封)` : `邮箱(${combined.length}封)`
    };
  };

  const getUserGiftPrivateContext = (snapshot) => {
    const gifts = Array.isArray(snapshot?.gifts) ? snapshot.gifts : [];
    const profile = snapshot?.profile || {};
    let source = gifts;

    if (source.length === 0 && profile?.gift_content) {
      source = [{
        id: 'profile_fallback',
        gift_no: profile?.gift_no || '未知',
        gift_content: profile?.gift_content || '',
        gift_price: profile?.gift_price || 0,
        gift_status: profile?.gift_status || 'preparing',
        is_active: true,
        updated_at: null,
        created_at: null
      }];
    }

    if (source.length === 0) {
      return {
        context: '【当前用户礼物状态】\n当前账号暂无礼物记录。',
        total: 0,
        activeCount: 0,
        label: '礼物(0条)'
      };
    }

    const active = source.filter((gift) => Boolean(gift?.is_active));
    const ordered = [
      ...active,
      ...source.filter((gift) => !gift?.is_active)
    ].slice(0, USER_PRIVATE_CONTEXT_MAX_ITEMS);

    const body = ordered.map((gift, index) => {
      const content = normalizePromptLine(gift?.gift_content, 42) || '未命名礼物';
      const statusKey = String(gift?.gift_status || 'preparing').toLowerCase();
      const status = GIFT_STATUS_LABELS[statusKey] || statusKey || '未知';
      const price = Number(gift?.gift_price || 0);
      const updatedAt = formatPromptDate(gift?.updated_at || gift?.created_at || gift?.completed_at, '未知');
      const stage = gift?.is_active ? '进行中' : '历史';
      const giftNo = normalizePromptLine(gift?.gift_no, 24) || '未知';
      return `[${index + 1}] ${content}\n编号: ${giftNo}\n状态: ${status} (${stage})  金额: ${price}\n更新时间: ${updatedAt}`;
    }).join('\n\n');

    return {
      context: `【当前用户礼物状态】\n总记录: ${source.length}\n进行中: ${active.length}\n${body}`,
      total: source.length,
      activeCount: active.length,
      label: active.length > 0 ? `礼物(进行中${active.length})` : `礼物(${source.length}条)`
    };
  };

  const getUserBirthdayPrivateContext = (snapshot) => {
    const profile = snapshot?.profile || {};
    const countdown = getBirthdayCountdown(profile?.birth_month, profile?.birth_day);

    if (!countdown) {
      return {
        context: '【当前用户生日会信息】\n当前账号尚未设置生日（月/日），可前往个人资料补充后启用生日会提醒。',
        label: '生日会(未设置)'
      };
    }

    const daysHint = countdown.daysUntil === 0
      ? '就是今天'
      : `${countdown.daysUntil} 天后`;

    return {
      context: `【当前用户生日会信息】\n生日: ${countdown.month} 月 ${countdown.day} 日\n下一个生日: ${countdown.nextDate}（${daysHint}）`,
      label: countdown.daysUntil === 0 ? '生日会(今天)' : '生日会'
    };
  };

  const getUserPushplusPrivateContext = (snapshot) => {
    const profile = snapshot?.profile || {};
    const enabled = Boolean(profile?.pushplus_enabled);
    return {
      context: `【当前用户 Pushplus 状态】\nPushplus 离线推送: ${enabled ? '已开启' : '未开启'}`,
      enabled,
      label: enabled ? 'Pushplus(已开启)' : 'Pushplus(未开启)'
    };
  };

  const getUserSubscriptionPrivateContext = (snapshot) => {
    const subscriptions = Array.isArray(snapshot?.subscriptions) ? snapshot.subscriptions : [];
    const nowTs = Date.now();
    const active = subscriptions.filter((item) => {
      if (String(item?.status || '') !== 'active') return false;
      if (!item?.expiresAt) return true;
      const expiresTs = new Date(item.expiresAt).getTime();
      return Number.isFinite(expiresTs) ? expiresTs > nowTs : true;
    });

    const preferred = (active.length > 0 ? active : subscriptions).slice(0, USER_PRIVATE_CONTEXT_MAX_ITEMS);
    const points = Number(snapshot?.profile?.points || 0);

    if (subscriptions.length === 0) {
      return {
        context: `【当前用户订阅与积分】\n当前积分: ${points}\n当前无付费订阅记录。`,
        activeCount: 0,
        label: '订阅(0项)'
      };
    }

    const body = preferred.map((item, index) => {
      const planName = normalizePromptLine(item?.planName || item?.plan_name, 40) || '未知套餐';
      const cycle = formatBillingCycleLabel(item?.billingCycle || item?.billing_cycle);
      const expiresAt = formatPromptDate(item?.expiresAt || item?.expires_at, '未知');
      const statusKey = String(item?.status || '').toLowerCase();
      const status = SUBSCRIPTION_STATUS_LABELS[statusKey] || statusKey || '未知';
      const pointsCost = Number(item?.pointsCost || item?.points_cost || 0);
      return `[${index + 1}] ${planName}\n周期: ${cycle}\n状态: ${status}\n到期: ${expiresAt}\n积分消耗: ${pointsCost}`;
    }).join('\n\n');

    return {
      context: `【当前用户订阅与积分】\n当前积分: ${points}\n订阅记录: ${subscriptions.length} 项（生效中 ${active.length}）\n${body}`,
      activeCount: active.length,
      label: active.length > 0 ? `订阅(生效${active.length}项)` : `订阅(${subscriptions.length}项)`
    };
  };

  const getUserPrivateContext = async (queryText) => {
    const plan = resolveUserPrivateRetrievalPlan(queryText);
    if (!plan.shouldUse) {
      return {
        context: '',
        labels: []
      };
    }

    if (!isLoggedIn.value || !userInfo.value?.id) {
      return {
        context: '【用户私域证据 [U1]】\n未检测到登录用户。若需要查询“我的帖子/邮件/礼物/生日会/Pushplus/订阅积分”，请先登录账号。',
        labels: ['登录状态(未登录)']
      };
    }

    const snapshot = await getUserPrivateSnapshotCached();
    if (!snapshot) {
      return {
        context: '',
        labels: []
      };
    }

    const blocks = [];
    const labels = [];

    if (plan.overview) {
      const result = getUserOverviewContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.posts) {
      const result = getUserPostsPrivateContext(snapshot, queryText);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.mailbox) {
      const result = getUserMailboxPrivateContext(snapshot, queryText);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.gifts) {
      const result = getUserGiftPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.birthday) {
      const result = getUserBirthdayPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.pushplus) {
      const result = getUserPushplusPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.subscriptions) {
      const result = getUserSubscriptionPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    const wrappedBlocks = blocks
      .map((block, index) => `【用户私域证据 [U${index + 1}]】\n${block}`)
      .filter(Boolean);

    return {
      context: wrappedBlocks.join('\n\n'),
      labels
    };
  };

  const createReadConnectors = () => [
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.cloud,
      planKey: 'treehole',
      label: 'BOH Cloud+',
      source: 'BOH Cloud+ 私有内容',
      evidencePrefix: 'T',
      requiresLogin: true,
      read: getTreeholeContext,
      describeAction: (result) => (
        Number(result?.total || 0) > 0
          ? `看了你的 BOH Cloud+ ${Number(result.total)} 条内容`
          : '看了你的 BOH Cloud+'
      )
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.sharedMemory,
      planKey: 'sharedMemory',
      label: 'AI 公共记忆',
      source: 'AI 公共记忆库',
      evidencePrefix: 'S',
      read: getSharedMemoryContext,
      describeAction: (result) => (
        Number(result?.total || 0) > 0
          ? `查看了公共记忆库 ${Number(result.total)} 条内容`
          : '查看了公共记忆库'
      )
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.knowledge,
      planKey: 'memory',
      label: '核心记忆库/导入知识库',
      source: 'BOH 历史背景与导入知识库',
      evidencePrefix: 'K',
      read: getMemoryContext,
      describeAction: () => '查看了 BOH 历史背景与导入知识库'
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.siteGuide,
      planKey: 'siteGuide',
      label: '站点操作手册',
      source: '站点操作与路径知识库',
      evidencePrefix: 'G',
      read: (queryText) => getSiteGuideContext(queryText),
      describeAction: () => '查看了站点操作手册'
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.forum,
      planKey: 'forum',
      label: '社区帖子',
      source: '社区帖子',
      evidencePrefix: 'F',
      read: getForumContext,
      describeAction: () => '浏览了社区帖子'
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.userPrivate,
      planKey: 'userPrivate',
      label: '当前账号资料',
      source: '当前登录用户私域数据',
      evidencePrefix: 'U',
      requiresLogin: true,
      read: getUserPrivateContext,
      describeAction: (result) => {
        const labels = Array.isArray(result?.labels) ? result.labels : [];
        const labelText = labels.length > 0 ? labels.slice(0, 2).join('、') : '当前账号资料';
        return `查看了${labelText}`;
      }
    })
  ];

  const buildAutoKnowledgeContext = async (queryText, { forceTreehole = false } = {}) => {
    const routingDecision = resolveKnowledgeRoutingPlan(queryText);
    const retrievalPlan = routingDecision.plan;
    if (forceTreehole && isLoggedIn.value && userInfo.value?.id && isTreeholeMemoryEnabled.value) {
      retrievalPlan.treehole = true;
    }
    const routingReasons = Array.isArray(routingDecision.reasons) ? routingDecision.reasons : [];
    const connectorResults = await runBohAIReadConnectors({
      connectors: createReadConnectors(),
      plan: retrievalPlan,
      queryText,
      logger
    });
    const connectorSummary = summarizeBohAIConnectorResults(connectorResults);

    const contextText = compressKnowledgeContextBlocks(connectorSummary.contextBlocks, {
      maxChars: KNOWLEDGE_CONTEXT_MAX_CHARS,
      maxPerBlock: KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS
    });
    const evidenceRefs = connectorSummary.evidenceRefs.length > 0
      ? connectorSummary.evidenceRefs
      : extractCitationIdsFromText(contextText);

    return {
      retrievalPlan,
      routingReasons,
      connectorResults,
      treeholeTotal: Number(connectorSummary.totalsById[BOHAI_CONNECTOR_IDS.cloud] || 0),
      sharedMemoryTotal: Number(connectorSummary.totalsById[BOHAI_CONNECTOR_IDS.sharedMemory] || 0),
      userPrivateLabels: connectorSummary.labelsById[BOHAI_CONNECTOR_IDS.userPrivate] || [],
      evidenceRefs,
      contextText
    };
  };

  const buildDialogueMessagesForMemoryCapture = (sessionMessages = []) => {
    return (Array.isArray(sessionMessages) ? sessionMessages : [])
      .filter((item) => item?.meta?.kind !== 'memory_saved_notice')
      .filter((item) => item?.role === 'assistant' || item?.role === 'user')
      .slice(-MEMORY_CAPTURE_CONTEXT_ITEMS)
      .map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: normalizePromptLine(item?.content, 900)
      }))
      .filter((item) => item.content);
  };

  const captureMemoryFromConversation = async ({
    sessionIndex,
    userText,
    assistantText
  } = {}) => {
    const shouldWriteSharedMemory = isMemoryCaptureEnabled.value;
    const shouldWriteTreeholeMemory = false;
    if (!shouldWriteSharedMemory && !shouldWriteTreeholeMemory) return;
    if (!isLoggedIn.value || !userInfo.value?.id) return;

    const safeUserText = String(userText || '').trim();
    const safeAssistantText = String(assistantText || '').trim();
    if (!safeUserText || !safeAssistantText) return;
    if (safeUserText.length < MEMORY_CAPTURE_MIN_USER_CHARS) return;

    const session = getSessionByIndex(sessionIndex);
    if (!session) return;

    const dialogueMessages = buildDialogueMessagesForMemoryCapture(session.messages);
    if (dialogueMessages.length < MEMORY_CAPTURE_MIN_DIALOGUE_ITEMS) return;

    const appendMemorySavedNotice = ({
      savedContents = [],
      treeholeSavedCount = 0,
      pendingCount = 0
    } = {}) => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession) return;

      const items = (Array.isArray(savedContents) ? savedContents : [])
        .map((item) => normalizePromptLine(item, 120))
        .filter(Boolean)
        .slice(0, MEMORY_NOTICE_MAX_ITEMS);

      if (items.length === 0) return;

      const lines = [
        '已保存的记忆',
        ...items.map((item) => `- ${item}`)
      ];
      if (treeholeSavedCount > 0) {
        lines.push(`已写入树洞：${treeholeSavedCount} 条`);
      }
      if (pendingCount > 0) {
        lines.push(`待确认：${pendingCount} 条`);
      }

      targetSession.messages.push({
        role: 'assistant',
        content: lines.join('\n'),
        meta: { kind: 'memory_saved_notice' }
      });
      nextTick(() => scrollToBottom());
    };

    const explicitMemoryContent = extractExplicitMemoryContent(safeUserText);
    if (explicitMemoryContent) {
      let isDuplicate = false;
      if (shouldWriteSharedMemory) {
        const existingShared = await getSharedMemoriesCached();
        isDuplicate = isLikelyMemoryDuplicate(explicitMemoryContent, existingShared);
      }
      if (!isDuplicate && shouldWriteTreeholeMemory) {
        const existingTreehole = await getTreeholeMemoriesCached();
        isDuplicate = isLikelyMemoryDuplicate(explicitMemoryContent, existingTreehole);
      }

      if (!isDuplicate) {
        let sharedSavedCount = 0;
        let treeholeSavedCount = 0;

        if (shouldWriteSharedMemory) {
          const manualSaveResult = await createSharedAIMemory(String(userInfo.value?.id || ''), {
            content: explicitMemoryContent,
            mood: '',
            tags: ['用户指定', '即时记忆'],
            confidence: 1,
            evidence: [{ messageId: 'u_explicit', quote: truncateText(safeUserText, 240) }],
            source: 'manual',
            status: 'active'
          });

          if (manualSaveResult.ok) {
            sharedSavedCount = 1;
            sharedMemoryCache.fetchedAt = 0;
            sharedMemoryCache.items = [];
            resetSharedMemorySearchCache();
          } else {
            logger.warn('boh-ai', '用户指令公共记忆保存失败', manualSaveResult.error?.message || manualSaveResult.error);
          }
        }

        if (shouldWriteTreeholeMemory) {
          const treeholeSaveResult = await createTreeholeMemory(String(userInfo.value?.id || ''), {
            content: explicitMemoryContent,
            mood: '',
            tags: shouldWriteSharedMemory ? ['AI提取', '公共记忆同步'] : ['AI提取', '私密树洞'],
            source: 'ai',
            isStarred: false
          });

          if (treeholeSaveResult.ok) {
            treeholeSavedCount = 1;
            treeholeMemoryCache.userId = '';
            treeholeMemoryCache.fetchedAt = 0;
            treeholeMemoryCache.items = [];
          } else if (treeholeSaveResult.error?.code === 'TREEHOLE_SPACE_REQUIRED') {
            isTreeholeMemoryEnabled.value = false;
            persistTreeholeMemorySetting();
            setMemoryCaptureStatusMessage(treeholeSaveResult.error?.message || '树洞未开启，已自动关闭树洞同步。');
          } else {
            logger.warn('boh-ai', '用户指令树洞记忆保存失败', treeholeSaveResult.error?.message || treeholeSaveResult.error);
          }
        }

        if (sharedSavedCount > 0 || treeholeSavedCount > 0) {
          appendMemorySavedNotice({
            savedContents: [explicitMemoryContent],
            treeholeSavedCount,
            pendingCount: 0
          });
          if (sharedSavedCount > 0 && treeholeSavedCount > 0) {
            setMemoryCaptureStatusMessage('已根据你的明确指令保存 1 条公共记忆，并写入树洞。');
          } else if (sharedSavedCount > 0) {
            setMemoryCaptureStatusMessage('已根据你的明确指令保存 1 条公共记忆。');
          } else if (treeholeSavedCount > 0) {
            setMemoryCaptureStatusMessage('已根据你的明确指令保存 1 条树洞私密记忆。');
          }
        }
      } else {
        setMemoryCaptureStatusMessage('这条记忆已存在，已自动跳过重复保存。');
      }
    }

    const result = await captureTreeholeMemoriesFromDialogue({
      userId: String(userInfo.value?.id || ''),
      sessionId: `${session.timestamp || Date.now()}-${sessionIndex}`,
      messages: dialogueMessages,
      writeToTreehole: shouldWriteTreeholeMemory,
      writeToShared: shouldWriteSharedMemory
    });

    if (!result.ok) {
      if (result.error?.code === 'TREEHOLE_SPACE_REQUIRED') {
        isTreeholeMemoryEnabled.value = false;
        persistTreeholeMemorySetting();
        setMemoryCaptureStatusMessage(result.error?.message || '树洞未开启，已自动关闭树洞同步。');
        return;
      }
      logger.warn('boh-ai', '自动记忆沉淀失败', result.error?.message || result.error);
      return;
    }

    const sharedSavedCount = Number(result.data?.sharedSavedCount || 0);
    const treeholeSavedCount = Number(result.data?.treeholeSavedCount || 0);
    const pendingCount = Number(result.data?.pendingCount || 0);
    const duplicateCount = Number(result.data?.duplicateCount || 0);
    const displayPendingCount = shouldWriteSharedMemory ? pendingCount : 0;
    const savedContents = (Array.isArray(result.data?.items) ? result.data.items : [])
      .filter((item) => item?.status === 'auto_saved' || item?.memoryId || item?.sharedMemoryId)
      .map((item) => item?.content);

    if (sharedSavedCount > 0 || displayPendingCount > 0 || treeholeSavedCount > 0) {
      if (sharedSavedCount > 0) {
        sharedMemoryCache.fetchedAt = 0;
        sharedMemoryCache.items = [];
        resetSharedMemorySearchCache();
      }
      const pendingPart = displayPendingCount > 0 ? `，${displayPendingCount} 条进入待确认` : '';
      if (shouldWriteSharedMemory && shouldWriteTreeholeMemory) {
        setMemoryCaptureStatusMessage(`本轮已写入 AI 公共记忆 ${sharedSavedCount} 条，写入树洞 ${treeholeSavedCount} 条${pendingPart}。`);
      } else if (shouldWriteSharedMemory) {
        setMemoryCaptureStatusMessage(`本轮已写入 AI 公共记忆 ${sharedSavedCount} 条${pendingPart}。`);
      } else {
        setMemoryCaptureStatusMessage(`本轮已写入树洞私密记忆 ${treeholeSavedCount} 条。`);
      }
      appendMemorySavedNotice({
        savedContents,
        treeholeSavedCount,
        pendingCount: displayPendingCount
      });
      return;
    }

    if (duplicateCount > 0) {
      setMemoryCaptureStatusMessage('本轮识别到重复记忆，已自动跳过。');
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.value.trim() || isLoading.value || abortController.value) return;
    if (await handlePendingCloudReferenceConsentReply(inputMessage.value.trim())) return;
    if (await handlePendingSharedMemoryCaptureReply(inputMessage.value.trim())) return;
    if (await handlePendingTreeholeCreationReply(inputMessage.value.trim())) return;
    if (await handlePendingActionDraftReply(inputMessage.value.trim())) return;

    const now = Date.now();

    if (isRateLimited.value) {
      if (now - lastMessageTime.value > BLOCK_DURATION_MS) {
        isRateLimited.value = false;
        messageCount.value = 0;
        windowStartTime.value = now;
        rateLimitMessage.value = '';
      } else {
        const remainingSeconds = Math.ceil((lastMessageTime.value + BLOCK_DURATION_MS - now) / 1000);
        rateLimitMessage.value = `发送频率过高，请休息 ${remainingSeconds} 秒后再试。`;
        return;
      }
    }

    if (now - lastMessageTime.value < MIN_INTERVAL_MS) {
      rateLimitMessage.value = '请勿频繁发送消息，请稍后再试。';
      setTimeout(() => {
        if (!isRateLimited.value) rateLimitMessage.value = '';
      }, 2000);
      return;
    }

    if (now - windowStartTime.value > RATE_LIMIT_WINDOW_MS) {
      messageCount.value = 1;
      windowStartTime.value = now;
    } else {
      messageCount.value++;
    }

    if (messageCount.value > MAX_MESSAGES_PER_WINDOW) {
      isRateLimited.value = true;
      lastMessageTime.value = now;
      rateLimitMessage.value = `发送频率过高，请休息 1 分钟后再试。`;
      return;
    }

    lastMessageTime.value = now;
    rateLimitMessage.value = '';

    if (isCommandMode.value) {
      await handleCommandModeGeneration();
      return;
    }

    const sessionIndex = currentSessionIndex.value;
    const session = getSessionByIndex(sessionIndex);
    if (!session) return;

    const userText = inputMessage.value.trim();
    if (await tryStartActionDraftFromUserInput(userText, sessionIndex)) return;

    appendUserMessageWithTitle(sessionIndex, userText);
    resetComposerInput();
    scrollToBottom(true);

    session.isLoading = true;
    session.isThinking = true;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();
    const preflightController = new AbortController();
    abortController.value = preflightController;
    session.messages.push({
      role: 'assistant',
      content: ''
    });
    const messageIndex = session.messages.length - 1;
    await nextTick();
    scrollToBottom();

    const removePreflightLoader = () => {
      const targetSession = getSessionByIndex(sessionIndex);
      const maybeLoader = targetSession?.messages?.[messageIndex];
      if (maybeLoader?.role === 'assistant' && !String(maybeLoader.content || '').trim()) {
        targetSession.messages.splice(messageIndex, 1);
      }
    };

    const finishPreflightOnly = () => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (targetSession) {
        targetSession.isLoading = false;
        targetSession.isThinking = false;
      }
      if (activeGenerationSessionIndex.value === sessionIndex) {
        activeGenerationSessionIndex.value = null;
      }
      if (abortController.value === preflightController) {
        abortController.value = null;
      }
      stopThinkingTimer();
    };

    let autoDecision = null;
    let autoDecisionTimedOut = false;
    const autoDecisionTimeout = setTimeout(() => {
      autoDecisionTimedOut = true;
      if (!preflightController.signal.aborted) {
        preflightController.abort();
      }
    }, 3500);
    try {
      autoDecision = currentModeId.value === BOH_AUTO_MODE_ID
        ? await resolveAutoModeDecisionWithFastModel(userText, preflightController.signal)
        : null;
    } finally {
      clearTimeout(autoDecisionTimeout);
    }
    if (autoDecisionTimedOut) {
      logger.warn('boh-ai', 'Auto 分类超时，使用本地规则路由继续回答');
      autoDecision = currentModeId.value === BOH_AUTO_MODE_ID
        ? resolveAutoModeDecisionLocally(userText)
        : null;
    }
    if (preflightController.signal.aborted && !autoDecisionTimedOut) {
      removePreflightLoader();
      finishPreflightOnly();
      return;
    }
    if (abortController.value === preflightController) {
      abortController.value = null;
    }

    if (autoDecision?.minecraftCommand) {
      removePreflightLoader();
      finishPreflightOnly();
      await handleCommandModeGeneration(userText, { appendUser: false });
      return;
    }

    if (autoDecision?.shouldSaveCloud || autoDecision?.shouldSaveSharedMemory || autoDecision?.shouldAskMemoryDestination) {
      removePreflightLoader();
      finishPreflightOnly();
      if (requestSharedMemorySaveConfirmation({
        content: userText,
        sessionIndex,
        destination: autoDecision.saveDestination || 'ask'
      })) {
        return;
      }
    }

    if (autoDecision?.shouldReferenceCloud && !isTreeholeMemoryEnabled.value) {
      if (!isLoggedIn.value || !userInfo.value?.id) {
        removePreflightLoader();
        finishPreflightOnly();
        appendSessionMessage(
          sessionIndex,
          'assistant',
          '总结最近日常需要参考你的 BOH Cloud+，但你还没有登录，所以我先不读取这部分内容。'
        );
        return;
      }

      if (cloudReferenceConsent.value !== 'granted') {
        removePreflightLoader();
        finishPreflightOnly();
        requestCloudReferenceConsent();
        return;
      }

      isTreeholeMemoryEnabled.value = true;
      persistTreeholeMemorySetting();
      setMemoryCaptureStatusMessage('Auto 已为你开启 Cloud+ 参考。');
    }

    const operationQuestion = isOperationQuestion(userText);
    const communityQuestion = isCommunityQuestion(userText);
    const communityCreativeRequest = communityQuestion && isCommunityCreativeRequest(userText);
    const communityNeedsEvidence = communityQuestion && !communityCreativeRequest;
    const bohInternalFactualQuestion = isLikelyBohInternalFactualQuestion(userText, { operationQuestion });
    const factualQuestion = isLikelyFactualQuestion(userText, { operationQuestion }) || bohInternalFactualQuestion;
    const autoSearchEnabled = currentModeId.value === BOH_AUTO_MODE_ID && Boolean(autoDecision?.shouldSearchWeb);
    const enableSearch = isSearching.value || autoSearchEnabled;
    session.isLoading = true;
    session.isThinking = true;
    const requestController = new AbortController();
    abortController.value = requestController;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();
    setThinkingStatus(`正在分析问题：${summarizeThinkingSubject(userText)}`);

    const updateContent = (text) => {
      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession || !targetSession.messages[messageIndex]) return;
      targetSession.messages[messageIndex].content = text;
      scrollToBottom();
    };

    try {
      let finalPrompt = truncateText(userText, MAX_USER_INPUT_CHARS);
      let promptExtras = '';
      let currentContent = '';
      let groundingEvidenceRefs = [];
      let searchResultCount = 0;
      let hasKnowledgeContext = false;
      const showProgress = SHOW_INTERNAL_PROGRESS_NOTES;

      const setProgressContent = (nextText) => {
        if (!showProgress) return;
        currentContent = String(nextText || '');
        updateContent(currentContent);
      };

      const appendProgressContent = (appendText) => {
        if (!showProgress) return;
        currentContent += String(appendText || '');
        updateContent(currentContent);
      };

      const webSearchPromise = enableSearch
        ? searchWebForPrompt(userText, requestController.signal).catch((error) => ({
            ok: false,
            disabled: false,
            count: 0,
            context: '',
            results: [],
            error,
            message: error?.message || '未知错误'
          }))
        : Promise.resolve({ ok: true, disabled: false, count: 0, context: '', results: [] });

      if (enableSearch) {
        if (autoSearchEnabled) {
          updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索最新资料。']);
        }
        setThinkingStatus('正在并行搜索网络资料...');
        setProgressContent(`> **正在搜索**: "${userText}"...\n\n`);
      }

      // 自动知识路由：回答前先做关键词判断，再决定是否检索对应知识源
      try {
        setThinkingStatus('正在判断需要查看哪些 BOH 资料...');
        const routingPreview = resolveKnowledgeRoutingPlan(userText);
        const previewTargets = getRetrievalTargetLabels(routingPreview.plan);
        if (previewTargets.length > 0) {
          setThinkingStatus(`正在查看 ${previewTargets.join('、')}...`);
        }

        const {
          retrievalPlan,
          routingReasons,
          connectorResults,
          treeholeTotal,
          sharedMemoryTotal,
          userPrivateLabels,
          evidenceRefs,
          contextText
        } = await buildAutoKnowledgeContext(userText, {
          forceTreehole: Boolean(autoDecision?.shouldReferenceCloud)
        });
        const successfulConnectorResults = Array.isArray(connectorResults)
          ? connectorResults.filter((item) => item?.ok)
          : [];
        const retrievalTargets = [];
        if (retrievalPlan.treehole) retrievalTargets.push(treeholeTotal > 0 ? `BOH Cloud+(${treeholeTotal}条)` : 'BOH Cloud+');
        if (retrievalPlan.sharedMemory && sharedMemoryTotal > 0) {
          retrievalTargets.push(`AI公共记忆(${sharedMemoryTotal}条)`);
        }
        if (retrievalPlan.memory) retrievalTargets.push('记忆库');
        if (retrievalPlan.siteGuide) retrievalTargets.push('操作手册');
        if (retrievalPlan.forum) retrievalTargets.push('社区帖子');
        if (retrievalPlan.userPrivate && Array.isArray(userPrivateLabels) && userPrivateLabels.length > 0) {
          retrievalTargets.push(...userPrivateLabels.slice(0, 3));
        }

        const visibleRetrievalNote = successfulConnectorResults.length > 0
          ? (buildBohAIConnectorActionNote(successfulConnectorResults) || buildVisibleRetrievalActionNote(retrievalPlan, {
              treeholeTotal,
              sharedMemoryTotal,
              userPrivateLabels
            }))
          : '';
        if (visibleRetrievalNote) {
          updateAssistantActionNotes(sessionIndex, messageIndex, [visibleRetrievalNote]);
        }

        if (retrievalTargets.length > 0) {
          appendProgressContent(`> **自动检索中**: ${retrievalTargets.join('、')}...\n\n`);
        }

        if (Array.isArray(routingReasons) && routingReasons.length > 0) {
          appendProgressContent(`> **知识路由**: ${routingReasons.slice(0, 4).join('；')}\n\n`);
        }

        if (contextText) {
          hasKnowledgeContext = true;
          const contextSection = `\n\n以下是系统检索到的内部资料，请优先依据这些内容回答：\n${contextText}\n`;
          promptExtras = appendPromptSection(promptExtras, contextSection, MAX_PROMPT_EXTRA_CHARS);
          groundingEvidenceRefs = Array.isArray(evidenceRefs) ? evidenceRefs.slice(0, 32) : [];
          if (retrievalTargets.length > 0) {
            appendProgressContent('> ✅ **已完成内部检索**\n\n');
            setThinkingStatus('已找到相关资料，正在整理回答依据...');
          }
        } else if (retrievalTargets.length > 0) {
          appendProgressContent('> ⚠️ **未检索到匹配内部资料**\n\n');
          setThinkingStatus('未找到明确资料，正在分析问题本身...');
        }
      } catch (knowledgeError) {
        logger.error('boh-ai', 'Knowledge retrieval failed', knowledgeError);
        appendProgressContent(`> ❌ **内部检索失败**: ${knowledgeError.message}\n\n`);
        setThinkingStatus('资料检索失败，正在尝试直接回答...');
      }

      if (enableSearch) {
        try {
          const webSearchResult = await webSearchPromise;
          if (webSearchResult?.disabled) {
            if (isSearching.value) {
              isSearching.value = false;
            }
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索未配置，已跳过外部检索。']);
            setProgressContent(`> ⚠️ **${webSearchResult.message}**，已跳过网络检索。\n\n`);
          } else if (webSearchResult?.ok) {
            searchResultCount = Number(webSearchResult.count || 0);
            if (webSearchResult.context) {
              promptExtras = appendPromptSection(promptExtras, webSearchResult.context, MAX_PROMPT_EXTRA_CHARS);
            }
            const results = Array.isArray(webSearchResult.results) ? webSearchResult.results : [];
            updateAssistantActionNotes(
              sessionIndex,
              messageIndex,
              [results.length > 0 ? `搜索了 ${results.length} 个内容。` : '搜索了 0 个内容。']
            );
            if (results.length > 0) {
              setProgressContent(`> ✅ **找到 ${results.length} 个结果**:\n${results.map((r, i) => `> ${i + 1}. [${r.title}](${r.url})`).join('\n')}\n\n`);
            } else {
              setProgressContent('> ⚠️ **未找到相关结果**\n\n');
            }
          } else {
            if (webSearchResult?.error && webSearchResult.error?.name !== 'AbortError') {
              logger.error('boh-ai', 'Search failed', webSearchResult.error);
            }
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索失败，已尝试继续回答。']);
            appendProgressContent(`> ⚠️ **搜索服务异常**: ${webSearchResult?.message || '未知错误'}\n\n`);
          }
        } catch (searchError) {
          if (searchError?.name !== 'AbortError') {
            logger.error('boh-ai', 'Search failed', searchError);
            updateAssistantActionNotes(sessionIndex, messageIndex, ['联网搜索失败，已尝试继续回答。']);
            appendProgressContent(`> ❌ **搜索失败**: ${searchError.message}\n\n`);
          }
        }
      }

      finalPrompt = appendPromptSection(finalPrompt, promptExtras, MAX_FINAL_PROMPT_CHARS - 1600);
      const shouldEnforceGrounding = factualQuestion || operationQuestion || enableSearch || communityNeedsEvidence || bohInternalFactualQuestion;

      finalPrompt = appendPromptSection(finalPrompt, `\n\n【回答要求】：
1. 涉及网站操作时，优先给出“入口路径 + 步骤”。
2. 涉及社区事实时，优先依据检索内容回答。
3. 不确定时请直接说明不确定，不要编造。
4. 涉及用户个人复盘时，优先结合 BOH Cloud+ 私有内容给出总结和建议。
5. 不要复述或粘贴“内部检索资料”的原文段落。
6. 优先用自然表达，除非用户要求，不强制套用固定模板。`, MAX_FINAL_PROMPT_CHARS);

      if (communityQuestion || bohInternalFactualQuestion) {
        finalPrompt = appendPromptSection(finalPrompt, `\n\n【社群内容防编造规则】
1. 涉及方块之家、BOH、论坛帖子、成员、活动、历史、服务器、社群动态等内容时，只能依据本轮检索到的资料或联网搜索结果回答。
2. 禁止凭印象补全人物、事件、时间线、动机、关系、帖子内容、活动细节或统计数字。
3. 如果资料没有覆盖用户问到的点，必须明确说“未检索到明确依据，无法确认”，不要给出猜测版答案。
4. 如果用户要求创作、改写或生成文案，可以创作，但必须说明“以下是创作内容，不代表社群事实”。`, MAX_FINAL_PROMPT_CHARS);
      }

      if (shouldEnforceGrounding) {
        finalPrompt = appendPromptSection(finalPrompt, `\n\n【证据要求】：
1. 若引用内部资料中的事实，请在对应句尾标注证据编号（如 [S2]、[T1]、[F3]）。
2. 若引用联网搜索结果，请使用 [W1]、[W2]。
3. 若某结论缺乏证据，请明确写“未检索到明确依据”。`, MAX_FINAL_PROMPT_CHARS);
      }

      if (shouldEnforceGrounding && groundingEvidenceRefs.length > 0) {
        finalPrompt = appendPromptSection(
          finalPrompt,
          `\n\n【本轮可用证据编号】\n${groundingEvidenceRefs.join('、')}\n引用时仅可使用以上编号，不可自造编号。`,
          MAX_FINAL_PROMPT_CHARS
        );
      }

      if (operationQuestion) {
        finalPrompt = appendPromptSection(finalPrompt, `\n\n【操作类问题专用格式】
- 入口路径：给出最相关路径（例如 /user-space、/profile/:username）
- 操作步骤：用 1-${OPERATION_MAX_STEPS} 条编号步骤说明
- 注意事项：仅在必要时给出

【强约束】
- 如果无法从已检索资料确认路径，直接说“我目前无法确认该功能的准确路径”。
- 禁止猜测未出现过的页面路径或按钮文案。`, MAX_FINAL_PROMPT_CHARS);
      }

      const activeModeId = autoDecision?.modeId || (currentModeId.value === BOH_AUTO_MODE_ID ? 'fast' : currentModeId.value);
      const preferAccuracyModel = factualQuestion || operationQuestion || enableSearch || communityNeedsEvidence;
      const preferredModel = availableModels.find((item) => item.id === ACCURACY_PREFERRED_MODEL_ID);
      const ragPreferredModel = availableModels.find((item) => item.id === RAG_PREFERRED_MODEL_ID);
      const routedModeModel = getModelForModeId(activeModeId);
      const generationModel = preferAccuracyModel && preferredModel
        ? preferredModel
        : (hasKnowledgeContext && ragPreferredModel ? ragPreferredModel : routedModeModel);
      setThinkingStatus('正在生成回答...');

      let url = generationModel.url;
      let headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generationModel.apiKey}`
      };
      let requestBody = {};
      const systemPromptContent = BASE_SYSTEM_PROMPT;
      const generationProfile = getGenerationProfile(activeModeId, {
        factualQuestion: factualQuestion || communityNeedsEvidence,
        operationQuestion
      });

      const recentMessages = buildHistoryMessagesWithinBudget(session.messages.slice(0, -2), {
        maxChars: MAX_HISTORY_CONTEXT_CHARS,
        maxMessages: MAX_CONTEXT_MESSAGES,
        maxPerMessage: MAX_HISTORY_MESSAGE_CHARS
      });
      const groundingRefSet = new Set(
        (Array.isArray(groundingEvidenceRefs) ? groundingEvidenceRefs : []).map((id) => String(id).toUpperCase())
      );
      const maxSearchCitationRef = enableSearch
        ? Math.max(0, Math.min(9, Math.trunc(Number(searchResultCount) || 0)))
        : 0;
      const totalGroundingRefCount = groundingRefSet.size + maxSearchCitationRef;
      const minRequiredGroundingCitations = shouldEnforceGrounding
        ? (factualQuestion ? Math.min(2, Math.max(1, totalGroundingRefCount)) : Math.min(1, Math.max(1, totalGroundingRefCount)))
        : 0;

      const needsInternalEvidence = communityNeedsEvidence || bohInternalFactualQuestion;
      if (needsInternalEvidence && totalGroundingRefCount <= 0) {
        updateContent('未检索到明确依据，无法确认这部分 BOH 内部内容。为了避免编造，我不能凭印象补全答案；可以换个更具体的关键词，或开启联网搜索后再试。');
        nextTick(scrollToBottom);
        return;
      }

      const ensureGroundedReply = async (rawReply, { allowModelRepair = true } = {}) => {
        const safeReply = String(rawReply || '').trim();
        if (!safeReply) return safeReply;
        if (!shouldEnforceGrounding) return safeReply;
        if (totalGroundingRefCount <= 0) {
          if (needsInternalEvidence) {
            return '未检索到明确依据，无法确认这部分 BOH 内部内容。为了避免编造，我不能凭印象补全答案；可以换个更具体的关键词，或开启联网搜索后再试。';
          }
          return safeReply;
        }
        if (!shouldRepairUngroundedReply(safeReply, {
          evidenceRefSet: groundingRefSet,
          maxSearchRef: maxSearchCitationRef,
          minRequiredCitations: minRequiredGroundingCitations
        })) {
          return safeReply;
        }
        if (!allowModelRepair) {
          return `${safeReply}\n\n（提示：部分结论未检索到明确依据）`;
        }

        appendProgressContent('> ⚙️ **正在核验回答依据并自动修复...**\n\n');
        setThinkingStatus('正在核验回答依据并修正引用...');

        const groundedRepairPrompt = appendPromptSection(
          finalPrompt,
          `\n\n【依据核验重写任务】\n你刚才的回答引用依据不足，请重写整条回答并严格遵守：\n1) 若使用内部资料事实，句尾必须带证据编号（如 [S1] / [T2] / [K3] / [G1] / [F2] / [U1]）。\n2) 若使用联网搜索结果，引用格式为 [W1]、[W2]（仅可引用实际检索结果编号）。\n3) 仅可使用“本轮可用证据编号”中的内部编号，不可自造。\n4) 没有证据支持的结论必须写“未检索到明确依据”。\n5) 禁止新增未检索到的事实。\n6) 保持答案简洁、可执行。`,
          MAX_FINAL_PROMPT_CHARS
        );

        try {
          const repaired = await callModelInternal(
            generationModel.id,
            groundedRepairPrompt,
            systemPromptContent,
            recentMessages,
            requestController.signal,
            0,
            generationProfile
          );
          const filtered = filterThinkingContent(repaired);
          if (!String(filtered || '').trim()) return safeReply;

          if (shouldRepairUngroundedReply(filtered, {
            evidenceRefSet: groundingRefSet,
            maxSearchRef: maxSearchCitationRef,
            minRequiredCitations: minRequiredGroundingCitations
          })) {
            return `${filtered}\n\n（提示：部分结论未检索到明确依据）`;
          }
          return filtered;
        } catch (repairError) {
          logger.warn('boh-ai', 'Grounded repair failed', repairError);
          return safeReply;
        }
      };

      requestBody = {
        model: generationModel.id,
        messages: [
          { role: 'system', content: systemPromptContent },
          ...recentMessages,
          { role: 'user', content: finalPrompt }
        ],
        stream: true,
        temperature: generationProfile.temperature,
        top_p: generationProfile.top_p,
        frequency_penalty: generationProfile.frequency_penalty,
        max_tokens: generationProfile.max_tokens
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        signal: requestController.signal,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errText}`);
      }

      // 重置思考过滤状态
      resetThinkingState();
      setThinkingStatus('正在生成回答...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = getSessionByIndex(sessionIndex)?.messages?.[messageIndex]?.content || '';
      let shouldRepairDegenerateStream = false;
      let hasReceivedVisibleAnswer = false;
      let streamIdleTimer = null;
      const stopThinkingWhenAnswerVisible = () => {
        if (hasReceivedVisibleAnswer) return;
        hasReceivedVisibleAnswer = true;
        clearThinkingStatus();
        const targetSession = getSessionByIndex(sessionIndex);
        if (targetSession) {
          targetSession.isThinking = false;
        }
      };
      const readNextStreamChunk = async () => {
        if (!hasReceivedVisibleAnswer) return reader.read();
        return Promise.race([
          reader.read(),
          new Promise((resolve) => {
            streamIdleTimer = setTimeout(() => {
              resolve({ done: true, value: undefined, idleTimeout: true });
            }, 2500);
          })
        ]).finally(() => {
          if (streamIdleTimer) {
            clearTimeout(streamIdleTimer);
            streamIdleTimer = null;
          }
        });
      };
      const sseParser = createSseLineParser((payload) => {
        try {
          const data = JSON.parse(payload);
          const delta = data.choices?.[0]?.delta || {};
          const rawContent = delta.content || '';

          if (rawContent) {
            const content = safeChunkToString(rawContent);
            const filteredContent = filterThinkingContentStream(content);
            if (filteredContent && filteredContent !== '[object Object]') {
              if (shouldRepairDegenerateStream) {
                return;
              }
              if (String(filteredContent).trim()) {
                stopThinkingWhenAnswerVisible();
              }
              assistantMessage += filteredContent;
              updateContent(assistantMessage);
              nextTick(scrollToBottom);

              if (isDegenerateStreamOutput(assistantMessage)) {
                shouldRepairDegenerateStream = true;
                setThinkingStatus('生成内容异常，正在自动修复...');
                appendProgressContent('> ⚠️ **生成内容异常，正在自动修复...**\n\n');
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
        if (shouldRepairDegenerateStream) {
          try {
            await reader.cancel();
          } catch (_cancelError) {
            // Ignore reader cancel errors.
          }
          break;
        }
      }

      if (!shouldRepairDegenerateStream && !sseParser.isDone()) {
        sseParser.push(decoder.decode());
        sseParser.flush();

        // 流式处理结束，刷新缓冲区并添加剩余内容
        const remainingContent = flushThinkingBuffer();
        if (remainingContent) {
          assistantMessage += remainingContent;
        }
      } else {
        resetThinkingState();
      }

      if (shouldRepairDegenerateStream) {
        const retryPrompt = appendPromptSection(
          finalPrompt,
          `\n\n【稳定性约束】
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 输出必须是正常中文句子，结构清晰，不要输出长串符号。
- 若信息不足，请直接说明“我暂时无法确认”，不要输出占位符。`,
          MAX_FINAL_PROMPT_CHARS
        );

        const retryReply = await callModelInternal(
          generationModel.id,
          retryPrompt,
          systemPromptContent,
          recentMessages,
          requestController.signal,
          0,
          generationProfile
        );
        const retryFiltered = filterThinkingContent(retryReply);

        const repairedContent = (!isDegenerateAssistantReply(retryFiltered) && String(retryFiltered || '').trim())
          ? retryFiltered
          : '抱歉，本轮生成内容异常。你可以切到“思考/专业”模式重试，我也可以继续帮你完成这个问题。';

        const groundedRepairedContent = cleanAssistantVisibleReply(await ensureGroundedReply(repairedContent))
          || '我暂时没有生成到有效内容，请再试一次。';
        updateContent(groundedRepairedContent);
        nextTick(scrollToBottom);
        await queueQuickNoteConfirmation({
          rawText: userText,
          sessionIndex,
          requestSignal: requestController.signal,
          modelId: generationModel.id
        });

        void captureMemoryFromConversation({
          sessionIndex,
          userText,
          assistantText: groundedRepairedContent
        });
        return;
      }

      // 对完整内容进行二次过滤，确保所有思考内容都被过滤掉
      let finalFilteredContent = filterThinkingContent(assistantMessage);
      if (String(finalFilteredContent || '').trim()) {
        stopThinkingWhenAnswerVisible();
      }

      if (isDegenerateAssistantReply(finalFilteredContent)) {
        logger.warn('boh-ai', 'Detected degenerate output, retrying once with strict settings');
        setThinkingStatus('生成内容异常，正在自动重试...');
        appendProgressContent('> ⚠️ **生成内容异常，正在自动重试...**\n\n');

        const retryPrompt = appendPromptSection(
          finalPrompt,
          `\n\n【稳定性约束】
- 禁止输出连续重复标点或无意义字符（如 !!!!!、?????、-----）。
- 若信息不足，请直接说明“我暂时无法确认”，不要输出占位符。`,
          MAX_FINAL_PROMPT_CHARS
        );

        const retryReply = await callModelInternal(
          generationModel.id,
          retryPrompt,
          systemPromptContent,
          recentMessages,
          requestController.signal,
          0,
          generationProfile
        );
        const retryFiltered = filterThinkingContent(retryReply);

        if (!isDegenerateAssistantReply(retryFiltered) && String(retryFiltered || '').trim()) {
          finalFilteredContent = retryFiltered;
        } else {
          finalFilteredContent = '抱歉，本轮生成内容异常。你可以切到“思考/专业”模式重试，我也可以继续帮你完成这个问题。';
        }
      }

      finalFilteredContent = await ensureGroundedReply(finalFilteredContent, { allowModelRepair: false });
      finalFilteredContent = cleanAssistantVisibleReply(finalFilteredContent);
      if (!finalFilteredContent) {
        finalFilteredContent = '我暂时没有生成到有效内容，请再试一次。';
      }

      updateContent(finalFilteredContent);
      nextTick(scrollToBottom);
      await queueQuickNoteConfirmation({
        rawText: userText,
        sessionIndex,
        requestSignal: requestController.signal,
        modelId: generationModel.id
      });

      // 对话结束后异步尝试“选择性记忆沉淀”，不阻塞主回答流程
      void captureMemoryFromConversation({
        sessionIndex,
        userText,
        assistantText: finalFilteredContent
      });
    } catch (error) {
      const targetSession = getSessionByIndex(sessionIndex);
      const currentContent = targetSession?.messages?.[messageIndex]?.content || '';

      if (error.name === 'AbortError') {
        logger.debug('boh-ai', 'Generation stopped');
        const filteredStoppedContent = cleanAssistantVisibleReply(filterThinkingContent(currentContent));
        if (isDegenerateAssistantReply(filteredStoppedContent)) {
          updateContent('检测到生成内容异常，本次已停止。你可以重试，我会自动使用更稳的参数。');
        } else {
          updateContent(`${filteredStoppedContent}\n\n（已停止生成）`);
        }
      } else {
        logger.error('boh-ai', 'Generation error', error);
        updateContent(`抱歉，我遇到了一些问题: ${error.message}，请稍后再试。`);
      }

      if (targetSession) {
        targetSession.isThinking = false;
      }
      stopThinkingTimer();
      nextTick(scrollToBottom);
    } finally {
      clearThinkingStatus();
      const targetSession = getSessionByIndex(sessionIndex);
      if (targetSession) {
        targetSession.isLoading = false;
        targetSession.isThinking = false;
      }
      if (abortController.value === requestController) {
        abortController.value = null;
      }
      if (activeGenerationSessionIndex.value === sessionIndex) {
        activeGenerationSessionIndex.value = null;
      }
      stopThinkingTimer();
    }
  };

  return {
    chatSessions,
    currentSessionIndex,
    inputMessage,
    isLoading,
    isThinking,
    thinkingTime,
    thinkingStatus,
    textareaRef,
    currentModeId,
    currentMode,
    currentModelId,
    currentModel,
    isCommandMode,
    isSearching,
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isTreeholeMemoryToggling,
    isQuickNoteEnabled,
    pendingCloudReferenceConsent,
    pendingQuickNote,
    memoryCaptureTip,
    isRateLimited,
    rateLimitMessage,
    chatModes,
    messages,
    onScrollToBottom,
    startNewChat,
    deleteSession,
    switchSession,
    sendMessage,
    toggleMemoryCapture,
    toggleTreeholeMemory,
    toggleQuickNoteMode,
    updatePendingQuickNoteDraft,
    dismissQuickNoteDraft,
    confirmQuickNoteDraft,
    approveCloudReferenceConsent,
    rejectCloudReferenceConsent,
    activeActionDraft,
    updatePendingPostDraftFromUI,
    updatePendingMailDraftFromUI,
    cancelPendingActionDraftFromUI,
    confirmPendingActionDraftFromUI,
    stopGeneration,
    clearCache
  };
}
