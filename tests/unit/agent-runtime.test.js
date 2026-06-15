import { describe, expect, it, vi } from 'vitest';
import { createAgentRuntime } from '../../src/views/BOHAI/agents/core/AgentRuntime.js';
import { AGENT_AGENT_STATUS } from '../../src/views/BOHAI/agents/core/agent-events.js';
import { createMessageBus } from '../../src/views/BOHAI/agents/core/MessageBus.js';

describe('AgentRuntime: createAgentRuntime', () => {
  it('throws when run is not a function', () => {
    expect(() => createAgentRuntime({ name: 'test' })).toThrow('run 必须为函数');
  });

  it('throws when name is missing', () => {
    expect(() => createAgentRuntime({ run: vi.fn() })).toThrow('name 必填');
  });
});

describe('AgentRuntime: basic properties', () => {
  it('returns agent with correct properties', () => {
    const agent = createAgentRuntime({
      name: 'test-agent',
      role: 'tester',
      tag: 'test',
      label: '测试',
      category: 'action',
      timeoutMs: 15000,
      run: vi.fn(),
    });
    expect(agent.name).toBe('test-agent');
    expect(agent.role).toBe('tester');
    expect(agent.tag).toBe('test');
    expect(agent.label).toBe('测试');
    expect(agent.category).toBe('action');
    expect(agent.timeoutMs).toBe(15000);
    expect(agent.enabled).toBe(true);
    expect(agent.execute).toBeTypeOf('function');
    expect(agent.run).toBeTypeOf('function');
  });

  it('defaults tag/label from role', () => {
    const agent = createAgentRuntime({ name: 'worker', role: 'worker', run: vi.fn() });
    expect(agent.tag).toBe('worker');
    expect(agent.label).toBe('worker');
  });

  it('defaults timeoutMs to 25000', () => {
    const agent = createAgentRuntime({ name: 'worker', run: vi.fn() });
    expect(agent.timeoutMs).toBe(25000);
  });

  it('defaults enabled to true', () => {
    const agent = createAgentRuntime({ name: 'worker', run: vi.fn(), enabled: false });
    expect(agent.enabled).toBe(false);
  });
});

describe('AgentRuntime: execute', () => {
  it('returns normalized ok result', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue({ ok: true, output: 'done', tokens: 100 }),
    });

    const result = await agent.execute({ task: { id: 't1', agent: 'worker' } });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('done');
    expect(result.status).toBe(AGENT_AGENT_STATUS.OK);
    expect(result.tokens).toBe(100);
    expect(result.ms).toBeTypeOf('number');
  });

  it('returns normalized failed result', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue({ ok: false, error: new Error('oops') }),
    });

    const result = await agent.execute({ task: { id: 't1', agent: 'worker' } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(AGENT_AGENT_STATUS.FAILED);
  });

  it('normalizes non-object output', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue('plain string'),
    });

    const result = await agent.execute({ task: { id: 't1', agent: 'worker' } });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('plain string');
  });

  it('normalizes null output', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue(null),
    });

    const result = await agent.execute({ task: { id: 't1', agent: 'worker' } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(AGENT_AGENT_STATUS.FAILED);
    expect(result.errorMessage).toContain('未产出结果');
  });

  it('handles rejected promise', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockRejectedValue(new Error('crash')),
    });

    const result = await agent.execute({ task: { id: 't1', agent: 'worker' } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(AGENT_AGENT_STATUS.FAILED);
    expect(result.error).toBeTruthy();
  });

  it('handles timeout', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      timeoutMs: 100,
      run: vi.fn(() => new Promise((r) => setTimeout(r, 500))),
    });

    const result = await agent.execute({ task: { id: 't1', agent: 'worker' } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(AGENT_AGENT_STATUS.FAILED);
  });

  it('respects overrideTimeoutMs', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      timeoutMs: 5000,
      run: vi.fn(() => new Promise((r) => setTimeout(r, 500))),
    });

    const result = await agent.execute({ task: { id: 't1', agent: 'worker' }, overrideTimeoutMs: 50 });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(AGENT_AGENT_STATUS.FAILED);
  });

  it('writes output to message bus', async () => {
    const bus = createMessageBus();
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue({
        ok: true,
        output: 'bus result',
        evidence: [{ text: 'e1' }],
        sources: [{ id: 's1', label: 'Source' }],
        draftKey: 'draft1',
        draft: { title: 'Draft' },
        tokens: 50,
      }),
    });

    await agent.execute({ task: { id: 't1', agent: 'worker' }, context: { bus } });
    expect(bus.getAgentOutput('worker').output).toBe('bus result');
    expect(bus.getEvidence()).toHaveLength(1);
    expect(bus.getSources()).toHaveLength(1);
    expect(bus.getDraft('draft1')).toEqual({ title: 'Draft' });
  });

  it('records errors to bus', async () => {
    const bus = createMessageBus();
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue({ ok: false, error: new Error('worker error') }),
    });

    await agent.execute({ task: { id: 't1', agent: 'worker' }, context: { bus } });
    expect(bus.getErrors()).toHaveLength(1);
    expect(bus.getErrors()[0].message).toBe('worker error');
  });

  it('emits agent-start and agent-end events', async () => {
    const events = [];
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue({ ok: true, output: 'done' }),
    });

    await agent.execute({
      task: { id: 't1', agent: 'worker' },
      context: { onProgress: (e) => events.push(e) },
    });

    const types = events.map((e) => e.type);
    expect(types).toContain('agent-start');
    expect(types).toContain('agent-end');
  });

  it('handles abort signal', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      timeoutMs: 30000,
      run: vi.fn(({ signal: sig }) => new Promise((_, reject) => {
        if (sig) sig.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })),
    });
    const controller = new AbortController();

    const resultPromise = agent.execute({
      task: { id: 't1', agent: 'worker' },
      signal: controller.signal,
    });
    // Small delay before aborting
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.status).toBe(AGENT_AGENT_STATUS.CANCELLED);
  });

  it('tracks metrics', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue({ ok: true, output: 'done' }),
    });

    await agent.execute({ task: { id: 't1', agent: 'worker' } });
    const metrics = agent.metrics();
    expect(metrics.runs).toBe(1);
    expect(metrics.ok).toBe(1);
    expect(metrics.failed).toBe(0);
  });

  it('tracks failed metrics', async () => {
    const agent = createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockRejectedValue(new Error('fail')),
    });

    await agent.execute({ task: { id: 't1', agent: 'worker' } });
    const metrics = agent.metrics();
    expect(metrics.runs).toBe(1);
    expect(metrics.failed).toBe(1);
  });
});