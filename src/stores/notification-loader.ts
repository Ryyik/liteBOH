import type { useNotificationStore as UseNotificationStoreFn } from './notifications'

let notificationStoreInstance: ReturnType<typeof UseNotificationStoreFn> | null = null
let notificationStorePromise: Promise<ReturnType<typeof UseNotificationStoreFn>> | null = null

export function getNotificationStoreSync(): ReturnType<typeof UseNotificationStoreFn> | null {
  return notificationStoreInstance
}

export async function loadNotificationStore(): Promise<ReturnType<typeof UseNotificationStoreFn>> {
  if (notificationStoreInstance) {
    return notificationStoreInstance
  }

  if (!notificationStorePromise) {
    notificationStorePromise = import('./notifications')
      .then((module) => {
        notificationStoreInstance = module.useNotificationStore()
        return notificationStoreInstance
      })
      .catch((error) => {
        notificationStorePromise = null
        throw error
      })
  }

  return notificationStorePromise
}