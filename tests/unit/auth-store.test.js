import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// ============================================================
// Mock 外部依赖
// ============================================================
vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

// Mock supabase 动态导入
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    refreshSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: null } })),
    signOut: vi.fn()
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(),
        single: vi.fn()
      })),
    })),
    insert: vi.fn(),
    update: vi.fn(() => ({
      eq: vi.fn()
    }))
  })),
  removeChannel: vi.fn()
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
  invalidateByTags: vi.fn()
}));

// Mock notification store
const mockNotificationReset = vi.fn();
vi.mock('@/stores/notifications', () => ({
  useNotificationStore: () => ({ resetState: mockNotificationReset })
}));

// Mock bag store
const mockBagReset = vi.fn();
vi.mock('@/stores/bag', () => ({
  useBagStore: () => ({ resetState: mockBagReset })
}));

// Mock products store
const mockProductsReset = vi.fn();
vi.mock('@/stores/products', () => ({
  useProductsStore: () => ({ resetState: mockProductsReset })
}));

import { useAuthStore } from '@/stores/auth';

// ============================================================
// 辅助函数
// ============================================================
function createStore() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return useAuthStore();
}

function mockLoggedInSession() {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: {
      session: {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          user_metadata: { username: 'TestUser' }
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }
    },
    error: null
  });

  mockSupabase.from.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'user-123',
            username: 'TestUser',
            role: 'user',
            points: 100,
            join_date: '2024-01-01',
            bio: 'Hello',
            experience: 50,
            is_boh_creator: false,
            creator_platform_ids: {},
            creator_platform_visibility: {},
            creator_platform_order: [],
            showcase_post_ids: []
          },
          error: null
        })
      }))
    }))
  });
}

// ============================================================
// 测试用例
// ============================================================

