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
import "./styles/common/login-modal.css";
import "./styles/common/glass-ui.css";
import "./styles/common/animations.css";

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
import "./styles/components/close-button.css";
import "./styles/components/page__animate.css";

// ============================================
// 布局与页面样式 (Layout & Page Styles)
// ============================================
import "./styles/layouts/footer.css";
import "./styles/pages/globalpage.css";
import "./styles/pages/homepages.css";
import "./styles/pages/section__header.css";
import "./style.css";

// ============================================
// 应用核心
// ============================================
import App from "./App.vue";
import router from "./router";
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { useAuthStore } from './stores/auth';
import { useBagStore } from './stores/bag';
import { initMonitoring } from './utils/monitoring.js';
import { themeManager } from './utils/theme-manager.js';
import { logger } from './utils/logger.js';
import { setupVitePreloadErrorRecovery } from './utils/vite-preload-recovery.js';
import { initImageOptimizer } from './utils/image-optimizer.js';

// ============================================
// 延迟加载的非关键样式
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

// ============================================
// 浏览器端初始化
// ============================================
if (typeof window !== "undefined") {
  setupVitePreloadErrorRecovery();
  initImageOptimizer({ onReady: scheduleDeferredGlobalStyles });

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

  // Supabase API 预连接（运行时从环境变量动态注入）
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      const origin = url.origin;
      ['dns-prefetch', 'preconnect'].forEach((rel) => {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = origin;
        if (rel === 'preconnect') link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      });
    } catch { /* 忽略无效 URL */ }
  }

  const elem = document.createElement("canvas");
  const supported =
    elem.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  document.documentElement.classList.add(
    supported ? "webp-support" : "webp-no-support"
  );

  // 监听 PWA 安装事件
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    logger.info("pwa", "PWA 安装事件已捕获");
  });

  // 监听应用已安装事件
  window.addEventListener("appinstalled", () => {
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