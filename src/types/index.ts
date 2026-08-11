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
  lastActiveAt: string | null
  hideOnlineStatus: boolean
  hideFollowData: boolean
  // 封禁/禁言状态
  isBanned: boolean
  isMuted: boolean
  banReason: string | null
  muteReason: string | null
  bannedUntil: string | null
  mutedUntil: string | null
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
  rmb_price?: number | null
  payment_mode?: string
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

export type PaymentMode = 'points_only' | 'rmb_only' | 'combined'

export interface Product {
  id: number
  category: string
  title: string
  description: string
  points_cost: number
  rmb_price?: number | null
  payment_mode?: PaymentMode
  stock: number
  image: string
  specifications: ProductSpec[]
  is_active: boolean
  is_purchasable: boolean
}

// --- Router ---
export interface RouteMeta {
  requiresLogin?: boolean
  requiresAdmin?: boolean
}

// --- Notification ---
// 通知类型联合类型
export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'impression'
  | 'gift'
  | 'lottery_win'
  | 'system'
  | 'post_rejected'
  | 'post_report_limited'
  | 'comment_rejected'

export interface NotificationPayload {
  type: NotificationType
  content?: string
  [key: string]: unknown
}

// --- Home Heroes Store ---
export type HomeHeroTemplate = 'standard' | 'overlay' | 'split' | 'responsive'
export type HomeHeroVariant = 'light' | 'dark'
export type HomeHeroStatus = 'draft' | 'published'

export interface HeroLink {
  text: string
  type?: 'primary' | 'secondary'
  to?: string
  href?: string
  onClick?: string // 形如 'modal:fuzhou'，由前端解析
}

export interface HeroImageConfig {
  src?: string
  alt?: string
  position?: string // overlay 模板的图片定位，如 'center 54%'
  landscapeSrc?: string // responsive 模板的横屏图
  portraitSrc?: string // responsive 模板的竖屏图
}

export interface SplitCardConfig {
  title: string
  subtitle?: string
  variant?: HomeHeroVariant
  image_config: HeroImageConfig
  links: HeroLink[]
}

export interface HomeHero {
  id: string
  sort_order: number
  is_archived: boolean
  template: HomeHeroTemplate
  variant: HomeHeroVariant
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  image_config: HeroImageConfig
  links: HeroLink[]
  split_cards?: SplitCardConfig[] | null
  label?: string | null
  aria_label?: string | null
  status: HomeHeroStatus
  published_at?: string | null
  published_by?: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
}

export interface HomeHeroRevision {
  id: string
  hero_id: string
  snapshot: HomeHero
  published_at: string
  published_by?: string | null
}
