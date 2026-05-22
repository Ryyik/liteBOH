import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
import {
  UNIFIED_APPROVED_STATUS,
  UNIFIED_REJECTED_STATUS,
  runKeywordPrecheck,
  runAsyncRelaxedModeration,
  writeModerationAuditLog,
  isMissingDbColumnError
} from '../unified-content-moderation.js';

const TREEHOLE_CACHE_TAG = 'treehole';
const SILICON_CLOUD_API_KEY = import.meta.env.VITE_SILICON_CLOUD_API_KEY || '';
const SILICON_CLOUD_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';
// 固定选用 AI 广场中的长记忆复盘模型（高强推理）
const TREEHOLE_LONG_MEMORY_MODEL = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';
const TREEHOLE_MEMORY_FETCH_PAGE_SIZE = 200;
const TREEHOLE_MAX_HISTORY_MESSAGES = 10;
const TREEHOLE_MAX_HISTORY_CONTENT_CHARS = 800;
const TREEHOLE_MEMORY_SEGMENT_CHARS = 1800;
const TREEHOLE_MEMORY_CHUNK_CHARS = 22000;
const TREEHOLE_DIRECT_CONTEXT_CHARS = 52000;
const TREEHOLE_MEMORY_SUMMARY_MAX_CHARS = 260;
const TREEHOLE_CANDIDATE_CACHE_TAG = 'treehole-candidates';
const TREEHOLE_SHARED_MEMORY_CACHE_TAG = 'shared-ai-memory';
const TREEHOLE_AUTO_MEMORY_MODEL = TREEHOLE_LONG_MEMORY_MODEL;
const TREEHOLE_AUTO_MEMORY_MAX_MESSAGES = 12;
const TREEHOLE_AUTO_MEMORY_MAX_MESSAGE_CHARS = 900;
const TREEHOLE_AUTO_MEMORY_MAX_CANDIDATES = 4;
const TREEHOLE_AUTO_MEMORY_MIN_CONFIDENCE = 0.66;
const TREEHOLE_AUTO_MEMORY_AUTOSAVE_CONFIDENCE = 0.9;
const TREEHOLE_AUTO_MEMORY_CONTENT_MAX_CHARS = 320;
const TREEHOLE_AUTO_MEMORY_REASON_MAX_CHARS = 200;
const TREEHOLE_AUTO_MEMORY_MAX_EVIDENCE = 8;
const TREEHOLE_AUTO_MEMORY_DEDUP_SIMILARITY = 0.86;
const TREEHOLE_SHARED_MEMORY_FETCH_LIMIT = 300;
const TREEHOLE_SHARED_MEMORY_SEARCH_LIMIT = 60;
const SHARED_MEMORY_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const TREEHOLE_SPACE_COLUMNS = 'user_id, title, description, created_at, updated_at';
const TREEHOLE_MEMORY_COLUMNS = 'id, user_id, content, mood, tags, is_starred, source, created_at, updated_at';
const TREEHOLE_SHARED_MEMORY_COLUMNS = `
  id,
  owner_user_id,
  content,
  mood,
  tags,
  confidence,
  evidence,
  source,
  status,
  created_at,
  updated_at
`;
const TREEHOLE_SHARED_MEMORY_COLUMNS_WITH_MODERATION = `
  id,
  owner_user_id,
  content,
  mood,
  tags,
  confidence,
  evidence,
  source,
  status,
  moderation_status,
  moderation_reason,
  created_at,
  updated_at
`;
const TREEHOLE_CANDIDATE_COLUMNS = `
  id,
  user_id,
  content,
  mood,
  tags,
  confidence,
  evidence,
  status,
  session_id,
  reason,
  model,
  memory_id,
  created_at,
  updated_at
`;

const encodeCursorToken = (payload = {}) => {
  try {
    return btoa(JSON.stringify(payload));
  } catch (_error) {
    return '';
  }
};

const decodeCursorToken = (token = '', timestampField = 'updatedAt') => {
  const safeToken = String(token || '').trim();
  if (!safeToken) return null;

  try {
    const parsed = JSON.parse(atob(safeToken));
    const updatedAt = String(parsed?.[timestampField] || parsed?.updatedAt || parsed?.updated_at || '').trim();
    const id = String(parsed?.id || '').trim();
    if (!updatedAt || !id) return null;
    return { updatedAt, id };
  } catch (_error) {
    return null;
  }
};

const buildNextUpdatedAtCursor = (rows = [], hasMore = false) => {
  if (!hasMore || !Array.isArray(rows) || rows.length === 0) return '';
  const last = rows[rows.length - 1];
  const updatedAt = String(last?.updated_at || '').trim();
  const id = String(last?.id || '').trim();
  if (!updatedAt || !id) return '';
  return encodeCursorToken({ updatedAt, id });
};

const toTrimmedText = (value, maxLen = 0) => {
  const text = String(value || '').trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
};

const parseJsonObjectFromText = (text) => {
  const safeText = String(text || '').trim();
  if (!safeText) return null;

  try {
    return JSON.parse(safeText);
  } catch (_error) {
    // noop
  }

  const startIndex = safeText.indexOf('{');
  const endIndex = safeText.lastIndexOf('}');
  if (startIndex < 0 || endIndex <= startIndex) return null;

  const maybeJson = safeText.slice(startIndex, endIndex + 1);
  try {
    return JSON.parse(maybeJson);
  } catch (_error) {
    return null;
  }
};

const parseJsonDataFromText = (text) => {
  const safeText = String(text || '').trim();
  if (!safeText) return null;

  try {
    return JSON.parse(safeText);
  } catch (_error) {
    // noop
  }

  const fencedMatch = safeText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const candidate = fencedMatch[1].trim();
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch (_error) {
        // noop
      }
    }
  }

  const objectStart = safeText.indexOf('{');
  const objectEnd = safeText.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const maybeObject = safeText.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(maybeObject);
    } catch (_error) {
      // noop
    }
  }

  const arrayStart = safeText.indexOf('[');
  const arrayEnd = safeText.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const maybeArray = safeText.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(maybeArray);
    } catch (_error) {
      // noop
    }
  }

  return null;
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  const unique = new Set();

  for (const item of tags) {
    const text = toTrimmedText(item, 20);
    if (!text) continue;
    unique.add(text);
    if (unique.size >= 20) break;
  }

  return [...unique];
};

