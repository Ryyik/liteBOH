import { describe, expect, it } from 'vitest';
import {
  AGENT_EVENT_TYPES,
  AGENT_AGENT_ROLES,
  AGENT_AGENT_STATUS,
  AGENT_AGENT_CATEGORIES,
  resolveAgentCategory,
  resolveAgentLabel,
  createAgentEvent,
  isAgentEvent,
  createEmptyAgentRunTrace,
  normalizeAgentPlan,
  buildAgentRunId,
} from '../../src/views/BOHAI/agents/core/agent-events.js';

describe('agent-events: constants', () => {
  it('AGENT_EVENT_TYPES includes all expected types', () => {
    expect(AGENT_EVENT_TYPES.PLAN).toBe('plan');
    expect(AGENT_EVENT_TYPES.AGENT_START).toBe('agent-start');
    expect(AGENT_EVENT_TYPES.AGENT_END).toBe('agent-end');
    expect(AGENT_EVENT_TYPES.SYNTH_START).toBe('synth-start');
    expect(AGENT_EVENT_TYPES.SYNTH_END).toBe('synth-end');
    expect(AGENT_EVENT_TYPES.CRITIC_REVISE).toBe('critic-revise');
    expect(AGENT_EVENT_TYPES.USAGE).toBe('usage');
    expect(AGENT_EVENT_TYPES.FINAL).toBe('final');
    expect(AGENT_EVENT_TYPES.DEGRADED).toBe('degraded');
    expect(AGENT_EVENT_TYPES.ERROR).toBe('error');
    expect(AGENT_EVENT_TYPES.CANCELLED).toBe('cancelled');
  });

  it('AGENT_AGENT_ROLES includes all roles', () => {
    expect(AGENT_AGENT_ROLES.ORCHESTRATOR).toBe('orchestrator');
    expect(AGENT_AGENT_ROLES.SYNTHESIZER).toBe('synthesizer');
    expect(AGENT_AGENT_ROLES.CHAT_ENGINE).toBe('chat-engine');
    expect(AGENT_AGENT_ROLES.RETRIEVER).toBe('retriever');
    expect(AGENT_AGENT_ROLES.MEMORY).toBe('memory');
    expect(AGENT_AGENT_ROLES.OPS).toBe('ops');
    expect(AGENT_AGENT_ROLES.CODE).toBe('code');
    expect(AGENT_AGENT_ROLES.CREATIVE).toBe('creative');
    expect(AGENT_AGENT_ROLES.ANALYST).toBe('analyst');
  });

  it('AGENT_AGENT_STATUS includes all statuses', () => {
    expect(AGENT_AGENT_STATUS.PENDING).toBe('pending');
    expect(AGENT_AGENT_STATUS.RUNNING).toBe('running');
    expect(AGENT_AGENT_STATUS.OK).toBe('ok');
    expect(AGENT_AGENT_STATUS.FAILED).toBe('failed');
    expect(AGENT_AGENT_STATUS.SKIPPED).toBe('skipped');
    expect(AGENT_AGENT_STATUS.CANCELLED).toBe('cancelled');
  });

  it('AGENT_AGENT_CATEGORIES includes all categories', () => {
    expect(AGENT_AGENT_CATEGORIES.CONTROL).toBe('control');
    expect(AGENT_AGENT_CATEGORIES.KNOWLEDGE).toBe('knowledge');
    expect(AGENT_AGENT_CATEGORIES.REASONING).toBe('reasoning');
    expect(AGENT_AGENT_CATEGORIES.ACTION).toBe('action');
    expect(AGENT_AGENT_CATEGORIES.CREATIVE).toBe('creative');
  });
});

describe('agent-events: resolveAgentCategory', () => {
  it('resolves orchestrator to control', () => {
    expect(resolveAgentCategory('orchestrator')).toBe('control');
  });

  it('resolves synthesizer to control', () => {
    expect(resolveAgentCategory('synthesizer')).toBe('control');
  });

  it('resolves chat-engine to knowledge', () => {
    expect(resolveAgentCategory('chat-engine')).toBe('knowledge');
  });

  it('resolves retriever to knowledge', () => {
    expect(resolveAgentCategory('retriever')).toBe('knowledge');
  });

  it('resolves memory to knowledge', () => {
    expect(resolveAgentCategory('memory')).toBe('knowledge');
  });

  it('resolves ops to action', () => {
    expect(resolveAgentCategory('ops')).toBe('action');
  });

  it('resolves code to action', () => {
    expect(resolveAgentCategory('code')).toBe('action');
  });

  it('resolves creative to creative', () => {
    expect(resolveAgentCategory('creative')).toBe('creative');
  });

  it('resolves analyst to reasoning', () => {
    expect(resolveAgentCategory('analyst')).toBe('reasoning');
  });

  it('falls back to knowledge for unknown role', () => {
    expect(resolveAgentCategory('unknown-role')).toBe('knowledge');
  });

  it('falls back to knowledge for empty string', () => {
    expect(resolveAgentCategory('')).toBe('knowledge');
  });
});

