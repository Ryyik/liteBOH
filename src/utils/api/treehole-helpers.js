/**
 * treehole-helpers.js
 * ------------------------------------------------------------
 * 纯工具函数 — 从 treehole-api.js 提取的与 supabase 无依赖的数据变换/校验函数。
 * 保持行为不变，treehole-api.js 通过内部 import 引用。
 */

// ================================================================
// 游标编码
// ================================================================

export const encodeCursorToken = (payload = {}) => {
  try {
    return btoa(JSON.stringify(payload));
  } catch (_error) {
    return '';
  }
};

export const decodeCursorToken = (token = '', timestampField = 'updatedAt') => {
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

export const buildNextUpdatedAtCursor = (rows = [], hasMore = false) => {
  if (!hasMore || !Array.isArray(rows) || rows.length === 0) return '';
  const last = rows[rows.length - 1];
  const updatedAt = String(last?.updated_at || '').trim();
  const id = String(last?.id || '').trim();
  if (!updatedAt || !id) return '';
  return encodeCursorToken({ updatedAt, id });
};

// ================================================================
// 文本工具
// ================================================================

export const toTrimmedText = (value, maxLen = 0) => {
  const text = String(value || '').trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
};

export const parseJsonObjectFromText = (text) => {
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

export const parseJsonDataFromText = (text) => {
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

// ================================================================
// 归一化工具
// ================================================================

export const normalizeTags = (tags) => {
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

export const clampNumber = (value, min = 0, max = 1, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

export const normalizeCandidateStatus = (value) => {
  const normalized = String(value || '').trim();
  if (normalized === 'auto_saved') return 'auto_saved';
  if (normalized === 'rejected') return 'rejected';
  return 'pending';
};

// ================================================================
// 行归一化
// ================================================================

export const normalizeSpaceRow = (row) => {
  if (!row) return null;
  return {
    userId: row.user_id || '',
    title: row.title || '我的 BOH 树洞',
    description: row.description || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
};

export const normalizeMemoryRow = (row) => {
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

export const normalizeEvidence = (evidence) => {
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

export const normalizeMemoryCandidateRow = (row) => {
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

export const normalizeSharedMemoryRow = (row) => {
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

// ================================================================
// 缓存标签工具
// ================================================================

export const TREEHOLE_CACHE_TAG = 'treehole';
export const TREEHOLE_CANDIDATE_CACHE_TAG = 'treehole-candidates';
export const TREEHOLE_SHARED_MEMORY_CACHE_TAG = 'shared-ai-memory';

export const buildSharedMemoryOwnerTag = (userId) => {
  const safeUserId = toTrimmedText(userId, 64);
  return safeUserId ? `${TREEHOLE_SHARED_MEMORY_CACHE_TAG}:owner:${safeUserId}` : '';
};

// ================================================================
// 时间工具
// ================================================================

export const toTimestamp = (value) => {
  const ts = new Date(value || '').getTime();
  return Number.isFinite(ts) ? ts : 0;
};

export const normalizeDateRangeBoundary = (value) => {
  const text = toTrimmedText(value, 64);
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

export const toDateKey = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ================================================================
// 文本分块与相似度
// ================================================================

export const splitTextByLength = (text, maxLen = 0) => {
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

export const normalizeTextForCompare = (text) => {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '')
    .trim();
};

export const toBigramSet = (text) => {
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

export const calcSimilarity = (a, b) => {
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

// ================================================================
// 去重
// ================================================================

export const isLikelyDuplicateText = (incomingText, existingTexts = []) => {
  const incoming = normalizeTextForCompare(incomingText);
  if (!incoming) return false;

  for (const value of existingTexts) {
    const normalized = normalizeTextForCompare(value);
    if (!normalized) continue;
    if (incoming === normalized) return true;
    if (incoming.includes(normalized) || normalized.includes(incoming)) return true;
    if (calcSimilarity(incoming, normalized) >= 0.86) return true;
  }

  return false;
};

export const normalizeQuoteLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();

export const quoteExistsInSource = (sourceText, quoteText) => {
  const source = String(sourceText || '');
  const quote = String(quoteText || '').trim();
  if (!source || !quote) return false;
  if (source.includes(quote)) return true;
  const normalizedSource = normalizeQuoteLine(source);
  const normalizedQuote = normalizeQuoteLine(quote);
  return normalizedSource.includes(normalizedQuote);
};

// ================================================================
// 记忆组装
// ================================================================

export const normalizeMemoriesForPrompt = (memories = []) => {
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

export const buildTreeholeMemorySegments = (memories = [], maxSegmentChars = 1800) => {
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

export const formatTreeholeMemorySegment = (segment) => {
  return `记忆#${segment.memoryNo}（片段 ${segment.segmentNo}/${segment.totalSegments}）
时间: ${segment.timestamp}
心情: ${segment.mood}
标签: ${segment.tags}
内容:
${segment.content}`;
};

export const buildTreeholeMemoryChunks = (
  memories = [],
  {
    maxChunkChars = 22000,
    maxSegmentChars = 1800
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

// ================================================================
// 对话相关
// ================================================================

export const normalizeHistoryMessages = (history = []) => {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-10)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: toTrimmedText(item?.content, 800)
    }))
    .filter((item) => item.content);
};

export const buildDialogueContextForMemoryCapture = (messages = []) => {
  const source = Array.isArray(messages) ? messages : [];
  const selected = source
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: toTrimmedText(item?.content, 900)
    }))
    .filter((item) => item.content)
    .slice(-12);

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

export const inferEvidenceMessageId = (quote, userTurns = []) => {
  if (!quote) return '';
  const matched = userTurns.filter((item) => quoteExistsInSource(item.content, quote));
  if (matched.length !== 1) return '';
  return matched[0].id;
};

export const normalizeCandidateEvidence = (evidence, userTurns = [], userTurnMap = new Map()) => {
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
    if (output.length >= 8) break;
  }

  return output;
};

export const normalizeExtractedCandidate = (candidate = {}, userTurns = [], userTurnMap = new Map()) => {
  const content = toTrimmedText(
    candidate?.content || candidate?.memory || candidate?.summary || candidate?.fact,
    320
  );
  if (!content) return null;

  const evidence = normalizeCandidateEvidence(candidate?.evidence, userTurns, userTurnMap);
  if (evidence.length === 0) return null;

  const mood = toTrimmedText(candidate?.mood, 24);
  const tags = normalizeTags(candidate?.tags).slice(0, 6);
  const reason = toTrimmedText(candidate?.reason || candidate?.why, 200);
  const confidence = clampNumber(candidate?.confidence, 0, 1, 0.5);

  return { content, mood, tags, reason, confidence, evidence };
};

// ================================================================
// 记忆复盘相关
// ================================================================

export const TREEHOLE_REQUIRED_SECTIONS = ['【结论】', '【依据（记忆编号）】', '【行动建议】', '【不确定项】'];

export const extractMemoryCitationTokens = (text) => {
  const safeText = String(text || '');
  const matches = safeText.match(/记忆#\d+/g) || [];
  return [...new Set(matches)];
};

export const hasTreeholeRequiredSections = (text) => {
  const safeText = String(text || '');
  return TREEHOLE_REQUIRED_SECTIONS.every((section) => safeText.includes(section));
};

// ================================================================
// 搜索引擎
// ================================================================

export const tokenizeSharedMemoryQuery = (query = '') => {
  const safeQuery = toTrimmedText(query, 180).toLowerCase();
  if (!safeQuery) return [];
  const tokens = safeQuery.match(/[a-z0-9_/-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  return [...new Set(tokens)].slice(0, 24);
};

export const buildSharedMemorySearchText = (row = {}) => {
  const content = String(row?.content || '');
  const mood = String(row?.mood || '');
  const tags = Array.isArray(row?.tags) ? row.tags.join(' ') : '';
  return `${content}\n${mood}\n${tags}`.toLowerCase();
};

export const scoreSharedMemoryByQuery = (row = {}, query = '', tokens = []) => {
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

// ================================================================
// 错误检查
// ================================================================

export const isMissingCandidatesTableError = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('boh_treehole_memory_candidates');
};

export const isMissingSharedMemoryTableError = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('boh_ai_shared_memories');
};

export const buildSharedMemoryModerationInput = (content = '') => {
  const safeContent = toTrimmedText(content, 1200);
  return `正文：${safeContent}`;
};

// ================================================================
// 常量
// ================================================================

export const TREEHOLE_MEMORY_FETCH_PAGE_SIZE = 200;
export const TREEHOLE_MAX_HISTORY_MESSAGES = 10;
export const TREEHOLE_MAX_HISTORY_CONTENT_CHARS = 800;
export const TREEHOLE_MEMORY_SEGMENT_CHARS = 1800;
export const TREEHOLE_MEMORY_CHUNK_CHARS = 22000;
export const TREEHOLE_DIRECT_CONTEXT_CHARS = 52000;
export const TREEHOLE_MEMORY_SUMMARY_MAX_CHARS = 260;
export const TREEHOLE_AUTO_MEMORY_MAX_MESSAGES = 12;
export const TREEHOLE_AUTO_MEMORY_MAX_MESSAGE_CHARS = 900;
export const TREEHOLE_AUTO_MEMORY_MAX_CANDIDATES = 4;
export const TREEHOLE_AUTO_MEMORY_MIN_CONFIDENCE = 0.66;
export const TREEHOLE_AUTO_MEMORY_AUTOSAVE_CONFIDENCE = 0.9;
export const TREEHOLE_AUTO_MEMORY_CONTENT_MAX_CHARS = 320;
export const TREEHOLE_AUTO_MEMORY_REASON_MAX_CHARS = 200;
export const TREEHOLE_AUTO_MEMORY_MAX_EVIDENCE = 8;
export const TREEHOLE_AUTO_MEMORY_DEDUP_SIMILARITY = 0.86;
export const TREEHOLE_SHARED_MEMORY_FETCH_LIMIT = 300;
export const TREEHOLE_SHARED_MEMORY_SEARCH_LIMIT = 60;
export const SHARED_MEMORY_ASYNC_MODERATION_TIMEOUT_MS = 45000;
export const TREEHOLE_SPACE_COLUMNS = 'user_id, title, description, created_at, updated_at';
export const TREEHOLE_MEMORY_COLUMNS = 'id, user_id, content, mood, tags, is_starred, source, created_at, updated_at';
export const TREEHOLE_SHARED_MEMORY_COLUMNS = `
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
export const TREEHOLE_SHARED_MEMORY_COLUMNS_WITH_MODERATION = `
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
export const TREEHOLE_CANDIDATE_COLUMNS = `
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