import type { RouteRecordRaw } from 'vue-router'

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: "/admin/data-management",
    name: "DataManagement",
    alias: "/datamanagement",
    component: () => import("../../views/DataManagement/index.vue"),
    meta: { requiresAdmin: true },
  },
  {
    path: "/admin/api-keys",
    name: "ApiKeyManagement",
    component: () => import("../../views/ApiKeyManagement/index.vue"),
    meta: { requiresAdmin: true },
  },
  {
    path: "/admin/alert-style-editor",
    name: "AlertStyleEditor",
    component: () => import("../../views/AlertStyleEditor/index.vue"),
    meta: { requiresAdmin: true },
  },
]