# UserSpace 全页面切换性能审计与整体优化方案

- 日期：2026-09-20
- 范围：`/user-space/**` 全部页面（5 个分区 × 各自档位 + 9 条独立子路由 + 设置内部档位）
- 前提约束：**不改变现有功能与视觉表现**；样式加载安全（不得出现「无样式内容」）
- 证据：两处可复跑探针（本文所有数字均为实测，非估算）
  - `scripts/probes/probe-userspace-pages.mjs`（本轮新增，覆盖全部页面）
  - `scripts/probes/probe-userspace-switch.mjs`（上一轮，分区切换）
- 关联报告：`docs/2026-09-20-加载性能与缓存策略审计报告.md`（首屏 / 缓存 / 样式安全）

---

## 0. 结论先行

1. **同路由内的分区与档位切换已经达标**（中位 7–26ms、切回 0 数据请求）。上一轮修掉 `boundaryKey` 的 `fullPath→path` 之后，社区/内容/消息三个分区切回已是「三层节点全复用、0 数据请求」。
2. **真正没治好的是「跨页面往返」**——也就是从 UserSpace 走进任一子页、再返回。根因是：
   `boundaryKey` 挂在**包住整个 RouterView 的错误边界**上，而它的 watcher 监听 `route.path`，
   于是**每次换页面都整棵树销毁重建**，连带把路由级 `KeepAlive` 的缓存一起销毁。
   实测：**返回 UserSpace 时 shell 复用 0/9**，返回过程打出 **142–188 个数据请求**；
   限速 1.2Mbps 下，返回后**数据要 3.2–4.0 秒才就位**。
3. **这个修复的收益已用实验量化**（改法见 §6 P0-1，实验后已还原代码）：
   同一条返回路径，**数据就位 3.2–4.0s → 0.58–1.12s（−72%~−82%）**，返回请求 **188 → 13（−93%）**，**shell 复用 0/9 → 9/9**。
4. 另有两处结构性浪费：**资产/设置分区用 `v-if` 而非复用**（切回资产 5 个请求），以及**「首次访问后保持挂载」的闩锁 `mountedTabs` 写了但从未被使用（死代码）**——修法就是把它接上，而不是另造一套。
5. `settings` 内部的 `mode="out-in"` 过渡给每次换档**硬加约 180ms 串行等待**（实测 291–313ms），是站内唯一还在用「先等旧页走完」的地方。

---

## 1. 页面清单与渲染链路

### 1.1 路由结构：两种页面寻址方式

| 类型 | 寻址 | 页面 |
|---|---|---|
| **同路由 · query 驱动** | `/user-space?tab=…&view=…` | 5 个分区及其全部档位 |
| **独立子路由** | 各自 path | `/user-space/{subscriptions,gifts,partners,account-security,note,shared-memories,tags-impressions,pushplus-settings,settings/version}` |
| **旧路径重定向** | `redirect` | `/mailbox`、`/user-center/**`、`/user-space/{posts,community,ai,assets,settings,profile}` |

分区↔分区的「单源」是 `src/views/user-center/UserSpace/composables/useUserSpaceTabs.js`（`USER_SPACE_VALID_TABS` + `userSpaceNavItems`），
URL 的 `view` 由 `withSectionQuery()` 统一推导（`UserSpaceMain.vue:623`），不要再各写一套。

### 1.2 页面全表与挂载策略（**这是本次审计的核心表**）

| 分区 | 档位 | URL | 容器挂载策略 | 面板挂载策略 | 首次进入请求数 |
|---|---|---|---|---|---|
| 社区 | 最新/关注/新闻/活动 | `?tab=community` | **`v-show`** | `KeepAlive` + `AsyncForum` | 1–3 |
| 社区 | 成员 | `?tab=community&view=members` | **`v-show`** | `v-if`（`AsyncCommunity`） | 4 |
| 社区 | 印象 | `?tab=community&view=impressions` | **`v-show`** | `v-if` | 1 |
| 我的 | 空间 | `?tab=posts` | **`v-show`** | `v-else`（`ProfileHomePanel`） | 12 |
| 我的 | Cloud+ | `?tab=posts&view=cloud` | **`v-show`** | `v-if`（`AsyncCloudPlus`） | 1 |
| 资产 | 方块积分/赞助 | `?tab=assets` | ⚠️ **`v-if`** | `<transition out-in>` + `v-if` | 6 |
| 消息 | 消息 | `?tab=messages` | **`v-show`** | `KeepAlive` + `AsyncMessages` | 1 |
| 消息 | BOH AI | `?tab=messages&view=ai` | **`v-show`** | `v-if` + 访问闩锁 | 0 |
| 设置 | 主页 | `?tab=settings` | ⚠️ **`v-if`** | `<transition out-in>` + `v-if` | 1 |
| 设置 | 编辑资料/数据导出/数据与隐私 | `?tab=settings&view=…` | ⚠️ **`v-if`** | `<transition out-in>` + `v-else-if` | 0–1 |
| 子路由 ×9 | — | `/user-space/*` | `meta.keepAlive` 全缺 | 各视图自身 | 0–4 |

