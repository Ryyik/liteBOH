import { describe, expect, it, vi } from 'vitest';
import { createAgentRegistry } from '../../src/views/BOHAI/agents/core/AgentRegistry.js';

const makeAgent = (name, overrides = {}) => ({
  name,
  run: vi.fn(),
  ...overrides,
});

describe('AgentRegistry: createAgentRegistry', () => {
  it('returns registry with all methods', () => {
    const registry = createAgentRegistry();
    expect(registry.register).toBeTypeOf('function');
    expect(registry.unregister).toBeTypeOf('function');
    expect(registry.get).toBeTypeOf('function');
    expect(registry.has).toBeTypeOf('function');
    expect(registry.list).toBeTypeOf('function');
    expect(registry.listByCategory).toBeTypeOf('function');
    expect(registry.findByPredicate).toBeTypeOf('function');
    expect(registry.setEnabled).toBeTypeOf('function');
    expect(registry.isEnabled).toBeTypeOf('function');
    expect(registry.size).toBeTypeOf('function');
  });

  it('starts with size 0', () => {
    const registry = createAgentRegistry();
    expect(registry.size()).toBe(0);
  });
});

describe('AgentRegistry: register', () => {
  it('registers a new agent', () => {
    const registry = createAgentRegistry();
    const agent = registry.register(makeAgent('chat-engine'));
    expect(agent.name).toBe('chat-engine');
    expect(registry.size()).toBe(1);
  });

  it('registers with default enabled', () => {
    const registry = createAgentRegistry();
    const agent = registry.register(makeAgent('retriever'));
    expect(agent.enabled).toBe(true);
  });

  it('respects explicit enabled: false', () => {
    const registry = createAgentRegistry();
    const agent = registry.register(makeAgent('disabled-agent', { enabled: false }));
    expect(agent.enabled).toBe(false);
  });

  it('sets default timeoutMs to 25000', () => {
    const registry = createAgentRegistry();
    const agent = registry.register(makeAgent('worker'));
    expect(agent.timeoutMs).toBe(25000);
  });

  it('respects custom timeoutMs', () => {
    const registry = createAgentRegistry();
    const agent = registry.register(makeAgent('worker', { timeoutMs: 10000 }));
    expect(agent.timeoutMs).toBe(10000);
  });

  it('uses role as alias', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('chat-engine', { role: 'chat' }));
    expect(registry.has('chat')).toBe(true);
    expect(registry.get('chat').name).toBe('chat-engine');
  });

  it('assigns category from role', () => {
    const registry = createAgentRegistry();
    const agent = registry.register(makeAgent('orchestrator'));
    expect(agent.category).toBe('control');
  });

  it('emits onChange on register', () => {
    const onChange = vi.fn();
    const registry = createAgentRegistry({ onChange });
    registry.register(makeAgent('chat-engine'));
    expect(onChange).toHaveBeenCalledWith({ type: 'register', name: 'chat-engine' });
  });

  it('throws when name is missing', () => {
    const registry = createAgentRegistry();
    expect(() => registry.register({ run: vi.fn() })).toThrow('缺少 agent.name');
  });

  it('throws when run is not a function', () => {
    const registry = createAgentRegistry();
    expect(() => registry.register({ name: 'test' })).toThrow('run() 方法');
  });

  it('throws when definition is not an object', () => {
    const registry = createAgentRegistry();
    expect(() => registry.register(null)).toThrow('definition 必须为对象');
  });
});

describe('AgentRegistry: unregister', () => {
  it('removes a registered agent', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('chat-engine'));
    expect(registry.size()).toBe(1);
    const result = registry.unregister('chat-engine');
    expect(result).toBe(true);
    expect(registry.size()).toBe(0);
  });

  it('returns false for unknown agent', () => {
    const registry = createAgentRegistry();
    expect(registry.unregister('unknown')).toBe(false);
  });

  it('cleans up aliases', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('chat-engine', { role: 'chat' }));
    registry.unregister('chat-engine');
    expect(registry.has('chat')).toBe(false);
  });

  it('emits onChange on unregister', () => {
    const onChange = vi.fn();
    const registry = createAgentRegistry({ onChange });
    registry.register(makeAgent('chat-engine'));
    registry.unregister('chat-engine');
    expect(onChange).toHaveBeenCalledWith({ type: 'unregister', name: 'chat-engine' });
  });
});

