import { AGENT_AGENT_ROLES } from './agent-events.js';

const DEFAULT_LIMITS = Object.freeze({
  maxTextChars: 6000,
  maxEvidenceItems: 80,
  maxAgentOutputs: 16
});

const truncateText = (text, limit) => {
  const safe = String(text || '');
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit)}…(已截断)`;
};

export const createMessageBus = ({
  runId,
  limits = {}
} = {}) => {
  const mergedLimits = { ...DEFAULT_LIMITS, ...limits };
  const state = {
    runId: String(runId || ''),
    startedAt: Date.now(),
    query: '',
    normalizedQuery: '',
    plan: [],
    evidence: [],
    drafts: {},
    agentOutputs: {},
    sharedContext: {},
    errors: [],
    sources: new Map()
  };

  const ensureLimit = (collection, limit) => {
    if (collection.length > limit) {
      collection.splice(0, collection.length - limit);
    }
  };

  return {
    runId: state.runId,
    startedAt: state.startedAt,
    setQuery(query, normalized) {
      state.query = String(query || '');
      state.normalizedQuery = String(normalized || state.query || '').toLowerCase().trim();
    },
    getQuery() {
      return state.query;
    },
    getNormalizedQuery() {
      return state.normalizedQuery;
    },
    setPlan(plan = []) {
      state.plan = Array.isArray(plan) ? plan.slice() : [];
    },
    getPlan() {
      return state.plan.slice();
    },
    addEvidence(evidence = []) {
      if (!Array.isArray(evidence) || evidence.length === 0) return;
      const list = evidence.map((item) => ({
        ...item,
        agent: item?.agent || AGENT_AGENT_ROLES.RETRIEVER
      }));
      state.evidence.push(...list);
      ensureLimit(state.evidence, mergedLimits.maxEvidenceItems);
    },
    getEvidence() {
      return state.evidence.slice();
    },
    setDraft(key, value) {
      if (!key) return;
      state.drafts[String(key)] = value;
    },
    getDraft(key) {
      return key ? state.drafts[String(key)] : undefined;
    },
    getDrafts() {
      return { ...state.drafts };
    },
    writeAgentOutput(agent, output) {
      if (!agent) return;
      state.agentOutputs[agent] = output;
      const keys = Object.keys(state.agentOutputs);
      if (keys.length > mergedLimits.maxAgentOutputs) {
        const overflow = keys.slice(0, keys.length - mergedLimits.maxAgentOutputs);
        overflow.forEach((k) => delete state.agentOutputs[k]);
      }
    },
    getAgentOutput(agent) {
      return agent ? state.agentOutputs[agent] : undefined;
    },
    getAgentOutputs() {
      return { ...state.agentOutputs };
    },
    setSharedContext(key, value) {
      if (!key) return;
      state.sharedContext[key] = value;
    },
    getSharedContext(key) {
      return key ? state.sharedContext[key] : undefined;
    },
    addError(agent, error) {
      if (!error) return;
      state.errors.push({
        agent: agent || 'unknown',
        message: String(error?.message || error),
        type: error?.name || 'Error',
        at: Date.now()
      });
    },
    getErrors() {
      return state.errors.slice();
    },
    addSource(source) {
      if (!source || !source.id) return;
      const id = String(source.id);
      const existing = state.sources.get(id) || { id, count: 0, lastSeen: 0, label: '', source: '', refs: [] };
      existing.id = id;
      existing.count += 1;
      existing.lastSeen = Date.now();
      existing.label = source.label || existing.label || id;
      existing.source = source.source || existing.source || '';
      existing.refs = Array.from(new Set([...(existing.refs || []), ...(Array.isArray(source.refs) ? source.refs : [])]));
      state.sources.set(id, existing);
    },
    getSources() {
      return Array.from(state.sources.values()).map((item) => ({ ...item }));
    },
    snapshot() {
      return {
        runId: state.runId,
        startedAt: state.startedAt,
        query: state.query,
        normalizedQuery: state.normalizedQuery,
        plan: state.plan.slice(),
        evidence: state.evidence.slice(),
        drafts: { ...state.drafts },
        agentOutputs: { ...state.agentOutputs },
        sharedContext: { ...state.sharedContext },
        errors: state.errors.slice(),
        sources: Array.from(state.sources.values()).map((item) => ({ ...item }))
      };
    },
    truncateEvidenceText(limit = 1200) {
      state.evidence = state.evidence.map((item) => ({
        ...item,
        text: truncateText(item?.text || '', limit)
      }));
    }
  };
};
