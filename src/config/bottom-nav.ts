/**
 * 底部导航单源（2026-09-30 收敛为四席，2026-10-22 补回第五席「图库」）
 *
 * 全站唯一一组底栏 items（用户指定顺序）：**内容 / 消息 / AI / 图库 / 我**。
 *
 * 「内容」= 论坛本体（官方 / 最新 / 关注 / 成员），落在首页 `/`（首屏街景 Hero 下滑直达），
 * 故 route 给 "/" —— 跨模块导航。
 * 「AI」是**跨模块全屏落点**（/ai-chat），`fullPage: true` —— 点它是离开本模块，
 * 不参与 UserSpace 的 tab 切换与选中态。岛 / 右边缘滑动 / 全局搜索三处入口仍保留，
 * 硬约束是它们必须收敛到**同一实例、同一份会话状态**。
 * 「图库」= BOH Cloud+（/user-space/note），`fullPage: true` —— 同样是独立页而非 UserSpace 的 tab。
 * 「我」= UserSpace 的个人页，内部三段（空间 / 资产 / 印象）。
 *
 * 2026-09-30 撤掉的两席（收敛，不是砍功能）：
 *   · 「资产」→ 降为「我」页内的分段（与空间/印象同一套 SegmentTabs）
 *   · 「设置」→ 降为资料卡右上角的文字入口，不占导航席
 *
 * 2026-10-22 为什么补的是「图库」而不是「商城」（决策记录，别再翻案前先读这段）：
 *   · 频率：图库是私人照片/图文笔记，日-周频；商城 13 个 SKU、积分靠每周签到攒，月频。
 *     底栏是每天都会被看到的位置，放月频功能是浪费。
 *   · 语义：现有四席是「人 → 内容 → 自己」，图库是「我」的延伸（补全）；
 *     商城是交易，插在 AI 与「我」之间会让新用户第一眼读成电商 App。
 *   · 架构：商城自带四席底栏（为你推荐/产品/深入探索/购物袋），其中购物袋有 badge、
 *     cart-bounce 与独立结算流程，**降级不掉** ⇒ 进全局底栏必须先解决「购物袋放哪」。
 *     图库自带的三席（内容/分享/设置）是视图分段，可降级为页面内 SegmentTabs（2026-10-22 已改）。
 *   · 商业：图库的图片额度由订阅等级决定（`resolveCloudBenefitFromSubscriptions`），
 *     底栏是「额度快满」最自然的提醒位。
 *   ⇒ 商城的正确出口是「我」页资产段的积分卡 + 内容流商品卡，不是底栏席位。
 *
 * 消费方三处共用同一份：UserSpace 底栏（UserSpaceBottomNav）、横屏左栏
 * （UserSpaceSideRail）、首页底栏（Home/index.vue）—— 改这里三处同步生效。
 * 另有 Cloud+（CloudPlusMain.vue）与公开主页 ProfileMain.vue 复用。
 */
import { Images, LayoutGrid, MessageCircle, Sparkles, User } from 'lucide-vue-next';
import type { Component } from 'vue';

export interface BottomNavItem {
  id: string;
  label: string;
  icon: Component;
  /** 点击落点（底栏跨模块导航，故直接给路由而非 tab id） */
  route: string;
  /** 未读徽标数据源；当前仅「消息」有 */
  badge?: 'messages';
  /**
   * 跨模块全屏落点：点它离开 UserSpace（走 router.push(item.route)），
   * 不参与 tab 切换，也不会成为 UserSpace 的选中项。
   */
  fullPage?: boolean;
}

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { id: 'community', label: '内容', icon: LayoutGrid, route: '/' },
  {
    id: 'messages',
    label: '消息',
    icon: MessageCircle,
    route: '/user-space?tab=messages',
    badge: 'messages',
  },
  { id: 'ai', label: 'AI', icon: Sparkles, route: '/ai-chat', fullPage: true },
  { id: 'cloud', label: '图库', icon: Images, route: '/user-space/note', fullPage: true },
  { id: 'posts', label: '我', icon: User, route: '/user-space?tab=posts' },
];

/**
 * UserSpace tab → 底栏高亮项。
 *
 * 2026-09-30 收席后**不再是 1:1**：`assets` 与 `settings` 已下沉进「我」页
 * （资产是分段，设置是资料卡入口），所以两者都高亮「我」。
 * 保留映射表是为了让消费方只依赖这一个函数 —— 将来若再合并席位，只改这里。
 */
export const USERSPACE_TAB_TO_BOTTOM_NAV_ID: Record<string, string> = {
  community: 'community',
  posts: 'posts',
  assets: 'posts',
  messages: 'messages',
  settings: 'posts',
};

export const resolveBottomNavIdForUserSpaceTab = (tab: unknown): string =>
  USERSPACE_TAB_TO_BOTTOM_NAV_ID[String(tab || '')] || '';
