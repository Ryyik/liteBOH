import { defineStore } from 'pinia';
import { computed, ref, reactive } from 'vue';
import { logger } from '@/utils/logger.js';
import type { UserInfo, LoginResult, AsyncOpResult } from '@/types';
import type * as AuthModule from '@/utils/auth.js';

const CREATOR_PLATFORM_KEYS = ['bilibili', 'xiaohongshu', 'douyin'];
const CREATOR_VISIBILITY_VALUES = new Set(['public', 'private']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const SESSION_HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;
const AUTH_SESSION_MISSING_ERROR_CODE = 'AUTH_SESSION_MISSING';

interface CreatorPlatformIds {
  [key: string]: string
}

type CreatorPlatformVisibility = Record<string, string>;

const normalizeCreatorPlatformIds = (raw: unknown): CreatorPlatformIds => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const normalized: CreatorPlatformIds = {};
  for (const key of CREATOR_PLATFORM_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[key] = trimmed.slice(0, 64);
  }
  return normalized;
};

const normalizeCreatorPlatformVisibility = (
  raw: unknown,
  availableKeys: string[] = CREATOR_PLATFORM_KEYS
): CreatorPlatformVisibility => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const normalized: CreatorPlatformVisibility = {};
  const keySet = new Set(availableKeys);
  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key)) continue;
    const value = String((raw as Record<string, unknown>)[key] || '').trim().toLowerCase();
    normalized[key] = CREATOR_VISIBILITY_VALUES.has(value) ? value : 'public';
  }
  return normalized;
};

const normalizeCreatorPlatformOrder = (
  raw: unknown,
  availableKeys: string[] = CREATOR_PLATFORM_KEYS
): string[] => {
  const base = Array.isArray(raw) ? raw as string[] : [];
  const keySet = new Set(availableKeys);
  const seen = new Set<string>();
  const order: string[] = [];

  for (const key of base) {
    const safeKey = String(key || '').trim();
    if (!CREATOR_PLATFORM_KEYS.includes(safeKey)) continue;
    if (!keySet.has(safeKey) || seen.has(safeKey)) continue;
    seen.add(safeKey);
    order.push(safeKey);
  }

  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key) || seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }
  return order;
};

const normalizeShowcasePostIds = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of list) {
    const id = String(item || '').trim();
    if (!id || seen.has(id) || !UUID_REGEX.test(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= 3) break;
  }
  return normalized;
};

let authApiPromise: Promise<typeof AuthModule> | null = null;
const loadAuthApi = async (): Promise<typeof AuthModule> => {
  if (!authApiPromise) {
    authApiPromise = import('@/utils/auth.js');
  }
  return authApiPromise;
};

let resetStoresPromise: Promise<any[]> | null = null;
const loadResetStores = async () => {
  if (!resetStoresPromise) {
    resetStoresPromise = Promise.all([
      import('@/stores/notifications'),
      import('@/stores/bag'),
      import('@/stores/products')
    ]);
  }
  return resetStoresPromise;
};

interface ProfileCacheMeta {
  userId: string
  fetchedAt: number
}

interface AuthError {
  code?: string
  name?: string
  message?: string
}

interface SessionLike {
  expires_at?: number
  user?: unknown
}

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false);
  const isInitialized = ref(false);
  const showLoginModal = ref(false);
  const isRefreshingToken = ref(false);
  const lastTokenRefresh = ref<number | null>(null);
  const userInfo = reactive<UserInfo>({
    id: '',
    username: '',
    email: '',
    role: 'user',
    points: 0,
    joinDate: '',
    tags: [],
    birthMonth: '',
    birthDay: '',
    avatarUrl: '',
    profileBackgroundUrl: '',
    profileBackgroundPublicId: '',
    bio: '',
    experience: 0,
    isBohCreator: false,
    creatorPlatformIds: {},
    creatorPlatformVisibility: {},
    creatorPlatformOrder: [],
    showcasePostIds: []
  });
  const isAdmin = computed(() => String(userInfo.role || '').trim() === 'admin');
  const AUTH_TIMEOUT_MS = 10000;
  const PROFILE_REFRESH_TTL_MS = 60000;

