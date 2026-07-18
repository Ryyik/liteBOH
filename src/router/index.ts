import { createRouter, createWebHashHistory } from "vue-router"
import type { RouteRecordRaw } from "vue-router"
import { useAuthStore } from "../stores/auth"
import { notify } from "../utils/notify"
import { adminRoutes } from "./routes/admin"
import { communityRoutes } from "./routes/community"
import { creatorRoutes } from "./routes/creator"
import { publicRoutes } from "./routes/public"
import { userSpaceRoutes } from "./routes/user-space"

let authStore: ReturnType<typeof useAuthStore> | null = null

const initAuthStore = (): void => {
  if (!authStore) {
    authStore = useAuthStore()
  }
}

const routes: RouteRecordRaw[] = [
  ...publicRoutes,
  ...communityRoutes,
  ...adminRoutes,
  ...creatorRoutes,
  ...userSpaceRoutes,
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) {
      return { el: to.hash, top: 96, behavior: "auto" }
    }

    if (savedPosition) {
      return savedPosition
    }

    if (to.matched.length > 1 && from.matched.length > 1 && to.matched[0].path === from.matched[0].path) {
      return false
    }

    return { top: 0, behavior: "auto" }
  },
})

router.beforeEach(async (to, from, next) => {
  initAuthStore()
  if (!authStore) return next()

  const requiresLogin = to.matched.some((record) => record.meta?.requiresLogin)
  const requiresAdmin = to.matched.some((record) => record.meta?.requiresAdmin)
  const requiresAuth = requiresLogin || requiresAdmin

  if (requiresAuth && !authStore.isInitialized && typeof authStore.initLoginState === "function") {
    await authStore.initLoginState()
  }

  const { isLoggedIn } = authStore

  if (requiresLogin && !isLoggedIn) {
    notify('请先登录', 'warning')
    return next("/login")
  }

  if (requiresAdmin) {
    if (!isLoggedIn) {
      notify('请先登录', 'warning')
      return next("/login")
    }

    const hasAdminAccess = authStore.isAdmin
      || (typeof authStore.ensureAdminAccess === "function" && await authStore.ensureAdminAccess())

    if (!hasAdminAccess) {
      notify('您没有权限访问该页面', 'error')
      return next("/")
    }
  }

  return next()
})

export default router
