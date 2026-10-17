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
    // 详情子页（plans/027 D1）：与列表共用同一个组件 —— 仅参数变化时
    // Vue Router 复用组件实例，列表的筛选/页码/滚动位置天然保留。
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
    path: '/admin/avatar-console',
    name: 'AvatarConsole',
    component: () => import('../../views/AvatarConsole/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true },
  },
];
