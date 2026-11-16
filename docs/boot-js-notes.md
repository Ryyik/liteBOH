# boot.js 的设计说明

> `public/boot.js` 是**首屏同步启动脚本**，不过打包器、不删注释、原样下发给用户。
> 因此文件内只留「改这里会踩什么」，论证与背景放这里。
> 文件内注释每多 1 KB，用户就多下 1 KB —— 首屏是最贵的字节。

## 为什么要外置（2026-11-05）

CSP 的 `script-src` 里一直带着 `'unsafe-inline'`，而它唯一的来源就是 `index.html` 的
4 段内联启动脚本。只要那条还在，CSP 对注入型 XSS 就没有边界可言 —— 攻击者注入的
`<script>` 同样被放行，等于把 CSP 最大的价值让掉了。外置之后 `script-src 'self'`
才能真收紧。

外置**不改变执行时机**：本文件以同步、无 defer/async 的方式放在 `<head>` 最前，
浏览器解析到它就会停下、下载、执行 —— 与原来内联在同一位置语义等价：早于任何 CSS
应用、早于首次绘制、也早于 `src/main.js` 那个模块入口。

## ⚠️ 顺序有意义，不要重排

| # | 段 | 为什么必须在这个位置 |
|---|---|---|
| 0 | 首页链路预取 | 同步执行 ⇒ 早于 preload scanner 的 module 请求，此时 `location.hash` 已可读 |
| 1 | 主题预置 | 必须最先（除 0），否则暗色用户先看到整屏白再切黑 |
| 2 | PWA 强制刷新 | 必须在任何资源请求之前，否则白下载一遍即将被丢弃的旧资源 |
| 3 | 资源恢复 | 必须尽早挂上 error 监听，才接得住入口 CSS/JS 的 404 |
| 4 | 骨架超时兜底 | 要取 `#boh-boot`，所以包在 DOM 就绪之后 |

前三条原本就是内联立即执行，外置时逐字保留逻辑；第四条从 body 末尾改成等 DOM 就绪，
差别只有几毫秒（原来也是 DOM 解析完才跑）。

## 段 0：首页链路 chunk 预取（2026-11-16）

站点是 hash 路由、`index.html` 全站只有一份。无条件写死 `<link rel=preload>`
= 让每个直接访问 `/#/forum` 的人也白下约 185 KB，所以必须按 hash 条件注入。

**清单由 `vite.config.js` 的 `bohInitialRoutePreloadPlugin` 注入，不许手改。**
该插件从产物算「首页 chunk 的静态 import 闭包」，剔除入口已 preload 的那批，
只留首页独有的 12 个 JS（约 50 KB gzip）。

- ⚠️ **只预取 JS**：CSS 必须交给 Vite 的 `__vitePreload` 按模块执行顺序插，
  构建期抢先插 `<link rel=preload as=style>` 会和它抢顺序。
- `#/forum` 与首页同页（`routes/compat.ts` 重定向到 `/?view=latest`），但重定向发生在
  Router 起来之后、预取早已错过 ⇒ 必须精确列出。**不用前缀匹配**：`#/forum/post/…`
  是帖子详情，不能预取。
- 实测收益与归因见 `docs/2026-11-16-首访性能诊断与解决方案.md` §7。

## 段 1：主题预置

骨架样式与 body 兜底底色都依赖 `html[data-theme]`，而主题管理器
（`src/utils/theme-manager.js`）要等应用挂载后才 init，暗色主题 CSS 更是懒加载。
不在这里先设属性，暗色用户会先看到整屏白。

⚠️ `VALID_THEMES` 与 `theme-manager.js` 的同名常量**重复** —— 这里必须早于模块执行，
无法 `import`。两处必须同步修改，由 `scripts/check-first-paint.mjs` 断言。
`localStorage` 不可用（隐私模式等）时按浅色默认走。

## 段 2：PWA 强制刷新

`?forceUpdate=true` / `?clearCache=true` 会注销所有 SW 并清空 Cache Storage，
再重定向回干净 URL。SW 注销与缓存清除合并成单条 Promise 链，**避免重定向先于
注销发生**。

清理 URL 时保留资源恢复标记 —— 该标记让 CDN 把这次导航视为新请求，避免刚发布后
再次拿到仍引用已删除 hash 资源的旧 `index.html`。

## 段 3：资源恢复

GitHub Pages 发布会替换带 hash 的构建文件，但旧 `index.html` 可能仍被 CDN 或浏览器
短暂缓存。若它引用的 CSS / 应用入口已不存在（`error` 事件、目标在 `/static/` 下），
自动加 `forceUpdate=true` + 唯一时间戳跳转，避免页面退化为默认浏览器样式。
恢复成功后移除内部标记，不影响分享与普通导航。

## 段 4：骨架超时兜底

12s 后若 `#app` 仍未被 Vue 接管（骨架节点还在 DOM 里），说明应用壳或路由 chunk 没到位
（常见于刚发布后旧 hash 已 404），切到「报错态」并给出可点的自救入口。纯内联、零网络
请求；Vue 一旦挂载即自然失效。

- ⚠️ 这里**只切报错态、不自动强刷**：内联环境拿不到 `version-checker`，手写第二份
  「拉 version.json 比对构建指纹」会违反单一真源；且入口脚本/CSS 的 404 已由段 3
  自动强刷覆盖。能活到 12s 的残留场景（Vue 完全没挂载）极少，保留手动自救即可。
- 自动强刷由 `src/App.vue` 的 10s 兜底负责（`recoverIfStaleBuild` → `forceCleanAndReload`）。
- ⚠️ 文案与 `src/App.vue` 超时分支必须保持一致，改一处必须同步另一处。
