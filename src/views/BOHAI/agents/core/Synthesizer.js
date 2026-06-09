import { callBohAIModel, extractBohAIJsonObject } from '@/utils/bohai-model-client.js';
import { logger } from '@/utils/logger.js';
import { SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID, resolveSiliconFlowFreeModelId } from '@/utils/siliconflow-free-models.js';
import { AGENT_AGENT_ROLES, AGENT_AGENT_STATUS, createAgentEvent } from './agent-events.js';
import { AGENT_SYNTHESIZER_DEFAULT_MODEL_ID } from '../../composables/chat-engine-config.js';
import {
  SYNTHESIZER_SYSTEM_PROMPT,
  SYNTH_FINAL_MARKER,
  buildSynthesizerUserPrompt,
  splitSynthesizerStream
} from '../prompts/synthesizer-prompt.js';

const DEFAULT_SYNTH_MODEL = AGENT_SYNTHESIZER_DEFAULT_MODEL_ID;
const MAX_SYNTH_TOKENS = 1600;
const TYPEWRITER_INTERVAL_MS = 18; // 每 18ms 推一帧到 onStream，模拟"打字机"流式
const TYPEWRITER_MAX_CHARS_PER_FRAME = 4;

/**
 * 局部失败聚合：拆出"全部失败 / 部分成功"两种情形。
 * 全部失败：UI 需要明确告知并把每个 worker 的错误罗列出来。
 * 部分成功：依然退化为多 Agent 直出拼接，但告知用户哪些 Agent 失败。
 */
const fallbackAnswer = ({ bus, reason, totalFailure }) => {
  const outputs = bus?.getAgentOutputs?.() || {};
  const entries = Object.entries(outputs);
  if (!entries.length) {
    return {
      answer: totalFailure
        ? `${reason || '所有 Agent 都未产出结果'}\n\n建议：换个问法、关闭部分 Agent 或稍后重试。`
        : (reason || '当前没有可用的 Agent 产出。'),
      sources: [],
      degraded: true,
      totalFailure: Boolean(totalFailure)
    };
  }
  const chunks = [];
  const sources = [];
  const failedNames = [];
  entries.forEach(([agent, output], index) => {
    if (!output) {
      failedNames.push(agent);
      return;
    }
    // 状态为 FAILED / SKIPPED / CANCELLED 的不拼进 visible
    if (output.status && [AGENT_AGENT_STATUS.FAILED, AGENT_AGENT_STATUS.SKIPPED, AGENT_AGENT_STATUS.CANCELLED].includes(output.status)) {
      failedNames.push(agent);
      return;
    }
    const summary = typeof output.output === 'string'
      ? output.output
      : (output.output?.summary || output.output?.answer || '');
    if (summary) chunks.push(`【${agent}】\n${String(summary).slice(0, 600)}`);
    if (output.sources && output.sources.length) {
      output.sources.forEach((s) => sources.push({ id: s.id || `${agent}-${index}`, label: s.label || agent, source: s.source || '' }));
    }
  });
  const failHint = totalFailure && failedNames.length
    ? `\n\n（参与 Agent 均失败：${failedNames.join('、')}）`
    : (failedNames.length ? `\n\n（部分 Agent 失败，已跳过：${failedNames.join('、')}）` : '');
  return {
    answer: chunks.length ? `${chunks.join('\n\n')}\n\n（合成器异常，已退化为多 Agent 直出）${failHint}` : (reason || '合成器异常') + failHint,
    sources,
    degraded: true,
    totalFailure: Boolean(totalFailure)
  };
};

/**
 * "打字机"式伪流式：拿到完整 answer 后按 typewriter 节奏推给 onStream。
 * 不增加 LLM 真实延迟（模型本就要等齐才能返回），但能立刻把"已收到全量"展示成
 * 用户视觉上"逐字出现"，明显降低感知首字延迟。
 *
 * NOTE: 等 bohai-model-client.js 支持真 SSE 后，把这里替换为真正的流式读取。
 */
const streamTypewriter = async (text, onStream) => {
  if (typeof onStream !== 'function' || !text) return;
  let pos = 0;
  while (pos < text.length) {
    const step = Math.min(TYPEWRITER_MAX_CHARS_PER_FRAME, text.length - pos);
    // 跨过换行/句子边界时多推一格，强化"自然"感
    const tail = text.slice(pos, pos + step + 2);
    const advance = /[。！？!?\n]\s*$/.test(tail) ? step + 1 : step;
    pos += advance;
    onStream(text.slice(0, pos));
    if (pos >= text.length) break;
    await new Promise((resolve) => setTimeout(resolve, TYPEWRITER_INTERVAL_MS));
  }
};

