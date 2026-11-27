import { createApp } from 'vue';
import { MotionPlugin } from '@vueuse/motion';

// ============================================
// Motion Tokens — 必须在所有其他样式之前加载
// ============================================
import './styles/common/tokens.css';
// 玻璃/旧版变量别名层（--glass-*/--apple-*）：只能全局引入一次，
// 严禁放进 scoped @import（会把 :root 编译成 [data-v-x]:root 而失效）
import './styles/common/glass-aliases.css';
import './styles/common/hero-surface.css';
import './styles/common/avatar-frame.css';

// ============================================
// 第三方库样式 (Vendor Styles)
// ============================================
import './styles/vendor/unified-nav.css';

// ============================================
// 公共样式库 (Common Styles)
// ============================================
import './styles/common/glass-ui.css';
import './styles/common/liquid-glass.css';
import './styles/common/nav-icon-soft.css';
import './styles/common/animations.css';
// Boh UI Kit 过渡预设（plans/045）：boh-pop / boh-fade / boh-slide-up / stagger
import './components/ui/motion.css';

// ============================================
// 辅助样式 (Helper Styles)
// ============================================
import './styles/helpers/function.css';

// ============================================
// 组件样式 (Component Styles)
// ============================================
import './styles/components/buttons.css';
import './styles/components/headings.css';
import './styles/components/link_underline.css';
import './styles/components/overlay.css';
import './styles/components/close-button.css';

// ============================================
// 布局与页面样式 (Layout & Page Styles)
// ============================================
import './styles/layouts/footer.css';
import './styles/pages/globalpage.css';
import './styles/pages/homepages.css';
import './styles/pages/section__header.css';
/* 折叠屏展开态 / 横屏窄档：右侧竖向导航胶囊的内容让位（2026-10-29）。
   配套 bottom-nav.css 末尾的「Duo 式竖向胶囊」段，两者生效区间必须一致。 */
import './styles/fold-nav-rail.css';
import './style.css';

// ============================================
// 应用核心
// ============================================
import App from './App.vue';
import router from './router';
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
import { resumeUpdateContinuity } from './utils/update-continuity.js';
import { applyPerformanceProfile, watchPerformanceProfile } from './utils/performance-profile.js';
import { initKeyboardInset } from './composables/useKeyboardInset.js';

