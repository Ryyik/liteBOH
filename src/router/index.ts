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

  // 不再阻塞跳转：受保护路由在未初始化时也允许进入，让首屏立即渲染。
  // initLoginState 完成后若发现未登录/无权限，通过异步 replace 跳转到 /login 或 /，
  // 避免用户点击"我的方块"等按钮后长时间无响应（initLoginState 内含远程会话同步）。
  if (requiresAuth && !authStore.isInitialized && typeof authStore.initLoginState === "function") {
    const storeSnapshot = authStore!
    authStore.initLoginState().then(() => {
      // 仅当用户仍停留在本次跳转的目标路由时才执行权限回弹，
      // 避免在用户已主动导航到其他页面时打断。
      if (router.currentRoute.value.path !== to.path) return
      if (requiresLogin && !storeSnapshot.isLoggedIn) {
        notify('请先登录', 'warning')
        router.replace('/login')
      } else if (requiresAdmin && !storeSnapshot.isAdmin) {
        notify('您没有权限访问该页面', 'error')
        router.replace('/')
      }
    }).catch(() => { /* 错误已在 store 内处理 */ })
  }

  const { isLoggedIn } = authStore

  if (requiresLogin && !isLoggedIn) {
    notify('请先登录', 'warning')
    return next("/login")
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
