/**
 * bohai-reasoning-capture.test.js — 锁「推理内容分流」（2026-10-10 用户口径「推理过程可展开」）
 *
 * 事故/动机：`filterThinkingContentStream` 原本把 `<think>…</think>` 里的文字**直接丢弃**
 * （正文里只剩答案），用户看不到模型在想什么。本次改成**分流**：
 * 同一段文字累积进 thinkingState 的 reasoning，由消息层渲染成可展开块。
 *
 * ⚠️ 本文件的**第一性断言**是「正文一个字符都不变」—— 分流是「不再丢」，不是「新增可见文本」。
 *    任何让推理混进正文的改动都必须在这里红。
 *
 * 2026-10-22 追加（用户报障「Z1 也有推理把思考过程泄露到正文」）：
 *   Z1 系只吐**闭合**标签（开口由对话模板替它说），旧过滤器只认开口 ⇒ 整段思考进正文。
 *   这里锁四件事：裸闭合、半截开口、半截闭合、以及「前导暂存不许把正文扣住」。
 */
import { describe, expect, it } from 'vitest';
import { useGenerationPipeline } from '../../src/views/BOHAI/composables/useGenerationPipeline.js';

const makePipeline = () =>
  useGenerationPipeline({
    availableModels: { value: [] },
    abortController: { value: null },
    currentModeId: { value: 'fast' },
  });

/** 把一串分块喂进流式过滤器，返回累积的可见正文。 */
const feed = (pipeline, state, chunks) => {
  let visible = '';
  for (const chunk of chunks) visible += pipeline.filterThinkingContentStream(chunk, state);
  visible += pipeline.flushThinkingBuffer(state);
  return visible;
};

/**
 * 按**真实上游报文**喂：每块先 `notePayload`（带 `model`）再过滤内容 ——
 * 顺序与 `engine/stages/stream.ts` 的 SSE 回调一致。
 * 这是唯一能覆盖「策略行」的形态：`balance` 的 displayName 不含 z1，
 * 真实模型名只出现在这里（`resolveStrategyCandidate` 在服务端抽）。
 */
const feedPayloads = (pipeline, state, contents, model = 'glm-z1-flash') => {
  let visible = '';
  for (const content of contents) {
    state.notePayload?.({ model, choices: [{ delta: { content } }] });
    visible += pipeline.filterThinkingContentStream(content, state);
  }
  visible += pipeline.flushThinkingBuffer(state);
  return visible;
};

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

/**
 * 2026-10-22 · Z1（GLM-Z1-Flash）泄漏回归。
 *
 * 现象（用户报障「Z1 也有推理把思考过程泄露」）：生成时正文里带着整段「好的，用户问的是…
 * 我需要先分析…」，刷新页面后又正常 —— 因为**非流式**过滤器有 `^[\s\S]*</think>` 兜底，
 * **流式**只认开口标签。这组断言就是把这个不对称钉死。
 *
 * ⚠️ 一条物理约束决定了这些用例的形态：**已经吐进正文的字收不回来**
 *   （`stream.ts` 是 `assistantMessage += 过滤结果`）。所以要拦住裸闭合思考，
 *   必须从**第一个字**就按住等判定 —— 因此下面的用例要么带 modelHint、要么走
 *   `feedPayloads`（带上游 `model` 字段，真实链路的顺序）。
 *   不按住的裸喂只用于验证「闭合标签本身被正确识别」，不用于验证「整段不泄漏」。
 */
