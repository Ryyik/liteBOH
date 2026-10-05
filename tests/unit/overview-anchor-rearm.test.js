import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// ============================================================
// 「上次在线」锚点必须跟着「访问边界」重取（2026-10-05）
//
// 报障：用户隔三差五上线，智能概览的「上次在线」却一直是 9月22日。
// 根因不在写库（线上 RPC / ACL 已实测正常，DB 里 last_active_at 已是当天），而在锚点：
// `offlineAnchorAt` 原先是「每个实例只取一次」（`if (!offlineAnchorAt.value)`），而长生命周期
// 实例（PWA / 从不刷新的标签页）实测能挂两周以上 —— 实例不重建就永远不重取，展示的
// 「上次在线」于是被冻在实例启动那一刻。本文件锁住「跨过访问边界必须重取」。
//
// 测试环境是 node（见 vitest.config.js），没有 window/document：这里按 tests/setup.js 提供
// localStorage 的同款手法，手搭最小 window/document 替身，只为驱动 visibilitychange 生命周期。
// ============================================================

vi.mock('@/utils/logger.js', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    refreshSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: null } })),
    signOut: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
  removeChannel: vi.fn(),
};

vi.mock('@/utils/auth.js', () => ({
  supabase: mockSupabase,
  signIn: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  verifyPasswordRecovery: vi.fn(),
  updatePassword: vi.fn(),
  deleteMyAccount: vi.fn(),
  getCurrentUser: vi.fn(),
  getUserNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  subscribeToNotifications: vi.fn(),
  invalidateByTags: vi.fn(),
  signInWithPasskey: vi.fn(),
  toPasskeyLoginMessage: vi.fn((e) => e?.message || ''),
}));

vi.mock('@/stores/notifications', () => ({
  useNotificationStore: () => ({ resetState: vi.fn() }),
}));
vi.mock('@/stores/bag', () => ({ useBagStore: () => ({ resetState: vi.fn() }) }));
vi.mock('@/stores/products', () => ({ useProductsStore: () => ({ resetState: vi.fn() }) }));

import { useAuthStore } from '@/stores/auth';
import { logger } from '@/utils/logger.js';

const USER_ID = 'user-anchor-rearm';
// DB 里躺着的旧活跃时间（= 实例启动时读到的「上次在线」）
const OLD_DB_LAST_ACTIVE = '2026-09-20T10:00:00.000Z';
const MINUTE = 60 * 1000;

let visibilityState = 'visible';
let lifecycleListeners = new Map();
// DB 侧的可变副本：profile 读取与 update_last_active_at 都读写它，
// 否则「读回来永远是最初那个旧值」会把重取锚点污染成旧值，测不到真实语义
let dbLastActive = OLD_DB_LAST_ACTIVE;

/** 最小 window 替身：store 只用它注册/注销生命周期监听 */
function installBrowserShim() {
  lifecycleListeners = new Map();
  globalThis.window = {
    addEventListener: (type, handler) => {
      if (!lifecycleListeners.has(type)) lifecycleListeners.set(type, []);
      lifecycleListeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
      const list = lifecycleListeners.get(type) || [];
      lifecycleListeners.set(
        type,
        list.filter((h) => h !== handler),
      );
    },
  };
  globalThis.document = {
    get visibilityState() {
      return visibilityState;
    },
  };
}

/** 切换可见性并抛出 visibilitychange（顺序与真实浏览器一致：先改状态再派发） */
function toggleVisibility(next) {
  visibilityState = next;
  for (const handler of lifecycleListeners.get('visibilitychange') || []) {
    handler({ type: 'visibilitychange' });
  }
}

function installSessionAndProfile({ lastActiveAt = OLD_DB_LAST_ACTIVE } = {}) {
  dbLastActive = lastActiveAt;
  mockSupabase.auth.getSession.mockResolvedValue({
    data: {
      session: {
        user: { id: USER_ID, email: 'a@b.c', user_metadata: { username: 'Tester' } },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
    error: null,
  });
  const readProfile = () => ({
    id: USER_ID,
    username: 'Tester',
    role: 'user',
    last_active_at: dbLastActive,
  });
  mockSupabase.from.mockImplementation(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockImplementation(async () => ({ data: readProfile(), error: null })),
        single: vi.fn().mockImplementation(async () => ({ data: readProfile(), error: null })),
      })),
    })),
  }));
  mockSupabase.rpc.mockReset();
  mockSupabase.rpc.mockImplementation(async (name) => {
    if (name === 'update_last_active_at') {
      dbLastActive = new Date().toISOString();
      return { data: dbLastActive, error: null };
    }
    return { data: null, error: null };
  });
}

/** 排空 updateOnlineStatus / syncAuthState 这类 void 异步尾随（fake timers 下不能用 waitFor） */
async function flushAsync() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(2);
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

async function createBootedStore() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAuthStore();
  await store.initLoginState();
  await flushAsync();
  return store;
}

const lastActiveWriteCalls = () =>
  mockSupabase.rpc.mock.calls.filter((c) => c[0] === 'update_last_active_at').length;

