import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/Home.vue"),
  },
  {
    path: "/service",
    name: "Service",
    component: () => import("../views/Service.vue"),
  },
  {
    path: "/game",
    name: "Game",
    component: () => import("../views/Game.vue"),
  },
  {
    path: "/newsroom",
    name: "Newsroom",
    component: () => import("../views/Newsroom.vue"),
  },
  {
    path: "/shop",
    name: "Shop",
    component: () => import("../views/Shop.vue"),
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("../views/Login.vue"),
  },
  {
    path: "/annual-report-2025",
    name: "AnnualReport2025",
    component: () => import("../views/AnnualReport2025.vue"),
  },
  {
    path: "/mbti",
    name: "MBTI",
    component: () => import("../views/MBTI.vue"),
  },
  {
    path: "/health",
    name: "Health",
    component: () => import("../views/Health.vue"),
  },
  {
    path: "/about",
    name: "About",
    component: () => import("../views/About.vue"),
  },
  {
    path: "/activities",
    name: "Activities",
    component: () => import("../views/Activities.vue"),
    redirect: "/activities/list",
    children: [
      {
        path: "photo-wall",
        name: "ActivitiesPhotoWall",
        component: () => import("../views/activities/ActivitiesPhotoWall.vue"),
      },
      {
        path: "list",
        name: "ActivitiesList",
        component: () => import("../views/activities/ActivitiesList.vue"),
      },
    ],
  },
  {
    path: "/tutorial",
    name: "Tutorial",
    component: () => import("../views/Tutorial.vue"),
  },
  {
    path: "/user-center",
    name: "UserCenter",
    component: () => import("../views/UserCenter.vue"),
    redirect: "/user-center/info",
    children: [
      {
        path: "info",
        name: "UserInfo",
        component: () => import("../views/user-center/UserInfo.vue"),
      },
      {
        path: "points",
        name: "Points",
        component: () => import("../views/user-center/Points.vue"),
      },
      {
        path: "subscriptions",
        name: "Subscriptions",
        component: () => import("../views/user-center/Points.vue"),
      },
      {
        path: "address",
        name: "Address",
        component: () => import("../views/user-center/Address.vue"),
      },
      {
        path: "messages",
        name: "Messages",
        component: () => import("../views/user-center/Messages.vue"),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

// 强力全局后置守卫，确保在所有组件渲染后重置滚动
router.afterEach(() => {
  // 1. 立即尝试滚动
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  // 2. 针对异步加载和拼图动画等延迟内容，多阶段尝试滚动
  const forceScroll = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  requestAnimationFrame(forceScroll);
  
  // 3. 针对首页这类有大量动画和图片的页面，延迟 100ms 再做一次最终确认
  setTimeout(forceScroll, 100);
});

export default router;
