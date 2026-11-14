# 首屏进入 & UserSpace 性能勘察（2026-11-14）

> 口径：**生产产物**（`vite build --outDir dist-audit`）+ `vite preview`，1.6 Mbps / RTT 150 ms，
> CPU 4× 降速（≈中端手机），冷启动 `serviceWorkers: 'block'`。体积一律 **KiB（1024）gzip 传输字节**。
> 本报告已于同日做**逐条核对**（见 §7），修正了 6 处口径错误；下文数值均为核对后口径。
> 复跑：见「附录 B」。

---

## 0. 结论摘要

| # | 问题 | 证据（核对后） | 量级 | 优先级 |
|---|---|---|---|---|
| 1 | **首屏空闲预取了 `/ai-chat` 整条 AI 链路** | 两次 A/B 各 3 轮：1026.8→709.0 KiB、158→136 请求 | **−317.8 KiB / −22 请求 / LCP −1.2 s** | **P0** |
| 2 | LCP 是帖子缩略图，不是骨架也不是文字 | 首页 LCP 8.72–9.74 s、我页 7.38–7.58 s，命中元素均为 `img.image-post-thumb` | 首屏感知的最后 3–4 s | **P0** |
| 3 | userspace 入口闭包塞了「只有发帖才用」的模块 | `image-compression-vendor` 19.5 + 图像审核 11.4（三块合计）+ `image-compression` 1.6 + `avatar-storage` 0.6 | **≈33 KiB** | P1 |
| 4 | 每次底栏切页都重取 **3 次 `favicon.png`（3 × 8.3 KiB）** | S3d 实测：已缓存状态下 6 个请求全是 `favicon.png`，资源类型 **Other** | 24.9 KiB + 3 RTT / 次 | P1 |
| 5 | 首次访问 `load` 之后还有约 230 KiB / 61 请求 | SW 预缓存 853.89 KiB（24 条）+ 空闲预取（ForumMain 47.1、cropper 19.6…） | 与首屏图片抢带宽 | P1 |
| 6 | 单席首访成本（多次采样区间） | 消息 227–341 KiB / 17–21 请求；周边 105–218 KiB / 15–19 请求，可见 672–1310 ms | 单席首访 | P2 |
| 7 | 论坛流滚动偶发长帧 | 171–214 帧里 **1–2 帧 >50 ms，最差 374–378 ms** | 首帧图片解码 | P2 |

> **落地状态**：上表 7 项里的 P0×2 / P1×3 与「nsfw 不得进入口闭包」的门禁**已于同日全部执行**，
> 前后实测、闭包核验与代价见 §8。

**已经做得对的三件事**（不要"优化"它们）：
- `nsfw-weights`（2477 KiB gzip / 2.4 MB raw）不在首屏闭包、不进预缓存、只经动态 `import()` —— 现状正确，**建议补一条"它不得进入入口静态闭包"的门禁**。
- 路由级 CSS 已收窄：**保留 2 个壳样式、122 个转运行时 `CacheFirst`**（注意：122 是「移出预缓存的条数」，不是 CSS 文件总数——总数 124）。
- 图片：论坛流 66 个 `<img>` 里 65 个 `loading="lazy"`、仅 13 个在视口内。

---

## 1. 产物结构（gzip）

**应用壳 = 247.3 KiB**：`index.html` 里 **14 个 `modulepreload` + 1 个入口 `<script type=module>`（共 15 个 JS）+ 2 个 `stylesheet`**。

| 文件 | gzip |
|---|---|
| `ui-components-*.js`（含**路由表**本身） | 57.3 KiB |
| `supabase-vendor-*.js` | 54.1 KiB |
| `vue-vendor-*.js` | 42.6 KiB |
| `index-*.css`（壳样式） | 22.9 KiB |
| `vue-utils-vendor` / `ui-icons` / `app` / `auth-store` / `auth-api` | 15.0 / 13.5 / 11.6 / 8.1 / 5.5 |
| `ui-components-*.css` | 6.7 KiB |

**路由增量排行（已扣除壳；JS + CSS 合计）**