describe('auth store: 「上次在线」锚点跨访问边界重取（2026-10-05）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0)); // 本机时区 2026-10-05 12:00
    visibilityState = 'visible';
    installBrowserShim();
    installSessionAndProfile();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.window;
    delete globalThis.document;
  });

  it('实例首次加载：锚点取 DB 旧值（回归基线，重取逻辑不改变首帧行为）', async () => {
    const store = await createBootedStore();

    expect(store.offlineAnchorAt).toBe(OLD_DB_LAST_ACTIVE);
    expect(lastActiveWriteCalls()).toBeGreaterThan(0);
    // 写库成功后本地镜像前进，锚点不动
    expect(store.userInfo.lastActiveAt).not.toBe(OLD_DB_LAST_ACTIVE);
  });

  it('离开三天后回到页面（实例没重建）：锚点重取为「上次离开的时刻」，不再冻在旧日期', async () => {
    const store = await createBootedStore();
    const leftAt = store.userInfo.lastActiveAt; // 上一段在线结束的时刻（写库成功后的本地镜像）
    expect(store.offlineAnchorAt).toBe(OLD_DB_LAST_ACTIVE);

    // 切走（短于补写去抖窗口 → 不补写）
    toggleVisibility('hidden');
    await flushAsync();

    // 实例被冻结三天：只让时钟前进、不跑定时器（真实冻结的定时器不会开火，心跳一次都不写）
    vi.setSystemTime(new Date(Date.now() + 3 * 24 * 60 * MINUTE));
    toggleVisibility('visible');
    await flushAsync();

    // 锚点 = 上次离开的时刻（不是实例启动时的旧值，也不是「刚刚」）
    expect(store.offlineAnchorAt).toBe(leftAt);
    expect(store.offlineAnchorAt).not.toBe(OLD_DB_LAST_ACTIVE);
    expect(store.offlineAnchorAt).not.toBe(store.userInfo.lastActiveAt);
  });

  it('只切走十分钟（没跨过访问边界）：锚点保持不动，不被心跳噪音顶成「刚刚」', async () => {
    const store = await createBootedStore();

    toggleVisibility('hidden');
    await flushAsync();
    vi.setSystemTime(new Date(Date.now() + 10 * MINUTE));
    toggleVisibility('visible');
    await flushAsync();

    expect(store.offlineAnchorAt).toBe(OLD_DB_LAST_ACTIVE);
  });

  it('实例一直挂着过了本机零点：锚点跟着翻页重取（不必等实例重建）', async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 23, 50, 0)); // 本机 23:50
    const store = await createBootedStore();
    const bootWriteMs = new Date(store.userInfo.lastActiveAt).getTime();
    expect(store.offlineAnchorAt).toBe(OLD_DB_LAST_ACTIVE);

    // 心跳每 2 分钟一次，跨过本机零点后再走一段
    await vi.advanceTimersByTimeAsync(25 * MINUTE);
    await flushAsync();

    const anchorMs = new Date(store.offlineAnchorAt).getTime();
    expect(store.offlineAnchorAt).not.toBe(OLD_DB_LAST_ACTIVE);
    // 重取到「翻页前最后一次心跳」那一刻：不早于启动写库、早于翻页后的写入
    expect(anchorMs).toBeGreaterThanOrEqual(bootWriteMs);
    expect(anchorMs).toBeLessThan(new Date(store.userInfo.lastActiveAt).getTime());
  });

  // 重取判据在首帧必然为真（anchorDayKey 还是空串），所以「重取」不能把首次登录的
  // 合成 7 天锚点吞掉：全新账号 DB 无 last_active_at，若按 rearm 直接 return，
  // 锚点会一直为 null，而首帧那次 RPC 已把 DB 写成 now ⇒ 概览窗口塌成 0、文案错档。
  it('全新账号（DB 无 last_active_at）：首帧仍拿到合成 7 天锚点并标记首次登录', async () => {
    installSessionAndProfile({ lastActiveAt: null });

    const store = await createBootedStore();

    expect(store.offlineAnchorAt).toBeTruthy();
    expect(store.isFirstLoginSession).toBe(true);
    const expected = Date.now() - 7 * 24 * 60 * MINUTE;
    expect(Math.abs(new Date(store.offlineAnchorAt).getTime() - expected)).toBeLessThan(5000);
    expect(lastActiveWriteCalls()).toBeGreaterThan(0);
  });

  // 第二条腿：supabase-js 的 rpc() 在服务端报错时**不抛异常**，而是 resolve 出 { error }。
  // 不判 error 就会把失败当成功 —— 本地镜像被顶成「刚刚」、写库节流也被推进，
  // 于是「DB 陈旧」这件事在客户端完全无声（用户天天上线、上次在线仍停在三周前的帮凶）。
  it('写库失败（rpc resolve 出 error）：本地镜像不前进、失败有声、下一次心跳补写', async () => {
    mockSupabase.rpc.mockImplementation(async () => ({
      data: null,
      error: { code: '42501', message: 'permission denied for function update_last_active_at' },
    }));

    const store = await createBootedStore();

    expect(store.offlineAnchorAt).toBe(OLD_DB_LAST_ACTIVE);
    // 失败不得被当成成功：本地镜像必须停在 DB 真值上（旧代码会顶成「刚刚」）
    expect(store.userInfo.lastActiveAt).toBe(OLD_DB_LAST_ACTIVE);
    expect(logger.warn).toHaveBeenCalledWith(
      'auth-store',
      expect.stringContaining('update_last_active_at'),
      expect.anything(),
    );

    // 恢复写库：下一次心跳（2 分钟）自动补写，本地镜像与 DB 一起前进
    mockSupabase.rpc.mockImplementation(async (name) => {
      if (name === 'update_last_active_at') {
        dbLastActive = new Date().toISOString();
        return { data: dbLastActive, error: null };
      }
      return { data: null, error: null };
    });
    await vi.advanceTimersByTimeAsync(2 * MINUTE + 100);
    await flushAsync();

    expect(store.userInfo.lastActiveAt).not.toBe(OLD_DB_LAST_ACTIVE);
    expect(dbLastActive).not.toBe(OLD_DB_LAST_ACTIVE);
  });
});
