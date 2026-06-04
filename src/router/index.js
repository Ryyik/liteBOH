import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { adminRoutes } from "./routes/admin";
import { communityRoutes } from "./routes/community";
import { creatorRoutes } from "./routes/creator";
import { publicRoutes } from "./routes/public";
import { userSpaceRoutes } from "./routes/user-space";

let authStore = null;
const UPCOMING_CONTENT_NOTICE = "当前内容即将上线";

const initAuthStore = () => {
  if (!authStore) {
    authStore = useAuthStore();
  }
};

const routes = [
  ...publicRoutes,
  ...communityRoutes,
  ...adminRoutes,
  ...creatorRoutes,
  ...userSpaceRoutes
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }

    if (to.matched.length > 1 && from.matched.length > 1 && to.matched[0].path === from.matched[0].path) {
      return false;
    }

    return { top: 0, behavior: "auto" };
  },
});

router.beforeEach(async (to, from, next) => {
  if (to.meta?.upcoming) {
    alert(UPCOMING_CONTENT_NOTICE);
    if (from.matched.length === 0) {
      return next("/");
    }
    return next(false);
  }

  initAuthStore();
  const requiresLogin = to.matched.some((record) => record.meta?.requiresLogin);
  const requiresAdmin = to.matched.some((record) => record.meta?.requiresAdmin);
  const requiresAuth = requiresLogin || requiresAdmin;

  if (requiresAuth && !authStore.isInitialized && typeof authStore.initLoginState === "function") {
    await authStore.initLoginState();
  }

  const { isLoggedIn } = authStore;

  if (requiresLogin && !isLoggedIn) {
    alert("请先登录");
    return next("/login");
  }

  if (requiresAdmin) {
    if (!isLoggedIn) {
      alert("请先登录");
      return next("/login");
    }

    const hasAdminAccess = authStore.isAdmin
      || (typeof authStore.ensureAdminAccess === "function" && await authStore.ensureAdminAccess());

    if (!hasAdminAccess) {
      alert("您没有权限访问该页面");
      return next("/");
    }
  }

  return next();
});

export default router;
