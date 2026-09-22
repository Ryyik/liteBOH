<script setup>
import { watch, onMounted, onUnmounted, ref, computed, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import Footer from "./components/Footer.vue";
import UnifiedNavbar from "@/components/UnifiedNavbar/index.vue";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary.vue";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { loadNotificationStore, getNotificationStoreSync } from "@/stores/notification-loader";
import { logger } from "@/utils/logger.js";
import { useGlobalAiOverlay } from "@/composables/useGlobalAiOverlay";
const AiEdgeTrigger = defineAsyncComponent(() => import("@/components/AiEdgeTrigger.vue"));
const AdminConfirmModal = defineAsyncComponent(() => import("@/components/AdminConfirmModal.vue"));
import { useConfirmDialog } from "@/composables/useConfirmDialog.js";
import PWAUpdateToast from "@/components/PWAUpdateToast/index.vue";
import PostDetailModal from "./views/PostDetail/PostDetailModal.vue";
import { useGlobalAiPreferences, matchesGlobalAiShortcut } from "@/composables/useGlobalAiPreferences.js";
import { consumeEmailConfirmationRedirect } from "@/composables/useSignupEmailConfirmation.js";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// ============================================
// 首屏加载态
// 说明：RouterView 在首屏导航确认之前不会渲染任何东西，而 vue-router 是在
// 导航阶段就 await 懒加载组件的，所以 <Suspense> 的 fallback 永远不会进入
// pending（实测 0 次）——主体区在那段时间是纯空白。
// 这里改用 router.isReady() 显式描述这段窗口，并加超时出口。
// 纯前端状态，骨架样式复用 index.html 的内联定义，零额外请求。
// ============================================
// 首屏加载态的两道超时（两处文案/机制刻意保持一致，见下）：
// - index.html 内联脚本 12s：Vue 完全没挂载起来时的兜底（骨架还在 DOM 里）
// - 本文件 10s：Vue 已挂载但首屏路由 chunk 没到位（骨架已被 mount 清空）
// 两者不会同时生效：Vue 一挂载就清空 #app，内联定时器因 contains(boot) 为 false 失效。
// 改文案或超时时长时务必同步另一处。
const bootReady = ref(false);
const bootTimedOut = ref(false);
let bootTimeoutId = 0;

router.isReady()
  .then(() => {
    bootReady.value = true;
    window.clearTimeout(bootTimeoutId);
  })
  .catch(() => {
    // 导航失败（如路由 chunk 拿不到）：保持加载态，交给下面的超时提示
  });

bootTimeoutId = window.setTimeout(() => {
  if (!bootReady.value) bootTimedOut.value = true;
}, 10000);

onUnmounted(() => {
  window.clearTimeout(bootTimeoutId);
});

// 邮箱验证回跳（?token_hash=...&type=signup|email_change）：在壳层一次性消费，
// 确认成功即建立会话 / 刷新邮箱字段，用户无感落在首页（详见 useSignupEmailConfirmation.js）
consumeEmailConfirmationRedirect();

// forceUpdate 会触发 index.html 内联脚本的 SW 注销 + 缓存清理流程
const reloadWithFreshBuild = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("forceUpdate", "true");
  window.location.replace(url.href);
};

// ============================================
// 全局渲染错误边界
// main.js 的 app.config.errorHandler 只负责「记录」：渲染管线抛错后组件树已经崩掉，
// 界面不会自愈，用户看到的是纯白页且没有任何出口。这里为 RouterView 提供兜底 UI。
//
// 「重置边界」与「重建页面树」是两件事，必须拆开：
// · 换页面时把 hasError 清掉 —— 否则一次错误会把后续每个页面都替换成提示卡；
// · 但**不重建页面树**，除非当前真的处于错误态。
// key 挂在包住整个 RouterView 的边界上，自增一次 = 整棵页面树销毁重建（连带
// 销毁路由级 <KeepAlive> 的缓存）。而「换页面」是最高频的操作 —— 每次重建等于让
// 目的页面连同它的全部缓存重新开始。
//
// 实测（scripts/probes/probe-userspace-pages.mjs，限速 1.2Mbps）：
//   从子页返回 /user-space 时，重建 vs 只清错误态 ——
//   页面根节点跨路由复用 0/9 → 9/9；返回期间数据请求 188 → 13（−93%）；
//   「数据就位」3240~4003ms → 579~1118ms（−72%~−82%）。
//
// ⚠️ 这里必须是 route.path，**不能是 route.fullPath**：fullPath 包含 query，
// UserSpace 的分区切换（?tab=…&view=…）、论坛筛选等「同页换参数」都会改 fullPath。
// 由 tests/unit/global-error-boundary.test.js 守两条不变量：粒度是 path、
// 且**只有处于错误态才自增 key**；scripts/probes/probe-route-switch.mjs 做端到端兜底。
// ============================================
const boundaryKey = ref(0);
// 「当前是否真的处于错误态」。换页面要不要重建树，取决于它，而不是取决于「换页了」这件事本身。
const boundaryErrored = ref(false);
watch(
  () => route.path,
  () => {
    if (!boundaryErrored.value) return;
    boundaryErrored.value = false;
    boundaryKey.value += 1;
  }
);

