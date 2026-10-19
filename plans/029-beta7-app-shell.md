# plans/029 · Beta7：把 BOH 彻底推向 APP 形态

> **状态**：拍板中 —— 决策 1 已拍板（2026-10-19：**保留浮岛胶囊**，见 A2），决策 2–5 待拍板；拍板后按阶段施工，每阶段单独出施工单
> **日期**：2026-10-18
> **前置阅读**：`docs/discussions/beta7-feature-discussion-2026-10-13.md`（功能向 Beta7 讨论）、`AGENTS.md` §2、`docs/gate-matrix.md`
> **本文定位**：不谈新功能，只谈**形态**。功能向的 Beta7（表情、多模态、Work generators）应当建在新形态之上，否则要返工两遍。

---

## 0. 一句话结论

**BOH 现在不是一个「不像 APP 的网站」，而是一个「穿着 APP 皮的网站」。**
Beta7 该做的不是再美化一层视觉，而是把「页面各自带导航」重构成「一个壳承载一条导航栈」——
视觉反而是这条路上最便宜、最后做的一步。

---

## 1. 洞察：先把「APP 化」拆成三件事

「往 APP 方向推」这句话可以指三件完全不同的事，混在一起谈就会做成无效功。

| 层 | 含义 | BOH 现状 | 用户感知 |
| --- | --- | --- | --- |
| **① 视觉像 APP** | 卡片、圆角、浮岛、胶囊底栏、大留白 | **已完成约 85%** | 「看着挺像」 |
| **② 交互像 APP** | 返回、手势、转场、下拉刷新、键盘 | **完成约 30%** | 「用起来别扭」 |
| **③ 架构像 APP** | 壳固定、内容压栈、单栈返回、状态保持 | **完成约 15%** | 「用久了累」 |

**关键判断：①已经够了，继续做①的边际收益接近零。**
证据：`debug-screenshots/portrait-audit-2026-10-13/01-home-top.png` 里，首页竖屏已经是「悬浮胶囊 + 分区 tab + 卡片流 + 胶囊底栏」，单看截图放到任何一个 iOS APP 截图堆里都不违和。
问题全部出在「用起来」和「跑起来」，也就是 ② 和 ③。

### 1.1 五条穿透性事实（都可复核）

**事实 1｜导航长在页面上，不在壳上。**
顶部导航、底部四席、横屏左栏全部是**按页挂载**：

- 底栏：`src/views/Home/index.vue:81`、`src/views/user-center/UserSpace/UserSpaceMain.vue:361`
- 左栏：`src/views/Home/index.vue:66`、`UserSpaceMain.vue:348`、`Profile/ProfileMain.vue`、`BOHAI/BOHAI/BOHAIMain.vue`
- 商城还有**第 4 套独立底栏**：`src/views/Shop/index.vue:197`（`.shop-bottom-nav`，4 席但席位与全局底栏不同）

后果：切 tab 时导航跟着页面一起重建/重排，原生 APP 里绝不会发生。

**事实 2｜两种滚动模型并存，返回位置恢复因此有三套机制。**
- Home / Shop / ActivitiesWall / Newsroom = **window 长文档滚动** + 页脚（网站模型）
- UserSpace / BOHAI = `height:100dvh; overflow:hidden` + 内部容器滚动（APP 模型）
- 结果：`router/index.ts:48-66` 的 `savedPosition` 只管 window；UserSpace 另有 `saveTabScrollPosition`；论坛另有 `forum-return-state.js` 存 sessionStorage。

**事实 3｜「返回」没有统一定义 —— 这是 APP 化的头号硬伤。**
- 发帖全屏编辑器（`ForumMain.vue:5167`）**不接 history**：安卓返回键会直接退出整个页面，而不是关编辑器。
- 详情 62% 只有浮层、没有 URL：活动、商品、Cloud+ 条目、抽奖（`ActivitiesList.vue:127`、`Shop/index.vue:210`、`CloudPlusMain.vue:868`、`CommunityLotteries/index.vue:514`）。刷新即丢。
- 返回按钮一半是 `router.back()`（`PostDetailMain.vue:2017`），一半是 `router.push(固定落点)`（7 处），**历史栈越走越深**。
- **无 swipe-to-go-back**；`useEdgeSwipeGesture.js` 已被写好，但只用于「右边缘左滑唤起 AI」，没用于返回。

