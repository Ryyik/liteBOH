import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWhenIdle } from '../../src/utils/idle-task.js';

// `runWhenIdle` 是「周报 / 广告延后取数」的唯一实现（ForumMain 用它把两条非首屏请求
// 从 onMounted 的同一 tick 里挪走）。三条行为都必须锁住，否则首屏只会换个姿势复发：
//   ① 有 requestIdleCallback 时**不是立即执行**，且把 timeout 透传下去（没有 timeout 兜底，
//      长任务密集的首屏会让周报永远停在骨架屏）；
//   ② 没有 requestIdleCallback（旧 Safari）时退回 setTimeout，不能静默丢任务；
//   ③ 取消后不得执行 —— 组件卸载后仍写状态就是内存泄漏 + 无谓请求。
// 反证：把 runWhenIdle 里的 `task()` 改成同步调用 → 第 1 条必红；
//       把 timeout 改成不传 → 断言 `{ timeout: 1200 }` 必红。

const originalWindow = globalThis.window;

const stubWindow = (props = {}) => {
  globalThis.window = { ...props };
  return globalThis.window;
};

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  vi.useRealTimers();
});

describe('runWhenIdle：非首屏取数的空闲调度', () => {
  it('有 requestIdleCallback 时延后执行，并透传 timeout', () => {
    let idleCallback = null;
    let idleOptions = null;
    stubWindow({
      requestIdleCallback: (fn, opts) => {
        idleCallback = fn;
        idleOptions = opts;
        return 7;
      },
      cancelIdleCallback: vi.fn(),
    });

    const task = vi.fn();
    runWhenIdle(task, { timeout: 1200 });

    expect(task).not.toHaveBeenCalled();
    expect(idleOptions).toEqual({ timeout: 1200 });

    idleCallback();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('没有 requestIdleCallback 时退回 setTimeout，任务不会丢', () => {
    vi.useFakeTimers();
    stubWindow({
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id),
    });

    const task = vi.fn();
    runWhenIdle(task, { fallbackDelay: 400 });

    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('取消后不执行，并撤销已排队的空闲回调', () => {
    const cancelIdleCallback = vi.fn();
    stubWindow({
      requestIdleCallback: () => 11,
      cancelIdleCallback,
    });

    const task = vi.fn();
    const cancel = runWhenIdle(task, { timeout: 1000 });
    cancel();

    expect(cancelIdleCallback).toHaveBeenCalledWith(11);
    expect(task).not.toHaveBeenCalled();
  });

  it('无 window（SSR / node 侧预渲染）时不抛错', () => {
    delete globalThis.window;
    const task = vi.fn();
    expect(() => runWhenIdle(task)()).not.toThrow();
    expect(task).not.toHaveBeenCalled();
  });
});