const clampNumber = (value, min = 0, max = 1, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const normalizeCandidateStatus = (value) => {
  const normalized = String(value || '').trim();
  if (normalized === 'auto_saved') return 'auto_saved';
  if (normalized === 'rejected') return 'rejected';
  return 'pending';
};

const normalizeSpaceRow = (row) => {
  if (!row) return null;
  return {
    userId: row.user_id || '',
    title: row.title || '我的 BOH 树洞',
    description: row.description || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
};

const normalizeMemoryRow = (row) => {
  if (!row) return null;
  return {
    id: row.id || '',
    userId: row.user_id || '',
    content: row.content || '',
    mood: row.mood || '',
    tags: normalizeTags(row.tags),
    isStarred: Boolean(row.is_starred),
    source: row.source === 'ai' ? 'ai' : 'manual',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
};

const normalizeEvidence = (evidence) => {
  if (!Array.isArray(evidence)) return [];
  const items = [];

  for (const item of evidence) {
    const messageId = toTrimmedText(item?.messageId || item?.message_id, 24);
    const quote = toTrimmedText(item?.quote || item?.text, 240);
    if (!messageId || !quote) continue;
    items.push({ messageId, quote });
    if (items.length >= TREEHOLE_AUTO_MEMORY_MAX_EVIDENCE) break;
  }

  return items;
};

const normalizeMemoryCandidateRow = (row) => {
  if (!row) return null;
  return {
    id: row.id || '',
    userId: row.user_id || '',
    content: row.content || '',
    mood: row.mood || '',
    tags: normalizeTags(row.tags),
    confidence: clampNumber(row.confidence, 0, 1, 0),
    evidence: normalizeEvidence(row.evidence),
    status: normalizeCandidateStatus(row.status),
    sessionId: row.session_id || '',
    reason: row.reason || '',
    model: row.model || '',
    memoryId: row.memory_id || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
};

const normalizeSharedMemoryRow = (row) => {
  if (!row) return null;
  return {
    id: row.id || '',
    ownerUserId: row.owner_user_id || '',
    content: row.content || '',
    mood: row.mood || '',
    tags: normalizeTags(row.tags),
    confidence: clampNumber(row.confidence, 0, 1, 0),
    evidence: normalizeEvidence(row.evidence),
    source: row.source || 'capture',
    status: row.status || 'active',
    moderationStatus: row.moderation_status || '',
    moderationReason: row.moderation_reason || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
};

const buildSharedMemoryOwnerTag = (userId) => {
  const safeUserId = toTrimmedText(userId, 64);
  return safeUserId ? `${TREEHOLE_SHARED_MEMORY_CACHE_TAG}:owner:${safeUserId}` : '';
};

const invalidateTreeholeCache = (userId) => {
  invalidateByTags([
    TREEHOLE_CACHE_TAG,
    userId ? `${TREEHOLE_CACHE_TAG}:user:${userId}` : ''
  ]);
};

const invalidateTreeholeCandidateCache = (userId) => {
  invalidateByTags([
    TREEHOLE_CANDIDATE_CACHE_TAG,
    userId ? `${TREEHOLE_CANDIDATE_CACHE_TAG}:user:${userId}` : ''
  ]);
};

const invalidateSharedMemoryCache = (userId = '') => {
  invalidateByTags([
    TREEHOLE_SHARED_MEMORY_CACHE_TAG,
    buildSharedMemoryOwnerTag(userId)
  ]);
};

const toTimestamp = (value) => {
  const ts = new Date(value || '').getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const normalizeDateRangeBoundary = (value) => {
  const text = toTrimmedText(value, 64);
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const toDateKey = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const splitTextByLength = (text, maxLen = 0) => {
  const safeText = String(text || '');
  const safeMaxLen = Number.isFinite(maxLen) ? Math.max(1, Math.trunc(maxLen)) : 0;
  if (!safeText) return ['（空）'];
  if (!safeMaxLen || safeText.length <= safeMaxLen) return [safeText];

  const chunks = [];
  for (let start = 0; start < safeText.length; start += safeMaxLen) {
    chunks.push(safeText.slice(start, start + safeMaxLen));
  }
  return chunks;
};

const normalizeTextForCompare = (text) => {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '')
    .trim();
};

const toBigramSet = (text) => {
  const normalized = normalizeTextForCompare(text);
  const grams = new Set();
  if (!normalized) return grams;
  if (normalized.length < 2) {
    grams.add(normalized);
    return grams;
  }

  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
};

const calcSimilarity = (a, b) => {
  const setA = toBigramSet(a);
  const setB = toBigramSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }

  const union = setA.size + setB.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
};

const isLikelyDuplicateText = (incomingText, existingTexts = []) => {
  const incoming = normalizeTextForCompare(incomingText);
  if (!incoming) return false;

  for (const value of existingTexts) {
    const normalized = normalizeTextForCompare(value);
    if (!normalized) continue;
    if (incoming === normalized) return true;
    if (incoming.includes(normalized) || normalized.includes(incoming)) return true;
    if (calcSimilarity(incoming, normalized) >= TREEHOLE_AUTO_MEMORY_DEDUP_SIMILARITY) return true;
  }

  return false;
};

const normalizeQuoteLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const quoteExistsInSource = (sourceText, quoteText) => {
  const source = String(sourceText || '');
  const quote = String(quoteText || '').trim();
  if (!source || !quote) return false;
  if (source.includes(quote)) return true;
  const normalizedSource = normalizeQuoteLine(source);
  const normalizedQuote = normalizeQuoteLine(quote);
  return normalizedSource.includes(normalizedQuote);
};

const normalizeMemoriesForPrompt = (memories = []) => {
  if (!Array.isArray(memories)) return [];

  return memories
    .map((item) => ({
      id: toTrimmedText(item?.id, 80),
      content: String(item?.content || '').trim(),
      mood: toTrimmedText(item?.mood, 24),
      tags: normalizeTags(item?.tags || []),
      createdAt: toTrimmedText(item?.createdAt, 40),
      updatedAt: toTrimmedText(item?.updatedAt, 40)
    }))
    .filter((item) => item.content)
    .sort((a, b) => toTimestamp(a.updatedAt || a.createdAt) - toTimestamp(b.updatedAt || b.createdAt));
};

const buildTreeholeMemorySegments = (memories = [], maxSegmentChars = TREEHOLE_MEMORY_SEGMENT_CHARS) => {
  const normalized = normalizeMemoriesForPrompt(memories);
  const segments = [];

  normalized.forEach((item, index) => {
    const memoryNo = index + 1;
    const parts = splitTextByLength(item.content, maxSegmentChars);
    const totalSegments = parts.length;
    const tagsText = item.tags.join('、');
    const timestamp = item.updatedAt || item.createdAt || '未知';

    parts.forEach((contentPart, partIndex) => {
      const segmentNo = partIndex + 1;
      segments.push({
        memoryNo,
        totalSegments,
        segmentNo,
        timestamp,
        mood: item.mood || '未标注',
        tags: tagsText || '无',
        content: contentPart || '（空）'
      });
    });
  });

  return {
    memoryCount: normalized.length,
    segments
  };
};

const formatTreeholeMemorySegment = (segment) => {
  return `记忆#${segment.memoryNo}（片段 ${segment.segmentNo}/${segment.totalSegments}）
时间: ${segment.timestamp}
心情: ${segment.mood}
标签: ${segment.tags}
内容:
${segment.content}`;
};

const buildTreeholeMemoryChunks = (
  memories = [],
  {
    maxChunkChars = TREEHOLE_MEMORY_CHUNK_CHARS,
    maxSegmentChars = TREEHOLE_MEMORY_SEGMENT_CHARS
  } = {}
) => {
  const { memoryCount, segments } = buildTreeholeMemorySegments(memories, maxSegmentChars);
  if (segments.length === 0) {
    return { memoryCount: 0, chunks: [] };
  }

  const chunks = [];
  let currentLines = [];
  let currentLen = 0;
  let currentMemoryIds = new Set();

  segments.forEach((segment) => {
    const line = formatTreeholeMemorySegment(segment);
    const estimatedLen = line.length + 2;
    const shouldFlush = currentLines.length > 0 && (currentLen + estimatedLen > maxChunkChars);

    if (shouldFlush) {
      chunks.push({
        text: currentLines.join('\n\n'),
        memoryCount: currentMemoryIds.size
      });
      currentLines = [];
      currentLen = 0;
      currentMemoryIds = new Set();
    }

    currentLines.push(line);
    currentLen += estimatedLen;
    currentMemoryIds.add(segment.memoryNo);
  });

  if (currentLines.length > 0) {
    chunks.push({
      text: currentLines.join('\n\n'),
      memoryCount: currentMemoryIds.size
    });
  }

  return { memoryCount, chunks };
};

const normalizeHistoryMessages = (history = []) => {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-TREEHOLE_MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: toTrimmedText(item?.content, TREEHOLE_MAX_HISTORY_CONTENT_CHARS)
    }))
    .filter((item) => item.content);
};

const isMissingCandidatesTableError = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('boh_treehole_memory_candidates');
};

const isMissingSharedMemoryTableError = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('boh_ai_shared_memories');
};

const isMissingSharedMemoryModerationColumnError = (error) => {
  return isMissingDbColumnError(error, 'moderation_status')
    || isMissingDbColumnError(error, 'moderation_reason');
};

const isMissingSharedMemorySearchFunctionError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST202'
    || code === '42883'
    || message.includes('search_boh_ai_shared_memories');
};

const buildSharedMemoryModerationInput = (content = '') => {
  const safeContent = toTrimmedText(content, 1200);
  return `正文：${safeContent}`;
};

async function insertSharedMemoryWithModerationCompatibility(basePayload = {}) {
  const enhancedPayload = {
    ...basePayload,
    moderation_status: UNIFIED_APPROVED_STATUS,
    moderation_reason: null
  };

  let result = await supabase
    .from('boh_ai_shared_memories')
    .insert([enhancedPayload])
    .select()
    .maybeSingle();

  if (!result.error) return result;
  if (!isMissingSharedMemoryModerationColumnError(result.error)) return result;

  result = await supabase
    .from('boh_ai_shared_memories')
    .insert([basePayload])
    .select()
    .maybeSingle();
  return result;
}

async function applySharedMemoryModerationDecision(sharedMemoryId, moderationResult = {}) {
  const safeId = toTrimmedText(sharedMemoryId, 64);
  if (!safeId) return;

  const normalizedStatus = moderationResult?.status === UNIFIED_REJECTED_STATUS
    ? UNIFIED_REJECTED_STATUS
    : UNIFIED_APPROVED_STATUS;
  const reason = toTrimmedText(
    moderationResult?.reason ||
    moderationResult?.message ||
    moderationResult?.reasonCode ||
    '',
    240
  );

  const patch = {
    moderation_status: normalizedStatus,
    moderation_reason: normalizedStatus === UNIFIED_APPROVED_STATUS ? null : (reason || null),
    updated_at: new Date().toISOString()
  };

  if (normalizedStatus === UNIFIED_REJECTED_STATUS) {
    // 兼容旧查询：被拒绝内容统一归档，避免继续在 active 流中被检索。
    patch.status = 'archived';
  }

  let result = await supabase
    .from('boh_ai_shared_memories')
    .update(patch)
    .eq('id', safeId);

  if (!result.error) return;
  if (!isMissingSharedMemoryModerationColumnError(result.error)) return;

  const fallbackPatch = {
    updated_at: new Date().toISOString()
  };
  if (normalizedStatus === UNIFIED_REJECTED_STATUS) {
    fallbackPatch.status = 'archived';
  }

  await supabase
    .from('boh_ai_shared_memories')
    .update(fallbackPatch)
    .eq('id', safeId);
}

async function scheduleSharedMemoryModeration(sharedMemoryRow = {}) {
  const sharedMemoryId = toTrimmedText(sharedMemoryRow?.id, 64);
  const ownerUserId = toTrimmedText(sharedMemoryRow?.owner_user_id || sharedMemoryRow?.ownerUserId, 64);
  const content = toTrimmedText(sharedMemoryRow?.content, 1200);
  if (!sharedMemoryId || !ownerUserId || !content) return;

  try {
    const moderationInput = buildSharedMemoryModerationInput(content);
    const moderationResult = await runAsyncRelaxedModeration(moderationInput, {
      scene: 'boh_shared_memory',
      timeoutMs: SHARED_MEMORY_ASYNC_MODERATION_TIMEOUT_MS
    });

    await writeModerationAuditLog({
      targetId: sharedMemoryId,
      targetType: 'shared_memory',
      result: moderationResult,
      moderatorId: null
    });

    if (moderationResult.status !== UNIFIED_REJECTED_STATUS) return;

    await applySharedMemoryModerationDecision(sharedMemoryId, moderationResult);
    invalidateSharedMemoryCache(ownerUserId);
  } catch (error) {
    console.warn('公共记忆异步审查失败（不阻断）:', error);
  }
}