**事实 4｜安全区 0 适配，但 `viewport-fit=cover` 已开。**
- `index.html:67` 已开 `viewport-fit=cover`
- `UnifiedNavbar/` 与 `bottom-nav.css` 内 **0 处** `env(safe-area-inset-*)`
- 后果：真机 standalone（PWA / TWA）下，顶部胶囊压状态栏、底部胶囊压 Home Indicator。这是「装到桌面就露馅」的那一类问题。

**事实 5｜视觉改不动，不是因为审美，是因为没有尺子。**
| 维度 | 现状 | 后果 |
| --- | --- | --- |
| 字号 | 220 种取值、**0 个 `--font-size-*`**、92% 用 px | 无法跟随系统字号，APP 无障碍直接不达标 |
| 圆角 | 121 种取值、25 个圆角变量名、仅 10% 走 `var()` | 统一卡片圆角要改 300+ 处 |
| 间距 | **892 种 padding**、0 个 `--space-*` | 密度调整无旋钮 |
| 层级 | 531 个 z-index、103 种取值、最高 `2147483647` | 弹层/键盘/底栏必然打架 |
| 暗色 | 7 套页面私有补丁、4,132 行、令牌化率 16.6% | 深色模式再翻一倍工作量 |

### 1.2 一块被低估的资产：灵动岛

`src/composables/useIsland.js` 已经实现了一套**优先级仲裁**（AI 岛 > 任务岛 > 通知岛）+ 自定义槽位，20+ 场景在跑。
这在原生世界里对应 Dynamic Island / Live Activity，绝大多数 Web 产品做不到。
**结论：不要推翻，要把它升级成壳的一等公民** —— 导航固定，岛浮在导航之上。

### 1.3 首屏「chrome 税」过高

竖屏首页从上到下叠了：悬浮胶囊（50px）+ 分区 tab（官方/最新/关注/新闻/活动/成员）+ 搜索框 + 签到/排序工具条。
按 `01-home-top.png` 实测视觉分区，约 **220–240px**（占 844px 屏高约 1/4）被导航与工具占用，首屏只完整呈现**约 1 张**帖子卡。
原生 APP 的同类页面通常控制在 15% 以内。这一条是「感觉不像 APP」最直观的来源。

### 1.4 参照系：X 的网页版为什么「和 APP 特别像」

用户给的标杆是 X。拆开看，X web 像 APP **不是因为视觉，而是因为它把导航做成了布局的一部分**——这恰好就是本方案的「壳」。五条手法，每条在 BOH 都能找到对应缺口：

| # | X web 的做法 | BOH 现状 | 该不该跟 |
| --- | --- | --- | --- |
| 1 | 桌面三栏（导航 / 主列 / 侧栏），移动端导航收成底部 tab；**同一套导航项、同一个选中态** | 导航按页挂载：4 份左栏 + 2 份底栏 + 商城第 4 套 | **跟**（主线 A） |
| 2 | **一套组件树，两种列数**：收窄只是少一列，DOM 结构不变 | 每个断点各写一份模板（`PostDetailMain.vue:2154` 宽屏页头 / `:2160` 窄屏作者条） | **跟**（见下方硬约束） |
| 3 | 详情有 URL；桌面弹层、移动全页，**共享同一个 URL**，刷新可还原 | 62% 详情只有浮层无 URL（活动/商品/Cloud+/抽奖） | **跟**（主线 B） |
| 4 | 顶栏吸顶显示页面名；**无 Hero、无页脚**，首屏即内容 | 浮岛不显示标题 → 各页自己写 h1；首页还有 5 列 sitemap 页脚 | **跟**（阶段 1） |
| 5 | chrome 极简，首屏 chrome 占比 < 15% | 竖屏约 220–240px / 844px ≈ 26% | **跟**（C4） |

