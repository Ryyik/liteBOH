import type { RouteRecordRaw } from 'vue-router';

const userSpaceMeta = { requiresLogin: true };

/**
 * 图库（Cloud+）的路由 loader —— **必须把内层面板一起 await**（2026-11-16）。
 *
 * `Cloud+/index.vue` 只是一层薄壳：真正的重面板 `CloudPlusMain.vue` 在壳里
 * 再懒加载一次、并套了自己的 `<Suspense>`。只等壳会发生「两段式切换」：
 * 壳到位的瞬间导航就 commit ⇒ 旧页（连同它的底栏）被卸载 ⇒ 内层 chunk 还要再等
 * 一段，这段时间屏幕上只有 `cp-suspense` 骨架、**底栏完全不存在**。
 *
 * 实测（scripts/probes/probe-bottomnav-switch-timeline.mjs，4G 限速 1.6Mbps、
 * 本次会话首次点「图库」）：底栏缺失 349ms（179ms → 512ms），其中 21 帧只有骨架、
 * 整个页面最少时只剩 19 个字 —— 正是用户报障的「卡一下，然后导航栏重新出现」。
 *
 * 把内层一起 await 之后，导航变成**原子的**：vue-router 要等 loader 全部解析才
 * commit，所以这 349ms 里屏幕停在旧页（内容 + 底栏都在），chunk 到齐再一次性切过去。
 * 配合 RouteProgressBar（>120ms 才出现的顶部细线）和底栏按下即预取，用户看到的是
 * 「点了 → 有反馈 → 切过去」，而不是「点了 → 页面被清空 → 底栏消失 → 又长回来」。
 *
 * ⚠️ 两个容易踩的点：
 *   · 这里引的是**同一个模块**（与 index.vue 里的 `./CloudPlusMain.vue` 同一文件），
 *     ESM 模块缓存命中 ⇒ 不会重复下载、chunk 分组也不变（构建产物逐字节可比对）。
 *   · 别改成「在 index.vue 里静态 import CloudPlusMain」：那会把两个 chunk 合并，
 *     图库入口 chunk 直接翻倍，代价比这里多等一跳更大。
 */
const loadCloudPlusPage = async () => {
  const [page] = await Promise.all([
    import('../../views/user-center/Cloud+/index.vue'),
    import('../../views/user-center/Cloud+/CloudPlusMain.vue'),
  ]);
  return page;
};

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
    // 双层懒加载一次等齐，避免「壳先 commit、内层还在下」的空窗（见 loadCloudPlusPage）
    component: loadCloudPlusPage,
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
    /* 通知设置。⚠️ 路径保留 pushplus 这个历史 slug：它已写进**已发出的邮件**页脚
       （生日 / 关注动态 / 审核结果三封的「去关闭」），改名会让历史邮件 404。
       对外名与组件名已改为 NotificationSettings（2026-11-10 移除 Pushplus 时）。 */
    path: '/user-space/pushplus-settings',
    name: 'NotificationSettings',
    component: () => import('../../views/user-center/NotificationSettingsPage.vue'),
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
