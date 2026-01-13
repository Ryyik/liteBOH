import { createApp } from "vue";
import "./style.css";

// ============================================
// 第三方库样式 (Vendor Styles)
// ============================================
import "./styles/vendor/bootstrap.css";
import "./styles/vendor/animate.min.css";
import "./styles/vendor/aos.css";
import "./styles/vendor/fonts.css";
import "./styles/vendor/swiper.min.css";
import "./styles/vendor/unified-nav.css";

// ============================================
// 公共样式库 (Common Styles)
// ============================================
// 统一的毛玻璃UI样式
import "./styles/common/glass-ui.css";
// 统一的动画效果库
import "./styles/common/animations.css";
// 统一的登录模态框样式
import "./styles/common/login-modal.css";

// ============================================
// 全局性能优化
// ============================================
if (typeof window !== "undefined") {
  // 1. 全局图片优化处理
  const optimizeImages = () => {
    document.querySelectorAll('img').forEach(img => {
      // 启用异步解码，防止图片解码阻塞主线程
      if (!img.hasAttribute('decoding')) {
        img.setAttribute('decoding', 'async');
      }
      // 启用原生懒加载
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }
    });
  };

  // 2. 优化滚动性能 - 强制被动事件监听
  const patchPassiveEvents = () => {
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (['scroll', 'touchstart', 'touchmove', 'wheel'].includes(type)) {
        if (typeof options === 'undefined') {
          options = { passive: true };
        } else if (typeof options === 'boolean') {
          options = { capture: options, passive: true };
        } else if (typeof options === 'object' && typeof options.passive === 'undefined') {
          options.passive = true;
        }
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  };

  // 执行优化
  patchPassiveEvents();
  
  // 监听 DOM 变化以持续优化新插入的图片
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        optimizeImages();
      }
    });
  });
  
  window.addEventListener('DOMContentLoaded', () => {
    optimizeImages();
    observer.observe(document.body, { childList: true, subtree: true });
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
import "./styles/components/glassui.css";
import "./styles/components/headings.css";
import "./styles/components/link_underline.css";
import "./styles/components/overlay.css";
import "./styles/components/page__animate.css";
import "./styles/components/close-button.css";

// ============================================
// 布局样式 (Layout Styles)
// ============================================
import "./styles/layouts/footer.css";

// Page styles
import "./styles/pages/globalpage.css";
import "./styles/pages/homepages.css";
import "./styles/pages/section__about.css";
import "./styles/pages/section__blog.css";
import "./styles/pages/section__contact.css";
import "./styles/pages/section__header.css";
import "./styles/pages/section__portfolio.css";
import "./styles/pages/section__resume.css";

import App from "./App.vue";
import router from "./router";
import { initLoginState } from "./store/index.js";

// ============================================
// 登录管理系统 (Authentication Manager)
// ============================================
import "./utils/auth-manager.js";

// ============================================
// 创建Vue应用实例
// ============================================
if (typeof window !== "undefined") {
  const elem = document.createElement("canvas");
  const supported =
    elem.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  document.documentElement.classList.add(
    supported ? "webp-support" : "webp-no-support"
  );
}
const app = createApp(App);
app.use(router);

// 初始化登录状态
initLoginState();

app.mount("#app");

// ============================================
// 第三方库初始化
// ============================================


/**
 * 懒加载初始化AOS滚动动画库
 * 配置：
 * - duration: 动画持续时间 1000ms (优化性能，减少动画执行时间)
 * - once: 动画只执行一次
 * - mirror: 滚动回去时不重复动画
 */
if (typeof window !== "undefined") {
  // 使用Intersection Observer API懒加载AOS库
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && window.AOS) {
        window.AOS.init({
          duration: 1000,
          once: true,
          mirror: false,
        });
        observer.disconnect();
      }
    });
  });
  
  // 观察页面主要内容区域
  const mainContent = document.querySelector('main');
  if (mainContent) {
    observer.observe(mainContent);
  } else {
    // 如果没有main标签，观察body
    observer.observe(document.body);
  }
}

// ============================================
// 性能监控系统
// ============================================

/**
 * 性能监控
 * 收集并输出关键性能指标，用于性能优化
 */
if (typeof window !== "undefined") {
  // 监控首屏加载时间
  window.addEventListener("load", () => {
    const loadTime = performance.now();
    console.log("📊 首屏加载时间:", loadTime.toFixed(2) + "ms");
  });

  // 监控关键性能指标
  if ("performance" in window && "measure" in window.performance) {
    window.addEventListener("load", () => {
      setTimeout(() => {
        const perfData = performance.getEntriesByType("navigation")[0];
        if (perfData) {
          console.group("📈 性能指标报告");
          console.log(
            "🔍 DNS查询时间:",
            (perfData.domainLookupEnd - perfData.domainLookupStart).toFixed(2) +
              "ms"
          );
          console.log(
            "🔌 TCP连接时间:",
            (perfData.connectEnd - perfData.connectStart).toFixed(2) + "ms"
          );
          console.log(
            "📡 请求响应时间:",
            (perfData.responseEnd - perfData.requestStart).toFixed(2) + "ms"
          );
          console.log(
            "🎨 页面渲染时间:",
            (
              perfData.domContentLoadedEventEnd -
              perfData.domContentLoadedEventStart
            ).toFixed(2) + "ms"
          );
          console.log(
            "✅ 页面完全加载时间:",
            (perfData.loadEventEnd - perfData.navigationStart).toFixed(2) +
              "ms"
          );
          console.groupEnd();
        }
      }, 0);
    });
  }
}
