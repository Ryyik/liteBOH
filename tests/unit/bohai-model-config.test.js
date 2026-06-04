import { describe, expect, it } from 'vitest';
import {
  ACCURACY_PREFERRED_MODEL_ID,
  AUTO_ROUTER_MODEL_ID,
  RAG_PREFERRED_MODEL_ID,
  SILICON_EMBEDDING_MODEL_ID,
  SILICON_RERANK_MODEL_ID,
  GENERATION_PROFILE_BY_MODE,
  PLAN_MODE_SETTING_KEY,
  RESPONSE_STYLE_OPTIONS,
  RESPONSE_STYLE_SETTING_KEY,
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

  it('exposes Plan mode with the accuracy model and conservative generation settings', () => {
    const planMode = chatModes.find((item) => item.id === 'plan');

    expect(planMode?.model).toBe(ACCURACY_PREFERRED_MODEL_ID);
    expect(planMode?.description).toBe('分步推进');
    expect(PLAN_MODE_SETTING_KEY).toBe('boh_ai_plan_mode_enabled_v1');
    expect(GENERATION_PROFILE_BY_MODE.plan.temperature).toBeLessThan(GENERATION_PROFILE_BY_MODE.think.temperature);
    expect(GENERATION_PROFILE_BY_MODE.plan.max_tokens).toBeGreaterThan(GENERATION_PROFILE_BY_MODE.think.max_tokens);
  });

  it('exposes selectable BOH AI response styles', () => {
    const ids = RESPONSE_STYLE_OPTIONS.map((item) => item.id);

    expect(RESPONSE_STYLE_SETTING_KEY).toBe('boh_ai_response_style_v1');
    expect(ids).toEqual(['default', 'socratic', 'psychologist', 'crisp']);
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'socratic')?.promptAppendix).toContain('苏格拉底');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'psychologist')?.promptAppendix).toContain('心理专家');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'crisp')?.promptAppendix).toContain('高冷干练');
  });

  it('documents embedding and rerank models for BOH AI retrieval', () => {
    expect(SILICON_EMBEDDING_MODEL_ID).toBe('BAAI/bge-m3');
    expect(SILICON_RERANK_MODEL_ID).toBe('netease-youdao/bce-reranker-base_v1');
    expect(siliconModelCatalog.embedding.some((item) => item.id === SILICON_EMBEDDING_MODEL_ID)).toBe(true);
    expect(siliconModelCatalog.rerank.some((item) => item.id === SILICON_RERANK_MODEL_ID)).toBe(true);
  });
});
