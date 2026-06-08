import { callBohAIModel, extractBohAIJsonObject } from '@/utils/bohai-model-client.js';
import { logger } from '@/utils/logger.js';
import { SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID, resolveSiliconFlowFreeModelId } from '@/utils/siliconflow-free-models.js';
import { AGENT_AGENT_ROLES, createAgentEvent } from './agent-events.js';
import { AGENT_SYNTHESIZER_DEFAULT_MODEL_ID } from '../../composables/chat-engine-config.js';
import {
  SYNTHESIZER_SYSTEM_PROMPT,
  buildSynthesizerUserPrompt,
  splitSynthesizerStream
} from '../prompts/synthesizer-prompt.js';

const DEFAULT_SYNTH_MODEL = AGENT_SYNTHESIZER_DEFAULT_MODEL_ID;
const MAX_SYNTH_TOKENS = 1600;

const fallbackAnswer = ({ bus, reason }) => {
  const outputs = bus?.getAgentOutputs?.() || {};
  const entries = Object.entries(outputs);
  if (!entries.length) {
    return { answer: reason || '当前没有可用的 Agent 产出。', sources: [], degraded: true };
  }
  const chunks = [];
  const sources = [];
  entries.forEach(([agent, output], index) => {
    if (!output) return;
    const summary = typeof output.output === 'string'
      ? output.output
      : (output.output?.summary || output.output?.answer || '');
    if (summary) chunks.push(`【${agent}】\n${String(summary).slice(0, 600)}`);
    if (output.sources && output.sources.length) {
      output.sources.forEach((s) => sources.push({ id: s.id || `${agent}-${index}`, label: s.label || agent, source: s.source || '' }));
    }
  });
  return {
    answer: chunks.length ? `${chunks.join('\n\n')}\n\n（合成器异常，已退化为多 Agent 直出）` : (reason || '合成器异常'),
    sources,
    degraded: true
  };
};

export const createSynthesizer = ({
  defaultModel = DEFAULT_SYNTH_MODEL,
  historySummaryFn,
  modelClient
} = {}) => {
  const client = modelClient || { call: callBohAIModel, extractJson: extractBohAIJsonObject };
  const modelId = resolveSiliconFlowFreeModelId(defaultModel, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID);

  const synthesize = async ({ query, bus, historySummary, sources = [] } = {}) => {
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
      return { answer: '当前没有可用的 Agent 产出。', sources: [], degraded: true };
    }

    const userPrompt = buildSynthesizerUserPrompt({
      query,
      historySummary: historySummary || (historySummaryFn ? historySummaryFn({ bus }) : ''),
      agentOutputs,
      evidence: snapshot.evidence,
      sources
    });

    try {
      const { content } = await client.call({
        model: modelId,
        messages: [
          { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        maxTokens: MAX_SYNTH_TOKENS
      });
      const { visible, internal } = splitSynthesizerStream(content);
      const answer = (visible || content || '').trim();
      return { answer, sources, internal, degraded: false };
    } catch (error) {
      logger.warn('bohai-cluster', 'Synthesizer 模型调用失败，回退到 Agent 直出', { error: String(error?.message || error) });
      return fallbackAnswer({ bus, reason: `合成器调用失败：${String(error?.message || error).slice(0, 80)}` });
    }
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
        sources
      });
      if (result.degraded) {
        context?.bus?.setSharedContext?.('synthesizer.degraded', true);
      }
      context?.bus?.setSharedContext?.('synthesizer.answer', result.answer);
      return {
        ok: true,
        output: { answer: result.answer, degraded: result.degraded, sources: result.sources },
        sources: result.sources || [],
        notes: result.degraded ? ['合成器已降级为 Agent 直出'] : [],
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
