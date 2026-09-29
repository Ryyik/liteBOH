import { beforeEach, describe, expect, it, vi } from 'vitest';

const testMocks = vi.hoisted(() => ({
  authStore: {
    userInfo: { id: 'user-anchor-1', username: 'Tester' },
    isLoggedIn: true,
    offlineAnchorAt: null,
    initLoginState: vi.fn().mockResolvedValue(undefined),
  },
  fetchOfflineOverview: vi.fn(),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => testMocks.authStore,
}));

vi.mock('@/utils/api/overview-api.js', () => ({
  fetchOfflineOverview: testMocks.fetchOfflineOverview,
  OVERVIEW_DEFAULT_LIMIT: 20,
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useOfflineOverview } from '@/composables/useOfflineOverview.js';

// 服务端行为模拟：get_offline_overview 会把「实际使用的窗口起点」原样回显在 result.anchor
const mockOverviewResponse = ({ anchor, anchorSource }) =>
  testMocks.fetchOfflineOverview.mockImplementation(async ({ anchor: queryAnchor }) => ({
    anchor: anchor ?? queryAnchor,
    anchorSource,
    isFirstLogin: false,
    serverTime: new Date().toISOString(),
    total: 0,
    hasMore: false,
    items: [],
  }));

// 用户每例换 id，触发 composable 的 resetForUserChange（模块级单例状态不跨用例泄漏）
let userSeq = 0;

describe('useOfflineOverview：展示锚点与查询窗口解耦（2026-09-29）', () => {
  let overview;

  beforeEach(() => {
    vi.clearAllMocks();
    testMocks.authStore.initLoginState.mockResolvedValue(undefined);
    testMocks.authStore.isLoggedIn = true;
    testMocks.authStore.userInfo = { id: `user-anchor-${++userSeq}`, username: 'Tester' };
    overview = useOfflineOverview();
  });

  it('同日回访：查询传当日零点（钳制），展示用真实「上次在线」——不再把窗口起点当上次在线', async () => {
    const todayTen = new Date();
    todayTen.setHours(10, 0, 0, 0); // 今天 10:00，必然 > 当日零点 → 会被钳到零点
    const rawAnchor = todayTen.toISOString();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    testMocks.authStore.offlineAnchorAt = rawAnchor;
    mockOverviewResponse({ anchor: midnight.toISOString(), anchorSource: 'clamped' });

    await overview.load();

    expect(testMocks.fetchOfflineOverview).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: midnight.toISOString() }),
    );
    expect(overview.anchorTime.value).toBe(rawAnchor);
    expect(overview.windowAnchorTime.value).toBe(midnight.toISOString());
    expect(overview.anchorSource.value).toBe('clamped');
  });

  it('多日离线：锚点早于当日零点，不钳制——查询与展示同为真实上次在线', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    testMocks.authStore.offlineAnchorAt = threeDaysAgo;
    mockOverviewResponse({ anchor: threeDaysAgo, anchorSource: 'profile' });

    await overview.load();

    expect(testMocks.fetchOfflineOverview).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: threeDaysAgo }),
    );
    expect(overview.anchorTime.value).toBe(threeDaysAgo);
    expect(overview.windowAnchorTime.value).toBe(threeDaysAgo);
  });

  it('会话锚点缺失：展示回落服务端回显，不空转', async () => {
    const echoed = new Date(Date.now() - 86400000).toISOString();
    testMocks.authStore.offlineAnchorAt = null;
    mockOverviewResponse({ anchor: echoed, anchorSource: 'profile' });

    await overview.load();

    expect(overview.anchorTime.value).toBe(echoed);
    expect(overview.windowAnchorTime.value).toBe(echoed);
  });

  it('离线天数按真实锚点计算：同日回访为 0 天，多日离线 ≥ 1 天', async () => {
    const todayTen = new Date();
    todayTen.setHours(10, 0, 0, 0);
    testMocks.authStore.offlineAnchorAt = todayTen.toISOString();
    mockOverviewResponse({ anchorSource: 'clamped' });
    await overview.load();
    expect(overview.offlineDays.value).toBe(0);

    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
    testMocks.authStore.userInfo = { id: `user-anchor-${++userSeq}`, username: 'Tester' };
    testMocks.authStore.offlineAnchorAt = fourDaysAgo;
    mockOverviewResponse({ anchorSource: 'profile' });
    await overview.load();
    expect(overview.offlineDays.value).toBeGreaterThanOrEqual(3);
  });
});
