import type { RouteRecordRaw } from 'vue-router';

// ⚠️ 兼容重定向（/activities、/forum、/block-wall 等）已全部收进 routes/compat.ts
// 单一登记处（2026-10-15 起）—— 本文件只放真页面，别再往回加 redirect。
export const communityRoutes: RouteRecordRaw[] = [
  {
    path: '/overview',
    name: 'SmartOverview',
    component: () => import('../../views/SmartOverview/index.vue'),
    meta: { requiresLogin: true },
  },
  {
    // 资讯页（2026-10-20 内容页合并）：新闻 + 节目混排（?tab=feed 默认）+ 活动（?tab=activities）。
    // 原 /activities-wall 独立页已收编进本页活动段，旧路径的重定向登记在 compat.ts。
    path: '/newsroom',
    name: 'Newsroom',
    component: () => import('../../views/Newsroom/index.vue'),
  },
  {
    // 新闻独立详情页（BETA 6 / S4）：真实 URL，可分享/刷新/前进后退 + OG meta。
    // news 表暂无 slug 列，参数用 id；将来加 slug 列后此参数天然兼容（按 id 查）。
    path: '/news/:id',
    name: 'NewsDetail',
    component: () => import('../../views/Newsroom/NewsDetailPage.vue'),
  },
  // ⚠️ /activities-wall 已于 2026-10-20「内容页合并」退场 → /newsroom?tab=activities。
  // 重定向**只能**登记在 routes/compat.ts：本文件只放真页面，
  // compat-routes.test.js 会断言「各真页面路由文件里不再有 redirect 条目」。
  {
    path: '/lotteries',
    name: 'CommunityLotteries',
    component: () => import('../../views/CommunityLotteries/index.vue'),
  },
  {
    // 摄影集：社区影集区（封面入口卡网格，仅 published+shared，RLS 兜底）
    path: '/albums',
    name: 'CommunityAlbums',
    component: () => import('../../views/CommunityAlbums/index.vue'),
  },
  {
    // 摄影集：阅读页（公开可访问；未公开影集仅作者可见，由 RLS 保证）
    // immersiveNav：导航收成左上角迷你球，最大化书本阅读空间
    path: '/albums/:id',
    name: 'PhotoAlbumReader',
    meta: { immersiveNav: true },
    component: () => import('../../views/PhotoAlbumReader/index.vue'),
  },
  {
    // 摄影集：编辑器（仅作者本人，未登录走全局登录拦截）
    // immersiveNav：创作场景导航收成左上角迷你球，工具栏左端让位
    path: '/studio/albums/:id',
    name: 'PhotoAlbumEditor',
    meta: { requiresLogin: true, immersiveNav: true },
    component: () => import('../../views/PhotoAlbumEditor/index.vue'),
  },
  {
    path: '/forum/post/:id',
    name: 'PostDetail',
    meta: { hideNavbar: true },
    component: () => import('../../views/PostDetail/index.vue'),
  },
  {
    path: '/profile/:username',
    name: 'UserProfile',
    meta: { hideNavbar: true },
    component: () => import('../../views/Profile/index.vue'),
  },
];
