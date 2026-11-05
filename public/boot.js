/**
 * 首屏启动脚本（2026-11-05 从 index.html 的 4 段内联 <script> 外置而来）
 *
 * ## 为什么要外置
 *
 * CSP 的 `script-src` 里一直带着 `'unsafe-inline'`，而它唯一的来源就是这几段内联脚本。
 * 只要那条还在，CSP 对注入型 XSS 就没有边界可言 —— 攻击者注入的 `<script>` 同样被放行，
 * 等于把 CSP 最大的价值让掉了。外置之后 `script-src 'self'` 就能真正收紧。
 *
 * 外置**不改变执行时机**：本文件以同步、无 defer/async 的方式放在 <head> 最前，
 * 浏览器解析到它就会停下、下载、执行 —— 与原来内联在同一个位置的语义等价：
 * 早于任何 CSS 应用、早于首次绘制、也早于 `src/main.js` 那个模块入口。
 *
 * ## ⚠️ 顺序有意义，不要重排
 *
 * 1. 主题预置 —— 必须最先，否则暗色用户先看到整屏白再切黑
 * 2. PWA 强制刷新 —— 必须在任何资源请求之前，否则白下载一遍即将被丢弃的旧资源
 * 3. 资源恢复 —— 必须尽早挂上 error 监听，才接得住入口 CSS/JS 的 404
 * 4. 骨架超时兜底 —— 要取 `#boh-boot`，所以包在 DOM 就绪之后
 *
 * 前三条原本就是内联立即执行，这里逐字保留逻辑；第四条从 body 末尾
 * 改成等 DOM 就绪，差别只有几毫秒（原来也是 DOM 解析完才跑）。
 */

