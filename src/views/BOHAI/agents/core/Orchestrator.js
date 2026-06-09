import {
  callBohAIModel,
  extractBohAIJsonObject,
  ORCHESTRATOR_TIMEOUT_MS,
  ORCHESTRATOR_MODEL_FALLBACK
} from '@/utils/bohai-model-client.js';
import { logger } from '@/utils/logger.js';
import { SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID, resolveSiliconFlowFreeModelId } from '@/utils/siliconflow-free-models.js';
import { AGENT_ORCHESTRATOR_DEFAULT_MODEL_ID } from '../../composables/chat-engine-config.js';
import {
  AGENT_AGENT_ROLES,
  createAgentEvent,
  createEmptyAgentRunTrace
} from './agent-events.js';
import {
  buildOrchestratorUserPrompt,
  parseOrchestratorPlan,
  buildFallbackPlan
} from '../prompts/orchestrator-prompt.js';
import {
  AGENT_CLUSTER_PLAN_STRATEGY,
  isFanoutTrigger
} from './agent-cluster-config.js';

const DEFAULT_ORCHESTRATOR_MODEL = AGENT_ORCHESTRATOR_DEFAULT_MODEL_ID;

const buildSnapshot = (registry) => {
  if (!registry || typeof registry.list !== 'function') return [];
  return registry.list().map((agent) => ({
    name: agent.name,
    role: agent.role,
    tag: agent.tag,
    label: agent.label,
    category: agent.category
  }));
};

const safeListAvailable = (registry) => {
  if (!registry || typeof registry.list !== 'function') return [];
  return registry.list().map((agent) => ({
    name: agent.name,
    role: agent.role,
    tag: agent.tag,
    label: agent.label
  }));
};

