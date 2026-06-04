import { reactive } from 'vue';
import { callBohAIModel } from '@/utils/bohai-model-client.js';
import { logger } from '@/utils/logger.js';
import { SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID, resolveSiliconFlowFreeModelId } from '@/utils/siliconflow-free-models.js';
import { useAgentCluster } from '../agents/composables/useAgentCluster.js';
import { AGENT_EVENT_TYPES } from '../agents/core/agent-events.js';
import { AGENT_CLUSTER_MODE } from '../agents/core/agent-cluster-config.js';
import { buildHistoryMessagesWithinBudget } from './bohai-engine-helpers.js';
import { MAX_HISTORY_CONTEXT_CHARS, MAX_HISTORY_MESSAGE_CHARS } from './chat-engine-config.js';

const summarizeHistoryInline = (history = []) => {
  if (!Array.isArray(history) || history.length === 0) return '';
  const recent = history.slice(-4).map((item) => {
    const role = item?.role === 'assistant' ? 'A' : 'U';
    const content = String(item?.content || '').slice(0, 80);
    return `${role}: ${content}`;
  });
  return recent.join(' | ').slice(0, 600);
};

const DEFAULT_CHAT_ENGINE_MODEL = resolveSiliconFlowFreeModelId('Qwen/Qwen3-8B', SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID);
const CHAT_ENGINE_SYSTEM_PROMPT = `你是 BOH AI 集群中的"对话"Agent，专责"通用对话与综合回答"。
要求：
1. 基于已知上下文与证据回答，禁止编造事实。
2. 回答自然、简洁、可执行，使用用户提问语言。
3. 不输出 JSON 包装或代码块（除非用户明确要求）。
4. 严格遵循 \`synth-final\` 标记结尾，便于前端解析。`;

const buildChatEngineMessages = ({ query, history }) => {
  const safeHistory = Array.isArray(history) ? history : [];
  const recent = buildHistoryMessagesWithinBudget(safeHistory, {
    maxChars: MAX_HISTORY_CONTEXT_CHARS,
    maxMessages: 6,
    maxPerMessage: MAX_HISTORY_MESSAGE_CHARS
  });
  return [
    { role: 'system', content: CHAT_ENGINE_SYSTEM_PROMPT },
    ...recent,
    { role: 'user', content: String(query || '').trim() }
  ];
};

let cachedCluster = null;

const getCluster = () => {
  if (cachedCluster) return cachedCluster;
  cachedCluster = useAgentCluster({
    invokeChatEngine: async ({ query, history, onStream }) => {
      const messages = buildChatEngineMessages({ query, history });
      try {
        const { content, payload } = await callBohAIModel({
          model: DEFAULT_CHAT_ENGINE_MODEL,
          messages,
          temperature: 0.22,
          maxTokens: 1400
        });
        if (typeof onStream === 'function' && content) {
          onStream(content);
        }
        return {
          ok: true,
          answer: String(content || payload?.choices?.[0]?.message?.content || '').trim(),
          mode: 'agent-cluster',
          sources: [],
          notes: ['对话 Agent 走简化 LLM 调用'],
          tokens: Math.max(400, Math.round((content || '').length / 1.5))
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { ok: false, status: 'cancelled', answer: '', error: { message: '已取消' } };
        }
        logger.warn('bohai-cluster', 'chat-engine 简化调用失败', error);
        return {
          ok: false,
          status: 'failed',
          answer: '',
          error: { message: error?.message || String(error) },
          notes: [`对话 Agent 失败：${error?.message || String(error)}`]
        };
      }
    },
    enableRetriever: true,
    enableMemory: true,
    enableOps: true
  });
  return cachedCluster;
};

const createInitialState = () => ({
  isRunning: false,
  agents: {},
  plan: null,
  answer: '',
  sources: [],
  degraded: false,
  lastError: null,
  runStartedAt: 0,
  runEndedAt: 0,
  totalMs: 0,
  strategy: null,
  clusterMode: null,
  note: ''
});

