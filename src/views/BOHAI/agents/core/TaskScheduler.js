import { AGENT_CLUSTER_AGENT_STATUS } from './agent-cluster-config.js';
import { AGENT_AGENT_STATUS, createAgentEvent, normalizeAgentPlan } from './agent-events.js';

const toTaskKey = (task, index) => String(task?.id || `task-${index}`);

const buildExecutionLayers = (plan) => {
  const nodes = new Map();
  const indegree = new Map();
  const dependents = new Map();
  plan.forEach((task, index) => {
    const key = toTaskKey(task, index);
    nodes.set(key, { task, index, key });
    indegree.set(key, 0);
    dependents.set(key, []);
  });

  plan.forEach((task, index) => {
    const key = toTaskKey(task, index);
    const deps = Array.isArray(task.deps) ? task.deps : [];
    deps.forEach((dep) => {
      const depKey = String(dep);
      if (!nodes.has(depKey)) {
        if (!nodes.has(depKey)) {
          nodes.set(depKey, { task: { id: depKey, agent: 'unknown' }, key: depKey, missing: true });
          indegree.set(depKey, 0);
          dependents.set(depKey, []);
        }
      }
      indegree.set(key, (indegree.get(key) || 0) + 1);
      const list = dependents.get(depKey) || [];
      list.push(key);
      dependents.set(depKey, list);
    });
  });

  const layers = [];
  let frontier = Array.from(nodes.entries())
    .filter(([, node]) => !node.missing && (indegree.get(node.key) || 0) === 0)
    .map(([key]) => key);

  const seen = new Set();
  while (frontier.length) {
    layers.push(frontier);
    frontier.forEach((key) => seen.add(key));
    const next = new Set();
    frontier.forEach((key) => {
      const list = dependents.get(key) || [];
      list.forEach((depKey) => {
        indegree.set(depKey, (indegree.get(depKey) || 0) - 1);
        if ((indegree.get(depKey) || 0) === 0 && !seen.has(depKey)) {
          next.add(depKey);
        }
      });
    });
    frontier = Array.from(next);
  }

  return { layers, nodes, missing: nodes.size !== plan.length };
};

export const createTaskScheduler = ({
  registry,
  bus,
  maxConcurrency = 4,
  totalTimeoutMs = 60000,
  onEvent,
  signal
} = {}) => {
  if (!registry || typeof registry.get !== 'function') {
    throw new Error('TaskScheduler: registry 必须提供 get() 方法');
  }
  if (!bus) {
    throw new Error('TaskScheduler: 必须提供共享 bus');
  }

  const emit = (event) => {
    if (typeof onEvent === 'function') {
      try { onEvent(event); } catch (_error) { /* ignore listener errors */ }
    }
  };

  const run = async (planInput = []) => {
    const plan = normalizeAgentPlan(planInput);
    if (!plan.length) {
      return { ok: false, results: [], cancelled: false, reason: 'empty_plan' };
    }

    const { layers } = buildExecutionLayers(plan);
    const startedAt = Date.now();
    const results = new Map();
    const cancelledRef = { value: false };

    const handleAbort = () => {
      cancelledRef.value = true;
    };
    if (signal) {
      if (signal.aborted) cancelledRef.value = true;
      else signal.addEventListener('abort', handleAbort);
    }

    let aborted = false;
    try {
      const totalBudget = Number.isFinite(totalTimeoutMs) ? Number(totalTimeoutMs) : 60000;

      for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        if (cancelledRef.value) {
          aborted = true;
          break;
        }
        if (Date.now() - startedAt > totalBudget) {
          aborted = true;
          break;
        }

        const layerKeys = layers[layerIndex];
        const tasks = layerKeys.map((key) => {
          const nodeEntry = plan.find((task) => String(task.id) === String(key));
          return nodeEntry;
        }).filter(Boolean);

        const chunks = [];
        for (let i = 0; i < tasks.length; i += maxConcurrency) {
          chunks.push(tasks.slice(i, i + maxConcurrency));
        }

        for (const chunk of chunks) {
          if (cancelledRef.value) break;
          const taskResults = await Promise.all(chunk.map(async (task) => {
            const agent = registry.get(task.agent);
            if (!agent) {
              const result = {
                taskId: task.id,
                agent: task.agent,
                ok: false,
                status: AGENT_AGENT_STATUS.SKIPPED,
                output: null,
                errorMessage: `Agent 未注册: ${task.agent}`
              };
              results.set(task.id, result);
              return result;
            }
            if (agent.enabled === false) {
              const result = {
                taskId: task.id,
                agent: task.agent,
                ok: false,
                status: AGENT_AGENT_STATUS.SKIPPED,
                output: null,
                errorMessage: 'Agent 已禁用'
              };
              results.set(task.id, result);
              emit(createAgentEvent('agent-end', {
                agent: agent.name,
                role: agent.role,
                taskId: task.id,
                status: AGENT_CLUSTER_AGENT_STATUS.SKIPPED,
                ms: 0
              }));
              return result;
            }
            const depsOutputs = (task.deps || []).map((depId) => {
              const depResult = results.get(String(depId));
              if (!depResult) return null;
              return {
                taskId: String(depId),
                agent: depResult.agent,
                output: depResult.output,
                status: depResult.status,
                evidence: depResult.evidence,
                draft: depResult.draft,
                sources: depResult.sources
              };
            }).filter(Boolean);

            const result = await agent.execute({
              task: { ...task, deps: task.deps || [] },
              context: {
                bus,
                depsOutputs,
                parentTask: task,
                plan,
                onProgress: (event) => emit(event)
              },
              signal
            });

            const normalized = {
              taskId: task.id,
              agent: agent.name,
              role: agent.role,
              ok: result.ok,
              status: result.status,
              output: result.output ?? null,
              evidence: result.evidence || [],
              sources: result.sources || [],
              draft: result.draft,
              draftKey: result.draftKey,
              notes: result.notes || [],
              tokens: result.tokens || 0,
              ms: result.ms || 0,
              error: result.error
            };
            results.set(task.id, normalized);
            return normalized;
          }));
          taskResults.forEach((result) => {
            if (result && result.status === AGENT_AGENT_STATUS.SKIPPED) {
              // already emitted
            }
          });
        }
      }
    } finally {
      if (signal) signal.removeEventListener('abort', handleAbort);
    }

    return {
      ok: !aborted,
      cancelled: cancelledRef.value,
      results: Array.from(results.values()),
      durationMs: Date.now() - startedAt
    };
  };

  return { run, buildExecutionLayers };
};
