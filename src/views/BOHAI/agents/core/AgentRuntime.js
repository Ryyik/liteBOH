import { AGENT_CLUSTER_AGENT_STATUS } from './agent-cluster-config.js';
import { AGENT_AGENT_STATUS, createAgentEvent } from './agent-events.js';
import { isAbortError } from '../../utils/chatErrorMessages.js';

const withTimeout = (promise, timeoutMs, errorMessage) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(Object.assign(new Error(errorMessage || 'Agent 执行超时'), { name: 'AgentTimeoutError' }));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId) clearTimeout(timerId);
  });
};

const normalizeOutput = (rawOutput) => {
  if (rawOutput == null) return { ok: false, output: null, status: AGENT_AGENT_STATUS.FAILED, errorMessage: 'Agent 未产出结果' };
  if (typeof rawOutput === 'object' && 'ok' in rawOutput) {
    return {
      ok: Boolean(rawOutput.ok),
      output: rawOutput.output ?? null,
      status: rawOutput.status || (rawOutput.ok ? AGENT_AGENT_STATUS.OK : AGENT_AGENT_STATUS.FAILED),
      error: rawOutput.error || null,
      evidence: Array.isArray(rawOutput.evidence) ? rawOutput.evidence : [],
      sources: Array.isArray(rawOutput.sources) ? rawOutput.sources : [],
      draftKey: rawOutput.draftKey || null,
      draft: rawOutput.draft ?? null,
      tokens: Number.isFinite(rawOutput.tokens) ? Number(rawOutput.tokens) : 0,
      notes: Array.isArray(rawOutput.notes) ? rawOutput.notes : []
    };
  }
  return {
    ok: true,
    output: rawOutput,
    status: AGENT_AGENT_STATUS.OK,
    error: null,
    evidence: [],
    sources: [],
    draftKey: null,
    draft: null,
    tokens: 0,
    notes: []
  };
};

const defaultMetrics = () => ({
  runs: 0,
  ok: 0,
  failed: 0,
  skipped: 0,
  totalMs: 0
});

export const createAgentRuntime = (definition = {}) => {
  if (!definition || typeof definition.run !== 'function') {
    throw new Error('createAgentRuntime: definition.run 必须为函数');
  }
  if (!definition.name) {
    throw new Error('createAgentRuntime: definition.name 必填');
  }

  const name = String(definition.name).trim();
  const role = String(definition.role || name);
  const metrics = defaultMetrics();
  const tag = String(definition.tag || role).trim();
  const label = String(definition.label || tag).trim();

  const execute = async ({ task, context, signal, overrideTimeoutMs } = {}) => {
    const startedAt = Date.now();
    const defaultTimeout = Number.isFinite(definition.timeoutMs) ? Number(definition.timeoutMs) : 25000;
    const timeoutMs = Number.isFinite(overrideTimeoutMs) && overrideTimeoutMs > 0
      ? Math.min(defaultTimeout, Number(overrideTimeoutMs))
      : defaultTimeout;
    metrics.runs += 1;

    const onProgress = typeof context?.onProgress === 'function' ? context.onProgress : null;
    const emitProgress = (delta) => {
      if (!onProgress) return;
      onProgress(createAgentEvent('agent-progress', { agent: name, delta: String(delta || '') }));
    };

    const safeTask = task && typeof task === 'object'
      ? task
      : { id: `task-${Date.now()}`, input: { query: String(task || '') } };

    const safeContext = context && typeof context === 'object' ? context : {};
    const bus = safeContext.bus;

    const startedEvent = createAgentEvent('agent-start', {
      agent: name,
      role,
      taskId: safeTask.id,
      tag,
      label
    });
    if (onProgress) onProgress(startedEvent);

    const runPromise = (async () => {
      const result = await definition.run({
        task: safeTask,
        context: safeContext,
        signal,
        emit: emitProgress
      });
      return normalizeOutput(result);
    })();

    let resolved;
    try {
      resolved = await withTimeout(runPromise, timeoutMs, `Agent ${name} 执行超时`);
    } catch (error) {
      if (isAbortError(error)) {
        const elapsed = Date.now() - startedAt;
        metrics.totalMs += elapsed;
        const endEvent = createAgentEvent('agent-end', {
          agent: name,
          role,
          taskId: safeTask.id,
          status: AGENT_CLUSTER_AGENT_STATUS.CANCELLED,
          ms: elapsed,
          errorMessage: '用户取消'
        });
        if (onProgress) onProgress(endEvent);
        if (onProgress) onProgress(createAgentEvent('error', {
          agent: name,
          role,
          taskId: safeTask.id,
          stage: 'agent',
          message: '用户取消',
          fatal: false
        }));
        if (bus) bus.addError(name, error);
        return { ok: false, status: AGENT_AGENT_STATUS.CANCELLED, output: null, error, ms: elapsed };
      }
      const elapsed = Date.now() - startedAt;
      metrics.totalMs += elapsed;
      metrics.failed += 1;
      const endEvent = createAgentEvent('agent-end', {
        agent: name,
        role,
        taskId: safeTask.id,
        status: AGENT_CLUSTER_AGENT_STATUS.FAILED,
        ms: elapsed,
        errorMessage: String(error?.message || error)
      });
      if (onProgress) onProgress(endEvent);
      if (onProgress) onProgress(createAgentEvent('error', {
        agent: name,
        role,
        taskId: safeTask.id,
        stage: 'agent',
        message: String(error?.message || error),
        fatal: true
      }));
      if (bus) bus.addError(name, error);
      return { ok: false, status: AGENT_AGENT_STATUS.FAILED, output: null, error, ms: elapsed };
    }

    const elapsed = Date.now() - startedAt;
    metrics.totalMs += elapsed;
    if (resolved.ok) {
      metrics.ok += 1;
    } else {
      metrics.failed += 1;
    }

    if (bus) {
      if (resolved.error) bus.addError(name, resolved.error);
      if (resolved.evidence && resolved.evidence.length) {
        bus.addEvidence(resolved.evidence.map((item) => ({ ...item, agent: name })));
      }
      if (resolved.sources && resolved.sources.length) {
        resolved.sources.forEach((source) => bus.addSource({ id: source.id || name, ...source }));
      }
      if (resolved.draftKey && resolved.draft != null) {
        bus.setDraft(resolved.draftKey, resolved.draft);
      }
      bus.writeAgentOutput(name, {
        output: resolved.output,
        status: resolved.status,
        evidence: resolved.evidence,
        sources: resolved.sources,
        draftKey: resolved.draftKey,
        draft: resolved.draft,
        notes: resolved.notes,
        ms: elapsed,
        tokens: resolved.tokens
      });
    }

    const endEvent = createAgentEvent('agent-end', {
      agent: name,
      role,
      taskId: safeTask.id,
      status: resolved.ok ? AGENT_CLUSTER_AGENT_STATUS.OK : AGENT_CLUSTER_AGENT_STATUS.FAILED,
      ms: elapsed,
      tokens: resolved.tokens
    });
    if (onProgress) onProgress(endEvent);

    return { ...resolved, ms: elapsed };
  };

  return {
    name,
    role,
    tag,
    label,
    category: definition.category || 'knowledge',
    timeoutMs: Number.isFinite(definition.timeoutMs) ? Number(definition.timeoutMs) : 25000,
    enabled: definition.enabled !== false,
    execute,
    run: execute,
    metrics: () => ({ ...metrics }),
    definition
  };
};
