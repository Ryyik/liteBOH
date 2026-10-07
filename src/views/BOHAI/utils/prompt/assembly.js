/**
 * assembly.js — 结构化 user prompt 装配 + 空助手占位判定
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import {
  MAX_FINAL_PROMPT_CHARS,
  MAX_USER_INPUT_CHARS,
} from '../../composables/chat-engine-config.js';
import { truncateText } from '../text/normalize.js';

export const isEmptyAssistantPlaceholder = (message) => {
  if (!message || message.role !== 'assistant') return false;
  if (String(message.content || '').trim()) return false;
  const meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
  return !meta || Object.keys(meta).length === 0;
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

export const buildStructuredUserPrompt = ({
  userText = '',
  responseRules = '',
  communityRules = '',
  evidenceRules = '',
  operationRules = '',
} = {}) => {
  const sections = [`<task>\n${truncateText(userText, MAX_USER_INPUT_CHARS)}\n</task>`];

  const ruleSections = [responseRules, communityRules, evidenceRules, operationRules]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (ruleSections.length > 0) {
    sections.push(`<response_rules>\n${ruleSections.join('\n\n')}\n</response_rules>`);
  }

  return truncateText(sections.join('\n\n'), MAX_FINAL_PROMPT_CHARS);
};

export const buildSystemEvidenceContext = ({ evidenceContext = '', searchContext = '' } = {}) => {
  const evidence = String(evidenceContext || '').trim();
  const search = String(searchContext || '').trim();
  const parts = [];

  if (evidence) {
    parts.push(`<internal_evidence>\n${evidence}\n</internal_evidence>`);
  }

  if (search) {
    parts.push(`<web_evidence>\n${search}\n</web_evidence>`);
  }

  return parts.join('\n\n');
};