const tokenizeSharedMemoryQuery = (query = '') => {
  const safeQuery = toTrimmedText(query, 180).toLowerCase();
  if (!safeQuery) return [];
  const tokens = safeQuery.match(/[a-z0-9_/-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  return [...new Set(tokens)].slice(0, 24);
};

const buildSharedMemorySearchText = (row = {}) => {
  const content = String(row?.content || '');
  const mood = String(row?.mood || '');
  const tags = Array.isArray(row?.tags) ? row.tags.join(' ') : '';
  return `${content}\n${mood}\n${tags}`.toLowerCase();
};

const scoreSharedMemoryByQuery = (row = {}, query = '', tokens = []) => {
  const safeQuery = toTrimmedText(query, 180).toLowerCase();
  if (!safeQuery) return 0;

  const searchableText = buildSharedMemorySearchText(row);
  if (!searchableText) return 0;

  let score = 0;
  if (searchableText.includes(safeQuery)) {
    score += Math.min(8, Math.ceil(safeQuery.length / 3));
  }

  const safeTokens = Array.isArray(tokens) ? tokens : tokenizeSharedMemoryQuery(safeQuery);
  safeTokens.forEach((token) => {
    if (!token) return;
    if (searchableText.includes(token)) {
      score += Math.min(3, Math.ceil(token.length / 2));
    }
  });

  score += clampNumber(row?.confidence, 0, 1, 0) * 0.4;
  return score;
};

const buildDialogueContextForMemoryCapture = (messages = []) => {
  const source = Array.isArray(messages) ? messages : [];
  const selected = source
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: toTrimmedText(item?.content, TREEHOLE_AUTO_MEMORY_MAX_MESSAGE_CHARS)
    }))
    .filter((item) => item.content)
    .slice(-TREEHOLE_AUTO_MEMORY_MAX_MESSAGES);

  let userCounter = 0;
  let assistantCounter = 0;
  const turns = selected.map((item) => {
    if (item.role === 'assistant') {
      assistantCounter += 1;
      return { id: `a${assistantCounter}`, role: 'assistant', content: item.content };
    }
    userCounter += 1;
    return { id: `u${userCounter}`, role: 'user', content: item.content };
  });

  const userTurns = turns.filter((item) => item.role === 'user');
  const userTurnMap = new Map(userTurns.map((item) => [item.id, item]));
  const turnText = turns
    .map((turn) => `[${turn.id}][${turn.role}] ${turn.content}`)
    .join('\n');

  return {
    turns,
    userTurns,
    userTurnMap,
    turnText
  };
};

const inferEvidenceMessageId = (quote, userTurns = []) => {
  if (!quote) return '';
  const matched = userTurns.filter((item) => quoteExistsInSource(item.content, quote));
  if (matched.length !== 1) return '';
  return matched[0].id;
};

const normalizeCandidateEvidence = (evidence, userTurns = [], userTurnMap = new Map()) => {
  const source = Array.isArray(evidence) ? evidence : [];
  const output = [];
  const unique = new Set();

  for (const item of source) {
    let messageId = toTrimmedText(item?.messageId || item?.message_id, 24);
    const quote = toTrimmedText(item?.quote || item?.text || item, 240);
    if (!quote) continue;

    if (!messageId || !userTurnMap.has(messageId)) {
      messageId = inferEvidenceMessageId(quote, userTurns);
    }
    if (!messageId || !userTurnMap.has(messageId)) continue;

    const sourceMessage = userTurnMap.get(messageId)?.content || '';
    if (!quoteExistsInSource(sourceMessage, quote)) continue;

    const dedupeKey = `${messageId}::${normalizeQuoteLine(quote)}`;
    if (unique.has(dedupeKey)) continue;
    unique.add(dedupeKey);
    output.push({ messageId, quote });
    if (output.length >= TREEHOLE_AUTO_MEMORY_MAX_EVIDENCE) break;
  }

  return output;
};

const normalizeExtractedCandidate = (candidate = {}, userTurns = [], userTurnMap = new Map()) => {
  const content = toTrimmedText(
    candidate?.content || candidate?.memory || candidate?.summary || candidate?.fact,
    TREEHOLE_AUTO_MEMORY_CONTENT_MAX_CHARS
  );
  if (!content) return null;

  const evidence = normalizeCandidateEvidence(candidate?.evidence, userTurns, userTurnMap);
  if (evidence.length === 0) return null;

  const mood = toTrimmedText(candidate?.mood, 24);
  const tags = normalizeTags(candidate?.tags).slice(0, 6);
  const reason = toTrimmedText(candidate?.reason || candidate?.why, TREEHOLE_AUTO_MEMORY_REASON_MAX_CHARS);
  const confidence = clampNumber(candidate?.confidence, 0, 1, 0.5);

  return { content, mood, tags, reason, confidence, evidence };
};

const TREEHOLE_REQUIRED_SECTIONS = ['【结论】', '【依据（记忆编号）】', '【行动建议】', '【不确定项】'];

const extractMemoryCitationTokens = (text) => {
  const safeText = String(text || '');
  const matches = safeText.match(/记忆#\d+/g) || [];
  return [...new Set(matches)];
};

const hasTreeholeRequiredSections = (text) => {
  const safeText = String(text || '');
  return TREEHOLE_REQUIRED_SECTIONS.every((section) => safeText.includes(section));
};

const requestTreeholeCompletion = async ({
  messages = [],
  model = TREEHOLE_LONG_MEMORY_MODEL,
  temperature = 0.4,
  maxTokens = 900,
  timeoutMs = 28000,
  signal = null
} = {}) => {
  const safeTimeout = Number.isFinite(timeoutMs)
    ? Math.max(5000, Math.min(120000, Math.trunc(timeoutMs)))
    : 28000;
  const controller = new AbortController();
  let timeoutId = null;
  let abortedByTimeout = false;
  const handleExternalAbort = () => {
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  if (safeTimeout > 0) {
    timeoutId = setTimeout(() => {
      abortedByTimeout = true;
      controller.abort();
    }, safeTimeout);
  }

  try {
    const response = await fetch(SILICON_CLOUD_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SILICON_CLOUD_API_KEY}`
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature,
        max_tokens: maxTokens,
        messages
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          message: result?.error?.message || `AI 请求失败(${response.status})`,
          code: result?.error?.code || 'AI_REQUEST_FAILED'
        })
      };
    }

    const reply = toTrimmedText(result?.choices?.[0]?.message?.content, 16000);
    if (!reply) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ message: 'AI 未返回有效内容', code: 'AI_EMPTY_REPLY' })
      };
    }

    return {
      ok: true,
      data: {
        reply,
        model: result?.model || model,
        usage: result?.usage || null
      },
      error: null
    };
  } catch (error) {
    const isAbortError = error?.name === 'AbortError';
    if (isAbortError) {
      if (abortedByTimeout) {
        return {
          ok: false,
          data: null,
          error: normalizeDbError({ message: 'AI 请求超时，请稍后重试。', code: 'AI_TIMEOUT' })
        };
      }
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ message: 'AI 请求已取消。', code: 'AI_ABORTED' })
      };
    }
    return { ok: false, data: null, error: normalizeDbError(error) };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', handleExternalAbort);
    }
  }
};

const buildStrictTreeholeMemoryContext = async (memories = [], { signal = null } = {}) => {
  const { memoryCount, chunks } = buildTreeholeMemoryChunks(memories);

  if (memoryCount === 0 || chunks.length === 0) {
    return {
      ok: true,
      data: {
        context: '当前没有可用记忆。',
        coverage: { memoryCount: 0, chunkCount: 0, mode: 'empty' }
      },
      error: null
    };
  }

  if (chunks.length === 1 && chunks[0].text.length <= TREEHOLE_DIRECT_CONTEXT_CHARS) {
    return {
      ok: true,
      data: {
        context: chunks[0].text,
        coverage: { memoryCount, chunkCount: 1, mode: 'full-context' }
      },
      error: null
    };
  }

  const chunkSummaries = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const summaryResult = await requestTreeholeCompletion({
      model: TREEHOLE_LONG_MEMORY_MODEL,
      temperature: 0.2,
      maxTokens: 1200,
      signal,
      messages: [
        {
          role: 'system',
          content: '你是 BOH 树洞记忆阅读器。你必须严格逐条阅读输入中的每一条记忆片段，禁止编造不存在的信息。所有结论都必须附带记忆编号，引用格式固定为 [记忆#数字] 或 [记忆#数字,记忆#数字]。'
        },
        {
          role: 'user',
          content: `这是第 ${i + 1}/${chunks.length} 组记忆片段，共覆盖约 ${chunk.memoryCount} 条记忆。请严格按以下模板输出（不要省略标题）：\n\n已阅读完成：第 ${i + 1} 组\n本组事实要点：\n- [记忆#x] ...\n本组情绪与高频主题：\n- [记忆#x] ...\n本组时间线线索：\n- [记忆#x] 先/后 ...\n潜在冲突或待澄清点：\n- [记忆#x] ...\n\n要求：\n1) 每条要点至少带一个 [记忆#] 引用。\n2) 若某一节没有明确信息，请写“暂无明确信息”，不要编造。\n3) 只基于本组片段，不要引用组外内容。\n\n记忆片段如下：\n\n${chunk.text}`
        }
      ]
    });

    if (!summaryResult.ok) {
      return summaryResult;
    }

    chunkSummaries.push(`【记忆分组 ${i + 1}/${chunks.length} 摘要】\n${summaryResult.data.reply}`);
  }

  return {
    ok: true,
    data: {
      context: `以下内容为系统按顺序逐组阅读“全部树洞记忆片段”后的摘要。每条摘要都应包含记忆编号引用，你必须仅基于这些依据作答：\n\n${chunkSummaries.join('\n\n')}`,
      coverage: { memoryCount, chunkCount: chunks.length, mode: 'chunk-summary' }
    },
    error: null
  };
};

