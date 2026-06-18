import { logger } from '@/utils/logger.js';

export function useContextCompression({
  getSessionByIndex,
  isCompressingContext,
  compressingSessionIndex,
  computeContextBudgetUsage,
  registerRefreshConversationSummaryCache
}) {
  let refreshConversationSummaryCacheFn = null;

  const registerSummaryCache = (fn) => {
    refreshConversationSummaryCacheFn = fn;
  };

  if (registerRefreshConversationSummaryCache) {
    registerRefreshConversationSummaryCache(registerSummaryCache);
  }

  const compressionQueue = new Map();

  const ensureContextCompression = async (sessionIndex, { force = false, signal } = {}) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;

    if (isCompressingContext.value && compressingSessionIndex.value === sessionIndex) {
      return true;
    }

    if (isCompressingContext.value) {
      if (!compressionQueue.has(sessionIndex)) {
        compressionQueue.set(sessionIndex, []);
      }
      return new Promise((resolve) => {
        compressionQueue.get(sessionIndex).push(resolve);
      });
    }

    if (!force) {
      const usage = computeContextBudgetUsage(targetSession, { pendingCount: 1 });
      if (usage.level !== 'high' && usage.level !== 'full') return false;
    }

    if (!refreshConversationSummaryCacheFn) {
      logger.warn('boh-ai', 'Context compression skipped: refreshConversationSummaryCache not registered');
      return false;
    }

    if(signal) {
      signal.addEventListener('abort', () => {
        const queue = compressionQueue.get(sessionIndex);
        if (queue) {
          queue.forEach((resolve) => resolve(false));
          compressionQueue.delete(sessionIndex);
        }
      });
    }

    isCompressingContext.value = true;
    compressingSessionIndex.value = sessionIndex;

    try {
      await refreshConversationSummaryCacheFn(sessionIndex, signal);
      return true;
    } catch (error) {
      logger.warn('boh-ai', 'Auto context compression failed', error);
      return false;
    } finally {
      if (compressingSessionIndex.value === sessionIndex) {
        isCompressingContext.value = false;
        compressingSessionIndex.value = -1;
      }
      const queue = compressionQueue.get(sessionIndex);
      if (queue) {
        queue.forEach((resolve) => resolve(true));
        compressionQueue.delete(sessionIndex);
      }
    }
  };

  return {
    ensureContextCompression
  };
}