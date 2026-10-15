import type { RouteRecordRaw } from 'vue-router';
import { resolveForumSection } from '../../config/forum-sections';

/**
 * 兼容路由单文件 —— 「旧深链不 404」的全部代价集中在这里（唯一登记处）。
 *
 * 政策（2026-10-15 定稿，收敛自两轮 IA 改造留下的 30 条散落重定向）：
 *   · **新增兼容一律进本文件**，不许散回各 routes/*.ts —— 「还有多少旧路径在服役」
 *     一眼可见；RouteIndex（/#/__dev/routes）里也单独成节可点。
 *   · 每条（族）标「引入 / 到期」。IA 类改造的默认生命期 = **6 个月**，到期按
 *     unknown_route 埋点（utils/monitoring.js）的真实命中量决定续或删 ——
 *     重定向的敌人不是「存在」，而是「没有度量 + 永久存在」。
 *   · 本层只放重定向，不放任何 component —— 有组件的都是真页面（见各 routes/*.ts）。
 *   · 改动本文件的验收：单测 tests/unit/compat-routes.test.js（折叠覆盖 + 落点对照）
 *     + 全量 verify。
 *
 * 现行清单（17 条 = 2 参数化 + 15 直条）：
 *   · 旧用户中心 /user-center/*（引入 ≤2026-06）：12 条折叠为 2 条（见下方分节）
 *   · 旧用户空间深链（引入 2026-09-30，tab 语义迁移）：8 条
 *   · Beta 6 退场（引入 2026-09-27）：/forum、/activities(×3)、/block-wall、/tutorial
 *
 * 变更史：
 *   2026-10-15 收编 30 条里的 17 条 + 折叠(11→2) + 删除 3 条零引用
 *   （/user-center-v2、/creator-studio、/user-space/settings/beta-preview）+
 *   修正 /forum 误落（原 `?tab=posts` 在 tab 语义翻转后是「我」页，现落首页论坛）。
 */

/** 落到 /user-space 并合并额外 query（旧深链的 query 一律透传） */
const toUserSpace =
  (extra: Record<string, string> = {}): any =>
  (to: any) => ({ path: '/user-space', query: { ...to.query, ...extra } });

/** 落到独立子页并透传 query */
const toPage =
  (path: string): any =>
  (to: any) => ({ path, query: { ...to.query } });

/**
 * /user-center/<rest…> 的前缀分流 —— 与折叠前 11 条直条**逐条对照、落点不变**：
 *   points / subscriptions / address → 资产分段（旧 `?tab=assets`，UserSpaceMain 有回落）
 *   messages → 消息 tab；tags-impressions → 印象分段；partners / pushplus / shared-memories → 独立子页
 *   其余（info、未知子路径）→ 「我」页默认（空间分段）
 */
const userCenterTarget = (to: any) => {
  const head = String(to?.params?.rest || '').split('/')[0];
  if (head === 'messages') {
    return {
      path: '/user-space',
      query: { ...to.query, tab: 'messages', section: 'notifications' },
    };
  }
  if (head === 'points' || head === 'subscriptions' || head === 'address') {
    return { path: '/user-space', query: { ...to.query, tab: 'assets' } };
  }
  if (head === 'tags-impressions') {
    return { path: '/user-space', query: { ...to.query, tab: 'posts', view: 'impressions' } };
  }
  if (head === 'partners') return toPage('/user-space/partners')(to);
  if (head === 'pushplus' || head === 'pushplus-settings') {
    return toPage('/user-space/pushplus-settings')(to);
  }
  if (head === 'shared-memories') return toPage('/user-space/shared-memories')(to);
  return toUserSpace({ tab: 'posts' })(to);
};

export const compatRoutes: RouteRecordRaw[] = [
  // ═══ 旧用户中心 /user-center/* ═══════════════════════════════════════════
  // 引入 ≤2026-06（旧版用户中心退场，全套迁 /user-space）· 到期 2027-03-31
  // 折叠：12 条 → 2 条。⚠️ 精确路径先声明，参数路由兜任意深度子路径。
  {
    path: '/user-center',
    redirect: toUserSpace({ tab: 'posts' }),
  },
  {
    path: '/user-center/:rest(.*)',
    redirect: userCenterTarget,
  },

  // ═══ 旧用户空间深链（2026-09-30 tab 语义迁移）════════════════════════════
  // 引入 2026-09-30 · 到期 2027-03-31
  // 口径真源见 UserSpaceMain.vue 的 LEGACY_TAB_MAP 注释：旧 tab=posts 的语义是「论坛」，
  // 论坛现居 community tab ⇒ posts ↔ community 是**互换成对**的，改一条必须同时看另一条。
  {
    path: '/user-space/posts',
    redirect: toUserSpace({ tab: 'community' }),
  },
  {
    path: '/user-space/community',
    redirect: toUserSpace({ tab: 'posts' }),
  },
  {
    path: '/user-space/ai',
    redirect: toUserSpace({ tab: 'messages' }),
  },
  {
    path: '/user-space/assets',
    redirect: toUserSpace({ tab: 'assets' }),
  },
  {
    path: '/user-space/settings',
    redirect: toUserSpace({ tab: 'settings' }),
  },
  {
    path: '/user-space/profile',
    redirect: toUserSpace({ tab: 'posts' }),
  },
  {
    path: '/user-space/messages',
    redirect: toUserSpace({ tab: 'messages', section: 'notifications' }),
  },
  {
    path: '/user-space/tags-impressions',
    redirect: toUserSpace({ tab: 'posts', view: 'impressions' }),
  },
  {
    path: '/mailbox',
    redirect: toUserSpace({ tab: 'messages', section: 'notifications' }),
  },

  // ═══ Beta 6 退场（2026-09-27）═══════════════════════════════════════════
  // 引入 2026-09-27 · 到期 2027-03-31
  {
    // ⚠️ 2026-10-15 修正：原 target 是 `?tab=posts`，但 09-30 tab 语义翻转后
    // `tab=posts` = 「我」页 —— 旧论坛链接一直误导到个人空间（正确语义见
    // /user-space/posts → community 那条）。现与顶栏「社区 → 论坛」同款落点：
    // 首页 + view 分区；非法/缺失 view 由 resolveForumSection 回落「最新」。
    path: '/forum',
    name: 'Forum',
    redirect: (to: any) => ({
      path: '/',
      query: { ...to.query, view: resolveForumSection(to.query?.view) },
    }),
  },
  {
    // 旧活动页深链兼容：全部导向组合页的活动面板
    path: '/activities',
    name: 'Activities',
    redirect: (to: any) => ({ path: '/activities-wall', query: { ...to.query } }),
    children: [
      {
        path: 'photo-wall',
        name: 'ActivitiesPhotoWall',
        redirect: (to: any) => ({ path: '/activities-wall', query: { ...to.query } }),
      },
      {
        path: 'list',
        name: 'ActivitiesList',
        redirect: (to: any) => ({ path: '/activities-wall', query: { ...to.query } }),
      },
    ],
  },
  {
    // 旧方块墙深链兼容。⚠️ name 供命名跳转（CommunityTab 的「方块墙」入口
    // 走 router.push({ name: 'BlockWall' })），删改 name 前先全仓搜。
    path: '/block-wall',
    name: 'BlockWall',
    redirect: (to: any) => ({ path: '/activities-wall', query: { ...to.query, tab: 'wall' } }),
  },
  {
    // 教程中心已融合进资源中心（/download）
    path: '/tutorial',
    name: 'Tutorial',
    redirect: '/download',
  },
];
