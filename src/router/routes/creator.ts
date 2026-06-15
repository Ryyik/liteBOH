import type { RouteRecordRaw } from 'vue-router'

export const creatorRoutes: RouteRecordRaw[] = [
  {
    path: "/creator-studio",
    name: "CreatorStudio",
    redirect: "/user-space?tab=profile&view=settings",
  },
]