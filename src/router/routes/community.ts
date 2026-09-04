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
    path: "/activities",
    name: "Activities",
    component: () => import("../../views/activities/index.vue"),
    redirect: "/activities/list",
    children: [
      {
        path: "photo-wall",
        name: "ActivitiesPhotoWall",
        component: () => import("../../views/activities/ActivitiesPhotoWall.vue"),
      },
      {
        path: "list",
        name: "ActivitiesList",
        component: () => import("../../views/activities/ActivitiesList.vue"),
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
    path: "/block-wall",
    name: "BlockWall",
    meta: { hideNavbar: true },
    component: () => import("../../views/BlockWall/index.vue"),
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
