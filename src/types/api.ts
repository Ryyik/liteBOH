// ============================================
// BOH API 层共享类型定义
// 用于 auth-api, forum-api, profile-api 等 API 模块
// ============================================

// --- 通用 API 返回结构 ---
export interface ApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: ApiError
}

export interface ApiError {
  message: string
  code?: string
  status?: number
}

// --- Supabase 查询通用结构 ---
export interface SupabaseResponse<T = unknown> {
  data: T | null
  error: ApiError | null
}

// --- 分页 ---
export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PaginatedResult<T = unknown> {
  data: T[]
  total: number
  page: number
  limit: number
}

// --- Auth API ---
export interface SignInParams {
  loginId: string
  password: string
  verificationPayload?: string
  deviceIdHash?: string
}

export interface SignInResult {
  success: boolean
  message: string
  code?: string
  requireCaptcha?: boolean
  user?: { id: string; email: string; [key: string]: unknown }
}

export interface OAuthParams {
  provider: string
}

// --- Forum API ---
export interface PostData {
  id?: string
  content: string
  author_id?: string
  author_username?: string
  status?: string
  created_at?: string
  location_name?: string
  location_lat?: number
  location_lng?: number
  [key: string]: unknown
}

export interface CommentData {
  id?: string
  post_id: string
  author_id?: string
  content: string
  parent_id?: string | null
  status?: string
  created_at?: string
  [key: string]: unknown
}

// --- Notification API ---
export interface NotificationItem {
  id: string
  recipient_id: string
  sender_id: string
  type: string
  content?: string
  status: string
  created_at: string
  [key: string]: unknown
}

// --- Profile API ---
export interface ProfileUpdateParams {
  username?: string
  bio?: string
  avatar_url?: string
  birth_month?: string
  birth_day?: string
  join_date?: string
  profile_background_url?: string
  profile_background_public_id?: string
  is_boh_creator?: boolean
  creator_platform_ids?: Record<string, string>
  creator_platform_visibility?: Record<string, string>
  creator_platform_order?: string[]
  showcase_post_ids?: string[]
  [key: string]: unknown
}

// --- Moderation ---
export interface ModerationResult {
  status: 'approved' | 'rejected'
  reason?: string
  score?: number
}