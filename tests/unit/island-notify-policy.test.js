import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ISLAND_NOTIFY_POLICY,
  admitIslandNotification,
  islandNotifyGapMs,
  isIslandCriticalItem,
  isIslandOnboardingItem,
  noteIslandNotificationShown,
  pushWithIslandQueueCap,
  resetIslandNotifyPolicy,
} from '../../src/utils/island-notify-policy.js';

const makeItem = (extra = {}) => ({
  title: '标题',
  message: '正文',
  icon: 'success',
  kind: '',
  durationMs: 4200,
  ...extra,
});

describe('island-notify-policy', () => {
  beforeEach(() => {
    resetIslandNotifyPolicy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('识别引导类与关键类', () => {
    expect(isIslandOnboardingItem(makeItem({ kind: 'onboarding' }))).toBe(true);
    expect(isIslandOnboardingItem(makeItem())).toBe(false);

    expect(isIslandCriticalItem(makeItem({ kind: 'error' }))).toBe(true);
    expect(isIslandCriticalItem(makeItem({ icon: 'error' }))).toBe(true);
    expect(isIslandCriticalItem(makeItem({ tone: 'danger' }))).toBe(true);
    expect(isIslandCriticalItem(makeItem())).toBe(false);
  });

  it('队列满时优先淘汰引导类，其次普通类，最后才动关键类', () => {
    const onboarding = makeItem({ title: '教学', kind: 'onboarding' });
    const normal = makeItem({ title: '普通' });
    const critical = makeItem({ title: '失败', kind: 'error' });
    const queue = [normal, onboarding, critical];

    const dropped = pushWithIslandQueueCap(queue, makeItem({ title: '新来的' }));

    expect(dropped).toHaveLength(1);
    expect(dropped[0].title).toBe('教学');
    expect(queue).toHaveLength(ISLAND_NOTIFY_POLICY.maxQueue);
    expect(queue.map((it) => it.title)).not.toContain('教学');
    expect(queue.map((it) => it.title)).toContain('失败');
  });

  it('队列里全是关键类时仍守上限，只丢最旧的那条', () => {
    const queue = [
      makeItem({ title: '失败1', kind: 'error' }),
      makeItem({ title: '失败2', kind: 'error' }),
      makeItem({ title: '失败3', kind: 'error' }),
    ];

    const dropped = pushWithIslandQueueCap(queue, makeItem({ title: '失败4', kind: 'error' }));

    expect(dropped.map((it) => it.title)).toEqual(['失败1']);
    expect(queue.map((it) => it.title)).toEqual(['失败2', '失败3', '失败4']);
  });

  it('引导类每个会话只有一条配额，刷新重置后恢复', () => {
    const onboarding = makeItem({ kind: 'onboarding' });
    expect(admitIslandNotification(onboarding).admit).toBe(true);

    noteIslandNotificationShown(onboarding);
    const second = admitIslandNotification(onboarding);
    expect(second.admit).toBe(false);
    expect(second.reason).toBe('onboarding-quota');

    resetIslandNotifyPolicy();
    expect(admitIslandNotification(onboarding).admit).toBe(true);
  });

  it('关键类不受引导配额限制', () => {
    noteIslandNotificationShown(makeItem({ kind: 'onboarding' }));
    const verdict = admitIslandNotification(makeItem({ kind: 'error' }));
    expect(verdict.admit).toBe(true);
    expect(verdict.reason).toBe('critical');
  });

  it('排队超上限时拒收（当前正在展示的那条不占长度）', () => {
    const full = { busy: true, queueLength: ISLAND_NOTIFY_POLICY.maxQueue };
    expect(admitIslandNotification(makeItem(), full).reason).toBe('queue-full');
    // 空闲时同样的队列长度不构成拦截
    expect(admitIslandNotification(makeItem(), { busy: false, queueLength: 99 }).admit).toBe(true);
  });

  it('间隔按「上一条展示时刻」计算剩余毫秒', () => {
    noteIslandNotificationShown(makeItem(), { now: 1000 });

    expect(islandNotifyGapMs(1000)).toBe(ISLAND_NOTIFY_POLICY.minGapMs);
    expect(islandNotifyGapMs(1600)).toBe(ISLAND_NOTIFY_POLICY.minGapMs - 600);
    expect(islandNotifyGapMs(1000 + ISLAND_NOTIFY_POLICY.minGapMs)).toBe(0);
    expect(islandNotifyGapMs(999999)).toBe(0);
  });

  it('首条通知不受间隔限制', () => {
    expect(islandNotifyGapMs(1)).toBe(0);
  });

  it('旁路开关打开后全部放行，且不再排队计数', () => {
    vi.stubGlobal('window', { __BOH_ISLAND_POLICY_OFF__: true });

    const onboarding = makeItem({ kind: 'onboarding' });
    noteIslandNotificationShown(onboarding, { now: 1000 });
    noteIslandNotificationShown(onboarding, { now: 1100 });

    expect(admitIslandNotification(onboarding).reason).toBe('bypass');
    expect(islandNotifyGapMs(1100)).toBe(0);

    const queue = [makeItem(), makeItem(), makeItem()];
    const dropped = pushWithIslandQueueCap(queue, makeItem());
    expect(dropped).toEqual([]);
    expect(queue).toHaveLength(4);
  });
});
