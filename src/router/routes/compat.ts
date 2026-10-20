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
 * 现行清单（19 条 = 2 参数化 + 17 直条）：
 *   · 旧用户中心 /user-center/*（引入 ≤2026-06）：12 条折叠为 2 条（见下方分节）
 *   · 旧用户空间深链（引入 2026-09-30，tab 语义迁移）：8 条
 *   · Beta 6 退场（引入 2026-09-27）：/forum、/activities(×3)、/block-wall、/tutorial
 *   · 实验室退场（引入 2026-10-19）：/lab → BOHAI Work
 *
 * 变更史：
 *   2026-10-19 新增 1 条：/user-space/partners（孤儿页）收编 → 论坛「成员」分区
 *   2026-10-19 新增 1 条：/lab（实验室功能退场）→ /ai-chat?surface=work；
 *     同日 /block-wall 落点修正（方块墙退场，?tab=wall 不复存在）。
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

/** 落到首页论坛「成员」分区（2026-10-19：/user-space/partners 孤儿页的收编落点） */
const toForumMembers = (to: any) => ({ path: '/', query: { ...to.query, view: 'members' } });

/**
 * /user-center/<rest…> 的前缀分流 —— 与折叠前 11 条直条**逐条对照、落点不变**：
 *   points / subscriptions / address → 资产分段（旧 `?tab=assets`，UserSpaceMain 有回落）
 *   messages → 消息 tab；tags-impressions → 印象分段；partners → 论坛「成员」分区；pushplus / shared-memories → 独立子页
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
  if (head === 'partners') return toForumMembers(to);
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

  // ═══ 孤儿页收编（2026-10-19）═══════════════════════════════════════════
  // 引入 2026-10-19 · 到期 2027-04-30
  // /user-space/partners（社区成员目录）全站零 UI 入口（孤儿页）；「浏览成员」的能力
  // 已由论坛「成员」分区承接（?view=members → CommunityTab）⇒ 删真页面，老链接重定向过去。
  {
    path: '/user-space/partners',
    redirect: toForumMembers,
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
    // 旧活动页深链兼容：全部导向「资讯」页的活动段（2026-10-20 内容页合并后
    // /activities-wall 独立页退场，活动成为 /newsroom 的一个段）。
    path: '/activities',
    name: 'Activities',
    redirect: (to: any) => ({ path: '/newsroom', query: { ...to.query, tab: 'activities' } }),
    children: [
      {
        path: 'photo-wall',
        name: 'ActivitiesPhotoWall',
        redirect: (to: any) => ({ path: '/newsroom', query: { ...to.query, tab: 'activities' } }),
      },
      {
        path: 'list',
        name: 'ActivitiesList',
        redirect: (to: any) => ({ path: '/newsroom', query: { ...to.query, tab: 'activities' } }),
      },
    ],
  },
  {
    // 活动墙退场兼容（2026-10-20 内容页合并）：/activities-wall → 资讯页活动段。
    // 引入 2026-10-20 · 到期 2027-04-30（沿用 IA 类改造 6 个月生命期）。
    path: '/activities-wall',
    name: 'ActivitiesWall',
    redirect: (to: any) => ({ path: '/newsroom', query: { ...to.query, tab: 'activities' } }),
  },
  {
    // 方块墙深链兼容（2026-10-19 方块墙退场）：落到活动段（内容已并入资讯页）。
    // ⚠️ name 供命名跳转兜底；?tab=wall 不复存在。
    path: '/block-wall',
    name: 'BlockWall',
    redirect: (to: any) => ({ path: '/newsroom', query: { ...to.query, tab: 'activities' } }),
  },
  {
    // 节目页退场兼容（2026-10-20 内容页合并）：节目已混排进资讯流，
    // 创作者投稿（CreatorShowsPanel）挂在资讯流的「节目」筛选态下。
    // 引入 2026-10-20 · 到期 2027-04-30
    path: '/shows',
    name: 'Shows',
    redirect: (to: any) => ({ path: '/newsroom', query: { ...to.query, filter: 'show:all' } }),
  },
  {
    // 实验室退场兼容（2026-10-19）：/lab → BOHAI Work（/ai-chat 的 work 大模式）。
    // 引入 2026-10-19，默认 6 个月生命期，到期按 unknown_route 埋点决定续或删。
    path: '/lab',
    name: 'Lab',
    redirect: '/ai-chat?surface=work',
  },
  {
    // 教程中心已融合进资源中心（/download）
    path: '/tutorial',
    name: 'Tutorial',
    redirect: '/download',
  },
];