export async function getMyTreeholeSpace(userId) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const result = await executeRead(
    'treehole.getMySpace',
    { userId: safeUserId },
    async () => {
      const { data, error } = await supabase
        .from('boh_treehole_spaces')
        .select(TREEHOLE_SPACE_COLUMNS)
        .eq('user_id', safeUserId)
        .maybeSingle();
      return { data: normalizeSpaceRow(data), error };
    },
    { ttlMs: 5000, tags: [TREEHOLE_CACHE_TAG, `${TREEHOLE_CACHE_TAG}:user:${safeUserId}`], timeoutMs: 8000, retry: 1 }
  );

  return result;
}

export async function createMyTreeholeSpace(userId, { title = '', description = '' } = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeTitle = toTrimmedText(title, 60) || '我的 BOH 树洞';
  const safeDescription = toTrimmedText(description, 280);

  const { data, error } = await supabase
    .from('boh_treehole_spaces')
    .insert([{
      user_id: safeUserId,
      title: safeTitle,
      description: safeDescription
    }])
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      const existing = await getMyTreeholeSpace(safeUserId);
      if (existing.ok) {
        return { ok: true, data: existing.data, error: null, alreadyExists: true };
      }
    }
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: normalizeSpaceRow(data), error: null, alreadyExists: false };
}

export async function updateMyTreeholeSpace(userId, { title, description } = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const updates = {};
  if (typeof title !== 'undefined') updates.title = toTrimmedText(title, 60) || '我的 BOH 树洞';
  if (typeof description !== 'undefined') updates.description = toTrimmedText(description, 280);

  if (Object.keys(updates).length === 0) {
    return { ok: true, data: null, error: null };
  }

  const { data, error } = await supabase
    .from('boh_treehole_spaces')
    .update(updates)
    .eq('user_id', safeUserId)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '树洞空间不存在或无权限', code: 'TREEHOLE_SPACE_NOT_FOUND' })
    };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: normalizeSpaceRow(data), error: null };
}

export async function deleteMyTreeholeSpace(userId) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const { error, count } = await supabase
    .from('boh_treehole_spaces')
    .delete({ count: 'exact' })
    .eq('user_id', safeUserId);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (Number(count || 0) === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '树洞空间不存在或无权限', code: 'TREEHOLE_SPACE_NOT_FOUND' })
    };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: null, error: null };
}