describe('auth store', () => {
  let store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore();
  });

  // --- 初始状态 ---
  describe('initial state', () => {
    it('isLoggedIn defaults to false', () => {
      expect(store.isLoggedIn).toBe(false);
    });

    it('isInitialized defaults to false', () => {
      expect(store.isInitialized).toBe(false);
    });

    it('isAdmin is false when role is user', () => {
      expect(store.isAdmin).toBe(false);
    });

    it('userInfo has default empty values', () => {
      expect(store.userInfo.id).toBe('');
      expect(store.userInfo.username).toBe('');
      expect(store.userInfo.email).toBe('');
      expect(store.userInfo.role).toBe('user');
      expect(store.userInfo.points).toBe(0);
      expect(store.userInfo.tags).toEqual([]);
      expect(store.userInfo.isBohCreator).toBe(false);
      expect(store.userInfo.creatorPlatformIds).toEqual({});
      expect(store.userInfo.creatorPlatformVisibility).toEqual({});
      expect(store.userInfo.creatorPlatformOrder).toEqual([]);
      expect(store.userInfo.showcasePostIds).toEqual([]);
    });
  });

  // --- isAdmin computed ---
  describe('isAdmin', () => {
    it('returns true when role is admin', () => {
      // isAdmin 含初始化门控：store 未初始化时一律返回 false
      store.isInitialized = true;
      store.userInfo.role = 'admin';
      expect(store.isAdmin).toBe(true);
    });

    it('returns false for non-admin roles', () => {
      store.userInfo.role = 'moderator';
      expect(store.isAdmin).toBe(false);

      store.userInfo.role = 'user';
      expect(store.isAdmin).toBe(false);
    });

    it('handles whitespace in role', () => {
      store.isInitialized = true;
      store.userInfo.role = '  admin  ';
      expect(store.isAdmin).toBe(true);
    });
  });

  // --- deductPoints ---
  describe('deductPoints', () => {
    it('deducts points when balance is sufficient', () => {
      store.userInfo.points = 100;
      const result = store.deductPoints(30);
      expect(result).toBe(true);
      expect(store.userInfo.points).toBe(70);
    });

    it('returns false when balance is insufficient', () => {
      store.userInfo.points = 20;
      const result = store.deductPoints(30);
      expect(result).toBe(false);
      expect(store.userInfo.points).toBe(20);
    });

    it('deducts exactly to zero', () => {
      store.userInfo.points = 50;
      const result = store.deductPoints(50);
      expect(result).toBe(true);
      expect(store.userInfo.points).toBe(0);
    });
  });

  // --- resetState ---
  describe('resetState', () => {
    it('sets isLoggedIn to false', () => {
      store.isLoggedIn = true;
      store.resetState();
      expect(store.isLoggedIn).toBe(false);
    });

    it('clears all userInfo fields', () => {
      store.userInfo.id = 'u1';
      store.userInfo.username = 'test';
      store.userInfo.email = 'test@test.com';
      store.userInfo.role = 'admin';
      store.userInfo.points = 999;
      store.userInfo.tags = ['tag1'];
      store.userInfo.isBohCreator = true;
      store.userInfo.creatorPlatformIds = { bilibili: '123' };
      store.userInfo.creatorPlatformVisibility = { bilibili: 'public' };
      store.userInfo.creatorPlatformOrder = ['bilibili'];
      store.userInfo.showcasePostIds = ['abc-123'];

      store.resetState();

      expect(store.userInfo.id).toBe('');
      expect(store.userInfo.username).toBe('');
      expect(store.userInfo.email).toBe('');
      expect(store.userInfo.role).toBe('user');
      expect(store.userInfo.points).toBe(0);
      expect(store.userInfo.tags).toEqual([]);
      expect(store.userInfo.isBohCreator).toBe(false);
      expect(store.userInfo.creatorPlatformIds).toEqual({});
      expect(store.userInfo.creatorPlatformVisibility).toEqual({});
      expect(store.userInfo.creatorPlatformOrder).toEqual([]);
      expect(store.userInfo.showcasePostIds).toEqual([]);
    });

    it('calls resetState on dependent stores', async () => {
      await store.resetState();
      expect(mockNotificationReset).toHaveBeenCalled();
      expect(mockBagReset).toHaveBeenCalled();
      expect(mockProductsReset).toHaveBeenCalled();
    });

    // BUG-U5: resetState should await dependent store cleanup properly
    it('awaits dependent store cleanup and catches errors (BUG-U5)', async () => {
      mockNotificationReset.mockRejectedValueOnce(new Error('cleanup failed'));
      mockBagReset.mockRejectedValueOnce(new Error('bag cleanup failed'));

      await expect(store.resetState()).resolves.toBeUndefined();
      expect(mockNotificationReset).toHaveBeenCalled();
      expect(mockBagReset).toHaveBeenCalled();
    });
  });

  // --- shouldRefreshSoon (通过 session 行为间接测试) ---
  describe('session refresh logic', () => {
    it('does not refresh when session is far from expiry', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'u1', email: 'test@test.com', user_metadata: {} },
            expires_at: Math.floor(Date.now() / 1000) + 7200 // 2 hours
          }
        },
        error: null
      });

      // refreshSession 不应被调用
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      await store.syncAuthState({ reason: 'test', force: false });
      // 会话未过期时不应调用 refreshSession
      expect(mockSupabase.auth.refreshSession).not.toHaveBeenCalled();
    });

    it('refreshes session when near expiry', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'u1', email: 'test@test.com', user_metadata: {} },
            expires_at: Math.floor(Date.now() / 1000) + 60 // 1 minute left
          }
        },
        error: null
      });

      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'u1', email: 'test@test.com', user_metadata: {} },
            expires_at: Math.floor(Date.now() / 1000) + 7200
          }
        },
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'u1',
                username: 'Tester',
                role: 'user',
                points: 0,
                join_date: '',
                bio: '',
                experience: 0,
                is_boh_creator: false,
                creator_platform_ids: {},
                creator_platform_visibility: {},
                creator_platform_order: [],
                showcase_post_ids: []
              },
              error: null
            })
          }))
        }))
      });

      await store.syncAuthState({ reason: 'test', force: false });
      expect(mockSupabase.auth.refreshSession).toHaveBeenCalled();
    });
  });

  // --- isAuthSessionMissingError ---
  describe('error detection', () => {
    it('detects AuthSessionMissingError by code', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { code: 'AUTH_SESSION_MISSING', message: 'Auth session missing' }
      });

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { code: 'AUTH_SESSION_MISSING', message: 'Auth session missing' }
      });

      // syncAuthState 遇到 AUTH_SESSION_MISSING 时应调用 resetState
      await store.syncAuthState({ reason: 'test', force: false });
      expect(store.isLoggedIn).toBe(false);
    });
  });

  // --- updateUserProfile ---
  describe('updateUserProfile', () => {
    it('returns error when user is not logged in', async () => {
      const result = await store.updateUserProfile({ username: 'new' });
      expect(result.success).toBe(false);
      expect(result.message).toBe('用户未登录');
    });

    it('normalizes creator platform IDs on update', async () => {
      store.userInfo.id = 'user-123';

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-123',
                username: 'TestUser',
                role: 'user',
                points: 100,
                join_date: '2024-01-01',
                bio: 'test',
                experience: 0,
                is_boh_creator: true,
                creator_platform_ids: { bilibili: '12345', douyin: 'hello' },
                creator_platform_visibility: { bilibili: 'public', douyin: 'public' },
                creator_platform_order: ['bilibili', 'douyin'],
                showcase_post_ids: []
              },
              error: null
            })
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null })
        }))
      });

      const result = await store.updateUserProfile({
        creator_platform_ids: { bilibili: '  12345  ', douyin: 'hello', xiaohongshu: '' }
      });

      expect(result.success).toBe(true);
      expect(store.userInfo.isBohCreator).toBe(true);
      expect(store.userInfo.creatorPlatformIds.bilibili).toBe('12345');
    });
  });

  // --- deleteAccount ---
  describe('deleteAccount', () => {
    it('rejects short passwords', async () => {
      const result = await store.deleteAccount('12345');
      expect(result.success).toBe(false);
      expect(result.message).toContain('至少 6 位');
    });

    it('accepts valid password length', async () => {
      // 模拟 deleteMyAccount 成功
      const { deleteMyAccount } = await import('@/utils/auth.js');
      deleteMyAccount.mockResolvedValue({
        ok: true,
        error: null,
        data: { message: '账号已注销' }
      });

      store.userInfo.id = 'user-123';
      const result = await store.deleteAccount('123456');
      expect(result.success).toBe(true);
    });
  });

  // --- login ---
  describe('login', () => {
    it('rejects empty login ID', async () => {
      const result = await store.login('', 'password');
      expect(result.success).toBe(false);
      expect(result.message).toContain('方块 ID 或邮箱');
    });

    it('rejects whitespace-only login ID', async () => {
      const result = await store.login('   ', 'password');
      expect(result.success).toBe(false);
      expect(result.message).toContain('方块 ID 或邮箱');
    });

    it('handles login error from API', async () => {
      const { signIn } = await import('@/utils/auth.js');
      signIn.mockResolvedValue({
        data: null,
        error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }
      });

      const result = await store.login('testuser', 'wrongpass');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid credentials');
      expect(result.code).toBe('INVALID_CREDENTIALS');
    });

    // BUG-U1: login no longer accepts unused _verificationPayload / _deviceIdHash
    it('works without extra verification/device params (BUG-U1)', async () => {
      const { signIn } = await import('@/utils/auth.js');
      signIn.mockResolvedValue({
        data: { user: { id: 'u1', email: 't@t.com', user_metadata: { username: 't' } }, session: { user: { id: 'u1' } } },
        error: null
      });

      const result = await store.login('testuser', 'pass', false);
      expect(result.success).toBe(true);
    });
  });

  // --- resetPassword ---
  describe('resetPassword', () => {
    it('handles API error', async () => {
      const { resetPassword: mockResetPassword } = await import('@/utils/auth.js');
      mockResetPassword.mockResolvedValue({
        data: null,
        error: { message: 'User not found' }
      });

      const result = await store.resetPassword('nobody@test.com');
      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found');
    });

    it('returns success message', async () => {
      const { resetPassword: mockResetPassword } = await import('@/utils/auth.js');
      mockResetPassword.mockResolvedValue({
        data: {},
        error: null
      });

      const result = await store.resetPassword('test@test.com');
      expect(result.success).toBe(true);
      expect(result.message).toContain('重置链接');
    });
  });

  // --- verifyPasswordRecovery ---
  describe('verifyPasswordRecovery', () => {
    it('handles invalid token', async () => {
      const { verifyPasswordRecovery: mockVerify } = await import('@/utils/auth.js');
      mockVerify.mockResolvedValue({
        data: null,
        error: { message: 'Invalid token' }
      });

      const result = await store.verifyPasswordRecovery('bad-token');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid token');
    });
  });

  // --- updatePassword ---
  describe('updatePassword', () => {
    it('returns success on password update', async () => {
      const { updatePassword: mockUpdatePass } = await import('@/utils/auth.js');
      mockUpdatePass.mockResolvedValue({
        data: {},
        error: null
      });

      const result = await store.updatePassword('newpass123');
      expect(result.success).toBe(true);
      expect(result.message).toContain('密码更新成功');
    });
  });

  // --- logout ---
  describe('logout', () => {
    it('calls signOut and resets state', async () => {
      const { signOut: mockSignOut } = await import('@/utils/auth.js');
      mockSignOut.mockResolvedValue({ error: null });

      store.isLoggedIn = true;
      store.userInfo.id = 'user-123';
      store.userInfo.username = 'test';

      await store.logout();

      expect(mockSignOut).toHaveBeenCalled();
      expect(store.isLoggedIn).toBe(false);
      expect(store.userInfo.id).toBe('');
    });

    it('resets state even if signOut fails', async () => {
      const { signOut: mockSignOut } = await import('@/utils/auth.js');
      mockSignOut.mockRejectedValue(new Error('Network error'));

      store.isLoggedIn = true;
      store.userInfo.id = 'user-123';

      await store.logout();

      expect(store.isLoggedIn).toBe(false);
      expect(store.userInfo.id).toBe('');
    });
  });

  // --- ensureAdminAccess ---
  describe('ensureAdminAccess', () => {
    it('returns true immediately if already admin', async () => {
      store.isInitialized = true;
      store.userInfo.role = 'admin';
      const result = await store.ensureAdminAccess();
      expect(result).toBe(true);
    });

    it('returns false when user is not admin', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      });

      store.userInfo.role = 'user';
      // 没有登录，refreshCurrentUserProfile 会清空状态
      const result = await store.ensureAdminAccess();
      // 因为用户未登录，updateLocalState(null) 会设置 role 为 'user'
      // 所以 ensureAdminAccess 刷新后还是会返回 false
      expect(result).toBe(false);
    });
  });

  // --- lastTokenRefresh ---
  describe('lastTokenRefresh', () => {
    it('is null initially', () => {
      expect(store.lastTokenRefresh).toBeNull();
    });
  });

  // --- showLoginModal ---
  describe('showLoginModal', () => {
    it('defaults to false', () => {
      expect(store.showLoginModal).toBe(false);
    });

    it('can be toggled', () => {
      store.showLoginModal = true;
      expect(store.showLoginModal).toBe(true);
    });
  });
});