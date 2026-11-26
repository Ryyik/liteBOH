import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const flushMicrotasks = async () => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
};

const createHarness = async ({ scrollTop = 0, enabled = true, onRefresh } = {}) => {
  const frames = new Map();
  let frameId = 0;
  const fakeWindow = new EventTarget();
  Object.assign(fakeWindow, {
    scrollY: scrollTop,
    innerHeight: 844,
    matchMedia: () => ({ matches: false }),
  });
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));

  const properties = new Map();
  const root = {
    style: {
      setProperty: vi.fn((name, value) => properties.set(name, value)),
    },
  };
  const enabledRef = ref(enabled);
  const refresh = vi.fn(onRefresh || (() => Promise.resolve()));
  const { useForumPullToRefresh } =
    await import('../../src/views/Forum/composables/useForumPullToRefresh.js');
  const pull = useForumPullToRefresh({
    contentRef: ref({ parentElement: root }),
    getScrollContainer: () => fakeWindow,
    isEnabled: () => enabledRef.value,
    onRefresh: refresh,
  });
  pull.attach();

  const touch = (type, points) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'touches', { value: points });
    fakeWindow.dispatchEvent(event);
    return event;
  };
  const point = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
  const flushFrames = (count = 180) => {
    let now = performance.now();
    for (let index = 0; index < count; index += 1) {
      const next = frames.entries().next().value;
      if (!next) break;
      frames.delete(next[0]);
      now += 16;
      next[1](now);
    }
  };

  return { pull, refresh, enabledRef, properties, frames, touch, point, flushFrames, fakeWindow };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('forum pull-to-refresh', () => {
  it('阻尼跟随手指，并限制最大回弹距离', async () => {
    const { getForumPullDistance, FORUM_PULL_MAX_DISTANCE } =
      await import('../../src/views/Forum/composables/useForumPullToRefresh.js');
    const small = getForumPullDistance(40, 844);
    const large = getForumPullDistance(180, 844);
    const huge = getForumPullDistance(10000, 844);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(40);
    expect(large).toBeGreaterThan(small);
    expect(huge).toBe(FORUM_PULL_MAX_DISTANCE);
  });

  it('顶部向下拉动有连续位移，但未过阈值不刷新', async () => {
    const harness = await createHarness();
    const { pull, refresh, properties, touch, point, flushFrames } = harness;
    touch('touchstart', [point(1, 180, 180)]);
    const move = touch('touchmove', [point(1, 180, 220)]);
    expect(move.defaultPrevented).toBe(true);
    expect(pull.isActive.value).toBe(true);
    expect(Number.parseFloat(properties.get('--forum-pull-distance'))).toBeGreaterThan(0);
    touch('touchend', []);
    flushFrames();
    await flushMicrotasks();
    expect(refresh).not.toHaveBeenCalled();
    expect(pull.isActive.value).toBe(false);
    expect(properties.get('--forum-pull-distance')).toBe('0.00px');
  });

  it('超过阈值只刷新一次，并在请求落定后收回', async () => {
    const harness = await createHarness();
    const { pull, refresh, touch, point, flushFrames } = harness;
    touch('touchstart', [point(1, 180, 180)]);
    touch('touchmove', [point(1, 180, 360)]);
    touch('touchend', []);
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(pull.isRefreshing.value).toBe(true);
    touch('touchstart', [point(1, 180, 180)]);
    touch('touchmove', [point(1, 180, 360)]);
    touch('touchend', []);
    flushFrames();
    await flushMicrotasks();
    flushFrames();
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(pull.isRefreshing.value).toBe(false);
    expect(pull.isActive.value).toBe(false);
  });

  it('不在顶部时让位给正常滚动', async () => {
    const harness = await createHarness({ scrollTop: 240 });
    const { pull, refresh, touch, point } = harness;
    touch('touchstart', [point(1, 180, 180)]);
    const move = touch('touchmove', [point(1, 180, 360)]);
    touch('touchend', []);
    expect(move.defaultPrevented).toBe(false);
    expect(pull.isActive.value).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('横向手势不被下拉刷新劫持', async () => {
    const harness = await createHarness();
    const { pull, refresh, touch, point } = harness;
    touch('touchstart', [point(1, 100, 180)]);
    const move = touch('touchmove', [point(1, 240, 230)]);
    touch('touchend', []);
    expect(move.defaultPrevented).toBe(false);
    expect(pull.isActive.value).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('会话打开或页面不可见时不接管触摸', async () => {
    const harness = await createHarness({ enabled: false });
    const { pull, refresh, touch, point } = harness;
    touch('touchstart', [point(1, 180, 180)]);
    const move = touch('touchmove', [point(1, 180, 360)]);
    touch('touchend', []);
    expect(move.defaultPrevented).toBe(false);
    expect(pull.isActive.value).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('刷新请求未落定时失活，不再启动收回动画', async () => {
    let resolveRefresh;
    const harness = await createHarness({
      onRefresh: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    });
    const { pull, refresh, frames, touch, point } = harness;
    touch('touchstart', [point(1, 180, 180)]);
    touch('touchmove', [point(1, 180, 360)]);
    touch('touchend', []);
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(1);
    pull.detach();
    resolveRefresh();
    await flushMicrotasks();
    expect(frames.size).toBe(0);
    expect(pull.isRefreshing.value).toBe(false);
    expect(pull.isActive.value).toBe(false);
  });

  it('卸载会摘掉触摸监听并清零回弹', async () => {
    const harness = await createHarness();
    const { pull, refresh, properties, touch, point } = harness;
    touch('touchstart', [point(1, 180, 180)]);
    touch('touchmove', [point(1, 180, 360)]);
    pull.detach();
    const move = touch('touchmove', [point(1, 180, 420)]);
    touch('touchend', []);
    expect(move.defaultPrevented).toBe(false);
    expect(properties.get('--forum-pull-distance')).toBe('0.00px');
    expect(pull.isActive.value).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