export async function getMyTreeholeMemories({
  userId,
  page = 1,
  pageSize = 20,
  search = '',
  starredOnly = false,
  cursor = '',
  countMode = 'planned'
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 20;
  const safeSearch = toTrimmedText(search, 80);
  const safeStarredOnly = Boolean(starredOnly);
  const safeCursorToken = toTrimmedText(cursor, 500);
  const safeCursor = decodeCursorToken(safeCursorToken, 'updatedAt');
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const useCursorMode = Boolean(safeCursor);

  return executeRead(
    'treehole.getMyMemories',
    {
      userId: safeUserId,
      page: safePage,
      pageSize: safePageSize,
      search: safeSearch,
      starredOnly: safeStarredOnly,
      cursor: safeCursorToken,
      countMode: safeCountMode
    },
    async () => {
      if (useCursorMode) {
        let cursorQuery = supabase
          .from('boh_treehole_memories')
          .select(TREEHOLE_MEMORY_COLUMNS)
          .eq('user_id', safeUserId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(safePageSize + 1);

        if (safeStarredOnly) {
          cursorQuery = cursorQuery.eq('is_starred', true);
        }
        if (safeSearch) {
          cursorQuery = cursorQuery.ilike('content', `%${safeSearch}%`);
        }
        if (safeCursor?.updatedAt) {
          cursorQuery = cursorQuery.lt('updated_at', safeCursor.updatedAt);
        }

        const { data, error } = await cursorQuery;
        const safeRows = Array.isArray(data) ? data : [];
        const hasMore = safeRows.length > safePageSize;
        const pagedRows = safeRows.slice(0, safePageSize);
        const nextCursor = buildNextUpdatedAtCursor(pagedRows, hasMore);

        return {
          data: {
            items: pagedRows.map(normalizeMemoryRow),
            total: 0,
            page: safePage,
            pageSize: safePageSize,
            nextCursor
          },
          error,
          hasMore,
          nextCursor
        };
      }

      let query = supabase
        .from('boh_treehole_memories')
        .select(TREEHOLE_MEMORY_COLUMNS, { count: safeCountMode })
        .eq('user_id', safeUserId)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (safeStarredOnly) {
        query = query.eq('is_starred', true);
      }
      if (safeSearch) {
        query = query.ilike('content', `%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      return {
        data: {
          items: Array.isArray(data) ? data.map(normalizeMemoryRow) : [],
          total: Number(count || 0),
          page: safePage,
          pageSize: safePageSize,
          nextCursor: ''
        },
        error
      };
    },
    {
      ttlMs: 4000,
      tags: [TREEHOLE_CACHE_TAG, `${TREEHOLE_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function getMyTreeholeMemoriesByRange({
  userId,
  startAt = '',
  endAt = '',
  page = 1,
  pageSize = 20,
  search = '',
  starredOnly = false,
  cursor = '',
  countMode = 'planned'
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeStartAt = normalizeDateRangeBoundary(startAt);
  const safeEndAt = normalizeDateRangeBoundary(endAt);
  if (!safeStartAt || !safeEndAt || toTimestamp(safeStartAt) > toTimestamp(safeEndAt)) {
    return { ok: false, data: null, error: normalizeDbError({ message: '时间范围无效', code: 'INVALID_DATE_RANGE' }) };
  }

  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 20;
  const safeSearch = toTrimmedText(search, 80);
  const safeStarredOnly = Boolean(starredOnly);
  const safeCursorToken = toTrimmedText(cursor, 500);
  const safeCursor = decodeCursorToken(safeCursorToken, 'updatedAt');
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const useCursorMode = Boolean(safeCursor);

  return executeRead(
    'treehole.getMyMemoriesByRange',
    {
      userId: safeUserId,
      startAt: safeStartAt,
      endAt: safeEndAt,
      page: safePage,
      pageSize: safePageSize,
      search: safeSearch,
      starredOnly: safeStarredOnly,
      cursor: safeCursorToken,
      countMode: safeCountMode
    },
    async () => {
      if (useCursorMode) {
        let cursorQuery = supabase
          .from('boh_treehole_memories')
          .select(TREEHOLE_MEMORY_COLUMNS)
          .eq('user_id', safeUserId)
          .gte('updated_at', safeStartAt)
          .lte('updated_at', safeEndAt)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(safePageSize + 1);

        if (safeStarredOnly) {
          cursorQuery = cursorQuery.eq('is_starred', true);
        }
        if (safeSearch) {
          cursorQuery = cursorQuery.ilike('content', `%${safeSearch}%`);
        }
        if (safeCursor?.updatedAt) {
          cursorQuery = cursorQuery.lt('updated_at', safeCursor.updatedAt);
        }

        const { data, error } = await cursorQuery;
        const safeRows = Array.isArray(data) ? data : [];
        const hasMore = safeRows.length > safePageSize;
        const pagedRows = safeRows.slice(0, safePageSize);
        const nextCursor = buildNextUpdatedAtCursor(pagedRows, hasMore);

        return {
          data: {
            items: pagedRows.map(normalizeMemoryRow),
            total: 0,
            page: safePage,
            pageSize: safePageSize,
            startAt: safeStartAt,
            endAt: safeEndAt,
            nextCursor
          },
          error,
          hasMore,
          nextCursor
        };
      }

      let query = supabase
        .from('boh_treehole_memories')
        .select(TREEHOLE_MEMORY_COLUMNS, { count: safeCountMode })
        .eq('user_id', safeUserId)
        .gte('updated_at', safeStartAt)
        .lte('updated_at', safeEndAt)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (safeStarredOnly) {
        query = query.eq('is_starred', true);
      }
      if (safeSearch) {
        query = query.ilike('content', `%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      return {
        data: {
          items: Array.isArray(data) ? data.map(normalizeMemoryRow) : [],
          total: Number(count || 0),
          page: safePage,
          pageSize: safePageSize,
          startAt: safeStartAt,
          endAt: safeEndAt,
          nextCursor: ''
        },
        error
      };
    },
    {
      ttlMs: 4000,
      tags: [TREEHOLE_CACHE_TAG, `${TREEHOLE_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function getMyTreeholeMemoryDensity({
  userId,
  startAt = '',
  endAt = ''
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeStartAt = normalizeDateRangeBoundary(startAt);
  const safeEndAt = normalizeDateRangeBoundary(endAt);
  if (!safeStartAt || !safeEndAt || toTimestamp(safeStartAt) > toTimestamp(safeEndAt)) {
    return { ok: false, data: null, error: normalizeDbError({ message: '时间范围无效', code: 'INVALID_DATE_RANGE' }) };
  }

  return executeRead(
    'treehole.getMyMemoryDensity',
    { userId: safeUserId, startAt: safeStartAt, endAt: safeEndAt },
    async () => {
      const counts = {};
      let total = 0;
      const pageSize = 1000;
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .from('boh_treehole_memories')
          .select('updated_at, created_at')
          .eq('user_id', safeUserId)
          .gte('updated_at', safeStartAt)
          .lte('updated_at', safeEndAt)
          .order('updated_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (error) {
          return { data: null, error };
        }

        const batch = Array.isArray(data) ? data : [];
        for (const row of batch) {
          const key = toDateKey(row?.updated_at || row?.created_at);
          if (!key) continue;
          counts[key] = Number(counts[key] || 0) + 1;
          total += 1;
        }

        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      return {
        data: {
          total,
          counts,
          startAt: safeStartAt,
          endAt: safeEndAt
        },
        error: null
      };
    },
    {
      ttlMs: 3500,
      tags: [TREEHOLE_CACHE_TAG, `${TREEHOLE_CACHE_TAG}:user:${safeUserId}`],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function getMyTreeholeMemoriesForAI(userId, { limit = 0, pageSize = TREEHOLE_MEMORY_FETCH_PAGE_SIZE } = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(500, Math.max(20, Math.trunc(pageSize))) : TREEHOLE_MEMORY_FETCH_PAGE_SIZE;

  const rows = [];
  let offset = 0;
  let shouldContinue = true;

  while (shouldContinue) {
    const rangeEnd = offset + safePageSize - 1;
    const effectiveRangeEnd = safeLimit > 0 ? Math.min(rangeEnd, safeLimit - 1) : rangeEnd;

    if (safeLimit > 0 && offset > effectiveRangeEnd) {
      break;
    }

    const { data, error } = await supabase
      .from('boh_treehole_memories')
      .select(TREEHOLE_MEMORY_COLUMNS)
      .eq('user_id', safeUserId)
      .order('updated_at', { ascending: false })
      .range(offset, effectiveRangeEnd);

    if (error) {
      return { ok: false, data: [], error: normalizeDbError(error) };
    }

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);

    if (batch.length < safePageSize) {
      shouldContinue = false;
    } else {
      offset += safePageSize;
    }

    if (safeLimit > 0 && rows.length >= safeLimit) {
      rows.length = safeLimit;
      shouldContinue = false;
    }
  }

  return {
    ok: true,
    data: rows.map(normalizeMemoryRow),
    error: null
  };
}

export async function getSharedAIMemoriesForAI({ limit = TREEHOLE_SHARED_MEMORY_FETCH_LIMIT } = {}) {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(TREEHOLE_SHARED_MEMORY_FETCH_LIMIT, Math.trunc(limit)))
    : TREEHOLE_SHARED_MEMORY_FETCH_LIMIT;

  return executeRead(
    'sharedMemory.getForAI',
    { limit: safeLimit },
    async () => {
      let result = await supabase
        .from('boh_ai_shared_memories')
        .select(TREEHOLE_SHARED_MEMORY_COLUMNS_WITH_MODERATION)
        .eq('status', 'active')
        .eq('moderation_status', UNIFIED_APPROVED_STATUS)
        .order('updated_at', { ascending: false })
        .limit(safeLimit);

      if (result.error && isMissingSharedMemoryModerationColumnError(result.error)) {
        result = await supabase
          .from('boh_ai_shared_memories')
          .select(TREEHOLE_SHARED_MEMORY_COLUMNS)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(safeLimit);
      }

      return {
        data: Array.isArray(result.data) ? result.data.map(normalizeSharedMemoryRow).filter(Boolean) : [],
        error: result.error || null
      };
    },
    {
      ttlMs: 12000,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function searchSharedAIMemoriesForAI({ query = '', limit = 12 } = {}) {
  const safeQuery = toTrimmedText(query, 180);
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(TREEHOLE_SHARED_MEMORY_SEARCH_LIMIT, Math.trunc(limit)))
    : 12;

  return executeRead(
    'sharedMemory.searchForAI',
    { query: safeQuery, limit: safeLimit },
    async () => {
      if (!safeQuery) {
        const latestResult = await getSharedAIMemoriesForAI({ limit: safeLimit });
        return {
          data: Array.isArray(latestResult?.data) ? latestResult.data : [],
          error: latestResult?.error || null
        };
      }

      const { data, error } = await supabase.rpc('search_boh_ai_shared_memories', {
        p_query: safeQuery,
        p_limit: safeLimit
      });

      if (!error) {
        return {
          data: Array.isArray(data) ? data.map(normalizeSharedMemoryRow).filter(Boolean) : [],
          error: null
        };
      }

      if (!isMissingSharedMemorySearchFunctionError(error)) {
        return { data: [], error };
      }

      // 兼容旧环境：RPC 未部署时回退到本地打分筛选。
      const fallbackLimit = Math.min(
        TREEHOLE_SHARED_MEMORY_FETCH_LIMIT,
        Math.max(80, safeLimit * 8)
      );
      const fallbackResult = await getSharedAIMemoriesForAI({ limit: fallbackLimit });
      if (!fallbackResult.ok) {
        return {
          data: [],
          error: fallbackResult.error
        };
      }

      const source = Array.isArray(fallbackResult.data) ? fallbackResult.data : [];
      const tokens = tokenizeSharedMemoryQuery(safeQuery);
      const ranked = source
        .map((row) => ({
          row,
          score: scoreSharedMemoryByQuery(row, safeQuery, tokens)
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(b.row?.updatedAt || '').localeCompare(String(a.row?.updatedAt || ''));
        })
        .map((item) => item.row);

      const selected = (ranked.length > 0 ? ranked : source).slice(0, safeLimit);
      return {
        data: selected,
        error: null
      };
    },
    {
      ttlMs: 10000,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function searchBohAIKnowledgeForAI({
  query = '',
  sourceTypes = ['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'],
  limit = 8,
  ensureIndexed = true,
  syncLimit = 40,
  minSimilarity = 0.18
} = {}) {
  const safeQuery = toTrimmedText(query, 220);
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(24, Math.trunc(limit)))
    : 8;
  const safeSyncLimit = Number.isFinite(syncLimit)
    ? Math.max(1, Math.min(80, Math.trunc(syncLimit)))
    : 40;
  const safeSourceTypes = Array.isArray(sourceTypes)
    ? sourceTypes
      .map((item) => String(item || '').trim())
      .filter((item) => ['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'].includes(item))
    : ['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base'];

  if (!safeQuery || safeSourceTypes.length === 0) {
    return { ok: true, data: { chunks: [], sourceTypes: safeSourceTypes }, error: null };
  }

  return executeRead(
    'bohAIKnowledge.vectorSearch',
    {
      query: safeQuery,
      sourceTypes: safeSourceTypes,
      limit: safeLimit,
      ensureIndexed: Boolean(ensureIndexed),
      syncLimit: safeSyncLimit,
      minSimilarity
    },
    async () => {
      const { data, error } = await supabase.functions.invoke('boh-ai-retrieval', {
        body: {
          action: 'search',
          query: safeQuery,
          sourceTypes: safeSourceTypes,
          matchCount: safeLimit,
          ensureIndexed: Boolean(ensureIndexed),
          syncLimit: safeSyncLimit,
          minSimilarity
        }
      });

      if (error) return { data: null, error };
      const payload = data && typeof data === 'object' ? data : {};
      if (payload.ok === false) {
        return {
          data: null,
          error: { message: payload.message || '向量检索失败', code: 'VECTOR_SEARCH_FAILED' }
        };
      }

      return {
        data: payload.data || { chunks: [], sourceTypes: safeSourceTypes },
        error: null
      };
    },
    {
      ttlMs: 15000,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG],
      timeoutMs: 25000,
      retry: 0
    }
  );
}

export async function createSharedAIMemory(userId, payload = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const content = toTrimmedText(payload.content, 1200);
  const mood = toTrimmedText(payload.mood, 24);
  const tags = normalizeTags(payload.tags);
  const confidence = clampNumber(payload.confidence, 0, 1, 0);
  const evidence = normalizeEvidence(payload.evidence);
  const source = payload.source === 'manual' ? 'manual' : 'capture';
  const status = payload.status === 'archived' ? 'archived' : 'active';

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆内容不能为空', code: 'EMPTY_SHARED_MEMORY' }) };
  }

  const moderationInput = buildSharedMemoryModerationInput(content);
  const keywordCheckResult = runKeywordPrecheck(moderationInput, { scene: 'boh_shared_memory' });
  if (keywordCheckResult.status === UNIFIED_REJECTED_STATUS) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        message: keywordCheckResult.message || '命中高风险违禁词，已拒绝写入公共记忆',
        code: 'LOCAL_KEYWORD_BLOCK'
      })
    };
  }

  const basePayload = {
    owner_user_id: safeUserId,
    content,
    mood,
    tags,
    confidence,
    evidence,
    source,
    status
  };
  const { data, error } = await insertSharedMemoryWithModerationCompatibility(basePayload);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '公共记忆不存在或无权限', code: 'SHARED_MEMORY_NOT_FOUND' })
    };
  }

  const insertedSharedMemoryId = toTrimmedText(data?.id, 64);
  invalidateSharedMemoryCache(safeUserId);
  if (status === 'active') {
    void supabase.functions.invoke('boh-ai-retrieval', {
      body: {
        action: 'sync',
        sourceTypes: ['shared_memory'],
        syncLimit: 8
      }
    }).catch(() => {});
  }
  if (insertedSharedMemoryId) {
    void scheduleSharedMemoryModeration({
      id: insertedSharedMemoryId,
      owner_user_id: safeUserId,
      content
    });
  }
  return { ok: true, data: normalizeSharedMemoryRow(data), error: null };
}

export async function getMySharedAIMemories({
  userId,
  page = 1,
  pageSize = 20,
  status = 'all',
  cursor = '',
  countMode = 'planned'
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safePage = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Math.trunc(pageSize))) : 20;
  const safeStatus = status === 'active' || status === 'archived' ? status : 'all';
  const safeCursorToken = toTrimmedText(cursor, 500);
  const safeCursor = decodeCursorToken(safeCursorToken, 'updatedAt');
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const useCursorMode = Boolean(safeCursor);

  return executeRead(
    'sharedMemory.getMine',
    {
      userId: safeUserId,
      page: safePage,
      pageSize: safePageSize,
      status: safeStatus,
      cursor: safeCursorToken,
      countMode: safeCountMode
    },
    async () => {
      if (useCursorMode) {
        let cursorQuery = supabase
          .from('boh_ai_shared_memories')
          .select(TREEHOLE_SHARED_MEMORY_COLUMNS)
          .eq('owner_user_id', safeUserId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(safePageSize + 1);

        if (safeStatus !== 'all') {
          cursorQuery = cursorQuery.eq('status', safeStatus);
        }
        if (safeCursor?.updatedAt) {
          cursorQuery = cursorQuery.lt('updated_at', safeCursor.updatedAt);
        }

        const { data, error } = await cursorQuery;
        const safeRows = Array.isArray(data) ? data : [];
        const hasMore = safeRows.length > safePageSize;
        const pagedRows = safeRows.slice(0, safePageSize);
        const nextCursor = buildNextUpdatedAtCursor(pagedRows, hasMore);

        return {
          data: {
            items: pagedRows.map(normalizeSharedMemoryRow).filter(Boolean),
            total: 0,
            page: safePage,
            pageSize: safePageSize,
            nextCursor
          },
          error,
          hasMore,
          nextCursor
        };
      }

      let query = supabase
        .from('boh_ai_shared_memories')
        .select(TREEHOLE_SHARED_MEMORY_COLUMNS, { count: safeCountMode })
        .eq('owner_user_id', safeUserId)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (safeStatus !== 'all') {
        query = query.eq('status', safeStatus);
      }

      const { data, error, count } = await query;
      return {
        data: {
          items: Array.isArray(data) ? data.map(normalizeSharedMemoryRow).filter(Boolean) : [],
          total: Number(count || 0),
          page: safePage,
          pageSize: safePageSize,
          nextCursor: ''
        },
        error
      };
    },
    {
      ttlMs: 4000,
      tags: [TREEHOLE_SHARED_MEMORY_CACHE_TAG, buildSharedMemoryOwnerTag(safeUserId)],
      timeoutMs: 9000,
      retry: 1
    }
  );
}

export async function updateSharedAIMemory(userId, sharedMemoryId, updates = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeSharedMemoryId = toTrimmedText(sharedMemoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeSharedMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆 ID 无效', code: 'INVALID_SHARED_MEMORY_ID' }) };
  }

  const patch = {};
  if (typeof updates.content !== 'undefined') {
    patch.content = toTrimmedText(updates.content, 1200);
  }
  if (typeof updates.mood !== 'undefined') {
    patch.mood = toTrimmedText(updates.mood, 24);
  }
  if (typeof updates.tags !== 'undefined') {
    patch.tags = normalizeTags(updates.tags);
  }
  if (typeof updates.status !== 'undefined') {
    const safeStatus = updates.status === 'archived' ? 'archived' : (updates.status === 'active' ? 'active' : '');
    if (!safeStatus) {
      return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆状态无效', code: 'INVALID_SHARED_MEMORY_STATUS' }) };
    }
    patch.status = safeStatus;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'content') && !patch.content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆内容不能为空', code: 'EMPTY_SHARED_MEMORY' }) };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, data: null, error: null };
  }

  const { data, error } = await supabase
    .from('boh_ai_shared_memories')
    .update(patch)
    .eq('id', safeSharedMemoryId)
    .eq('owner_user_id', safeUserId)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '公共记忆不存在或无权限', code: 'SHARED_MEMORY_NOT_FOUND' })
    };
  }

  invalidateSharedMemoryCache(safeUserId);
  return { ok: true, data: normalizeSharedMemoryRow(data), error: null };
}

export async function updateSharedAIMemoryStatus(userId, sharedMemoryId, status = 'active') {
  return updateSharedAIMemory(userId, sharedMemoryId, { status });
}

export async function deleteSharedAIMemory(userId, sharedMemoryId) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeSharedMemoryId = toTrimmedText(sharedMemoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeSharedMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '公共记忆 ID 无效', code: 'INVALID_SHARED_MEMORY_ID' }) };
  }

  const { error, count } = await supabase
    .from('boh_ai_shared_memories')
    .delete({ count: 'exact' })
    .eq('id', safeSharedMemoryId)
    .eq('owner_user_id', safeUserId);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (Number(count || 0) === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '公共记忆不存在或无权限', code: 'SHARED_MEMORY_NOT_FOUND' })
    };
  }

  invalidateSharedMemoryCache(safeUserId);
  return { ok: true, data: null, error: null };
}

