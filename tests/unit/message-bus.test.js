import { describe, expect, it } from 'vitest';
import { createMessageBus } from '../../src/views/BOHAI/agents/core/MessageBus.js';

describe('MessageBus: createMessageBus', () => {
  it('creates bus with default values', () => {
    const bus = createMessageBus({ runId: 'run-1' });
    expect(bus.runId).toBe('run-1');
    expect(bus.startedAt).toBeTypeOf('number');
  });

  it('uses empty runId if not provided', () => {
    const bus = createMessageBus();
    expect(bus.runId).toBe('');
  });
});

describe('MessageBus: setQuery / getQuery / getNormalizedQuery', () => {
  it('sets and gets query', () => {
    const bus = createMessageBus();
    bus.setQuery('Hello World', 'hello world');
    expect(bus.getQuery()).toBe('Hello World');
    expect(bus.getNormalizedQuery()).toBe('hello world');
  });

  it('normalizes query when normalized not provided', () => {
    const bus = createMessageBus();
    bus.setQuery('  Hello World  ');
    expect(bus.getNormalizedQuery()).toBe('hello world');
  });

  it('handles empty query', () => {
    const bus = createMessageBus();
    bus.setQuery('');
    expect(bus.getQuery()).toBe('');
    expect(bus.getNormalizedQuery()).toBe('');
  });
});

describe('MessageBus: setPlan / getPlan', () => {
  it('sets and gets plan', () => {
    const bus = createMessageBus();
    const plan = [{ id: 't1', agent: 'retriever' }, { id: 't2', agent: 'memory' }];
    bus.setPlan(plan);
    expect(bus.getPlan()).toEqual(plan);
  });

  it('returns a shallow copy', () => {
    const bus = createMessageBus();
    bus.setPlan([{ id: 't1' }]);
    const plan = bus.getPlan();
    plan.push({ id: 't2' });
    expect(bus.getPlan()).toHaveLength(1);
  });

  it('handles non-array input', () => {
    const bus = createMessageBus();
    bus.setPlan('not-array');
    expect(bus.getPlan()).toEqual([]);
  });
});

describe('MessageBus: addEvidence / getEvidence', () => {
  it('adds evidence items', () => {
    const bus = createMessageBus();
    bus.addEvidence([{ text: 'evidence 1' }, { text: 'evidence 2' }]);
    expect(bus.getEvidence()).toHaveLength(2);
    expect(bus.getEvidence()[0].text).toBe('evidence 1');
    expect(bus.getEvidence()[0].agent).toBe('retriever');
  });

  it('trims evidence exceeding maxEvidenceItems', () => {
    const bus = createMessageBus({ limits: { maxEvidenceItems: 3 } });
    bus.addEvidence([
      { text: 'e1' }, { text: 'e2' }, { text: 'e3' }, { text: 'e4' }, { text: 'e5' },
    ]);
    const evidence = bus.getEvidence();
    expect(evidence).toHaveLength(3);
    expect(evidence[0].text).toBe('e3');
    expect(evidence[2].text).toBe('e5');
  });

  it('does nothing for empty evidence', () => {
    const bus = createMessageBus();
    bus.addEvidence([]);
    expect(bus.getEvidence()).toHaveLength(0);
  });
});

describe('MessageBus: writeAgentOutput / getAgentOutput / getAgentOutputs', () => {
  it('writes and reads agent output', () => {
    const bus = createMessageBus();
    bus.writeAgentOutput('retriever', { text: 'result' });
    expect(bus.getAgentOutput('retriever')).toEqual({ text: 'result' });
  });

  it('returns undefined for unknown agent', () => {
    const bus = createMessageBus();
    expect(bus.getAgentOutput('unknown')).toBeUndefined();
  });

  it('returns all outputs', () => {
    const bus = createMessageBus();
    bus.writeAgentOutput('retriever', 'result1');
    bus.writeAgentOutput('memory', 'result2');
    const outputs = bus.getAgentOutputs();
    expect(outputs.retriever).toBe('result1');
    expect(outputs.memory).toBe('result2');
  });

  it('enforces maxAgentOutputs limit', () => {
    const bus = createMessageBus({ limits: { maxAgentOutputs: 2 } });
    bus.writeAgentOutput('a1', 'v1');
    bus.writeAgentOutput('a2', 'v2');
    bus.writeAgentOutput('a3', 'v3');
    const keys = Object.keys(bus.getAgentOutputs());
    expect(keys).toHaveLength(2);
  });
});

describe('MessageBus: setDraft / getDraft / getDrafts', () => {
  it('sets and gets draft', () => {
    const bus = createMessageBus();
    bus.setDraft('post', { title: 'Draft' });
    expect(bus.getDraft('post')).toEqual({ title: 'Draft' });
  });

  it('returns undefined for missing key', () => {
    const bus = createMessageBus();
    expect(bus.getDraft('missing')).toBeUndefined();
  });

  it('returns all drafts', () => {
    const bus = createMessageBus();
    bus.setDraft('a', 1);
    bus.setDraft('b', 2);
    expect(bus.getDrafts()).toEqual({ a: 1, b: 2 });
  });
});

