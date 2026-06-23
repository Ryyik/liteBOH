// ============================================
// @/utils/auth.js 类型声明
// 为动态 import('@/utils/auth.js') 提供类型推断
// ============================================

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { NotificationItem } from '@/types'

export interface AuthApiError {
  message: string
  code?: string
  status?: number
}

export interface AuthApiResult<T = unknown> {
  ok: boolean
  data: T | null
  error: AuthApiError | null
}

export interface SignOutResult {
  error: AuthApiError | null
}

export const supabase: SupabaseClient

export function signUp(
  username: string,
  email: string,
  password: string,
  metadata?: Record<string, unknown>
): Promise<AuthApiResult>

export function resendSignupConfirmation(email: string): Promise<AuthApiResult>

export function signIn(
  loginId: string,
  password: string
): Promise<AuthApiResult<{ user?: unknown; session?: { user: unknown } | null }>>

export function signInWithOAuth(provider: string): Promise<{ error: AuthApiError | null }>

export function resetPassword(email: string): Promise<{ error: AuthApiError | null }>

export function verifyPasswordRecovery(tokenHash: string): Promise<{ error: AuthApiError | null }>

export function updatePassword(
  newPassword: string,
  currentPassword?: string
): Promise<{ error: AuthApiError | null }>

export function deleteMyAccount(password: string): Promise<AuthApiResult<{ message?: string; code?: string }>>

export function signOut(): Promise<SignOutResult>

export function getCurrentUser(): Promise<{ id: string; [key: string]: unknown } | null>

export function getAllProfiles(): Promise<AuthApiResult>

export function getProfilesPage(params?: { page?: number; limit?: number }): Promise<AuthApiResult>

export function getUserInfo(userId: string): Promise<AuthApiResult>

export function getEmailByUsername(username: string): Promise<AuthApiResult>

// --- Forum API ---
export function getPosts(params?: Record<string, unknown>): Promise<AuthApiResult>
export function getPostsCount(params?: Record<string, unknown>): Promise<AuthApiResult>
export function createPost(data: Record<string, unknown>): Promise<AuthApiResult>
export function getComments(postId: string): Promise<AuthApiResult>
export function createComment(data: Record<string, unknown>): Promise<AuthApiResult>
export function toggleLike(params: Record<string, unknown>): Promise<AuthApiResult>
export function checkIfLiked(params: Record<string, unknown>): Promise<AuthApiResult>
export function deletePost(postId: string): Promise<AuthApiResult>
export function deleteComment(commentId: string): Promise<AuthApiResult>
export function getUserPosts(userId: string): Promise<AuthApiResult>
export function updatePost(postId: string, data: Record<string, unknown>): Promise<AuthApiResult>
export function retryPostModeration(postId: string): Promise<AuthApiResult>
export function getWeeklyCheckinStatus(): Promise<AuthApiResult>
export function submitWeeklyCheckin(): Promise<AuthApiResult>

// --- Notifications API ---
export function getUserNotifications(userId: string, options?: Record<string, unknown>): Promise<{ data: NotificationItem[]; error: AuthApiError | null; hasMore: boolean; nextCursor: string | null }>
export function markNotificationAsRead(id: string): Promise<AuthApiResult>
export function markAllNotificationsAsRead(): Promise<AuthApiResult>
export function createNotification(data: Record<string, unknown>): Promise<AuthApiResult>
export function getUnreadNotificationCount(userId: string): Promise<{ ok: boolean; count: number; notifCount: number; mailCount: number; data: unknown; error: AuthApiError | null }>
export function subscribeToNotifications(userId: string, callback: (payload: any) => void): RealtimeChannel
export function filterSelfActionNotifications(notifications: unknown[]): unknown[]

// --- Profile API ---
export function getUserImpressions(userId: string): Promise<AuthApiResult>
export function addUserImpression(data: Record<string, unknown>): Promise<AuthApiResult>
export function deleteUserImpression(id: string): Promise<AuthApiResult>
export function getProfileByUsername(username: string): Promise<AuthApiResult>
export function getPostsByUsername(username: string): Promise<AuthApiResult>
export function getCommentsByUsername(username: string): Promise<AuthApiResult>
export function updateProfile(userId: string, data: Record<string, unknown>): Promise<AuthApiResult>
export function updateProfileBio(userId: string, bio: string): Promise<AuthApiResult>
export function updateProfileAvatar(userId: string, avatarUrl: string): Promise<AuthApiResult>
export function createShopOrderWithPoints(params: Record<string, unknown>): Promise<AuthApiResult>

// --- Subscription API ---
export function getMySubscriptions(): Promise<AuthApiResult>
export function subscribeWithPoints(params: Record<string, unknown>): Promise<AuthApiResult>

// --- Request Core ---
export function clearAuthReadCache(): void
export function invalidateByTags(tags: string[]): void
export function normalizeDbError(error: unknown): AuthApiError