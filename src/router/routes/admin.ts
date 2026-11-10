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
    // 就地编辑宿主（2026-11-09）：直接渲染前台商城页，页面上叠一整层编辑能力。
    // 与 ShopConsole 的分工不要混：那边是「左列表 + 右表单」的批量维护台，
    // 这边是「所见即所得」的单点微调 —— 改标题、换图、删/增商品这些高频小动作走这里。
    path: '/admin/shop-editor',
    name: 'ShopEditor',
    component: () => import('../../views/ShopEditor/index.vue'),
    /* bodyClass 复用前台的 `page-shop`：本页渲染的就是 `<Shop />` 本身，
       前台那套 `body.page-shop` 的布局规则（左侧竖栏让位 240px、底栏占位 48px、
       rail 固定定位）必须一起生效，否则同一个组件在两条路由下宽度不同。 */
    meta: { requiresAdmin: true, hideNavbar: true, bodyClass: 'page-shop' },
  },
  {
    // 资讯就地编辑宿主（2026-11-10）：与 shop-editor 同构，渲染的是前台 `/newsroom` 本身。
    // bodyClass 必须覆盖成 `page-newsroom`：`body.page-newsroom` 下有一整套
    // 顶栏配色与内容区让位规则，默认的 `page-newseditor` 一条都不会命中。
    path: '/admin/news-editor',
    name: 'NewsEditor',
    component: () => import('../../views/NewsEditor/index.vue'),
    meta: { requiresAdmin: true, hideNavbar: true, bodyClass: 'page-newsroom' },
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