| 路由 | 合计 | JS | CSS |
|---|---|---|---|
| `/admin/shop-editor` | **131.3 KiB** | 103.2 | 28.1 |
| **`/user-space`** | **123.5 KiB** | 104.2 | 19.3 |
| `/admin/hero-console` | 117.1 KiB | 98.1 | 19.0 |
| `/join` | 115.7 KiB | 107.2 | 8.5 |
| **`/shop`** | **107.0 KiB** | 79.7 | 27.4 |
| `/admin/news-editor` | 98.1 KiB | 82.7 | 15.5 |
| `/newsroom` | 79.2 KiB | 64.5 | 14.8 |
| **`/`** | **63.8 KiB** | 50.1 | 13.8 |
| `/user-space/albums` | 66.9 KiB | 60.8 | 6.0 |

**全产物**：JS **4296 KiB gzip / 207 个文件**（raw 9.0 MB）；CSS **531 KiB gzip / 124 个文件**（raw 2.8 MB）。
最大单块：`nsfw-weights` 2477 KiB（隔离正确）、`tfjs-vendor` 261.5、`DataAdmin` 134.7、
`useChatEngine` 115.5、`index-DkVAVPgv`（BOHAI 页）77.4。

> ⚠️ 依赖表看不见**二级动态 import**：BOHAI 页 77.4 + 引擎 115.5 + markdown 29.7 是被
> `index-DkVAVPgv` 二次拉起的 —— 它本来根本不该出现在首屏（见 §3）。

---

## 2. 首屏进入（冷启动）

### 2.1 `/`（首页 / 内容）

| 指标 | 值（4 次采样） |
|---|---|
| FCP | **1.18 – 1.23 s**（骨架文字 `boh-boot-text`） |
| LCP | **8.72 – 9.74 s**（中位 8.83 s） |
| 内容可见（≥200 字） | 7.96 – 8.10 s |
| DCL / load | 1.92 – 1.95 s / 2.69 – 2.70 s |
| 请求 / 传输 | **163 个 / 1030.9 KiB** |
| 其中 | js **754.0** KiB / 85 文件、css **140.2** KiB / 27 文件、img **82.2** KiB / 18、xhr 23.6、other 25.0 |
| 长任务 | 4–5 个，最长 **218 – 260 ms** |

**LCP 时间线**：`骨架文字 1.2 s → 视觉就位 → IMG 8.7~9.7 s`。
最后一次刷新的元素是 `img.image-post-thumb.is-loaded`（22 KiB 的帖子缩略图）。
即：**文字和骨架 1.2 s 已就位，用户其后的 7 秒多在等帖子图。**

### 2.2 `/user-space`（两种落点，分开测）

**A) 直达 `?tab=posts`（我 / 空间）**

| 指标 | 值 |
|---|---|
| FCP | 1.20 – 1.21 s |
| 内容可见（`.tab-page` 撑开且有内容） | **6.04 s** |
| LCP | **1.21 s = 骨架**（该档空态没有更大的元素，LCP 不具参考性） |
| 请求 / 传输 | 132 – 139 个 / 929 – 947 KiB |
| 其中 | js **722.8** KiB / **80 个文件**、css **149.8** KiB / 27 文件 |
| 长任务 | 5 个：249 / 89 / 51 / 133 / 120 ms |

**B) 直达 `?tab=community`（我 / 内容，有论坛流）**

| 指标 | 值 |
|---|---|
| FCP | 1.18 s |
| 论坛卡片可见 | **6.20 s** |
| LCP | **7.58 s**（`img.image-post-thumb`） |
| 请求 / 传输 | 123 资源 / 671.8 KiB（**关闭空闲预取**时） |

LCP 候选序列：`骨架 1184 → 内容块 4804 → 图片 7580`。注意 4.80 s 那个候选是"某个内容块成为
最大元素"的时刻，**不等于"用户看到内容"**（卡片实际 6.20 s 才齐）。

### 2.3 首次访问的"隐形账单"（S0，时间基准已修正）

`load` 发生在 **675 ms**（本机无限速口径），之后 8 s 内还有 **61 个请求 / 229 KiB**：

- 其中 `ForumMain-*.js` 47.1 + `ForumMain-*.css` 33.5 + `forum-feed-cache` 33.3 + `cropper-vendor` 19.6 ——
  是**首页的空闲预取**（论坛组件 + 图片裁剪器），不是 SW 预缓存。
