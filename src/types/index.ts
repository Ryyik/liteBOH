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
  pointsCardSkin: string
  pointsCardImageUrl: string
  pointsCardImagePublicId: string
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
export type HomeHeroTemplate = 'standard' | 'overlay' | 'split' | 'responsive' | 'builtin'
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
  src?: string // 主图片（桌面端）
  alt?: string
  position?: string // 图片定位，如 'center 54%'
  // 竖屏端独立配置（留空则继承桌面端）
  mobile_src?: string // 竖屏端独立图片
  mobile_position?: string // 竖屏端图片定位
  mobile_object_fit?: 'cover' | 'contain' // 竖屏端填充模式
  mobile_scale?: number // 竖屏端取景缩放，1 表示原始取景
  // responsive 模板专用
  landscapeSrc?: string // 横屏图
  portraitSrc?: string // 竖屏图
  portrait_position?: string // responsive 竖屏图定位
}

/**
 * 文字区块布局配置
 * 控制英雄区内文字（眉题/标题/副标题/按钮）的位置和对齐
 */
export interface ContentLayoutValues {
  align?: 'left' | 'center' | 'right' // 水平位置（flex justify-content）
  valign?: 'top' | 'center' | 'bottom' // 垂直位置（flex align-items）
  text_align?: 'left' | 'center' | 'right' // 文字对齐方向
  max_width?: number // 文字最大宽度（px），控制换行密度
  offset_x?: number // 相对锚点的水平偏移（px）
  offset_y?: number // 相对锚点的垂直偏移（px）
}

/**
 * 文字布局可按设备分别配置。旧记录仍可直接使用顶层字段，竖屏未配置时继承桌面端。
 */
export interface ContentLayout extends ContentLayoutValues {
  desktop?: ContentLayoutValues
  mobile?: ContentLayoutValues | null
}

export interface SplitCardConfig {
  title: string
  subtitle?: string
  variant?: HomeHeroVariant
  image_config: HeroImageConfig
  links: HeroLink[]
  content_layout?: ContentLayout | null
}

export interface HomeHero {
  id: string
  sort_order: number
  is_archived: boolean
  template: HomeHeroTemplate
  variant: HomeHeroVariant
  builtin_key?: string | null
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  image_config: HeroImageConfig
  content_layout?: ContentLayout | null
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
