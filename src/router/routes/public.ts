import type { RouteRecordRaw } from 'vue-router';

export const publicRoutes: RouteRecordRaw[] = [
  ...(import.meta.env.DEV
    ? [
        {
          path: '/__dev/motion',
          name: 'MotionLab',
          component: () => import('../../views/Dev/MotionLab.vue'),
          meta: { hideFooter: true },
        },
        {
          path: '/__dev/liquid-glass-nav',
          name: 'LiquidGlassNavDemo',
          component: () => import('../../views/Dev/LiquidGlassNavDemo.vue'),
          meta: { hideNavbar: true, hideFooter: true },
        },
        {
          path: '/__dev/glass-repro',
          name: 'GlassBackdropRepro',
          component: () => import('../../views/Dev/GlassBackdropRepro.vue'),
          meta: { hideNavbar: true, hideFooter: true },
        },
        {
          // 路由索引（DEV-only）：列出 getRoutes() 全量路由，点击任意一行新窗口打开。
          // 与上面三个 dev 页一致只在开发构建注册，生产产物零成本（死代码消除）。
          path: '/__dev/routes',
          name: 'RouteIndex',
          component: () => import('../../views/Dev/RouteIndex.vue'),
          meta: { hideFooter: true },
        },
      ]
    : []),
  {
    path: '/',
    name: 'Home',
    component: () => import('../../views/Home/index.vue'),
    /* keepAlive（2026-11-14）：底栏五席里有它一席，而「内容」也是从别处回到论坛的
       唯一入口 —— 不缓存时每次回来都是重挂 + 全量取数（probe-cloud-keepalive 实测 8 次
       请求），用户口径「底栏来回切换不要整页重载」。
       代价（已确认接受）：帖子流那套 30s 轮询在离开首页后仍在后台跑；回来看到的是
       缓存内容，不会因为「刚在别的页待了 10 分钟」而自动变新。
       ⚠️ 组件侧 Home/index.vue 必须有 defineOptions({ name: 'HomePage' })，由
          tests/unit/keep-alive-names.test.js 逐字校验。 */
    meta: { keepAlive: true, keepAliveName: 'HomePage' },
  },
  {
    path: '/shop',
    name: 'Shop',
    component: () => import('../../views/Shop/index.vue'),
    /* keepAlive（2026-11-14）：周边是底栏第五席，同样是高频来回的落点；
       列表与滚动位置都留在缓存里，回来不用再走一遍骨架 + 全量商品请求。
       ⚠️ 分区（?tab=）不在缓存里保留：底栏「周边」的落点是裸 `/shop`，
          handleNavClick 显式回「产品」—— 这是既有口径，本次没动。 */
    meta: { keepAlive: true, keepAliveName: 'ShopPage' },
  },
  {
    path: '/shop/account',
    name: 'ShopAccount',
    component: () => import('../../views/Shop/ShopAccountPage.vue'),
    meta: { requiresLogin: true },
  },
  {
    // 购物袋独立页（2026-11-01 周边商城改版）：同时是用户中心底栏第五席的落点。
    // 不挂 requiresLogin —— 未登录也能看购物车（本地存储）。
    path: '/shop/bag',
    name: 'ShopBag',
    component: () => import('../../views/Shop/BagPage.vue'),
    // 2026-11-02 订单提成商城一级分区（/shop?tab=order）后，本页只剩购物车。
    // 旧链接 ?view=orders（礼物中心退场时的落点、各处「查看订单」按钮）在**路由层**转走：
    // 放在组件 onMounted 里会先渲染一次空购物车再跳，闪一下没必要。
    beforeEnter: (to) =>
      String(to.query.view || '') === 'orders' ? { path: '/shop', query: { tab: 'order' } } : true,
  },
  {
    path: '/gift',
    name: 'Gift',
    component: () => import('../../views/Gift/index.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../../views/Login/index.vue'),
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('../../views/ResetPassword/index.vue'),
  },
  {
    path: '/mbti',
    name: 'MBTI',
    component: () => import('../../views/MBTI/index.vue'),
  },
  {
    path: '/history',
    name: 'History',
    component: () => import('../../views/History/index.vue'),
  },
  {
    path: '/birthday',
    name: 'Birthday',
    component: () => import('../../views/Birthday/index.vue'),
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../../views/AboutUs/index.vue'),
  },
  {
    path: '/join',
    name: 'Join',
    component: () => import('../../views/Join/index.vue'),
  },
  {
    path: '/download',
    name: 'Download',
    component: () => import('../../views/Download/index.vue'),
  },
  {
    path: '/app',
    name: 'BOHApp',
    component: () => import('../../views/BOHApp/index.vue'),
  },
  {
    path: '/character-book',
    name: 'CharacterBook',
    component: () => import('../../views/CharacterBook/index.vue'),
  },
  {
    path: '/ai-chat',
    name: 'AiChat',
    // 沉浸导航（2026-10-08 用户口径）：打开 BOHAI 时顶部导航**收成一颗球**，
    // 落在横向左栏的品牌 logo 位上（页面因此顶到满屏）；点那颗球唤醒完整导航。
    // 复用阅读页/创作页已有的 `immersiveNav` 机制（含球 ↔ 胶囊 FLIP morph）。
    //
    // keepAlive（2026-10-11）：**切页不再掐流**。
    //   此前没有 meta.keepAlive ⇒ App.vue 走 `:key="route.path"` 那条分支，切页即
    //   **销毁**整棵组件树 ⇒ `useChatEngine` 的 `onScopeDispose` 执行
    //   `abortController.abort()` ⇒ 用户离开会话，正在生成的回答当场停止（不是暂停）。
    //   进 KeepAlive 后切走只是 deactivated，流继续跑完并落盘，回来是完整答案。
    // ⚠️ 代价一：整页常驻内存（消息流 DOM + 会话数组），直到关标签页。
    // ⚠️ 代价二：页面实例后台存活时，**灵动岛会另起一个 BOHAIMain**，两个引擎共用
    //    同一个 localStorage 键 `boh_chat_sessions` ⇒ 写入侧由
    //    `bohai-chat-session-store.js` 的 `createBohAISessionWriteGuard` 挡住互相覆盖，
    //    重载时机在 `BOHAIMain` 的 `onActivated`（流式中不换，避免冲掉在飞的消息）。
    meta: { immersiveNav: true, keepAlive: true, keepAliveName: 'BohAiChatPage' },
    component: () => import('../../views/BOHAI/BOHAI/index.vue'),
  },
  {
    path: '/ai-intro',
    name: 'AiIntro',
    component: () => import('../../views/AIPlaza/index.vue'),
  },
  {
    path: '/boh-8-years-event',
    name: 'BOH8YearsEvent',
    component: () => import('../../views/BOH8YearsEvent/index.vue'),
  },

  {
    path: '/boh-8-years-journey',
    name: 'BOH8YearsJourney',
    component: () => import('../../views/BOH8YearsJourney/index.vue'),
  },
  {
    path: '/boh-8-years-journey/copy-editor',
    name: 'BOH8YearsJourneyCopyEditor',
    component: () => import('../../views/BOH8YearsJourney/CopyEditor.vue'),
    meta: { hideNavbar: true, hideFooter: true },
  },
  {
    path: '/anniversary-cafe',
    name: 'AnniversaryCafe',
    component: () => import('../../views/AnniversaryCafe/index.vue'),
    meta: { hideNavbar: true, hideFooter: true },
  },
];
