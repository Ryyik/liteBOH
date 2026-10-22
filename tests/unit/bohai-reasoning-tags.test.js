/**
 * bohai-reasoning-tags.test.js — 锁 `src/utils/reasoning-tags.js` 这一份真源
 *
 * 动机（2026-10-22 用户报障「Z1 也有推理把思考过程泄露」）：同一条「剥思考标签」规则
 * 原本在四处各写一份，且都只认 `think`/`thinking`、只在见到**开口**标签时生效。
 * 这一份是真源，所以这里断言的**既有「该剥的剥掉」，也有「不该动的别动」**。
 *
 * ⚠️ 后半部分（JSON 提取器）是**反向风险**：剥得太狠会把要解析的 JSON 一起删掉，
 *    而那条失败路径是静默的（解析返回 null → 编排降级，不报错）。
 */
import { describe, expect, it } from 'vitest';
import {
  PARTIAL_THINK_CLOSE_RE,
  PARTIAL_THINK_OPEN_RE,
  REASONING_CLOSE_RE,
  REASONING_OPEN_RE,
  isLikelyBareCloseReasoningModel,
  isLikelyReasoningModel,
  stripPairedReasoningBlocks,
  stripReasoningBlocks,
} from '../../src/utils/reasoning-tags.js';
import { extractBohAIJsonObject } from '../../src/utils/bohai-model-client.js';
import { parseOrchestratorPlan } from '../../src/views/BOHAI/agents/prompts/orchestrator-prompt.js';

describe('stripReasoningBlocks：四种形态都要剥', () => {
  it('成对标签', () => {
    expect(stripReasoningBlocks('<think>推理</think>正文')).toBe('正文');
    expect(stripReasoningBlocks('<thinking>推理</thinking>正文')).toBe('正文');
    expect(stripReasoningBlocks('<thought>推理</thought>正文')).toBe('正文');
  });

  it('只有开口（流被截断）→ 后面全算思考', () => {
    expect(stripReasoningBlocks('正文<think>没写完的推理')).toBe('正文');
  });

  it('只有闭合（Z1 形态）→ 闭合之前全算思考', () => {
    expect(stripReasoningBlocks('思考……</think>正文')).toBe('正文');
  });

  it('带属性的标签同样认', () => {
    expect(stripReasoningBlocks('<think type="x">推理</think>正文')).toBe('正文');
    expect(stripReasoningBlocks('思考</think >正文')).toBe('正文');
  });

  it('孤立闭合标签 = 裸闭合形态（前面的算思考），这是有意的取舍', () => {
    // 「单独一个 </think>」与「Z1 的只有闭合」在字面上无法区分。既然 Z1 的模板就是
    // `split('</think>')[-1]`，这里选择**与上游一致**：闭合之前全算思考。
    // 代价是「正文里本来就写了一个 </think>」会少一段；收益是 Z1 的整段思考不会泄漏 ——
    // 泄漏是用户报障的那件事，反过来只是理论风险，且由 stripPairedReasoningBlocks 兜住
    // 需要保留正文的调用方（JSON 提取器）。
    expect(stripReasoningBlocks('前</think>后')).toBe('后');
  });

  it('没有标签时原样返回（这是最要紧的一条：不凭空改字）', () => {
    const text = '用 <th> 做表头，用 <td> 做单元格；1 < 2 且 3 > 2。';
    expect(stripReasoningBlocks(text)).toBe(text);
  });
});

describe('半截标签正则可复用（分块边界）', () => {
  it.each([
    ['</t', true],
    ['</th', true],
    ['</thi', true],
    ['</think', true],
    ['</THINK', true],
    ['<t', false],
    ['正文</thi', true],
    ['正文', false],
  ])('PARTIAL_THINK_CLOSE_RE 匹配 %s ⇒ %s', (text, expected) => {
    expect(PARTIAL_THINK_CLOSE_RE.test(text)).toBe(expected);
    PARTIAL_THINK_CLOSE_RE.lastIndex = 0;
  });

  it.each([
    ['<t', true],
    ['<thi', true],
    ['<think', true],
    ['<thought', true],
    ['</t', false],
    ['正文', false],
  ])('PARTIAL_THINK_OPEN_RE 匹配 %s ⇒ %s', (text, expected) => {
    expect(PARTIAL_THINK_OPEN_RE.test(text)).toBe(expected);
    PARTIAL_THINK_OPEN_RE.lastIndex = 0;
  });

  it('完整标签能被开/闭两条正则认出来', () => {
    expect(REASONING_OPEN_RE.test('<think>')).toBe(true);
    expect(REASONING_CLOSE_RE.test('</thought>')).toBe(true);
    expect(REASONING_CLOSE_RE.test('<think>')).toBe(false);
    REASONING_OPEN_RE.lastIndex = 0;
    REASONING_CLOSE_RE.lastIndex = 0;
  });
});

describe('模型提示（只影响要不要按住开头，不影响可见文本）', () => {
  it('Z1 家族命中「裸闭合」，也要被算作推理模型', () => {
    for (const name of ['GLM-Z1-Flash', 'glmz1', 'GLMZ1Flash', 'boh:Code z1']) {
      expect(isLikelyBareCloseReasoningModel(name)).toBe(true);
      expect(isLikelyReasoningModel(name)).toBe(true);
    }
  });

  it('开标签家族 / 普通模型不算「裸闭合」（不该白等）', () => {
    for (const name of ['deepseek-r1', 'Qwen3-8B', 'gemini-2.5-flash', '']) {
      expect(isLikelyBareCloseReasoningModel(name)).toBe(false);
    }
  });

  it('空输入安全', () => {
    expect(isLikelyReasoningModel()).toBe(false);
    expect(isLikelyBareCloseReasoningModel()).toBe(false);
    expect(isLikelyReasoningModel(null, undefined, '')).toBe(false);
  });
});

describe('JSON 提取器：只剥成对标签，绝不吞掉 JSON', () => {
  const plan = '{"strategy":"fanout","tasks":[{"agent":"web","goal":"查天气"}]}';

  it('前面的成对思考块被剥掉，JSON 完整可解析', () => {
    expect(extractBohAIJsonObject(`<think>先想想</think>${plan}`)).toEqual(JSON.parse(plan));
  });

  it('JSON 里出现未闭合的 <thinking> 字样时不吞掉后半段（反向风险）', () => {
    const tricky = '{"note":"示例：<thinking> 标签要成对"}';
    expect(extractBohAIJsonObject(tricky)).toEqual(JSON.parse(tricky));
  });

  it('parseOrchestratorPlan 同样只剥成对标签', () => {
    const parsed = parseOrchestratorPlan(`<think>推演</think>${plan}`);
    expect(parsed?.strategy).toBe('fanout');
    expect(parsed?.tasks?.[0]?.agent).toBe('web');
  });

  it('stripPairedReasoningBlocks 不向两侧蔓延（这是它与 stripReasoningBlocks 的唯一区别）', () => {
    expect(stripPairedReasoningBlocks('前<think>x')).toBe('前<think>x');
    expect(stripPairedReasoningBlocks('x</think>后')).toBe('x</think>后');
    // 对照组：完整版会向两侧蔓延
    expect(stripReasoningBlocks('前<think>x')).toBe('前');
    expect(stripReasoningBlocks('x</think>后')).toBe('后');
  });
});
