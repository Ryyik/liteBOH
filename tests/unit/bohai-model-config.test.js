import { describe, expect, it } from 'vitest';
import {
  ACCURACY_PREFERRED_MODEL_ID,
  FAST_NEX_MODEL_ID,
  PRO_QWEN_MODEL_ID,
  PLAN_DEEPSEEK_MODEL_ID,
  AGENT_BASE_MODEL_ID,
  BOH_DEFAULT_MODE_ID,
  BOH_AUTO_MODE_ID,
  RAG_PREFERRED_MODEL_ID,
  SILICON_EMBEDDING_MODEL_ID,
  SILICON_RERANK_MODEL_ID,
  GENERATION_PROFILE_BY_MODE,
  PLAN_MODE_SETTING_KEY,
  RESPONSE_STYLE_OPTIONS,
  RESPONSE_STYLE_SETTING_KEY,
  availableModels,
  chatModes
} from '../../src/views/BOHAI/composables/chat-engine-config.js';

describe('BOH AI SiliconFlow model config', () => {
  it('uses the lightweight Nex-N2-Pro as Fast baseline (极速响应)', () => {
    const fastMode = chatModes.find((item) => item.id === 'fast');
    expect(FAST_NEX_MODEL_ID).toBe('nex-agi/Nex-N2-Pro');
    expect(fastMode?.model).toBe(FAST_NEX_MODEL_ID);
    expect(fastMode?.tagline).toBe('极速响应');
    expect(availableModels.some((item) => item.id === FAST_NEX_MODEL_ID)).toBe(true);
  });

  it('uses Qwen3-8B as Pro baseline (质量)', () => {
    const proMode = chatModes.find((item) => item.id === 'pro');
    expect(PRO_QWEN_MODEL_ID).toBe('Qwen/Qwen3-8B');
    expect(proMode?.model).toBe(PRO_QWEN_MODEL_ID);
    expect(proMode?.tagline).toBe('质量');
  });

  it('uses DeepSeek-R1 as Plan baseline (超级高质量)', () => {
    const planMode = chatModes.find((item) => item.id === 'plan');
    expect(PLAN_DEEPSEEK_MODEL_ID).toBe('deepseek-ai/DeepSeek-R1-0528-Qwen3-8B');
    expect(planMode?.model).toBe(PLAN_DEEPSEEK_MODEL_ID);
    expect(planMode?.tagline).toBe('超级高质量');
  });

  it('uses Qwen3-8B as Agent baseline (工作)', () => {
    const agentMode = chatModes.find((item) => item.id === 'agent-cluster');
    expect(AGENT_BASE_MODEL_ID).toBe('Qwen/Qwen3-8B');
    expect(agentMode?.model).toBe(AGENT_BASE_MODEL_ID);
    expect(agentMode?.tagline).toBe('工作');
  });

  it('keeps the recommended free chat stack available', () => {
    expect(availableModels.some((item) => item.id === 'Qwen/Qwen3-8B')).toBe(true);
    expect(availableModels.some((item) => item.id === FAST_NEX_MODEL_ID)).toBe(true);
    expect(availableModels.some((item) => item.id === ACCURACY_PREFERRED_MODEL_ID)).toBe(true);
    expect(availableModels.some((item) => item.id === RAG_PREFERRED_MODEL_ID)).toBe(true);
  });

  it('exposes the current mode list (Fast / Pro / Multimodal / Plan / Agent); AUTO removed; Fast is default', () => {
    const ids = chatModes.map((item) => item.id);
    expect(ids).toEqual(['fast', 'pro', 'multimodal', 'plan', 'agent-cluster']);
    expect(BOH_DEFAULT_MODE_ID).toBe('fast');
    expect(BOH_AUTO_MODE_ID).toBe('auto');
    expect(chatModes.find((item) => item.id === 'fast').name).toBe('Fast');
    expect(chatModes.find((item) => item.id === 'pro').name).toBe('Pro');
    expect(chatModes.find((item) => item.id === 'multimodal').name).toBe('多模态');
    expect(chatModes.find((item) => item.id === 'plan').name).toBe('Plan');
    expect(chatModes.find((item) => item.id === 'agent-cluster').name).toBe('Agent');
    // 不再包含 auto
    expect(chatModes.some((item) => item.id === 'auto')).toBe(false);
    // 每个模式都带 tagline（产品语义）
    chatModes.forEach((mode) => {
      expect(typeof mode.tagline).toBe('string');
      expect(mode.tagline.length).toBeGreaterThan(0);
    });
  });

  it('exposes Plan mode with conservative generation settings (low temperature, more tokens)', () => {
    const planMode = chatModes.find((item) => item.id === 'plan');

    expect(planMode?.model).toBe(ACCURACY_PREFERRED_MODEL_ID);
    expect(planMode?.description).toBe('分步推进，深度推理');
    expect(PLAN_MODE_SETTING_KEY).toBe('boh_ai_plan_mode_enabled_v1');
    expect(GENERATION_PROFILE_BY_MODE.plan).toBeDefined();
    expect(GENERATION_PROFILE_BY_MODE.plan.temperature).toBeLessThan(GENERATION_PROFILE_BY_MODE.fast.temperature);
    expect(GENERATION_PROFILE_BY_MODE.plan.max_tokens).toBeGreaterThan(GENERATION_PROFILE_BY_MODE.fast.max_tokens);
  });

  it('exposes generation profile for all current modes (no auto)', () => {
    expect(typeof GENERATION_PROFILE_BY_MODE.fast).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE.pro).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE.multimodal).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE.plan).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE['agent-cluster']).toBe('object');
    // AUTO 已下线,profile 不再包含 auto
    expect(GENERATION_PROFILE_BY_MODE.auto).toBeUndefined();
    // Pro 提供比 Fast 更多的 max_tokens
    expect(GENERATION_PROFILE_BY_MODE.pro.max_tokens).toBeGreaterThan(GENERATION_PROFILE_BY_MODE.fast.max_tokens);
  });

  it('exposes selectable BOH AI response styles', () => {
    const ids = RESPONSE_STYLE_OPTIONS.map((item) => item.id);

    expect(RESPONSE_STYLE_SETTING_KEY).toBe('boh_ai_response_style_v1');
    expect(ids).toEqual(['default', 'socratic', 'psychologist', 'crisp']);
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'default')?.promptAppendix).toContain('可靠、自然的朋友兼助手');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'socratic')?.promptAppendix).toContain('苏格拉底');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'socratic')?.promptAppendix).toContain('思辨伙伴');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'psychologist')?.promptAppendix).toContain('心理专家');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'psychologist')?.promptAppendix).toContain('陪伴者');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'crisp')?.promptAppendix).toContain('高冷干练');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'crisp')?.promptAppendix).toContain('话不多的专业搭档');
  });

  it('documents embedding and rerank models for BOH AI retrieval', () => {
    expect(SILICON_EMBEDDING_MODEL_ID).toBe('BAAI/bge-m3');
    expect(SILICON_RERANK_MODEL_ID).toBe('netease-youdao/bce-reranker-base_v1');
  });
});
