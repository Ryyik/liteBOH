import type { RouteRecordRaw } from 'vue-router'

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: "/admin/data-management",
    name: "DataManagement",
    alias: "/datamanagement",
    component: () => import("../../views/DataManagement/index.vue"),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: "/admin/api-keys",
    name: "ApiKeyManagement",
    component: () => import("../../views/DataManagement/index.vue"),
    meta: { requiresAdmin: true, adminSection: "api-keys", hideNavbar: true },
  },
  {
    path: "/admin/alert-style-editor",
    name: "AlertStyleEditor",
    component: () => import("../../views/AlertStyleEditor/index.vue"),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: "/admin/ai-quota",
    name: "AiQuotaConfig",
    component: () => import("../../views/AiQuotaConfig/index.vue"),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: "/admin/birthday",
    name: "BirthdayManagement",
    component: () => import("../../views/BirthdayManagement/index.vue"),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: "/admin/shop-console",
    name: "ShopConsole",
    component: () => import("../../views/ShopConsole/index.vue"),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
]