> 结论：**5 个分区里 2 个（资产、设置）用 `v-if`**，与其余 3 个（`v-show`）不一致 → 每次进入都重建组件、重跑 `onMounted` 取数。
> **9 条子路由全部没有 `meta.keepAlive`** → 每次进入都重建。

### 1.3 渲染流程（以一次「我的 → 子页 → 返回」为例）

```
点击/URL 变化
  └─ router.beforeEach            （requiresLogin 未过 → 弹登录岛 + next(false)，**不改 hash**）
      └─ watch(route.path) → boundaryKey++  ⚠️ 整棵页面树销毁重建（KeepAlive 缓存一并销毁）
          └─ RouterView 渲染新 Component
              ├─ 子页自身 onMounted → 取数（无 TTL 缓存，每次必打）
              └─ 返回 /user-space：
                  ├─ UserSpaceMain 重新挂载（1.2 万行 + 5 个面板）
                  ├─ onMounted 重跑：主题初始化 / ResizeObserver / 论坛预载 / unread
                  ├─ watch(userInfo.id) 触发 → runProfileCriticalFetches
                  └─ userSpaceMemoryCache.clear()  ← ⚠️ 60s TTL 与 5min 热力图缓存全部失效
```

数据层本身**有**缓存设计，问题不在它，而在「外壳把缓存持有者销毁了」：

| 机制 | 位置 | TTL / 窗口 |
|---|---|---|
| `userSpaceMemoryCache` | `useMemoryTtlCache.js` | stats / cloudUsage / pushplus / profilePosts / impressions 60s；heatmap 5min |
| 关键拉取合并窗口 | `PROFILE_CRITICAL_FETCH_DEDUPE_MS` | 5s |
| `lastFetchTime` 节流 | `fetchProfileContent` / `fetchUserStats` | 5s |
| 空闲预载 | `async-loaders.js` `scheduleIdleTask` | `requestIdleCallback(timeout 1600~2500)` |
| 悬停预载 | `preloadUserSpaceTab` | 仅 community / posts / messages / assets / settings 五个 tab |

---

## 2. 实测方法与口径（可复跑）

```bash
npx vite preview --outDir dist-check --port 4180 --strictPort     # 只监听 IPv6，BASE 用 http://[::1]:4180
node scripts/probes/probe-userspace-pages.mjs 'http://[::1]:4180' /tmp
node scripts/probes/probe-userspace-pages.mjs 'http://[::1]:4180' /tmp --slow      # 限速 1.2Mbps / 150ms RTT
ONLY=roundtrip node scripts/probes/probe-userspace-pages.mjs 'http://[::1]:4180' /tmp --slow   # 只复测往返
```

每页记录 4 件事，分别对应一类「慢」：

1. **点击 → 目标内容可见**（感知延迟）——判据是**产生盒子的根元素**，不是 `display:contents` 宿主；
2. **数据请求条数与端点分布**（是否重复取数）；
3. **长任务个数**（>50ms 会掉帧）；
4. **二次进入时页面根节点是否同一实例**（重建 = 状态丢失 + 重新取数）。

### 2.1 两个已踩过的测量陷阱（改探针前必读）

1. **登录守卫会拦导航且不改 hash**。`requiresLogin` 未过时 `next(false)` + 弹登录岛，URL 原地不动。
   此时「主内容块变化」判据会被 `boh-login-modal-overlay` 命中，**看着像切换成功，其实测的是弹窗**。
   伪造登录必须**每次测量前幂等补打**：auth store 有 2 分钟会话心跳（`SESSION_HEARTBEAT_INTERVAL_MS`），
   无真实 session 时会把 `isLoggedIn` 打回 `false`。
2. **`.community-forum-host` 是 `display:contents`**（自身体积 0×0），拿它做可见性判据会**永远超时**。
   判据要落在 `forum-page` / `profile-home-shell` / `x-notifications-container` 这类真正产生盒子的根元素上。

> 上一轮我就用错了一次：第一版探针把 9 条受保护子路由全测成了登录弹窗，数字全部作废。口径修对后结论才成立。

---

## 3. 实测结果

### 3.1 A. 分区入口（不限速）

