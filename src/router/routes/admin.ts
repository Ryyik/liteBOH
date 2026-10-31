import type { RouteRecordRaw } from 'vue-router';

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin/data-management',
    name: 'DataManagement',
    alias: '/datamanagement',
    component: () => import('../../views/DataManagement/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    // 详情子页（plans/027 D1）：与列表共用同一个组件。
    // ⚠️ 不要以为「共用组件 = 实例复用」：App.vue 用 `:key="activeRoute.path"` 渲染
    // 路由组件，列表 ↔ 详情的 path 不同 ⇒ 实例会重建。列表的筛选/页码靠 E 批的
    // URL 即状态恢复，滚动位置**不保留**；详情态的 tab 由 route.params.tab 提供
    // （DataAdmin 的 initialDetailTab），不要依赖 query.tab。
    path: '/admin/data-management/:tab/:id',
    name: 'DataManagementRecord',
    component: () => import('../../views/DataManagement/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    // 对外兼容别名：面板内部一律走 /admin/data-management（靠 ?section=api-keys 定位），
    // 这条只为旧书签/外链保留，内部导航不得再指向它。
    path: '/admin/api-keys',
    name: 'ApiKeyManagement',
    component: () => import('../../views/DataManagement/index.vue'),
    meta: { requiresAdmin: true, adminSection: 'api-keys', hideNavbar: true },
  },
  {
    path: '/admin/alert-style-editor',
    name: 'AlertStyleEditor',
    component: () => import('../../views/AlertStyleEditor/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: '/admin/birthday',
    name: 'BirthdayManagement',
    component: () => import('../../views/BirthdayManagement/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: '/admin/shop-console',
    name: 'ShopConsole',
    component: () => import('../../views/ShopConsole/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: '/admin/hero-console',
    name: 'HeroConsole',
    component: () => import('../../views/HeroConsole/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    // 开屏控制台（2026-10-31）：活动期开屏的内容与 CTA 绑定都在这里改，不用发版。
    // 与 HeroConsole 分开：那边管的是「首页英雄区流」，这边管的是「入场浮层」。
    path: '/admin/gate-console',
    name: 'GateConsole',
    component: () => import('../../views/GateConsole/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
  {
    path: '/admin/avatar-console',
    name: 'AvatarConsole',
    component: () => import('../../views/AvatarConsole/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
];
