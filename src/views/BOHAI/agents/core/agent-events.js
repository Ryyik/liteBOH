export const AGENT_EVENT_TYPES = Object.freeze({
  PLAN: 'plan',
  AGENT_START: 'agent-start',
  AGENT_PROGRESS: 'agent-progress',
  AGENT_END: 'agent-end',
  SYNTH_START: 'synth-start',
  SYNTH_CHUNK: 'synth-chunk',
  SYNTH_END: 'synth-end',
  CRITIC_REVISE: 'critic-revise',
  FINAL: 'final',
  DEGRADED: 'degraded',
  ERROR: 'error',
  CANCELLED: 'cancelled'
});

export const AGENT_AGENT_ROLES = Object.freeze({
  ORCHESTRATOR: 'orchestrator',
  SYNTHESIZER: 'synthesizer',
  CHAT_ENGINE: 'chat-engine',
  RETRIEVER: 'retriever',
  MEMORY: 'memory',
  OPS: 'ops',
  CODE: 'code',
  CREATIVE: 'creative',
  ANALYST: 'analyst'
});

export const AGENT_AGENT_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  OK: 'ok',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled'
});

export const AGENT_AGENT_CATEGORIES = Object.freeze({
  CONTROL: 'control',
  KNOWLEDGE: 'knowledge',
  REASONING: 'reasoning',
  ACTION: 'action',
  CREATIVE: 'creative'
});

const ROLE_CATEGORY_MAP = {
  [AGENT_AGENT_ROLES.ORCHESTRATOR]: AGENT_AGENT_CATEGORIES.CONTROL,
  [AGENT_AGENT_ROLES.SYNTHESIZER]: AGENT_AGENT_CATEGORIES.CONTROL,
  [AGENT_AGENT_ROLES.CHAT_ENGINE]: AGENT_AGENT_CATEGORIES.KNOWLEDGE,
  [AGENT_AGENT_ROLES.RETRIEVER]: AGENT_AGENT_CATEGORIES.KNOWLEDGE,
  [AGENT_AGENT_ROLES.MEMORY]: AGENT_AGENT_CATEGORIES.KNOWLEDGE,
  [AGENT_AGENT_ROLES.OPS]: AGENT_AGENT_CATEGORIES.ACTION,
  [AGENT_AGENT_ROLES.CODE]: AGENT_AGENT_CATEGORIES.ACTION,
  [AGENT_AGENT_ROLES.CREATIVE]: AGENT_AGENT_CATEGORIES.CREATIVE,
  [AGENT_AGENT_ROLES.ANALYST]: AGENT_AGENT_CATEGORIES.REASONING
};

export const resolveAgentCategory = (role = '') => ROLE_CATEGORY_MAP[role] || AGENT_AGENT_CATEGORIES.KNOWLEDGE;

const ROLE_LABELS = {
  [AGENT_AGENT_ROLES.ORCHESTRATOR]: '编排',
  [AGENT_AGENT_ROLES.SYNTHESIZER]: '合成',
  [AGENT_AGENT_ROLES.CHAT_ENGINE]: '对话',
  [AGENT_AGENT_ROLES.RETRIEVER]: '检索',
  [AGENT_AGENT_ROLES.MEMORY]: '记忆',
  [AGENT_AGENT_ROLES.OPS]: '操作',
  [AGENT_AGENT_ROLES.CODE]: '代码',
  [AGENT_AGENT_ROLES.CREATIVE]: '创作',
  [AGENT_AGENT_ROLES.ANALYST]: '推理'
};

export const resolveAgentLabel = (role = '') => ROLE_LABELS[role] || role || 'Agent';

export const createAgentEvent = (type, payload = {}) => ({
  type,
  payload,
  createdAt: Date.now()
});

const SAFE_TYPES = new Set(Object.values(AGENT_EVENT_TYPES));

export const isAgentEvent = (event) => event && SAFE_TYPES.has(event.type);

export const createEmptyAgentRunTrace = () => ({
  plan: null,
  agents: [],
  synth: null,
  criticRevisions: [],
  degraded: null,
  startedAt: 0,
  endedAt: 0,
  totalMs: 0,
  tokenEstimate: 0
});

export const normalizeAgentPlan = (plan = []) => {
  if (!Array.isArray(plan)) return [];
  return plan
    .filter((node) => node && typeof node === 'object' && (node.agent || node.role))
    .map((node, index) => ({
      id: String(node.id || `task-${index}`),
      agent: String(node.agent || node.role),
      deps: Array.isArray(node.deps) ? node.deps.map(String) : [],
      priority: Number.isFinite(node.priority) ? Number(node.priority) : 0,
      input: node.input && typeof node.input === 'object' ? node.input : {},
      description: String(node.description || node.agent || ''),
      timeoutMs: Number.isFinite(node.timeoutMs) ? Number(node.timeoutMs) : undefined
    }));
};

export const buildAgentRunId = () => `agentrun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
