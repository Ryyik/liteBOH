// ============================================
// BOH 项目核心类型定义
// 用于 Stores、Router、API 层的渐进式 TypeScript 迁移
// ============================================

// --- Auth Store ---
export interface UserInfo {
  id: string
  username: string
  email: string
  role: string
  points: number
  joinDate: string
  tags: string[]
  birthMonth: string
  birthDay: string
  avatarUrl: string
  profileBackgroundUrl: string
  profileBackgroundPublicId: string
  bio: string
  experience: number
  isBohCreator: boolean
  creatorPlatformIds: Record<string, string>
  creatorPlatformVisibility: Record<string, string>
  creatorPlatformOrder: string[]
  showcasePostIds: string[]
}

export interface LoginResult {
  success: boolean
  message: string
  code?: string
  requireCaptcha?: boolean
}

export interface AsyncOpResult {
  success: boolean
  message: string
  code?: string
}

// --- Bag Store ---
export interface BagItem {
  id: number
  points_cost: number
  quantity: number
  selectedSpec?: string
  selectedSpecLabel?: string
  [key: string]: unknown
}

export interface BagOpResult {
  ok: boolean
  reason?: string
}

// --- Products Store ---
export interface ProductSpec {
  label: string
  value: string
}

export interface Product {
  id: number
  category: string
  title: string
  description: string
  points_cost: number
  stock: number
  image: string
  specifications: ProductSpec[]
  is_active: boolean
}

// --- Router ---
export interface RouteMeta {
  requiresLogin?: boolean
  requiresAdmin?: boolean
}

// --- Notification ---
export interface NotificationPayload {
  type: 'like' | 'comment' | 'impression' | 'lottery_win' | string
  content?: string
  [key: string]: unknown
}

// Re-export from api.ts
export type { NotificationItem } from './api.js'