**不该照抄的三条**（避免做成「X 复刻」）：

- X 的视觉是「分隔线 + 无卡片 + 几乎无圆角」；BOH 的液态玻璃卡片是品牌资产，抄了会变廉价。
- X 只有一种内容（帖子）；BOH 有五个重心（内容 / 活动 / AI / 消息 / 我），所以**底栏 5 席比 X 更必要**，不是过度设计。
- X 没有灵动岛。`useIsland` 的优先级仲裁（AI > 任务 > 通知）已经跑通 20+ 场景，这是 BOH 唯一能**超过** X 的地方，别削平它。

**由此追加一条硬约束（写进阶段 1 验收）**：

> **一套组件树，两种列数。** 禁止再为不同断点写第二份模板。
> 需要按「所在栏宽」自适应的组件，用 **container query**（当前全仓 `@container` 命中 **0 次**，所有自适应都靠视口媒体查询）。
> 验收方式：同一页面在 390 与 1440 下，**DOM 结构差异只允许是「少一列 / 少一条侧栏」**，不允许出现不同的头部组件。

这条约束的意义：X 的「像」是**结构收敛**的结果，不是像素对齐的结果。BOH 现在 `@media` 有 651 条、`max-width` 用了 20+ 个不同数值，本质是「每个断点手工拍一次」，结构必然分叉。

---

## 2. 与现有 Beta7 讨论的关系

`docs/discussions/beta7-feature-discussion-2026-10-13.md` 的 16 项候选里：

| 已有项 | 与本方案的关系 |
| --- | --- |
| **14 暗色补全 + 视觉收敛** | **就是本方案主线 C**，直接吸收，不另开一条 |
| 7 表情系统 / 15 多模态 / 3 Work generators | 属于「壳里的内容功能」，**必须建在新壳上** |
| 1 成长体系 / 16 声望体系 | 依赖「我」页的信息架构，本方案阶段 1 会重排，先做会白做 |
| 2 分享 / 9 SEO | 与主线 B「详情补 URL」是同一件事的两面，合并做 |

**执行建议**：
- 纯后端项（BOHAI A 模型升级）可与本方案阶段 0 **并行**，互不阻塞。
- 所有前端功能项**排在阶段 1 之后**，否则等于在旧骨架上盖二层。

---

## 3. 方案总纲：壳 / 栈 / 面

```
主线 A｜壳（Shell）  导航从页面里抽出来，成为唯一的一层
主线 B｜栈（Stack）  所有「进去看一眼」都走同一套压栈协议
主线 C｜面（Surface）四把尺子 + 一层语义暗色，让视觉从此可批量调整
```

三条主线的**依赖关系是硬性的**：A 不做，B 无处挂；C 不做，A/B 的每一刀都要手工改几百处。
所以顺序固定：**A → B → C 并行收尾**。

---

## 4. 主线 A：壳

### A1. 唯一 AppShell

新增 `src/components/AppShell/`：

```
AppShell.vue
  ├─ <AppTopBar>      顶栏（含标题、返回、右侧动作）
  ├─ <IslandHost>     灵动岛宿主（复用 useIsland，不改仲裁逻辑）
  ├─ <main class="app-scroll">  唯一滚动容器
  ├─ <AppTabBar>      底部四席（横屏时隐藏）
  └─ <AppRail>        横屏左栏（≥1024 且 ≥600 高时出现）
```

路由用 `meta.shell` 声明形态，页面**不再自己挂导航**：

| `meta.shell` | 用于 | 现有页面 |
| --- | --- | --- |
| `tab` | 有底栏的主页面 | Home、UserSpace、Shop、ActivitiesWall |
| `immersive` | 导航收成球 | BOHAI、PostDetail、影集阅读 |
| `fullscreen` | 无壳，独占 | 登录、发帖编辑器、图片查看器 |
| `bare` | 无导航 | admin、营销落地页 |

**必须遵守**：`AppShell` 是**唯一**允许出现 `position: fixed` 导航/底栏的地方。这条后面用门禁锁死（§9）。

