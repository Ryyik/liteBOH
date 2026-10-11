/**
 * bohai-reasoning-capture.test.js — 锁「推理内容分流」（2026-10-10 用户口径「推理过程可展开」）
 *
 * 事故/动机：`filterThinkingContentStream` 原本把 `<think>…</think>` 里的文字**直接丢弃**
 * （正文里只剩答案），用户看不到模型在想什么。本次改成**分流**：
 * 同一段文字累积进 thinkingState 的 reasoning，由消息层渲染成可展开块。
 *
 * ⚠️ 本文件的**第一性断言**是「正文一个字符都不变」—— 分流是「不再丢」，不是「新增可见文本」。
 *    任何让推理混进正文的改动都必须在这里红。
 */
import { describe, expect, it } from 'vitest';
import { useGenerationPipeline } from '../../src/views/BOHAI/composables/useGenerationPipeline.js';

const makePipeline = () =>
  useGenerationPipeline({
    availableModels: { value: [] },
    abortController: { value: null },
    currentModeId: { value: 'fast' },
  });

describe('推理内容分流（思考块原文不再丢弃）', () => {
  it('同一块里的完整思考块 → 原文进 reasoning，正文一字不变', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    const visible = pipeline.filterThinkingContentStream(
      '<think>先联网确认</think>答案在此',
      state,
    );
    expect(visible).toBe('答案在此');
    expect(pipeline.getThinkingReasoning(state)).toBe('先联网确认');
  });

  it('跨块累积；闭合标签被分块切开也不丢、不泄漏', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    let visible = '';
    for (const chunk of ['<think>第一段', '第二段</thi', 'nking>正文']) {
      visible += pipeline.filterThinkingContentStream(chunk, state);
    }
    expect(visible).toBe('正文');
    expect(pipeline.getThinkingReasoning(state)).toBe('第一段第二段');
  });

  it('思考块内被截断（流结束）→ 残留归推理，**不混进正文**', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    pipeline.filterThinkingContentStream('<think>没写完的推理', state);
    expect(pipeline.flushThinkingBuffer(state)).toBe('');
    expect(pipeline.getThinkingReasoning(state)).toBe('没写完的推理');
  });

  it('普通正文照常输出，reasoning 保持为空（不凭空产生内容）', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    expect(pipeline.filterThinkingContentStream('普通正文', state)).toBe('普通正文');
    pipeline.filterThinkingContentStream('再来一段', state);
    expect(pipeline.getThinkingReasoning(state)).toBe('');
  });

  it('reasoning 属于「本轮生成」，不被 flush 的 reset 清掉', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    pipeline.filterThinkingContentStream('<think>想完了</think>正文', state);
    pipeline.flushThinkingBuffer(state);
    expect(pipeline.getThinkingReasoning(state)).toBe('想完了');
  });
});
