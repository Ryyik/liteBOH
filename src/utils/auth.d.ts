// ============================================
// @/utils/auth.js 类型声明
// 为动态 import('@/utils/auth.js') 提供类型推断
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationItem } from '@/types';

export interface AuthApiError {
  message: string;
  code?: string;
  status?: number;
}

export interface AuthApiResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: AuthApiError | null;
}

export interface SignOutResult {
  error: AuthApiError | null;
}

export const supabase: SupabaseClient;

export function signUp(
  username: string,
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
): Promise<AuthApiResult>;

export function resendSignupConfirmation(email: string): Promise<AuthApiResult>;

/** 注册验证码位数，与线上 mailer_otp_length 一致（实测为 8，不是常见的 6） */
export const OTP_LENGTH: number;
/** 验证码有效期（秒），与线上 mailer_otp_exp 一致 */
export const OTP_TTL_SECONDS: number;

/** 当前生效的用户协议版本号，随注册写入 profiles.terms_version */
export const TERMS_VERSION: string;

/**
 * 校验注册邮箱验证码（验证码模式，替代确认链接）。
 * 成功后 supabase-js 自动建会话并广播 SIGNED_IN。
 *
 * `wasCreatedRecently` 用于区分「本次新建的账号」与「已存在的老账号」：
 * signInWithOtp 对已注册邮箱的语义是登录，拿到老账号却继续走注册流程
 * 会静默改写它的 ID 与密码。`null` 表示无法判断（拿不到 created_at）。
 */
export function verifySignupOtp(
  email: string,
  token: string,
): Promise<AuthApiResult & { retryAfterSeconds?: number; wasCreatedRecently?: boolean | null }>;

/**
 * 「邮箱优先」注册第 ① 屏：只凭邮箱创建账号并发验证码。
 * 协议同意随 options.data 一次性落库，不依赖前端事后补写。
 */
export function sendSignupOtp(
  email: string,
  options?: { termsAcceptedAt?: string },
): Promise<AuthApiResult & { retryAfterSeconds?: number }>;

/**
 * 第 ① 屏：这个邮箱是否已被注册（真实查询，不是本机格式校验）。
 * ok=false 表示查询失败 ⇒ registered=null，此时**不要**显示「可用」。
 */
export function isEmailRegistered(
  email: string,
): Promise<AuthApiResult & { registered: boolean | null }>;

/**
 * 第 ② 屏验证通过后判断账号是否「还没建完」。
 * incomplete=false 表示这是真正的老用户，应挡住并提示去登录。
 */
export function checkSignupState(): Promise<
  AuthApiResult & { incomplete: boolean; username?: string }
>;

/**
 * 「邮箱优先」注册第 ③ 屏：会话已建立后补 BOH ID / 生日 / 密码。
 * 内部顺序是先写 profiles 再设密码 —— 见实现处注释。
 */
export function completeSignupIdentity(payload: {
  username: string;
  password: string;
  birthMonth?: string;
  birthDay?: string;
}): Promise<
  AuthApiResult & { step?: 'username' | 'password' | 'session' | 'done'; userId?: string }
>;

/** 登录风控上下文：服务端按风险决定是否校验 altcha（见 auth-login EF 闸门②） */
export interface SignInSecurityContext {
  altchaPayload?: string;
  deviceIdHash?: string;
}

export function signIn(
  loginId: string,
  password: string,
  security?: SignInSecurityContext,
): Promise<
  AuthApiResult<{
    user?: unknown;
    session?: { user: unknown } | null;
    /** 服务端要求先完成人机验证（或触发限流）时返回 */
    requireCaptcha?: boolean;
    retryAfterSeconds?: number;
  } | null>
>;

export function resetPassword(email: string): Promise<{
  ok: boolean;
  data?: unknown;
  error: AuthApiError | null;
  /** 429 频控剩余秒数（登录页「忘记密码」倒计时用） */
  retryAfterSeconds?: number;
}>;

export function verifyPasswordRecovery(tokenHash: string): Promise<{ error: AuthApiError | null }>;

export function updatePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<{ error: AuthApiError | null }>;

export function deleteMyAccount(
  password: string,
): Promise<AuthApiResult<{ message?: string; code?: string }>>;

export function signOut(scope?: 'local' | 'global' | 'others'): Promise<SignOutResult>;

/** 退出其他所有设备（保留当前会话），用于「账户安全 → 登录设备」 */
export function signOutOtherDevices(): Promise<SignOutResult>;

export function getCurrentUser(): Promise<{ id: string; [key: string]: unknown } | null>;

export function getAllProfiles(): Promise<AuthApiResult>;

export function getProfilesPage(params?: { page?: number; limit?: number }): Promise<AuthApiResult>;