// 错误已由边界接管并渲染提示卡，这里只负责留痕并标记错误态（monitoring 上报链路建立后会自动收走）
const handleBoundaryError = ({ error, info } = {}) => {
  boundaryErrored.value = true;
  logger.error("app", `渲染错误已被全局边界捕获（${info || "未知来源"}）`, error);
};

// 用户选择重试/回首页后重建子树：不重建的话出错的组件实例可能仍处于 errored 状态
const handleBoundaryRecover = () => {
  boundaryErrored.value = false;
  boundaryKey.value += 1;
};
const { showLoginModal, isLoggedIn, isInitialized } = storeToRefs(authStore);
const userInfo = authStore.userInfo;
const notificationStoreRef = ref(getNotificationStoreSync());
const LoginView = defineAsyncComponent(() => import("./views/Login/index.vue"));
const showToast = computed(() => notificationStoreRef.value?.showToast || false);

const {
  isOpen: globalAiOpen, open: openGlobalAi, close: closeGlobalAi,
  theme: globalAiTheme
} = useGlobalAiOverlay();
const { preferences: globalAiPreferences } = useGlobalAiPreferences();
const toastTitle = computed(() => notificationStoreRef.value?.toastTitle || "");
const toastDesc = computed(() => notificationStoreRef.value?.toastDesc || "");
const toastIcon = computed(() => notificationStoreRef.value?.toastIcon || "🔔");
let activeListenerUserId = '';

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

const hideToast = () => {
  notificationStoreRef.value?.hideToast();
};

const startNotificationListener = async () => {
  if (!isInitialized.value || !isLoggedIn.value || !userInfo.id) {
    return;
  }

  if (activeListenerUserId === userInfo.id) {
    return;
  }

  const notificationStore = await ensureNotificationStore();
  logger.debug("app", "启动实时通知监听器", { userId: userInfo.id });
  await notificationStore.startNotificationListener(userInfo.id);
  activeListenerUserId = userInfo.id;
};

const checkAndStartListener = () => {
  if (isInitialized.value && isLoggedIn.value) {
    void startNotificationListener();
  }
};

// 根据当前路由为body添加对应的class
const updateBodyClass = () => {
  // 移除所有页面相关的class
  document.body.className = document.body.className.replace(/page-\w+/g, "");

  // 根据路由添加对应的class，确保route.name存在
  if (route.name) {
    const pageClass = `page-${route.name.toLowerCase()}`;
    document.body.classList.add(pageClass);
  }
};

// 初始化
updateBodyClass();

onMounted(() => {
  window.scrollTo(0, 0);

  // 等待 auth store 初始化完成后再启动通知监听
  checkAndStartListener();
});

// 监听路由变化
watch(() => route.name, updateBodyClass);

// 监听 notify 自定义事件（来自路由守卫等非组件上下文）
let notifyListener = null;
onMounted(() => {
  notifyListener = (event) => {
    const { message, type } = event.detail || {};
    if (message && notificationStoreRef.value) {
      const iconMap = { info: 'ℹ️', warning: '⚠️', error: '❌', success: '✅' };
      notificationStoreRef.value.displayToast(
        type === 'error' ? '操作受限' : type === 'warning' ? '提示' : '通知',
        message,
        iconMap[type] || 'ℹ️'
      );
    }
  };
  window.addEventListener('boh_notify', notifyListener);
});
onUnmounted(() => {
  if (notifyListener) {
    window.removeEventListener('boh_notify', notifyListener);
  }
  activeListenerUserId = '';
  notificationStoreRef.value?.stopNotificationListener();
});