describe('MessageBus: addError / getErrors', () => {
  it('records errors', () => {
    const bus = createMessageBus();
    bus.addError('retriever', new Error('fetch failed'));
    const errors = bus.getErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].agent).toBe('retriever');
    expect(errors[0].message).toBe('fetch failed');
    expect(errors[0].type).toBe('Error');
  });

  it('handles string error', () => {
    const bus = createMessageBus();
    bus.addError('ops', 'failed');
    expect(bus.getErrors()[0].message).toBe('failed');
  });

  it('ignores null/undefined error', () => {
    const bus = createMessageBus();
    bus.addError('agent', null);
    expect(bus.getErrors()).toHaveLength(0);
  });
});

describe('MessageBus: addSource / getSources', () => {
  it('adds and deduplicates sources', () => {
    const bus = createMessageBus();
    bus.addSource({ id: 's1', label: 'Source 1', source: 'url1' });
    bus.addSource({ id: 's1', label: 'Source 1b', source: 'url1b' });
    const sources = bus.getSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].count).toBe(2);
    expect(sources[0].label).toBe('Source 1b');
  });

  it('merges refs', () => {
    const bus = createMessageBus();
    bus.addSource({ id: 's1', refs: ['ref1'] });
    bus.addSource({ id: 's1', refs: ['ref2'] });
    const sources = bus.getSources();
    expect(sources[0].refs).toContain('ref1');
    expect(sources[0].refs).toContain('ref2');
  });

  it('ignores source without id', () => {
    const bus = createMessageBus();
    bus.addSource({ label: 'no id' });
    expect(bus.getSources()).toHaveLength(0);
  });
});

describe('MessageBus: snapshot', () => {
  it('returns full state snapshot', () => {
    const bus = createMessageBus({ runId: 'run-1' });
    bus.setQuery('test');
    bus.setPlan([{ id: 't1', agent: 'r' }]);
    bus.addEvidence([{ text: 'e' }]);
    bus.writeAgentOutput('a', 'v');
    bus.setDraft('d', 'v');
    bus.addError('a', 'err');

    const snap = bus.snapshot();
    expect(snap.runId).toBe('run-1');
    expect(snap.query).toBe('test');
    expect(snap.plan).toEqual([{ id: 't1', agent: 'r' }]);
    expect(snap.evidence).toHaveLength(1);
    expect(snap.agentOutputs.a).toBe('v');
    expect(snap.drafts.d).toBe('v');
    expect(snap.errors).toHaveLength(1);
  });
});

describe('MessageBus: truncateEvidenceText', () => {
  it('truncates long evidence text', () => {
    const bus = createMessageBus();
    bus.addEvidence([{ text: 'a'.repeat(2000) }]);
    bus.truncateEvidenceText(100);
    const evidence = bus.getEvidence();
    expect(evidence[0].text.length).toBeLessThanOrEqual(108);
  });
});

describe('MessageBus: cache operations', () => {
  it('cacheGet returns undefined for missing key', () => {
    const bus = createMessageBus();
    expect(bus.cacheGet('bucket', 'key')).toBeUndefined();
  });

  it('cacheSet and cacheGet roundtrip', () => {
    const bus = createMessageBus();
    bus.cacheSet('bucket', ['part1', 'part2'], { value: 42 });
    expect(bus.cacheGet('bucket', ['part1', 'part2'])).toEqual({ value: 42 });
  });

  it('cache evicts oldest entries when exceeding maxEntries', () => {
    const bus = createMessageBus();
    bus.cacheSet('bucket', ['k1'], 'v1', { maxEntries: 2 });
    bus.cacheSet('bucket', ['k2'], 'v2', { maxEntries: 2 });
    bus.cacheSet('bucket', ['k3'], 'v3', { maxEntries: 2 });
    expect(bus.cacheGet('bucket', ['k1'])).toBeUndefined();
    expect(bus.cacheGet('bucket', ['k2'])).toBe('v2');
    expect(bus.cacheGet('bucket', ['k3'])).toBe('v3');
  });

  it('cacheClear clears all when no key', () => {
    const bus = createMessageBus();
    bus.cacheSet('bucket', ['k1'], 'v1');
    bus.cacheClear();
    expect(bus.cacheGet('bucket', ['k1'])).toBeUndefined();
  });

  it('cacheClear clears specific bucket', () => {
    const bus = createMessageBus();
    bus.cacheSet('b1', ['k1'], 'v1');
    bus.cacheSet('b2', ['k2'], 'v2');
    bus.cacheClear('b1');
    expect(bus.cacheGet('b1', ['k1'])).toBeUndefined();
    expect(bus.cacheGet('b2', ['k2'])).toBe('v2');
  });
});

describe('MessageBus: sharedContext', () => {
  it('sets and gets shared context', () => {
    const bus = createMessageBus();
    bus.setSharedContext('key', 'value');
    expect(bus.getSharedContext('key')).toBe('value');
  });

  it('returns undefined for missing key', () => {
    const bus = createMessageBus();
    expect(bus.getSharedContext('missing')).toBeUndefined();
  });
});