const applyEventToState = (state, event) => {
  if (!event || !event.type) return;
  switch (event.type) {
    case AGENT_EVENT_TYPES.PLAN:
      state.isRunning = true;
      state.degraded = false;
      state.lastError = null;
      state.plan = event.payload?.plan || null;
      state.runStartedAt = event.createdAt || Date.now();
      break;
    case AGENT_EVENT_TYPES.AGENT_START:
      state.isRunning = true;
      state.agents = {
        ...state.agents,
        [event.payload?.agent || 'unknown']: {
          status: 'running',
          startedAt: event.createdAt || Date.now(),
          role: event.payload?.role,
          label: event.payload?.label || event.payload?.agent
        }
      };
      break;
    case AGENT_EVENT_TYPES.AGENT_END: {
      const agent = event.payload?.agent;
      const previous = state.agents[agent] || {};
      state.agents = {
        ...state.agents,
        [agent]: {
          ...previous,
          status: event.payload?.status || 'ok',
          ms: event.payload?.ms || 0,
          endedAt: event.createdAt || Date.now(),
          errorMessage: event.payload?.errorMessage
        }
      };
      break;
    }
    case AGENT_EVENT_TYPES.AGENT_PROGRESS: {
      const agent = event.payload?.agent;
      if (agent) {
        const previous = state.agents[agent] || {};
        state.agents = {
          ...state.agents,
          [agent]: { ...previous, lastDelta: event.payload?.delta || '' }
        };
      }
      break;
    }
    case AGENT_EVENT_TYPES.SYNTH_END:
      state.note = `合成 ${event.payload?.answerChars || 0} 字符（degraded=${Boolean(event.payload?.degraded)}）`;
      break;
    case AGENT_EVENT_TYPES.DEGRADED:
      state.degraded = true;
      state.lastError = event.payload?.reason || state.lastError;
      break;
    case AGENT_EVENT_TYPES.FINAL:
      state.answer = event.payload?.answer || '';
      state.sources = event.payload?.sources || [];
      state.degraded = Boolean(event.payload?.degraded) || state.degraded;
      state.isRunning = false;
      state.runEndedAt = Date.now();
      state.totalMs = state.runStartedAt ? state.runEndedAt - state.runStartedAt : 0;
      state.strategy = event.payload?.strategy || state.strategy;
      state.clusterMode = event.payload?.clusterMode || state.clusterMode;
      break;
    case AGENT_EVENT_TYPES.ERROR:
      state.isRunning = false;
      state.lastError = event.payload?.message || 'cluster error';
      break;
    case AGENT_EVENT_TYPES.CANCELLED:
      state.isRunning = false;
      state.runEndedAt = Date.now();
      state.totalMs = state.runStartedAt ? state.runEndedAt - state.runStartedAt : 0;
      break;
    default:
      break;
  }
};

export const useAgentClusterState = () => {
  const state = reactive(createInitialState());

  const reset = () => {
    Object.assign(state, createInitialState());
  };

  const apply = (event) => {
    applyEventToState(state, event);
  };

  return { state, reset, apply };
};

export const runAgentClusterBranch = async ({
  userText,
  history,
  historySummary,
  clusterMode = AGENT_CLUSTER_MODE.AUTO,
  signal,
  onEvent,
  onStream,
  state
} = {}) => {
  const cluster = getCluster();
  const result = await cluster.run({
    query: userText,
    history: history || [],
    historySummary: historySummary || (history ? summarizeHistoryInline(history) : ''),
    clusterMode,
    signal,
    onEvent: (event) => {
      if (state) applyEventToState(state, event);
      if (typeof onEvent === 'function') onEvent(event);
    },
    onStream: (text) => {
      if (state) {
        state.answer = text;
      }
      if (typeof onStream === 'function') onStream(text);
    }
  });
  return result;
};

export const isAgentClusterMode = (modeId) => modeId === 'agent-cluster';