- SW 预缓存清单本身 **853.89 KiB / 24 条**；受浏览器 HTTP 缓存折抵，净增落在 229 KiB 量级。

> 口径提醒：S0 第一版把 CDP 的 epoch 时间戳与页面 `performance.now()` 直接比较，
> 得出了"load 之后下了 982 KiB"的假读数。现已统一到 Node 侧 `Date.now()`（见 §7）。

---

## 3. 空闲预取 A/B（P0 主因）

`src/composables/useRoutePrefetch.js:52` 空闲时预取 `['/user-space', '/ai-chat']`。
`/ai-chat` = BOHAI 页（77.4）+ `useChatEngine`（115.5）+ `markdown-vendor`（29.7）+ markdown CSS ≈ **225.8 KiB**，
**每个首次访客都会下，包括从不打开 AI 的人**。

两次独立 A/B（每次 3 轮，冷启动，SW blocked）：

| 组 | 传输 | 请求 | LCP（中位） | FCP |
|---|---|---|---|---|
| A 现状 | 1026.8 KiB | 158 | **8.83 s**（8.72 / 8.83 / 9.00） | 1.19 s |
| B 关闭空闲预取 | 709.0 KiB | 136 | **7.62 s**（7.38 / 7.62 / 7.85） | 1.17 s |
| 差值 | **−317.8 KiB** | **−22** | **−1.21 s** | −20 ms |

（第一批 A/B 读数：1027.1/709.3 KiB、158/136 请求、LCP 8.98/7.85 —— 与本次一致。）

原因很直接：1.6 Mbps 下 318 KiB ≈ **1.6 s 的整条带宽**，而首屏正在下的正是 LCP 那张帖子图。

**建议**（按推荐排序）：
1. **`/ai-chat` 从空闲预取里删掉**，只留 `/user-space`（底栏席位、高频）。AI 的三处入口
   （灵动岛 / 右缘滑动 / 全局搜索）都在用户真要用时才加载，没必要预取。
   → **已按此条落地（2026-11-14）**，代价（首次唤岛 +152.9 KiB）见 §8.3。
2. 保留但**推迟到首屏稳定之后**（`load` + LCP 稳定 + `requestIdleCallback(timeout: 8000)`），
   并在 `navigator.connection.saveData` / `effectiveType` 为 2g/3g 时跳过。
3. 只在 hover / focus 到 AI 入口时预取（`useRoutePrefetch` 已有 hover 通道）。

> 样式安全影响：三条都只是**少下载**，不改变任何 CSS 的加载顺序；`/ai-chat` 路由样式仍由
> `__vitePreload` 在真正进入时 await，不会出现"路由到了但无样式"。

---

## 4. UserSpace 内部

### 4.1 五席互切（KeepAlive 已生效）

第二轮（全部命中缓存）：

| 席 | 可见 | 新请求 | 新字节 | 新 chunk |
|---|---|---|---|---|
| 内容 | 119 – 120 ms | 3 | 25.0 KiB | 0 |
| 图库 | 判据未命中 | **0** | 0 | 0 |
| 周边 | 64 – 77 ms | 3 | 25.0 KiB | 0 |
| 我 | 120 – 132 ms | 3–4 | 25.0 – 31.6 KiB | 0 |

**结论：`KeepAlive` 落地正确** —— 零新 chunk、零数据接口；「图库」连那 3 个请求都省了。

那 **3 个请求 = `favicon.png` × 3（3 × 8.3 KiB）**。S3d 打出的原始证据：

```
8.3KB  Other  favicon.png   ×6（我→内容→我 两个来回，每个来回 3 次）
```

**归因（已修正）**：资源类型是 `Other` 而不是 `Image` ⇒ 这是**浏览器在软导航后重取站点图标**，
与 `UserSpaceSideRail.vue:11` 那枚 `<img src="/favicon.png">` **无关**（那枚只加载一次、类型 Image）。
真正的诱因是 `index.html` 里 **5 条 icon 声明、4 条指向同一个 `/favicon.png`**，而且这个文件是
**1024×1024 / 8.2 KiB**（被当 16/32px 图标用）。