export async function getMyTreeholeStats(userId) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const [totalResult, starredResult] = await Promise.all([
    supabase
      .from('boh_treehole_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', safeUserId),
    supabase
      .from('boh_treehole_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', safeUserId)
      .eq('is_starred', true)
  ]);

  if (totalResult.error) {
    return { ok: false, data: null, error: normalizeDbError(totalResult.error) };
  }
  if (starredResult.error) {
    return { ok: false, data: null, error: normalizeDbError(starredResult.error) };
  }

  return {
    ok: true,
    data: {
      totalMemories: Number(totalResult.count || 0),
      starredMemories: Number(starredResult.count || 0)
    },
    error: null
  };
}

export async function createTreeholeMemory(userId, payload = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const content = toTrimmedText(payload.content, 12000);
  const mood = toTrimmedText(payload.mood, 24);
  const source = payload.source === 'ai' ? 'ai' : 'manual';
  const isStarred = Boolean(payload.isStarred);
  const tags = normalizeTags(payload.tags);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆内容不能为空', code: 'EMPTY_MEMORY' }) };
  }

  const { data, error } = await supabase
    .from('boh_treehole_memories')
    .insert([{
      user_id: safeUserId,
      content,
      mood,
      tags,
      is_starred: isStarred,
      source
    }])
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({ message: '请先创建记忆空间', code: 'TREEHOLE_SPACE_REQUIRED' })
      };
    }
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: normalizeMemoryRow(data), error: null };
}

const ensureTreeholeSpaceEnabledForUser = async (userId) => {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const existing = await getMyTreeholeSpace(safeUserId);
  if (!existing.ok) {
    return existing;
  }
  if (!existing.data?.userId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '你尚未开启树洞，请先前往个人中心创建树洞。', code: 'TREEHOLE_SPACE_REQUIRED' })
    };
  }

  return existing;
};

const loadRecentCandidateContentsForDedup = async (userId, { limit = 120 } = {}) => {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.trunc(limit))) : 120;
  const { data, error } = await supabase
    .from('boh_treehole_memory_candidates')
    .select(TREEHOLE_CANDIDATE_COLUMNS)
    .eq('user_id', safeUserId)
    .in('status', ['pending', 'auto_saved'])
    .order('updated_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    return { ok: false, data: [], error: normalizeDbError(error) };
  }

  const rows = Array.isArray(data) ? data.map(normalizeMemoryCandidateRow).filter(Boolean) : [];
  return { ok: true, data: rows, error: null };
};

const insertTreeholeMemoryCandidate = async (userId, payload = {}) => {
  const safeUserId = toTrimmedText(userId, 64);
  const content = toTrimmedText(payload.content, 1200);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '候选内容不能为空', code: 'EMPTY_CANDIDATE' }) };
  }

  const row = {
    user_id: safeUserId,
    content,
    mood: toTrimmedText(payload.mood, 24),
    tags: normalizeTags(payload.tags),
    confidence: clampNumber(payload.confidence, 0, 1, 0),
    evidence: normalizeEvidence(payload.evidence),
    status: normalizeCandidateStatus(payload.status),
    session_id: toTrimmedText(payload.sessionId, 120),
    reason: toTrimmedText(payload.reason, 240),
    model: toTrimmedText(payload.model, 120),
    memory_id: toTrimmedText(payload.memoryId, 64) || null
  };

  const { data, error } = await supabase
    .from('boh_treehole_memory_candidates')
    .insert([row])
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateTreeholeCandidateCache(safeUserId);
  return { ok: true, data: normalizeMemoryCandidateRow(data), error: null };
};

export async function extractMemoryCandidatesFromDialogue({
  messages = [],
  maxCandidates = TREEHOLE_AUTO_MEMORY_MAX_CANDIDATES,
  model = TREEHOLE_AUTO_MEMORY_MODEL
} = {}) {
  if (!SILICON_CLOUD_API_KEY) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '缺少 AI Key，请配置 VITE_SILICON_CLOUD_API_KEY', code: 'AI_KEY_MISSING' })
    };
  }

  const context = buildDialogueContextForMemoryCapture(messages);
  if (context.userTurns.length === 0 || !context.turnText) {
    return {
      ok: true,
      data: {
        candidates: [],
        turnCount: context.turns.length,
        userTurnCount: context.userTurns.length
      },
      error: null
    };
  }

  const safeMaxCandidates = Number.isFinite(maxCandidates)
    ? Math.min(8, Math.max(1, Math.trunc(maxCandidates)))
    : TREEHOLE_AUTO_MEMORY_MAX_CANDIDATES;

  const instruction = `你是“BOH 对话记忆抽取器”。任务：仅从用户消息提取可长期复用的事实记忆候选，并输出严格 JSON。
只允许提取以下类型：
1) 稳定偏好（长期喜欢/讨厌）
2) 稳定背景信息（身份、长期环境）
3) 长期目标与计划
4) 反复出现的问题模式
禁止提取：
- 一次性闲聊
- AI 自己说过的话
- 没有证据的推断
- 涉及隐私风险且用户未明确表达愿意长期记录的信息

输出格式（仅 JSON，不要 Markdown）：
{
  "candidates": [
    {
      "content": "候选记忆句子，第一人称，80字以内",
      "mood": "可空字符串",
      "tags": ["标签1", "标签2"],
      "confidence": 0.0,
      "reason": "为何建议保存，30字以内",
      "evidence": [
        { "messageId": "u1", "quote": "必须是用户原话片段" }
      ]
    }
  ]
}

硬性要求：
1) evidence 的 messageId 必须是用户消息编号（u 开头）。
2) quote 必须可在对应用户消息中逐字匹配。
3) 若无法满足证据要求，返回空数组。
4) 候选数量最多 ${safeMaxCandidates} 条。`;

  const result = await requestTreeholeCompletion({
    model,
    temperature: 0.2,
    maxTokens: 1200,
    messages: [
      { role: 'system', content: instruction },
      {
        role: 'user',
        content: `以下是最近对话（含用户与助手），请仅基于用户消息抽取记忆候选：\n\n${context.turnText}`
      }
    ]
  });

  if (!result.ok) {
    return result;
  }

  const parsed = parseJsonDataFromText(result.data?.reply);
  const rawCandidates = Array.isArray(parsed?.candidates)
    ? parsed.candidates
    : (Array.isArray(parsed) ? parsed : []);

  const candidates = rawCandidates
    .slice(0, safeMaxCandidates)
    .map((item) => normalizeExtractedCandidate(item, context.userTurns, context.userTurnMap))
    .filter(Boolean);

  return {
    ok: true,
    data: {
      candidates,
      turnCount: context.turns.length,
      userTurnCount: context.userTurns.length,
      model: result.data?.model || model
    },
    error: null
  };
}

