import { defineAsyncComponent, h } from 'vue';
import AiChatSkeleton from './components/AiChatSkeleton.vue';
import { createStyleSheetGuard } from '@/utils/style-load-guard.js';
import { createPanelAsync } from '@/utils/async-component.js';
import { reportEvent } from '@/utils/monitoring.js';

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
  if (isUserSpaceMounted) {
    // 每次进入用户空间都给样式自愈一次新预算（上一轮用掉的次数不该跨次累计）
    resetProfileStyleRepair();
  } else {
    stopProfileStyleRepair();
  }
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

/* 设置内部档位的面板 chunk（编辑资料 / 数据导出 / 数据与隐私）。
   它们由 UserSpaceMain 的 defineAsyncComponent 按需加载，首次换档要等一次动态 import：
   实测首次进入「数据导出」「数据与隐私」耗时 291~313ms（其中约 180ms 是 out-in 过渡，
   其余是 chunk 往返）。三个 chunk 都很小（gzip 1.0~3.0KB），空闲预载性价比高。
   ⚠️ 模块说明符必须与 UserSpaceMain 里的一致，否则会各自打出独立 chunk。 */
const settingsSubPanelLoaders = [
  () => import('./components/EditProfilePanel.vue'),
  () => import('./components/DataExportPanel.vue'),
  () => import('./components/DataPrivacyPanel.vue'),
];
let settingsSubPanelsPromise = null;
export const preloadSettingsSubPanels = () => {
  if (!settingsSubPanelsPromise) {
    settingsSubPanelsPromise = Promise.all(settingsSubPanelLoaders.map((load) => load())).catch(
      () => {
        settingsSubPanelsPromise = null;
        return null;
      },
    );
  }
  return settingsSubPanelsPromise;
};

/* ============================================
   「我的」页三个全局样式（profile-base / profile-panels / responsive-integrations）
   —— 加载 + 失败自愈

   这三个文件是 posts 分区唯一的全局样式入口，构建后（cssCodeSplit）各自是一条
   由 __vitePreload 动态注入的独立 <link>，「只写 void preloadProfileStyles()」不够：
     · 去重表 i[url] 在 fetch 完成前写入 ⇒ 失败后同会话再 import 直接 resolve、
       永不重建 link（「切走再切回」是假重试，实测差分不变）；
     · 全局恢复链一次会话只够救一两次（30s 冷却 + 一次性护栏），预算耗尽后页面
       会停在「半样式」（实测 .profile-page-content padding 40px→0px）。

   ⚠️ 判活 / 摘旧建新 / 有限退避这三件事**只在这里绑定参数**，实现全在单一真源
   `@/utils/style-load-guard.js`（含 crossOrigin 的 sheet 读 cssRules 会抛 SecurityError
   这类坑）。**新页面要兜动态 CSS，请复用那个 guard，不要再写一份。** */
const PROFILE_STYLE_MATCHERS = [
  /\/profile-base-[^/]+\.css$/,
  /\/profile-panels-[^/]+\.css$/,
  /\/responsive-integrations-[^/]+\.css$/,
];
const PROFILE_STYLE_REPAIR_DELAYS = [700, 1800, 4000];

let profileStylesPromise = null;

const profileStyleGuard = createStyleSheetGuard({
  matchers: PROFILE_STYLE_MATCHERS,
  delays: PROFILE_STYLE_REPAIR_DELAYS,
  isActive: () => isUserSpaceMounted,
  /* 只有「退避预算用尽、样式仍然缺」才上报：这一档是真·带病运行，
     而「失败过一次但自愈回来了」由 vite-preload-recovery 的 css_load_failure 覆盖
     （有 load_failure 无 giveup = 自愈成功，两者成对看才有意义）。 */
  onGiveUp: () => reportEvent('style_repair_giveup', { scope: 'profile' }),
});

/** 离开用户空间：停掉退避计时器（保留已消耗的预算） */
export const stopProfileStyleRepair = () => profileStyleGuard.stop();

