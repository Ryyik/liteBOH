# 首屏进入 & UserSpace 性能勘察（2026-11-14）

> 口径：**生产产物**（`vite build`）+ `vite preview`，1.6 Mbps / RTT 150 ms，CPU 4× 降速（≈中端手机），
> 冷启动 `serviceWorkers: 'block'`。体积一律 **gzip 传输字节**（不是磁盘 raw）。
> 复跑：见文末「附录 B · 复跑方式」。

---

## 0. 结论摘要

| # | 问题 | 证据 | 量级 | 优先级 |
|---|---|---|---|---|
| 1 | **首屏空闲预取了 `/ai-chat` 整条 AI 链路** | A/B 实测：关掉后 1027→709 KB、158→136 请求 | **318 KB / 22 请求 / LCP −1.1 s** | **P0** |
| 2 | LCP 是帖子缩略图，不是骨架也不是文字 | `/` LCP 8.98 s、`/user-space` 7.58 s，命中元素均为 `img.image-post-thumb` | 首屏感知的最后 3–4 s | **P0** |
| 3 | userspace 入口闭包里塞了「只有发帖才用」的商业化/压缩模块 | `image-compression-vendor` 19.5 + `image-moderation-pipeline` 6.3 + `content-moderation` 4.0 + `unified-content-moderation` 1.1 | **≈30 KB** | P1 |
| 4 | 每次底栏切页都重拉 **3 次 `favicon.png`（3×8 KB）** | 二轮互切实测（已缓存全部 chunk）仍每切一次 3 个请求 | 24 KB + 3 RTT / 次 | P1 |
| 5 | 首次访问在 `load` 之后还有 237 KB / 62 请求 | SW 预缓存清单 853.89 KiB（24 条）+ 空闲预取 | 与首屏图片抢带宽 | P1 |
| 6 | 消息席首访 227 KB / 17 请求；周边席首访 217.7 KB / 19 请求、可见 1310 ms | 五席互切实测 | 单席首访成本 | P2 |
| 7 | 论坛流滚动偶发长帧（最差 374 ms，2/214 帧 >50 ms） | 40 步滚动采样 | 首帧图片解码 | P2 |

**已经做得对的三件事**（不要"优化"它们）：
- `nsfw-weights`（2477 KiB gzip）不在首屏闭包、不进预缓存、只经动态 `import()` —— 现状正确，**需要一条"它不得进入入口静态闭包"的门禁**。
- 路由级 CSS 已收窄：保留 2 个壳样式、122 个转运行时 `CacheFirst`。
- 图片：66 个 `<img>` 里 65 个 `loading="lazy"`、仅 13 个在视口内。

---

## 1. 产物结构（gzip）

**应用壳 = 247.3 KiB**（`index.html` 的 15 个 `modulepreload` + 2 个 `stylesheet`）

| 文件 | gzip |
|---|---|
| `ui-components-*.js`（含**路由表**本身） | 57.3 KiB |
| `supabase-vendor-*.js` | 54.1 KiB |
| `vue-vendor-*.js` | 42.6 KiB |
| `index-*.css`（壳样式） | 22.9 KiB |
| `vue-utils-vendor` / `ui-icons` / `app` / `auth-store` / `auth-api` | 15.0 / 13.5 / 11.6 / 8.1 / 5.5 |
| `ui-components-*.css` | 6.7 KiB |

**路由增量排行（已扣除壳）**

| 路由 | 增量 | 说明 |
|---|---|---|
| `/join` | 107.2 KiB | 招募页 |
| **`/user-space`** | **104.2 KiB** | 45 个依赖文件 |
| `/admin/shop-editor` | 103.2 KiB | |
| `/shop` | 79.7 KiB | |
| **`/`** | **50.1 KiB** | 27 个依赖 |
| `/user-space/albums` | 60.8 KiB | |

