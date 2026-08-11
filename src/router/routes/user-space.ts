import type { RouteRecordRaw } from 'vue-router'

const userSpaceMeta = { requiresLogin: true }

// Vue Router 4 的 redirect 函数类型较为严格，使用实用类型转换来处理动态重定向
const redirectWithQuery = (path: string, extraQuery: Record<string, string> = {}): any =>
  (to: any) => ({
    path,
    query: { ...to.query, ...extraQuery },
  })

const redirectToUserSpaceTab = (tab: string): any =>
  (to: any) => ({
    path: '/user-space',
    query: { ...to.query, tab },
  })

const redirectToUserSpaceMessages: any = (to: any) => ({
  path: '/user-space',
  query: { ...to.query, tab: 'messages', section: 'notifications' },
})

export const userSpaceRoutes: RouteRecordRaw[] = [
  {
    path: "/mailbox",
    redirect: redirectToUserSpaceMessages,
  },
  {
    path: "/user-center/points",
    redirect: redirectWithQuery("/user-space?tab=profile&view=assets"),
  },
  {
    path: "/user-center",
    redirect: redirectWithQuery("/user-space/profile"),
  },
  {
    path: "/user-center-v2",
    redirect: redirectWithQuery("/user-space/profile"),
  },
  {
    path: "/user-center/info",
    redirect: redirectWithQuery("/user-space/profile"),
  },
  {
    path: "/user-center/subscriptions",
    redirect: redirectWithQuery("/user-space?tab=profile&view=assets"),
  },
  {
    path: "/user-center/address",
    redirect: redirectWithQuery("/user-space?tab=profile&view=assets"),
  },
  {
    path: "/user-center/messages",
    redirect: redirectToUserSpaceMessages,
  },
  {
    path: "/user-center/partners",
    redirect: redirectWithQuery("/user-space/partners"),
  },
  {
    path: "/user-center/tags-impressions",
    redirect: redirectWithQuery("/user-space/tags-impressions"),
  },
  {
    path: "/user-center/pushplus-settings",
    redirect: redirectWithQuery("/user-space/pushplus-settings"),
  },
  {
    path: "/user-center/pushplus",
    redirect: redirectWithQuery("/user-space/pushplus-settings"),
  },
  {
    path: "/user-center/shared-memories",
    redirect: redirectWithQuery("/user-space/shared-memories"),
  },
  {
    path: "/user-space/subscriptions",
    name: "Subscriptions",
    component: () => import("../../views/user-center/Subscription/index.vue"),
    meta: { ...userSpaceMeta },
  },
  {
    path: "/user-space/gifts",
    name: "Gifts",
    component: () => import("../../views/user-center/Address/index.vue"),
    meta: { ...userSpaceMeta },
  },
  {
    path: "/user-space/messages",
    redirect: redirectToUserSpaceMessages,
  },
  {
    path: "/user-space/partners",
    name: "Partners",
    component: () => import("../../views/user-center/Partners.vue"),
    meta: { ...userSpaceMeta },
  },
  {
    path: "/user-space",
    name: "UserSpace",
    component: () => import("../../views/user-center/UserSpace/index.vue"),
    meta: { keepAlive: true },
  },
  {
    path: "/user-space/profile",
    redirect: redirectToUserSpaceTab("profile"),
  },
  {
    path: "/user-space/posts",
    redirect: redirectToUserSpaceTab("posts"),
  },
  {
    path: "/user-space/community",
    redirect: redirectToUserSpaceTab("community"),
  },
  {
    path: "/user-space/ai",
    redirect: redirectToUserSpaceTab("ai"),
  },
  {
    path: "/user-space/account-security",
    name: "AccountSecurity",
    component: () => import("../../views/user-center/AccountSecurity/index.vue"),
    meta: { ...userSpaceMeta },
  },
  {
    path: "/user-space/note",
    name: "BOHCloudPlus",
    component: () => import("../../views/user-center/Cloud+/index.vue"),
    meta: { ...userSpaceMeta },
  },
  {
    path: "/user-space/shared-memories",
    name: "SharedMemoryManagement",
    component: () => import("../../views/user-center/SharedMemoryManagement.vue"),
    meta: { ...userSpaceMeta },
  },
  {
    path: "/user-space/tags-impressions",
    name: "TagsImpressions",
    component: () => import("../../views/user-center/TagsImpressions.vue"),
    meta: { ...userSpaceMeta },
  },
  {
    path: "/user-space/pushplus-settings",
    name: "PushplusSettings",
    component: () => import("../../views/user-center/PushplusSettingsPage.vue"),
    meta: { ...userSpaceMeta },
  },
]