修法（按收益排序）：
1. 合并成一条 `<link rel="icon" sizes="any" href="/favicon-32.png">`，另出一张 32×32（约 1–2 KiB）；
   `mask-icon` 走 SVG；`apple-touch-icon` 保持 180 单独一条。
2. 侧栏那枚 `<img>` 换成已打包的 `@/assets/images/favicon.webp`（少一次 8.2 KiB PNG，且不额外请求）。

> **已落地（2026-11-14）**：第 1 条按「一条 32×32 + 一条 apple-touch」执行（`mask-icon` 直接删掉 ——
> 它只认 SVG，挂 PNG 等于声明了一个 Safari 永远用不上的图标）；第 2 条换成新出的
> `brand-mark-64.webp`（872 B，小于内联阈值 ⇒ 零请求，比复用 1024px 的 `favicon.webp` 更省）。
> 实测一次切页：`favicon.png ×3 / 24.9 KiB` → `favicon-32.png ×1 / 3.0 KiB`。

### 4.2 单席首访成本（多次采样，取区间）

| 席 | 可见 | 请求 | 字节 | 拉起的 chunk |
|---|---|---|---|---|
| 周边 `/shop` | 672 – 1310 ms | 15 – 19 | 105.1 – 217.7 KiB | store / EditableImage / AddressManager… |
| 消息 | 1208 ms | 17 – 21 | 227.1 – 340.9 KiB | user-space-navigation / page-header / EmptyState / index |
| 图库 | 判据未命中 | 8 – 9 | 72.7 – 82.9 KiB | recovery-access / AltchaWidget / index |

两点说明：
- 周边与消息的字节数**随列表数据波动**（商品/消息条数不同），单次数值不可当绝对值用。
- 图库首访会拉起 `AltchaWidget` + `recovery-access`（人机校验/登录恢复路径），
  探针环境下 `.cloud-page` 在 15 s 内没达到可见判据 —— 该席**只报字节，不报可见时刻**。

### 4.3 我页内分段

`资产` 切换 **25 – 29 ms** 可见，无新 chunk（分段已闩锁）。另外两档（印象/空间）在探针里
按文案点击未命中（标签文案与当前档相关），本项只作单点参考，不作为结论。

### 4.4 滚动与 DOM

- 论坛流：**DOM 996 节点**，66 个 `<img>`（65 lazy / 1 eager / 1 `fetchpriority`），视口内 13 张。
- 30–40 步滚动：**p50 17 ms / p95 18–26 ms / 最差 374–378 ms，1–2 帧 >50 ms**（≈0.6–1%）。
  长帧出现在起始那次图片解码，不在滚动链路上。

---

## 5. 优化建议（带落点与样式安全影响）

> 本表已全部落地，实测与取舍见 §8；其中 P1-3 的「−150~200 KiB」**估高了**（实测只有图标的 34.3 KiB 可移）。

### P0

| 动作 | 落点 | 预期收益（估算） | 样式安全影响 |
|---|---|---|---|
| 空闲预取去掉 `/ai-chat` | `src/composables/useRoutePrefetch.js:52` | −225.8 KiB、−22 请求、LCP −1.2 s（已 A/B 实证） | 无（减少下载，不改加载顺序） |
| 首屏缩略图给 `fetchpriority="high"` + 固定 `width/height` | `PostCard.vue` / 论坛流首屏前 2 张 | LCP 提前 1–2 s（估算）；CLS 归零 | 无（属性级） |

### P1

| 动作 | 落点 | 收益 | 样式安全影响 |
|---|---|---|---|
| 发帖/头像才用的模块改动态 `import()` | `UserSpaceMain.vue` → `image-compression-vendor`(19.5) / `image-moderation-pipeline`(6.3) / `content-moderation`(4.0) | −30 KiB 入口闭包 | 需确认 `style-load-guard` 仍覆盖（这些模块无独立 CSS） |
| 合并 icon 声明 + 32×32 图标 + 侧栏用 webp | `index.html` + `UserSpaceSideRail.vue:11` | −24.9 KiB / 次切页、−3 RTT | 无 |
| 预缓存 853.89 KiB 分级：壳 CSS 必留，其余按需 | `vite.config.*` 的 `manifestTransforms` | 首访后置流量 −150~200 KiB（估算） | **高风险**：动预缓存必须补"壳 CSS ∈ 预缓存"断言，否则离线首屏无样式 |