/** 重新进入用户空间 = 一次新的自愈机会：重置预算 + 立刻复核一轮 */
export const resetProfileStyleRepair = () => {
  void profileStyleGuard.reset();
};

/**
 * 保证「我的」页三个全局样式就位。
 * ⚠️ 刻意**不 reject**：调用点有一半是 `void`，另一半是 `await …then openModal()`。
 * 之前 reject 会让 `await` 那条线在样式失败时直接中断（主题弹窗打不开），
 * 现在统一返回 settled 的 promise，失败由退避重试兜底。
 */
export const preloadProfileStyles = () => {
  if (!profileStylesPromise) {
    profileStylesPromise = Promise.all([
      import('./styles/profile-base.css'),
      import('./styles/profile-panels.css'),
      import('./styles/responsive-integrations.css'),
    ])
      .catch((error) => error)
      .then(async (error) => {
        // import 的 settle ≠ 样式已生效：去重表命中时它会「成功」返回，而 link 仍是坏的。
        // 所以这里按 link 的规则数复核一轮，仍坏就交给退避重试。
        const stillBroken = await profileStyleGuard.repairNow();
        if (stillBroken > 0) profileStyleGuard.schedule();
        return error;
      });
  }
  return profileStylesPromise;
};

/** 同步判活：三个 profile 样式是否都已真实生效（未建出 link 也算未就绪） */
export const areProfileStylesApplied = () => profileStyleGuard.areApplied();

/**
 * 等样式就位（供「冷启动直达 posts」的就绪门用）。
 * ⚠️ 定义在 preloadProfileStyles **之后**：本文件的 const 箭头函数有 TDZ，
 *    反过来放会让调用方在模块初始化期拿到未初始化的绑定。
 * ⚠️ 超时返回 false，由调用方降级 —— 绝不能把「等不到」变成永久空白。
 */
export const waitForProfileStyles = async ({ timeoutMs = 1200, intervalMs = 120 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  await preloadProfileStyles();
  while (!profileStyleGuard.areApplied() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return profileStyleGuard.areApplied();
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

/* 「成员」分区面板。⚠️ 不要退回 defineAsyncComponent(loader) 的简写：
   那只在 loader 成功后才有 UI，chunk 拉不到时整个分区是**一片空白且无提示**
   （用户报「点成员什么都没有」）。与同文件的 AsyncForum 同一套退避重试约定，
   三次仍失败则交给外层 GlobalErrorBoundary 出错误卡。 */
export const AsyncCommunity = defineAsyncComponent({
  loader: communityComponentLoader,
  delay: 120,
  timeout: 20 * 1000,
  onError(error, retry, fail, attempts) {
    if (attempts <= 2) {
      setTimeout(() => retry(), attempts * 300);
      return;
    }
    fail(error);
  },
});

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

export const scheduleForumPreload = (currentTabValue = 'community') => {
  if (currentTabValue !== 'community') return;
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
  },
});

/* 「节目」与「消息」分区：与 AsyncCommunity/AsyncForum 同一套兜底约定
   （失败退避重试 + 上报 + 错误卡），统一走 createPanelAsync 工厂，不再裸简写。 */
export const AsyncShows = createPanelAsync(showsComponentLoader, { label: 'AsyncShows' });
export const AsyncMessages = createPanelAsync(messagesComponentLoader, { label: 'AsyncMessages' });

const AsyncBOHAIError = {
  name: 'AsyncBOHAIError',
  setup() {
    return () =>
      h('div', { class: 'ai-load-fallback' }, [
        h('h3', 'BOH AI 加载失败'),
        h('p', '请刷新页面后重试，或稍后再打开 AI。'),
      ]);
  },
};

export const AsyncBOHAI = defineAsyncComponent({
  loader: bohaiComponentLoader,
  loadingComponent: AiChatSkeleton,
  errorComponent: AsyncBOHAIError,
  delay: 120,
  timeout: 15000,
});
