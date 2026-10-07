/**
 * scoring.js — 知识块打分 / 证据块排序 / 上下文预算分配
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import {
  KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS,
  KNOWLEDGE_CONTEXT_MAX_CHARS,
  KNOWLEDGE_MAX_CHUNKS,
  MAX_PROMPT_EXTRA_CHARS,
} from '../../composables/chat-engine-config.js';
import { EVIDENCE_SOURCE_WEIGHTS, RANKING_SCORE_WEIGHTS } from '../../domain/evidence.js';
import { extractQueryKeywords, splitKnowledgeChunks } from '../text/keywords.js';
import { normalizePromptLine, normalizeText, truncateText } from '../text/normalize.js';

export const scoreChunk = (chunk, keywords) => {
  if (!chunk || keywords.length === 0) return 0;
  const normalizedChunk = normalizeText(chunk);
  const chunkLen = normalizedChunk.length || 1;
  return keywords.reduce((score, keyword) => {
    if (!normalizedChunk.includes(keyword)) return score;
    const baseScore = Math.min(3, Math.ceil(keyword.length / 2));
    const pos = normalizedChunk.indexOf(keyword);
    const positionBonus = 1 + (1 - pos / chunkLen) * 0.5; // earlier = higher score (1.0x-1.5x)
    return score + Math.round(baseScore * positionBonus * 10) / 10;
  }, 0);
};

export const selectRelevantChunks = (
  rawText,
  query,
  maxChunks = KNOWLEDGE_MAX_CHUNKS,
  { fallback = 'none' } = {},
) => {
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
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
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
      const confidenceScore = Math.round(
        Number(result.confidence || 0) * RANKING_SCORE_WEIGHTS.confidenceMultiplier,
      );
      const sourceScore =
        EVIDENCE_SOURCE_WEIGHTS[connectorId] || RANKING_SCORE_WEIGHTS.defaultSourceScore;
      return {
        context,
        result,
        index,
        score:
          lexicalScore * RANKING_SCORE_WEIGHTS.lexicalMultiplier + sourceScore + confidenceScore,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
};

// --- 共享上下文预算 + 去重 ---
// P0: 知识检索和联网搜索共享 8000 字预算，知识检索优先，剩余分配给搜索。
// P2: 对内容做 URL 级去重，避免重复内容浪费上下文。
export const buildSharedEvidenceContext = ({
  evidenceContext = '',
  searchContext = '',
  maxChars = MAX_PROMPT_EXTRA_CHARS,
  evidenceUrls = [],
  searchUrls = [],
} = {}) => {
  const evidence = String(evidenceContext || '').trim();
  const search = String(searchContext || '').trim();

  // 去重：如果搜索内容 URL 和知识检索 URL 重叠，搜索内容截断
  const evidenceUrlSet = new Set(
    (Array.isArray(evidenceUrls) ? evidenceUrls : []).map((u) => String(u).trim()).filter(Boolean),
  );
  const searchUrlSet = new Set(
    (Array.isArray(searchUrls) ? searchUrls : []).map((u) => String(u).trim()).filter(Boolean),
  );
  const overlapUrls = new Set([...evidenceUrlSet].filter((u) => searchUrlSet.has(u)));

  let dedupedSearch = search;
  if (overlapUrls.size > 0 && search) {
    // 简单策略：如果 URL 重叠，搜索内容截断到 25%
    const searchBudget = Math.floor(maxChars * 0.25);
    dedupedSearch = truncateText(search, searchBudget);
  }

  // 知识检索优先，剩余预算给搜索
  let evidenceBudget = Math.min(evidence.length, maxChars);
  let searchBudget = Math.max(0, maxChars - evidenceBudget);

  // 如果搜索内容很短，多余的预算还给知识检索
  const actualSearch = truncateText(dedupedSearch, searchBudget);
  if (actualSearch.length < searchBudget) {
    evidenceBudget = Math.min(evidence.length, maxChars - actualSearch.length);
  }

  return {
    evidenceContext: truncateText(evidence, evidenceBudget),
    searchContext: actualSearch,
  };
};

export const compressKnowledgeContextBlocks = (
  blocks = [],
  { maxChars = KNOWLEDGE_CONTEXT_MAX_CHARS, maxPerBlock = KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS } = {},
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
