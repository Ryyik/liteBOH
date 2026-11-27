import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, reactive, ref } from 'vue';

const mocks = vi.hoisted(() => ({
  getWeeklyCheckinStatus: vi.fn(),
  submitWeeklyCheckin: vi.fn(),
  preloadPointsCardAssets: vi.fn(),
}));

vi.mock('@/utils/api/forum-api.js', () => ({
  getWeeklyCheckinStatus: mocks.getWeeklyCheckinStatus,
  submitWeeklyCheckin: mocks.submitWeeklyCheckin,
}));
vi.mock('@/utils/points-card-assets.js', () => ({
  preloadPointsCardAssets: mocks.preloadPointsCardAssets,
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStore,
}));
vi.mock('@/utils/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const authStore = {
  isLoggedIn: ref(true),
  showLoginModal: ref(false),
  userInfo: reactive({
    id: 'user-1',
    points: 100,
    pointsCardSkin: 'blank',
    pointsCardImageUrl: '',
  }),
};

import { useWeeklyCheckin } from '@/views/Forum/composables/useWeeklyCheckin.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('weekly checkin async ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStore.isLoggedIn.value = true;
    authStore.userInfo.id = 'user-1';
    authStore.userInfo.points = 100;
    mocks.preloadPointsCardAssets.mockResolvedValue({ ready: true, failed: [], timedOut: false });
  });

  it('卡面预取期间切换账号，旧奖励舞台不得弹出', async () => {
    mocks.getWeeklyCheckinStatus.mockResolvedValueOnce({
      ok: true,
      data: { hasSignedThisWeek: false, currentPoints: 100 },
      error: null,
    });
    const assets = deferred();
    mocks.preloadPointsCardAssets.mockReturnValueOnce(assets.promise);
    mocks.submitWeeklyCheckin.mockResolvedValueOnce({
      ok: true,
      data: { hasSignedThisWeek: true, currentPoints: 130, pointsAwarded: 30 },
      error: null,
      alreadySigned: false,
    });
    const scope = effectScope();
    const api = scope.run(() => useWeeklyCheckin());
    await flush();

    api.handleCheckinClick();
    await flush();
    authStore.userInfo.id = 'user-2';
    authStore.userInfo.points = 7;
    assets.resolve({ ready: true, failed: [], timedOut: false });
    await flush();

    expect(api.checkinReward.value.open).toBe(false);
    scope.stop();
  });

  it('旧状态响应不能覆盖刚成功的签到结果', async () => {
    mocks.getWeeklyCheckinStatus.mockResolvedValueOnce({
      ok: true,
      data: { hasSignedThisWeek: false, currentPoints: 100 },
      error: null,
    });
    const scope = effectScope();
    const api = scope.run(() => useWeeklyCheckin());
    await flush();

    const oldStatus = deferred();
    mocks.getWeeklyCheckinStatus.mockReturnValueOnce(oldStatus.promise);
    mocks.submitWeeklyCheckin.mockResolvedValueOnce({
      ok: true,
      data: { hasSignedThisWeek: true, currentPoints: 130, pointsAwarded: 30 },
      error: null,
      alreadySigned: false,
    });

    api.handleCheckinClick();
    await flush();
    expect(api.weeklyCheckinStatus.value.hasSignedThisWeek).toBe(true);
    expect(api.weeklyCheckinStatus.value.currentPoints).toBe(130);

    oldStatus.resolve({
      ok: true,
      data: { hasSignedThisWeek: false, currentPoints: 100 },
      error: null,
    });
    await flush();

    expect(api.weeklyCheckinStatus.value.hasSignedThisWeek).toBe(true);
    expect(api.weeklyCheckinStatus.value.currentPoints).toBe(130);
    scope.stop();
  });
});