### A2. 顶栏：竖屏与横屏均保留浮岛（✅ **已拍板 2026-10-19：保留浮岛胶囊**）

| | 现在 | 目标 |
| --- | --- | --- |
| 竖屏 | 浮岛胶囊：`height:50px`、`max-width:calc(100%-16px)`、`translateY(8px)`（`UnifiedNavbar/style.scoped.css:325-331`） | **形态不变**，只补 safe-area：胶囊顶部偏移改 `max(8px, calc(env(safe-area-inset-top) + 8px))`，standalone 下整体下移到状态栏之下 |
| 横屏 ≥1024 | 浮岛 860×58 居中 | **保持不变**（浮岛是桌面品牌资产） |

> **拍板留档**：原「竖屏改通栏」建议（390 宽悬空、与状态栏割裂）被用户否决（2026-10-19）——**悬浮胶囊是产品要的形态，不改**。原判断「浮岛无法承载 safe-area」仍然成立，但改用折中解，二选一（施工单定）：
> ① 胶囊下移 `env(safe-area-inset-top) + 8px`，状态栏区域加衬底（纯色/渐变/模糊，观感细节施工时定）；
> ② 回退 `viewport-fit=cover`（`index.html:67`），系统自留状态栏区——实现最简，代价是 standalone 顶/底出现系统底色、稍欠沉浸。

**连锁影响**：
- A3 底部安全区（`--safe-bottom`，底栏让开 Home Indicator）**不受本拍板影响，照做**；
- 「标题上收进顶栏」原绑定通栏，胶囊内空间有限 ⇒ **搁置/另议**（新增待拍板小项）；
- `vendor/unified-nav.css` 145 处 `!important` 清零原是改形态的前置 ⇒ **降级为非必需**（只调偏移量，不动形态）；
- §10 现有探针大多锚在浮岛几何上 ⇒ **探针基线重建压力大幅下降**。