| 分区 | 阶段 | 耗时 | 数据请求 | 长任务 |
|---|---|---|---|---|
| 社区 | 起点 | — | 0 | 0 |
| 我的 | 首次 | 35ms | **12** | 0 |
| 资产 | 首次 | 26ms | **6** | 0 |
| 消息 | 首次 | 25ms | 1 | 0 |
| 设置 | 首次 | 19ms | 1 | 0 |
| 社区 | 切回 | 22ms | **0** | 0 |
| 我的 | 切回 | 16ms | **0** | 0 |
| 资产 | 切回 | 17ms | ⚠️ **5** | 0 |
| 消息 | 切回 | 10ms | **0** | 0 |
| 设置 | 切回 | 17ms | **0** | 0 |

中位 19–26ms / 最慢 35–37ms。**唯一在「切回」时还在取数的是资产**（`v-if` 重建）。

### 3.2 B. 分区内档位

| 分区/档位 | 耗时 | 数据请求 | 端点分布 |
|---|---|---|---|
| community/最新 | 4ms | 1 | `tbl:posts` |
| community/关注 | 7ms | 1 | `tbl:user_follows` |
| community/新闻 | 4ms | 3 | posts / comments / unread_count |
| community/活动 | 3ms | 2 | posts / unread_count |
| community/成员 | 26ms | 4 | profiles / birthday_profiles / user_follows / unread_count |
| community/印象 | 26ms | 1 | `tbl:user_impressions` |
| posts/空间 | 8ms | 0 | — |
| posts/Cloud+ | 7ms | 1 | `rpc:get_my_boh_cloud_share_channel` |
| messages/消息 | 3ms | 0 | — |
| messages/BOH AI | 9ms | 0 | — |

中位 7ms / 最慢 26ms。**已经很好**，不在优化重点。

### 3.3 C. 独立子路由

| 页面 | 首次耗时 | 首次请求 | 二次进入（基线） | 二次请求 |
|---|---|---|---|---|
| 设置·资料编辑 | 36ms | 0 | 重建 | 7 |
| 设置·数据导出 | **291ms** | 1 | 重建 | 2 |
| 设置·数据与隐私 | **313ms** | 0 | 重建 | 1 |
| 订阅方案 | 37–52ms | 2 | 重建 | 1 |
| 礼物/地址 | 16–17ms | 3 | 重建 | **14** |
| 合作伙伴 | 23–26ms | 3–4 | 重建 | 2 |
| 账号安全 | 14–15ms | 0 | 重建 | 0 |
| BOH 云盘 | 17–29ms | 2 | 重建 | **11** |
| 共享记忆 | 19–24ms | 1 | 重建 | 1 |
| 标签与印象 | 16–23ms | 0 | 重建 | 0 |
| PushPlus 设置 | 23–32ms | 3 | 重建 | **10** |
| 版本/预览 | 13–30ms | 0 | 重建 | 0 |

两点：
- **设置的两个子档首次要 ~300ms**：`DataExportPanel` / `DataPrivacyPanel` 的 chunk 没有空闲预载，且外层是 `mode="out-in"`（180ms 串行等待）。
- **二次进入 12/12 全部「重建」**，其中礼物/地址、BOH 云盘、PushPlus 由于**同时重建了「我的」shell**，请求数飙到 10–14（首次只有 2–3）。

### 3.4 C-3. 往返（我的 → 子路由 → 回「我的」）——**本次最关键指标**

返回那一段是用户真正感知的「来回切」：要不要重跑整棵 UserSpace 树、打多少请求。

**基线（现状）**

| 指标 | 不限速 | 限速 1.2Mbps / 150ms |
|---|---|---|
| `.user-space-page` 节点复用 | **0 / 9** | **0 / 9** |
| 返回期间数据请求合计 | **142** | **188** |
| 返回后「数据就位」 | DOM 十几 ms（无意义） | **3240–4003ms** |

> ⚠️ 「返回耗时（DOM 出现）」这个口径会骗人：返回 UserSpace 时壳是**同步**挂上去的（chunk 已在缓存），
> 所以 DOM 判定永远十几毫秒，限速下也看不出差别。用户等的不是 DOM，是**数据**。
> 因此探针改用「在途请求全部落定 + 500ms 静默」作为「数据就位」时刻。

### 3.5 修 boundary 重建粒度之后的同一指标（实验数据，代码已还原）

| 指标 | 基线 | 实验 | 变化 |
|---|---|---|---|
| `.user-space-page` 节点复用 | 0 / 9 | **9 / 9** | 全部跨路由存活 |
| 返回期间数据请求合计（限速） | 188 | **13** | **−93%** |
| 返回后「数据就位」（限速） | 3240–4003ms | **579–1118ms** | **−72% ~ −82%** |
| 子路由二次进入请求合计（不限速） | 40 | **15** | −63% |
| 设置内部三档二次进入 | 重建 | **复用** | — |
| 全流程长任务 | 0–1 个（一次 51ms） | 0 | — |

