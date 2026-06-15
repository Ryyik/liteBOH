import { beforeEach, describe, expect, it, vi } from 'vitest';

const km = vi.hoisted(() => ({
  supabaseFunctions: { invoke: vi.fn() },
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    functions: km.supabaseFunctions,
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import { searchBohAIKnowledgeForAI } from '../../src/utils/api/treehole/knowledge-search-api.js';

describe('knowledge-search-api: searchBohAIKnowledgeForAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('returns empty when query is empty', async () => {
    const result = await searchBohAIKnowledgeForAI({ query: '' });
    expect(result.ok).toBe(true);
    expect(result.data.chunks).toEqual([]);
  });

  it('returns empty when sourceTypes is empty', async () => {
    const result = await searchBohAIKnowledgeForAI({ query: 'test', sourceTypes: [] });
    expect(result.ok).toBe(true);
    expect(result.data.chunks).toEqual([]);
  });

  it('invokes edge function with correct payload', async () => {
    km.supabaseFunctions.invoke.mockResolvedValue({
      data: {
        ok: true,
        data: {
          chunks: [
            { id: 'chunk1', text: 'Relevant content', source: 'shared_memory', score: 0.92 },
            { id: 'chunk2', text: 'Another result', source: 'core_memory', score: 0.85 },
          ],
          sourceTypes: ['shared_memory', 'core_memory'],
        },
      },
      error: null,
    });

    const result = await searchBohAIKnowledgeForAI({
      query: 'how to work',
      sourceTypes: ['shared_memory', 'core_memory'],
      limit: 5,
      minSimilarity: 0.5,
    });

    expect(result.ok).toBe(true);
    expect(result.data.chunks).toHaveLength(2);
    expect(result.data.chunks[0].text).toBe('Relevant content');
    expect(result.data.chunks[0].score).toBe(0.92);
    expect(km.supabaseFunctions.invoke).toHaveBeenCalledWith('boh-ai-retrieval', {
      body: {
        action: 'search',
        query: 'how to work',
        sourceTypes: ['shared_memory', 'core_memory'],
        matchCount: 5,
        ensureIndexed: true,
        syncLimit: 40,
        minSimilarity: 0.5,
      },
    });
  });

  it('filters invalid sourceTypes', async () => {
    km.supabaseFunctions.invoke.mockResolvedValue({
      data: { ok: true, data: { chunks: [] } },
      error: null,
    });

    await searchBohAIKnowledgeForAI({
      query: 'test',
      sourceTypes: ['core_memory', 'invalid_source', 'knowledge_base'],
    });

    expect(km.supabaseFunctions.invoke).toHaveBeenCalled();
    const callArg = km.supabaseFunctions.invoke.mock.calls[0][1];
    expect(callArg.body.sourceTypes).toEqual(['core_memory', 'knowledge_base']);
  });

  it('clamps limit to valid range', async () => {
    km.supabaseFunctions.invoke.mockResolvedValue({
      data: { ok: true, data: { chunks: [] } },
      error: null,
    });

    await searchBohAIKnowledgeForAI({ query: 'test', limit: 100 });
    expect(km.supabaseFunctions.invoke.mock.calls[0][1].body.matchCount).toBe(24);

    await searchBohAIKnowledgeForAI({ query: 'test', limit: 0 });
    expect(km.supabaseFunctions.invoke.mock.calls[1][1].body.matchCount).toBe(1);
  });

  it('handles edge function ok:false', async () => {
    km.supabaseFunctions.invoke.mockResolvedValue({
      data: { ok: false, message: 'Index not ready' },
      error: null,
    });

    const result = await searchBohAIKnowledgeForAI({ query: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VECTOR_SEARCH_FAILED');
  });

  it('handles edge function invoke error', async () => {
    km.supabaseFunctions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge function error' },
    });

    const result = await searchBohAIKnowledgeForAI({ query: 'test' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});