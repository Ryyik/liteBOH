/**
 * 顶栏导航单源（2026-09-27 抽出）
 *
 * 原先是 `UnifiedNavbar/index.vue` 里的一枚组件内常量。抽出原因：全局搜索
 * （plans/020）需要一份「功能与页面」索引，若在搜索侧再抄一份菜单，就会出现
 * 两份会各自漂移的导航真相 —— 加了页面只改了导航、搜索里搜不到，反之亦然。
 *
 * 消费方两处共用同一份：
 *   1. UnifiedNavbar 的渲染（`navItems` computed 在这里 import 后再叠 isActive / isExpanded）
 *   2. 全局搜索的「功能与页面」结果组（走 flattenSiteNavPages）
 *
 * 改这里两处同步生效 —— 与 `bottom-nav.ts` / `forum-sections.ts` 同范式。
 */
import type { Component } from 'vue';

export interface SiteNavNode {
  name: string;
  label: string;
  /** 可路由落点。与 action 二选一 */
  path?: string;
  /** 非路由动作（由 UnifiedNavbar.handleMenuAction 处理） */
  action?: string;
  /** 仅管理员可见（渲染与索引都要过滤） */
  adminOnly?: boolean;
  children?: SiteNavNode[];
}

/**
 * 顶栏菜单结构。支持二级 / 三级：`children` 为二级项，`children[].children` 为三级分组
 * （分组标题无 path，仅作下钻容器）。
 */
export const SITE_NAV_ITEMS: SiteNavNode[] = [
  { name: 'index', path: '/', label: '首页' },
  {
    name: 'community',
    label: '社区',
    children: [
      { name: 'smart-overview', path: '/overview', label: '智能概览' },
      { name: 'news-shows', path: '/newsroom', label: '新闻&节目' },
      { name: 'forum', path: '/?view=latest', label: '论坛' },
      { name: 'activities-wall', path: '/activities-wall', label: '活动&方块墙' },
      { name: 'photo-albums', path: '/albums', label: '摄影集' },
      { name: 'lotteries', path: '/lotteries', label: '抽奖' },
    ],
  },
  {
    name: 'explore',
    label: '探索',
    children: [
      { name: 'boh-app', path: '/app', label: 'BOH App' },
      {
        name: 'ai-group',
        label: 'AI 助手',
        children: [
          { name: 'boh-agent', action: 'openAiAssistant', label: 'BOHAgent' },
          { name: 'ai-chat', path: '/ai-chat', label: 'BOH AI' },
        ],
      },
      {
        name: 'lab-group',
        label: '实验室',
        children: [
          { name: 'lab', path: '/lab', label: '实验室' },
          { name: 'mbti', path: '/mbti', label: 'MBTI' },
        ],
      },
      {
        name: 'world-group',
        label: '方块世界',
        children: [
          { name: 'character-book', path: '/character-book', label: '设定集' },
          { name: 'birthday', path: '/birthday', label: '生日会' },
          { name: 'boh-8-years-journey', path: '/boh-8-years-journey', label: '八周年' },
        ],
      },
    ],
  },
  {
    name: 'services',
    label: '服务',
    children: [
      {
        name: 'health-group',
        label: '健康服务',
        children: [{ name: 'boh-health', path: '/health', label: 'BOH Health' }],
      },
      { name: 'shop', path: '/shop', label: '周边商城' },
      { name: 'subscription', path: '/user-space/subscriptions', label: '订阅计划' },
      {
        name: 'support-group',
        label: '支持中心',
        children: [
          // 教程中心已融合进资源中心单页（/download，/tutorial 重定向到此）
          { name: 'resources', path: '/download', label: '资源中心' },
          { name: 'admin-panel', action: 'goToAdmin', label: '管理面板', adminOnly: true },
        ],
      },
    ],
  },
  {
    name: 'about',
    label: '关于',
    children: [
      { name: 'anniversary-cafe', path: '/anniversary-cafe', label: '云上咖啡店' },
      { name: 'version-check', action: 'checkVersion', label: '版本检测' },
      { name: 'about', path: '/about', label: '关于我们' },
    ],
  },
];

/** 扁平化后的可搜页面条目（供全局搜索消费） */
export interface SiteNavSearchPage {
  /** 沿用菜单 name，作为结果项的稳定 key */
  id: string;
  label: string;
  path: string;
  /** 所属层级路径，如「社区」/「探索 / 实验室」 */
  category: string;
}

/**
 * 把菜单树拍平成可搜页面列表。
 * - 只收 `path` 节点（有 action 的项没有落点，搜索无法跳转，故不收）；
 * - 默认剔除 adminOnly（非管理员不该在搜索里看到管理面板）；
 * - 三级分组的 label 作为 category 前缀，让「实验室」这类词也能命中其下页面。
 */
export const flattenSiteNavPages = (
  items: SiteNavNode[] = SITE_NAV_ITEMS,
  trail: string[] = [],
  out: SiteNavSearchPage[] = [],
): SiteNavSearchPage[] => {
  for (const item of items) {
    if (item.adminOnly) continue;
    if (item.path) {
      out.push({
        id: item.name,
        label: item.label,
        path: item.path,
        category: trail.join(' / '),
      });
    }
    if (item.children?.length) {
      flattenSiteNavPages(item.children, [...trail, item.label], out);
    }
  }
  return out;
};

/** 便于消费方给图标用的类型别名（与 vue Component 对齐） */
export type SiteNavIcon = Component;
