import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useContextCompression } from '../../src/views/BOHAI/composables/useContextCompression.js';

const createCompression = (percent) => {
  const refreshConversationSummaryCache = vi.fn(async () => {});
  const api = useContextCompression({
    getSessionByIndex: () => ({ messages: [] }),
    isCompressingContext: ref(false),
    compressingSessionIndex: ref(-1),
    computeContextBudgetUsage: () => ({ historyPercent: percent }),
    refreshConversationSummaryCache
  });
  return { api, refreshConversationSummaryCache };
};

describe('useContextCompression auto threshold', () => {
  it('does not compress before the progress reaches 100%', async () => {
    const { api, refreshConversationSummaryCache } = createCompression(99.9);

    expect(await api.ensureContextCompression(0)).toBe(false);
    expect(refreshConversationSummaryCache).not.toHaveBeenCalled();
  });

  it('compresses once the progress reaches 100%', async () => {
    const { api, refreshConversationSummaryCache } = createCompression(100);

    expect(await api.ensureContextCompression(0)).toBe(true);
    expect(refreshConversationSummaryCache).toHaveBeenCalledTimes(1);
  });

  it('still allows manual compression before 100%', async () => {
    const { api, refreshConversationSummaryCache } = createCompression(20);

    expect(await api.ensureContextCompression(0, { force: true })).toBe(true);
    expect(refreshConversationSummaryCache).toHaveBeenCalledTimes(1);
  });
});
