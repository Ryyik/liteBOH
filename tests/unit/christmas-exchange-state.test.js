import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

import {
  XMAS_EVENT,
  formatRevealLabel,
  useXmasExchange,
} from '../../src/views/ChristmasGiftTree/composables/useXmasExchange.js';

/** 在 effectScope 里挂一个实例：scope.stop() 会触发 onScopeDispose，定时器不会漏 */
function mountExchange() {
  const scope = effectScope();
  const api = scope.run(() => useXmasExchange());
  return { api, stop: () => scope.stop() };
}

const flush = (ms) => vi.advanceTimersByTimeAsync(ms);

describe('christmas gift exchange state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 固定在活动开始前：join 里有截止时间校验，跑测试那天不能已经过了 12/20
    vi.setSystemTime(new Date('2026-11-23T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle with a roster but nobody joined yet', () => {
    const { api, stop } = mountExchange();
    expect(api.phase.value).toBe('idle');
    expect(api.isSignedUp.value).toBe(false);
    expect(api.roster.value.length).toBeGreaterThan(0);
    stop();
  });

  it('joins: adds me, turns the phase, and opens a slot', async () => {
    const { api, stop } = mountExchange();
    const before = api.roster.value.length;

    const pending = api.join();
    await flush(300);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(api.phase.value).toBe('joined');
    expect(api.isSignedUp.value).toBe(true);
    expect(api.roster.value).toHaveLength(before + 1);
    expect(api.roster.value.at(-1).isSelf).toBe(true);
    expect(api.slotCount.value).toBe(before + 1);
    stop();
  });

  it('does not double-join on repeated clicks', async () => {
    const { api, stop } = mountExchange();
    const first = api.join();
    await flush(300);
    await first;

    const second = api.join();
    await flush(300);
    const result = await second;

    expect(result.ok).toBe(false);
    expect(api.roster.value.filter((person) => person.isSelf)).toHaveLength(1);
    stop();
  });

  it('leaves: removes me but keeps the slot count so nobody else shifts', async () => {
    const { api, stop } = mountExchange();
    const before = api.roster.value.length;

    const joining = api.join();
    await flush(300);
    await joining;
    const joinedSlots = api.slotCount.value;

    const leaving = api.leave();
    await flush(300);
    const result = await leaving;

    expect(result.ok).toBe(true);
    expect(api.phase.value).toBe('idle');
    expect(api.roster.value).toHaveLength(before);
    // 关键：挂位数不回收 —— 回收的话后面所有人会整体往上挪一格
    expect(api.slotCount.value).toBe(joinedSlots);
    stop();
  });

  it('rejects a leave when not joined', async () => {
    const { api, stop } = mountExchange();
    const result = await api.leave();
    expect(result.ok).toBe(false);
    expect(api.phase.value).toBe('idle');
    stop();
  });

  it('refuses to join after the signup deadline', async () => {
    const { api, stop } = mountExchange();
    vi.setSystemTime(new Date(XMAS_EVENT.signupDeadline).getTime() + 1000);

    const pending = api.join();
    await flush(300);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('deadline');
    expect(api.error.value).toContain('截止');
    stop();
  });

  it('counts down to the reveal moment and stops at zero', () => {
    const { api, stop } = mountExchange();
    expect(api.remainingMs.value).toBeGreaterThan(0);
    expect(api.countdownText.value).toMatch(/\d/);

    vi.setSystemTime(new Date(XMAS_EVENT.revealAt).getTime() + 5000);
    vi.advanceTimersByTime(1500);

    expect(api.remainingMs.value).toBe(0);
    expect(api.countdownText.value).toBe('已揭晓');
    expect(api.isRevealed.value).toBe(true);
    stop();
  });

  it('formats the reveal label in Chinese month/day form', () => {
    expect(formatRevealLabel()).toContain('12 月 20 日');
    expect(formatRevealLabel()).toMatch(/\d{2}:\d{2}/);
  });
});
