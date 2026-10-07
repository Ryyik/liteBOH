/**
 * dedupe.js — 记忆去重比较 + 显式记忆内容抽取
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 */
import { stripWrappingQuotes, truncateText } from '../text/normalize.js';

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
