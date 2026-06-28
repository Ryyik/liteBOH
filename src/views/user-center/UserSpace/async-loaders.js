import { defineAsyncComponent, h } from 'vue';
import AiChatSkeleton from './components/AiChatSkeleton.vue';

const forumComponentLoader = () => import('@/views/Forum/ForumMain.vue');
const messagesComponentLoader = () => import('@/views/user-center/Messages/index.vue');
const showsComponentLoader = () => import('@/views/Shows/index.vue');
const bohaiComponentLoader = () => import('@/views/BOHAI/BOHAI/BOHAIMain.vue');
let forumPreloadPromise = null;
let messagesPreloadPromise = null;
let showsPreloadPromise = null;
let bohaiPreloadPromise = null;
let forumPreloadIdleId = null;
let forumPreloadTimeoutId = null;
let isUserSpaceMounted = false;

export const setUserSpaceMountedForPreload = (value) => {
  isUserSpaceMounted = Boolean(value);
};
const idlePreloadHandles = new Map();
export const preloadForumComponent = () => {
  if (!forumPreloadPromise) {
    forumPreloadPromise = forumComponentLoader().catch(() => {
      forumPreloadPromise = null;
      return null;
    });
  }
  return forumPreloadPromise;
};
export const preloadMessagesComponent = () => {
  if (!messagesPreloadPromise) {
    messagesPreloadPromise = messagesComponentLoader().catch(() => {
      messagesPreloadPromise = null;
      return null;
    });
  }
  return messagesPreloadPromise;
};
export const preloadShowsComponent = () => {
  if (!showsPreloadPromise) {
    showsPreloadPromise = showsComponentLoader().catch(() => {
      showsPreloadPromise = null;
      return null;
    });
  }
  return showsPreloadPromise;
};
export const preloadBOHAIComponent = () => {
  if (!bohaiPreloadPromise) {
    bohaiPreloadPromise = bohaiComponentLoader().catch(() => {
      bohaiPreloadPromise = null;
      return null;
    });
  }
  return bohaiPreloadPromise;
};

const communityComponentLoader = () => import('./components/CommunityTab.vue');
let communityPreloadPromise = null;

export const preloadCommunityComponent = () => {
  if (!communityPreloadPromise) {
    communityPreloadPromise = communityComponentLoader().catch(() => {
      communityPreloadPromise = null;
      return null;
    });
  }
  return communityPreloadPromise;
};

export const AsyncCommunity = defineAsyncComponent(communityComponentLoader);

const canUseNetworkForForumPreload = () => {
  if (typeof navigator === 'undefined') return true;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  return effectiveType !== 'slow-2g' && effectiveType !== '2g';
};
export const clearScheduledForumPreload = () => {
  if (typeof window === 'undefined') return;
  if (forumPreloadTimeoutId !== null) {
    window.clearTimeout(forumPreloadTimeoutId);
    forumPreloadTimeoutId = null;
  }
  if (forumPreloadIdleId !== null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(forumPreloadIdleId);
    forumPreloadIdleId = null;
  }
};
export const scheduleIdleTask = (key, task, { timeout = 1600, fallbackDelay = 220 } = {}) => {
  if (typeof window === 'undefined') {
    task();
    return;
  }
  if (idlePreloadHandles.has(key)) return;
  const run = () => {
    idlePreloadHandles.delete(key);
    if (!isUserSpaceMounted) return;
    task();
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout });
    idlePreloadHandles.set(key, { type: 'idle', id });
    return;
  }
  const id = window.setTimeout(run, fallbackDelay);
  idlePreloadHandles.set(key, { type: 'timeout', id });
};

export const clearIdlePreloadTasks = () => {
  if (typeof window === 'undefined') return;
  idlePreloadHandles.forEach((handle) => {
    if (handle.type === 'idle' && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(handle.id);
      return;
    }
    window.clearTimeout(handle.id);
  });
  idlePreloadHandles.clear();
};

export const scheduleForumPreload = (currentTabValue = 'posts') => {
  if (currentTabValue !== 'posts') return;
  if (!canUseNetworkForForumPreload()) return;
  if (forumPreloadPromise || forumPreloadIdleId !== null || forumPreloadTimeoutId !== null) return;
  const run = () => {
    forumPreloadIdleId = null;
    forumPreloadTimeoutId = null;
    if (!isUserSpaceMounted) return;
    void preloadForumComponent();
  };
  if (typeof window === 'undefined') {
    run();
    return;
  }
  if (typeof window.requestIdleCallback === 'function') {
    forumPreloadIdleId = window.requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  forumPreloadTimeoutId = window.setTimeout(run, 1200);
};

export const AsyncForum = defineAsyncComponent({
  loader: forumComponentLoader,
  delay: 120,
  timeout: 20 * 1000,
  onError(error, retry, fail, attempts) {
    if (attempts <= 2) {
      setTimeout(() => retry(), attempts * 300);
      return;
    }
    fail(error);
  }
});

export const AsyncShows = defineAsyncComponent(showsComponentLoader);
export const AsyncMessages = defineAsyncComponent(messagesComponentLoader);

const AsyncBOHAIError = {
  name: 'AsyncBOHAIError',
  setup() {
    return () => h('div', { class: 'ai-load-fallback' }, [
      h('h3', 'BOH AI 加载失败'),
      h('p', '请刷新页面后重试，或稍后再打开 AI。')
    ]);
  }
};

export const AsyncBOHAI = defineAsyncComponent({
  loader: bohaiComponentLoader,
  loadingComponent: AiChatSkeleton,
  errorComponent: AsyncBOHAIError,
  delay: 120,
  timeout: 15000
});

export const AsyncCloudPlus = defineAsyncComponent(() => import('@/views/user-center/Cloud+/CloudPlusMain.vue'));