### P2

| 动作 | 落点 | 收益 |
|---|---|---|
| 周边按分区再拆（地址/可编辑图片） | `Shop/index.vue` | 首访 −40~80 KiB（估算） |
| 消息首访只拉第一页 | `Messages/index.vue` | −100 KiB 量级 |
| 给 `nsfw-weights` 补"不得进入口闭包"门禁 | 新增 `check:first-paint` 断言 | 锁住 2477 KiB 不被误引入 |

---

## 6. 没有被本次勘察覆盖的

- **低端真机**：只有 4× CPU 降速模拟，没有真实 Android 中端机数据。
- **3G / saveData**：没测 400 kbps 与省流模式。
- **数据层缓存**：未审 `getCache()` 的 TTL / 回插 / 失效链。
- **二阶导航**（帖子详情、他人空间）未测。
- **图库席的可见时刻**：探针环境撞上人机校验，缺一条可靠读数。

---

## 7. 报告核对记录（2026-11-14 同日二次核对）

核对方式：从产物重算 + 复跑两个探针（首屏 2 次、A/B 两次各 3 轮）。

**已修正的 6 处**

| # | 原写法 | 实际 | 原因 |
|---|---|---|---|
| 1 | 路由增量「/user-space 104.2、/ 50.1、/shop 79.7」并当作合计 | 123.5 / 63.8 / 107.0（JS+CSS） | 统计脚本把带 `../css/` 前缀的样式依赖算成 0 字节，**只统计了 JS** |
| 2 | 排行第一是 `/join` 107.2 | 第一是 `/admin/shop-editor` 131.3，`/join` 115.7 | 同上（`/join` 的 CSS 8.5 被漏） |
| 3 | 「15 个 modulepreload」 | 14 个 preload + 1 个入口 script | 把入口 `app-*.js` 也算进了 preload |
| 4 | 「CSS 531 KiB / 122 文件」 | 531 KiB / **124** 文件；122 是"移出预缓存"的条数 | 混淆了预缓存条数与文件总数 |
| 5 | 「js 772 KB / css 144 KB」 | js **754.0** / css **140.2** KiB | 直接把字节数当 KiB 写（772101 B ≠ 772 KiB） |
| 6 | favicon 归因于「5 条 icon 声明 + 侧栏 `<img>`」 | 侧栏 `<img>` **无关**（类型 Image，只加载一次）；重复请求是浏览器软导航后重取（类型 **Other**） | 未核对资源类型就下了归因 |

**已复核为正确的结论**

- 壳 247.3 KiB；JS 4296 KiB / 207 文件；`nsfw-weights` 2477 KiB 隔离正确。
- 首页 LCP ≈ 8.7–9.7 s 且命中 `image-post-thumb`（4 次采样一致）。
- 空闲预取代价：−317.8 KiB / −22 请求 / LCP −1.21 s（两次 A/B 一致）。
- KeepAlive 生效：二轮互切零新 chunk、零数据接口；每席 3 个请求确为 favicon。
- 首访 `load` 后 ≈229 KiB / 61 请求。

**仍不确定 / 已改为区间的**

- 周边、消息单席首访字节与可见时刻：随列表数据波动，改报区间。
- 滚动长帧：1–2 帧（不同页/不同图片），最差 374–378 ms。
- 我页分段的可见耗时：只采到「资产」一档，其余两档文案未命中。

**核对时顺手修掉的探针缺陷（已提交）**

1. S0 时间基准：CDP epoch 与 `performance.now()` 混用 → 统一 Node `Date.now()`。
2. `?tab=posts` 内容判据用「文本 >200 字」，空态只有 45 字 ⇒ 恒返回 −1 → 改判「有 tab-page 撑开且有内容」。
3. `measureSwitch` 文本阈值 60 → 20（图库空态/消息 minimal 档文本少，恒 −1）。
4. S4 原在「我」页空态上滚（永远 17 ms 假绿）→ 先切「内容」再滚。
5. 新增 S3d：打印已缓存状态下一次切页的全部请求（URL + 类型），让 favicon 这类归因可复核。