(() => {
  // ── 1. 主题预置 ────────────────────────────────────────────────
  // 骨架样式与 body 兜底底色都依赖 html[data-theme]，而主题管理器
  // （src/utils/theme-manager.js）要等应用挂载后才 init，暗色主题 CSS 更是懒加载。
  // 不在这里先设属性，暗色用户会先看到整屏白。
  //
  // ⚠️ VALID_THEMES 与 theme-manager.js 的同名常量重复 —— 这里必须早于模块执行，
  // 无法 import。两处必须同步修改，由 scripts/check-first-paint.mjs 断言。
  const VALID_THEMES = ['light', 'dark', 'system', 'home-cat', 'anniversary-mc'];

  try {
    const saved = localStorage.getItem('boh-theme');
    const pref = VALID_THEMES.indexOf(saved) >= 0 ? saved : 'light';
    const theme =
      pref === 'system'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : pref;
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
  } catch {
    // localStorage 不可用（隐私模式等）时按浅色默认走
  }

  // ── 2. PWA 强制刷新 ───────────────────────────────────────────
  if (
    window.location.search.includes('forceUpdate=true') ||
    window.location.search.includes('clearCache=true')
  ) {
    console.log('[PWA] 检测到强制更新参数，开始清除缓存');

    // 保留资源恢复标记。该标记会让 CDN 将这次导航视为新请求，避免在
    // 刚发布后再次拿到仍引用已删除 hash 资源的旧 index.html。
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('forceUpdate');
    cleanUrl.searchParams.delete('clearCache');

    // SW 注销任务（不支持 SW 时返回空数组）
    const swTask =
      'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistrations().then((registrations) => {
            console.log('[PWA] 找到 ' + registrations.length + ' 个 Service Worker 注册');
            return Promise.all(
              registrations.map((registration) =>
                registration.unregister().then(() => {
                  console.log('[PWA] 已注销 Service Worker: ' + registration.scope);
                }),
              ),
            );
          })
        : Promise.resolve([]);

    // Cache Storage 清除任务（不支持时跳过，仅清理 SW 后重定向）
    const cacheTask =
      'caches' in window
        ? caches.keys().then((cacheNames) => {
            console.log('[PWA] 找到 ' + cacheNames.length + ' 个缓存');
            return Promise.all(
              cacheNames.map((cacheName) => {
                console.log('[PWA] 删除缓存: ' + cacheName);
                return caches.delete(cacheName);
              }),
            );
          })
        : Promise.resolve([]);

    // 合并为单条 Promise 链，等待 SW 注销与缓存清除全部完成后再重定向，
    // 避免重定向先于 SW 注销发生
    Promise.all([swTask, cacheTask])
      .then(() => {
        console.log('[PWA] 所有缓存已清除');
        console.log('[PWA] 重定向到: ' + cleanUrl);
        window.location.replace(cleanUrl.href);
      })
      .catch((err) => {
        console.error('[PWA] 清理失败:', err);
        // 即使失败也尝试重定向
        window.location.replace(cleanUrl.href);
      });
  }

  // ── 3. 资源恢复 ───────────────────────────────────────────────
  // GitHub Pages 发布会替换带 hash 的构建文件，但旧 index.html 可能仍被
  // CDN 或浏览器短暂缓存。若它引用的 CSS/应用入口已不存在，自动清除
  // PWA 缓存并使用唯一 URL 请求最新入口，避免页面退化为默认浏览器样式。
  const recoveryParam = 'bohAssetRecovery';
  const hasRecovered = new URL(window.location.href).searchParams.has(recoveryParam);

  window.addEventListener(
    'error',
    (event) => {
      if (hasRecovered) return;

      const target = event.target;
      const isStylesheet = target && target.tagName === 'LINK' && target.rel === 'stylesheet';
      const isAppModule = target && target.tagName === 'SCRIPT' && target.type === 'module';
      const assetUrl = target && (target.href || target.src);

      if ((!isStylesheet && !isAppModule) || !assetUrl || assetUrl.indexOf('/static/') === -1) {
        return;
      }

      const recoveryUrl = new URL(window.location.href);
      recoveryUrl.searchParams.set('forceUpdate', 'true');
      recoveryUrl.searchParams.set(recoveryParam, Date.now().toString());
      window.location.replace(recoveryUrl.href);
    },
    true,
  );

  // 成功恢复后移除 URL 中的内部标记，避免影响分享和普通导航。
  if (hasRecovered && window.history && window.history.replaceState) {
    window.addEventListener(
      'load',
      () => {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete(recoveryParam);
        window.history.replaceState(null, '', cleanUrl.href);
      },
      { once: true },
    );
  }

  // ── 4. 骨架超时兜底 ───────────────────────────────────────────
  // 12s 后若 #app 仍未被 Vue 接管（骨架节点还在 DOM 里），说明应用壳或路由 chunk
  // 没到位（常见于刚发布后旧 hash 已 404），给出一个可点的自救入口。
  // 纯内联、零网络请求；Vue 一旦挂载即自然失效。
  // ⚠️ 这里是「Vue 完全没起来」的兜底；src/App.vue 另有一道 10s 兜底负责
  // 「Vue 已挂载但路由 chunk 没到位」。两处文案与超时长度必须同步修改。
  const initBootSkeleton = () => {
    const boot = document.getElementById('boh-boot');
    const body = document.getElementById('boh-boot-body');
    const dotsRow = document.getElementById('boh-boot-dots');
    const loadingText = document.getElementById('boh-boot-text');
    const errorBox = document.getElementById('boh-boot-error');
    const retry = document.getElementById('boh-boot-retry');
    if (!boot || !retry) return;

    const timer = window.setTimeout(() => {
      if (!document.body.contains(boot)) return;
      // ⚠️ 这里只切到「报错态」，不做自动强刷：内联环境拿不到 version-checker，
      // 手写第二份「拉 version.json 比对构建指纹」会违反单一真源；且入口脚本/CSS
      // 的 404 已由上方资源监听自动强刷覆盖，能活到 12s 的残留场景（Vue 完全没挂载）
      // 极少，保留手动自救即可。自动强刷由 src/App.vue 的 10s 兜底负责
      // （recoverIfStaleBuild → forceCleanAndReload）。
      // ⚠️ 文案与 src/App.vue 超时分支保持一致，改一处必须同步另一处。
      if (loadingText) loadingText.hidden = true;
      if (errorBox) errorBox.hidden = false;
      if (body) body.classList.add('is-error');
      // 点淡出收场（0.18s，见 .boh-boot-body.is-error 规则）后从布局中收起；
      // 这块骨架的报错态是终态、不会再回到加载态，收起是安全的
      if (dotsRow)
        window.setTimeout(() => {
          dotsRow.style.display = 'none';
        }, 220);
    }, 12000);

    retry.addEventListener('click', () => {
      if (retry.disabled) return;
      retry.disabled = true;
      // forceUpdate 会触发上方内联脚本的 SW 注销 + 缓存清理流程
      const url = new URL(window.location.href);
      url.searchParams.set('forceUpdate', 'true');
      window.location.replace(url.href);
    });

    window.__bohBootSkeletonTimer = timer;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBootSkeleton, { once: true });
  } else {
    initBootSkeleton();
  }
})();