---

## 4. 产物侧成本（gzip，已扣除应用壳）

| 页面 / 资源 | 增量 JS | 增量 CSS | 合计 |
|---|---|---|---|
| `/user-space` 本体（`index-Dh2g5J6t.js` + `index-CpHdX5Ic.css`） | 23.3K | 20.1K | **43.4K** |
| `/user-space/partners` | 18.9K | 4.2K | 23.1K |
| `/user-space/subscriptions` | 13.7K | 8.4K | 22.1K |
| `/user-space/gifts` | 11.8K | 7.9K | 19.6K |
| `/user-space/pushplus-settings` | 9.6K | 5.1K | 14.8K |
| `/user-space/tags-impressions` | 9.6K | 3.3K | 12.9K |
| `/user-space/account-security` | 6.6K | 4.9K | 11.5K |
| `/user-space/shared-memories` | 9.0K | 2.4K | 11.5K |
| `/user-space/settings/version` | 2.3K | 2.8K | 5.1K |
| `/user-space/note` | 0.9K | 0.4K | 1.3K |
| 嵌入重面板：`BOHAIMain` | **129.8K** | 23.0K | 152.8K |
| 嵌入重面板：`ForumMain` | 38.6K | **42.5K** | 81.1K |
| 面板：`AssetsHubPanel` | 15.6K | 11.5K | 27.1K |
| 面板：`ProfileHomePanel` / `CommunityTab` / `ProfileSettingsPanel` | 7.0 / 7.3 / 2.8K | 2.9 / 0.4 / 2.4K | — |

要点：
- **9 条子路由的增量都很小（1.3–23.1K）**，说明「慢」不来自下载量，而来自 §3.4 的重复取数与重建。
- **`BOHAIMain` 152.8K 是站内最重的单页资源**，但已有访问闩锁（`bohaiActivatedOnVisit`），不点 BOH AI 分区就不会加载 —— 这块不要再动。
- `/user-space` 本体的 20.1K CSS 是 `shell-community.css`(2877 行) + `landscape-rail.css` + scoped，**属于路由级 CSS**：按 P0-1（上一轮）已从 SW 预缓存移出、改由运行时 `CacheFirst` 兜底 —— 因此**首次进入该路由一定有一次额外 CSS 往返**（这是那次取舍的代价，不是缺陷）。

---

## 5. 共性问题（5 类，按影响排序）

### 问题 1 ⭐ 路由级重建：换页面时把整棵树连同 KeepAlive 一起销毁

- **现象**：返回 UserSpace 时 shell 复用 0/9；返回打 142–188 个请求；限速下数据 3.2–4.0s 才就位。
- **根因**：`src/App.vue` 的 `boundaryKey` 挂在**包住整个 RouterView 的错误边界**上，watcher 监听 `route.path`：

  ```js
  const boundaryKey = ref(0);
  watch(() => route.path, () => { boundaryKey.value += 1; });   // ← 换页面 = 整树重建
  ```
  ```html
  <GlobalErrorBoundary v-else :key="boundaryKey">   <!-- 包住 Suspense + RouterView -->
  ```
  key 自增一次 → 边界重建 → `KeepAlive` 实例被销毁 → 缓存全丢。
- **连带影响**：`onUnmounted` 里 `userSpaceMemoryCache.clear()` 被执行 → 60s TTL 与 5min 热力图缓存一起失效 → 回来必打网络。
- **上一轮已修一半**：`fullPath→path` 解决了「同路由换 query」的重建；**「换页面」这条路径仍在重建**。

### 问题 2 ⭐ 子路由全部没有 keepAlive 白名单

- 9 条子路由 `meta` 里只有 `requiresLogin`，没有 `keepAlive` → 每次进入重建；配合问题 1，还会把「我的」shell 一起重建（礼物/地址二次进入 14 个请求）。

### 问题 3 资产/设置分区用 `v-if`，与其余三区不一致

- 资产切回稳定打 5 个请求（`AssetsHubPanel` 2676 行的 `onMounted`：`fetchUserTier` / `productsStore.fetchProducts` / 抽奖 / 订阅）。
- **配套发现（死代码）**：`useUserSpaceTabs()` 返回了 `mountedTabs`（"首次访问后保持挂载"的闩锁）与 `ensureTabMounted()`，
  `UserSpaceMain` 调用了 3 次 `ensureTabMounted`，但**从未读取 `mountedTabs`** —— 机制设计好了却没接上模板。

### 问题 4 设置内部 `mode="out-in"` 每次换档硬加约 180ms

