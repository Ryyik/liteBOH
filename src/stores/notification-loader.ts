import type { useNotificationStore as UseNotificationStoreFn } from './notifications'

let notificationStoreInstance: ReturnType<typeof UseNotificationStoreFn> | null = null
let notificationStorePromise: Promise<ReturnType<typeof UseNotificationStoreFn>> | null = null
let notificationStoreLoadError: Error | null = null

export function getNotificationStoreSync(): ReturnType<typeof UseNotificationStoreFn> | null {
  return notificationStoreInstance
}

export function getNotificationStoreError(): Error | null {
  return notificationStoreLoadError
}

export function clearNotificationStoreError(): void {
  notificationStoreLoadError = null
}

export async function loadNotificationStore(): Promise<ReturnType<typeof UseNotificationStoreFn>> {
  if (notificationStoreInstance) {
    return notificationStoreInstance
  }

  // 如果之前加载失败，清除错误状态后允许重试
  if (notificationStoreLoadError) {
    notificationStoreLoadError = null
    notificationStorePromise = null
  }

  if (!notificationStorePromise) {
    notificationStorePromise = import('./notifications')
      .then((module) => {
        notificationStoreInstance = module.useNotificationStore()
        notificationStoreLoadError = null
        return notificationStoreInstance
      })
      .catch((error) => {
        // 记录错误并重置 Promise，允许后续重试
        // 注意：重置 Promise 是必要的，否则后续调用会永远返回失败的 Promise
        notificationStoreLoadError = error
        notificationStorePromise = null
        throw error
      })
  }

  return notificationStorePromise
}