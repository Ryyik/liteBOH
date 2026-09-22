import { defineStore } from 'pinia';
import { computed, ref, reactive } from 'vue';
import { logger } from '@/utils/logger.js';
import { validateCurrentPassword } from '@/utils/auth-validation.js';
import { notify } from '@/utils/notify.js';
import { getLocalDayKey, writeLastOnlineDay } from '@/utils/overview-day-marker.js';
import type { UserInfo, LoginResult, AsyncOpResult } from '@/types';
import type * as AuthModule from '@/utils/auth.js';

const CREATOR_PLATFORM_KEYS = ['bilibili', 'xiaohongshu', 'douyin'];
const CREATOR_VISIBILITY_VALUES = new Set(['public', 'private']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const SESSION_HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
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
    pointsCardSkin: 'blank',
    pointsCardImageUrl: '',
    pointsCardImagePublicId: '',
    bio: '',
    experience: 0,
    isBohCreator: false,
    creatorPlatformIds: {},
    creatorPlatformVisibility: {},
    creatorPlatformOrder: [],
    showcasePostIds: [],
    lastActiveAt: null,
    hideOnlineStatus: false,
    hideFollowData: false,
    // 封禁/禁言状态
    isBanned: false,
    isMuted: false,
    banReason: null,
    muteReason: null,
    bannedUntil: null,
    mutedUntil: null
  });
  // 会话级离线概览锚点：在首次刷新 last_active_at 前快照，避免离线期间内容被排除。
  // 不持久化（persist paths 只含 isLoggedIn/userInfo），每次会话重新捕获。
  const offlineAnchorAt = ref<string | null>(null);
  // 跨设备天粒度标记（服务端 profiles.last_online_day / overview_checked_day，Asia/Shanghai 自然日）：
  // 每次会话经 mark_overview_state 拉取；不持久化。
  // 会话内「上次在线日」以首次取回的值为准——心跳/可见性刷新拿到的已是「今天」，
  // 覆盖写会把真实的上次在线日抹成今天，长离线窗口随之塌成 0。
  const overviewMarks = ref<{ today: string; previousOnlineDay: string; checkedDay: string } | null>(null);

  const isAdmin = computed(() => {
    if (!isInitialized.value) return false;
    return String(userInfo.role || '').trim() === 'admin';
  });
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
  points_card_skin,
  points_card_image_url,
  points_card_image_public_id,
  tags,
  bio,
  experience,
  is_boh_creator,
  creator_platform_ids,
  creator_platform_visibility,
  creator_platform_order,
  showcase_post_ids,
  last_active_at,
  hide_online_status,
  hide_follow_data,
  is_banned,
  is_muted,
  ban_reason,
  mute_reason,
  banned_until,
  muted_until
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
      void updateOnlineStatus();
    };

    const handleOnline = () => {
      if (!isLoggedIn.value) return;
      void syncAuthState({ reason: 'online', force: false });
      void updateOnlineStatus();
    };

    // 会话结束（关闭标签 / 刷新 / 站外跳转）时把「上次在线日」游标推进到当天，语义=该日及之前已浏览。
    // 时机必须是「离开时」而不能是在线中：上线就写会把当天的推送窗口掐掉
    // （今天在线 ≠ 今天稍后发布的内容已读），灵动岛将永远弹不出来。
    // 有了这条记录，长离线账号的「你离开了 N 天」不再依赖易失的秒级心跳锚点
    // （profiles.last_active_at 会被登录与每次刷新后的会话顶成今天）。
    const handlePageHide = () => {
      if (!isLoggedIn.value) return;
      const userId = userInfo.id;
      if (!userId) return;
      writeLastOnlineDay(userId, getLocalDayKey());
    };

    window.addEventListener('visibilitychange', handlePageVisible);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageHide);

    browserLifecycleHandlers = { handlePageVisible, handleOnline, handlePageHide };
  };

  const clearBrowserLifecycleSync = (): void => {
    if (!browserLifecycleHandlers) return;
    window.removeEventListener('visibilitychange', browserLifecycleHandlers.handlePageVisible);
    window.removeEventListener('online', browserLifecycleHandlers.handleOnline);
    window.removeEventListener('pagehide', browserLifecycleHandlers.handlePageHide);
    browserLifecycleHandlers = null;
    browserLifecycleBound = false;
  };

  const ensureSessionHeartbeat = (): void => {
    if (sessionHeartbeatTimer !== null) return;
    if (typeof window === 'undefined') return;

    sessionHeartbeatTimer = setInterval(async () => {
      if (!isLoggedIn.value) return;
      void syncAuthState({ reason: 'heartbeat', force: false });
      void updateOnlineStatus();
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

        // 中途封禁检测：心跳/可见性/网络恢复等场景下，若发现当前用户已被封禁，
        // 立即强制登出并提示。login() 流程不走 syncAuthState，有自己的封禁检查，不会冲突。
        if (user && userInfo.isBanned) {
          const isPermanentBan = !userInfo.bannedUntil;
          const isTempBanActive = userInfo.bannedUntil && new Date(userInfo.bannedUntil) > new Date();
          if (isPermanentBan || isTempBanActive) {
            let banMessage = '您的账号已被封禁，已自动退出登录。';
            if (userInfo.banReason) {
              banMessage += ` 原因：${userInfo.banReason}`;
            }
            if (userInfo.bannedUntil) {
              try {
                const expiryDate = new Date(userInfo.bannedUntil).toLocaleDateString('zh-CN');
                banMessage += ` 解封时间：${expiryDate}`;
              } catch {
                // 日期解析失败时忽略
              }
            } else {
              banMessage += '（永久封禁）';
            }
            logger.warn('auth-store', `检测到封禁状态，强制登出(${reason})`, {
              userId: userInfo.id,
              banReason: userInfo.banReason,
              bannedUntil: userInfo.bannedUntil
            });
            notify(banMessage, 'error');
            const { signOut } = await loadAuthApi();
            await signOut();
            await resetState();
            return;
          }
        }

        if (user) {
          ensureSessionHeartbeat();
        } else {
          clearSessionHeartbeat();
        }
      } catch (error) {
        // 未登录态下会话不存在是预期，不打印警告避免噪音
        // 仅在已登录态或会话明确失效时才 warn
        const isLoggedInBefore = isLoggedIn.value;
        if (!isLoggedInBefore && reason === 'init') {
          // init 时未登录是正常状态，静默处理
          if (isAuthSessionMissingError(error as AuthError)) {
            isInitialized.value = true;
            return;
          }
          // 其他错误在未登录 init 时也不应噪音化
          logger.debug('auth-store', `init 未登录态同步跳过(${reason})`, error);
          isInitialized.value = true;
          return;
        }
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
    userInfo.pointsCardSkin = (data.points_card_skin as string) || 'blank';
    userInfo.pointsCardImageUrl = (data.points_card_image_url as string) || '';
    userInfo.pointsCardImagePublicId = (data.points_card_image_public_id as string) || '';
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
    userInfo.lastActiveAt = (data.last_active_at as string) || null;
    userInfo.hideOnlineStatus = Boolean(data.hide_online_status);
    userInfo.hideFollowData = Boolean(data.hide_follow_data);
    // 封禁/禁言状态
    userInfo.isBanned = Boolean(data.is_banned);
    userInfo.isMuted = Boolean(data.is_muted);
    userInfo.banReason = (data.ban_reason as string) || null;
    userInfo.muteReason = (data.mute_reason as string) || null;
    userInfo.bannedUntil = (data.banned_until as string) || null;
    userInfo.mutedUntil = (data.muted_until as string) || null;
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
      pointsCardSkin: 'blank',
      pointsCardImageUrl: '',
      pointsCardImagePublicId: '',
      bio: '',
      experience: 0,
      isBohCreator: false,
      creatorPlatformIds: {},
      creatorPlatformVisibility: {},
      creatorPlatformOrder: [],
      showcasePostIds: [],
      lastActiveAt: null,
      hideOnlineStatus: false,
      hideFollowData: false,
      // 封禁/禁言字段一并复位：此前漏清会随 persist 写入 localStorage，
      // 登出后同设备下一位用户会读到脏封禁状态
      isBanned: false,
      isMuted: false,
      banReason: null,
      muteReason: null,
      bannedUntil: null,
      mutedUntil: null
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
        // 登录跃迁检测（false→true = 新登录，而非已登录态的常规刷新）：
        // 令牌登录走 verifyOtp({type:'recovery'})，supabase-js 只发 PASSWORD_RECOVERY、
        // 不发 SIGNED_IN → 挂在 SIGNED_IN 上的 updateOnlineStatus 不会触发，用户登录后
        // 最长约 2 分钟（首个心跳 tick 前）不显示在线。在此统一兜底：所有登录入口
        // 跃迁即写活跃时间。update_last_active_at 恒写 now，与 SIGNED_IN 路径重复调用幂等。
        const wasLoggedIn = isLoggedIn.value;
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
          if (!wasLoggedIn) void updateOnlineStatus();
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
            // 安全加固（2026090803）：email 只存 auth.users，profiles 已 drop 该列
            const bootstrapProfile = {
              id: u.id,
              username: fallbackUsername || String(u.id).slice(0, 8),
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

        // 登录跃迁兜底：放在 profile 拉取之后，保证 updateOnlineStatus 的离线锚点
        // 能读到 DB 旧 last_active_at（与 SIGNED_IN 事件路径的触发时序一致）。
        if (!wasLoggedIn) void updateOnlineStatus();
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

  /**
   * 登录后的封禁检查（login / loginWithPasskey 共用）：
   * 永久封禁或临时封禁未过期 → 立即登出并返回封禁文案；检查失败不阻止登录。
   */
  const checkBanAfterSignIn = async (): Promise<{ banned: boolean; message: string }> => {
    const userId = userInfo.id;
    if (!userId) return { banned: false, message: '' };
    try {
      const { supabase } = await loadAuthApi();
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_banned, ban_reason, banned_until')
        .eq('id', userId)
        .single();

      if (profileError || profile?.is_banned !== true) {
        return { banned: false, message: '' };
      }

      // 判断封禁是否有效：永久封禁或临时封禁未过期
      const isPermanentBan = !profile.banned_until;
      const isTempBanActive = profile.banned_until && new Date(profile.banned_until) > new Date();

      if (!isPermanentBan && !isTempBanActive) {
        // 临时封禁已过期，允许登录（后续会由cleanup函数清理数据库状态）
        return { banned: false, message: '' };
      }

      // 用户确实被封禁（永久或临时封禁未过期），立即退出
      const { signOut } = await loadAuthApi();
      await signOut();
      await resetState();

      let banMessage = '您的账号已被封禁，无法登录。';
      if (profile.ban_reason) {
        banMessage += ` 原因：${profile.ban_reason}`;
      }
      if (profile.banned_until) {
        const expiryDate = new Date(profile.banned_until);
        banMessage += ` 解封时间：${expiryDate.toLocaleDateString('zh-CN')}`;
      } else {
        banMessage += '（永久封禁）';
      }

      return { banned: true, message: banMessage };
    } catch (banCheckError) {
      logger.warn('auth-store', '检查封禁状态失败', banCheckError);
      // 封禁检查失败不阻止登录，继续流程
      return { banned: false, message: '' };
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
    await updateLocalState(authUser, { force: true });

    const ban = await checkBanAfterSignIn();
    if (ban.banned) {
      return { success: false, message: ban.message, code: 'USER_BANNED' };
    }

    return { success: true, message: '登录成功' };
  };

  /**
   * 通行密钥（指纹/面容）登录：supabase-js 托管完整 WebAuthn 仪式，成功即得 session。
   * 会话采纳、本地状态与封禁检查与密码登录（login）完全一致 —— 封禁用户拿到
   * passkey 会话也会在这里被立即登出（服务端 RLS 写保护是第二道兜底）。
   */
  const loginWithPasskey = async (): Promise<LoginResult> => {
    const { signInWithPasskey, toPasskeyLoginMessage } = await loadAuthApi();
    const { data, error } = await signInWithPasskey();

    if (error) {
      return {
        success: false,
        message: toPasskeyLoginMessage(error),
        code: 'PASSKEY_LOGIN_FAILED',
      };
    }

    const authUser = data?.user || data?.session?.user || null;
    await updateLocalState(authUser, { force: true });

    const ban = await checkBanAfterSignIn();
    if (ban.banned) {
      return { success: false, message: ban.message, code: 'USER_BANNED' };
    }

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
    // 便宜的前置拦截，避免拿明显不合法的输入去打网络；口径取自共用校验（原先硬编码 6）。
    // ⚠️ 这里刻意用「当前密码」的下限，而不是新密码下限 —— 历史 6~7 位密码的老用户
    //    必须还能注销账号，强度策略不能变成锁死策略。
    const currentPasswordMessage = validateCurrentPassword(safePassword);
    if (currentPasswordMessage) {
      return { success: false, message: currentPasswordMessage };
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

  /**
   * 同步跨设备天粒度标记（智能概览用）：
   * mark_overview_state 一次往返完成「读旧值 + 写今天」——必须原子，先写后读窗口就没了。
   * - 会话启动/在线心跳：p_checked=false，取回「上次在线日」；
   * - 概览检查成功后：p_checked=true，额外把「当日已检查」推进到今天（跨设备同日去重）。
   */
  const refreshOverviewMarks = async ({ markChecked = false } = {}): Promise<typeof overviewMarks.value> => {
    if (!isLoggedIn.value || !userInfo.id) return null;
    try {
      const { supabase } = await loadAuthApi();
      const { data, error } = await supabase.rpc('mark_overview_state', { p_checked: markChecked });
      if (error) throw error;
      const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const today = String(payload.today || '');
      const previousOnlineDay = String(payload.previous_online_day || '');
      const checkedDay = String(payload.checked_day || '');
      overviewMarks.value = {
        today,
        // 会话内首次值优先：后续调用返回的「上次在线日」已经是今天，不代表真实上次在线日
        previousOnlineDay: overviewMarks.value?.previousOnlineDay || previousOnlineDay,
        checkedDay: markChecked ? today : checkedDay || overviewMarks.value?.checkedDay || ''
      };
      return overviewMarks.value;
    } catch (error) {
      // 跨设备标记是增强项：失败时前端回落到本机 localStorage 游标与会话锚点
      logger.warn('auth-store', '同步智能概览天粒度标记失败', error);
      return null;
    }
  };

  const updateOnlineStatus = async () => {
    try {
      // 两阶段锚点：首次刷新前捕获 DB 中保存的旧活跃时间（syncAuthState 已写入 userInfo），
      // 之后 RPC 与本地覆盖都会让 userInfo.lastActiveAt 变成"刚刚"，概览只能依赖此快照。
      if (!offlineAnchorAt.value) {
        if (userInfo.lastActiveAt) {
          offlineAnchorAt.value = userInfo.lastActiveAt;
        } else {
          // 全新账号（DB 无 last_active_at）：紧接着的 update_last_active_at RPC
          // 会立刻把 DB 写成 now，get_offline_overview 的 first_login 分支因此
          // 永远不可达、概览恒为空。这里在写库前主动放一个 7 天锚点，
          // 让首次登录能看到最近 7 天的内容。
          offlineAnchorAt.value = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        }
      }
      const { supabase } = await loadAuthApi();
      await supabase.rpc('update_last_active_at');
      userInfo.lastActiveAt = new Date().toISOString();
      // 顺带同步跨设备天粒度标记（上次在线日 / 当日已检查），供智能概览的窗口与同日去重使用
      void refreshOverviewMarks();
    } catch {
      // 非关键功能，静默处理
    }
  };

  const initLoginState = async () => {
    if (initInFlight) return initInFlight;

    initInFlight = (async () => {
      try {
        ensureBrowserLifecycleSync();
        await syncAuthState({ reason: 'init', force: true });

        if (isLoggedIn.value) {
          void updateOnlineStatus();
        }

        const { supabase } = await loadAuthApi();
        if (!authStateSubscription) {
          const { data } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
            logger.debug('auth-store', `Auth state changed: ${event}`);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
              if (session?.user) {
                await updateLocalState(session.user, { force: event !== 'TOKEN_REFRESHED' });
                if (event === 'SIGNED_IN') {
                  void updateOnlineStatus();
                }
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
    offlineAnchorAt.value = null;
    overviewMarks.value = null;
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
      if (updates.points_card_skin !== undefined) dbUpdates.points_card_skin = updates.points_card_skin;
      if (updates.points_card_image_url !== undefined) dbUpdates.points_card_image_url = updates.points_card_image_url;
      if (updates.points_card_image_public_id !== undefined) dbUpdates.points_card_image_public_id = updates.points_card_image_public_id;
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
      if (updates.hide_follow_data !== undefined) {
        dbUpdates.hide_follow_data = Boolean(updates.hide_follow_data);
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
        if (updates.points_card_skin !== undefined) userInfo.pointsCardSkin = (updates.points_card_skin as string) || 'blank';
        if (updates.points_card_image_url !== undefined) userInfo.pointsCardImageUrl = (updates.points_card_image_url as string) || '';
        if (updates.points_card_image_public_id !== undefined) userInfo.pointsCardImagePublicId = (updates.points_card_image_public_id as string) || '';
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
        if (updates.hide_follow_data !== undefined) {
          userInfo.hideFollowData = Boolean(updates.hide_follow_data);
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
    loginWithPasskey,
    loginWithOAuth,
    resetPassword,
    verifyPasswordRecovery,
    updatePassword,
    deleteAccount,
    logout,
    initLoginState,
    offlineAnchorAt,
    overviewMarks,
    refreshOverviewMarks,
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
