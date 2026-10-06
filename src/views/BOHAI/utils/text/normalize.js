/**
 * normalize.js — 文本归一化 / 截断 / 转义
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 */
import { MAX_HISTORY_MESSAGE_CHARS } from '../../composables/chat-engine-config.js';

export const normalizeText = (text) =>
  String(text || '')
    .toLowerCase()
    .trim();

export const truncateText = (text, maxChars) => {
  const normalized = String(text ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
};

export const normalizePromptLine = (text, maxChars = MAX_HISTORY_MESSAGE_CHARS) => {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateText(normalized, maxChars);
};

export const stripWrappingQuotes = (text) => {
  let output = String(text || '').trim();
  output = output.replace(/^[「『“"']+/, '');
  output = output.replace(/[」』”"']+$/, '');
  return output.trim();
};

export const containsAnyKeyword = (normalizedText, keywords = []) => {
  const source = String(normalizedText || '');
  if (!source) return false;
  return keywords.some((keyword) => source.includes(String(keyword || '').toLowerCase()));
};

export const escapePromptXmlAttr = (text) =>
  String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
