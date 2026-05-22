import { describe, expect, it } from 'vitest';
import {
  ACCURACY_PREFERRED_MODEL_ID,
  AUTO_ROUTER_MODEL_ID,
  RAG_PREFERRED_MODEL_ID,
  SILICON_EMBEDDING_MODEL_ID,
  SILICON_RERANK_MODEL_ID,
  availableModels,
  chatModes,
  siliconModelCatalog
} from '../../src/views/BOHAI/composables/chat-engine-config.js';

describe('BOH AI SiliconFlow model config', () => {
  it('uses the lightweight free chat model for Auto routing', () => {
    const autoMode = chatModes.find((item) => item.id === 'auto');
    expect(AUTO_ROUTER_MODEL_ID).toBe('Qwen/Qwen3.5-4B');
    expect(autoMode?.model).toBe(AUTO_ROUTER_MODEL_ID);
    expect(availableModels.some((item) => item.id === AUTO_ROUTER_MODEL_ID)).toBe(true);
  });

  it('keeps the recommended free chat stack available', () => {
    expect(availableModels.some((item) => item.id === 'Qwen/Qwen3-8B')).toBe(true);
    expect(availableModels.some((item) => item.id === 'Qwen/Qwen2.5-7B-Instruct')).toBe(true);
    expect(availableModels.some((item) => item.id === ACCURACY_PREFERRED_MODEL_ID)).toBe(true);
    expect(availableModels.some((item) => item.id === RAG_PREFERRED_MODEL_ID)).toBe(true);
  });

  it('documents embedding and rerank models for BOH AI retrieval', () => {
    expect(SILICON_EMBEDDING_MODEL_ID).toBe('BAAI/bge-m3');
    expect(SILICON_RERANK_MODEL_ID).toBe('netease-youdao/bce-reranker-base_v1');
    expect(siliconModelCatalog.embedding.some((item) => item.id === SILICON_EMBEDDING_MODEL_ID)).toBe(true);
    expect(siliconModelCatalog.rerank.some((item) => item.id === SILICON_RERANK_MODEL_ID)).toBe(true);
  });
});