- `.profile-panel-fade` transition 为 `0.18s`，`mode="out-in"` 让「旧面板走完 → 新面板才进」串行执行；
  叠加未预载的 chunk，实测首次换档 **291–313ms**。
- 这是站内**唯一**还在用「先等旧页走完」的地方（路由级上次已论证不能用 `out-in`）。

### 问题 5 重复取数

- 单次页面进入中同一端点被请求 2–4 次：`4×tbl:user_follows`、`3×tbl:profiles`、`2×rpc:get_my_user_space_summary`。
- 基线（重建态）尤甚；问题 1 修掉后大幅收敛（返回请求 188→13），说明**主要不是缺缓存，而是缓存持有者被销毁**。

---

## 6. 整体优化方案

> 全部方案都在「不改功能、不改视觉」的约束内。每项标注落点、改法、预期收益、以及**必须同步守住的约束**。

### P0-1 拆开「重置错误态」与「重建页面树」（App.vue）

- **落点**：`src/App.vue`（`boundaryKey` / `handleBoundaryError` / `handleBoundaryRecover`）
- **改法**：新增「当前是否真的处于错误态」的状态，换页面时**只有真出过错才自增 key**：

  ```js
  const boundaryKey = ref(0);        // 仅用于「让出错的实例重新初始化」
  const boundaryErrored = ref(false);
  watch(() => route.path, () => {
    if (!boundaryErrored.value) return;   // 正常换页不动树
    boundaryErrored.value = false;
    boundaryKey.value += 1;
  });
  // handleBoundaryError → boundaryErrored.value = true
  // handleBoundaryRecover → boundaryErrored.value = false; boundaryKey.value += 1
  ```
- **为什么安全**：原语义是「换页面时重置边界，避免一次错误污染后续页面」。改动后：
  没出错 → 本来就不需要重置（也就无需重建）；出了错 → 依然重建（保持「让出错实例重新初始化」这个原始理由）。
  `@recover`（重试/回首页）路径完全不变。
- **实测收益**（§3.5）：返回数据就位 **3.2–4.0s → 0.58–1.12s**；返回请求 **188 → 13（−93%）**；shell 复用 **0/9 → 9/9**；设置三档二次进入由重建变复用。
- **必须守住的约束**：
  - `tests/unit/global-error-boundary.test.js` 有一条结构守卫（断言 `:key="boundaryKey"`、`boundaryKey.value += 1;`、`route.path` watcher）。上述改法**同时满足这三条**，但语义变窄 → **必须把守卫加强**（显式断言「仅在错误态才自增」），并按项目惯例做**反证**（改回「无条件自增」→ 守卫转红）。
  - `scripts/probes/probe-userspace-pages.mjs` 的 C-3「shell 复用 9/9」作为端到端兜底，不能只靠单测。

### P1-1 给「重且非实时」的子路由加 `meta.keepAlive`

- **落点**：`src/router/routes/user-space.ts` + `src/App.vue` 的 KeepAlive 分支（已就绪，`meta.keepAlive` 即生效）
- **建议加**：`partners`、`tags-impressions`、`shared-memories`、`pushplus-settings`、`settings/version`
- **建议不加**：`gifts`（地址/礼物数据，实时性强）、`note`（云盘列表）、`account-security`（安全页，宁可每次重新拉）
- **预期收益**：这些页二次进入 `0 请求`；配合 P0-1，二次进入请求合计 40 → 约 15（实验已验证趋势）
- **约束**：KeepAlive 的 key 是 `activeRoute.name`，这几条 name 已唯一；加白名单后需确认没有 `onActivated` 之外的副作用（各页目前只有 `onMounted`）

### P1-2 把 `mountedTabs` 闩锁接上，资产/设置分区改为「首次访问后保持挂载」

- **落点**：`src/views/user-center/UserSpace/UserSpaceMain.vue`（约 82 行资产、144 行设置）+ 解构处约 480 行
- **改法**（用**已有**的单源机制，不新造状态）：

  ```js
  const { currentTab, navIndicatorStyle, ensureTabMounted, mountedTabs } = useUserSpaceTabs(navItems, initialUserSpaceTab);
  ```
  ```html
  <div v-if="currentTab === 'assets' || leavingTab === 'assets' || mountedTabs.assets"
       v-show="currentTab === 'assets' || leavingTab === 'assets'" ...>
  ```