// 全局 AI 覆盖层：键盘快捷键 (Cmd+K / Ctrl+K)
const handleGlobalAiKeydown = (e) => {
  if (globalAiPreferences.shortcutEnabled && matchesGlobalAiShortcut(e, globalAiPreferences.shortcut)) {
    // Lab 自带命令面板使用 Mod+K；保留该页面原有快捷键，用户仍可在设置中改为 Mod+J/Space。
    if (route.name === 'Lab' && globalAiPreferences.shortcut === 'mod+k') return;
    if (route.name === 'AiChat') return;
    // 灵动岛挂在 UnifiedNavbar 内：导航栏被隐藏的路由（admin/user-space 子页等）
    // 没有宿主容器，open() 只会置位 isOpen 而永远不渲染，必须直接忽略
    if (!showGlobalNavbar.value) return;
    e.preventDefault();
    if (globalAiOpen.value) {
      window.dispatchEvent(new CustomEvent('boh-ai-focus-composer'));
    } else {
      openGlobalAi({ snap: globalAiPreferences.initialHeight === 'full' ? 2 : 1 });
    }
  }
};

// 全局 confirm/prompt 弹窗 (替换 window.confirm / window.prompt)
const {
  state: confirmDialogState,
  close: closeConfirmDialog
} = useConfirmDialog();

const handleConfirmDialogConfirm = (payload) => {
  // AdminConfirmModal 的 confirm 事件: prompt 模式返回输入值字符串, confirm/alert 模式返回 true
  if (!confirmDialogState.resolver) return;
  const resolver = confirmDialogState.resolver;
  confirmDialogState.resolver = null;
  // resolver('confirm') => 主按钮; resolver('tertiary') => 第三按钮; resolver(false) => cancel
  resolver(payload === true && confirmDialogState.kind !== 'alert' ? 'confirm' : payload);
  confirmDialogState.visible = false;
};

const handleConfirmDialogCancel = () => {
  if (!confirmDialogState.resolver) return;
  const resolver = confirmDialogState.resolver;
  confirmDialogState.resolver = null;
  resolver('cancel');
  confirmDialogState.visible = false;
};

const handleConfirmDialogTertiary = () => {
  if (!confirmDialogState.resolver) return;
  const resolver = confirmDialogState.resolver;
  confirmDialogState.resolver = null;
  resolver('tertiary');
  confirmDialogState.visible = false;
};

const handleConfirmDialogUpdateVisible = (v) => {
  if (!v) closeConfirmDialog(false);
  else confirmDialogState.visible = true;
};

onMounted(() => {
  window.addEventListener('keydown', handleGlobalAiKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalAiKeydown);
});

// 监听用户ID变化，开启通知监听
watch(() => userInfo.id, (newId) => {
  if (newId && isInitialized.value && isLoggedIn.value) {
    void startNotificationListener();
  } else {
    activeListenerUserId = '';
    notificationStoreRef.value?.stopNotificationListener();
  }
}, { immediate: true });

// 监听初始化状态
watch(isInitialized, (newVal) => {
  if (newVal) {
    checkAndStartListener();
  }
});

// 全局导航栏：隐藏在桌面嵌入模式、路由标记隐藏、UserSpace内部子页面、或个人资料子页面时
const showGlobalNavbar = computed(() => {
  if (route.query?.embed === 'desktop') return false;
  if (route.meta?.hideNavbar) return false;
  if (String(route.query?.from || '').startsWith('userspace')) return false;
  if (
    route.path === '/user-space' &&
    route.query?.tab === 'profile' &&
    route.query?.view &&
    route.query.view !== 'home'
  ) return false;
  // 设置子页（数据导出/数据与隐私/编辑资料）：悬浮导航岛会盖住 sticky 头部的返回按钮
  if (
    route.path === '/user-space' &&
    route.query?.tab === 'settings' &&
    route.query?.view &&
    route.query.view !== 'home'
  ) return false;
  return true;
});
</script>