export function getUserInfo(userId: string): Promise<AuthApiResult>;

// --- Passkey API（supabase-js ≥2.105 experimental） ---
export function isPasskeySupported(): Promise<boolean>;
export function signInWithPasskey(): Promise<{
  data: { session?: Record<string, unknown> | null; user?: Record<string, unknown> | null } | null;
  error: AuthApiError | null;
}>;
export function registerPasskey(): Promise<{ data: unknown; error: AuthApiError | null }>;
export function listPasskeys(): Promise<{
  data: Array<{ id: string; friendly_name?: string; created_at: string }>;
  error: AuthApiError | null;
}>;
export function deletePasskey(passkeyId: string): Promise<{ error: AuthApiError | null }>;
export function renamePasskey(
  passkeyId: string,
  friendlyName: string,
): Promise<{ error: AuthApiError | null }>;
export function toPasskeyLoginMessage(error: unknown): string;
export function toPasskeyRegisterMessage(error: unknown): string;

// --- Forum API ---
export function getPosts(params?: Record<string, unknown>): Promise<AuthApiResult>;
export function createPost(data: Record<string, unknown>): Promise<AuthApiResult>;
export function getComments(postId: string): Promise<AuthApiResult>;
export function createComment(data: Record<string, unknown>): Promise<AuthApiResult>;
export function toggleLike(params: Record<string, unknown>): Promise<AuthApiResult>;
export function checkIfLiked(params: Record<string, unknown>): Promise<AuthApiResult>;
export function deletePost(postId: string): Promise<AuthApiResult>;
export function deleteComment(commentId: string): Promise<AuthApiResult>;
export function getUserPosts(userId: string): Promise<AuthApiResult>;
export function updatePost(postId: string, data: Record<string, unknown>): Promise<AuthApiResult>;
export function retryPostModeration(postId: string): Promise<AuthApiResult>;
export function getWeeklyCheckinStatus(): Promise<AuthApiResult>;
export function submitWeeklyCheckin(): Promise<AuthApiResult>;

// --- Notifications API ---
export function getUserNotifications(
  userId: string,
  options?: Record<string, unknown>,
): Promise<{
  data: NotificationItem[];
  error: AuthApiError | null;
  hasMore: boolean;
  nextCursor: string | null;
}>;
export function getArchivedNotifications(
  userId: string,
  options?: Record<string, unknown>,
): Promise<{
  data: NotificationItem[];
  error: AuthApiError | null;
  hasMore: boolean;
  nextCursor: string | null;
}>;
export function archiveNotification(notificationId: string, userId: string): Promise<AuthApiResult>;
export function unarchiveNotification(
  notificationId: string,
  userId: string,
): Promise<AuthApiResult>;
export function archiveAllNotifications(userId: string, types?: string[]): Promise<AuthApiResult>;
export function markNotificationAsRead(
  notificationId: string,
  userId: string,
): Promise<AuthApiResult>;
export function markAllNotificationsAsRead(userId: string): Promise<AuthApiResult>;
export function createNotification(
  recipientId: string,
  senderId: string,
  type: string,
  data?: Record<string, unknown>,
): Promise<AuthApiResult>;
export function getUnreadNotificationCount(userId: string): Promise<{
  ok: boolean;
  count: number;
  notifCount: number;
  mailCount: number;
  data: unknown;
  error: AuthApiError | null;
}>;
export function filterSelfActionNotifications(
  notifications: NotificationItem[],
): NotificationItem[];

// --- Profile API ---
export function getUserImpressions(userId: string): Promise<AuthApiResult>;
export function addUserImpression(data: Record<string, unknown>): Promise<AuthApiResult>;
export function deleteUserImpression(id: string): Promise<AuthApiResult>;
export function getProfileByUsername(username: string): Promise<AuthApiResult>;
export function getPostsByUsername(username: string): Promise<AuthApiResult>;
export function getCommentsByUsername(username: string): Promise<AuthApiResult>;
export function updateProfile(
  userId: string,
  data: Record<string, unknown>,
): Promise<AuthApiResult>;
export function updateProfileBio(userId: string, bio: string): Promise<AuthApiResult>;
export function updateProfileAvatar(userId: string, avatarUrl: string): Promise<AuthApiResult>;
export function createShopOrderWithPoints(params: Record<string, unknown>): Promise<AuthApiResult>;

// --- Subscription API ---
export function getMySubscriptions(): Promise<AuthApiResult>;
export function subscribeWithPoints(params: Record<string, unknown>): Promise<AuthApiResult>;

// --- Request Core ---
export function clearAuthReadCache(): void;
export function invalidateByTags(tags: string[]): void;
export function normalizeDbError(error: unknown): AuthApiError;
