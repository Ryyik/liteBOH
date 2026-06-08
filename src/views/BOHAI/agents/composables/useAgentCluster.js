import { computed, reactive, ref } from 'vue';
import { logger } from '@/utils/logger.js';
import {
  AGENT_CLUSTER_MODE,
  readClusterSetting,
  resolveClusterMode,
  writeClusterSetting
} from '../core/agent-cluster-config.js';
import {
  AGENT_EVENT_TYPES,
  createEmptyAgentRunTrace
} from '../core/agent-events.js';
import { createClusterRunner } from '../core/ClusterRunner.js';
import { createChatEngineAgent } from '../workers/ChatEngineAgent.js';
import { createRetrieverAgent } from '../workers/RetrieverAgent.js';
import { createMemoryAgent } from '../workers/MemoryAgent.js';
import { createOpsAgent } from '../workers/OpsAgent.js';

const safeString = (value) => (value == null ? '' : String(value));

const initialSettings = () => {
  if (typeof window === 'undefined') return { mode: AGENT_CLUSTER_MODE.AUTO };
  return {
    mode: readClusterSetting('boh_ai_agent_cluster_mode_v1', AGENT_CLUSTER_MODE.AUTO)
  };
};

const persistMode = (mode) => writeClusterSetting('boh_ai_agent_cluster_mode_v1', mode);