**全产物**：JS 4296 KiB gzip / 207 个文件；CSS 531 KiB gzip / 122 个文件。
最大单块：`nsfw-weights` 2477 KiB（隔离正确）、`tfjs-vendor` 261.5、`DataAdmin` 134.7、
`useChatEngine` 115.5、`index-DkVAVPgv`（BOHAI 页）77.4。

> ⚠️ 依赖表看不见**二级动态 import**：`DataAdmin` 那条 134.7 是真实独立路由，但 BOHAI 页
> 77.4 + 引擎 115.5 + markdown 29.7 是被 `index-DkVAVPgv` 二级拉起的 —— 它本来不该在首屏出现。

---

## 2. 首屏进入（冷启动）

### 2.1 `/`（首页 / 内容）

| 指标 | 值 |
|---|---|
| FCP | **1.20 s**（= 骨架文字 `boh-boot-text`） |
| LCP | **8.98 s**（三次 6.06 / 8.98 / 9.61，中位 8.98） |
| 内容可见（≥200 字） | 7.96 s |
| DCL / load | 1.92 s / 2.69 s |
| 请求 / 传输 | **163 个 / 1031 KB**（js 772 KB / 85 文件、css 144 KB / 27 文件、img 84 KB / 18） |
| 长任务 | 4 个：221 / 71 / 156 / 181 ms |

**LCP 时间线**：`骨架文字 1.2 s → 导航 1.6 s →（无记录）→ IMG 8.9 s`
最后一次刷新的元素是 `img.image-post-thumb.is-loaded`（22 KB 的帖子缩略图）。
即：**文字和骨架都在 1.2 s 就位，用户在 1.2 s 之后到 8.9 s 之间等的是"帖子图"**。

### 2.2 `/user-space`（我 / 内容分区）

| 指标 | 值 |
|---|---|
| FCP | **1.18 s**（骨架文字） |
| 内容可见 | **4.80 s**（论坛流首屏卡片） |
| LCP | **7.58 s**（同样是 `image-post-thumb`） |
| 请求 / 传输 | 123 资源 / 671.8 KB（**关闭空闲预取**时） |
| 直达 `tab=posts`（预取开启） | 139 请求 / 946.8 KB，其中 js 740 KB / **80 个文件** |
| 长任务 | 4 个：221 / 80 / 128 / 186 ms |

LCP 候选序列：`骨架 1184 → 内容块 4804（size 3492）→ 图片 7580（21398）`。
**内容 4.8 s 才成"最大元素"，是因为首屏先渲染了骨架、再等数据 + 图片。**

### 2.3 首次访问的"隐形账单"（S0）

`load` 发生在 **609 ms**（本机无限速口径），之后 8 s 内还有：

- **62 个请求 / 237.4 KB**：Script 12 个 104 KB、Stylesheet 5 个 49 KB、Image 18 个 38 KB、Fetch 12 个 21 KB。
- SW 预缓存清单 **853.89 KiB / 24 条**（构建日志），HTTP 缓存折抵后净增约 237 KB。

---

## 3. 空闲预取 A/B（P0 主因）

`src/composables/useRoutePrefetch.js` 在空闲时预取 `['/user-space', '/ai-chat']`。
`/ai-chat` = BOHAI 页（77.4 KiB）+ `useChatEngine`（115.5 KiB）+ `markdown-vendor`（29.7 KiB）
+ markdown CSS ≈ **225.8 KiB**，**每个首次访客都会下，包括从不打开 AI 的人**。

| 组 | 传输 | 请求 | LCP（中位） | AI 链路 |
|---|---|---|---|---|
| A 现状 | 1027.1 KB | 158 | **8.98 s** | 225.8 KB |
| B 关闭空闲预取 | 709.3 KB | 136 | **7.85 s** | 0 |

FCP 不变（预取在 `load` 之后），但 LCP 中位 **−1.13 s**，最差样本 9.61 s → 7.85 s（−1.76 s）。
原因很直接：1.6 Mbps 下 318 KB ≈ **1.6 s 的整条带宽**，而首屏正在下的正是 LCP 那张帖子图。

