import { createRouter, createWebHashHistory } from "vue-router"
import type { RouteRecordRaw } from "vue-router"
import { useAuthStore } from "../stores/auth"
import { notify } from "../utils/notify"
import { adminRoutes } from "./routes/admin"
import { communityRoutes } from "./routes/community"
import { creatorRoutes } from "./routes/creator"
import { publicRoutes } from "./routes/public"
import { userSpaceRoutes } from "./routes/user-space"
import { healthRoutes } from "./routes/health"

let authStore: ReturnType<typeof useAuthStore> | null = null

const initAuthStore = (): void => {
  if (!authStore) {
    authStore = useAuthStore()
  }
}

const routes: RouteRecordRaw[] = [
  ...publicRoutes,
  ...communityRoutes,
  ...healthRoutes,
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

// 判断当前用户是否处于有效封禁状态（永久封禁或临时封禁未过期）
const isActiveBanned = (): boolean => {
  if (!authStore) return false
  const { userInfo } = authStore
  if (!userInfo?.isBanned) return false
  if (!userInfo.bannedUntil) return true // 永久封禁
  try {
    return new Date(userInfo.bannedUntil) > new Date()
  } catch {
    return true // 日期解析失败时按封禁处理
  }
}

router.beforeEach(async (to, from, next) => {
  initAuthStore()
  if (!authStore) return next()

  const requiresLogin = to.matched.some((record) => record.meta?.requiresLogin)
  const requiresAdmin = to.matched.some((record) => record.meta?.requiresAdmin)
  const requiresAuth = requiresLogin || requiresAdmin

  // 恢复阻塞语义，但加超时兜底，避免远程会话同步慢导致长时间无响应。
  // commit d0e9e85 曾改为 fire-and-forget 异步，导致两个回归：
  //   B1: localStorage 中 isLoggedIn=true 但 session 已失效时，同步代码立即放行，
  //       用户短暂看到受保护页面后才被异步回调弹回（未授权访问窗口）。
  //   B4: localStorage 丢失但 session 仍有效时，同步代码立即弹回 /login，
  //       异步 init 完成后才发现 session 有效（错误弹回回归）。
  // 修复：await initLoginState 但用 Promise.race 加 3s 超时，超时后回落到
  // localStorage 持久化的 isLoggedIn 态进行同步判断；initLoginState 不取消，
  // 仍在后台完成，完成后由 syncAuthState 心跳纠正任何不一致状态。
  if (requiresAuth && !authStore.isInitialized && typeof authStore.initLoginState === "function") {
    const INIT_TIMEOUT_MS = 3000
    await Promise.race([
      authStore.initLoginState(),
      new Promise<void>((resolve) => setTimeout(resolve, INIT_TIMEOUT_MS)),
    ])
  }

  const { isLoggedIn } = authStore

  if (requiresLogin && !isLoggedIn) {
    // 受保护路由也使用全局登录灵动岛；保留当前页面，登录成功后用户无需重新寻找入口。
    authStore.showLoginModal = true
    return from.name ? next(false) : next("/")
  }

  // 封禁用户禁止访问任何需要登录的路由（包括 UserSpace 空间）。
  // 触发强制登出由 syncAuthState 心跳处理，这里只做路由层拦截，避免在心跳间隔内访问受保护页面。
  if (requiresLogin && isLoggedIn && isActiveBanned()) {
    let banMessage = '您的账号已被封禁，无法访问该页面。'
    const { userInfo } = authStore
    if (userInfo?.banReason) {
      banMessage += ` 原因：${userInfo.banReason}`
    }
    notify(banMessage, 'error')
    // 触发异步强制登出（不阻塞路由跳转）
    if (typeof authStore.logout === "function") {
      void authStore.logout()
    }
    return next("/login")
  }

  if (requiresAdmin) {
    if (!isLoggedIn) {
      authStore.showLoginModal = true
      return from.name ? next(false) : next("/")
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