### A3. 安全区一次到位

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```
- 顶栏 `padding-top: var(--safe-top)`
- 底栏 `padding-bottom: var(--safe-bottom)`，可视高度 56px 不含 inset
- 内容区 `padding-bottom: calc(56px + var(--safe-bottom))`
- 全站只此一处，页面内现有的 36 处 `env(safe-area-inset-top)` 与 77 处 `-bottom` 逐步收编

### A4. 统一滚动模型

目标：**所有 `tab` 形态页面 = `100dvh` + 壳内 `.app-scroll` 滚动**。
收益：
- 返回位置恢复只需管一个容器，三套机制合成一套
- 底栏不再被键盘顶起（现在是各页自己藏）
- `position: fixed` 可从 149 处大幅收敛

代价与顺序：Home 的「开场画跟手揭开」依赖 `position:fixed` + `touch-action:none`（`Home/style.scoped.css:75-101`），**先改 Home 风险最高**，建议从 ActivitiesWall / Shop 这两个纯文档流页面先试，Home 放最后。

### A5. 左栏升级为壳的 rail 形态

- 现状：4 个页面各挂一份 `UserSpaceSideRail`，`≥1024px + ≥600px 高` 才显示（`side-rail.css:22`）
- 目标：由壳统一渲染，页面只声明「当前项」
- **补一个洞**：手机横屏（如 844×390）现在**两头空** —— 底栏被 `(orientation: landscape)` 关掉（`Home/style.scoped.css:206-210`），左栏要求 `min-width:1024`（`side-rail.css:22`）。这一档要么给 rail 要么给底栏，不能没有。

---

## 5. 主线 B：栈

### B1. 统一「详情」协议

新增一个入口，替掉现在 5 套各写各的浮层：

```js
openSurface(kind, id, { from, present: 'push' | 'sheet' | 'overlay' })
```

| `present` | 语义 | 用于 | 现在 |
| --- | --- | --- | --- |
| `push` | 整页路由，可深链、可分享 | 帖子、新闻、他人主页、影集 | 已有 |
| `sheet` | 底部弹层，可下滑关闭 | 商品、活动、抽奖、评论 | 各自实现，无手势 |
| `overlay` | 从原点放大展开 | Cloud+ 相册条目、图片查看器 | 已有（`--detail-origin-x/y`） |

**硬要求**：`push` 与 `sheet` 都**必须写 URL**（query 或 hash 子路由），保证「刷新不丢、能分享」。
现状 4 类只有浮层的内容（活动/商品/Cloud+/抽奖）在此补齐。

### B2. 返回语义唯一

```js
// 唯一实现，禁止页面自己判断
goBack() {
  if (internalStack.depth > 0) return internalStack.pop()
  if (history.state?.back) return router.back()
  return router.push(tabRootOf(currentTab))   // 兜底回 tab 根，不新增历史
}
```
- **禁止** `router.push(固定落点)` 当返回（现在 7 处：`Partners.vue:419`、`PushplusSettingsPage.vue:28`、`AccountSecurity/index.vue:558`、`CloudPlusMain.vue:1237`、`ShopAccountPanel.vue:369`、`NewsDetailPage.vue:100`、`BlockWall/index.vue:461`）
- 任何全屏层/弹层打开时 `history.pushState` 一个哨兵，`popstate` 关层 —— 现在**只有** `usePostDetailModal.js:43` 这么做，发帖编辑器、购物袋、图片查看器都要补

### B3. 手势四件套

| 手势 | 语义 | 现状 |
| --- | --- | --- |
| 左边缘右滑 | 返回 | **无**（`useEdgeSwipeGesture` 已有，反向复用即可） |
| sheet 下滑 | 关闭 | **无**（grabber 只是装饰：`Shop/style.scoped.css:872`） |
| 下拉 | 刷新列表 | **无**（首页/论坛/消息三个列表最需要） |
| 长按 | 上下文菜单（帖子/评论） | **无** |

### B4. 每 tab 独立栈（**需拍板**）

原生 APP 切 tab 会保留各自的历史与滚动位置。现在是单栈 `router.push`。
- 完整方案：每个 tab 一个 `history` 分支（工程量大，需自研或改路由层）
- 简化方案：**记住每 tab 的最后路由 + 滚动位置**，切回时恢复（UserSpace 已有 `saveTabScrollPosition`，推广到四席）
- 建议先做简化方案，观察真实使用再决定是否上完整方案

---

## 6. 主线 C：面

### C1. 四把尺子（新增令牌，唯一来源）

```css
:root {
  /* 字阶 7 档 —— 替代 220 种取值 */
  --fs-caption: 11px; --fs-footnote: 12px; --fs-body-sm: 13px;
  --fs-body: 15px; --fs-title: 17px; --fs-headline: 20px; --fs-display: 24px;

  /* 圆角 5 档 —— 替代 121 种取值 */
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 20px; --r-full: 999px;

  /* 间距 8 档 —— 替代 892 种 padding */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;

  /* 层级 7 层 —— 替代 103 种 z-index */
  --z-base: 0; --z-sticky: 10; --z-tabbar: 100;
  --z-sheet: 200; --z-overlay: 300; --z-modal: 400; --z-toast: 500;
}
```

**落地策略（关键，别搞成一次性大重构）**：
1. 新代码必须用令牌 —— 用 lint 规则 + 门禁锁死
2. 旧代码**不强制替换**，但在**每次改到该文件时顺手替换**（搭便车）
3. 棘轮只降不升：每个维度记录当前字面量总数，只允许下降

### C2. 暗色：7 套补丁 → 1 层语义

现状：`src/styles/themes/` 8 个文件 4,132 行，93.9% 是页面私有补丁，902 个裸色，令牌化率 16.6%。
且 `src/utils/theme-css-loader.js` **一次性加载全部 8 个文件**，暗色首屏多拉 4,132 行。

目标结构：
```
tokens.css        亮色 :root
themes/dark.css   仅 [data-theme=dark] 覆写语义变量（4 组 × 3 阶）
                  --surface-{1,2,3} / --text-{1,2,3} / --border-{1,2} / --accent
