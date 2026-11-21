/**
 * 首屏启动脚本（2026-11-05 从 index.html 的 4 段内联 <script> 外置，为收紧 CSP）。
 *
 * ⚠️ 本文件不过打包器、注释原样下发给用户 —— 首屏是最贵的字节。
 *    论证与背景见 docs/guides/boot-js-notes.md，此处只留「改这里会踩什么」。
 *
 * 顺序有意义，不要重排：预取 → 主题（最先，防暗色先白后黑）→ PWA 强刷（先于任何
 * 资源请求，否则白下旧资源）→ 资源恢复（尽早接 404）→ 骨架兜底（要等 DOM 就绪）。
 */

(() => {
  // ── 0. 首页链路 chunk 预取（2026-11-16）──
  // 站点是 hash 路由、index.html 全站一份：无条件写死 preload 会让从 /#/forum 进来的
  // 人白下约 185KB。本文件同步执行（早于 preload scanner），此刻 hash 已可读。
  // 清单由 vite.config.js 的 bohInitialRoutePreloadPlugin 注入，不许手改。
  // ⚠️ 只预取 JS —— CSS 必须交给 __vitePreload 按模块顺序插，抢先插会抢顺序。
  try {
    const chunks = /*__BOH_INITIAL_ROUTE_CHUNKS__*/ [];
    const hash = window.location.hash || '';
    // #/forum 与首页同页（兼容重定向），但重定向发生在 Router 起来之后 ⇒ 必须精确列出。
    // 不用前缀匹配：#/forum/post/… 是帖子详情，不能预取。
    const onHome =
      !hash || hash === '#' || hash === '#/' || hash === '#/forum' || hash.indexOf('#/?') === 0;
    if (onHome) {
      for (let i = 0; i < chunks.length; i += 1) {
        const link = document.createElement('link');
        link.rel = 'modulepreload';
        link.crossOrigin = 'anonymous';
        link.href = chunks[i];
        document.head.appendChild(link);
      }
    }
  } catch {
    /* 纯加速：任何异常（老浏览器 / 被插件改写）都不许影响启动 */
  }

  // ── 1. 主题预置 ──
  // 骨架与 body 兜底底色都依赖 html[data-theme]，而 theme-manager 要等挂载后才 init。
  // ⚠️ 与 theme-manager.js 的 VALID_THEMES 重复（此处必须早于模块执行），
  //    两处同步修改，由 scripts/check-first-paint.mjs 断言。
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

    // 保留资源恢复标记：让 CDN 视这次导航为新请求，避免又拿到引用已删 hash 的旧 HTML
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

    // 清缓存（不支持时跳过，仅注销 SW 后重定向）
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

    // 合并为单条链：避免重定向先于 SW 注销发生
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

  // ── 3. 资源恢复 ──
  // 发布替换带 hash 的产物，但旧 index.html 可能仍被 CDN/浏览器短缓存。若它引用的
  // CSS/入口已 404，自动清 PWA 缓存并带唯一 URL 请求最新入口，避免退化为默认样式。
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

  // 成功恢复后移除内部标记，避免影响分享与普通导航
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

  // ── 4. 骨架超时兜底 ──
  // 12s 后 #app 仍未被 Vue 接管（骨架还在 DOM）⇒ 应用壳或路由 chunk 没到位，
  // 切报错态并给出可点的自救入口。纯内联、零请求；Vue 一旦挂载即失效。
  // ⚠️ 与 src/App.vue 的 10s 兜底（Vue 已挂载但 chunk 没到位）是两道不同的闸，
  //    两处的文案与超时长度必须同步修改。
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
      // ⚠️ 只切报错态、不自动强刷：内联环境拿不到 version-checker，手写第二份指纹
      // 比对会违反单一真源；入口 404 已由段 3 覆盖。自动强刷由 src/App.vue 负责。
      // ⚠️ 文案与 src/App.vue 超时分支保持一致，改一处必须同步另一处。
      if (loadingText) loadingText.hidden = true;
      if (errorBox) errorBox.hidden = false;
      if (body) body.classList.add('is-error');
      // 淡出收场（0.18s，见 .boh-boot-body.is-error）后从布局收起；报错态是终态，安全
      if (dotsRow)
        window.setTimeout(() => {
          dotsRow.style.display = 'none';
        }, 220);
    }, 12000);

    retry.addEventListener('click', () => {
      if (retry.disabled) return;
      retry.disabled = true;
      // forceUpdate 触发段 2 的 SW 注销 + 缓存清理流程
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
