import { logger } from '@/utils/logger.js';

export function useContextCompression({
  getSessionByIndex,
  isCompressingContext,
  compressingSessionIndex,
  computeContextBudgetUsage,
  summaryCacheRef
}) {
  const ensureContextCompression = async (sessionIndex, { force = false } = {}) => {
    const targetSession = getSessionByIndex(sessionIndex);
    if (!targetSession) return false;

    if (isCompressingContext.value && compressingSessionIndex.value === sessionIndex) {
      return true;
    }

    if (isCompressingContext.value) return false;

    if (!force) {
      const usage = computeContextBudgetUsage(targetSession);
      if (usage.level !== 'high' && usage.level !== 'full') return false;
    }

    isCompressingContext.value = true;
    compressingSessionIndex.value = sessionIndex;
    try {
      await summaryCacheRef.fn(sessionIndex);
    } catch (error) {
      logger.warn('boh-ai', 'Auto context compression failed', error);
    } finally {
      if (compressingSessionIndex.value === sessionIndex) {
        isCompressingContext.value = false;
        compressingSessionIndex.value = -1;
      }
    }
    return true;
  };

  return {
    ensureContextCompression
  };
}