import { AGENT_CLUSTER_AGENT_STATUS, AGENT_CLUSTER_MODE, AGENT_CLUSTER_PLAN_STRATEGY, estimateClusterBudget, resolveClusterMode } from './agent-cluster-config.js';
import {
  AGENT_AGENT_ROLES,
  buildAgentRunId,
  createAgentEvent
} from './agent-events.js';
import { createAgentRegistry } from './AgentRegistry.js';
import { createMessageBus } from './MessageBus.js';
import { createTaskScheduler } from './TaskScheduler.js';
import { createOrchestrator } from './Orchestrator.js';
import { createSynthesizer } from './Synthesizer.js';
import { createAgentRuntime } from './AgentRuntime.js';

const registerDefaultAgents = (registry, deps = {}) => {
  const workers = Array.isArray(deps.workers) ? deps.workers : [];
  workers.forEach((worker) => {
    if (!worker || !worker.name) return;
    registry.register(createAgentRuntime(worker));
  });
  return registry;
};

const mergePlanWithFallback = (planResult, availableAgents) => {
  if (!planResult || !Array.isArray(planResult.tasks) || planResult.tasks.length === 0) {
    return { strategy: AGENT_CLUSTER_PLAN_STRATEGY.SINGLE, tasks: [] };
  }
  const tasks = planResult.tasks.filter((task) => availableAgents.some((agent) => agent.name === task.agent));
  if (!tasks.length) {
    return { strategy: AGENT_CLUSTER_PLAN_STRATEGY.SINGLE, tasks: [] };
  }
  return { strategy: planResult.strategy, tasks, reason: planResult.reason };
};

export const createClusterRunner = ({
  workers = [],
  defaultClusterMode = AGENT_CLUSTER_MODE.AUTO,
  maxConcurrency = 4,
  totalTimeoutMs = 60000,
  orchestratorOptions = {},
  synthesizerOptions = {},
  historySummaryFn
} = {}) => {
  const registry = createAgentRegistry();
  registerDefaultAgents(registry, { workers });

  const orchestrator = createOrchestrator({
    registry,
    ...orchestratorOptions
  });
  const synthesizer = createSynthesizer({
    ...synthesizerOptions
  });

  const run = async ({
    query,
    history = [],
    historySummary = '',
    clusterMode = defaultClusterMode,
    signal,
    onEvent,
    onStream
  } = {}) => {
    const runId = buildAgentRunId();
    const bus = createMessageBus({ runId });
    const events = [];
    const safeQuery = String(query || '').trim();
    bus.setQuery(safeQuery, safeQuery);
    if (historySummary) {
      bus.setSharedContext('historySummary', historySummary);
    }

    const emit = (event) => {
      events.push(event);
      if (typeof onEvent === 'function') onEvent(event);
    };

    emit(createAgentEvent('plan', { runId, query: safeQuery, clusterMode }));

    const mode = resolveClusterMode(clusterMode, orchestrator.resolveFanout(safeQuery));
    emit(createAgentEvent('agent-start', { agent: AGENT_AGENT_ROLES.ORCHESTRATOR, role: AGENT_AGENT_ROLES.ORCHESTRATOR, taskId: 'orchestrator' }));

    const planResult = await orchestrator.plan({
      query: safeQuery,
      clusterMode: mode,
      historySummary: historySummary || (historySummaryFn ? historySummaryFn({ bus, history }) : ''),
      context: { bus, history, clusterMode: mode },
      signal
    });
    bus.setPlan(planResult.tasks);
    emit(createAgentEvent('agent-end', {
      agent: AGENT_AGENT_ROLES.ORCHESTRATOR,
      role: AGENT_AGENT_ROLES.ORCHESTRATOR,
      taskId: 'orchestrator',
      status: AGENT_CLUSTER_AGENT_STATUS.OK,
      ms: 0,
      notes: [planResult.reason].filter(Boolean)
    }));

    const budget = estimateClusterBudget({
      agentCount: planResult.tasks.length,
      totalInputChars: safeQuery.length + (historySummary?.length || 0)
    });

    const mergedPlan = mergePlanWithFallback(planResult, registry.list());
    const finalPlan = mergedPlan.tasks.length ? mergedPlan.tasks : (registry.has('chat-engine') ? [{ id: 'task-1', agent: 'chat-engine', deps: [], description: '通用对话', input: { query: safeQuery } }] : []);
    const finalStrategy = finalPlan.length > 1 ? AGENT_CLUSTER_PLAN_STRATEGY.FANOUT : (planResult.strategy || AGENT_CLUSTER_PLAN_STRATEGY.SINGLE);

    let schedulerResult = { ok: true, results: [], durationMs: 0, cancelled: false };
    if (finalPlan.length) {
      const scheduler = createTaskScheduler({
        registry,
        bus,
        maxConcurrency,
        totalTimeoutMs,
        onEvent: emit,
        signal
      });
      schedulerResult = await scheduler.run(finalPlan);
    }

    const sources = bus.getSources();
    const synthResult = await synthesizer.synthesize({
      query: safeQuery,
      bus,
      historySummary,
      sources
    });

    if (synthResult.degraded) {
      emit(createAgentEvent('degraded', { reason: synthResult.answer?.slice?.(0, 120) || '合成器已降级' }));
    }
    emit(createAgentEvent('synth-end', { answerChars: synthResult.answer.length, degraded: synthResult.degraded }));

    if (typeof onStream === 'function') {
      onStream(synthResult.answer);
    }

    const finalEvent = createAgentEvent('final', {
      answer: synthResult.answer,
      sources,
      degraded: synthResult.degraded || planResult.degraded,
      strategy: finalStrategy,
      clusterMode: mode
    });
    emit(finalEvent);

    return {
      runId,
      answer: synthResult.answer,
      sources,
      degraded: synthResult.degraded || planResult.degraded,
      cancelled: schedulerResult.cancelled,
      clusterMode: mode,
      strategy: finalStrategy,
      budget,
      trace: {
        plan: finalPlan,
        events,
        scheduler: { ok: schedulerResult.ok, durationMs: schedulerResult.durationMs, results: schedulerResult.results }
      }
    };
  };

  return {
    registry,
    run,
    orchestrator,
    synthesizer
  };
};