export async function captureTreeholeMemoriesFromDialogue({
  userId,
  sessionId = '',
  messages = [],
  maxCandidates = TREEHOLE_AUTO_MEMORY_MAX_CANDIDATES,
  minConfidence = TREEHOLE_AUTO_MEMORY_MIN_CONFIDENCE,
  autoSaveConfidence = TREEHOLE_AUTO_MEMORY_AUTOSAVE_CONFIDENCE,
  writeToTreehole = false,
  writeToShared = true
} = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }

  const safeMessages = Array.isArray(messages) ? messages : [];
  if (safeMessages.length === 0) {
    return {
      ok: true,
      data: {
        extractedCount: 0,
        savedCount: 0,
        sharedSavedCount: 0,
        treeholeSavedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        items: []
      },
      error: null
    };
  }

  if (!writeToShared && !writeToTreehole) {
    return {
      ok: true,
      data: {
        extractedCount: 0,
        savedCount: 0,
        sharedSavedCount: 0,
        treeholeSavedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        items: []
      },
      error: null
    };
  }

  if (writeToTreehole) {
    const spaceResult = await ensureTreeholeSpaceEnabledForUser(safeUserId);
    if (!spaceResult.ok) {
      return spaceResult;
    }
  }

  const extractionResult = await extractMemoryCandidatesFromDialogue({
    messages: safeMessages,
    maxCandidates
  });
  if (!extractionResult.ok) {
    return extractionResult;
  }

  const extractedCandidates = Array.isArray(extractionResult.data?.candidates)
    ? extractionResult.data.candidates
    : [];

  if (extractedCandidates.length === 0) {
    return {
      ok: true,
      data: {
        extractedCount: 0,
        savedCount: 0,
        sharedSavedCount: 0,
        treeholeSavedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        items: [],
        model: extractionResult.data?.model || TREEHOLE_AUTO_MEMORY_MODEL
      },
      error: null
    };
  }

  let existingTreeholeContents = [];
  if (writeToTreehole) {
    const existingMemoryResult = await getMyTreeholeMemoriesForAI(safeUserId, { limit: 240 });
    if (!existingMemoryResult.ok) {
      return existingMemoryResult;
    }
    existingTreeholeContents = Array.isArray(existingMemoryResult.data)
      ? existingMemoryResult.data.map((item) => item.content)
      : [];
  }

  let sharedTableAvailable = writeToShared;
  let existingSharedContents = [];
  if (writeToShared) {
    const existingSharedResult = await getSharedAIMemoriesForAI({ limit: 240 });
    if (existingSharedResult.ok) {
      existingSharedContents = Array.isArray(existingSharedResult.data)
        ? existingSharedResult.data.map((item) => item.content)
        : [];
    } else if (isMissingSharedMemoryTableError(existingSharedResult.error)) {
      sharedTableAvailable = false;
    } else {
      return existingSharedResult;
    }
  }

  let candidateTableAvailable = true;
  let candidateRows = [];
  const existingCandidateResult = await loadRecentCandidateContentsForDedup(safeUserId);
  if (existingCandidateResult.ok) {
    candidateRows = existingCandidateResult.data;
  } else if (isMissingCandidatesTableError(existingCandidateResult.error)) {
    candidateTableAvailable = false;
  } else {
    console.warn('读取候选记忆失败，将降级为仅基于正式记忆去重:', existingCandidateResult.error?.message || existingCandidateResult.error);
  }

  const existingContents = [
    ...existingTreeholeContents,
    ...existingSharedContents,
    ...candidateRows.map((item) => item.content)
  ];

  const stats = {
    extractedCount: extractedCandidates.length,
    savedCount: 0,
    sharedSavedCount: 0,
    treeholeSavedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    items: [],
    model: extractionResult.data?.model || TREEHOLE_AUTO_MEMORY_MODEL
  };

  const safeSessionId = toTrimmedText(sessionId, 120);
  const safeMinConfidence = clampNumber(minConfidence, 0, 1, TREEHOLE_AUTO_MEMORY_MIN_CONFIDENCE);
  const safeAutoSaveConfidence = clampNumber(
    autoSaveConfidence,
    0,
    1,
    TREEHOLE_AUTO_MEMORY_AUTOSAVE_CONFIDENCE
  );
  const saveCandidateToTreehole = async (candidate) => {
    return createTreeholeMemory(safeUserId, {
      content: candidate.content,
      mood: candidate.mood,
      tags: normalizeTags([
        ...(candidate.tags || []),
        'AI提取',
        writeToShared ? '公共记忆同步' : '私密树洞'
      ]).slice(0, 10),
      source: 'ai',
      isStarred: false
    });
  };
  const saveCandidateToShared = async (candidate) => {
    return createSharedAIMemory(safeUserId, {
      content: candidate.content,
      mood: candidate.mood,
      tags: normalizeTags([...(candidate.tags || []), 'AI公共记忆']).slice(0, 10),
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      source: 'capture',
      status: 'active'
    });
  };

  for (const candidate of extractedCandidates) {
    if (isLikelyDuplicateText(candidate.content, existingContents)) {
      stats.duplicateCount += 1;
      stats.items.push({
        content: candidate.content,
        status: 'duplicate',
        confidence: candidate.confidence
      });
      continue;
    }

    let status = 'pending';
    let reason = candidate.reason || '';
    let memoryId = '';
    let sharedMemoryId = '';
    const shouldAttemptSharedSave = writeToShared && candidate.confidence >= safeMinConfidence;

    if (shouldAttemptSharedSave && sharedTableAvailable) {
      const sharedSaveResult = await saveCandidateToShared(candidate);
      if (sharedSaveResult.ok) {
        status = 'auto_saved';
        sharedMemoryId = String(sharedSaveResult.data?.id || '');
        stats.savedCount += 1;
        stats.sharedSavedCount += 1;
      } else if (isMissingSharedMemoryTableError(sharedSaveResult.error)) {
        sharedTableAvailable = false;
        reason = toTrimmedText(
          `${reason ? `${reason}；` : ''}公共记忆库未初始化`,
          200
        );
        if (candidateTableAvailable) {
          status = 'pending';
          stats.pendingCount += 1;
        } else {
          status = 'rejected';
          stats.rejectedCount += 1;
        }
      } else if (candidateTableAvailable) {
        status = 'pending';
        reason = toTrimmedText(
          `${reason ? `${reason}；` : ''}公共记忆写入失败：${sharedSaveResult.error?.message || '未知错误'}`,
          200
        );
        stats.pendingCount += 1;
      } else {
        status = 'rejected';
        reason = toTrimmedText(
          `${reason ? `${reason}；` : ''}公共记忆写入失败且无法进入待确认`,
          200
        );
        stats.rejectedCount += 1;
      }
    } else if (shouldAttemptSharedSave && !sharedTableAvailable) {
      if (candidateTableAvailable) {
        status = 'pending';
        reason = toTrimmedText(
          `${reason ? `${reason}；` : ''}公共记忆库未初始化`,
          200
        );
        stats.pendingCount += 1;
      } else {
        status = 'rejected';
        reason = toTrimmedText(
          `${reason ? `${reason}；` : ''}公共记忆库未初始化且无候选缓冲表`,
          200
        );
        stats.rejectedCount += 1;
      }
    } else if (candidate.confidence >= safeMinConfidence) {
      status = 'pending';
      stats.pendingCount += 1;
    } else {
      status = 'rejected';
      stats.rejectedCount += 1;
    }

    const shouldSyncToTreehole = writeToTreehole && status !== 'rejected' && candidate.confidence >= safeAutoSaveConfidence;
    if (shouldSyncToTreehole) {
      const treeholeSaveResult = await saveCandidateToTreehole(candidate);
      if (treeholeSaveResult.ok) {
        memoryId = String(treeholeSaveResult.data?.id || '');
        stats.treeholeSavedCount += 1;
      } else {
        reason = toTrimmedText(
          `${reason ? `${reason}；` : ''}同步树洞失败：${treeholeSaveResult.error?.message || '未知错误'}`,
          200
        );
      }
    }

    let candidateId = '';
    if (candidateTableAvailable) {
      const insertResult = await insertTreeholeMemoryCandidate(safeUserId, {
        content: candidate.content,
        mood: candidate.mood,
        tags: candidate.tags,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
        status,
        sessionId: safeSessionId,
        reason,
        memoryId,
        model: stats.model
      });

      if (insertResult.ok) {
        candidateId = insertResult.data?.id || '';
      } else if (isMissingCandidatesTableError(insertResult.error)) {
        candidateTableAvailable = false;
      } else {
        console.warn('写入候选记忆失败:', insertResult.error?.message || insertResult.error);
      }
    }

    if (status !== 'rejected') {
      existingContents.push(candidate.content);
    }

    stats.items.push({
      id: candidateId,
      content: candidate.content,
      confidence: candidate.confidence,
      status,
      memoryId,
      sharedMemoryId
    });
  }

  if (stats.treeholeSavedCount > 0) {
    invalidateTreeholeCache(safeUserId);
  }
  if (stats.sharedSavedCount > 0) {
    invalidateSharedMemoryCache();
  }
  invalidateTreeholeCandidateCache(safeUserId);

  return { ok: true, data: stats, error: null };
}