export const createOrchestrator = ({
  registry,
  defaultModel = DEFAULT_ORCHESTRATOR_MODEL,
  historySummaryFn,
  modelClient
} = {}) => {
  if (!registry) {
    throw new Error('Orchestrator: registry 必填');
  }
  const client = modelClient || { call: callBohAIModel, extractJson: extractBohAIJsonObject };
  const modelId = resolveSiliconFlowFreeModelId(defaultModel, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID);

  const plan = async ({
    query,
    clusterMode = 'auto',
    historySummary,
    context = {},
    signal
  } = {}) => {
    const safeQuery = String(query || '').trim();
    const available = safeListAvailable(registry);
    const fanoutHint = isFanoutTrigger(safeQuery);
    const userPrompt = buildOrchestratorUserPrompt({
      query: safeQuery,
      historySummary: historySummary || (historySummaryFn ? historySummaryFn(context) : ''),
      availableAgents: available,
      clusterMode,
      isFanoutHint: fanoutHint
    });

    let parsed = null;
    let rawError = null;
    const callOrchestrator = (model, maxTokens, customSignal) => client.call({
      model,
      messages: [
        { role: 'system', content: '你是 BOH AI 集群的编排者。' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.12,
      maxTokens,
      timeoutMs: ORCHESTRATOR_TIMEOUT_MS,
      signal: customSignal || signal
    });

    // 主+兜底并发跑：主模型按时返回就用主，兜底仅作"冷启动"备胎。
    // 这样最坏情况 ≈ 主模型 timeout（一个 RTT），主模型健康时无回归。
    // B-14 fix: abort fallback controller when main succeeds to save tokens.
    try {
      const fallbackController = new AbortController();
      const mainPromise = callOrchestrator(modelId, 400);
      const fallbackPromise = (async () => {
        try {
          return { ok: true, value: await callOrchestrator(ORCHESTRATOR_MODEL_FALLBACK, 320, fallbackController.signal) };
        } catch (error) {
          if (error?.name === 'AbortError') return { ok: false, aborted: true };
          return { ok: false, error };
        }
      })();

      // 给主模型加一个最大容忍时间，超出则取消主并采纳兜底
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), ORCHESTRATOR_TIMEOUT_MS));

      const result = await Promise.race([
        mainPromise.then((value) => ({ kind: 'main', value })),
        timeoutPromise
      ]);

      if (result.kind === 'main') {
        // B-14: Main succeeded — abort fallback immediately to save token quota
        fallbackController.abort();
        const content = result.value?.content;
        const trial = parseOrchestratorPlan(content);
        if (trial) {
          parsed = trial;
        } else {
          // 主模型返回了但解析不出 JSON：直接使用兜底
          const fallbackResult = await fallbackPromise;
          if (fallbackResult?.ok) {
            parsed = parseOrchestratorPlan(fallbackResult.value?.content);
          }
        }
      } else {
        // 超时：取消主（如果还活着），采纳兜底结果
        const fallbackResult = await fallbackPromise;
        if (fallbackResult?.ok) {
          parsed = parseOrchestratorPlan(fallbackResult.value?.content);
          logger.warn('bohai-cluster', 'Orchestrator 主模型超时，已切换兜底小模型');
        } else {
          rawError = fallbackResult?.error || new Error('Orchestrator 主模型超时且兜底失败');
          logger.warn('bohai-cluster', 'Orchestrator 模型调用失败，使用兜底计划', { error: String(rawError?.message || rawError) });
        }
      }
    } catch (error) {
      rawError = error;
      // 进入这里的可能性：主模型立刻抛错（如 4xx），降级走兜底
      try {
        const { content } = await callOrchestrator(ORCHESTRATOR_MODEL_FALLBACK, 320);
        parsed = parseOrchestratorPlan(content);
      } catch (fallbackError) {
        rawError = fallbackError;
        logger.warn('bohai-cluster', 'Orchestrator 模型调用失败，使用兜底计划', { error: String(fallbackError?.message || fallbackError) });
      }
    }

    if (!parsed || !parsed.tasks || parsed.tasks.length === 0) {
      const fallback = buildFallbackPlan({
        query: safeQuery,
        availableAgents: available,
        preferFanout: clusterMode === 'multi' || (clusterMode === 'auto' && fanoutHint)
      });
      return {
        strategy: fallback.strategy,
        reason: fallback.reason + (rawError ? `（LLM 调用失败：${String(rawError?.message || rawError).slice(0, 60)}）` : ''),
        tasks: fallback.tasks,
        degraded: Boolean(rawError),
        usedFallback: true,
        fanoutHint
      };
    }

    const filteredTasks = parsed.tasks.filter((task) => registry.has(task.agent));
    if (!filteredTasks.length) {
      const fallback = buildFallbackPlan({
        query: safeQuery,
        availableAgents: available,
        preferFanout: clusterMode === 'multi' || (clusterMode === 'auto' && fanoutHint)
      });
      return {
        strategy: fallback.strategy,
        reason: '编排结果无可用 Agent，回退兜底',
        tasks: fallback.tasks,
        degraded: true,
        usedFallback: true,
        fanoutHint
      };
    }

    return {
      strategy: parsed.strategy,
      reason: parsed.reason,
      tasks: filteredTasks,
      degraded: false,
      usedFallback: false,
      fanoutHint
    };
  };

  return {
    plan,
    snapshot: () => buildSnapshot(registry),
    resolveFanout: (text) => isFanoutTrigger(text)
  };
};

export const createOrchestratorAgent = (registry, options = {}) => {
  const orchestrator = createOrchestrator({ registry, ...options });
  return {
    name: AGENT_AGENT_ROLES.ORCHESTRATOR,
    role: AGENT_AGENT_ROLES.ORCHESTRATOR,
    tag: 'orchestrator',
    label: '编排',
    category: 'control',
    timeoutMs: 8000,
    async run({ context }) {
      const query = context?.bus?.getQuery?.() || '';
      const clusterMode = context?.clusterMode || 'auto';
      const historySummary = context?.historySummary || '';
      const result = await orchestrator.plan({ query, clusterMode, historySummary, context });
      context?.bus?.setPlan(result.tasks);
      return {
        ok: true,
        output: result,
        notes: [
          result.reason || '',
          result.usedFallback ? '使用兜底计划' : '',
          result.degraded ? '编排降级' : ''
        ].filter(Boolean),
        tokens: 600
      };
    }
  };
};

export const createPlanEvent = (plan) => createAgentEvent('plan', { plan });
export const createEmptyTrace = () => createEmptyAgentRunTrace();
export { AGENT_CLUSTER_PLAN_STRATEGY };
