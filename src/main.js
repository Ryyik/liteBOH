import { createApp } from "vue";
import { MotionPlugin } from '@vueuse/motion'

// ============================================
// 第三方库样式 (Vendor Styles)
// ============================================
import "./styles/vendor/fonts.css";
import "./styles/vendor/unified-nav.css";

// ============================================
// 公共样式库 (Common Styles)
// ============================================
import "./styles/common/glass-ui.css";
import "./styles/common/animations.css";
import "./styles/common/login-modal.css";

// ============================================
// 全局性能优化
// ============================================
const deferredGlobalStyleLoaders = [
  () => import("./styles/vendor/animate.min.css"),
  () => import("./styles/vendor/swiper.min.css"),
];

const scheduleDeferredGlobalStyles = () => {
  const loadStyles = () => {
    Promise.allSettled(deferredGlobalStyleLoaders.map((loader) => loader())).catch(() => { });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(loadStyles, { timeout: 2500 });
    return;
  }
  setTimeout(loadStyles, 1200);
};

const VITE_PRELOAD_RELOAD_TS_KEY = "boh_vite_preload_reload_ts";
const VITE_PRELOAD_RELOAD_COOLDOWN_MS = 30 * 1000;

const setupVitePreloadErrorRecovery = () => {
  if (import.meta.env.DEV || typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    const now = Date.now();
    let lastReloadAt = 0;
    try {
      lastReloadAt = Number(sessionStorage.getItem(VITE_PRELOAD_RELOAD_TS_KEY) || 0);
    } catch {
      lastReloadAt = 0;
    }

    // 限流重载，避免资源持续异常时反复刷新。
    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < VITE_PRELOAD_RELOAD_COOLDOWN_MS) {
      return;
    }

    try {
      sessionStorage.setItem(VITE_PRELOAD_RELOAD_TS_KEY, String(now));
    } catch {
      // ignore
    }
    if (typeof event?.preventDefault === "function") {
      event.preventDefault();
    }
    window.location.reload();
  });
};

if (typeof window !== "undefined") {
  setupVitePreloadErrorRecovery();

  const optimizeImage = (img) => {
    if (!img.hasAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
    }
    if (!img.hasAttribute('loading') && img.getAttribute('fetchpriority') !== 'high') {
      img.setAttribute('loading', 'lazy');
    }
  };

  const optimizeImageTree = (rootNode) => {
    if (!rootNode) return;
    if (rootNode.tagName === 'IMG') {
      optimizeImage(rootNode);
    }
    if (typeof rootNode.querySelectorAll === 'function') {
      rootNode.querySelectorAll('img').forEach(optimizeImage);
    }
  };

  const pendingNodes = new Set();
  let rafId = 0;
  const flushPendingNodes = () => {
    rafId = 0;
    pendingNodes.forEach((node) => optimizeImageTree(node));
    pendingNodes.clear();
  };
  const scheduleFlush = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(flushPendingNodes);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (!mutation.addedNodes.length) continue;
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 || node.nodeType === 11) {
          pendingNodes.add(node);
        }
      });
    }
    if (pendingNodes.size > 0) {
      scheduleFlush();
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    optimizeImageTree(document.body);
    const observeRoot = document.getElementById('app') || document.body;
    if (observeRoot) {
      observer.observe(observeRoot, { childList: true, subtree: true });
      scheduleDeferredGlobalStyles();
    } else {
      scheduleDeferredGlobalStyles();
      observer.disconnect();
    }
  });
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (pendingNodes.size) {
      pendingNodes.clear();
    }
  });
}

// ============================================
// 辅助样式 (Helper Styles)
// ============================================
import "./styles/helpers/variabls.css";
import "./styles/helpers/mixins.css";
import "./styles/helpers/function.css";

// ============================================
// 组件样式 (Component Styles)
// ============================================
import "./styles/components/buttons.css";
import "./styles/components/cursor.css";
import "./styles/components/headings.css";
import "./styles/components/link_underline.css";
import "./styles/components/overlay.css";
import "./styles/components/page__animate.css";
import "./styles/components/close-button.css";

// ============================================
// 布局样式 (Layout Styles)
// ============================================
import "./styles/layouts/footer.css";

import "./styles/pages/globalpage.css";
import "./styles/pages/homepages.css";

import "./styles/pages/section__header.css";
import "./style.css";

import App from "./App.vue";
import router from "./router";
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { useAuthStore } from './stores/auth';
import { useBagStore } from './stores/bag';
import { initMonitoring } from './utils/monitoring.js';
import { themeManager } from './utils/theme-manager.js';
import { logger } from './utils/logger.js';

if (typeof window !== "undefined") {
  // 开发环境下清理可能残留的旧 Service Worker / Cache，避免加载到历史 hash 资源。
  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      })
      .catch(() => { });
    if (typeof caches !== 'undefined') {
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => { });
    }
  }

  initMonitoring();
  const elem = document.createElement("canvas");
  const supported =
    elem.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  document.documentElement.classList.add(
    supported ? "webp-support" : "webp-no-support"
  );

  // 监听 PWA 安装事件
  window.addEventListener("beforeinstallprompt", (e) => {
    // 阻止默认的迷你信息栏显示
    e.preventDefault();
    // 保存事件以便稍后使用
    window.deferredPrompt = e;
    logger.info("pwa", "PWA 安装事件已捕获");
  });

  // 监听应用已安装事件
  window.addEventListener("appinstalled", () => {
    // 清除保存的事件
    window.deferredPrompt = null;
    logger.info("pwa", "PWA 应用已安装");
  });
}
const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(pinia);
app.use(MotionPlugin);
app.use(router);

const authStore = useAuthStore();
const bagStore = useBagStore();

authStore.initLoginState();
bagStore.loadShoppingBag();

app.mount("#app");

// 初始化主题管理器（在应用挂载后，确保 DOM 元素已存在）
themeManager.init();