export async function extractTreeholeMemoryHighlights({
  content = '',
  mood = ''
} = {}) {
  const rawContent = toTrimmedText(content, 12000);
  const moodHint = toTrimmedText(mood, 24);

  if (!rawContent) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '记忆内容不能为空', code: 'EMPTY_MEMORY' })
    };
  }

  if (!SILICON_CLOUD_API_KEY) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '缺少 AI Key，请配置 VITE_SILICON_CLOUD_API_KEY', code: 'AI_KEY_MISSING' })
    };
  }

  const instruction = `你是“树洞记忆提炼器”。请把用户输入提炼成便于复盘的重点，并严格返回 JSON（不要额外文字）。
输出 JSON 格式：
{
  "summary": "字符串，${TREEHOLE_MEMORY_SUMMARY_MAX_CHARS}字以内，保留核心事实与情绪线索",
  "mood": "字符串，尽量从：开心/平静/焦虑/兴奋/难过/愤怒/疲惫/期待 中选择最贴近的一项，无法判断可为空字符串",
  "tags": ["字符串数组，0-6个，每个不超过12字，尽量提炼主题词"]
}
要求：
1) 不编造用户没有表达的信息。
2) summary 用第一人称自然语言，简洁可读。
3) 如果原文过短，summary 可与原文接近，但也要尽量结构化。`;

  const result = await requestTreeholeCompletion({
    model: TREEHOLE_LONG_MEMORY_MODEL,
    temperature: 0.2,
    maxTokens: 420,
    messages: [
      { role: 'system', content: instruction },
      {
        role: 'user',
        content: `用户原始记忆：\n${rawContent}\n\n用户手动心情（可为空）：${moodHint || '未提供'}`
      }
    ]
  });

  if (!result.ok) {
    return result;
  }

  const parsed = parseJsonObjectFromText(result.data?.reply);
  const summary = toTrimmedText(parsed?.summary, TREEHOLE_MEMORY_SUMMARY_MAX_CHARS) || toTrimmedText(rawContent, TREEHOLE_MEMORY_SUMMARY_MAX_CHARS);
  const normalizedMood = toTrimmedText(parsed?.mood, 24);
  const tags = normalizeTags(Array.isArray(parsed?.tags) ? parsed.tags : []).slice(0, 6);

  return {
    ok: true,
    data: {
      summary,
      mood: normalizedMood,
      tags,
      model: result.data?.model || TREEHOLE_LONG_MEMORY_MODEL
    },
    error: null
  };
}

export async function updateTreeholeMemory(userId, memoryId, updates = {}) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeMemoryId = toTrimmedText(memoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆 ID 无效', code: 'INVALID_MEMORY_ID' }) };
  }

  const patch = {};
  if (typeof updates.content !== 'undefined') {
    patch.content = toTrimmedText(updates.content, 12000);
  }
  if (typeof updates.mood !== 'undefined') {
    patch.mood = toTrimmedText(updates.mood, 24);
  }
  if (typeof updates.tags !== 'undefined') {
    patch.tags = normalizeTags(updates.tags);
  }
  if (typeof updates.isStarred !== 'undefined') {
    patch.is_starred = Boolean(updates.isStarred);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'content') && !patch.content) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆内容不能为空', code: 'EMPTY_MEMORY' }) };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, data: null, error: null };
  }

  const { data, error } = await supabase
    .from('boh_treehole_memories')
    .update(patch)
    .eq('id', safeMemoryId)
    .eq('user_id', safeUserId)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (!data) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '记忆不存在或无权限', code: 'TREEHOLE_MEMORY_NOT_FOUND' })
    };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: normalizeMemoryRow(data), error: null };
}

export async function deleteTreeholeMemory(userId, memoryId) {
  const safeUserId = toTrimmedText(userId, 64);
  const safeMemoryId = toTrimmedText(memoryId, 64);

  if (!safeUserId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请先登录', code: 'NOT_AUTHENTICATED' }) };
  }
  if (!safeMemoryId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '记忆 ID 无效', code: 'INVALID_MEMORY_ID' }) };
  }

  const { error, count } = await supabase
    .from('boh_treehole_memories')
    .delete({ count: 'exact' })
    .eq('id', safeMemoryId)
    .eq('user_id', safeUserId);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  if (Number(count || 0) === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '记忆不存在或无权限', code: 'TREEHOLE_MEMORY_NOT_FOUND' })
    };
  }

  invalidateTreeholeCache(safeUserId);
  return { ok: true, data: null, error: null };
}

export async function askTreeholeQwen({
  question = '',
  memories = [],
  history = [],
  signal = null
} = {}) {
  const safeQuestion = toTrimmedText(question, 1000);
  if (!safeQuestion) {
    return { ok: false, data: null, error: normalizeDbError({ message: '请输入问题', code: 'EMPTY_QUESTION' }) };
  }

  if (!SILICON_CLOUD_API_KEY) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '缺少 AI Key，请配置 VITE_SILICON_CLOUD_API_KEY', code: 'AI_KEY_MISSING' })
    };
  }

  const strictContextResult = await buildStrictTreeholeMemoryContext(memories, { signal });
  if (!strictContextResult.ok) {
    return strictContextResult;
  }

  const memoryContext = strictContextResult.data.context;
  const historyMessages = normalizeHistoryMessages(history);
  const coverage = strictContextResult.data.coverage || { memoryCount: 0, chunkCount: 0, mode: 'empty' };
  const memoryReadHint = coverage.mode === 'chunk-summary'
    ? `系统已分 ${coverage.chunkCount} 组逐组阅读，共覆盖 ${coverage.memoryCount} 条记忆。`
    : `系统已直接阅读全部上下文，共覆盖 ${coverage.memoryCount} 条记忆。`;

  const messages = [
    {
      role: 'system',
      content: `你是 BOH 树洞复盘助手。目标：帮助用户基于其私有记忆进行复盘、总结和行动建议。
请严格遵守：
1) 事实依据只能来自“用户记忆上下文”，历史对话仅用于理解问题，不可作为新事实依据。
2) 禁止编造用户没有写过的具体事实；若证据不足，明确写“未在记忆中找到明确依据”。
3) 引用格式统一为 [记忆#数字]。
4) 输出固定为四段并保留标题：
【结论】
【依据（记忆编号）】
【行动建议】
【不确定项】
5) “依据”段必须使用项目符号，每条都带 [记忆#] 引用。`
    },
    {
      role: 'system',
      content: `以下是用户记忆上下文（严格阅读模式）：\n${memoryReadHint}\n\n${memoryContext}\n\n请仅使用以上记忆上下文作为事实来源。`
    },
    ...historyMessages,
    {
      role: 'user',
      content: safeQuestion
    }
  ];

  const result = await requestTreeholeCompletion({
    messages,
    model: TREEHOLE_LONG_MEMORY_MODEL,
    temperature: 0.4,
    maxTokens: 1100,
    signal
  });

  if (!result.ok) {
    return result;
  }

  let finalReply = result.data.reply;
  let finalModel = result.data.model || TREEHOLE_LONG_MEMORY_MODEL;
  let finalUsage = result.data.usage || null;
  let repaired = false;

  const firstCitationCount = extractMemoryCitationTokens(finalReply).length;
  const firstSectionComplete = hasTreeholeRequiredSections(finalReply);
  const shouldRepair =
    coverage.memoryCount > 0 &&
    (firstCitationCount === 0 || !firstSectionComplete);

  if (shouldRepair) {
    const repairResult = await requestTreeholeCompletion({
      messages: [
        ...messages,
        { role: 'assistant', content: finalReply },
        {
          role: 'user',
          content: `你上一条回答未完全满足输出规范，请按以下规则“重写整条回答”：
1) 必须保留四段标题：${TREEHOLE_REQUIRED_SECTIONS.join(' / ')}。
2) “依据（记忆编号）”段每一条都要带 [记忆#数字] 引用。
3) 不得新增记忆中不存在的事实；若证据不足，请在【不确定项】写明“未在记忆中找到明确依据”。
4) 只输出重写后的最终答案，不要解释规则。`
        }
      ],
      model: TREEHOLE_LONG_MEMORY_MODEL,
      temperature: 0.2,
      maxTokens: 1200,
      signal
    });

    if (repairResult.ok) {
      finalReply = repairResult.data.reply;
      finalModel = repairResult.data.model || finalModel;
      finalUsage = repairResult.data.usage || finalUsage;
      repaired = true;
    }
  }

  const finalCitationCount = extractMemoryCitationTokens(finalReply).length;
  const finalSectionComplete = hasTreeholeRequiredSections(finalReply);

  return {
    ok: true,
    data: {
      reply: finalReply,
      model: finalModel,
      usage: finalUsage,
      memoryCoverage: coverage,
      validation: {
        repaired,
        citationCount: finalCitationCount,
        sectionComplete: finalSectionComplete
      }
    },
    error: null
  };
}
