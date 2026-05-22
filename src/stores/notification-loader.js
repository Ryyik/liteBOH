let notificationStoreInstance = null;
let notificationStorePromise = null;

export function getNotificationStoreSync() {
  return notificationStoreInstance;
}

export async function loadNotificationStore() {
  if (notificationStoreInstance) {
    return notificationStoreInstance;
  }

  if (!notificationStorePromise) {
    notificationStorePromise = import('./notifications.js')
      .then((module) => {
        notificationStoreInstance = module.useNotificationStore();
        return notificationStoreInstance;
      })
      .catch((error) => {
        notificationStorePromise = null;
        throw error;
      });
  }

  return notificationStorePromise;
}