export const useAgentCluster = (options = {}) => {
  const settings = reactive(initialSettings());
  const isRunning = ref(false);
  const trace = reactive(createEmptyAgentRunTrace());
  const lastError = ref(null);
  const agentStatuses = reactive({});
  const agentOutputs = reactive({});
  // 持有当前进行中的 AbortController，用于在新的 run 启动时主动 abort 上一次。
  let activeController = null;
  // 每次 run 启动时递增的 epoch 标识，用于让旧 run 的事件回调在到达时早退。
  let runEpoch = 0;

  const runnerOptions = {
    ...(options.runnerOptions || {}),
    defaultClusterMode: settings.mode,
    historySummaryFn: options.historySummaryFn
  };

  const workers = [];
  if (typeof options.invokeChatEngine === 'function') {
    workers.push(createChatEngineAgent({
      invoke: options.invokeChatEngine,
      defaultMode: options.defaultMode || 'auto',
      historyProvider: options.historyProvider
    }));
  }
  if (typeof options.invokeRetriever === 'function' || options.enableRetriever !== false) {
    workers.push(createRetrieverAgent({
      invokeRetrieval: options.invokeRetriever,
      ragKnowledge: options.ragKnowledge,
      siteGuide: options.siteGuide,
      forumPosts: options.forumPosts,
      webSearch: options.webSearch
    }));
  }
  if (options.enableMemory !== false) {
    workers.push(createMemoryAgent({
      invokeCloud: options.invokeCloud,
      invokeSharedMemory: options.invokeSharedMemory,
      invokeUserPrivate: options.invokeUserPrivate,
      requireUser: options.requireUserForMemory !== false
    }));
  }
  if (options.enableOps !== false) {
    workers.push(createOpsAgent({
      invokeSiteGuide: options.invokeSiteGuide,
      invokeDraft: options.invokeDraft
    }));
  }

  const runner = createClusterRunner({
    ...runnerOptions,
    workers
  });

  const setMode = (mode) => {
    const safeMode = [AGENT_CLUSTER_MODE.AUTO, AGENT_CLUSTER_MODE.SINGLE, AGENT_CLUSTER_MODE.MULTI].includes(mode)
      ? mode
      : AGENT_CLUSTER_MODE.AUTO;
    settings.mode = safeMode;
    persistMode(safeMode);
  };

  const resetTrace = () => {
    trace.plan = null;
    trace.agents = [];
    trace.synth = null;
    trace.criticRevisions = [];
    trace.degraded = null;
    trace.startedAt = 0;
    trace.endedAt = 0;
    trace.totalMs = 0;
    trace.tokenEstimate = 0;
    Object.keys(agentStatuses).forEach((key) => delete agentStatuses[key]);
    Object.keys(agentOutputs).forEach((key) => delete agentOutputs[key]);
    lastError.value = null;
  };

  const applyEvent = (event) => {
    if (!event || !event.type) return;
    switch (event.type) {
      case AGENT_EVENT_TYPES.PLAN: {
        const plan = event.payload?.plan || event.payload?.tasks || [];
        trace.plan = { ...(trace.plan || {}), ...(event.payload || {}), plan, startedAt: Date.now() };
        break;
      }
      case AGENT_EVENT_TYPES.AGENT_START: {
        const agent = event.payload?.agent;
        if (agent) {
          agentStatuses[agent] = { status: 'running', startedAt: event.createdAt || Date.now() };
        }
        break;
      }
      case AGENT_EVENT_TYPES.AGENT_END: {
        const agent = event.payload?.agent;
        if (agent) {
          agentStatuses[agent] = {
            status: event.payload?.status || 'ok',
            ms: event.payload?.ms || 0,
            endedAt: event.createdAt || Date.now(),
            errorMessage: event.payload?.errorMessage
          };
        }
        break;
      }
      case AGENT_EVENT_TYPES.AGENT_PROGRESS: {
        const agent = event.payload?.agent;
        if (agent) {
          agentStatuses[agent] = { ...(agentStatuses[agent] || {}), lastDelta: event.payload?.delta || '' };
        }
        break;
      }
      case AGENT_EVENT_TYPES.SYNTH_END: {
        trace.synth = { ...(trace.synth || {}), ...(event.payload || {}) };
        break;
      }
      case AGENT_EVENT_TYPES.FINAL: {
        trace.endedAt = Date.now();
        trace.totalMs = (trace.startedAt ? trace.endedAt - trace.startedAt : 0);
        trace.degraded = event.payload?.degraded ? event.payload : null;
        trace.sources = event.payload?.sources || [];
        trace.answer = event.payload?.answer || '';
        trace.strategy = event.payload?.strategy;
        trace.clusterMode = event.payload?.clusterMode;
        break;
      }
      case AGENT_EVENT_TYPES.DEGRADED: {
        trace.degraded = { reason: event.payload?.reason || 'cluster degraded' };
        break;
      }
      case AGENT_EVENT_TYPES.ERROR: {
        lastError.value = event.payload?.message || 'cluster error';
        break;
      }
      default:
        break;
    }
  };

  const run = async (params = {}) => {
    // 取消上一次仍在进行的 run，避免两个 run 的事件流并发改 reactive 状态。
    if (activeController) {
      try { activeController.abort(); } catch (_err) { /* noop */ }
      activeController = null;
    }
    const myEpoch = ++runEpoch;

    resetTrace();
    isRunning.value = true;

    const externalSignal = params.signal;
    const controller = new AbortController();
    activeController = controller;
    // 若调用方传入了 signal，则在它 abort 时同步 abort 内部 controller。
    const forwardAbort = () => {
      try { controller.abort(); } catch (_err) { /* noop */ }
    };
    if (externalSignal) {
      if (externalSignal.aborted) forwardAbort();
      else externalSignal.addEventListener('abort', forwardAbort, { once: true });
    }
    const signal = controller.signal;

    try {
      const result = await runner.run({
        query: params.query,
        history: params.history || [],
        historySummary: params.historySummary || '',
        clusterMode: params.clusterMode || settings.mode,
        signal,
        onEvent: (event) => {
          // 仅当本次 run 仍是最新一次时才把事件应用到 UI。
          if (myEpoch !== runEpoch) return;
          applyEvent(event);
          if (event.type === AGENT_EVENT_TYPES.AGENT_END && event.payload?.agent) {
            const agent = event.payload.agent;
            if (!agentOutputs[agent]) {
              agentOutputs[agent] = { status: event.payload.status, ms: event.payload.ms };
            }
          }
        }
      });
      if (myEpoch !== runEpoch) return result;
      return result;
    } catch (error) {
      if (myEpoch !== runEpoch) return null;
      lastError.value = error?.message || String(error);
      logger.error('bohai-cluster', 'useAgentCluster.run 失败', error);
      throw error;
    } finally {
      if (myEpoch === runEpoch) {
        isRunning.value = false;
        if (activeController === controller) activeController = null;
      }
      if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort);
    }
  };

  const clusterModeLabel = computed(() => {
    if (settings.mode === AGENT_CLUSTER_MODE.AUTO) return '自动';
    if (settings.mode === AGENT_CLUSTER_MODE.MULTI) return '多 Agent';
    return '单 Agent';
  });

  return {
    settings,
    setMode,
    run,
    isRunning,
    trace,
    agentStatuses,
    agentOutputs,
    lastError,
    clusterModeLabel,
    resolveEffectiveMode: (text) => resolveClusterMode(settings.mode, Boolean(text && /fanout/i.test(safeString(text)))),
    resetTrace
  };
};