<template>
  <UnifiedNavbar v-if="showGlobalNavbar" />

  <!-- 首屏加载态：路由就绪前替代主体空白（骨架样式来自 index.html 内联样式） -->
  <div
    v-if="!bootReady"
    class="boh-boot-body boh-boot-body--standalone"
    role="status"
    aria-live="polite"
  >
    <template v-if="!bootTimedOut">
      <div class="boh-boot-dots" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="boh-boot-text">正在加载…</p>
    </template>
    <template v-else>
      <!-- 文案与 index.html 内联的 12s 兜底保持一致：同一故障两种说法会让用户困惑 -->
      <p class="boh-boot-text">加载超时，可能是网络不稳定或刚刚更新了版本</p>
      <button class="boh-boot-retry" type="button" @click="reloadWithFreshBuild">重新加载</button>
    </template>
  </div>

  <!-- 渲染期抛错的兜底：包住 Suspense/RouterView，避免整树崩掉后只剩白屏 -->
  <GlobalErrorBoundary
    v-else
    :key="boundaryKey"
    @error="handleBoundaryError"
    @recover="handleBoundaryRecover"
  >
    <Suspense>
      <template #default>
        <RouterView v-slot="{ Component, route: activeRoute }">
          <!--
            ⚠️ 这里**刻意没有**路由级 <Transition>，不要凭直觉加回来。
            2026-09-20 试过一版「只做 enter、不做 leave」的实现（目的是避免 mode="out-in"
            给每次切换硬加一段等待），但实测过渡类名从未被加上：MutationObserver 与 rAF
            采样两种独立探测结论一致，且换最简结构（去掉 KeepAlive/key）同样不触发。
            注意生产构建会剥掉 Vue 的开发告警，「没有告警」不能作为「结构合法」的证据。
            剩下的怀疑点在外层 Suspense（它对 RouterView 的接管与 Transition 的解析顺序），
            需专门一轮验证；在验证通过之前不该把这个改动留在最关键的壳层文件里。

            与此无关、且**已经生效**的是分区/档位级过渡：见 shell-community.css 的
            .tab-page / .is-leaving / .tab-transition-forward|back（280ms 进、250ms 出、
            方向感知、reduced-motion 齐备）。

            逐路由切换后的「主内容是否可见、是否卡在 opacity:0、有无报错」由
            scripts/probes/probe-route-switch.mjs 巡检。
          -->
          <KeepAlive>
            <component v-if="activeRoute.meta?.keepAlive" :is="Component" :key="activeRoute.name" />
          </KeepAlive>
          <component v-if="!activeRoute.meta?.keepAlive" :is="Component" :key="activeRoute.fullPath" />
        </RouterView>
      </template>
      <template #fallback>
        <div class="page-suspense-fallback">
          <div class="suspense-skeleton">
            <div class="suspense-skeleton-bar"></div>
            <div class="suspense-skeleton-content">
              <div class="suspense-skeleton-line w-60"></div>
              <div class="suspense-skeleton-line w-80"></div>
              <div class="suspense-skeleton-line w-40"></div>
            </div>
          </div>
        </div>
      </template>
    </Suspense>
  </GlobalErrorBoundary>
  <Footer v-if="bootReady && !route.meta?.hideFooter" />

  <!-- 全局登录模态框 -->
  <LoginView v-if="showLoginModal" :show="showLoginModal" :is-modal="true" @close="showLoginModal = false" />

  <!-- 帖子详情弹窗宿主（横屏）：壳很轻可常驻；重的 PostDetailMain 在弹窗内异步加载 -->
  <PostDetailModal />

  <!-- AI 边缘触发区（移动端侧拉唤起 BOHAI 灵动岛）；导航栏隐藏的路由上岛无宿主，一并隐藏 -->
  <AiEdgeTrigger
    :show="showGlobalNavbar && !globalAiOpen && globalAiPreferences.gestureEnabled && route.name !== 'AiChat'"
    :side="globalAiPreferences.gestureSide"
    :sensitivity="globalAiPreferences.gestureSensitivity"
    :haptics="globalAiPreferences.hapticsEnabled"
    :animations="globalAiPreferences.animationsEnabled"
    @trigger="openGlobalAi({ snap: globalAiPreferences.initialHeight === 'full' ? 2 : 1 })"
  />

  <!-- 首次进入提示 & 消息通知 -->
  <Transition name="toast">
    <div v-if="showToast" class="welcome-toast" @click="hideToast">
      <div class="toast-content">
        <div class="toast-icon">{{ toastIcon }}</div>
        <div class="toast-text">
          <div class="toast-title">{{ toastTitle }}</div>
          <div class="toast-desc">{{ toastDesc }}</div>
        </div>
        <button class="toast-close" @click.stop="hideToast">&times;</button>
      </div>
    </div>
  </Transition>

  <!-- PWA 更新提示（非阻塞） -->
  <PWAUpdateToast />

  <!-- 全局 confirm / prompt 弹窗 (供 useConfirmDialog 复用) -->
  <AdminConfirmModal
    :visible="confirmDialogState.visible"
    :title="confirmDialogState.title"
    :message="confirmDialogState.message"
    :kind="confirmDialogState.kind"
    :tone="confirmDialogState.tone"
    :confirm-text="confirmDialogState.confirmText"
    :cancel-text="confirmDialogState.cancelText"
    :tertiary-text="confirmDialogState.tertiaryText"
    :placeholder="confirmDialogState.placeholder"
    :default-value="confirmDialogState.defaultValue"
    @confirm="handleConfirmDialogConfirm"
    @cancel="handleConfirmDialogCancel"
    @tertiary="handleConfirmDialogTertiary"
    @update:visible="handleConfirmDialogUpdateVisible"
  />
