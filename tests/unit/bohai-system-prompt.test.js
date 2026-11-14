/**
 * bohai-system-prompt.test.js — 锁 system prompt 段落拼装（plans/025 v2 · Step 5-3）
 *
 * 关键口径：
 *   ① `contextBlock` 顺序 = **时间锚点** → 页面 → 证据 → 摘要（摘要包 `<conversation_summary>`）；
 *   ② `contextBlock` 必须**替换进** `BASE_SYSTEM_PROMPT` 的占位符（不留 `CONTEXT_PLACEHOLDER`）；
 *   ③ 空段一律被 `filter` 掉；Plan / 访谈块按开关出现。
 *
 * 2026-11-12 口径变更：「空输入 → contextBlock 为空串」已作废 —— 时间锚点是无条件的
 * （它不属于「上下文内容」，而是所有日期判断的参照系），所以空输入时 contextBlock 恰好只剩锚点。
 * 所有用例都用固定 `now` 注入，避免断言随时间漂移（也别让它依赖跑测机器的时区）。
 */
import { describe, expect, it } from 'vitest';
import {
  PLAN_MODE_PROMPT_APPENDIX,
  CONTEXT_PLACEHOLDER,
} from '../../src/views/BOHAI/composables/chat-engine-config';
import { buildSystemPromptSections } from '../../src/views/BOHAI/engine/stages/system-prompt';

/** 固定取时点：UTC 2026-11-12 12:28:52 = 北京时间 2026-11-12 20:28（周四） */
const FIXED_NOW = new Date('2026-11-12T12:28:52Z');

const BASE = {
  pageContextBlock: '',
  evidenceContextBlock: '',
  cachedSummary: null,
  structuredMemoryBlock: '',
  isPlanMode: false,
  psychInterviewProtocol: '',
  psychStateBlock: '',
  psychRulesBlock: '',
  stylePromptAppendix: '',
  now: FIXED_NOW,
};

describe('BOHAI system prompt 段落拼装（Step 5-3）', () => {
  it('空输入 → contextBlock 只剩时间锚点，且占位符已被替换掉', () => {
    const { contextBlock, systemPromptContent } = buildSystemPromptSections(BASE);
    expect(contextBlock).toContain('<temporal_anchor>');
    expect(contextBlock).toContain('2026-11-12 20:28');
    expect(contextBlock).not.toContain('PAGE');
    expect(systemPromptContent).not.toContain(CONTEXT_PLACEHOLDER);
  });

  it('contextBlock 顺序 = 时间锚点 → 页面 → 证据 → 摘要', () => {
    const { contextBlock } = buildSystemPromptSections({
      ...BASE,
      pageContextBlock: 'PAGE',
      evidenceContextBlock: 'EVID',
      cachedSummary: 'SUM',
    });
    expect(contextBlock.indexOf('<temporal_anchor>')).toBeLessThan(contextBlock.indexOf('PAGE'));
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
    expect(systemPromptContent).toContain('<temporal_anchor>');
  });

  it('锚点落在 <context> 块**内部**第一段（不是拼在 prompt 外面）', () => {
    const { systemPromptContent } = buildSystemPromptSections({
      ...BASE,
      evidenceContextBlock: 'EVID',
    });
    const open = systemPromptContent.indexOf('<context>');
    const close = systemPromptContent.indexOf('</context>');
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const inside = systemPromptContent.slice(open, close);
    expect(inside).toContain('<temporal_anchor>');
    expect(inside.indexOf('<temporal_anchor>')).toBeLessThan(inside.indexOf('EVID'));
  });

  it('Plan / 访谈块按开关出现，空段被丢弃', () => {
    const off = buildSystemPromptSections(BASE);
    expect(off.systemPromptContent).not.toContain(PLAN_MODE_PROMPT_APPENDIX);

    const on = buildSystemPromptSections({
      ...BASE,
      isPlanMode: true,
      psychInterviewProtocol: 'PROTO',
      structuredMemoryBlock: 'SM',
    });
    expect(on.systemPromptContent).toContain(PLAN_MODE_PROMPT_APPENDIX);
    expect(on.systemPromptContent).toContain('PROTO');
    expect(on.systemPromptContent).toContain('SM');
  });
});
