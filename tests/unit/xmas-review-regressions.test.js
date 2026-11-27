import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { effectScope } from 'vue';

const api = vi.hoisted(() => ({
  fetchXmasRoster: vi.fn(),
  fetchXmasMyResult: vi.fn(),
  joinXmas: vi.fn(),
  leaveXmas: vi.fn(),
}));

vi.mock('@/utils/api/xmas-exchange-api.js', () => ({
  XMAS_EVENT_FALLBACK: {
    slug: 'christmas-2026',
    title: '圣诞交换礼物',
    revealAt: '2026-12-20T20:00:00+08:00',
    signupDeadline: '2026-12-20T19:30:00+08:00',
    capacity: 20,
    status: 'open',
    isVisible: true,
  },
  fetchXmasRoster: api.fetchXmasRoster,
  fetchXmasMyResult: api.fetchXmasMyResult,
  joinXmas: api.joinXmas,
  leaveXmas: api.leaveXmas,
}));

import {
  formatRevealLabel,
  useXmasExchange,
} from '@/views/ChristmasGiftTree/composables/useXmasExchange.js';

const roster = (overrides = {}) => ({
  ok: true,
  event: {
    title: '圣诞交换礼物',
    revealAt: '2026-12-20T20:00:00+08:00',
    signupDeadline: '2026-12-20T19:30:00+08:00',
    capacity: 20,
    status: 'open',
    isVisible: true,
  },
  participants: [],
  slotCount: 0,
  me: null,
  ...overrides,
});

const mount = () => {
  const scope = effectScope();
  const exchange = scope.run(() => useXmasExchange());
  return { exchange, stop: () => scope.stop() };
};

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('xmas review regressions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T12:00:00+08:00'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('控制台卸载后迟到响应不得重新创建提示定时器', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src/views/XmasConsole/index.vue'),
      'utf8',
    );
    expect(source).toContain('const isUnmounted = ref(false)');
    expect(source).toContain('if (isUnmounted.value) return');
    expect(source).toContain('onUnmounted(() => {');
  });

  it('页面匿名与登录态变化都刷新公共名单', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src/views/ChristmasGiftTree/index.vue'),
      'utf8',
    );
    expect(source).not.toMatch(/if\s*\(loggedIn\)\s*void refresh\(\)/);
    expect(source).toContain('void refresh();');
  });

  it('切换 viewer 会清空上一用户的参与态与结果', async () => {
    const { exchange, stop } = mount();
    exchange.setViewer('user-a');
    api.fetchXmasRoster.mockResolvedValueOnce(
      roster({ me: { joined: true, slot: 1 }, participants: [{ userId: 'user-a', slot: 1 }] }),
    );
    await exchange.refresh();
    exchange.setViewer('');

    expect(exchange.phase.value).toBe('idle');
    expect(exchange.result.value).toBeNull();
    stop();
  });

  it('旧账号 refresh 迟到响应不能覆盖新账号', async () => {
    const { exchange, stop } = mount();
    exchange.setViewer('user-a');
    const oldRoster = deferred();
    api.fetchXmasRoster.mockReturnValueOnce(oldRoster.promise);
    const pending = exchange.refresh();
    exchange.setViewer('user-b');
    oldRoster.resolve(roster({ me: { joined: true, slot: 1 } }));
    await pending;

    expect(exchange.phase.value).toBe('idle');
    stop();
  });

  it('揭晓钟点固定按 GMT+8 显示', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(formatRevealLabel('2026-12-20T20:00:00+08:00')).toContain('20:00');
    vi.unstubAllEnvs();
  });

  it('服务端否认已揭晓时，以服务端时间纠正本地倒计时', async () => {
    const { exchange, stop } = mount();
    vi.setSystemTime(new Date('2026-12-21T20:00:00+08:00'));
    vi.advanceTimersByTime(1000);
    api.fetchXmasMyResult.mockResolvedValue({
      ok: true,
      revealed: false,
      revealAt: '2026-12-25T20:00:00+08:00',
    });

    await exchange.loadResult();

    expect(exchange.isRevealed.value).toBe(false);
    expect(exchange.remainingMs.value).toBeGreaterThan(4 * 86400000 - 2000);
    expect(exchange.remainingMs.value).toBeLessThanOrEqual(4 * 86400000);
    stop();
  });

  it('远端报名成功但名单刷新失败时，退出仍调用服务端', async () => {
    const { exchange, stop } = mount();
    api.fetchXmasRoster.mockResolvedValueOnce(roster());
    await exchange.refresh();
    api.joinXmas.mockResolvedValueOnce({ ok: true, slot: 3 });
    api.fetchXmasRoster.mockResolvedValueOnce({ ok: false, message: 'network' });
    api.fetchXmasRoster.mockResolvedValueOnce(roster());
    api.leaveXmas.mockResolvedValueOnce({ ok: true });

    expect((await exchange.join()).ok).toBe(true);
    expect(exchange.backendReady.value).toBe(false);
    const leaving = exchange.leave();
    await vi.advanceTimersByTimeAsync(300);
    expect((await leaving).ok).toBe(true);
    expect(api.leaveXmas).toHaveBeenCalledTimes(1);
    stop();
  });

  it('服务端关闭报名即进入截止态，不等到本地时间', async () => {
    const { exchange, stop } = mount();
    api.fetchXmasRoster.mockResolvedValueOnce(
      roster({ event: { ...roster().event, status: 'closed' } }),
    );

    await exchange.refresh();

    expect(exchange.isPastDeadline.value).toBe(true);
    stop();
  });
});