- **效果**：首次进入照旧挂载并取数（不会提前为它付费），**返回时直接复用 → 5 个请求变 0**。
- **为什么安全**（已逐项核对）：
  - `AssetsHubPanel` **没有** `setInterval` / `addEventListener`（已 grep 确认），保持挂载不会留下后台轮询；
  - 设置分区内的 `DataExportPanel` **有** `pollTimer = setInterval`，但它由内层 `settingsSection === 'data-export'` 的 `v-if` 控制，离开档位即卸载 → **只需闩锁外层 tab-page，内层 `v-if` 一律不动**；
  - `profile-panel-fade` 的 `is-leaving` 类是靠 `leavingTab` 驱动的，`v-show` 下退场动画与现在一致。

### P1-3 预载设置子档的 chunk

- **落点**：`async-loaders.js`（`preloadSettingsSubPanels()`）+ `UserSpaceMain` 的 `preloadUserSpaceTab` / `switchTab` / `route.query.tab` watcher
- **改法**：`safeTab === 'settings'` 时除 `preloadProfileStyles()` 外，追加空闲预载 `EditProfilePanel` / `DataExportPanel` / `DataPrivacyPanel`
- **预期收益**：设置主页内换档 **→ 14ms / 0 新请求**（预热生效后实测）
- ⚠️ **口径修正（落地后实测发现）**：§3.3 里「首次换档 291–313ms」这个数字**部分是测量污染** ——
  全页探针的 C 段是紧跟着「社区 tab」导航测的，而社区/论坛那一刻正在拉自己的 chunk 与数据，
  浏览器连接池被占满，小 chunk 被排队。**隔离测量（先在社区停 4 秒再跳）只要 34ms**。
  所以「设置子档慢」的真实量级是「几十 ms + 180ms 动画」，预载的价值是把那几十 ms 也省掉，
  并保证「用户在读设置主页时」chunk 已经到位 —— 不是把 300ms 变 180ms。

### P2-1 收紧设置内部的 `mode="out-in"`（需目视确认）

- **落点**：`UserSpaceMain.vue` 资产与设置两处 `<transition name="profile-panel-fade" mode="out-in">`
- **两种做法**：
  1. 保留 `out-in`，把 leave 时长压到 ~90ms（`profile-base.css` 的 `.profile-panel-fade-leave-active`）→ 收益约 −90ms/次，零重叠风险；
  2. 去掉 `out-in`，改为「新面板 enter、旧面板同时 leave」→ 收益约 −180ms/次，但**两块内容会短暂共存**，属视觉变化，需先出对照截图确认。
- **建议**：先做 1（零视觉变化），2 作为备选。

### P2-2 取数重复治理

- **落点**：各子页自身的 `onMounted` 取数（礼物/地址、BOH 云盘、PushPlus、合作伙伴）
- **改法**：统一走 `createMemoryTtlCache()`（`composables/useMemoryTtlCache.js` 已有），给「进入页面即取」的列表加 30–60s TTL
- **预期收益**：P0-1/P1 之后残余的 13 个返回请求进一步降到个位数
- **约束**：**不能**给写操作、支付、抽奖、导出状态加缓存

### 不建议做的事（本轮明确否决）

- ❌ **不给路由加全局 `<Transition>`**：上一轮实测过渡类名从未被加上（两种独立探测一致），且生产构建会剥掉 Vue 告警，「没告警」不能作为结构合法的证据；剩余怀疑点在外层 Suspense，需要专门一轮。分区/档位级过渡已经生效，视觉收益有限。
- ❌ **不给资产/设置分区直接 `v-if`→`v-show`（不加闩锁）**：会让 `AssetsHubPanel` 在进入 UserSpace 时就挂载取数，**提前付费**，是回归。
- ❌ **不从 SW 预缓存再动 CSS**：上一轮已完成的「壳样式留预缓存 + 路由样式运行时 CacheFirst」是一对，动任一半都会造成「路由能切过去但无样式」。

---

## 7. 样式安全与不变量（不可违反）

1. **入口 CSS 保持 render-blocking `<link>`**；禁改成动态 `import()` / `preload+onload` 取巧；禁把骨架 `<style>` 外置。
2. 本方案的 P1-1（加 keepAlive）**不会新增 chunk 拆分**，因此不引入新的路由 CSS；若后续再拆，新 chunk 必须留 Vite `__vitePreload` 包装（默认行为），并由 `check:shell-precache` 断言 C 守住「每条路由 CSS 有归宿」。
3. 分区/档位切换的样式由 `shell-community.css` 单源提供（`.tab-page` / `.is-leaving` / `.tab-transition-forward|back`），带 `contain: layout paint` 与 `prefers-reduced-motion` 降级，**不要绕过它另写一套**。
4. 改动 `App.vue` 的 RouterView 结构后必须跑 `check:first-paint` 与 `check:shell-precache`（路由 CSS 归宿）。

---

## 8. 预期收益汇总

