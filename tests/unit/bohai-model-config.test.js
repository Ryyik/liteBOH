import { describe, expect, it } from 'vitest';
import {
  BOH_DEFAULT_MODE_ID,
  BOH_AUTO_MODE_ID,
  GENERATION_PROFILE_BY_MODE,
  PLAN_MODE_SETTING_KEY,
  RESPONSE_STYLE_OPTIONS,
  RESPONSE_STYLE_SETTING_KEY
} from '../../src/views/BOHAI/composables/chat-engine-config.js';

describe('BOH AI config (static definitions only)', () => {
  it('exposes mode ID constants', () => {
    expect(BOH_DEFAULT_MODE_ID).toBe('fast');
    expect(BOH_AUTO_MODE_ID).toBe('auto');
  });

  it('exposes generation profile for all current modes (no auto)', () => {
    expect(typeof GENERATION_PROFILE_BY_MODE.fast).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE.pro).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE.multimodal).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE.plan).toBe('object');
    expect(typeof GENERATION_PROFILE_BY_MODE['agent-cluster']).toBe('object');
    expect(GENERATION_PROFILE_BY_MODE.auto).toBeUndefined();
    expect(GENERATION_PROFILE_BY_MODE.pro.max_tokens).toBeGreaterThan(GENERATION_PROFILE_BY_MODE.fast.max_tokens);
  });

  it('exposes selectable BOH AI response styles', () => {
    const ids = RESPONSE_STYLE_OPTIONS.map((item) => item.id);
    expect(RESPONSE_STYLE_SETTING_KEY).toBe('boh_ai_response_style_v1');
    expect(ids).toEqual(['default', 'socratic', 'psychologist', 'crisp']);
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'default')?.promptAppendix).toContain('可靠、自然的朋友兼助手');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'socratic')?.promptAppendix).toContain('苏格拉底');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'psychologist')?.promptAppendix).toContain('心理专家');
    expect(RESPONSE_STYLE_OPTIONS.find((item) => item.id === 'crisp')?.promptAppendix).toContain('高冷干练');
  });

  it('exposes Plan mode setting key', () => {
    expect(PLAN_MODE_SETTING_KEY).toBe('boh_ai_plan_mode_enabled_v1');
  });
});