</template>

<style>
/* ... 现有样式保持不变 ... */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", "微软雅黑", sans-serif;
}

/* 移除全局平滑滚动，它会干扰路由跳转的回顶逻辑 */
html {
  scroll-behavior: auto !important;
}

/* 绿色玻璃效果消息提示窗 */
.welcome-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  cursor: pointer;
  pointer-events: auto;
}

.toast-content {
  background: rgba(34, 197, 94, 0.15);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  border: 1px solid rgba(34, 197, 94, 0.2);
  padding: 16px 20px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1),
    inset 0 0 20px rgba(34, 197, 94, 0.05);
  min-width: 300px;
}

.toast-icon {
  font-size: 24px;
}

.toast-text {
  flex: 1;
}

.toast-title {
  color: #15803d;
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 2px;
}

.toast-desc {
  color: #166534;
  font-size: 13px;
  opacity: 0.9;
}


/* 暗色：绿色玻璃 toast 提亮（dark audit 2026-09-08） */
html[data-theme="dark"] .toast-content {
  background: rgba(52, 199, 89, 0.16);
  border-color: rgba(52, 199, 89, 0.3);
}

html[data-theme="dark"] .toast-title,
html[data-theme="dark"] .toast-close { color: #6ee7a0; }

html[data-theme="dark"] .toast-desc { color: #b5f0c8; }

.toast-close {
  background: none;
  border: none;
  color: #15803d;
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.toast-close:hover {
  opacity: 1;
}

/* 动画效果 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
}

.toast-enter-from {
  transform: translateX(100px) scale(0.9);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(50px);
  opacity: 0;
}

/* 响应式调整：避免竖屏或窄屏遮挡导航栏 */
@media (max-width: 768px),
(orientation: portrait) {
  .welcome-toast {
    top: 80px;
    /* 避开导航栏高度 */
    right: 16px;
    left: 16px;
    /* 在窄屏下左右边距一致 */
  }

  .toast-content {
    min-width: unset;
    width: 100%;
    justify-content: center;
  }
}

/* Suspense 路由切换骨架屏 */
.page-suspense-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 40px 20px;
}

.suspense-skeleton {
  width: 100%;
  max-width: 600px;
}

.suspense-skeleton-bar {
  height: 180px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: suspense-shimmer 1.5s infinite;
  border-radius: 12px;
  margin-bottom: 24px;
}

.suspense-skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 8px;
}

.suspense-skeleton-line {
  height: 16px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: suspense-shimmer 1.5s infinite;
  border-radius: 8px;
}

.suspense-skeleton-line.w-60 { width: 60%; }
.suspense-skeleton-line.w-80 { width: 80%; }
.suspense-skeleton-line.w-40 { width: 40%; }

@keyframes suspense-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

</style>