---

## 8. 落地记录（同日执行 + 前后实测）

§5 的 P0×2 / P1×3 / P2 门禁已全部落地。下面是**做了什么**与**新旧产物对照实测**。

### 8.1 改了哪些地方

| 项 | 落点 | 做法 |
|---|---|---|
| P0-1 | `src/composables/useRoutePrefetch.js` | `IDLE_PREFETCH_PATHS` 只留 `/user-space`；注释写清为什么不许加回 `/ai-chat`（含量级） |
| P0-2 | `src/views/Forum/ForumMain.vue` | `isEager = index < 1` → `index < 2`：首屏前 2 张卡片的首图走 `loading=eager` + `fetchpriority=high`，不再等 IntersectionObserver 回调 |
| P1-1a | `src/utils/image-compression.js` | 顶层 `import ... ?url` → 函数内 `await import(...)`（`loadCompressionWorkerLibUrl`）；解析失败时**不开 worker**（否则退回库默认的 jsdelivr，正是当年「上传永久卡死」的成因） |
| P1-1b | **新增** `src/utils/moderation-cloud-state.js` | 把云端审核的冷却状态/失败预算/在飞波次从 `image-moderation-pipeline.js` 抽出，文本审核改 import 它 ⇒ 切断 `content-moderation → pipeline → forum-image-moderation` 这条静态边。状态仍是同一个 ESM 单例，判定语义不变 |
| P1-1c | `src/views/Forum/composables/useForumImageModerationPreload.js` | 预载守卫只用两个**判定**却静态 import 整条管线 ⇒ ForumMain 的静态图把 pipeline + forum-image-moderation 一起带上。把 `getForcedLayer` / `shouldSkipLocalModel` 也挪进状态模块，守卫改 import 它（单测 mock 落点同步改） |
| P1-2 | `index.html` / `UserSpaceSideRail.vue` / **新增** `public/favicon-32.png` | 5 条 icon 声明 → 1 条 32×32（2.7 KiB）+ 1 条 apple-touch；删掉「指向 PNG 的 mask-icon」与等价的 `shortcut icon`；左栏品牌位改用打包的 64px webp（872 B，内联进 chunk，零请求） |
| P1-3 | `vite.config.js` | `includeManifestIcons: false`：4 张 manifest 图标移出预缓存；补一条 `/icons/` CacheFirst 运行时规则接住 |
| P2 | **新增** `scripts/check-first-paint-closure.mjs` | 4 条源码级断言（见 8.4），已挂 `verify:fast` / `verify:serial` / `build:ci`，并在 `gate-fixtures.mjs` 配了可自证的违规样本 |

### 8.2 前后对照（同一台机器、同样限速 1.6 Mbps / RTT 150 / CPU 4×、SW blocked、各 3 轮取中位）

| 页面 | 指标 | 旧产物 | 新产物 | 差 |
|---|---|---|---|---|
| `/` | LCP | 8.89 s | **7.72 s** | **−1.17 s** |
| `/` | FCP | 1.19 s | 1.19 s | — |
| `/` | 传输 / 请求 | 1027.0 KiB / 158 | **719.5 KiB / 145** | −307.5 KiB / −13 |
| `/user-space?tab=community` | LCP | 9.10 s | **7.64 s** | **−1.46 s** |
| `/user-space?tab=community` | 传输 / 请求 | 979.6 KiB / 145 | **659.2 KiB / 130** | −320.4 KiB / −15 |

（同一天跑了两轮，第一轮是 `/` 9.63→7.86 / 1026.7→727.0、`/user-space` 8.46→8.19 / 979.6→667.0。
LCP 的机器间波动约 ±0.8 s，**字节与请求数两轮几乎一致**（−300±10 KiB / −13±2 请求），
所以量级以字节为准，LCP 只作方向证据。）

单跑 `probe-perf-first-paint` 的 S5（首页冷启动，同口径）LCP 由 8.98 s → **8.06 s**，命中元素仍是
`img.image-post-thumb`（说明 P0-2 没有把 LCP 元素换掉，只是让它更早开始下载）。

