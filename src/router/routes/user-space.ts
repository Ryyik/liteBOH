import type { RouteRecordRaw } from 'vue-router';

const userSpaceMeta = { requiresLogin: true };

/* ⚠️ `keepAliveName` 是 App.vue 的 <KeepAlive :include> 白名单（2026-11-05）。
   它必须与路由组件里 `defineOptions({ name })` 的字符串**逐字相同** —— include
   匹配的是组件名、不是路由名，写错/漏写不会报错，只会「默默不缓存」。
   加新页面时三条都要给：`meta.keepAlive: true` + `meta.keepAliveName` + 组件里的
   `defineOptions({ name })`；tests/unit/keep-alive-names.test.js 会拦下前两条。 */

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
  // 2026-11-02 礼物中心（/user-space/gifts）退场：礼物与历史礼物并入周边购物袋「订单」，
  // 收货地址并入商城「地址」分区。兼容重定向在 routes/compat.ts（单文件登记处）。
  {
    path: '/user-space',
    name: 'UserSpace',
    component: () => import('../../views/user-center/UserSpace/index.vue'),
    meta: { keepAlive: true, keepAliveName: 'UserSpacePage' },
  },
  {
    // 摄影集：我的影集列表（创建/编辑/阅读/导出/分享入口）
    path: '/user-space/albums',
    name: 'PhotoAlbums',
    component: () => import('../../views/PhotoAlbums/index.vue'),
    meta: { ...userSpaceMeta },
  },
  {
    path: '/user-space/note',
    name: 'BOHCloudPlus',
    component: () => import('../../views/user-center/Cloud+/index.vue'),
    /* keepAlive（2026-11-04）：底栏「图库」与「我」是**相邻两席**，来回切是高频动作。
       不给缓存时，两页各自是独立路由：每次切都走「卸载一棵树 + 挂载另一棵」——
       App.vue 的 KeepAlive 容器还会随 meta 切换而销毁重建，把「我」的缓存一起带走。
       用户报障原话「相册和我的切换底栏还是会整页重挂」，指的就是骨架/取数/滚动位置全丢。
       ⚠️ 2026-09-20 审计里曾按「资产类页面宁可每次重新取数」判过不加缓存 —— 那条判据
       针对的是**低频子页**；一旦它变成底栏常驻席位，切换手感优先，新鲜度改由页面内的
       onActivated 兜（超过 TTL 才静默补拉，不重建 DOM）。改这里前先读 CloudPlusMain 的
       onActivated 段。 */
    meta: { ...userSpaceMeta, keepAlive: true, keepAliveName: 'CloudPlusPage' },
  },
  {
    /* BOH Camera Beta（plans/041）：图库头部相机图标的落点。
       不挂 keepAlive —— 每次进页面都必须重新取流，缓存下来的只是一个已 stop 的
       MediaStream（表现为第二次进来黑屏，直到用户点重试）。 */
    path: '/user-space/note/camera',
    name: 'BOHCamera',
    component: () => import('../../views/Camera/index.vue'),
    meta: { ...userSpaceMeta, hideNavbar: true, hideFooter: true },
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
    meta: {
      ...userSpaceMeta,
      hideNavbar: true,
      hideFooter: true,
      keepAlive: true,
      keepAliveName: 'BetaPreviewPage',
    },
  },
];