describe('agent-events: resolveAgentLabel', () => {
  it('returns Chinese labels for known roles', () => {
    expect(resolveAgentLabel('orchestrator')).toBe('编排');
    expect(resolveAgentLabel('synthesizer')).toBe('合成');
    expect(resolveAgentLabel('chat-engine')).toBe('对话');
    expect(resolveAgentLabel('retriever')).toBe('检索');
    expect(resolveAgentLabel('memory')).toBe('记忆');
    expect(resolveAgentLabel('ops')).toBe('操作');
    expect(resolveAgentLabel('code')).toBe('代码');
    expect(resolveAgentLabel('creative')).toBe('创作');
    expect(resolveAgentLabel('analyst')).toBe('推理');
  });

  it('returns role name for unknown', () => {
    expect(resolveAgentLabel('custom-agent')).toBe('custom-agent');
  });

  it('returns Agent for empty input', () => {
    expect(resolveAgentLabel('')).toBe('Agent');
  });
});

describe('agent-events: createAgentEvent', () => {
  it('creates event with type and payload', () => {
    const event = createAgentEvent('plan', { query: 'test' });
    expect(event.type).toBe('plan');
    expect(event.payload.query).toBe('test');
    expect(event.createdAt).toBeTypeOf('number');
  });

  it('creates event with empty payload by default', () => {
    const event = createAgentEvent('error');
    expect(event.type).toBe('error');
    expect(event.payload).toEqual({});
  });
});

describe('agent-events: isAgentEvent', () => {
  it('returns true for valid event types', () => {
    expect(isAgentEvent({ type: 'plan' })).toBe(true);
    expect(isAgentEvent({ type: 'agent-start' })).toBe(true);
    expect(isAgentEvent({ type: 'agent-end' })).toBe(true);
    expect(isAgentEvent({ type: 'final' })).toBe(true);
  });

  it('returns false for invalid types', () => {
    expect(isAgentEvent({ type: 'unknown' })).toBe(false);
    expect(isAgentEvent({ type: '' })).toBe(false);
  });

  it('returns falsy for null/undefined', () => {
    expect(isAgentEvent(null)).toBeFalsy();
    expect(isAgentEvent(undefined)).toBeFalsy();
  });
});

describe('agent-events: createEmptyAgentRunTrace', () => {
  it('returns empty trace structure', () => {
    const trace = createEmptyAgentRunTrace();
    expect(trace.plan).toBeNull();
    expect(trace.agents).toEqual([]);
    expect(trace.synth).toBeNull();
    expect(trace.criticRevisions).toEqual([]);
    expect(trace.degraded).toBeNull();
    expect(trace.startedAt).toBe(0);
    expect(trace.endedAt).toBe(0);
    expect(trace.totalMs).toBe(0);
    expect(trace.tokenEstimate).toBe(0);
  });
});

describe('agent-events: normalizeAgentPlan', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeAgentPlan()).toEqual([]);
    expect(normalizeAgentPlan([])).toEqual([]);
    expect(normalizeAgentPlan(null)).toEqual([]);
  });

  it('normalizes a valid plan', () => {
    const plan = [
      { agent: 'chat-engine', id: 't1', deps: ['t0'], priority: 1, description: 'chat' },
      { agent: 'retriever', id: 't2', deps: [], input: { query: 'test' } },
    ];
    const result = normalizeAgentPlan(plan);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('t1');
    expect(result[0].agent).toBe('chat-engine');
    expect(result[0].deps).toEqual(['t0']);
    expect(result[0].priority).toBe(1);
    expect(result[0].description).toBe('chat');
    expect(result[1].id).toBe('t2');
    expect(result[1].agent).toBe('retriever');
    expect(result[1].input).toEqual({ query: 'test' });
  });

  it('generates task ID for missing id', () => {
    const plan = [{ agent: 'chat-engine' }];
    const result = normalizeAgentPlan(plan);
    expect(result[0].id).toBe('task-0');
  });

  it('uses role as agent when agent is missing', () => {
    const plan = [{ role: 'memory' }];
    const result = normalizeAgentPlan(plan);
    expect(result[0].agent).toBe('memory');
  });

  it('filters invalid entries', () => {
    const plan = [{ agent: 'chat-engine' }, null, { x: 1 }, undefined];
    const result = normalizeAgentPlan(plan);
    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe('chat-engine');
  });

  it('converts non-array deps to empty array', () => {
    const plan = [{ agent: 'chat-engine', deps: 'not-array' }];
    const result = normalizeAgentPlan(plan);
    expect(result[0].deps).toEqual([]);
  });

  it('converts non-finite priority to 0', () => {
    const plan = [{ agent: 'chat-engine', priority: NaN }];
    const result = normalizeAgentPlan(plan);
    expect(result[0].priority).toBe(0);
  });
});

describe('agent-events: buildAgentRunId', () => {
  it('generates unique run IDs', () => {
    const id1 = buildAgentRunId();
    const id2 = buildAgentRunId();
    expect(id1).toMatch(/^agentrun-\d+-[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});