**建议**（三选一，按推荐排序）：
1. **`/ai-chat` 从空闲预取里删掉**，只留 `/user-space`（底栏席位、高频）。AI 的实际入口是
   灵动岛 / 右缘滑动 / 全局搜索 —— 这三个入口都在**用户真的要用**时才加载，没有必要预取。
2. 保留但**推迟到首屏稳定之后**（`load` + 首个 LCP 稳定 + `requestIdleCallback(timeout: 8000)`），
   并在 `navigator.connection.saveData` 或 `effectiveType` 为 2g/3g 时跳过。
3. 只在「用户 hover / focus 到 AI 入口」时预取（`useRoutePrefetch` 已支持 hover 路径）。

> 样式安全影响：三者都只是**少下载**，不改变任何 CSS 的加载顺序；`/ai-chat` 路由样式仍由
> `__vitePreload` 在真正进入时 await，不会出现"路由到了但无样式"。

---

## 4. UserSpace 内部

### 4.1 五席互切（keepAlive 已生效）

第二轮（全部命中缓存）：

| 席 | 可见 | 新请求 | 新字节 | 新 chunk |
|---|---|---|---|---|
| 内容 | 100 ms | 3 | 25 KB | 0 |
| 图库 | — | **0** | 0 | 0 |
| 周边 | 49 ms | 3 | 25 KB | 0 |
| 我 | 105 ms | 3 | 25 KB | 0 |

**结论：`KeepAlive` 落地正确** —— 零新 chunk、零数据接口；「图库」连那 3 个请求都省了。

但那 **3 个请求 = `favicon.png` × 3（3 × 8 KB）**，每次切页都重复。`index.html` 里有 **5 条**
icon 声明（32/16/apple-touch/mask/shortcut），且 `UserSpaceSideRail.vue:11` 还有一枚
`<img src="/favicon.png">`。修法：合并成一条 `<link rel="icon" sizes="any">`，侧栏改用已打包的
`@/assets/images/favicon.webp`。

### 4.2 单席首访成本

| 席 | 首访 | 请求 | 字节 | 拉起的 chunk |
|---|---|---|---|---|
| 周边 `/shop` | 1310 ms | 19 | 217.7 KB | store/EditableImage/AddressManager… |
| 消息 | — | 17 | 227.1 KB | user-space-navigation / page-header / EmptyState / 5 个 |
| 图库 | — | 8 | 72.7 KB | recovery-access / AltchaWidget / index |

消息与周边是"一次付费、之后免费"，但**周边 217.7 KB 里含地址管理与可编辑图片**这类
只在特定分区才用的组件（`AddressManager` / `EditableImage`）——值得按分区再拆一层。

### 4.3 我页内分段

`资产` 切换 **25 ms** 可见，无新 chunk（分段已闩锁）。分段切换本身不是瓶颈。

### 4.4 滚动与 DOM

- 论坛流：**DOM 996 节点**，66 个 `<img>`（65 lazy / 1 eager / 1 `fetchpriority`），视口内 13 张。
- 40 步滚动：**p50 17 ms / p95 21 ms / 最差 374 ms，2 帧 >50 ms**（1%）。
  首帧那次长帧来自图片解码，不在滚动链路上。

---

## 5. 优化建议（带落点与样式安全影响）

### P0

| 动作 | 落点 | 预期收益（估算） | 样式安全影响 |
|---|---|---|---|
| 空闲预取去掉 `/ai-chat` | `src/composables/useRoutePrefetch.js:52` | −225.8 KB、−22 请求、LCP −1.1 s | 无（减少下载，不改加载顺序） |
| 首屏缩略图给 `fetchpriority="high"` + 固定 `width/height` | `PostCard.vue` / `ForumSectionShell` 首屏前 2 张 | LCP 提前 1–2 s（估算）；CLS 归零 | 无（属性级） |