export const createSynthesizer = ({
  defaultModel = DEFAULT_SYNTH_MODEL,
  historySummaryFn,
  modelClient
} = {}) => {
  const client = modelClient || { call: callBohAIModel, extractJson: extractBohAIJsonObject };
  const modelId = resolveSiliconFlowFreeModelId(defaultModel, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID);

  const synthesize = async ({ query, bus, historySummary, sources = [], onStream } = {}) => {
    const snapshot = bus?.snapshot?.() || {};
    const agentOutputs = Object.entries(snapshot.agentOutputs || {}).map(([agent, output]) => ({
      agent,
      role: output?.role,
      status: output?.status,
      output: output?.output,
      evidence: output?.evidence,
      notes: output?.notes,
      sources: output?.sources
    }));

    if (!agentOutputs.length) {
      return { answer: '当前没有可用的 Agent 产出。', sources: [], degraded: true, totalFailure: true };
    }

    // 统计失败/成功的 Agent 数量，用来决定是否降级为"全部失败"
    const totalCount = agentOutputs.length;
    const failedCount = agentOutputs.filter((entry) => entry.status && [
      AGENT_AGENT_STATUS.FAILED,
      AGENT_AGENT_STATUS.SKIPPED,
      AGENT_AGENT_STATUS.CANCELLED
    ].includes(entry.status)).length;
    const totalFailure = failedCount >= totalCount;

    const userPrompt = buildSynthesizerUserPrompt({
      query,
      historySummary: historySummary || (historySummaryFn ? historySummaryFn({ bus }) : ''),
      agentOutputs,
      evidence: snapshot.evidence,
      sources
    });

    let finalAnswer = '';
    let internal = '';
    let hadMarker = false;
    let degraded = false;

    try {
      const { content } = await client.call({
        model: modelId,
        messages: [
          { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
          { role: 'user', content: `${userPrompt}\n\n请输出最终回复，结尾用一行单独的 ${SYNTH_FINAL_MARKER} 标记。` }
        ],
        temperature: 0.2,
        maxTokens: MAX_SYNTH_TOKENS
      });
      const split = splitSynthesizerStream(content);
      finalAnswer = (split.visible || content || '').trim();
      internal = split.internal;
      hadMarker = split.hadMarker;
    } catch (error) {
      logger.warn('bohai-cluster', 'Synthesizer 模型调用失败，回退到 Agent 直出', { error: String(error?.message || error) });
      const fallback = fallbackAnswer({
        bus,
        reason: `合成器调用失败：${String(error?.message || error).slice(0, 80)}`,
        totalFailure
      });
      finalAnswer = fallback.answer;
      degraded = true;
    }

    if (!finalAnswer) {
      const fallback = fallbackAnswer({
        bus,
        reason: hadMarker ? '合成器空输出' : '合成器未返回有效答案',
        totalFailure
      });
      finalAnswer = fallback.answer;
      degraded = true;
    }

    // 打字机式流式：先一次性 onStream('') 重置可能存在的 UI 残留，再逐步推
    if (typeof onStream === 'function' && finalAnswer) {
      try { onStream(''); } catch (_err) { /* ignore */ }
      await streamTypewriter(finalAnswer, onStream);
    }

    return {
      answer: finalAnswer,
      sources,
      internal,
      degraded,
      totalFailure: totalFailure && degraded,
      hadMarker
    };
  };

  return { synthesize };
};

export const createSynthesizerAgent = (options = {}) => {
  const synthesizer = createSynthesizer(options);
  return {
    name: AGENT_AGENT_ROLES.SYNTHESIZER,
    role: AGENT_AGENT_ROLES.SYNTHESIZER,
    tag: 'synthesizer',
    label: '合成',
    category: 'control',
    timeoutMs: 30000,
    async run({ context }) {
      const bus = context?.bus;
      const query = bus?.getQuery?.() || '';
      const sources = bus?.getSources?.() || [];
      const result = await synthesizer.synthesize({
        query,
        bus,
        historySummary: context?.historySummary,
        sources,
        onStream: context?.onStream
      });
      if (result.degraded) {
        context?.bus?.setSharedContext?.('synthesizer.degraded', true);
      }
      if (result.totalFailure) {
        context?.bus?.setSharedContext?.('synthesizer.totalFailure', true);
      }
      context?.bus?.setSharedContext?.('synthesizer.answer', result.answer);
      return {
        ok: true,
        output: { answer: result.answer, degraded: result.degraded, totalFailure: result.totalFailure, sources: result.sources },
        sources: result.sources || [],
        notes: result.degraded ? (result.totalFailure ? ['合成器全部失败，已聚合错误'] : ['合成器已降级为 Agent 直出']) : [],
        tokens: 900
      };
    }
  };
};

export const buildFinalEvent = ({ answer, sources, degraded }) => createAgentEvent('final', {
  answer: String(answer || ''),
  sources: Array.isArray(sources) ? sources : [],
  degraded: Boolean(degraded)
});