```
组件只读语义变量，**永不写裸色**。

三步走：① 立语义层并让新代码用；② 按页迁移（论坛 → 帖子详情 → 用户空间 → BOHAI）；③ 删补丁文件。
门禁：`scripts/dark-gate-scopes.json` 的 `strict` 名单**从空数组开始填**，每迁完一页加一个，该页裸色必须为 0。

### C3. 字号跟随系统

- 竖屏正文基准从 12/13px 提到 **15px**（现在明显偏小，`12px` 有 648 处、`11px` 有 349 处）
- 关键文本改 `rem`，`html { font-size: 100% }`
- 加 `-webkit-text-size-adjust: 100%`，**不要**用 `user-scalable=no`（`index.html:67` 已经是 `user-scalable=yes`，保持）

### C4. 首屏 chrome 收敛（视觉上最直观的一刀）

| | 现在 | 目标 |
| --- | --- | --- |
| 顶部 | 胶囊 50 + 分区 tab + 搜索 + 签到工具条（≈220–240px） | **胶囊保留（A2 拍板）+ safe-area 偏移**；分区 tab 滚动时收起；搜索进顶栏图标 |
| 首屏内容 | ≈1 张帖子卡 | ≥2 张 |
| 页脚 | 首页 5 列 sitemap 页脚（`HomeFooter.vue:5-40`） | **删除**（APP 没有 sitemap 页脚） |

顺带清理：`App.vue:398` 全局挂载的 `Footer.vue` 自己写了 `display:none`（`Footer.vue:31-33`），`footer.css` 的 `.footer-home` 无任何使用者 —— 都是残留，一并删。

---

## 7. 阶段划分（按依赖排序，非时间估算）

| 阶段 | 内容 | 体量 | 前置 |
| --- | --- | --- | --- |
| **0 地基** | 四把尺子令牌 + AppShell 骨架 + 安全区 + `--safe-*` | **L** | — |
| **1 导航重写** | 顶栏保浮岛补 safe-area（A2 已拍板）+ 底栏进壳 + rail 进壳 + 首屏 chrome 收敛（标题上收另议） | **L** | 0 |
| **2 栈协议** | `openSurface` + `goBack` + 详情补 URL + 全屏层接 history | **L** | 1 |
| **3 原生感** | 转场（push/pop）+ 下滑关闭 + 下拉刷新 + 长按菜单 | **M** | 2 |
| **4 桌面衍生** | rail 三态 + 双栏详情统一 + 手机横屏补位 | **M** | 1 |
| **5 收口** | 暗色收敛（C2）+ 删页脚 + 探针补齐 + 门禁上线 | **M** | 1–4 |

**阶段 0 内部顺序**（先低风险验证）：
1. 令牌（纯新增，零风险）
2. 安全区（纯新增，零风险）
3. AppShell 骨架只接 **ActivitiesWall + Shop**（两个纯文档流页面，最干净）
4. 验证通过后再接 Home / UserSpace

---

## 8. 需要拍板的 5 个决策

| # | 决策 | 选项 | 建议 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | 竖屏顶栏形态 | 通栏 / 保留浮岛 | ✅ **已拍板（2026-10-19）：保留浮岛** | 用户明确要悬浮胶囊；safe-area 走 A2 折中解，底部安全区照做 |
| 2 | 底栏席位 | 4 / 5 | **5**（内容 / 活动 / AI / 消息 / 我） | 活动现在埋在分区 tab 里，是站内第二重心；4 席挤不下 |
| 3 | 详情默认呈现 | sheet 优先 / push 优先 | **可分享的 push，其余 sheet** | 保证刷新与分享，同时保留轻快感 |
| 4 | 桌面端定位 | 壳的 rail 形态 / 独立桌面体验 | **壳的 rail 形态** | 一份代码一套心智；独立体验会让每次改动都要做两遍 |
| 5 | 是否上 Capacitor / 原生壳 | 上 / 不上 | **不上** | PWA + TWA 已就绪（`android-twa/*.json`、`vite.config.js:406-441`）；上原生壳要重做推送、支付、审核，成本远超收益 |

---

## 9. 明确不做

| 不做 | 理由 |
| --- | --- |
| 全量重写 11,320 个裸色 | 收益/风险比极差；用「新代码强制 + 搭便车替换 + 棘轮」替代 |
| 引入 UI 框架（Vant / NutUI） | 现有液态玻璃与动效体系是品牌资产，框架会推翻它 |
| 改品牌色 / 液态玻璃材质 | 与本目标无关，`check:liquid-glass` 门禁已锁 |
| 动 BOHAI 交互 | 它已经是全站最像原生的一页（去顶栏 + 球态 + 输入框 FLIP），别修好的 |
| 改 `useIsland` 仲裁逻辑 | 优先级（AI > 任务 > 通知）是经过验证的，只升级宿主不改仲裁 |

---

## 10. 验收：新增探针与门禁

现有探针（`probe-home-forum-rail` 21、`probe-rail-landing` 45、`probe-composer-session-gate` 26、`probe-global-search` 58 等）**全部依赖当前几何**，改造期必然大面积红。必须先建新基线，再动结构。

### 新增探针

| 探针 | 断言要点 |
| --- | --- |
| `probe-app-shell.mjs` | 切 tab 时导航 DOM **不重建**（MutationObserver 计数）；壳是唯一滚动容器；`position:fixed` 的导航只在壳内出现 |
| `probe-safe-area.mjs` | 模拟 `safe-area-inset-*` 非 0 时，顶栏内容不进入状态栏区、底栏内容不进入手势区 |
| `probe-back-stack.mjs` | 发帖编辑器/购物袋/图片查看器打开时按返回 → **只关层不退页**；`history.length` 不增长 |
| `probe-sheet-gesture.mjs` | 下滑超过阈值关闭；未达阈值回弹；关闭后焦点回到触发元素 |
| `probe-responsive-parity.mjs` | 同一页面在 390 / 834 / 1440 三档下，**头部组件的 class 序列必须一致**（允许少列，不允许换组件）；违反即红 |

### 新增门禁（全部带 fixture，`check:gates-self-test` 可自证）

| 门禁 | 规则 |
| --- | --- |
| `check:app-shell` | `src/views/**` 内禁止出现 `position:fixed` 的导航/底栏（白名单：AppShell 目录） |
| `check:z-index` | 只允许 `var(--z-*)`，禁止裸数字（存量棘轮，只降不升） |
| `check:font-size` | 新增/修改的文件禁止裸 px 字号（存量棘轮） |
| `check:no-footer` | 新页面禁止挂页脚 |

---

## 11. 主要风险

| 风险 | 触发点 | 缓解 |
| --- | --- | --- |
| Home 开场画被打断 | `Home/style.scoped.css:75-101` 依赖满屏 `position:fixed` + `touch-action:none` | Home **最后**接壳；先 ActivitiesWall / Shop 验证 |
| 顶栏改造撞 `!important` 墙 | `vendor/unified-nav.css` 145 处 `!important` | **已解除**（2026-10-19 拍板保留浮岛，不改形态只调偏移量）；若后续仍要清零，单独一个 PR |
| 探针集体红 | 上述 5 个探针共 166+ 条断言依赖当前几何 | 先建新基线（壳存在时的正确几何），再改结构；红不代表回归 |
| 第 4 套底栏被遗忘 | `Shop/index.vue:197` 的 `.shop-bottom-nav` | 阶段 1 直接删掉，商城并入全局五席 |
| 键盘适配三套并存 | `--kb-inset` / `--pd-dock-inset` / `--boh-visual-height` | 阶段 2 收敛为 `--kb-inset` 一套，PostDetail 与 Login 跟随 |

---

## 12. 建议的下一步

1. **拍 §8 剩余 4 个决策**（决策 1 已拍板 2026-10-19：保留浮岛；决策 2 底栏席位决定阶段 1 的全部工作量）
2. 拍板后把本文拆成 `plans/030-app-shell-stage0.md` 施工单（含逐文件改动清单）
3. 阶段 0 与「BOHAI 模型升级」（纯后端）并行，互不阻塞
4. 所有前端功能项（表情、多模态、Work generators）等阶段 1 完成后再排
