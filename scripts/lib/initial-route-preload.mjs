/**
 * 首页链路 chunk 清单的纯计算部分。
 *
 * 从 vite.config.js 的 bohInitialRoutePreloadPlugin 里拆出来，只为一个理由：
 * 这段逻辑已经静默失效过两次（asset.source 是 Uint8Array 导致正则永不命中；
 * Vue SFC 的 CSS 以 `xxx.css_vue_type_style_…` 虚拟名混进 imports 导致 404）。
 * 两次的共同点是**构建照样成功、页面照样能开**，只是白白多等一跳 ——
 * 这种错误只能靠断言守住，不能靠肉眼看构建日志。
 *
 * 调用方：vite.config.js（构建期）；tests/unit/initial-route-preload.test.js
 */

/** 首页路由模块 id：`.../views/Home/index.vue`（[\\/] 兼容 Windows 路径分隔符） */
const DEFAULT_HOME_MODULE = /[\\/]views[\\/]Home[\\/]index\.vue$/;

/**
 * 算出「首访落到首页时，应该提前 preload 的 chunk」。
 *
 * 口径：
 *   · 从首页 chunk 出发，递归走 **静态 imports**（dynamicImports 不跟 —— 论坛流
 *     那一层是动态导入，抢在首屏前下它等于把 146 KB gzip 塞进 LCP 窗口）；
 *   · 排除**入口闭包**：Vite 已经把入口的静态依赖写成 index.html 里的
 *     modulepreload，重复登记不会重复下载，但会让清单读不出「真正新增了谁」；
 *   · 只收 `.js`：CSS 交给 Vite 的 `__vitePreload` 在模块执行时按正确顺序插；
 *   · `exists` 由调用方注入（构建期传磁盘检查）：用来剔除 CSS 虚拟模块名这类
 *     「名字以 .js 结尾、产物却不是 .js」的条目 —— 留下就是一次必然 404 的请求。
 *
 * @param {Record<string, any>} bundle rollup 的 output bundle
 * @param {{ homeModule?: RegExp, exists?: (fileName: string) => boolean }} [options]
 * @returns {{ files: string[], dropped: string[], reason?: string }}
 */
export function collectInitialRouteChunks(bundle, options = {}) {
  const { homeModule = DEFAULT_HOME_MODULE, exists } = options;
  if (!bundle || typeof bundle !== 'object') {
    return { files: [], dropped: [], reason: 'no-bundle' };
  }

  const homeEntry = Object.entries(bundle).find(
    ([, item]) => item.type === 'chunk' && homeModule.test(item.facadeModuleId || ''),
  );
  if (!homeEntry) {
    return { files: [], dropped: [], reason: 'no-home-chunk' };
  }

  // 入口闭包：从 isEntry 的 chunk 出发，走静态 imports
  const entryClosure = new Set();
  const walkEntry = (fileName) => {
    if (!fileName || entryClosure.has(fileName)) return;
    entryClosure.add(fileName);
    const chunk = bundle[fileName];
    if (!chunk || chunk.type !== 'chunk') return;
    (chunk.imports || []).forEach(walkEntry);
  };
  Object.entries(bundle)
    .filter(([, item]) => item.type === 'chunk' && item.isEntry)
    .forEach(([fileName]) => walkEntry(fileName));

  const seen = new Set();
  const files = [];
  const dropped = [];

  const walk = (fileName) => {
    if (!fileName || seen.has(fileName)) return;
    seen.add(fileName);
    const chunk = bundle[fileName];
    if (!chunk || chunk.type !== 'chunk') return;
    if (fileName.endsWith('.js') && !entryClosure.has(fileName)) {
      if (typeof exists === 'function' && !exists(fileName)) dropped.push(fileName);
      else files.push(fileName);
    }
    (chunk.imports || []).forEach(walk);
  };
  walk(homeEntry[0]);

  return { files, dropped };
}