const PROFILE_SELECT_COLUMNS = `
  id,
  username,
  role,
  points,
  join_date,
  birth_month,
  birth_day,
  avatar_url,
  profile_background_url,
  profile_background_public_id,
  tags,
  bio,
  experience,
  is_boh_creator,
  creator_platform_ids,
  creator_platform_visibility,
  creator_platform_order,
  showcase_post_ids
`;
  let authStateSubscription: any = null;
  let sessionHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let authSyncInFlight: Promise<any> | null = null;
  let initInFlight: Promise<any> | null = null;
  let browserLifecycleBound = false;
  let browserLifecycleHandlers: Record<string, any> | null = null;
  const profileCacheMeta = reactive<ProfileCacheMeta>({
    userId: '',
    fetchedAt: 0
  });

  const withTimeout = <T>(promise: PromiseLike<T>, timeoutMs = AUTH_TIMEOUT_MS, message = '请求超时'): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      Promise.resolve(promise)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });

  const clearSessionHeartbeat = (): void => {
    if (sessionHeartbeatTimer !== null) {
      clearInterval(sessionHeartbeatTimer);
      sessionHeartbeatTimer = null;
    }
  };

  const shouldRefreshSoon = (session: SessionLike | null | undefined): boolean => {
    const expiresAtSeconds = Number(session?.expires_at || 0);
    if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) return false;
    const remainingMs = (expiresAtSeconds * 1000) - Date.now();
    return remainingMs > 0 && remainingMs <= SESSION_REFRESH_THRESHOLD_MS;
  };

  const isAuthSessionMissingError = (error: AuthError | null | undefined): boolean => {
    const code = String(error?.code || '').trim().toUpperCase();
    const name = String(error?.name || '').trim();
    const message = String(error?.message || '').toLowerCase();
    return code === AUTH_SESSION_MISSING_ERROR_CODE
      || name === 'AuthSessionMissingError'
      || message.includes('auth session missing');
  };

  const resolveSessionUser = async (reason = 'manual') => {
    const { supabase } = await loadAuthApi();
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_TIMEOUT_MS,
      '获取登录状态超时'
    );
    if (sessionError) {
      throw sessionError;
    }

    let session = sessionData?.session || null;

    if (!session && isLoggedIn.value) {
      const { data: refreshedData, error: refreshedError } = await withTimeout(
        supabase.auth.refreshSession(),
        AUTH_TIMEOUT_MS,
        '恢复登录状态超时'
      );
      if (!refreshedError) {
        session = refreshedData?.session || null;
      } else {
        logger.warn('auth-store', `会话恢复失败(${reason})`, refreshedError);
        if (isAuthSessionMissingError(refreshedError)) {
          throw refreshedError;
        }
      }
    } else if (session && shouldRefreshSoon(session)) {
      const { data: refreshedData, error: refreshedError } = await withTimeout(
        supabase.auth.refreshSession(),
        AUTH_TIMEOUT_MS,
        '刷新登录状态超时'
      );
      if (!refreshedError) {
        session = refreshedData?.session || session;
      } else {
        logger.warn('auth-store', `会话续期失败(${reason})`, refreshedError);
      }
    }

    if (session?.user) {
      return session.user;
    }

    const { data: authData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      AUTH_TIMEOUT_MS,
      '获取当前用户超时'
    );
    if (userError) {
      throw userError;
    }
    return authData?.user || null;
  };

  const ensureBrowserLifecycleSync = (): void => {
    if (browserLifecycleBound || typeof window === 'undefined') return;
    browserLifecycleBound = true;

    const handlePageVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isLoggedIn.value) return;
      void syncAuthState({ reason: 'visibility', force: false });
    };

    const handleOnline = () => {
      if (!isLoggedIn.value) return;
      void syncAuthState({ reason: 'online', force: false });
    };

    window.addEventListener('visibilitychange', handlePageVisible);
    window.addEventListener('online', handleOnline);

    browserLifecycleHandlers = { handlePageVisible, handleOnline };
  };

  const clearBrowserLifecycleSync = (): void => {
    if (!browserLifecycleHandlers) return;
    window.removeEventListener('visibilitychange', browserLifecycleHandlers.handlePageVisible);
    window.removeEventListener('online', browserLifecycleHandlers.handleOnline);
    browserLifecycleHandlers = null;
    browserLifecycleBound = false;
  };

  const ensureSessionHeartbeat = (): void => {
    if (sessionHeartbeatTimer !== null) return;
    if (typeof window === 'undefined') return;

    sessionHeartbeatTimer = setInterval(() => {
      if (!isLoggedIn.value) return;
      void syncAuthState({ reason: 'heartbeat', force: false });
    }, SESSION_HEARTBEAT_INTERVAL_MS);
  };

  const syncAuthState = async ({ reason = 'manual', force = false } = {}) => {
    if (authSyncInFlight) {
      return authSyncInFlight;
    }

    authSyncInFlight = (async () => {
      try {
        const user = await resolveSessionUser(reason);
        await updateLocalState(user, { force });
        if (user) {
          ensureSessionHeartbeat();
        } else {
          clearSessionHeartbeat();
        }
      } catch (error) {
        logger.warn('auth-store', `同步登录状态失败(${reason})`, error);
        if (isAuthSessionMissingError(error as AuthError)) {
          // 会话明确失效时，立即清理持久化登录态，避免使用过期 userInfo 继续请求受保护资源。
          await resetState();
          isInitialized.value = true;
          return;
        }
        // 保护已登录用户：网络抖动时不立即清空本地登录态，稍后自动重试。
        if (!isLoggedIn.value) {
          await updateLocalState(null);
        } else {
          isInitialized.value = true;
        }
      } finally {
        authSyncInFlight = null;
      }
    })();

    return authSyncInFlight;
  };

  const resolveFallbackUsername = (fallbackUser: Record<string, unknown> | null = null): string => {
    const safeUser = fallbackUser || {};
    const fromMeta = String((safeUser.user_metadata as Record<string, unknown> | undefined)?.username || '').trim();
    if (fromMeta) return fromMeta;

    const email = String(safeUser.email || '').trim();
    if (email.includes('@')) {
      return email.split('@')[0];
    }
    return userInfo.username || '';
  };

  const applyProfileToUserInfo = (data: Record<string, unknown> = {}, fallbackUser: Record<string, unknown> | null = null): void => {
    const fallbackUsername = resolveFallbackUsername(fallbackUser);
    userInfo.points = (data.points as number) || 0;
    userInfo.role = (data.role as string) || 'user';
    userInfo.username = (data.username as string) || fallbackUsername;
    userInfo.joinDate = (data.join_date as string) || '';
    userInfo.birthMonth = (data.birth_month as string) || '';
    userInfo.birthDay = (data.birth_day as string) || '';
    userInfo.avatarUrl = (data.avatar_url as string) || '';
    userInfo.profileBackgroundUrl = (data.profile_background_url as string) || '';
    userInfo.profileBackgroundPublicId = (data.profile_background_public_id as string) || '';
    userInfo.tags = (data.tags as string[]) || [];
    userInfo.bio = (data.bio as string) || '';
    userInfo.experience = (data.experience as number) || 0;
    const normalizedCreatorIds = normalizeCreatorPlatformIds(data.creator_platform_ids);
    userInfo.isBohCreator = Boolean(data.is_boh_creator);
    userInfo.creatorPlatformIds = normalizedCreatorIds;
    userInfo.creatorPlatformVisibility = normalizeCreatorPlatformVisibility(
      data.creator_platform_visibility,
      Object.keys(normalizedCreatorIds)
    );
    userInfo.creatorPlatformOrder = normalizeCreatorPlatformOrder(
      data.creator_platform_order,
      Object.keys(normalizedCreatorIds)
    );
    userInfo.showcasePostIds = normalizeShowcasePostIds(data.showcase_post_ids);
  };

  const refreshCurrentUserProfile = async ({ force = true } = {}) => {
    const { supabase } = await loadAuthApi();
    const { data: { session }, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_TIMEOUT_MS,
      '确认登录状态超时'
    );
    if (sessionError) throw sessionError;

    const sessionUser = session?.user || null;
    if (!sessionUser) {
      await updateLocalState(null);
      return null;
    }

    await updateLocalState(sessionUser, { force });
    return sessionUser;
  };

  const ensureAdminAccess = async (): Promise<boolean> => {
    if (isAdmin.value) return true;

    try {
      await refreshCurrentUserProfile({ force: true });
      return isAdmin.value;
    } catch (error) {
      logger.warn('auth-store', '确认管理员权限失败', error);
      return false;
    }
  };

  const resetUserInfo = (): void => {
    Object.assign(userInfo, {
      id: '',
      username: '',
      email: '',
      role: 'user',
      points: 0,
      joinDate: '',
      tags: [],
      birthMonth: '',
      birthDay: '',
      avatarUrl: '',
      profileBackgroundUrl: '',
      profileBackgroundPublicId: '',
      bio: '',
      experience: 0,
      isBohCreator: false,
      creatorPlatformIds: {},
      creatorPlatformVisibility: {},
      creatorPlatformOrder: [],
      showcasePostIds: []
    });
  };

  const updateLocalState = async (user: unknown, options: { force?: boolean; skipProfileFetch?: boolean } = {}) => {
    const {
      force = false,
      skipProfileFetch = false
    } = options || {};
    try {
      const { supabase } = await loadAuthApi();
      if (typeof user === 'undefined') {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          '获取登录状态超时'
        );
        user = session?.user || null;
      }

      const u = user as Record<string, unknown> | null;
      if (u) {
        isLoggedIn.value = true;
        userInfo.id = String(u.id || '');
        userInfo.email = String(u.email || '');
        ensureSessionHeartbeat();

        if (!userInfo.username) {
          const meta = u.user_metadata as Record<string, unknown> | undefined;
          userInfo.username = (meta?.username as string) || String(u.email || '').split('@')[0];
        }

        lastTokenRefresh.value = Date.now();

        if (skipProfileFetch) {
          // 快速路径：登录后先建立本地会话态，详细资料后台再拉取。
          profileCacheMeta.userId = String(u.id || '');
          profileCacheMeta.fetchedAt = 0;
          return;
        }

        try {
          const now = Date.now();
          const shouldSkipProfileFetch = !force
            && profileCacheMeta.userId === String(u.id || '')
            && profileCacheMeta.fetchedAt > 0
            && (now - profileCacheMeta.fetchedAt) < PROFILE_REFRESH_TTL_MS;

          if (shouldSkipProfileFetch) {
            return;
          }

          const { data: fetchedProfile, error: fetchProfileError } = await withTimeout(
            supabase
              .from('profiles')
              .select(PROFILE_SELECT_COLUMNS)
              .eq('id', u.id)
              .maybeSingle(),
            AUTH_TIMEOUT_MS,
            '加载用户资料超时'
          );

          if (fetchProfileError) {
            throw fetchProfileError;
          }

          let profileData = fetchedProfile as Record<string, unknown> | null;

          // 注册后资料未落库时，在首次登录阶段进行一次自愈补建。
          if (!profileData) {
            const fallbackUsername = resolveFallbackUsername(u);
            const bootstrapProfile = {
              id: u.id,
              username: fallbackUsername || String(u.id).slice(0, 8),
              email: String(u.email || '').trim().toLowerCase() || null,
              join_date: new Date().toISOString().split('T')[0]
            };

            const { error: bootstrapError } = await withTimeout(
              supabase
                .from('profiles')
                .insert([bootstrapProfile]),
              AUTH_TIMEOUT_MS,
              '初始化用户资料超时'
            );

            if (bootstrapError && bootstrapError.code !== '23505') {
              throw bootstrapError;
            }

            const { data: refetchedProfile, error: refetchError } = await withTimeout(
              supabase
                .from('profiles')
                .select(PROFILE_SELECT_COLUMNS)
                .eq('id', u.id)
                .maybeSingle(),
              AUTH_TIMEOUT_MS,
              '刷新用户资料超时'
            );

            if (refetchError) {
              throw refetchError;
            }

            profileData = refetchedProfile as Record<string, unknown> | null;
          }

          if (profileData) {
            applyProfileToUserInfo(profileData, u);
            profileCacheMeta.userId = String(u.id || '');
            profileCacheMeta.fetchedAt = Date.now();
          }
        } catch (err) {
          logger.warn('auth-store', '无法获取用户详细配置', err);
        }
      } else {
        isLoggedIn.value = false;
        clearSessionHeartbeat();
        resetUserInfo();
        profileCacheMeta.userId = '';
        profileCacheMeta.fetchedAt = 0;
      }
    } catch (error) {
      logger.error('auth-store', '更新本地状态失败', error);
    } finally {
      isInitialized.value = true;
    }
  };

  const login = async (
    loginId: string,
    password: string,
    rememberMe = false
  ): Promise<LoginResult> => {
    const { signIn: loginWithEdgeGateway } = await loadAuthApi();
    const normalizedLoginId = String(loginId || '').trim();
    if (!normalizedLoginId) {
      return { success: false, message: '登录失败：请输入方块 ID 或邮箱地址。' };
    }

    const { data, error } = await loginWithEdgeGateway(
      normalizedLoginId,
      password
    );

    if (error) {
      return {
        success: false,
        message: error.message || '登录失败，请重试',
        code: error.code || 'LOGIN_FAILED',
        requireCaptcha: Boolean((data as Record<string, unknown>)?.requireCaptcha),
      };
    }

    if (rememberMe) {
      localStorage.setItem('boh_remember_email', normalizedLoginId);
    } else {
      localStorage.removeItem('boh_remember_email');
    }

    const authUser = data?.user || data?.session?.user || null;
    await updateLocalState(authUser, { skipProfileFetch: true });
    void updateLocalState(authUser, { force: true });

    return { success: true, message: '登录成功' };
  };

  const loginWithOAuth = async (provider: string): Promise<AsyncOpResult> => {
    const { signInWithOAuth } = await loadAuthApi();
    const { error } = await signInWithOAuth(provider);
    if (error) return { success: false, message: error.message };
    return { success: true, message: '' };
  };

  const resetPassword = async (email: string): Promise<AsyncOpResult> => {
    const { resetPassword: supabaseResetPassword } = await loadAuthApi();
    const { error } = await supabaseResetPassword(email);
    if (error) return { success: false, message: error.message };
    return { success: true, message: '重置链接已发送到您的邮箱' };
  };

  const verifyPasswordRecovery = async (tokenHash: string): Promise<AsyncOpResult> => {
    const { verifyPasswordRecovery: supabaseVerifyPasswordRecovery } = await loadAuthApi();
    const { error } = await supabaseVerifyPasswordRecovery(tokenHash);
    if (error) return { success: false, message: error.message };
    return { success: true, message: '' };
  };

  const updatePassword = async (newPassword: string, currentPassword = ''): Promise<AsyncOpResult> => {
    const { updatePassword: supabaseUpdatePassword } = await loadAuthApi();
    const { error } = await supabaseUpdatePassword(newPassword, currentPassword);
    if (error) return { success: false, message: error.message };
    return { success: true, message: '密码更新成功' };
  };

  const deleteAccount = async (password: string): Promise<AsyncOpResult> => {
    const safePassword = String(password || '');
    if (safePassword.length < 6) {
      return { success: false, message: '请输入当前账号密码（至少 6 位）' };
    }

    try {
      const { deleteMyAccount: supabaseDeleteMyAccount } = await loadAuthApi();
      const { ok, error, data } = await supabaseDeleteMyAccount(safePassword);

      if (!ok) {
        return {
          success: false,
          message: error?.message || data?.message || '注销失败，请稍后重试',
          code: error?.code || data?.code || 'ACCOUNT_DELETE_FAILED'
        };
      }

      await resetState();
      return { success: true, message: data?.message || '账号已注销' };
    } catch (error) {
      logger.error('auth-store', '注销账号失败', error);
      return { success: false, message: (error as Error)?.message || '注销失败，请稍后重试' };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const { signOut: supabaseSignOut } = await loadAuthApi();
      const { error } = await supabaseSignOut();
      if (error) throw error;
      await resetState();
    } catch (error) {
      logger.error('auth-store', '退出登录失败', error);
      await resetState();
    }
  };

  const initLoginState = async () => {
    if (initInFlight) return initInFlight;

    initInFlight = (async () => {
      try {
        ensureBrowserLifecycleSync();
        await syncAuthState({ reason: 'init', force: true });

        const { supabase } = await loadAuthApi();
        if (!authStateSubscription) {
          const { data } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
            logger.debug('auth-store', `Auth state changed: ${event}`);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
              if (session?.user) {
                await updateLocalState(session.user, { force: event !== 'TOKEN_REFRESHED' });
              } else {
                await syncAuthState({ reason: `event:${event}`, force: false });
              }
              return;
            }

            if (event === 'SIGNED_OUT') {
              clearSessionHeartbeat();
              await updateLocalState(null);
            }
          });
          authStateSubscription = data?.subscription || null;
        }
      } catch (error) {
        logger.error('auth-store', '初始化登录状态失败', error);
        isInitialized.value = true;
      } finally {
        initInFlight = null;
      }
    })();

    return initInFlight;
  };

  const deductPoints = (amount: number): boolean => {
    if (userInfo.points >= amount) {
      userInfo.points -= amount;
      return true;
    }
    return false;
  };

  const resetState = async (): Promise<void> => {
    isLoggedIn.value = false;
    clearSessionHeartbeat();
    clearBrowserLifecycleSync();
    authStateSubscription?.unsubscribe?.();
    authStateSubscription = null;
    resetUserInfo();
    profileCacheMeta.userId = '';
    profileCacheMeta.fetchedAt = 0;

    // 同步清理其他会话相关 store，避免退出后残留旧状态。
    try {
      const [notificationStoreModule, bagStoreModule, productsStoreModule] = await loadResetStores();
      await Promise.all([
        notificationStoreModule.useNotificationStore().resetState(),
        bagStoreModule.useBagStore().resetState(),
        productsStoreModule.useProductsStore().resetState()
      ]);
    } catch (error) {
      logger.warn('auth-store', '清理关联状态失败', error);
    }
  };

  const updateUserProfile = async (updates: Record<string, unknown>): Promise<AsyncOpResult> => {
    if (!userInfo.id) {
      return { success: false, message: '用户未登录' };
    }

    try {
      const { supabase } = await loadAuthApi();
      const dbUpdates: Record<string, unknown> = {};
      if (updates.username !== undefined) dbUpdates.username = updates.username;
      if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
      if (updates.join_date !== undefined) dbUpdates.join_date = updates.join_date;
      if (updates.birth_month !== undefined) dbUpdates.birth_month = updates.birth_month;
      if (updates.birth_day !== undefined) dbUpdates.birth_day = updates.birth_day;
      if (updates.avatar_url !== undefined) dbUpdates.avatar_url = updates.avatar_url;
      if (updates.profile_background_url !== undefined) dbUpdates.profile_background_url = updates.profile_background_url;
      if (updates.profile_background_public_id !== undefined) dbUpdates.profile_background_public_id = updates.profile_background_public_id;
      if (updates.is_boh_creator !== undefined) dbUpdates.is_boh_creator = Boolean(updates.is_boh_creator);
      if (updates.creator_platform_ids !== undefined) {
        dbUpdates.creator_platform_ids = normalizeCreatorPlatformIds(updates.creator_platform_ids);
      }
      if (updates.creator_platform_visibility !== undefined) {
        dbUpdates.creator_platform_visibility = normalizeCreatorPlatformVisibility(updates.creator_platform_visibility);
      }
      if (updates.creator_platform_order !== undefined) {
        dbUpdates.creator_platform_order = normalizeCreatorPlatformOrder(updates.creator_platform_order);
      }
      if (updates.showcase_post_ids !== undefined) {
        dbUpdates.showcase_post_ids = normalizeShowcasePostIds(updates.showcase_post_ids);
      }

      const { error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('id', userInfo.id);

      if (error) {
        return { success: false, message: error.message, code: error.code };
      }

      const { data: refreshedProfile, error: refreshError } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_COLUMNS)
        .eq('id', userInfo.id)
        .single();

      if (!refreshError && refreshedProfile) {
        applyProfileToUserInfo(refreshedProfile as Record<string, unknown>, {
          email: userInfo.email,
          user_metadata: { username: userInfo.username }
        });
        profileCacheMeta.userId = userInfo.id;
        profileCacheMeta.fetchedAt = Date.now();
      } else {
        if (updates.username !== undefined) userInfo.username = updates.username as string;
        if (updates.bio !== undefined) userInfo.bio = updates.bio as string;
        if (updates.join_date !== undefined) userInfo.joinDate = (updates.join_date as string) || '';
        if (updates.birth_month !== undefined) userInfo.birthMonth = (updates.birth_month as string) || '';
        if (updates.birth_day !== undefined) userInfo.birthDay = (updates.birth_day as string) || '';
        if (updates.avatar_url !== undefined) userInfo.avatarUrl = updates.avatar_url as string;
        if (updates.profile_background_url !== undefined) userInfo.profileBackgroundUrl = updates.profile_background_url as string;
        if (updates.profile_background_public_id !== undefined) userInfo.profileBackgroundPublicId = updates.profile_background_public_id as string;
        if (updates.is_boh_creator !== undefined) userInfo.isBohCreator = Boolean(updates.is_boh_creator);
        if (updates.creator_platform_ids !== undefined) {
          const normalizedCreatorIds = normalizeCreatorPlatformIds(updates.creator_platform_ids);
          userInfo.creatorPlatformIds = normalizedCreatorIds;
          const availableKeys = Object.keys(normalizedCreatorIds);
          userInfo.creatorPlatformVisibility = normalizeCreatorPlatformVisibility(
            userInfo.creatorPlatformVisibility,
            availableKeys
          );
          userInfo.creatorPlatformOrder = normalizeCreatorPlatformOrder(
            userInfo.creatorPlatformOrder,
            availableKeys
          );
          if (updates.is_boh_creator === undefined) {
            userInfo.isBohCreator = Object.keys(normalizedCreatorIds).length > 0;
          }
        }
        if (updates.creator_platform_visibility !== undefined) {
          userInfo.creatorPlatformVisibility = normalizeCreatorPlatformVisibility(
            updates.creator_platform_visibility,
            Object.keys(userInfo.creatorPlatformIds || {})
          );
        }
        if (updates.creator_platform_order !== undefined) {
          userInfo.creatorPlatformOrder = normalizeCreatorPlatformOrder(
            updates.creator_platform_order,
            Object.keys(userInfo.creatorPlatformIds || {})
          );
        }
        if (updates.showcase_post_ids !== undefined) {
          userInfo.showcasePostIds = normalizeShowcasePostIds(updates.showcase_post_ids);
        }
      }

      if (userInfo.username) {
        localStorage.setItem('username', userInfo.username);
      }

      return { success: true, message: '' };
    } catch (err) {
      return { success: false, message: (err as Error).message || '更新失败' };
    }
  };

  return {
    isLoggedIn,
    isInitialized,
    showLoginModal,
    isAdmin,
    userInfo,
    lastTokenRefresh,
    isRefreshingToken,
    updateLocalState,
    login,
    loginWithOAuth,
    resetPassword,
    verifyPasswordRecovery,
    updatePassword,
    deleteAccount,
    logout,
    initLoginState,
    refreshCurrentUserProfile,
    ensureAdminAccess,
    deductPoints,
    resetState,
    updateUserProfile,
    syncAuthState
  };
}, {
  persist: {
    key: 'boh_auth',
    paths: ['isLoggedIn', 'userInfo'],
    storage: localStorage
  }
});