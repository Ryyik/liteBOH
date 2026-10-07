/**
 * store.js — 历史摘要（两层）与 AI 记忆加载
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import {
  MAX_CONTEXT_MESSAGES,
  MAX_HISTORY_CONTEXT_CHARS,
  MAX_HISTORY_MESSAGE_CHARS,
} from '../../composables/chat-engine-config.js';
import { logger } from '@/utils/logger.js';
import {
  buildHistoryMessagesWithinBudget,
  getStorableDialogueMessages,
} from '../retrieval/budget.js';
import { normalizePromptLine } from '../text/normalize.js';

let aiMemoryCache = '';
let aiMemoryLoader = null;

// 历史摘要参数：配合放大的上下文窗口同步上调。
// - RECENT_MESSAGES=8: 摘要只覆盖"倒数第 8 条之前"，保留更多原文以减少摘要信息损失。
// - MIN_MESSAGES=10: 至少 10 条历史才触发摘要（从 16 下调，让中等长度对话也受益）。
// - MAX_CHARS=2000: 摘要本体上限 2000 字符（之前 900），让压缩后的早期上下文也尽量详细。
// - TWO_LEVEL_THRESHOLD=50: 超过 50 条消息时做二层摘要。
export const CONVERSATION_SUMMARY_RECENT_MESSAGES = 8;
export const CONVERSATION_SUMMARY_MIN_MESSAGES = 10;
export const CONVERSATION_SUMMARY_MAX_CHARS = 2000;
export const CONVERSATION_SUMMARY_TWO_LEVEL_THRESHOLD = 50;
export const CONVERSATION_SUMMARY_STORAGE_VERSION = 2;

const AI_MEMORY_RETRY_DELAY_MS = 30000;

export async function getAIMemory({ forceReload = false } = {}) {
  if (!forceReload && aiMemoryCache) return aiMemoryCache;
  if (!forceReload && aiMemoryLoader) return aiMemoryLoader;
  if (forceReload) {
    aiMemoryCache = '';
    aiMemoryLoader = null;
  }
  aiMemoryLoader = import('@/data/ai-memory.js')
    .then((module) => {
      aiMemoryCache = typeof module.AI_MEMORY === 'string' ? module.AI_MEMORY : '';
      return aiMemoryCache;
    })
    .catch((error) => {
      logger.error('boh-ai', 'Load AI memory failed', error);
      aiMemoryLoader = null;
      setTimeout(() => {
        if (aiMemoryCache === '') aiMemoryLoader = null;
      }, AI_MEMORY_RETRY_DELAY_MS).unref?.();
      return '';
    });
  return aiMemoryLoader;
}

export const buildConversationSummaryFingerprint = (messages = []) => {
  const source = getStorableDialogueMessages(messages);
  if (source.length <= CONVERSATION_SUMMARY_RECENT_MESSAGES) return '';
  const summarized = source.slice(0, -CONVERSATION_SUMMARY_RECENT_MESSAGES);
  // fingerprint 之前依赖首尾消息内容前缀，流式过滤/编辑导致内容变化即失效。
  // 改为：对每条被摘要消息的 role + content 前 20 字符做轻量 hash，
  // 内容小幅变化（如末尾标点）不影响 hash，大幅变化（如编辑）才会失效。
  const parts = summarized.map((m) => `${m.role[0]}:${m.content.slice(0, 20)}`);
  let hash = 0x811c9dc5;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `${CONVERSATION_SUMMARY_STORAGE_VERSION}:${summarized.length}:${hash.toString(36)}`;
};

export const buildHistoryMessagesWithCachedSummary = (
  session = {},
  {
    maxChars = MAX_HISTORY_CONTEXT_CHARS,
    maxMessages = MAX_CONTEXT_MESSAGES,
    maxPerMessage = MAX_HISTORY_MESSAGE_CHARS,
  } = {},
) => {
  const allMessages = getStorableDialogueMessages(session?.messages);
  const cachedSummary = getCachedSummaryIfUsable({
    ...(session || {}),
    messages: allMessages,
  });
  // 摘要可用前必须保留完整预算内历史。旧实现无条件只取最近 8 条，导致第 9 条开始
  // 早期消息可能在摘要尚未生成时就从模型上下文消失。
  const coveredMessageCount = Math.max(
    0,
    Math.trunc(Number(session?.contextSummary?.coveredMessageCount) || 0),
  );
  const historySource = cachedSummary
    ? allMessages.slice(
        coveredMessageCount > 0 ? coveredMessageCount : -CONVERSATION_SUMMARY_RECENT_MESSAGES,
      )
    : allMessages;

  // 只返回历史消息，摘要由 useChatEngine 并入主 system prompt 的 context 段落。
  return buildHistoryMessagesWithinBudget(historySource, {
    maxChars,
    maxMessages,
    maxPerMessage,
  });
};

// 独立导出：供 useChatEngine 判断摘要是否可用并取出内容，并入主 system prompt
export const getCachedSummaryIfUsable = (session = {}) => {
  const summary = session?.contextSummary;
  if (!summary || summary.version !== CONVERSATION_SUMMARY_STORAGE_VERSION) return '';
  const content = normalizePromptLine(summary.content, CONVERSATION_SUMMARY_MAX_CHARS);
  if (!content) return '';

  const allMessages = getStorableDialogueMessages(session?.messages);
  const sourceMessageCount = Math.max(0, Math.trunc(Number(summary.sourceMessageCount) || 0));
  if (sourceMessageCount > 0 && sourceMessageCount <= allMessages.length) {
    const sourceFingerprint = buildConversationSummaryFingerprint(
      allMessages.slice(0, sourceMessageCount),
    );
    return summary.fingerprint === sourceFingerprint ? content : '';
  }

  // 兼容尚未带覆盖范围元数据的旧会话摘要。
  const expectedFingerprint = buildConversationSummaryFingerprint(allMessages);
  return summary.fingerprint === expectedFingerprint ? content : '';
};
