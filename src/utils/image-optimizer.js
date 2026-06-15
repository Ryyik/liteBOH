/**
 * 全局图片性能优化：
 * - 自动为 <img> 添加 decoding="async" 和 loading="lazy"
 * - 通过 MutationObserver 监听 DOM 新增节点，批量处理
 * - 使用 requestAnimationFrame 合并 flush，避免频繁 DOM 操作
 */

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

/**
 * @param {object} [options]
 * @param {() => void} [options.onReady] - DOMContentLoaded 后执行的回调
 */
export function initImageOptimizer({ onReady } = {}) {
  if (typeof window === "undefined") return;

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
      if (onReady) onReady();
    } else {
      if (onReady) onReady();
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