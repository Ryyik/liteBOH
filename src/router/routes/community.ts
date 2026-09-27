import type { RouteRecordRaw } from 'vue-router'

export const communityRoutes: RouteRecordRaw[] = [
  {
    path: "/overview",
    name: "SmartOverview",
    component: () => import("../../views/SmartOverview/index.vue"),
    meta: { requiresLogin: true },
  },
  {
    path: "/newsroom",
    name: "Newsroom",
    component: () => import("../../views/Newsroom/index.vue"),
  },
  {
    // 新闻独立详情页（BETA 6 / S4）：真实 URL，可分享/刷新/前进后退 + OG meta。
    // news 表暂无 slug 列，参数用 id；将来加 slug 列后此参数天然兼容（按 id 查）。
    path: "/news/:id",
    name: "NewsDetail",
    component: () => import("../../views/Newsroom/NewsDetailPage.vue"),
  },
  {
    // 活动与方块墙组合页（液态玻璃分段切换）
    path: "/activities-wall",
    name: "ActivitiesWall",
    component: () => import("../../views/ActivitiesWall/index.vue"),
  },
  {
    // 旧活动页深链兼容：全部导向组合页的活动面板
    path: "/activities",
    name: "Activities",
    redirect: (to) => ({
      path: "/activities-wall",
      query: { ...to.query },
    }),
    children: [
      {
        path: "photo-wall",
        name: "ActivitiesPhotoWall",
        redirect: (to) => ({
          path: "/activities-wall",
          query: { ...to.query },
        }),
      },
      {
        path: "list",
        name: "ActivitiesList",
        redirect: (to) => ({
          path: "/activities-wall",
          query: { ...to.query },
        }),
      },
    ],
  },
  {
    path: "/forum",
    name: "Forum",
    redirect: (to) => ({
      path: "/user-space",
      query: {
        ...to.query,
        tab: "posts",
      },
    }),
  },
  {
    path: "/lotteries",
    name: "CommunityLotteries",
    component: () => import("../../views/CommunityLotteries/index.vue"),
  },
  {
    // 旧方块墙深链兼容：导向组合页的方块墙面板（保留 name 供命名跳转）
    path: "/block-wall",
    name: "BlockWall",
    redirect: (to) => ({
      path: "/activities-wall",
      query: { ...to.query, tab: "wall" },
    }),
  },
  {
    // 摄影集：社区影集区（封面入口卡网格，仅 published+shared，RLS 兜底）
    path: "/albums",
    name: "CommunityAlbums",
    component: () => import("../../views/CommunityAlbums/index.vue"),
  },
  {
    // 摄影集：阅读页（公开可访问；未公开影集仅作者可见，由 RLS 保证）
    path: "/albums/:id",
    name: "PhotoAlbumReader",
    component: () => import("../../views/PhotoAlbumReader/index.vue"),
  },
  {
    // 摄影集：编辑器（仅作者本人，未登录走全局登录拦截）
    path: "/studio/albums/:id",
    name: "PhotoAlbumEditor",
    meta: { requiresLogin: true },
    component: () => import("../../views/PhotoAlbumEditor/index.vue"),
  },
  {
    path: "/forum/post/:id",
    name: "PostDetail",
    meta: { hideNavbar: true },
    component: () => import("../../views/PostDetail/index.vue"),
  },
  {
    path: "/profile/:username",
    name: "UserProfile",
    meta: { hideNavbar: true },
    component: () => import("../../views/Profile/index.vue"),
  },
]
