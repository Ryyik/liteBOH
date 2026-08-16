import type { RouteRecordRaw } from 'vue-router'

export const publicRoutes: RouteRecordRaw[] = [
  ...(import.meta.env.DEV
    ? [{
      path: "/__dev/motion",
      name: "MotionLab",
      component: () => import("../../views/Dev/MotionLab.vue"),
      meta: { hideFooter: true },
    }]
    : []),
  {
    path: "/",
    name: "Home",
    component: () => import("../../views/Home/index.vue"),
  },
  {
    path: "/shop",
    name: "Shop",
    component: () => import("../../views/Shop/index.vue"),
  },
  {
    path: "/shop/account",
    name: "ShopAccount",
    component: () => import("../../views/Shop/ShopAccountPage.vue"),
    meta: { requiresLogin: true },
  },
  {
    path: "/gift",
    name: "Gift",
    component: () => import("../../views/Gift/index.vue"),
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("../../views/Login/index.vue"),
  },
  {
    path: "/reset-password",
    name: "ResetPassword",
    component: () => import("../../views/ResetPassword/index.vue"),
  },
  {
    path: "/mbti",
    name: "MBTI",
    component: () => import("../../views/MBTI/index.vue"),
  },
  {
    path: "/history",
    name: "History",
    component: () => import("../../views/History/index.vue"),
  },
  {
    path: "/birthday",
    name: "Birthday",
    component: () => import("../../views/Birthday/index.vue"),
  },
  {
    path: "/about",
    name: "About",
    component: () => import("../../views/AboutUs/index.vue"),
  },
  {
    path: "/join",
    name: "Join",
    component: () => import("../../views/Join/index.vue"),
  },
  {
    path: "/download",
    name: "Download",
    component: () => import("../../views/Download/index.vue"),
  },
  {
    path: "/tutorial",
    name: "Tutorial",
    component: () => import("../../views/Tutorial/index.vue"),
  },
  {
    path: "/shows",
    name: "Shows",
    component: () => import("../../views/Shows/index.vue"),
  },
  {
    path: "/character-book",
    name: "CharacterBook",
    component: () => import("../../views/CharacterBook/index.vue"),
  },
  {
    path: "/ai-chat",
    name: "AiChat",
    component: () => import("../../views/BOHAI/BOHAI/index.vue"),
  },
  {
    path: "/ai-intro",
    name: "AiIntro",
    component: () => import("../../views/AIPlaza/index.vue"),
  },
  {
    path: "/boh-8-years-event",
    name: "BOH8YearsEvent",
    component: () => import("../../views/BOH8YearsEvent/index.vue"),
  },

  {
    path: "/lab",
    name: "Lab",
    component: () => import("../../views/Lab/index.vue"),
  },
  {
    path: "/boh-8-years-journey",
    name: "BOH8YearsJourney",
    component: () => import("../../views/BOH8YearsJourney/index.vue"),
  },
  {
    path: "/boh-8-years-journey/copy-editor",
    name: "BOH8YearsJourneyCopyEditor",
    component: () => import("../../views/BOH8YearsJourney/CopyEditor.vue"),
    meta: { hideNavbar: true, hideFooter: true },
  },
  {
    path: "/anniversary-cafe",
    name: "AnniversaryCafe",
    component: () => import("../../views/AnniversaryCafe/index.vue"),
    meta: { hideNavbar: true, hideFooter: true },
  },
]
