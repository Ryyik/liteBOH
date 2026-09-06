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