### P1

| 动作 | 落点 | 收益 | 样式安全影响 |
|---|---|---|---|
| 发帖/头像才用的模块改动态 `import()` | `UserSpaceMain.vue` → `image-compression` / `image-moderation-pipeline` / `content-moderation` | −30 KB 入口闭包 | 需确认 `style-load-guard` 仍覆盖（这些模块无独立 CSS） |
| 合并 favicon 声明、侧栏用 webp | `index.html` + `UserSpaceSideRail.vue:11` | −24 KB / 次切页、−3 RTT | 无 |
| 预缓存 853.89 KiB 分级：壳 CSS 必留，其余按需 | `vite.config.*` 的 `manifestTransforms` | 首访后置流量 −150~200 KB（估算） | **高风险**：动预缓存必须补"壳 CSS ∈ 预缓存"断言，否则离线首屏无样式 |

### P2

| 动作 | 落点 | 收益 |
|---|---|---|
| 周边按分区再拆（地址/可编辑图片） | `Shop/index.vue` | 首访 −60~80 KB（估算） |
| 消息首访只拉第一页 | `Messages/index.vue` | −100 KB 量级 |
| 给 `nsfw-weights` 补一条"不得进入口闭包"的门禁 | 新增 `check:first-paint` 断言 | 锁住 2477 KiB 不被误引入 |

---

## 6. 没有被本次勘察覆盖的

- **低端真机**：只有 4× CPU 降速模拟，没有真实 Android 中端机数据。
- **4G/弱网以外**：没有测 3G（400 kbps）与 saveData 场景。
- **数据层缓存**：本次只看网络与渲染，没审 `getCache()` 的 TTL/回插/失效链。
- **二阶导航**（帖子详情、他人空间）未测。

---

## 附录 A · 原始数据

```
[产物] 壳 247.3 KiB（15 JS + 2 CSS）｜JS 4296 KiB / 207 文件｜CSS 531 KiB / 122 文件
[/ ]   FCP 1200 · LCP 8980(中位) · 内容 7955 · 163 req / 1031 KB · 长任务 4(221/71/156/181)
[/us]  FCP 1184 · 内容 4804 · LCP 7580(图片) · 123 res / 672 KB（预取关闭）
[A/B]  预取开 1027 KB / 158 req / LCP 8980  →  关 709 KB / 136 req / LCP 7852
[SW ]  预缓存 853.89 KiB / 24 条；首访 load 后 +237 KB / 62 req
[互切] 内容 100ms/3req/25KB · 图库 0 · 周边 49ms/3/25KB · 我 105ms/3/25KB（均为 favicon）
[首访] 周边 1310ms/19req/217.7KB · 消息 17req/227.1KB · 图库 8req/72.7KB
[滚动] frames 214 · p50 17 · p95 21 · worst 374 · >50ms 2 帧
[DOM ] 996 节点 · img 66（lazy 65 / 视口内 13）· scrollHeight 6146
```

## 附录 B · 复跑方式

```bash
# 1) 产物（不要直接覆盖 dist：会被 safe-delete 守卫拦下）
npx vite build --outDir dist-audit

# 2) 起预览（只监听 [::1]）
npx vite preview --outDir dist-audit --port 4180 --strictPort

# 3) 分段复跑
node scripts/probes/probe-perf-first-paint.mjs    # S0 预缓存 / S1 首屏 / S3 五席互切 / S4 滚动 / S5 首页对照
node scripts/probes/probe-perf-prefetch-ab.mjs    # 空闲预取 A/B（3 次取中位）
```

> 探针里的登录态是「注入 pinia → 读回 `boh_auth` → 新上下文预置」，
> 避免每次测量都要等真实登录；`boh_auth` 的 4 个字段与 `stores/auth.ts` 的
> `persist.paths` 一致，改了那边要同步改探针。
