import { createApp } from "vue";
import { MotionPlugin } from "@vueuse/motion";

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
const deferredGlobalStyleLoaders = [];

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

  // 强制清理旧版本 Service Worker（生产环境也需要，解决缓存死循环问题）
  if ('serviceWorker' in navigator) {
    // 检查当前 Service Worker 版本
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        // 如果 Service Worker 已激活但未更新超过24小时，强制注销
        if (registration.active) {
          const lastUpdate = localStorage.getItem('sw_last_update');
          const now = Date.now();
          const updateInterval = 24 * 60 * 60 * 1000; // 24小时

          if (!lastUpdate || (now - parseInt(lastUpdate)) > updateInterval) {
            console.warn('[PWA] Service Worker 已超过24小时未更新，强制注销');
            registration.unregister().then(() => {
              console.log('[PWA] 旧 Service Worker 已注销');
              localStorage.setItem('sw_last_update', now.toString());
              // 清除所有缓存
              if ('caches' in window) {
                caches.keys().then((cacheNames) => {
                  return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                  );
                }).then(() => {
                  console.log('[PWA] 所有缓存已清除，即将刷新页面');
                  window.location.reload();
                });
              }
            });
          }
        }
      });
    });

    // 监听 Service Worker 错误（可能是旧版本导致）
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
  // ============================================
  if ('serviceWorker' in navigator) {
    // 监听 Service Worker 更新事件
    navigator.serviceWorker.ready.then((registration) => {
      // 定期检查更新（每60分钟）
      setInterval(() => {
        registration.update().catch((err) => {
          logger.warn('pwa', 'SW 更新检查失败', err);
        });
      }, 60 * 60 * 1000);
    });

    // 监听新 Service Worker 安装事件
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      logger.info('pwa', '新 Service Worker 已激活，正在刷新页面');
      // 强制刷新页面以加载新版本
      window.location.reload();
    });

    // 监听 Service Worker 更新等待事件（prompt 模式）
    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 新版本已安装，提示用户刷新
              logger.info('pwa', '新版本已准备好，提示用户更新');
              // 显示更新提示（可根据需要改为更友好的 UI）
              if (confirm('网站已更新到新版本，是否立即刷新？')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            }
          });
        }
      });
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

  // 初始化 --real-vh CSS 变量（为不支持 dvh 的浏览器提供降级方案）
  const setRealVh = () => {
    document.documentElement.style.setProperty('--real-vh', `${window.innerHeight * 0.01}px`);
  };
  setRealVh();
  window.addEventListener('resize', setRealVh);
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