**预缓存**：24 条 / 891.1 KiB raw → **20 条 / 856.8 KiB raw**（−34.3 KiB，全部来自 4 张 manifest 图标）。
⚠️ §5 里 P1-3 写的「−150~200 KiB」**估高了**：预缓存里除图标外全是入口静态依赖（`supabase-vendor`
217.3、`ui-components` 172.4、`vue-vendor` 114.7、两张壳 CSS 152.8），一个都不能动。实测可移的只有图标那 34.3 KiB。

**favicon**：S3d 实测一次切页由 `favicon.png ×3 / 24.9 KiB` 降到 `favicon-32.png ×1 / 3.0 KiB`
（两次切页合计 6.0 KiB）。剩下那 1 次是浏览器软导航后重取站点图标，属于浏览器行为；它已经小到不值得再对抗。

### 8.3 闭包核验（产物级，非估算）

从新产物按 `__vite__mapDeps` + 静态 import 边重算 `/user-space` 的依赖闭包：

- **已不在闭包里**：`image-compression-vendor`（19.5）、`image-moderation-pipeline`、
  `forum-image-moderation`、`nsfw-weights`、`cropper-vendor`、`markdown-vendor`、`useChatEngine`。
- **仍在闭包里（应该在）**：`content-moderation` 4.4、`unified-content-moderation` 1.5、
  `moderation-cloud-state` 1.0、`image-compression` 2.1（都是「文本审核 / 头像」链路本身要用的部分）。
- **残留（已处理，留档说明）**：`forum-image-moderation` 2.7 + `image-moderation-pipeline` 4.7
  原本会随**论坛流挂载**被拉一次（7.4 KiB），来源是
  `views/Forum/composables/useForumImageModerationPreload.js` 对 pipeline 的**静态** import
  （它只要 `isCloudModerationCoolingDown` / `shouldSkipLocalModel` 两个判定）。
  把这两个判定也挪进 `moderation-cloud-state.js` 后，实测论坛流**不再拉这两个 chunk**，
  它们只在真正审核一张图时经动态 import 到达。

**换来的代价（明确记录）**：去掉 `/ai-chat` 空闲预取后，**首次**唤出灵动岛要多下
`BohIslandAnswer` 8.2 + `useChatEngine` 115.5 + `markdown-vendor` 29.2 = **152.9 KiB gzip**（一次性，之后走缓存）。
桌面导航 hover 到 AI 入口仍会走 `prefetchRoute` 通道预热；只有「手机首次下拉」会实打实多等这 153 KiB。
这是本次唯一一个「把成本从所有人身上挪到真正用的人身上」的取舍，需要时可在 hover/手势起点补一条定向预取。

### 8.4 新门禁 `check:first-paint-closure`（4 条）

| 规则 | 守什么 | 反证（已自证会红） |
|---|---|---|
| A | `content-moderation.js` 不得静态 import 图片审核管线 | 改回 `./image-moderation-pipeline.js` ⇒ 红 |
| B | `image-compression.js` 不得顶层静态 import `browser-image-compression`（含 `?url`） | 加回顶层 `?url` import ⇒ 红 |
| C | 空闲预取清单只允许 `/user-space` | 加回 `/ai-chat` ⇒ 红 |
| D | `src/` 内不得静态 import `nsfwjs` / `nsfw-weights` / `@tensorflow/*` | 新建静态 import 的探针文件 ⇒ 红 |

四条都由 `scripts/lib/gate-fixtures.mjs` 的 fixture 注入验证（`check:gates-self-test` 已跑通）。

> 写这条门禁时踩到一个值得记的坑：第一版用 `import\s+[^;\n]*?from` 匹配静态 import，
> **多行 import 跨不过换行**（本仓库的 import 几乎全是多行），注入违规却不报错 —— 规则 A 假绿。
> 现在统一走 `staticImportSpecifiers()`（`[^;]*?` 允许换行），并由 fixture 把这类假绿钉死。

### 8.5 顺带暴露的一件事：首屏字节棘轮本来就是红的

`check:first-paint-budget`（build 之后的产物门禁）读数：

| 产物 | 首屏合计 | 判定 |
|---|---|---|
| HEAD + 底栏改造（本次改动前） | 252.0 KB | ❌ 上限 251.6（基线 249.6 + 容差 2.0）**已经超 2.4** |
| 本次改动后 | 253.0 KB | ❌ 超 3.4 |

