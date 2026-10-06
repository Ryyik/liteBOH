/**
 * keywords.js — 关键词切分 / 抽取（含 LRU 缓存）
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 */
import { KEYWORD_CACHE_MAX_SIZE } from '@/utils/bohai-constants.js';
import { normalizeText } from './normalize.js';

export const splitKnowledgeChunks = (rawText) => {
  return String(rawText || '')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 16);
};

// 使用 LRU 语义（命中时重新插入到尾部）提升高频查询场景的缓存命中率
const keywordCache = new Map();

export const clearKeywordCache = () => {
  keywordCache.clear();
};

export const extractQueryKeywords = (text) => {
  const normalized = normalizeText(text);

  if (keywordCache.has(normalized)) {
    // LRU bump: 将命中的 key 移到末尾
    const value = keywordCache.get(normalized);
    keywordCache.delete(normalized);
    keywordCache.set(normalized, value);
    return value;
  }

  const tokens = normalized.match(/[a-z0-9_/-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const stopwords = new Set([
    '这个',
    '那个',
    '什么',
    '怎么',
    '如何',
    '请问',
    '一下',
    '以及',
    '然后',
    '可以',
    '一个',
    '我们',
    '你们',
  ]);
  const expanded = new Set();

  tokens.forEach((token) => {
    if (stopwords.has(token)) return;
    expanded.add(token);

    if (/^[\u4e00-\u9fa5]+$/.test(token) && token.length >= 4 && token.length <= 12) {
      // Only expand 2-grams + full token, skip 3/4-grams to reduce O(n^2) overhead
      for (let i = 0; i <= token.length - 2; i += 1) {
        expanded.add(token.slice(i, i + 2));
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
