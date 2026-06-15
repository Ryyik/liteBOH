# BOHLITE 性能与稳定性审查优化计划

> 日期: 2026-06-15
> 模型: DeepSeek-V4-Pro
> 项目: BOHLITEBeta2.5
> 技术栈: Vue 3 + TypeScript + Vite 7 + Pinia + Vue Router + Supabase
> 代码总量: ~56,000 行 (views 目录)
> 图片资源: 14MB (全部 WebP 格式)

---

## 当前已有的优化 (值得保留)

| 项目 | 说明 |
|------|------|
| 路由懒加载 | 所有路由均使用 `() => import(...)` 动态导入 |
| 代码分割 | `vite.config.js` 中手动划分了 `vue-vendor`, `supabase-vendor`, `view-forum`, `view-userspace` 等 chunk |
| Web Vitals 监控 | `monitoring.js` 中已实现 LCP / CLS / INP 采集 |
| 请求去重与缓存 | `request-core.js` 实现了 inflight 去重 + TTL 内存缓存 |
| 图片优化器 | `image-optimizer.js` 自动为 `<img>` 添加 `decoding="async"` 和 `loading="lazy"` |
| 非关键 CSS 延迟加载 | `animate.min.css` 和 `swiper.min.css` 通过 `requestIdleCallback` 延迟加载 |
| Vite 预加载错误恢复 | `vite-preload-recovery.js` 处理 chunk 加载失败自动刷新 |
| 图片压缩 | `image-compression.js` 使用 Web Worker 压缩上传图片 |
| 资源预连接 | `index.html` 中已配置 `dns-prefetch` 和 `preconnect` |

---

## P0 - 严重问题 (阻塞首屏性能)

### 1. 巨型组件拆分

以下文件单个超过 1,000 行，即使做了路由懒加载，这些 chunk 仍然过大：

| 文件 | 行数 | 拆分方案 |
|------|------|----------|
| `src/views/DataManagement/DataAdmin.vue` | 5,154 | 按 Tab 拆分为独立子组件，每个 Tab 独立懒加载 |
| `src/views/Forum/ForumMain.vue` | 3,507 | 拆分为帖子列表、发帖编辑器、筛选器三个独立组件 |
| `src/views/user-center/UserSpace/UserSpaceMain.vue` | 3,030 | 按 Tab (profile/posts/community/ai) 拆分为独立组件，配合 `<Suspense>` |
| `src/views/BOHAI/composables/useChatEngine.js` | 2,817 | 拆分为消息管理、流式处理、上下文管理等多个 composable |
| `src/views/Profile/ProfileMain.vue` | 1,927 | 按功能区块拆分为独立子组件 |

**预期收益**: 单 chunk 解析时间减少 60%+

### 2. 大图片压缩

| 图片 | 大小 | 处理方案 |
|------|------|----------|
| `main1.webp` | 1,160 KB | 重新压缩至 300KB 以下，生成 1920/1280/768/480 多尺寸 |
| `bohschool.webp` | 612 KB | 重新压缩 |
| `zipai.webp` | 596 KB | 重新压缩 |
| 超过 200KB 的图片 | ~20 张 | 提高压缩率重新编码 |

**预期收益**: 首屏 LCP 改善 40%+

---

## P1 - 高优先级

### 3. 添加 Supabase API 预连接

`index.html` 中缺少 Supabase API 域名的预连接。应在 HTML 中添加：

```html
<link rel="dns-prefetch" href="//[PROJECT].supabase.co">
<link rel="preconnect" href="https://[PROJECT].supabase.co" crossorigin>
```

**预期收益**: 减少 API 请求 TLS 握手延迟 200-400ms

### 4. 字体加载策略优化

`src/styles/vendor/fonts.css` 中 `font-display: block` 改为 `font-display: swap`，避免 FOIT (文字不可见)。

**预期收益**: 消除文字不可见时间，改善感知性能

### 5. 同步 CSS 过多

`src/main.js` 中同步导入了 20+ 个 CSS 文件。将 `glass-ui.css`、`animations.css`、`page__animate.css` 等非首屏必需的 CSS 也改为延迟加载。

**预期收益**: 减少首屏 CSS 阻塞时间

### 6. 添加 Service Worker (PWA)

当前生产环境没有 Service Worker 实现。使用 `vite-plugin-pwa` (基于 Workbox) 添加：
- 静态资源预缓存 (Cache-First)
- 运行时 API 缓存 (Network-First)
- 离线回退

**预期收益**: 二次加载近乎瞬间

---

## P2 - 中优先级

### 7. 请求缓存添加 LRU 淘汰策略

`src/utils/request-core.js` 中 `requestCache` Map 没有大小上限，长时间使用会持续增长内存。

**建议**: 添加 LRU 淘汰策略，设置最大条目数 (如 200 条)。

### 8. 长列表虚拟滚动

Forum、UserSpace 的帖子列表、消息列表等场景，数据量大时 DOM 节点过多。

**建议**: 使用 `@vueuse/core` 的 `useVirtualList` 实现虚拟滚动。

### 9. 添加 Suspense 边界

路由懒加载缺少加载状态。在 `App.vue` 或 router-view 外层包裹 `<Suspense>` 并设置 fallback 骨架屏。

**预期收益**: 消除路由切换时的白屏闪烁

### 10. 数据文件改为异步加载

`src/data/products.js`、`src/data/news.js`、`src/data/activities.js` 等数据文件被打包到 `content-datasets` chunk。

**建议**: 改为异步 JSON fetch 或按需动态导入，减少初始 bundle 体积。

---

## P3 - 低优先级 / 稳定性

### 11. 区分读写超时

`src/utils/supabase-client.js` 中 `SUPABASE_TIMEOUT_MS` 默认 12 秒，对读操作偏高。

**建议**: 读操作 8s，写操作 15s。

### 12. 确保服务器缓存策略

- 带 hash 的静态资源: `max-age=31536000, immutable`
- `index.html`: `no-cache`

### 13. Pinia 持久化性能

确认 `pinia-plugin-persistedstate` 持久化的数据量合理，大型数据使用 IndexedDB 替代 localStorage。

### 14. 添加 modulepreload 提示

对关键路径 chunk (auth-store、supabase-vendor) 考虑手动添加 `<link rel="modulepreload">`。

---

## 执行顺序建议

```
P0: 拆分巨型组件 → 压缩大图片
  ↓
P1: 添加 Supabase 预连接 → 字体 swap → 延迟 CSS → Service Worker
  ↓
P2: LRU 缓存 → 虚拟滚动 → Suspense → 异步数据
  ↓
P3: 超时优化 → 缓存策略 → 持久化优化 → modulepreload
```

---

## 预期整体收益

| 指标 | 当前估计 | 优化后目标 |
|------|----------|-----------|
| 首屏 LCP | - | 改善 40-60% |
| 单 chunk 解析 | - | 减少 60%+ |
| 二次加载 | - | 近乎瞬间 (SW 缓存) |
| API 请求延迟 | - | 减少 200-400ms |
| 内存泄漏风险 | 中 | 低 |