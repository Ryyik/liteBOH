import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * createPanelAsync 工厂的真行为测试。
 *
 * 做法：mock 掉 vue 的 defineAsyncComponent（捕获工厂实际传进去的配置）+
 * mock reportEvent（观察上报）。这样能真跑 onError 的两个分支，而不是只断言
 * 「源码里有 onError 这三个字」—— 后者撤掉渲染逻辑照样绿。
 */

const captured = [];
const reportEvent = vi.fn();

vi.mock('vue', () => ({
  defineAsyncComponent: (config) => {
    captured.push(config);
    return { __asyncConfig: config };
  },
  // 工厂用 h 造错误卡；这里给个能反映结构的假实现
  h: (type, props, children) => ({ type, props, children }),
}));

vi.mock('../../src/utils/monitoring.js', () => ({
  reportEvent: (...args) => reportEvent(...args),
}));

const { createPanelAsync } = await import('../../src/utils/async-component.js');

beforeEach(() => {
  captured.length = 0;
  reportEvent.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPanelAsync', () => {
  it('把 loader 原样交给 defineAsyncComponent，并带上默认 delay/timeout', () => {
    const loader = () => Promise.resolve({});
    createPanelAsync(loader, { label: 'X' });
    expect(captured).toHaveLength(1);
    expect(captured[0].loader).toBe(loader);
    expect(captured[0].delay).toBe(120);
    expect(captured[0].timeout).toBe(20000);
  });

  it('默认挂错误卡（替代裸简写的无声空白），自定义 errorComponent 可覆盖它', () => {
    createPanelAsync(() => Promise.resolve({}), { label: 'A' });
    expect(captured[0].errorComponent).toBeTruthy();

    const custom = { name: 'CustomError' };
    createPanelAsync(() => Promise.resolve({}), { label: 'B', errorComponent: custom });
    expect(captured[1].errorComponent).toBe(custom);
  });

  it('onError 在前两次失败时退避重试（不 fail、不上报）', () => {
    vi.useFakeTimers();
    createPanelAsync(() => Promise.resolve({}), { label: 'Retry' });
    const { onError } = captured[0];
    const retry = vi.fn();
    const fail = vi.fn();

    onError(new Error('boom'), retry, fail, 1);
    expect(fail).not.toHaveBeenCalled();
    expect(reportEvent).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled(); // 退避是延迟的
    vi.runAllTimers();
    expect(retry).toHaveBeenCalledTimes(1);

    onError(new Error('boom'), retry, fail, 2);
    vi.runAllTimers();
    expect(retry).toHaveBeenCalledTimes(2);
    expect(fail).not.toHaveBeenCalled();
  });

  it('onError 超过重试次数：上报 async_component_failure 并 fail（闭包保留 label）', () => {
    vi.useFakeTimers();
    createPanelAsync(() => Promise.resolve({}), { label: 'GiveUp' });
    const { onError } = captured[0];
    const retry = vi.fn();
    const fail = vi.fn();

    onError(new Error('boom'), retry, fail, 3);
    vi.runAllTimers();

    expect(retry).not.toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith('async_component_failure', { label: 'GiveUp' });
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('retries 可配置：retries:0 时首次失败即上报并放弃', () => {
    vi.useFakeTimers();
    createPanelAsync(() => Promise.resolve({}), { label: 'NoRetry', retries: 0 });
    const { onError } = captured[0];
    const retry = vi.fn();
    const fail = vi.fn();

    onError(new Error('boom'), retry, fail, 1);
    vi.runAllTimers();
    expect(retry).not.toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith('async_component_failure', { label: 'NoRetry' });
    expect(fail).toHaveBeenCalledTimes(1);
  });
});