也就是说**这条棘轮在我动手之前就红了**，本次只自付 **+1.0 KiB**（`ui-components` 57.3→58.3）。
归因说明：新增的 `moderation-cloud-state` 本身是独立 chunk（1.3 KiB），**不在壳里**；
`ui-components` 那 +1.0 是拆掉 `?url` 静态边之后的 chunk 重组，不是新增依赖。
换回来的是：论坛流不再拉 pipeline（7.4 KiB）、压缩库 19.5 KiB 离开 eager 路径。

⚠️ **本次没有 `--update` 基线**：按仓库纪律，基线必须在**干净工作区**上重写，而这个工作区有
100+ 个并行会话的在途文件 —— 此时 update 会把它们的增长一起写进基线（错误归因）。
需要在干净检出上单独做一次 rebaseline，并在 commit message 里写明理由。

---

## 附录 A · 原始数据（核对后）

```
[产物] 壳 247.3 KiB（14 preload + 1 entry + 2 CSS）
       JS 4296 KiB / 207 文件（raw 9.0 MB）｜CSS 531 KiB / 124 文件（raw 2.8 MB）
[路由] shop-editor 131.3 ｜ user-space 123.5(JS104.2+CSS19.3) ｜ hero-console 117.1
       join 115.7 ｜ shop 107.0 ｜ news-editor 98.1 ｜ newsroom 79.2 ｜ / 63.8 ｜ albums 66.9
[/ ]   FCP 1.18-1.23 · LCP 8.72-9.74（中位 8.83）· 内容 7.96-8.10 · 163 req / 1030.9 KiB
       js 754.0/85 · css 140.2/27 · img 82.2/18 · 长任务 4-5 个（最长 218-260ms）
[/us posts]  FCP 1.20 · 内容 6.04 · 132-139 req / 929-947 KiB · js 722.8/80 · css 149.8/27
[/us community] FCP 1.18 · 卡片 6.20 · LCP 7.58(图片) · 123 res / 671.8 KiB（预取关闭）
[A/B]  开 1026.8 KiB / 158 req / LCP 8.83  →  关 709.0 KiB / 136 req / LCP 7.62
[SW ]  预缓存 853.89 KiB / 24 条；首访 load(675ms) 后 +229 KiB / 61 req
[互切] 内容 119ms/3req/25.0K · 图库 0 · 周边 64ms/3/25.0K · 我 132ms/3-4/25.0-31.6K
       → 均为 favicon.png ×3（type=Other）
[首访] 周边 672-1310ms/15-19req/105-218K · 消息 1208ms/17-21req/227-341K · 图库 8-9req/73-83K
[滚动] 171-214 帧 · p50 17 · p95 18-26 · worst 374-378 · >50ms 1-2 帧
[DOM ] 996 节点 · img 66（lazy 65 / 视口内 13）· scrollHeight 6146
[图标] favicon.png 1024x1024 / 8210 B；index.html 5 条 icon 声明（4 条同指该文件）
```

## 附录 B · 复跑方式

```bash
# 1) 产物（不要直接覆盖 dist：会被 safe-delete 守卫拦下）
npx vite build --outDir dist-audit

# 2) 起预览（只监听 [::1]；curl 要 --noproxy '*'）
npx vite preview --outDir dist-audit --port 4180 --strictPort

# 3) 复跑
node scripts/probes/probe-perf-first-paint.mjs   # S0 预缓存 / S1 首屏 / S3 五席互切+S3d 归因 / S4 滚动 / S5 首页
node scripts/probes/probe-perf-prefetch-ab.mjs   # 空闲预取 A/B（3 轮取中位）
```

> 探针里的登录态是「注入 pinia → 读回 `boh_auth` → 新上下文预置」，
> 避免每次测量都要等真实登录；`boh_auth` 的 4 个字段与 `stores/auth.ts` 的
> `persist.paths` 一致，改了那边要同步改探针。
> 注意：注入的是"看起来已登录"的本地状态，**接口仍可能返回空/401**，
> 所以「我」页的帖子列表在本探针里是空态 —— 涉及列表内容的结论请以 `tab=community` 为准。
