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
    resetTrace();
    isRunning.value = true;
    const signal = params.signal || (typeof AbortController !== 'undefined' ? new AbortController().signal : undefined);
    try {
      const result = await runner.run({
        query: params.query,
        history: params.history || [],
        historySummary: params.historySummary || '',
        clusterMode: params.clusterMode || settings.mode,
        signal,
        onEvent: (event) => {
          applyEvent(event);
          if (event.type === AGENT_EVENT_TYPES.AGENT_END && event.payload?.agent) {
            const agent = event.payload.agent;
            if (!agentOutputs[agent]) {
              agentOutputs[agent] = { status: event.payload.status, ms: event.payload.ms };
            }
          }
        }
      });
      return result;
    } catch (error) {
      lastError.value = error?.message || String(error);
      logger.error('bohai-cluster', 'useAgentCluster.run 失败', error);
      throw error;
    } finally {
      isRunning.value = false;
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
