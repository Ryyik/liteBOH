/**
 * 底部导航单源（2026-09-23 恢复五席）
 *
 * 全站唯一一组底栏 items（用户指定顺序）：**方块 / 我的 / 资产 / 消息 / 设置**。
 *
 * 「方块」= 论坛本体（官方 / 最新 / 关注 / 新闻 / 活动 / 成员 / 印象），
 * 落在首页 `/`（首屏街景 Hero 下滑直达），故 route 给 "/" —— 跨模块导航。
 * 其余四席都是 UserSpace 的分区（route 带 tab 参数）。
 *
 * 消费方三处共用同一份：UserSpace 底栏（UserSpaceBottomNav）、横屏左栏
 * （UserSpaceSideRail）、首页底栏 —— 改这里三处同步生效。
 */
import { LayoutGrid, MessageCircle, Settings, User, Wallet } from 'lucide-vue-next'
import type { Component } from 'vue'

export interface BottomNavItem {
  id: string
  label: string
  icon: Component
  /** 点击落点（底栏跨模块导航，故直接给路由而非 tab id） */
  route: string
  /** 未读徽标数据源；当前仅「消息」有 */
  badge?: 'messages'
}

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'community', label: '方块', icon: LayoutGrid, route: '/' },
  { id: 'posts', label: '我的', icon: User, route: '/user-space?tab=posts' },
  { id: 'assets', label: '资产', icon: Wallet, route: '/user-space?tab=assets' },
  { id: 'messages', label: '消息', icon: MessageCircle, route: '/user-space?tab=messages', badge: 'messages' },
  { id: 'settings', label: '设置', icon: Settings, route: '/user-space?tab=settings' }
]

/**
 * UserSpace tab → 底栏高亮项。
 * 2026-09-23 恢复五席后已是 1:1（资产重新占底栏），保留映射表是为了让消费方
 * 只依赖这一个函数 —— 将来若再合并席位，只改这里。
 */
export const USERSPACE_TAB_TO_BOTTOM_NAV_ID: Record<string, string> = {
  community: 'community',
  posts: 'posts',
  assets: 'assets',
  messages: 'messages',
  settings: 'settings'
}

export const resolveBottomNavIdForUserSpaceTab = (tab: unknown): string =>
  USERSPACE_TAB_TO_BOTTOM_NAV_ID[String(tab || '')] || ''
