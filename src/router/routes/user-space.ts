import type { RouteRecordRaw } from 'vue-router';

const userSpaceMeta = { requiresLogin: true };

// ⚠️ 兼容重定向（/user-center/*、/mailbox、/user-space/{posts,community,ai,assets,settings,
// profile,messages,tags-impressions}、/user-space/settings/beta-preview 等）已全部收进
// routes/compat.ts 单一登记处（2026-10-15 起）。本文件只放真页面，别再往回加 redirect。
//
// 2026-09-30 起「标签与印象」独立页已收掉（孤儿页，全站零 UI 入口，见 plans/022 §5）。
// 印象的落点：「我」页的分段 `?tab=posts&view=impressions`（旧深链由 compat.ts 兜底）。
export const userSpaceRoutes: RouteRecordRaw[] = [
  {
    path: '/user-space/subscriptions',
    name: 'Subscriptions',
    component: () => import('../../views/user-center/Subscription/index.vue'),
    // 订阅方案对访客可见；点击试用/订阅时由 SubscriptionPlans 打开登录灵动岛。
    meta: {},
  },
  {
    path: '/user-space/gifts',
    name: 'Gifts',
    component: () => import('../../views/user-center/Address/index.vue'),
    meta: { ...userSpaceMeta },
  },
  {
    path: '/user-space',
    name: 'UserSpace',
    component: () => import('../../views/user-center/UserSpace/index.vue'),
    meta: { keepAlive: true },
  },
  {
    // 摄影集：我的影集列表（创建/编辑/阅读/导出/分享入口）
    path: '/user-space/albums',
    name: 'PhotoAlbums',
    component: () => import('../../views/PhotoAlbums/index.vue'),
    meta: { ...userSpaceMeta },
  },
  {
    path: '/user-space/account-security',
    name: 'AccountSecurity',
    component: () => import('../../views/user-center/AccountSecurity/index.vue'),
    meta: { ...userSpaceMeta },
  },
  {
    path: '/user-space/note',
    name: 'BOHCloudPlus',
    component: () => import('../../views/user-center/Cloud+/index.vue'),
    meta: { ...userSpaceMeta },
  },
  {
    path: '/user-space/shared-memories',
    name: 'SharedMemoryManagement',
    component: () => import('../../views/user-center/SharedMemoryManagement.vue'),
    meta: { ...userSpaceMeta },
  },
  {
    path: '/user-space/pushplus-settings',
    name: 'PushplusSettings',
    component: () => import('../../views/user-center/PushplusSettingsPage.vue'),
    meta: { ...userSpaceMeta },
  },
  {
    path: '/user-space/settings/version',
    name: 'VersionSettings',
    component: () => import('../../views/user-center/BetaPreview/BetaPreviewMain.vue'),
    // keepAlive：版本/预览信息与当前构建绑定，在一次会话内不会变，缓存无新鲜度代价。
    meta: { ...userSpaceMeta, hideNavbar: true, hideFooter: true, keepAlive: true },
  },
];
