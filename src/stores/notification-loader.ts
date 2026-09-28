import { ref } from 'vue';
import type { useNotificationStore as UseNotificationStoreFn } from './notifications';

let notificationStoreInstance: ReturnType<typeof UseNotificationStoreFn> | null = null;
let notificationStorePromise: Promise<ReturnType<typeof UseNotificationStoreFn>> | null = null;
let notificationStoreLoadError: Error | null = null;

// 模块级共享 ref：六个宿主（App / UnifiedNavbar / Home / Messages /
// UserSpaceMain / ForumMain）原先各自 `ref(getNotificationStoreSync())`
// + 手写一份 ensureNotificationStore，2026-09-28 收敛到此处。
// 语义差异仅一处：任一宿主加载成功后，其余宿主的 ref 立即可见实例
// （原先要等自己 ensure）。store 是 pinia 单例，不产生额外加载或请求。
const notificationStoreRef = ref<ReturnType<typeof UseNotificationStoreFn> | null>(
  getNotificationStoreSync(),
);

export function getNotificationStoreRef() {
  return notificationStoreRef;
}

export async function ensureNotificationStore() {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
}

export function getNotificationStoreSync(): ReturnType<typeof UseNotificationStoreFn> | null {
  return notificationStoreInstance;
}

export function getNotificationStoreError(): Error | null {
  return notificationStoreLoadError;
}

export function clearNotificationStoreError(): void {
  notificationStoreLoadError = null;
}

export async function loadNotificationStore(): Promise<ReturnType<typeof UseNotificationStoreFn>> {
  if (notificationStoreInstance) {
    return notificationStoreInstance;
  }

  // 如果之前加载失败，清除错误状态后允许重试
  if (notificationStoreLoadError) {
    notificationStoreLoadError = null;
    notificationStorePromise = null;
  }

  if (!notificationStorePromise) {
    notificationStorePromise = import('./notifications')
      .then((module) => {
        notificationStoreInstance = module.useNotificationStore();
        notificationStoreLoadError = null;
        return notificationStoreInstance;
      })
      .catch((error) => {
        // 记录错误并重置 Promise，允许后续重试
        // 注意：重置 Promise 是必要的，否则后续调用会永远返回失败的 Promise
        notificationStoreLoadError = error;
        notificationStorePromise = null;
        throw error;
      });
  }

  return notificationStorePromise;
}