const registerPwaServiceWorker = () => {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register('./sw.js', {
        scope: './',
        // sw.js 是无 hash 文件。禁止 HTTP 缓存参与更新检查，避免新旧应用壳长期混用。
        updateViaCache: 'none',
      })
      .catch((err) => {
        logger.warn('pwa', 'Service Worker 注册失败', err);
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
};

// ============================================
// 延迟加载的非关键样式
// ============================================
const deferredGlobalStyleLoaders = [
  () => import('./styles/common/login-modal.css'),
  () => import('./styles/components/cursor.css'),
  () => import('./styles/components/page__animate.css'),
  () => import('./views/DataManagement/styles/google-components.css'),
];

const scheduleDeferredGlobalStyles = () => {
  const loadStyles = () => {
    Promise.allSettled(deferredGlobalStyleLoaders.map((loader) => loader())).catch(() => {});
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(loadStyles, { timeout: 2500 });
    return;
  }
  setTimeout(loadStyles, 1200);
};

// ============================================
// 浏览器端初始化
// ============================================
if (typeof window !== 'undefined') {
  registerPwaServiceWorker();

  applyPerformanceProfile(window);
  watchPerformanceProfile(window);
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
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      })
      .catch(() => {});
    if (typeof caches !== 'undefined') {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {});
    }
  }

  initMonitoring();

  // 边缘落点采样：**动态引入 + 空闲期执行**，绝不进首屏关键路径。
  // 刻意不用静态 import —— 静态引入会把它算进入口闭包，而首屏预算只剩 0.2KB
  // 余量（check:first-paint-budget）。探针与首屏无关，晚几秒没有任何损失。
  // 目的与约束见 utils/edge-probe.js 文件头；数据落点见
  // supabase/migrations/2026112301_edge_probe_events.sql。
  const scheduleEdgeProbe = () => {
    const boot = () =>
      import('./utils/edge-probe.js').then(({ initEdgeProbe }) => initEdgeProbe()).catch(() => {});
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(boot, { timeout: 6000 });
    } else {
      setTimeout(boot, 4000);
    }
  };
  if (document.readyState === 'complete') {
    scheduleEdgeProbe();
  } else {
    window.addEventListener('load', scheduleEdgeProbe, { once: true });
  }

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
    } catch {
      /* 忽略无效 URL */
    }
  }

  const elem = document.createElement('canvas');
  const supported = elem.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  document.documentElement.classList.add(supported ? 'webp-support' : 'webp-no-support');

  // ============================================
  // PWA 更新检测机制
  // 版本指纹由 version-checker 负责：启动时发现旧构建会自动更新一次，
  // 运行期发现新版本则在下一个静默窗口（切回 / 导航 / 空闲）自动应用，
  // **不弹窗也不通知**。这里只负责让 sw.js 及时更新。
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

      /* SW 层只负责「让新 sw.js 被及时拉下来」，**不再派发任何提示事件**。
         2026-11-23 口径：更新不通知用户（详见 version-checker.js 的护栏段注释）。
         此前这里会 dispatch `boh:update-available` 触发全屏模态弹窗 —— 那是把
         「系统自己能判断的事」推给信息更少的用户，而两个选项最终都调同一个
         forceCleanAndReload，问与不问的执行结果完全一致。
         现在新 SW 激活后由 version-checker 的轮询/可见性检查通过 version.json
         建立挂起态，再在下一个静默窗口应用；SW 这条路径只补一句日志便于归因。 */
      const noteWorkerInstalled = (reason) => {
        logger.info('pwa', reason);
      };

      if (registration.waiting) {
        noteWorkerInstalled('已有待激活的新 Service Worker（等 version.json 轮询建立挂起态）');
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              noteWorkerInstalled('新版本 SW 已安装（等 version.json 轮询建立挂起态）');
            }
          });
        }
      });
    });

    /* controllerchange **不自动 reload**，也不提示：新 SW 激活只意味着「应用壳可以
       换新」，真正何时切换由 version-checker 的静默窗口决定（它掌握上传/输入/媒体
       这些护栏状态，这里看不到）。 */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      logger.info('pwa', '新 Service Worker 已激活，切换时机交给 version-checker 的静默窗口');
    });
  }

  // 监听 PWA 安装事件
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    logger.info('pwa', 'PWA 安装事件已捕获');
  });

  // 监听应用已安装事件
  window.addEventListener('appinstalled', () => {
    window.deferredPrompt = null;
    logger.info('pwa', 'PWA 应用已安装');
  });

  // ============================================
  // 独立版本指纹检测器
  // 绕过 SW 缓存，直接 HTTP 拉取 version.json 比对
  // 版本不一致时强制清缓存刷新，确保用户刷新即可拿到新代码
  // ============================================
  // 同步真实可视区域。移动浏览器旋转时 visualViewport 往往晚于
  // orientationchange 才稳定，因此立即、下一帧和延迟后各同步一次。
  const syncViewportMetrics = () => {
    const viewport = window.visualViewport;
    const width = Math.round(
      viewport?.width || document.documentElement.clientWidth || window.innerWidth,
    );
    const height = Math.round(viewport?.height || window.innerHeight);
    const orientation = width > height ? 'landscape' : 'portrait';
    const root = document.documentElement;

    root.style.setProperty('--real-vh', `${height * 0.01}px`);
    root.style.setProperty('--viewport-width', `${width}px`);
    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty(
      '--profile-shell-max-width',
      orientation === 'landscape' ? '1120px' : '980px',
    );
    root.dataset.viewportOrientation = orientation;
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

  // 键盘遮挡高度 → documentElement 的 --kb-inset（全站 CSS 用 var(--kb-inset, 0px) 消费）。
  // 与上面的 syncViewportMetrics 是两件事：那一个负责「旋转/尺寸变化后取真实视口」，
  // 本行负责「软键盘占掉的高度」。键盘弹起同样会触发 visualViewport resize，
  // 但 --real-vh 语义上不该被键盘污染，故判据与变量都独立。
  initKeyboardInset();
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

app.mount('#app');

/* 切换构建后的现场接续（2026-11-23）：趁上一次整页刷新前记下的滚动位置，在这里复原。
   必须在 mount 之后调 —— 恢复逻辑要查 DOM 里的滚动容器，早于挂载则什么都找不到。
   顺序也刻意放在 initVersionChecker 之前：接续是「上一次刷新的收尾」，而版本检查
   是「下一次刷新的开头」，收尾没做完就开新局会让两者抢同一份 sessionStorage 状态。 */
if (resumeUpdateContinuity()) {
  logger.info('version', '已复原上次切换构建前的滚动位置');
}

// 非首屏维护任务延后到首个可交互帧之后，避免与首页英雄区竞争主线程和网络。
const schedulePostMountMaintenance = () => {
  const run = () => {
    initVersionChecker();
  };
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 1500);
  }
};
schedulePostMountMaintenance();

// 异步初始化登录状态和购物袋（不阻塞首屏渲染）
authStore.initLoginState().catch((err) => {
  logger.warn('auth', '登录状态初始化失败', err);
});
bagStore.loadShoppingBag();

// 头像框：清单加载 + 云同步注册（都动态引入，不进首屏壳；DB 优先、失败回退内置清单）
// 同步时机收敛在 initAvatarFrameSync（登录态确立后对齐本机、登出清本机），
// 不再依赖「用户点进我的页」—— 那样换个设备不进我的页就永远拉不到云端的框。
const scheduleAvatarFrameLoad = () => {
  void import('@/composables/useAvatarFrame.js')
    .then((m) => m.loadAvatarFrameData().then(() => m.initAvatarFrameSync()))
    .catch(() => {
      /* 离线/未登录：静默走内置清单 */
    });
};
if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(scheduleAvatarFrameLoad, { timeout: 3000 });
} else {
  window.setTimeout(scheduleAvatarFrameLoad, 1200);
}

// 初始化主题管理器（在应用挂载后，确保 DOM 元素已存在）
themeManager.init();
