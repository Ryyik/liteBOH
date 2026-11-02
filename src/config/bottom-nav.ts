/**
 * 底部导航单源（2026-09-30 收敛为四席，2026-10-22 补回「图库」，2026-11-01 去 AI 加购物袋）
 *
 * 全站唯一一组底栏 items（用户指定顺序）：**内容 / 消息 / 图库 / 周边 / 我**。
 *
 * 「内容」= 论坛本体（官方 / 最新 / 关注 / 成员），落在首页 `/`（首屏街景 Hero 下滑直达），
 * 故 route 给 "/" —— 跨模块导航。
 * 「图库」= BOH Cloud+（/user-space/note），`fullPage: true` —— 独立页而非 UserSpace 的 tab。
 * 「周边」= 周边商城（/shop，2026-11-01 起商城与抽奖合并为三 Tab：产品 / 抽奖 / 购物袋），
 *   `fullPage: true`。⚠️ 席位是**周边**（整页），不是购物袋：
 *   购物袋既是页内第三个 Tab，也有独立页 /shop/bag（右上角头像直达、看购物与抽奖订单），
 *   但它不单独占席位 —— 用户口径「userspace 的底部导航栏是周边」。
 * 「我」= UserSpace 的个人页，内部三段（空间 / 资产 / 印象）。
 *
 * 2026-11-01 为什么下掉「AI」席（决策记录，别再翻案前先读这段）：
 *   · 用户原话「底栏把 AI 下掉」—— 席位让给周边。底栏回到五席，390px 下每席仍有余量。
 *   · AI 不是功能退场：它还有三处入口（灵动岛 / 右边缘滑动 / 全局搜索），
 *     落点仍是 `/ai-chat`。只是不再占底栏一席。
 *   · ⚠️ `aiOverlayOpen` 这条高亮通道保留 —— AI 全屏浮层打开时若底栏可见，
 *     仍需把「AI」相关态压住（浮层自己会盖住底栏），别顺手删掉。
 *
 * 2026-09-30 撤掉的两席（收敛，不是砍功能）：
 *   · 「资产」→ 降为「我」页内的分段（与空间/印象同一套 SegmentTabs）
 *   · 「设置」→ 降为资料卡右上角的文字入口，不占导航席
 *
 * 2026-10-22 补「图库」时的取舍（历史记录，仍有效）：
 *   · 频率：图库是私人照片/图文笔记，日-周频；商城 13 个 SKU、积分靠每周签到攒，月频。
 *   · 语义：四席是「人 → 内容 → 自己」，图库是「我」的延伸（补全）。
 *   ⇒ 2026-11-01 的购物袋席与这条不冲突：进底栏的是**购物袋/订单**（高频回访），
 *     不是商城本身 —— 商城的正确出口仍是「我」页资产段 + 内容流商品卡。
 *
 * 消费方共用同一份：UserSpace 底栏（UserSpaceBottomNav）、横屏左栏
 * （UserSpaceSideRail）、首页底栏（Home/index.vue）、购物袋页（Shop/BagPage.vue）
 * —— 改这里各处同步生效。
 */
import { Images, LayoutGrid, MessageCircle, ShoppingBag, User } from 'lucide-vue-next';
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
  /* 2026-11-01 用户口径：「周边页面的顺序与图库的位置互换」⇒ 周边回到第三席、
     图库第四席。与旧版三席位置（内容 / 消息 / 图库 / 周边 / 我）的差异只在 3、4 位，
     消费方全部读这份配置，无需改任何宿主。 */
  { id: 'shop', label: '周边', icon: ShoppingBag, route: '/shop', fullPage: true },
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
