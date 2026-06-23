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
        nodes.set(depKey, { task: { id: depKey, agent: 'unknown' }, key: depKey, missing: true });
        indegree.set(depKey, 0);
        dependents.set(depKey, []);
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

/**
 * 有界并发 runner：使用 N 个 worker 协程消费 taskQueue。
 * 关键修复：原实现的 chunked 串行循环会把同一个 layer 内的 chunk 一个一个 await，
 * 退化成了"伪并发"。这里用 worker pool 替换，确保任何时刻最多 maxConcurrency 个任务在跑，
 * 且一有空闲就立即取下一个，不被 chunk 边界阻塞。
 * 
 * 修复竞态条件：使用原子性的cursor访问机制，确保每个任务只被执行一次
 */
const runWithConcurrency = async (tasks, maxConcurrency, runner) => {
  if (!tasks.length) return [];
  const limit = Math.max(1, Math.min(maxConcurrency, tasks.length));
  const results = new Array(tasks.length);
  
  // 修复竞态条件：使用Promise链确保cursor访问的原子性
  let cursor = 0;
  let cursorLock = Promise.resolve(); // 简单的互斥锁
  
  const getNextIndex = async () => {
    return cursorLock = cursorLock.then(() => {
      const index = cursor;
      cursor += 1;
      return index;
    });
  };
  
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const index = await getNextIndex();
      if (index >= tasks.length) return;
      results[index] = await runner(tasks[index], index);
    }
  });
  await Promise.all(workers);
  return results;
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

  const run = async (planInput = [], { layerBudgetMs = totalTimeoutMs } = {}) => {
    const plan = normalizeAgentPlan(planInput);
    if (!plan.length) {
      return { ok: false, results: [], cancelled: false, reason: 'empty_plan' };
    }

    const { layers, nodes } = buildExecutionLayers(plan);
    const startedAt = Date.now();
    const results = new Map();
    const cancelledRef = { value: false };
    const perLayerBudgetMs = Number.isFinite(layerBudgetMs)
      ? Number(layerBudgetMs)
      : (Number.isFinite(totalTimeoutMs) ? Number(totalTimeoutMs) : 60000);

    const handleAbort = () => {
      cancelledRef.value = true;
    };
    if (signal) {
      if (signal.aborted) cancelledRef.value = true;
      else signal.addEventListener('abort', handleAbort);
    }

    let aborted = false;
    try {
      const remainingBudgetMs = () => {
        if (perLayerBudgetMs <= 0) return Number.POSITIVE_INFINITY;
        return Math.max(0, perLayerBudgetMs - (Date.now() - startedAt));
      };

      for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        if (cancelledRef.value) {
          aborted = true;
          break;
        }
        if (Date.now() - startedAt > perLayerBudgetMs) {
          aborted = true;
          break;
        }

        const layerKeys = layers[layerIndex];
        // O(1) Map lookup replaces the O(plan) Array.find per task
        const tasks = layerKeys.map((key) => nodes.get(key)?.task).filter(Boolean);

        // 剩余预算不足 2s 时直接 SKIPPED 整 layer，避免起跑后立刻撞 timeout
        const budgetLeft = remainingBudgetMs();
        if (budgetLeft < 2000 && tasks.length > 0) {
          tasks.forEach((task) => {
            const result = {
              taskId: task.id,
              agent: task.agent,
              ok: false,
              status: AGENT_AGENT_STATUS.SKIPPED,
              output: null,
              errorMessage: '集群总预算不足，跳过本层'
            };
            results.set(task.id, result);
            emit(createAgentEvent('agent-end', {
              agent: task.agent,
              role: task.agent,
              taskId: task.id,
              status: AGENT_CLUSTER_AGENT_STATUS.SKIPPED,
              ms: 0,
              errorMessage: result.errorMessage
            }));
          });
          continue;
        }

        await runWithConcurrency(tasks, maxConcurrency, async (task) => {
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

          // 每 worker 实时按剩余预算压缩自己的 timeoutMs，避免单 worker 拖到全局上限
          const agentDefaultTimeout = Number.isFinite(agent.timeoutMs) ? Number(agent.timeoutMs) : 25000;
          const effectiveTimeoutMs = Math.max(2000, Math.min(agentDefaultTimeout, remainingBudgetMs()));

          const result = await agent.execute({
            task: { ...task, deps: task.deps || [] },
            context: {
              bus,
              depsOutputs,
              parentTask: task,
              plan,
              onProgress: (event) => emit(event)
            },
            signal,
            overrideTimeoutMs: effectiveTimeoutMs
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
        });
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
