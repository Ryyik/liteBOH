import { describe, expect, it, vi } from 'vitest';
import { createTaskScheduler } from '../../src/views/BOHAI/agents/core/TaskScheduler.js';
import { createAgentRegistry } from '../../src/views/BOHAI/agents/core/AgentRegistry.js';
import { createMessageBus } from '../../src/views/BOHAI/agents/core/MessageBus.js';
import { createAgentRuntime } from '../../src/views/BOHAI/agents/core/AgentRuntime.js';
import { AGENT_AGENT_STATUS } from '../../src/views/BOHAI/agents/core/agent-events.js';

describe('TaskScheduler: createTaskScheduler', () => {
  it('throws when registry is missing', () => {
    expect(() => createTaskScheduler({ bus: createMessageBus() })).toThrow('registry');
  });

  it('throws when bus is missing', () => {
    const registry = createAgentRegistry();
    expect(() => createTaskScheduler({ registry })).toThrow('bus');
  });
});

describe('TaskScheduler: buildExecutionLayers', () => {
  it('builds layers for independent tasks', () => {
    const registry = createAgentRegistry();
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });

    const { layers } = scheduler.buildExecutionLayers([
      { id: 't1', agent: 'a' },
      { id: 't2', agent: 'b' },
    ]);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toContain('t1');
    expect(layers[0]).toContain('t2');
  });

  it('builds layers for sequential tasks', () => {
    const registry = createAgentRegistry();
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });

    const { layers } = scheduler.buildExecutionLayers([
      { id: 't1', agent: 'a', deps: [] },
      { id: 't2', agent: 'b', deps: ['t1'] },
      { id: 't3', agent: 'c', deps: ['t2'] },
    ]);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toEqual(['t1']);
    expect(layers[1]).toEqual(['t2']);
    expect(layers[2]).toEqual(['t3']);
  });

  it('builds mixed dependency layers', () => {
    const registry = createAgentRegistry();
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });

    const { layers } = scheduler.buildExecutionLayers([
      { id: 't1', agent: 'a', deps: [] },
      { id: 't2', agent: 'b', deps: [] },
      { id: 't3', agent: 'c', deps: ['t1', 't2'] },
    ]);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('t1');
    expect(layers[0]).toContain('t2');
    expect(layers[1]).toEqual(['t3']);
  });
});

describe('TaskScheduler: run', () => {
  it('returns empty_plan for empty input', async () => {
    const registry = createAgentRegistry();
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });
    const result = await scheduler.run([]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty_plan');
  });

  it('skips unregistered agents', async () => {
    const registry = createAgentRegistry();
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });
    const result = await scheduler.run([{ id: 't1', agent: 'unknown' }]);
    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe(AGENT_AGENT_STATUS.SKIPPED);
    expect(result.results[0].errorMessage).toContain('未注册');
  });

  it('skips disabled agents', async () => {
    const registry = createAgentRegistry();
    registry.register(createAgentRuntime({ name: 'worker', run: vi.fn(), enabled: false }));
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });
    const result = await scheduler.run([{ id: 't1', agent: 'worker' }]);
    expect(result.results[0].status).toBe(AGENT_AGENT_STATUS.SKIPPED);
    expect(result.results[0].errorMessage).toContain('已禁用');
  });

  it('runs single agent successfully', async () => {
    const registry = createAgentRegistry();
    registry.register(createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockResolvedValue({ ok: true, output: 'done' }),
    }));
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });

    const result = await scheduler.run([{ id: 't1', agent: 'worker' }]);
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[0].status).toBe(AGENT_AGENT_STATUS.OK);
    expect(result.results[0].output).toBe('done');
  });

  it('handles agent failure', async () => {
    const registry = createAgentRegistry();
    registry.register(createAgentRuntime({
      name: 'worker',
      run: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus });

    const result = await scheduler.run([{ id: 't1', agent: 'worker' }]);
    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].status).toBe(AGENT_AGENT_STATUS.FAILED);
  });

  it('runs multiple agents concurrently', async () => {
    const registry = createAgentRegistry();
    const calls = [];
    registry.register(createAgentRuntime({
      name: 'worker1',
      run: vi.fn(async () => {
        calls.push('w1-start');
        await new Promise((r) => setTimeout(r, 50));
        calls.push('w1-end');
        return { ok: true, output: 'r1' };
      }),
    }));
    registry.register(createAgentRuntime({
      name: 'worker2',
      run: vi.fn(async () => {
        calls.push('w2-start');
        await new Promise((r) => setTimeout(r, 50));
        calls.push('w2-end');
        return { ok: true, output: 'r2' };
      }),
    }));
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus, maxConcurrency: 2 });

    const result = await scheduler.run([
      { id: 't1', agent: 'worker1' },
      { id: 't2', agent: 'worker2' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    // Both should have started before either finished (concurrent)
    expect(calls[0]).toMatch(/w[12]-start/);
    expect(calls[1]).toMatch(/w[12]-start/);
  });

  it('passes dep outputs to dependent tasks', async () => {
    const registry = createAgentRegistry();
    let receivedDeps = null;
    registry.register(createAgentRuntime({
      name: 'worker1',
      run: vi.fn().mockResolvedValue({ ok: true, output: 'dep result' }),
    }));
    registry.register(createAgentRuntime({
      name: 'worker2',
      run: vi.fn(async ({ context }) => {
        receivedDeps = context.depsOutputs;
        return { ok: true, output: 'final' };
      }),
    }));
    const bus = createMessageBus();
    const scheduler = createTaskScheduler({ registry, bus, maxConcurrency: 1 });

    const result = await scheduler.run([
      { id: 't1', agent: 'worker1', deps: [] },
      { id: 't2', agent: 'worker2', deps: ['t1'] },
    ]);
    expect(result.ok).toBe(true);
    expect(receivedDeps).toHaveLength(1);
    expect(receivedDeps[0].output).toBe('dep result');
  });

  it('respects signal cancellation', async () => {
    const registry = createAgentRegistry();
    registry.register(createAgentRuntime({
      name: 'worker',
      run: vi.fn(({ signal: sig }) => new Promise((_, reject) => {
        if (sig) sig.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })),
      timeoutMs: 30000,
    }));
    const bus = createMessageBus();
    const controller = new AbortController();
    const scheduler = createTaskScheduler({ registry, bus, signal: controller.signal, totalTimeoutMs: 60000 });

    const resultPromise = scheduler.run([{ id: 't1', agent: 'worker' }]);
    // Small delay to ensure the agent has started
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    const result = await resultPromise;
    expect(result.cancelled).toBe(true);
  });
});