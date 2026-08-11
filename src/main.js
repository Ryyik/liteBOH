import { createApp } from "vue";
import { MotionPlugin } from "@vueuse/motion";

// ============================================
// Motion Tokens — 必须在所有其他样式之前加载
// ============================================
import "./styles/common/tokens.css";

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
import "./styles/components/headings.css";
import "./styles/components/link_underline.css";
import "./styles/components/overlay.css";
import "./styles/components/close-button.css";

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
import { initVersionChecker } from './utils/version-checker.js';
import { loadFreemodelsFromDB } from './utils/siliconflow-free-models.js';
import { initHiagentWidget } from './utils/hiagent-widget.js';

// ============================================
// 延迟加载的非关键样式
// ============================================
const deferredGlobalStyleLoaders = [
  () => import("./styles/common/login-modal.css"),
  () => import("./styles/components/cursor.css"),
  () => import("./styles/components/page__animate.css"),
  () => import("./views/DataManagement/styles/google-components.css"),
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

  // 监听 Service Worker 错误（可能是旧版本导致）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('error', (err) => {
      console.error('[PWA] Service Worker 错误:', err);
      // 清除所有 Service Worker 和缓存
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      }
    });
  }

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

  // ============================================
  // PWA 更新检测机制
  // 版本指纹由 version-checker 负责：启动时发现旧构建会自动更新一次，
  // 运行期发现新版本则由 PWAUpdateToast 提示。这里只负责让 sw.js 及时更新。
  // ============================================
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    // 监听 Service Worker 更新事件
    navigator.serviceWorker.ready.then((registration) => {
      // 每次启动立即检查 sw.js
      registration.update().catch((err) => {
        logger.warn('pwa', 'SW 启动更新检查失败', err);
      });

      // 页面可见时检查更新（用户切换标签页回来时）
      // version-checker 也会在 visibilitychange 时检测 version.json，这里作为 SW 层补充
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch((err) => {
            logger.warn('pwa', 'SW focus 更新检查失败', err);
          });
        }
      });

      // SW 检测到新版本安装完成时，派发统一事件供 PWAUpdateToast 弹窗
      // （作为 version-checker 的补充路径；skipWaiting:true 下新 SW 会立即激活）
      const dispatchUpdateAvailable = () => {
        window.dispatchEvent(new CustomEvent('boh:update-available', {
          detail: { message: '发现新版本，建议立即刷新以获取最新内容。' },
        }));
      };

      if (registration.waiting) {
        dispatchUpdateAvailable();
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              logger.info('pwa', '新版本 SW 已安装，派发更新事件');
              dispatchUpdateAvailable();
            }
          });
        }
      });
    });

    // controllerchange 不再自动 reload：新 SW 激活后由用户在弹窗中确认刷新
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      logger.info('pwa', '新 Service Worker 已激活，等待用户在弹窗中确认刷新');
    });
  }

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

  // ============================================
  // 独立版本指纹检测器
  // 绕过 SW 缓存，直接 HTTP 拉取 version.json 比对
  // 版本不一致时强制清缓存刷新，确保用户刷新即可拿到新代码
  // ============================================
  initVersionChecker();

  // 同步真实可视区域。移动浏览器旋转时 visualViewport 往往晚于
  // orientationchange 才稳定，因此立即、下一帧和延迟后各同步一次。
  const syncViewportMetrics = () => {
    const viewport = window.visualViewport;
    const width = Math.round(viewport?.width || document.documentElement.clientWidth || window.innerWidth);
    const height = Math.round(viewport?.height || window.innerHeight);
    const orientation = width > height ? 'landscape' : 'portrait';
    const root = document.documentElement;

    root.style.setProperty('--real-vh', `${height * 0.01}px`);
    root.style.setProperty('--viewport-width', `${width}px`);
    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty('--profile-shell-max-width', orientation === 'landscape' ? '1120px' : '980px');
    root.dataset.viewportOrientation = orientation;

    window.dispatchEvent(new CustomEvent('boh:viewport-change', {
      detail: { width, height, orientation },
    }));
  };

  let viewportSyncTimer = 0;
  const scheduleViewportSync = () => {
    syncViewportMetrics();
    window.requestAnimationFrame(syncViewportMetrics);
    window.clearTimeout(viewportSyncTimer);
    viewportSyncTimer = window.setTimeout(syncViewportMetrics, 240);
  };

  scheduleViewportSync();
  window.addEventListener('resize', scheduleViewportSync, { passive: true });
  window.addEventListener('orientationchange', scheduleViewportSync, { passive: true });
  window.addEventListener('pageshow', scheduleViewportSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleViewportSync, { passive: true });
}

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

app.use(pinia);
app.use(router);
app.use(MotionPlugin);

// 修复：添加全局 Vue 错误处理器，防止异步错误导致白屏无提示
app.config.errorHandler = (err, instance, info) => {
  logger.error('vue', `Error in ${info}`, err);
};

const authStore = useAuthStore();
const bagStore = useBagStore();

app.mount("#app");

// 异步初始化登录状态和购物袋（不阻塞首屏渲染）
authStore.initLoginState().catch(err => {
  logger.warn('auth', '登录状态初始化失败', err);
});
bagStore.loadShoppingBag();

// 初始化主题管理器（在应用挂载后，确保 DOM 元素已存在）
themeManager.init();

// 初始化 BOHAgent AI 助手（动态注入 SDK，不阻塞首屏）
initHiagentWidget().catch(err => {
  logger.warn('hiagent', 'BOHAgent 初始化失败', err);
});
