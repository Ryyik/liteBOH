/**
 * bohai-system-prompt.test.js — 锁 system prompt 段落拼装（plans/025 v2 · Step 5-3）
 *
 * 关键口径：
 *   ① `contextBlock` 顺序 = 页面 → 证据 → 摘要（摘要包 `<conversation_summary>`）；
 *   ② `contextBlock` 必须**替换进** `BASE_SYSTEM_PROMPT` 的占位符（不留 `CONTEXT_PLACEHOLDER`）；
 *   ③ 空段一律被 `filter` 掉；Plan / 健康 / 访谈块按开关出现。
 */
import { describe, expect, it } from 'vitest';
import {
  HEALTH_ANALYSIS_PROMPT_APPENDIX,
  PLAN_MODE_PROMPT_APPENDIX,
  CONTEXT_PLACEHOLDER,
} from '../../src/views/BOHAI/composables/chat-engine-config';
import { buildSystemPromptSections } from '../../src/views/BOHAI/engine/stages/system-prompt';

const BASE = {
  pageContextBlock: '',
  evidenceContextBlock: '',
  cachedSummary: null,
  structuredMemoryBlock: '',
  isPlanMode: false,
  healthAnalysisActive: false,
  psychInterviewProtocol: '',
  psychStateBlock: '',
  psychRulesBlock: '',
  stylePromptAppendix: '',
};

describe('BOHAI system prompt 段落拼装（Step 5-3）', () => {
  it('空输入 → contextBlock 为空串，且占位符已被替换掉', () => {
    const { contextBlock, systemPromptContent } = buildSystemPromptSections(BASE);
    expect(contextBlock).toBe('');
    expect(systemPromptContent).not.toContain(CONTEXT_PLACEHOLDER);
  });

  it('contextBlock 顺序 = 页面 → 证据 → 摘要', () => {
    const { contextBlock } = buildSystemPromptSections({
      ...BASE,
      pageContextBlock: 'PAGE',
      evidenceContextBlock: 'EVID',
      cachedSummary: 'SUM',
    });
    expect(contextBlock.indexOf('PAGE')).toBeLessThan(contextBlock.indexOf('EVID'));
    expect(contextBlock.indexOf('EVID')).toBeLessThan(contextBlock.indexOf('SUM'));
    expect(contextBlock).toContain('<conversation_summary>');
  });

  it('contextBlock 非空时会替换进 system prompt', () => {
    const { systemPromptContent } = buildSystemPromptSections({
      ...BASE,
      evidenceContextBlock: 'EVID',
    });
    expect(systemPromptContent).toContain('EVID');
  });

  it('Plan / 健康 / 访谈块按开关出现，空段被丢弃', () => {
    const off = buildSystemPromptSections(BASE);
    expect(off.systemPromptContent).not.toContain(PLAN_MODE_PROMPT_APPENDIX);
    expect(off.systemPromptContent).not.toContain(HEALTH_ANALYSIS_PROMPT_APPENDIX);

    const on = buildSystemPromptSections({
      ...BASE,
      isPlanMode: true,
      healthAnalysisActive: true,
      psychInterviewProtocol: 'PROTO',
      structuredMemoryBlock: 'SM',
    });
    expect(on.systemPromptContent).toContain(PLAN_MODE_PROMPT_APPENDIX);
    expect(on.systemPromptContent).toContain(HEALTH_ANALYSIS_PROMPT_APPENDIX);
    expect(on.systemPromptContent).toContain('PROTO');
    expect(on.systemPromptContent).toContain('SM');
  });
});
