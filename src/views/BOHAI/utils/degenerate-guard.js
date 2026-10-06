/**
 * degenerate-guard.js — 退化输出守卫 + 内部进度行清洗
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 *
 * ⚠️ 阈值（DEGENERATE_*）的真源仍在 `composables/chat-engine-config.js`，本文件只消费。
 */
import {
  DEGENERATE_PUNCT_REPEAT_COUNT,
  DEGENERATE_PUNCTUATION_RATIO,
  DEGENERATE_REPEAT_COUNT,
  DEGENERATE_STREAM_MIN_CHARS,
  DEGENERATE_STREAM_PUNCTUATION_RATIO,
  DEGENERATE_STREAM_REPEAT_COUNT,
  DEGENERATE_STREAM_WINDOW_CHARS,
} from '../composables/chat-engine-config.js';

export const INTERNAL_PROGRESS_LINE_PATTERNS = [
  /^\s*>\s*\*\*(?:正在搜索|找到\s*\d+\s*个结果|未找到相关结果|自动检索中|知识路由|已完成内部检索|未检索到匹配内部资料)\*\*.*$/u,
  /^\s*>\s*(?:⚠️|✅|❌|⚙️)\s*\*\*.*\*\*.*$/u,
  /^\s*>\s*\d+\.\s*\[[^\]]+\]\((?:https?:\/\/|www\.)[^)]+\)\s*$/u,
];

// 模型幻觉输出的工具调用标签（项目未注册任何 LLM 工具，这类文本需统一清洗）。
// 覆盖单行自闭合、单行成对、多行块三种形态，args 内容不含 '<' 字符，可安全用 [^<] 匹配单行。
const TOOL_HALLUCINATION_PATTERNS = [
  /<tool_call>[\s\S]*?<\/tool_call>\s*/gi,
  /<function_call>[\s\S]*?<\/function_call>\s*/gi,
  /<tool\s+name=["'][^"']+["'][^<]*?\/\s*>\s*/gi,
  /<tool\s+name=["'][^"']+["'][\s\S]*?<\/tool>\s*/gi,
];

export const cleanAssistantVisibleReply = (text) => {
  const raw = String(text || '');
  if (!raw) return '';

  const sanitized = TOOL_HALLUCINATION_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, ''),
    raw,
  );

  const filteredLines = sanitized
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

const buildPunctRepeatRegex = (repeatCount) =>
  new RegExp(`(${PUNCT_REPEAT_CHAR_CLASS})\\1{${repeatCount},}`, 'u');
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
  const tailPunctuationRun = compact.match(
    new RegExp(`(?:${PUNCT_DENSITY_CHAR_CLASS}){18,}$`, 'u'),
  );
  if (tailPunctuationRun && tailPunctuationRun[0].length / Math.max(1, compact.length) >= 0.08) {
    return true;
  }
  if (compact.length < DEGENERATE_STREAM_MIN_CHARS) return false;

  if (buildPunctRepeatRegex(DEGENERATE_STREAM_REPEAT_COUNT).test(compact)) {
    return true;
  }

  const punctCount = (compact.match(buildPunctDensityRegex()) || []).length;
  return punctCount / compact.length >= DEGENERATE_STREAM_PUNCTUATION_RATIO;
};
