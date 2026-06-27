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
    component: () => import("../../views/DataManagement/index.vue"),
    meta: { requiresAdmin: true, adminSection: "api-keys" },
  },
  {
    path: "/admin/model-routing",
    name: "ModelRouting",
    component: () => import("../../views/DataManagement/index.vue"),
    meta: { requiresAdmin: true, adminSection: "model-routing" },
  },
  {
    path: "/admin/alert-style-editor",
    name: "AlertStyleEditor",
    component: () => import("../../views/AlertStyleEditor/index.vue"),
    meta: { requiresAdmin: true },
  },
  {
    path: "/admin/ai-quota",
    name: "AiQuotaConfig",
    component: () => import("../../views/AiQuotaConfig/index.vue"),
    meta: { requiresAdmin: true },
  },
]