/**
 * budget.js — 历史消息预算裁剪 / 可存对话消息归一
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import {
  MAX_CONTEXT_MESSAGES,
  MAX_HISTORY_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
} from '../../composables/chat-engine-config.js';
import { normalizePromptLine, truncateText } from '../text/normalize.js';
import { TOKEN_ESTIMATE_ROLE_OVERHEAD, estimateMessagesTokens, estimateTokens } from '../tokens.js';

// 系统提示词估算字符数
export const ESTIMATED_SYSTEM_PROMPT_CHARS = 600;

export const buildHistoryMessagesWithinBudget = (
  messages,
  {
    maxChars = MAX_HISTORY_CONTEXT_CHARS,
    maxMessages = MAX_CONTEXT_MESSAGES,
    maxPerMessage = MAX_HISTORY_MESSAGE_CHARS,
  } = {},
) => {
  const source = Array.isArray(messages) ? messages : [];
  const selected = [];
  let usedTokens = 0;

  for (let index = source.length - 1; index >= 0; index -= 1) {
    const item = source[index];
    if (item?.meta?.kind === 'memory_saved_notice') continue;
    // 连贯性修复：保留原始换行和结构，只做首尾 trim + 长度截断
    // 之前用 normalizePromptLine 会把换行压成单空格，破坏代码块/列表/段落结构
    const content = truncateText(String(item?.content ?? '').trim(), maxPerMessage);
    if (!content) continue;

    const role = item?.role === 'assistant' || item?.role === 'system' ? item.role : 'user';
    // C3 fix: 使用 token 估算替代字符计数，中文消息更准确
    const estimated = TOKEN_ESTIMATE_ROLE_OVERHEAD + estimateTokens(content);
    if (selected.length > 0 && usedTokens + estimated > maxChars) {
      break;
    }

    selected.unshift({ role, content });
    usedTokens += estimated;
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
      content: normalizePromptLine(item?.content, MAX_HISTORY_MESSAGE_CHARS),
    }))
    .filter((item) => item.content);
};

// --- 最终消息数组裁剪 ---
// P0: 在发送前对 messages 数组做 token 预算裁剪，防止静默超出模型上下文窗口。
// 保留系统消息和最近消息，从中间裁剪。
export const trimMessagesToBudget = (messages, maxTokens) => {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  // 系统消息不裁剪
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  // 计算系统消息 token 消耗
  const systemTokens = estimateMessagesTokens(systemMessages);
  const availableForMessages = Math.max(0, maxTokens - systemTokens);

  // 从最近的消息开始选，直到超出预算
  const selected = [];
  let usedTokens = 0;
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const estimated = TOKEN_ESTIMATE_ROLE_OVERHEAD + estimateTokens(String(msg.content || ''));
    if (usedTokens + estimated > availableForMessages) break;
    selected.unshift(msg);
    usedTokens += estimated;
  }

  return [...systemMessages, ...selected];
};