describe('AgentRegistry: get / has', () => {
  it('get returns agent by name', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('chat-engine'));
    const agent = registry.get('chat-engine');
    expect(agent).not.toBeNull();
    expect(agent.name).toBe('chat-engine');
  });

  it('get returns agent by alias', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('chat-engine', { role: 'chat' }));
    expect(registry.get('chat')).not.toBeNull();
  });

  it('get returns null for unknown', () => {
    const registry = createAgentRegistry();
    expect(registry.get('unknown')).toBeNull();
  });

  it('get returns null for empty name', () => {
    const registry = createAgentRegistry();
    expect(registry.get('')).toBeNull();
  });

  it('has returns true/false', () => {
    const registry = createAgentRegistry();
    expect(registry.has('chat-engine')).toBe(false);
    registry.register(makeAgent('chat-engine'));
    expect(registry.has('chat-engine')).toBe(true);
  });
});

describe('AgentRegistry: list / listByCategory', () => {
  it('list returns all agents in registration order', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('orchestrator'));
    registry.register(makeAgent('retriever'));
    registry.register(makeAgent('memory'));

    const agents = registry.list();
    expect(agents).toHaveLength(3);
    expect(agents[0].name).toBe('orchestrator');
    expect(agents[1].name).toBe('retriever');
    expect(agents[2].name).toBe('memory');
  });

  it('listByCategory filters by category', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('orchestrator'));
    registry.register(makeAgent('retriever'));
    registry.register(makeAgent('memory'));

    const control = registry.listByCategory('control');
    expect(control).toHaveLength(1);
    expect(control[0].name).toBe('orchestrator');

    const knowledge = registry.listByCategory('knowledge');
    expect(knowledge).toHaveLength(2);
  });
});

describe('AgentRegistry: findByPredicate', () => {
  it('finds agent by predicate', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('orchestrator', { tag: 'orch' }));
    registry.register(makeAgent('retriever', { tag: 'retr' }));

    const found = registry.findByPredicate((a) => a.tag === 'retr');
    expect(found).not.toBeNull();
    expect(found.name).toBe('retriever');
  });

  it('returns null when no match', () => {
    const registry = createAgentRegistry();
    const found = registry.findByPredicate((a) => a.tag === 'none');
    expect(found).toBeNull();
  });

  it('returns null for non-function predicate', () => {
    const registry = createAgentRegistry();
    expect(registry.findByPredicate('not-a-function')).toBeNull();
  });
});

describe('AgentRegistry: setEnabled / isEnabled', () => {
  it('toggles enabled state', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('chat-engine'));
    expect(registry.isEnabled('chat-engine')).toBe(true);

    registry.setEnabled('chat-engine', false);
    expect(registry.isEnabled('chat-engine')).toBe(false);

    registry.setEnabled('chat-engine', true);
    expect(registry.isEnabled('chat-engine')).toBe(true);
  });

  it('returns false for unknown agent', () => {
    const registry = createAgentRegistry();
    expect(registry.setEnabled('unknown', false)).toBe(false);
  });

  it('isEnabled returns false for unknown', () => {
    const registry = createAgentRegistry();
    expect(registry.isEnabled('unknown')).toBe(false);
  });

  it('works via alias', () => {
    const registry = createAgentRegistry();
    registry.register(makeAgent('chat-engine', { role: 'chat' }));
    registry.setEnabled('chat', false);
    expect(registry.isEnabled('chat-engine')).toBe(false);
  });

  it('emits toggle event', () => {
    const onChange = vi.fn();
    const registry = createAgentRegistry({ onChange });
    registry.register(makeAgent('chat-engine'));
    registry.setEnabled('chat-engine', false);
    expect(onChange).toHaveBeenCalledWith({ type: 'toggle', name: 'chat-engine', enabled: false });
  });
});