| 优化项 | 指标 | 现状 | 预期 | 依据 |
|---|---|---|---|---|
| **P0-1** | 返回 UserSpace 数据就位（限速） | 3.2–4.0s | **0.58–1.12s（−72%~−82%）** | 实测实验 |
| **P0-1** | 返回期间数据请求 | 142–188 | **13（−93%）** | 实测实验 |
| **P0-1** | `.user-space-page` 跨路由复用 | 0/9 | **9/9** | 实测实验 |
| **P0-1** | 子路由二次进入请求合计 | 40 | **15** | 实测实验 |
| **P1-1** | 5 条子路由二次进入 | 重建 + 1–3 请求 | **复用 + 0 请求** | 机制推导（P0-1 实验已见趋势） |
| **P1-2** | 切回「资产」请求数 | 5 | **0** | 机制推导 |
| **P1-3** | 设置子档首次换档 | 291–313ms | **约 180ms** | 实测（180ms 为动画时长） |
| **P2-1** | 资产/设置换档 | 含 180ms 串行等待 | **−90ms/次** | 实测动画时长 |
| — | 同路由分区/档位切换 | 中位 7–26ms、切回 0 请求 | **保持**（已达标，不动） | 实测 |

**用户可感知的一句话**：改完之后，「从用户空间点进某个子页、再点回来」会从「要等 3~4 秒内容才长出来」变成「几乎立刻就有」，而路径中发生的网络请求少了约 93%。

---

## 9. 验证与回归清单

```bash
# 构建（不要用 build:ci —— 它会覆盖 dist 既有产物）
npx vite build --outDir dist-check

# 端到端
node scripts/probes/probe-userspace-pages.mjs 'http://[::1]:4180' /tmp            # 全页面：内容可见、无报错、shell 复用
ONLY=roundtrip node scripts/probes/probe-userspace-pages.mjs 'http://[::1]:4180' /tmp --slow
node scripts/probes/probe-userspace-switch.mjs 'http://[::1]:4180'                # 分区切换逐层节点身份
node scripts/probes/probe-route-switch.mjs 'http://[::1]:4180'                    # 20 条路由主内容可见性巡检

# 单测与门禁
npx vitest run
node scripts/check-first-paint.mjs
DIST_DIR=dist-check node scripts/check-shell-precache.mjs
node scripts/check-important-budget.mjs && node scripts/check-liquid-glass.mjs
node scripts/check-project-structure.mjs && node scripts/check-view-collisions.mjs
bash scripts/check-bundle-size.sh dist-check
```

**回归风险点**：
1. `boundaryKey` 语义变窄 → 必须加强 `global-error-boundary.test.js` 守卫并反证；
2. 加 keepAlive 的页面若有「每次进入需刷新」的隐含预期 → 需在页面内补 `onActivated` 刷新（当前各页无此逻辑）；
3. 资产/设置闩锁 → 需确认内层 `v-if` 未被一并改成常驻（尤其 `DataExportPanel` 的轮询）。

---

## 附录 A：本轮新增/改动的脚本

| 文件 | 说明 |
|---|---|
| `scripts/probes/probe-userspace-pages.mjs` | **新增**：全页面切换审计（A 分区 / B 档位 / C 子路由 / C-3 往返），含登录守卫与 `display:contents` 两个坑的注释 |
| `src/App.vue` | 修正 RouterView 旁**过期注释**（原先描述了一个并不存在的 `<Transition>`，并指向已删除的探针文件） |

## 附录 B：落地结果（同日实施与验收）

### B.1 改动清单

| 文件 | 改动 |
|---|---|
| `src/App.vue` | 新增 `boundaryErrored`；换页面时**只有处于错误态才自增 key**（P0-1） |
| `src/views/user-center/UserSpace/UserSpaceMain.vue` | 从 composable 取出 `mountedTabs` 并接到 assets / settings 的模板上（`v-if` 闩锁 + `v-show`）；进入设置即预热子档面板（P1-2 / P1-3） |
| `src/views/user-center/UserSpace/async-loaders.js` | 新增 `preloadSettingsSubPanels()`（三块子档面板，模块说明符与 UserSpaceMain 一致以免重复 chunk）（P1-3） |
| `src/router/routes/user-space.ts` | `partners`、`settings/version` 加 `keepAlive: true`（P1-1 收窄版） |
| `tests/unit/global-error-boundary.test.js` | 新增语义守卫：换页面**不得**无条件自增 key，且错误态必须真的会被置位（防两个方向的回归） |
| `tests/unit/user-space-tabs.test.js` | 新增 4 条守卫：`mountedTabs` 必须被消费 / assets·settings 必须闩锁 / 其余三区保持裸 `v-show` / **内层档位不得被闩锁**（DataExportPanel 有轮询） |

### B.2 落地后实测（与基线同口径）