describe('Z1 形态：只有闭合标签的思考（2026-10-22）', () => {
  const Z1_SINGLE = '好的，用户问的是 X，我需要先分析……\n</think>\n\n这是最终答案。';

  it('单块：闭合之前的全归推理，正文只剩答案', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    expect(feed(pipeline, state, [Z1_SINGLE])).toBe('\n\n这是最终答案。');
    expect(pipeline.getThinkingReasoning(state)).toBe('好的，用户问的是 X，我需要先分析……\n');
  });

  it('分块 + 前导暂存：闭合标签被切开也不泄漏（</thi + nk>）', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState('GLMZ1Flash boh:Code');
    const visible = feed(pipeline, state, [
      '好的，用户问的是 X',
      '，我需要先分析……\n</thi',
      'nk>\n\n这是最终答案。',
    ]);
    expect(visible).not.toContain('分析');
    expect(visible).not.toContain('</think');
    expect(visible.trim()).toBe('这是最终答案。');
    expect(pipeline.getThinkingReasoning(state)).toContain('我需要先分析');
  });

  it('策略行（displayName 是 balance，命中不了提示）靠上游 model 字段也能拦住', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState('balance boh:balance');
    const visible = feedPayloads(pipeline, state, [
      '好的，用户问的是 X',
      '，我需要先分析……\n</think>\n\n这是最终答案。',
    ]);
    expect(visible.trim()).toBe('这是最终答案。');
    expect(pipeline.getThinkingReasoning(state)).toContain('我需要先分析');
  });

  it('非流式过滤器同口径（否则会出现「刷新后正常、生成时带思考」）', () => {
    const pipeline = makePipeline();
    expect(pipeline.filterThinkingContent(Z1_SINGLE).trim()).toBe('这是最终答案。');
  });

  it('前导暂存不许把普通正文扣住：命中 Z1 提示但上游给的是干净正文 → 照常吐', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState('GLMZ1Flash boh:Code');
    expect(state.isLeadingHoldActive()).toBe(true);
    // 第一块没有标签 → 继续按住（还不能判定）
    expect(pipeline.filterThinkingContentStream('普通答案开头', state)).toBe('');
    // 流到 EOF 仍无标签 ⇒ 全部当正文吐出来，一个字都不能少
    expect(pipeline.flushThinkingBuffer(state)).toBe('普通答案开头');
  });

  it('超长兜底：正文很长且始终没标签 ⇒ 放弃判定并放行（不许无限扣住）', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState('GLM-Z1-Flash');
    const long = '正'.repeat(4001);
    expect(pipeline.filterThinkingContentStream(long, state)).toBe(long);
    expect(state.isLeadingHoldActive()).toBe(false);
  });

  it('上游把思考放进独立字段（reasoning_content）→ 立即放行，不按住', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState('GLM-Z1-Flash');
    expect(state.isLeadingHoldActive()).toBe(true);
    state.notePayload({ choices: [{ delta: { reasoning_content: '内部推理' } }] });
    expect(state.isLeadingHoldActive()).toBe(false);
    expect(pipeline.filterThinkingContentStream('这是正文', state)).toBe('这是正文');
  });

  it('非 Z1 模型不启用前导暂存（不无谓延迟首字）', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState('Qwen3-8B boh:fast');
    expect(state.isLeadingHoldActive()).toBe(false);
    expect(pipeline.filterThinkingContentStream('直接出字', state)).toBe('直接出字');
  });

  it('reset() 不吞掉前导暂存（callModelStream 建完状态立刻 reset）', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState('GLM-Z1-Flash');
    state.reset();
    expect(state.isLeadingHoldActive()).toBe(true);
    const visible = feed(pipeline, state, ['思考……\n</think>答案']);
    expect(visible.trim()).toBe('答案');
  });
});

/** 标签识别面：`<thought>`（Gemma 实测形态）与半截标签。 */
describe('其它渠道的思考标签', () => {
  it('<thought> 与 </thought> 同样分流', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    expect(feed(pipeline, state, ['<thought>内心推理</thought>正文'])).toBe('正文');
    expect(pipeline.getThinkingReasoning(state)).toBe('内心推理');
  });

  it('开口标签被切块（<thi + nk>）也不会把思考漏进正文', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    const visible = feed(pipeline, state, ['<thi', 'nk>内心推理</think>正文']);
    expect(visible).toBe('正文');
    expect(pipeline.getThinkingReasoning(state)).toBe('内心推理');
  });

  it('thinking 的开口被切块同样不漏', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    const visible = feed(pipeline, state, ['<thin', 'king>内部</thinking>正文']);
    expect(visible).toBe('正文');
    expect(pipeline.getThinkingReasoning(state)).toBe('内部');
  });

  it('纯正文里的 HTML 片段不误伤（只有整标签才算）', () => {
    const pipeline = makePipeline();
    const state = pipeline.createThinkingState();
    const text = '用 <th> 做表头，用 <td> 做单元格。';
    expect(feed(pipeline, state, [text])).toBe(text);
    expect(pipeline.getThinkingReasoning(state)).toBe('');
  });
});
