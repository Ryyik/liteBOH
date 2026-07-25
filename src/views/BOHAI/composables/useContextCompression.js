import { logger } from '@/utils/logger.js';

export function useContextCompression({
  getSessionByIndex,
  isCompressingContext,
  compressingSessionIndex,
  computeContextBudgetUsage,
  refreshConversationSummaryCache
}) {
  let currentAbortController = null; // 修复竞态条件:保存当前的AbortController
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
      // mid 级别（55%）也触发摘要：让 5-6 轮短对话就开始压缩，
      // 避免早期上下文被 maxMessages=30 截断后完全丢失。
      // low 级别不触发（对话刚起步，没必要压缩）。
      if (usage.level === 'low') return false;
    }

    if (typeof refreshConversationSummaryCache !== 'function') {
      logger.warn('boh-ai', 'Context compression skipped: refreshConversationSummaryCache not registered');
      return false;
    }

    // 修复竞态条件:取消之前的压缩请求
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    // 创建新的AbortController用于本次压缩
    const abortController = new AbortController();
    currentAbortController = abortController;

    // 如果外部提供了signal,监听外部取消事件
    let handleAbort = null;
    if (signal) {
      handleAbort = () => {
        if (currentAbortController === abortController) {
          abortController.abort();
        }
      };
      signal.addEventListener('abort', handleAbort);
    }

    isCompressingContext.value = true;
    compressingSessionIndex.value = sessionIndex;

    try {
      await refreshConversationSummaryCache(sessionIndex, abortController.signal, { force });
      return true;
    } catch (error) {
      // 如果是取消导致的错误,不记录警告
      if (error.name !== 'AbortError') {
        logger.warn('boh-ai', 'Auto context compression failed', error);
      }
      return false;
    } finally {
      // 清理当前的AbortController
      if (currentAbortController === abortController) {
        currentAbortController = null;
      }

      // 移除事件监听器，防止内存泄漏
      if (handleAbort && signal) {
        signal.removeEventListener('abort', handleAbort);
      }

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