| 指标 | 基线（落地前） | 落地后 | 依据 |
|---|---|---|---|
| 返回 UserSpace：`.user-space-page` 节点复用 | **0/9** | **9/9** | `probe-userspace-pages` C-3 |
| 返回期间数据请求合计（不限速） | 142 | **8–19** | C-3 |
| 返回期间数据请求合计（限速 1.2Mbps） | 188 | **11** | C-3 `--slow` |
| 返回后「数据就位」（限速） | 3240–4003ms | **586–1218ms** | C-3 `--slow` |
| 分区「切回来」 | 平均 44ms / **14–28 请求** | **平均 13ms / 0 请求** | `probe-userspace-switch` |
| 资产分区切回请求数 | 5 | **0–1** | A 表 |
| 逐层节点身份（5 个分区） | assets/settings 的 tab-page 重建 | **5/5 shell 与 tab-page 全复用** | 逐层身份 |
| 设置内部三档二次进入 | 重建 | **复用** | C 表 |
| `partners` / `settings/version` 二次进入 | 重建 + 1–3 请求 | **复用 + 0 请求** | C 表 |
| 设置主页内换档（预热后） | 需现场拉 chunk | **14ms / 0 新请求** | 专项测量 |
| 长任务 | 0–1 个 | **0** | 全流程 |
| 单测 | 1920 通过 | **1924 通过**（新增 5 条守卫） | `vitest run` |
| 门禁 | — | **全绿**（first-paint / shell-precache / route-css 运行时 / liquid-glass / dark-tokens / important-budget 1317 / structure / views / bundle-size largest-js 420KB） | — |

### B.3 P1-1 为什么只加了两条路由

原方案建议给 5 条子路由加 `keepAlive`。落地时按「**缓存 = 数据可能变旧**」重新筛过：

| 路由 | 决定 | 理由 |
|---|---|---|
| `partners` | ✅ 加 | 分页浏览社区成员的**目录页**，缓存保住页码与已加载列表；目录更新频率低 |
| `settings/version` | ✅ 加 | 版本/预览信息与当前构建绑定，会话内不变，零新鲜度代价 |
| `tags-impressions` | ❌ 不加 | 内容由**他人的动作**产生（别人给你留印象），旧列表会被当成「功能坏了」 |
| `shared-memories` | ❌ 不加 | 内容由 **AI 写入**，用户刚生成的记忆不出现会被当作丢数据 |
| `gifts` / `note` / `account-security` / `subscriptions` | ❌ 不加 | 资产 / 安全类页面，宁可每次重新取数 |

这 7 页的往返收益已由 P0-1 兜住（返回请求 142 → 8–19），P1-1 的边际收益小、新鲜度风险真实，所以收窄。

### B.4 落地过程中的三个修正（如实记录）

1. **§3.3 的「设置子档首次 291–313ms」部分是测量污染**：全页探针紧跟社区导航测量，连接池被论坛的 chunk/图片占用。
   隔离测量为 34ms。已写回 §6 P1-3。
2. **`probe-userspace-switch.mjs` 的「每切一次 3 个请求」是假信号**：左栏品牌位用的是 `/favicon.png`（不在 `/static/` 下），
   只排除 `/static/` 会把图片算成数据请求。已把过滤器补全（png/jpg/webp/svg/ico/woff/css/js）。
3. **CommunityTab 有一个 30 秒轮询**（`setInterval(fetchCommunityUsers({force:true}), 30_000)`，成员面板挂载时启动）。
   探针某次在「订阅方案」窗口捕到 14×user_follows / 7×posts / 7×profiles 的爆发，正是它的一次 tick。
   复跑未再出现（tick 落点随运行时长漂移）。**它由 `v-if` 控制挂载、卸载即清**，不构成本次改动引入的问题，
   但它是「后台周期性取数」的存量例子，若要治理应单独列项。

### B.5 未做（及原因）

| 项 | 状态 | 原因 |
|---|---|---|
| P2-1 收紧 `mode="out-in"` | 未做 | 方案 2（去 out-in）会造成两块内容短暂共存，属视觉变化，需先出对照截图确认；方案 1（压 leave 时长）同样动动画时长。均超出「不改视觉」的约束，留给下一轮 |
| P2-2 子页取数加 TTL | 未做 | P0-1 之后返回请求已到个位数（8–19），边际收益小；且要逐页甄别「可缓存 vs 必须新鲜」，改动面大 |
| 路由级全局 `<Transition>` | 未做 | 上一轮实测过渡类名从未被加上（生产构建剥掉告警，无法自证），需要专门一轮查外层 Suspense |
| 社区成员面板 30s 轮询治理 | 未做 | 存量行为，与本次无关，建议单独列项 |
