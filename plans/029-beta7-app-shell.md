# plans/029 · Beta7：把 BOH 彻底推向 APP 形态

> **状态**：拍板中 —— 决策 1 已拍板（2026-10-19：**保留浮岛胶囊**，见 A2），决策 2–8 待拍板；拍板后按阶段施工，每阶段单独出施工单
> **日期**：2026-10-18（**2026-10-19 增补 §2 设计宪法、§8 主线 D、决策 6–8**；**同日二轮复核**：/lab、BlockWall、Partners 退场后全量重测；**同日三轮实测**：依 Apple HIG 综述文档逐条走查，新增 §2.5 检查点实测对照表、§2.6 Hierarchy/Harmony 证据化、**D6 键盘可达 / D7 表单命名 / D8 全局反馈通道**三条新主线，并**更正 D2/D4/D5 三处口径错误**；**同日四轮**：依 Apple Music / App Store / 零售店 / Developer Forums / Apple Intelligence 五张脸补产品形态层，新增 **§2.7 可迁移结构、§2.8 论坛推演、§2.9 AI 推演**，决策增至 **13 个**（新增 9 策展接回 feed / 10 Q&A 语义 / 11 AI 披露口径 / 12 AI 席位 / 13 hot_score 去留）—— 详见各处「2026-10-19 三轮/四轮」标注）
> **前置阅读**：`docs/discussions/beta7-feature-discussion-2026-10-13.md`（功能向 Beta7 讨论）、`AGENTS.md` §2、`docs/gate-matrix.md`
> **本文定位**：不谈新功能，只谈**形态**与**判据**。功能向的 Beta7（表情、多模态、Work generators）应当建在新形态之上，否则要返工两遍。

---

## 0. 一句话结论

**BOH 现在不是一个「不像 APP 的网站」，而是一个「穿着 APP 皮的网站」。**
Beta7 该做的不是再美化一层视觉，而是把「页面各自带导航」重构成「一个壳承载一条导航栈」——
视觉反而是这条路上最便宜、最后做的一步。

补一句 2026-10-19 的修正：**「像 APP」还有第四个维度 —— 能不能被所有人用。**
前三个维度（视觉 / 交互 / 架构）解决「像不像」，第四个维度（可感知 / 可访问 / 可恢复）解决「成不成」。
Apple 的 HIG 不是给本文加一层美学形容词，而是给 A/B/C 三条主线一把**取舍尺子**：每一刀砍下去，都要能回答「这让人更容易理解、更容易恢复、还是只是更漂亮」。

---

## 1. 洞察：先把「APP 化」拆成四件事

「往 APP 方向推」这句话可以指四件完全不同的事，混在一起谈就会做成无效功。

| 层 | 含义 | BOH 现状 | 用户感知 |
| --- | --- | --- | --- |
| **① 视觉像 APP** | 卡片、圆角、浮岛、胶囊底栏、大留白 | **已完成约 85%** | 「看着挺像」 |
| **② 交互像 APP** | 返回、手势、转场、下拉刷新、键盘 | **完成约 30%** | 「用起来别扭」 |
| **③ 架构像 APP** | 壳固定、内容压栈、单栈返回、状态保持 | **完成约 15%** | 「用久了累」 |
| **④ 可用像 APP** | 触控目标、焦点、读屏、减少动效、状态可感知、错误可恢复 | **完成约 10%** | 「有些人根本用不了」 |

**关键判断：①已经够了，继续做①的边际收益接近零。**
证据：`debug-screenshots/portrait-audit-2026-10-13/01-home-top.png` 里，首页竖屏已经是「悬浮胶囊 + 分区 tab + 卡片流 + 胶囊底栏」，单看截图放到任何一个 iOS APP 截图堆里都不违和。
问题全部出在「用起来」「跑起来」和「用不了」，也就是 ②③④。

### 1.1 五条穿透性事实（都可复核）

**事实 1｜导航长在页面上，不在壳上。**
顶部导航、底部四席、横屏左栏全部是**按页挂载**：

- 底栏：`src/views/Home/index.vue:81`、`src/views/user-center/UserSpace/UserSpaceMain.vue:361`
- 左栏：`src/views/Home/index.vue:66`、`UserSpaceMain.vue:348`、`Profile/ProfileMain.vue`、`BOHAI/BOHAI/BOHAIMain.vue`
- 商城还有**第 4 套独立底栏**：`src/views/Shop/index.vue:298`（`.shop-bottom-nav`，4 席但席位与全局底栏不同）

后果：切 tab 时导航跟着页面一起重建/重排，原生 APP 里绝不会发生。

**事实 2｜两种滚动模型并存，返回位置恢复因此有三套机制。**
- Home / Shop / ActivitiesWall / Newsroom = **window 长文档滚动** + 页脚（网站模型）
- UserSpace / BOHAI = `height:100dvh; overflow:hidden` + 内部容器滚动（APP 模型）
- 结果：`router/index.ts:48-66` 的 `savedPosition` 只管 window；UserSpace 另有 `saveTabScrollPosition`；论坛另有 `forum-return-state.js` 存 sessionStorage。

**事实 3｜「返回」没有统一定义 —— 这是 APP 化的头号硬伤。**
- 发帖全屏编辑器（`ForumMain.vue:5182`，`isMobileComposerOpen` 的 `.mobile-composer-overlay`）**不接 history**：安卓返回键会直接退出整个页面，而不是关编辑器。
- 详情 62% 只有浮层、没有 URL：活动、商品、Cloud+ 条目、抽奖（`ActivitiesList.vue:127`、`Shop/index.vue:327` 的 `selectedProduct` 浮层、`CloudPlusMain.vue:2927` 的 `openEntry`、`CommunityLotteries/index.vue:514`）。刷新即丢。
- 返回按钮一半是 `router.back()`（`PostDetailMain.vue:2017`），一半是 `router.push(固定落点)`（**2026-10-19 复核后 5 处**，原 7 处中 Partners、BlockWall 两处已随当日退场删除，见 B2），**历史栈越走越深**。
- **无 swipe-to-go-back**；`useEdgeSwipeGesture.js` 已被写好，但只用于「右边缘左滑唤起 AI」，没用于返回。

**事实 4｜安全区 0 适配，但 `viewport-fit=cover` 已开。**
- `index.html:67` 已开 `viewport-fit=cover`
- `UnifiedNavbar/` 与 `bottom-nav.css` 内 **0 处** `env(safe-area-inset-*)`
- 后果：真机 standalone（PWA / TWA）下，顶部胶囊压状态栏、底部胶囊压 Home Indicator。这是「装到桌面就露馅」的那一类问题。

**事实 5｜视觉改不动，不是因为审美，是因为没有尺子。**
| 维度 | 现状 | 后果 |
| --- | --- | --- |
| 字号 | **97 种取值**、**0 个 `--font-size-*`**、约 96% 用 px（实测 `font-size` 声明 **3,376 处**，px 3,229 / `rem` 仅 135） | 无法跟随系统字号，APP 无障碍直接不达标 |
| 圆角 | 121 种取值、25 个圆角变量名、仅 10% 走 `var()` | 统一卡片圆角要改 300+ 处 |
| 间距 | **892 种 padding**、0 个 `--space-*` | 密度调整无旋钮 |
| 层级 | z-index 声明 **516 处**、**92 种取值**、最高 `2147483647` | 弹层/键盘/底栏必然打架 |
| 暗色 | 7 套页面私有补丁、4,132 行、令牌化率 16.6% | 深色模式再翻一倍工作量 |

> 字号 / 层级两行为 2026-10-19 退场后重测（口径：`font-size:\s*[\d.]+(px|rem|em|%)` 与 `z-index:` 声明，src 全量）；圆角 / 间距 / 暗色三行沿用 2026-10-18 口径，未随退场重测。

### 1.2 一块被低估的资产：灵动岛

`src/composables/useIsland.js` 已经实现了一套**优先级仲裁**（AI 岛 > 任务岛 > 通知岛）+ 自定义槽位，20+ 场景在跑。
这在原生世界里对应 Dynamic Island / Live Activity，绝大多数 Web 产品做不到。
**结论：不要推翻，要把它升级成壳的一等公民** —— 导航固定，岛浮在导航之上。

### 1.3 首屏「chrome 税」过高

竖屏首页从上到下叠了：悬浮胶囊（50px）+ 分区 tab（官方/最新/关注/新闻/活动/成员）+ 搜索框 + 签到/排序工具条。
按 `01-home-top.png` 实测视觉分区，约 **220–240px**（占 844px 屏高约 1/4）被导航与工具占用，首屏只完整呈现**约 1 张**帖子卡。
原生 APP 的同类页面通常控制在 15% 以内。这一条是「感觉不像 APP」最直观的来源。

> 2026-10-19 渲染复核（Playwright，390×844，本地 dev）：`.unified-nav` 固定层实测高 **78px**；分区 tab 每个 **34×39**；首张帖子卡顶边距视口顶 **约 339px**（含开场画未退场的中间态，取上界）。数字会随登录态/内容高度浮动，但「首屏只放得下 1 张卡」这个结论稳定。

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
> 需要按「所在栏宽」自适应的组件，用 **container query**（当前全仓 `@container` 命中 **0 次**，所有自适应都靠视口媒体查询；`@media` **656 处 / 184 文件**，2026-10-19 复测）。
> 验收方式：同一页面在 390 与 1440 下，**DOM 结构差异只允许是「少一列 / 少一条侧栏」**，不允许出现不同的头部组件。

这条约束的意义：X 的「像」是**结构收敛**的结果，不是像素对齐的结果。BOH 现在 `@media` 有 **656** 条、`max-width` 用了 20+ 个不同数值，本质是「每个断点手工拍一次」，结构必然分叉。

---

## 2. 设计宪法：Apple HIG 作为取舍尺子（2026-10-19 新增）

> **这一章不是视觉方案，是判据。** A/B/C 三条主线负责「怎么改」，本章负责「改到哪算对、哪一刀不该砍」。
> 依据：Apple Human Interface Guidelines 的 Design principles 页、经典三支柱（Clarity / Deference / Depth）、iOS 26 起的 Liquid Glass 治理原则、visionOS 空间设计要点。
> **纪律**：本章每条判据都必须能落到一个可测量的断言上；落不到的，不进本章（宁可不写，不写口号）。

### 2.0 根本前提：Apple 管它叫 Human Interface，不是 User Interface

Apple 设计布道师 Mike Stern 在 WWDC17 解释过这个用词：*User 会产生临床化、匿名化的效果，而 Human 唤起的是更丰富、更有质感的画面；界面设计根本上是为人类服务。目标不是把 App 做得漂亮、工整或简单 —— 那些虽然重要，但不是真正的目标。*

对 Beta7 的三条硬推论：

1. **验收单位是「人的处境」，不是「页面截图」。** 所以 §12 的探针必须测行为（点得到吗、退得出吗、读屏念得对吗），不能只测几何与配色。
2. **视觉收敛（主线 C）是手段，不是目标。** Beta7 不能以「截图更像 iOS」结项；C 的价值在于让后续每一次调整有旋钮。
3. **每一刀都要能回答「满足了哪一种真实需求」** —— 安全与可预测 / 知识与意义 / 成就与掌控 / 美与愉悦。施工单里加一行「需求归因」，写不出就先别动。

### 2.1 经典三支柱 → 三条主线的对应关系

| 支柱 | 一句话判据 | 对应主线 | BOH 最痛的一处（可复核） |
| --- | --- | --- | --- |
| **Clarity 清晰** | 功能本身是视觉主角，不是风格表达 | C1 / C3 / D4 | 3,229 处裸 px 字号、97 种取值（2026-10-19 重测）；分区 tab 点击区 34×39 |
| **Deference 退让** | UI 帮人消费内容，从不与内容竞争 | C4 / A / D5 | 首屏 chrome ≈ 26%；页脚、工具条、浮岛同时抢注意力 |
| **Depth 纵深** | 用空间关系降低认知成本，不是拟物回潮 | B1 / B3 / 阶段 3 | 62% 详情只有浮层、无 URL；转场缺失导致「层级说不清」 |

> 一句话记法：**Clarity 管「看得清」，Deference 管「不挡路」，Depth 管「知道自己在第几层」。**
> 三者冲突时，优先级是 **Deference > Clarity > Depth** —— 内容永远赢；清晰是底线；纵深是锦上添花。

### 2.2 当代八原则 → BOH 的逐条承诺

Apple 明确说这八条不是机械规则，而是**在竞争性优先级之间做取舍的工具**。所以下表每一行都必须给出「BOH 的具体动作」，否则不成立。

| # | 原则 | Apple 判据 | BOH 现状证据 | Beta7 承诺（可验收） | 落点 |
| --- | --- | --- | --- | --- | --- |
| 1 | **Purpose 目的性** | 先有意图，把最重要的一件事做到卓越 | 功能候选 16 项，形态与功能混在一起谈 | Beta7 只做形态；每个施工单首行写「它服务于哪一件事」，写不出不立项 | 全阶段 |
| 2 | **Agency 自主性** | 给人行动自由、状态透明、**容易从错误中恢复** | 28 个文件里 **39 个 `<Teleport to="body">` 全屏层**；全仓仅 **2 个文件 5 处** `inert`（AnniversaryCafe / Join）；`CommonAlertModal` 无 `role`/`aria-modal`/`aria-labelledby`（2026-10-19 复测确认） | 所有模态统一 `useModalLayer`：焦点陷阱 + 背景 inert + Esc 关闭 + 关闭后焦点回触发元素 | **D2** |
| 3 | **Responsibility 责任感** | 安全与隐私优先；无障碍**从第一天**做 | axe 基线 **72 处 serious 对比度**违规（首页 26 / 论坛 26 / 关于 18 / 摄影集 1 / AI 1），且只覆盖 **5 个公开页**；`forced-colors` **0 处**、`prefers-contrast` 仅 3 处 | 覆盖面 5 → 12 页；存量只降不升；补 `forced-colors` 降级 | **D1 / D5** |
| 4 | **Familiarity 熟悉性** | 建立在人已知的概念上，并**一致地**应用 | 4 份左栏 + 2 份底栏 + 商城第 4 套底栏；5 处 `router.push(固定落点)` 当返回（原 7 处，两处已随退场删除） | 导航进壳、返回语义唯一（`goBack()` 单实现） | A / B2 |
| 5 | **Flexibility 灵活性** | 承认自己的体验不是所有人的体验 | `@container` **0**、`@media` **656**、`max-width` 20+ 个值；手机横屏（844×390）底栏关、左栏不开 ⇒ **两头空** | container query 为默认；横屏补一档（rail 或底栏，二选一） | A5 / C |
| 6 | **Simplicity 简洁性** | 每个元素都**挣得它的位置**；对立面是无目的的复杂 | `position: fixed` **154 处 / 88 文件**；`z-index` **516 处**、92 种取值；`transition: all` **156 处**（2026-10-19 复测） | 壳是唯一 fixed 导航；z-index 只允许 `var(--z-*)`；删首页 sitemap 页脚 | C1 / C4 / 门禁 |
| 7 | **Craft 工艺** | 用户能感知的地方不妥协，感知不到的地方也不敷衍 | ✅ 已做对：reduce-motion 降级保留 300ms 纯 opacity 反馈（`animations.css:1028`）；❌ 缺口：**1,256 个 button 中 217 个纯图标，58 个无任何可访问名**（用户端 24 / 后台 34）；44×44 未成体系 | 图标按钮必须有可访问名；触控热区 ≥44×44（可用 `::after` 扩热区，不改视觉尺寸） | **D4** |
| 8 | **Delight 愉悦** | 在正确的时刻给恰如其分的情感回应，不是塞彩蛋 | ✅ 灵动岛 20+ 场景；❌ `navigator.vibrate` 仅 4 处且 **iOS Safari 不支持** | 情感回应优先走「岛 + 动效 + 文案」；**不承诺 iOS 触感**，不堆庆祝动画 | 阶段 3 |

**八原则在本仓的优先级排序（写死，避免每次重新吵）**：

```
Responsibility > Agency > Simplicity > Clarity > Familiarity > Flexibility > Craft > Delight
```

理由：前三条决定「能不能用」，中间三条决定「好不好用」，后两条决定「愿不愿意再用」。**Delight 永远排在最后** —— 一个读屏念不出按钮名的产品，动效再顺也是负分。

### 2.3 Liquid Glass 三条治理原则 → 与 BOH 品牌玻璃的裁决

iOS 26 起 Liquid Glass 是**编译基线**，不是可选皮肤。它的三条治理原则对 BOH 直接可用，但**必须处理一处真实冲突**。

#### Hierarchy（层级）—— 唯一一条不可违反的结构规则

> **Liquid Glass 专属于导航/控制层，绝不应用于内容本身**：不要玻璃列表、玻璃卡片、玻璃表格单元格、玻璃媒体容器；玻璃叠玻璃明确不鼓励。

**BOH 现状**：`.liquid-glass` 类在 **13 个 `.vue`** 中使用，其中 `SubscriptionPlans.vue`(9)、`AIPlaza/index.vue`(8)、`Download/index.vue`(12)、`CloudPlusMain.vue`(4)、`ActivityCard.vue`(1) 属于**内容型卡片**。
**裁决（建议 C，见决策 6）**：

| 层 | 允许的材质 | 例子 |
| --- | --- | --- |
| 控制层（导航、工具条、浮层、弹窗、岛） | 液态玻璃（现状不变） | 浮岛、底栏、左栏、灵动岛、sheet |
| 展示型内容（营销页、定价页、活动封面） | 玻璃**只做外框/背景**，文字块必须落在实底上 | Download、SubscriptionPlans、AIPlaza 卡片 |
| 阅读型内容（帖子正文、评论、表格、媒体容器） | **禁止玻璃**，一律实底或 ≥0.92 不透明 | 论坛卡片、帖子详情、消息列表 |

**判据（可测量）**：内容容器内文本的实际对比度由 axe 判定；同时新增源码门禁 `check:glass-on-content`，白名单 + 棘轮，新增违规即红。

#### Harmony（和谐）—— 同心圆角

> 软件几何与硬件几何对齐：嵌套元素共享圆心，圆角半径向屏幕圆角一致递进。

**BOH 现状**：121 种圆角取值、25 个变量名、仅 10% 走 `var()`；`.liquid-glass` 默认 `--liquid-radius-lg: 28px`，而内层控件常用 8/12/16 ⇒ **不同心**，视觉上「外框在飘、内框在缩」。
**裁决**：C1 的五档圆角 + **同心公式** `inner = outer − padding`（容差 ±2px）。例：外卡 20px、padding 8px ⇒ 内层应为 12px，不是 16px。
**判据**：新增探针 `probe-concentric-radius.mjs`，取嵌套 `[data-radius]` 元素的 `border-radius` 与 padding，断言差值 ≤2px。

#### Consistency（一致性）—— 连续自适应，不是多套静态布局

> 采纳平台惯例；设计在窗口尺寸和显示之间**连续自适应**，而不是为每个断点分别重新设计。

**BOH 现状**：656 条 `@media`（2026-10-19 复测）、0 条 `@container`、`max-width` 20+ 个值 —— 典型的「每个断点手工拍一次」。
**裁决**：与 §1.4 的硬约束同一条 —— **断点只决定列数，不决定组件**；组件内部用 container query 自适应。这条同时是 Flexibility 原则的落地。

### 2.4 visionOS 的补充：只取一条，其余明确不做

Apple 的空间计算原则里，对 Web 产品唯一有迁移价值的是「**空间布局关乎身体舒适**」：

- 交互元素目标区域要足够大（约 ≥60pt，1 米处约 2.5° 视角）⇒ 转译为**触控热区 ≥44×44 CSS px**（D4），关键主操作 48×48。
- 窗口/对象不应距头部小于一臂（约 0.5m）⇒ Web 无对应，**不迁移**。
- 沉浸是选择而非默认 ⇒ 转译为「动效/全屏沉浸层必须可退出、可跳过」（已有开场画 `commitGate` 的键盘路径，保持）。

**明确不做**：3D 悬浮元素、空间音频、为「空间感」重做布局。BOH 是 2D 内容产品，做这些只会增加成本与眩晕。

### 2.5 落地检查点 → BOH 实测对照表（2026-10-19 三轮实测）

原检查点是 13 条问句。按 `AGENTS.md` §3「量化结论必须写成结论 / 判据 / 实测日期三件套」的纪律，问句式清单无法被证伪，**已改写为带判据命令的对照表** —— 每行的「现状」列都能用「判据」列的命令原样重跑。
口径统一：静态计数一律 `git grep … -- src`（`rg` 本机未安装；`dist/`、`dist-check/`、`node_modules/` 未跟踪，不污染计数）。

| 层 | 检查点 | BOH 实测现状（2026-10-19） | 判据命令 | 落点 |
| --- | --- | --- | --- | --- |
| 结构 | 控制层 / 内容层是否分离（Hierarchy） | ❌ **46 处 `.liquid-glass` 里 22 处（48%）是内容容器**；阅读型内容上直接铺玻璃至少 **10 处**（详见 §2.3 追加实测） | `git grep -c 'class="[^"]*liquid-glass' -- 'src/**/*.vue'` | 决策 6 / 新门禁 `check:glass-on-content` |
| 结构 | 是否用平台惯例而非重新发明 | ❌ 4 套左栏 + 3 套底栏（含商城第 4 套）；5 处 `router.push(固定落点)` 当返回 | `git grep -l 'UserSpaceSideRail' -- src` | A1 / A5 / B2 |
| 结构 | 嵌套圆角是否同心（Harmony） | ⚠️ 实测 12 对嵌套：**2 组合规、2 组容差内、8 组违规**；最典型是「padding ≥ radius」导致同心几何在结构上不可能 | 见 §2.3 追加实测表 | C1 / `probe-concentric-radius.mjs` |
| 结构 | 断点只改列数、没换组件（Consistency） | ❌ `@media` **656 处 / 184 文件**，`@container` **0 处**；`max-width` 在 `@media` 内有 **39 个**不同值（非「20+」） | `git grep -o '@media' -- src \| wc -l` | A5 / `probe-responsive-parity.mjs` |
| 感知 | 字号可跟随系统 | ❌ 97 种字号取值、**3,545** 处声明（px 3,252 / rem 143）、0 个 `--font-size-*` | `git grep -o 'font-size:' -- src \| wc -l` | C1 / C3 |
| 感知 | 纯图标按钮有可访问名 | ⚠️ 零文本 `<button>` **226 个**；**真·无任何可访问名 14 个**（原写 217 / 58，见下方「口径更正」） | 见 §8 D4 口径更正 | D4 / `check:icon-label` |
| 感知 | 深色 / 浅色 / 增强对比 / 强制颜色四种模式 | ❌ `forced-colors` **0 处**；`prefers-contrast` 仅 3 处；**更严重**：4 处裸 `@media (prefers-color-scheme: dark)` 未受 `[data-theme]` 约束，会覆盖用户显式选的亮色 | `git grep -n 'prefers-color-scheme' -- src` | D5 / `check:scheme-bypass` |
| 行为 | 每个可交互元素有可供性 | ⚠️ 触控热区实测偏小（`.segment-tab` 34×39、`.nav-login-btn` 40×24、`.nav-hamburger` 36×36）；另有 **67 处 / 41 文件**非语义点击靶（`div/span/li/p/i @click` 且无 `role`/`tabindex`），视觉上「像按钮」但键盘读不到 | `git grep -E '<(div\|span\|li\|p\|i)[^>]*@click' -- 'src/**/*.vue' \| grep -v 'role=' \| wc -l` | D4 / D6 |
| 行为 | 始终知道正在发生什么 | ⚠️ `aria-busy` 仅 8 处 / 6 文件，`aria-live` 26 处 / 19 文件；**全局 toast 通道（`App.vue:427-439`）无 `role`/`aria-live`**；`aria-atomic` **0 处** | `git grep -c 'aria-live' -- src` | D3 / D8 |
| 行为 | 错误恢复与主路径同等易用 | ⚠️ 强项：`重试` 331 处 / 100 文件、`GlobalErrorBoundary` 已正确播报。**缺口：`navigator.onLine` 全仓 0 处**，仅 2 个 `online` 监听、无离线态 ⇒ 断网时「只是没反应」 | `git grep -c 'onLine' -- src` | D8 |
| 包容 | 模态陷阱焦点 / inert / Esc / 焦点回归 | ❌ 39 处 `<Teleport to="body">` 分散 28 文件；`inert` 仅 2 文件 5 处；`role="dialog"` 33 文件有语义但无焦点管理。⚠️ **口径更正：焦点陷阱并非 0 —— 后台已有完整实现**（见 §8 D2 口径更正），但只覆盖 2 / 39 | `git grep -o '<Teleport to="body"' -- src \| wc -l` | D2 |
| 包容 | 权限请求先给价值、再要数据 | ✅ **已做对，是全仓最强的无障碍相邻行为**：推送权限延后到真实手势（`AccountBindPrompt/index.vue:11,17,226` 记录了「无 transient activation 会静默失败」）、iPad UA 嗅探防误弹（`push-api.js:65`）、剪贴板拒绝后走特性检测兜底（`PushplusSettings/index.vue:498`）。⚠️ 唯一缺口：定位权限（`PostComposer.vue:379,387`）无原因说明、无手动输入兜底 | `git grep -n 'requestPermission\|getCurrentPosition\|clipboard.read' -- src` | 阶段 1.5 小项 |
| 包容 | 切换控制 / 纯键盘可达 | ❌ **全仓无 skip-link**；**67 处非语义点击靶键盘不可达**；roving tabindex 在 3 处各写各的（`DataAdmin.vue:1010` 等），无共享 composable。⇒ 纯键盘 / Switch Control 用户**到不了全部交互元素** | `git grep -n -i 'skip-link\|skipTo' -- src` | **D6（新增）** |
| 工艺 | 无目的的装饰或动效 | ⚠️ `transition: all` **158 处 / 37 文件**；`position: fixed` 154 处 / 88 文件 | `git grep -o 'transition: *all' -- src \| wc -l` | C4 / `check:z-index` |
| 工艺 | 过渡传达空间关系与层级 | ❌ 无 push/pop 转场、无 sheet 下滑、无下拉刷新、无长按（见 §6 B3 四件套全空） | —— | 阶段 3 |

> **读法**：✅ 1 行（权限纪律）、⚠️ 6 行（有基础但不达标）、❌ 7 行（零基础）。
> **唯一不需要动的行恰好是 Responsibility 里最容易被当成口号的那条** —— 这说明 §2.2 的八原则不是套话，它真的命中了本仓做得最好的地方。

> **一句话收束**（Apple 设计理念综述的落点）：以「为人服务」为根本出发点，用 Clarity / Deference / Depth 组织界面与内容的关系，用八原则做优先级取舍，以 Liquid Glass 的 Hierarchy / Harmony / Consistency 为结构基线。做产品方向设计时，最有用的动作往往不是增加什么，而是反复检查——**有没有哪个元素没有挣得它的位置，有没有哪个层级的关系在语义上说不通。**
>
> **加上 §2.7–§2.9 的产品形态层**：Apple 把这条哲学落到具体产品上时，反复用的是同一组动作 —— **把「我的东西」升为一级席位（Library）、把推荐的责任人显式写出来（署名策展 vs 无名算法）、把权威绑定在「被采纳」而非「被关注」、把工具降为一层而非一席、把「谁做的」摆在明面上。**
> BOH 目前在这五组动作上**全部是反面** —— 而其中四组都不是视觉问题，改动不依赖壳的改造。

### 2.6 追加实测：§2.3 两处需要证据化的地方

§2.3 的 Hierarchy 与 Harmony 原本只有定性判断（「不同心」「48% 是内容」）。2026-10-19 补上可重跑的实测，使裁决可被证伪。

#### Harmony —— 12 对嵌套圆角实测（判据：`probe-concentric-radius.mjs` 的静态版）

| 外层（file:line） | R_out | P_out | 内层 | R_in | 应为 | Δ | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `side-rail.css:39` `.userspace-rail` | 24 | 10–12 | `side-rail.css:240` `.userspace-rail-item` | 14 | 14 | **0** | ✅ **全仓唯一真正同心的样本** |
| `ActivityCard.vue:42` | 24 | 0 | `:121` `__date` | 12 | 10 | 2 | ✅ 容差内 |
| `Download/index.vue:34` `.filter-glass` | pill | 5 | `:38` `.filter-tab` | pill | — | 0 | ✅ 同为胶囊，无需同心 |
| `GlobalErrorBoundary.vue:3` | 16 | 28/24 | `:167` `.geb-btn` | 999 | 0 | — | ❌ **padding ≥ radius ⇒ 结构上不可能同心** |
| `AccountBindPrompt/index.vue:289` | 22 | 20/18/14 | —— | —— | 0 | — | ❌ 同上 |
| `PhotoAlbums/index.vue:158` | 24 | 0 | `:1092` `.pa-field` | 12 | 4 | 8 | ❌ |
| `Download/index.vue:54` `.card-glass` | 28 | 32 | `:62` `.version-glass` | 16 | 0 | 16 | ❌ |
| `SubscriptionPlans.vue:64` `.toolbar` | 22 | 10 | `:67` `.seg` | 980 | 12 | 968 | ❌ 胶囊塞进圆角卡 |
| `SubscriptionPlans.vue:40` `.intro-card` | 24 `!important` | 30 | —— | —— | 0 | —— | ❌ **用 4 处 `!important` 硬压 `.liquid-glass` 的 28px** |
| `Download/index.vue:5` `.hero-glass` | 28 | 44 | `:11` `.segmented` | pill | —— | —— | ❌ |

> **结论修正**：原文「121 种圆角取值、25 个变量名」口径不严 —— 实测 **127** 个不同取值 / **30** 个圆角变量名，`var()` 实际采用率 **8.1%**（211 / 2,598 处声明）。
> **更要紧的是 `--liquid-radius-*` 这一族本身没在服役**：全仓 213 处圆角 `var()` 里，`--liquid-radius-lg/md/pill` 只占 62 处；而 `.liquid-glass--inset` 在 `liquid-glass.css:69` **硬编码 `16px` 而不引用 `var(--liquid-radius-md)`** —— 单一真源被自己绕开，现有棘轮看不见。
> **第 1 行是关键证据**：`side-rail` 那对是本仓自己写对的，所以「同心」不是外来的教条，是已有的实践 —— 裁决可以写成「向 side-rail 看齐」，而不是「按 Apple 的说法改」。

#### Hierarchy —— 玻璃压在阅读型内容上的 10 处（决策 6 的证据清单）

| file:line | 选择器 | 包住什么 | 严重度 |
| --- | --- | --- | --- |
| `Forum/styles/base.css:123` | `.post-card-v2.glass-panel` | **论坛信息流帖子卡** | 🔴 |
| `Forum/styles/feed.css:364` | `.post-card-v2` | 同上（含 `:1065` 正文渐隐） | 🔴 |
| `PostDetail/style.scoped.css:181-187` | `.x-main-column` | **帖子详情整个主列**（`rgba(255,255,255,.7)` + `var(--liquid-filter)`） | 🔴 |
| `Messages/style.scoped.css:1722-1731` | `.x-inbox-list` | **整条消息列表** | 🔴 |
| `Messages/style.scoped.css:541-550` | `.source-content` | 消息正文 | 🔴 |
| `SubscriptionPlans.vue:272` | `.table-scroll liquid-glass` | 对比表格 | 🔴 |
| `Download/index.vue:202,206` | `.answer-block liquid-glass` | 教程正文 | 🔴 |
| `CloudStorageBar.vue:2` | `.storage-bar-card` | 配额数据面板 | 🟠 |
| `PostDetail/style.scoped.css:598,643,679` | 图片 meta / 导航 / 指示点 | 媒体容器 | 🟠 |
| `Messages/style.scoped.css:394,458` | 详情面板 / 用户卡 | 消息详情 | 🟠 |

> ⭐ **本仓已经做对过一次，可直接抄**：`PostDetail/style.scoped.css:1344-1351` 在**竖屏**把 `.x-main-column` 的玻璃全摘了（`background:transparent` + `backdrop-filter:none`），理由写在注释里：「竖屏连续内容：主帖与评论去掉玻璃卡分段，排成一条时间流」。
> **但横屏保留玻璃** —— 而 §2.3 的裁决表写的是「阅读型内容一律禁止玻璃」。⇒ **横屏现在就在违反本计划自己刚定的规则，而没人写下这件事。** 决策 6 必须显式裁定横屏，否则 §2.3 与既有代码长期打架。

> ⚠️ **`check:liquid-glass` 抓不到上面任何一条。** 该门禁（`scripts/check-liquid-glass.mjs`，73 行，`verify` 与 `build:ci` 均在跑，当前 exit 0）是**CSS 文本字面量匹配器**：不解析选择器、不解析 DOM 位置、无「内容 vs 外壳」概念。它还有三个盲区：① 只拦 `blur(≥14px)`，`blur(6px)`（`PostDetail/PostDetailModal.vue:115`）畅通无阻；② 只匹配裸 `blur(NNpx)`，全部 `var(--liquid-filter*)` 消费者不可见；③ 无棘轮无白名单，任何**新增**的内容卡玻璃都能通过。
> ⇒ 计划里的 `check:glass-on-content` **是全新工作，不是扩展既有门禁**。最小实现：解析模板里的 `class="…liquid-glass…"`，回溯祖先链，命中阅读型选择器清单（`.post-card-v2` / `.x-main-column` / `.x-inbox-list` / `.source-content` / `.table-scroll` / `.answer-block` / `.post-text-v2` / `.activity-card` / `.comment-*`）即红；对现有 22 处落一份种子基线，让棘轮只卡**增长**。
> 免费信号：`liquid-glass.css:98-110` 的嵌套玻璃退Blur规则会在内容卡上静默生效 —— 新增的内容玻璃**本来就没模糊**，可作为复核的第二判据。

---

### 2.7 Apple 的五张脸：可迁移结构（2026-10-19 四轮新增）

> §2.0–2.4 是**视觉与交互哲学**。这一节补上**产品形态哲学** —— 同一套 HIG 原则落到具体产品时的结构选择。
> 依据：Apple Developer Forums 官方规则页、apple.com/apple-intelligence 官方页、Apple Newsroom 2024-06 PCC 发布、App Store 编辑团队公开访谈，以及 2026-06 Ars Technica / The Verge 对 Siri AI 的报道。**下面每条都标注了 BOH 侧的对应现状与判据命令。**

| 产品 | 表面形态 | 可迁移的结构 |
| --- | --- | --- |
| **Apple Music** | 五个 tab：Library / For You / Browse(New) / Radio / Search | ① **Library 是一级席位**，「我的收藏」不是功能是入口<br>② **编辑策展署名、算法策展不署名**（歌单标「By Zane Lowe」，「Made for You」刻意无名）—— UI 本身在声明「这条推荐是谁给的」<br>③ **Top Charts 是唯一的社交信号**：宏观热度，**没有社交图谱** |
| **App Store** | Today（低密度叙事）/ Apps·Games（高密度浏览） | ④ **同一产品内两种密度分开**<br>⑤ **策展是有人排期的每日产出**（编辑团队每天产原创 story） |
| **Apple 零售店** | Today at Apple（工作坊）/ Genius Bar（预约） | ⑥ **社区是被托管的**：有排期、有员工、免费，不靠自组织 |
| **Apple Developer Forums** | Q&A 板块 | ⑦ **内容单元是「问题 → Accepted Answer」**，不是「帖 → 评论」<br>⑧ **声誉 = reputation points + Accepted + Apple Recommended**；**没有点赞、没有粉丝数**<br>⑨ **官方身份可见**：员工头像带 Apple logo + 显示正式职称；版主是 Apple 员工，有 edit / delete / retag 权限<br>⑩ **发帖可能需版主前置审批**<br>⑪ **范围围栏**：官方原话「本论坛只问代码问题；会员相关请去 Apple Developer Support」<br>⑫ **搜索优先于发帖**：「提问前先搜，可能已经有答案」 |
| **Apple Intelligence（2026）** | Siri AI app + Writing Tools / 通知摘要等系统层 | ⑬ **模型来源公开命名** —— 官方页首句即「With ChatGPT from OpenAI integrated into Siri」；AFM 3 Core 是与 Google 共同开发的 Gemini 系模型（2026-06 Ars Technica）<br>⑭ **「no need to jump between tools」** —— AI 的产品命题是**一层**，不是一个要去的地方<br>⑮ **按能力命名，不按模型命名**（Siri / Writing Tools / Summarize）<br>⑯ **PCC 提供可导出的透明度报告**（Apple Intelligence Report），让「数据去了哪」可被用户自查 |

> ⚠️ **⑬ 修正了一个常见误读**：不少资料把 Apple 描述成「从不透露底层模型」，那是 2024–2025 的印象。**2026 年的 Apple 恰恰相反** —— 它把第三方伙伴摆在官网首页，把联合开发的模型命名发布。这不是退让，是把「谁做的」当成信任资产。
> 这一条直接决定了 §2.9 的结论方向，**先读 §2.9 再回来看本表**。

### 2.8 推演一：如果 Apple 做论坛

**结论先行：Apple 的论坛不是社交产品，是 Q&A 产品。** 而 BOH 的论坛是**混合体**（作品展示 + 讨论 + 提问共用一套模板）。因此**直接照搬 Apple 会失败**，正确的动作是**给混合体里的其中一类补上 Q&A 语义**，而不是把整个论坛改造成 Q&A。

**四个机制的落地评估**（现状数据来自 2026-10-19 四轮实测，判据命令见各行）：

| Apple 机制 | BOH 现状 | 可行性 | 工作量 | 判据命令 |
| --- | --- | --- | --- | --- |
| **Accepted Answer**（楼主标记采纳） | **0** —— 无任何字段、无 UI。评论仅按时间升/降序（`comment-api.js:125,154`） | ✅ 高。语义清晰、权限天然（仅楼主可标） | **M**：schema 加 `is_accepted` + 详情页置顶渲染 + 「已解决」计入列表徽章 | **schema 层判据**（决定性）：<br>`grep -rn 'create table.*comments' supabase/migrations/ -i -A 25 \| grep -iE 'is_\|accepted\|solution\|resolved\|best'` → **0 命中**，即 `comments` 表**无任何解答语义字段**。<br>⚠️ 裸 `accepted` / `is_accepted` / `采纳` 三者**都不可用作判据**，实测各自串扰：`accepted` 8 处全是 `confirm()` 返回值（`SubscriptionPlans.vue:1061`）、`采纳` 是「会话被采纳」（`stores/auth.ts:686`）。**本文初稿的判据正是这么写的，已更正** —— 与 §8 D2 那次「grep 了从未用过的名字」是同一个毛病的两种形态 |
| **Apple Recommended**（官方标记推荐） | **0** —— 论坛内无任何官方身份 | ⚠️ 技术易、**运营贵** | **S** 技术 / 持续运营成本高 | `git grep -i '推荐\|featured' -- src/views/Forum` |
| **发帖前置审批** | 部分已有：内容审核链路存在（`ModerationModelConfig`），但不是**发帖前**闸门 | ⚠️ 会拖慢首发体感 | **S**～**M** | `git grep -l 'moderation' -- src/utils/api` |
| **范围围栏 / 标签落地页** | **0** —— 4 个标签只是下拉筛选（`ForumToolbar.vue:294-312`），**无路由、无落地页**；旧标签页已作为孤儿删除（`user-space.ts:9-10`） | ✅ 高 | **M**：标签路由 + 落地页 + 每标签一段编辑说明 | `git grep 'tags/:tag' -- src/router` |

**BOH 已做对、不该动的部分（Apple 同样没有）**：
- 评论**严格按时间序**，从不按赞排序（`comment-api.js:125`）—— 这与 Apple「不做互动排序」一致，是**对的**
- 关注关系**服务端复验**，不信任客户端数组（`2026092702_forum_list_single_impl.sql:105-114`）—— 这是 Apple 论坛「发帖需验证身份」的精神同款
- 搜索是真入口（岛 + 全局搜索 + 论坛内搜索三处），符合 ⑫

**BOH 与 Apple 结构上最锋利的两处差异**：

1. **权力结构相反。**
   Apple 论坛里，一个人的地位来自「他的答案有没有被采纳 / 被官方推荐」——**能力是被承认的**。
   BOH 里，一个人的地位来自**粉丝数**这个可点击的统计芯片（`ProfileMain.vue:354-356`）。
   ⇒ 这不是审美问题：**它决定了什么样的行为被奖励**。粉丝数奖励「被认识」，采纳答案奖励「有用」。

2. **`hot_score` 是个假榜单。**
   ```
   like×1.0 + comment×1.5 + greatest(0, 48-age_h)/24
   ```
   （`2026092705_forum_list_kind_filter.sql:137` 等 5 处迁移一致）
   - **评论权重 1.5× 于赞** —— 等于把「吵架」定价成「好看」
   - **48h 硬崖**：超过两天，recency 归零，只剩互动量
   - **是全局加权和，不是个性化**：所有人看到的「最热」完全相同
   - **不能按赞单独排序** —— 榜单不存在，只有混合分

   Apple 的 Top Charts 是**单指标降序**、有名字、有时效性（「本周热门」）。
   ⇒ BOH 的 `hottest` 把一个**有名字的临时榜单**做成了**一个默认排序开关**，两头不占。
   **本轮建议**：降级为「本周热门」这类命名榜单，默认排序回归纯时间序。**列为决策 9。**

> ⚠️ **必须写清的边界**：本节全部内容是**内容模型**，与 §5–§8 的壳/栈/面/感**正交**。壳不解决「论坛有没有采纳语义」，栈不解决「粉丝数该不该是权力指标」。
> ⇒ **不要把本节当成阶段 1 的一部分插队执行**。它需要独立排期，且**依赖阶段 0 的令牌与阶段 5 的门禁体系**才有落地条件。

### 2.9 推演二：如果 Apple 做 AI 工具

| 维度 | Apple（2026） | BOH 现状 | 判据命令 |
| --- | --- | --- | --- |
| **模型来源是否披露** | ✅ 官网首页即「With ChatGPT from OpenAI integrated into Siri」；AFM 3 Core 与 Google 共同开发并公开命名 | ❌ **系统提示词明令禁止**：<br>`不要提及任何第三方公司（如 OpenAI / Anthropic / Google / Amazon / 阿里 / 字节等）或底层模型名称，即便用户追问也不透露`<br>（`chat-engine-config.js:159`） | `git grep '即便用户追问' -- src` |
| **实际推理发生地** | PCC（Apple 自建 + 第三方模型），**协议层可验证 + 有可导出报告** | SiliconFlow / 智谱云端，经 api-key-vault 代理（`bohai-model-client.js:68-73`）。密钥不落浏览器，但**对话文本与私有检索上下文确实发给第三方** | `git grep -n 'SILICON_CLOUD\|ZHIPU_CHAT' -- src` |
| **透明度 UI** | ✅ Apple Intelligence Report，可选时长、可导出文件 | ❌ **0 处**。`DataPrivacyPanel.vue`（81 行）唯一可操作项是「公共记忆管理」 | `git grep -i '推理\|发送至\|端侧\|数据流向' -- src/views/BOHAI src/views/user-center` |
| **形态** | 系统层工具 + Siri AI app。命题是 **「no need to jump between tools」** | ⚠️ **底栏第三席是 `fullPage` 目的地**（`bottom-nav.ts:47`），另配 **17 条 slash command**（`bohai-slash-commands.js:34-154`） | `git grep -n "'ai', *label" -- src/config/bottom-nav.ts` |
| **命名依据** | 按**能力**（Siri / Writing Tools / Summarize） | 按**性能档**：极速响应 / 质量 / 超级高质量（`2026061002_bohai_model_configs.sql:98-101`） | 同上迁移文件 |
| **人格** | 明确去人格化 | 4 种回答风格含「苏格拉底」「心理专家」（`chat-engine-config.js:321-372`） | `git grep -n 'socratic\|psychologist' -- src/views/BOHAI` |
| **工作产物** | Writing Tools / 摘要 / Image Playground 都有明确产物 | ⚠️ Work 的 `artifacts` **源码注释写明恒为空**，generators 尚未接入（`BohWorkPanel.vue:72-74`） | `git grep -n 'artifacts' -- src/views/BOHAI` |

#### ⚠️ 与 §2.2 第 3 条原则的正面冲突（**本轮只记录事实，不改实现**）

§2.2 的 Responsibility 原则要求：**「对产品做什么以及为什么做保持透明」**。

当前实现方向与该原则**相反**：提示词把「是谁做的」列为禁止回答项，而实际推理确实发生在第三方云服务。

**本轮口径（2026-10-19 用户裁定）：只记录事实，暂不修改 prompt。**
- 因此 `chat-engine-config.js:159` **本轮不动**
- 本节只作为**冲突留档**，供后续单独拍板（已列为决策 11）
- 附带理由：改 prompt 属产品口径变更，且可能牵动现有 AI 行为的回归断言；且 §2.2 原则 3 的落点（D 主线无障碍）与之正交，不应混在形态改造里做

> **但必须诚实说明这个裁定的代价**：它在 Beta7 期间会让 §2.2 的 Responsibility 一栏**长期挂着一条已知的未兑现承诺**。
> 若最终不披露，建议的做法不是「什么都不做」，而是**把这条原则在 §2.2 表里的措辞改成它实际能兑现的范围** —— 即「对产品**功能**透明、对**底层实现**不承诺」，这样文档与实现一致。**不修改原则、改的是原则的表述边界** —— 决策 11 的 C 选项即为此准备。

#### 关于「AI 该不该占一个底栏席位」

Apple Music 的五席全是**内容形态**（Library / For You / Browse / Radio / Search），AI 不在其中。
按同一逻辑，BOH 的 `内容 / 消息 / AI / 我` 里，**AI 是工具而非内容形态**。

**但这条不能照抄** —— Apple 有系统级 AI（iOS 本身），BOH 是**独立网页 APP**，没有系统层可依附，AI 若不占席位就没有一级入口。因此：
- **A：保持现状**（AI 占一席，作为 AI 产品的一级入口）
- **B：降级为岛**（AI 收回灵动岛，底栏换成一个内容形态，如「发现」）
- **C：混合** —— 底栏留席但同时把岛做成真正的跨页入口

**建议 C**：既承认 BOH 没有系统层可依附，也承认「AI 是一层」这个方向。**列为决策 12。**

## 3. 与现有 Beta7 讨论的关系

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
- **无障碍（主线 D）不是收尾项**：D1/D3/D4 与阶段 1 并行，D2 紧跟阶段 2（模态协议）。理由见 §2.2 原则 3 —— 「从第一天做」是字面意思。

---

## 4. 方案总纲：壳 / 栈 / 面 / 感

```
主线 A｜壳（Shell）  导航从页面里抽出来，成为唯一的一层
主线 B｜栈（Stack）  所有「进去看一眼」都走同一套压栈协议
主线 C｜面（Surface）四把尺子 + 一层语义暗色，让视觉从此可批量调整
主线 D｜感（Sense）  焦点、读屏、键盘、三态、热区、命名、反馈 —— 让上面三层「真的能用」
```

前三条主线的**依赖关系是硬性的**：A 不做，B 无处挂；C 不做，A/B 的每一刀都要手工改几百处。
D 与 A/B/C 是**正交**的：D1/D3/D4 可以立刻开始，D2 依赖 B1 的模态协议。
顺序：**A → B → C 并行收尾；D1/D3/D4 与 A 并行，D2 随 B 落地。**

---

## 5. 主线 A：壳

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

**必须遵守**：`AppShell` 是**唯一**允许出现 `position: fixed` 导航/底栏的地方。这条后面用门禁锁死（§12）。

### A2. 顶栏：竖屏与横屏均保留浮岛（✅ **已拍板 2026-10-19：保留浮岛胶囊**）

| | 现在 | 目标 |
| --- | --- | --- |
| 竖屏 | 浮岛胶囊：`height:50px`、`max-width:calc(100%-16px)`、`translateY(8px)`（`UnifiedNavbar/style.scoped.css:325-331`）；外层 `.unified-nav` 实测固定层高 **78px** | **形态不变**，只补 safe-area：胶囊顶部偏移改 `max(8px, calc(env(safe-area-inset-top) + 8px))`，standalone 下整体下移到状态栏之下 |
| 横屏 ≥1024 | 浮岛 860×58 居中 | **保持不变**（浮岛是桌面品牌资产） |

> **拍板留档**：原「竖屏改通栏」建议（390 宽悬空、与状态栏割裂）被用户否决（2026-10-19）——**悬浮胶囊是产品要的形态，不改**。原判断「浮岛无法承载 safe-area」仍然成立，但改用折中解，二选一（施工单定）：
> ① 胶囊下移 `env(safe-area-inset-top) + 8px`，状态栏区域加衬底（纯色/渐变/模糊，观感细节施工时定）；
> ② 回退 `viewport-fit=cover`（`index.html:67`），系统自留状态栏区——实现最简，代价是 standalone 顶/底出现系统底色、稍欠沉浸。

**连锁影响**：
- A3 底部安全区（`--safe-bottom`，底栏让开 Home Indicator）**不受本拍板影响，照做**；
- 「标题上收进顶栏」原绑定通栏，胶囊内空间有限 ⇒ **搁置/另议**（新增待拍板小项）；
- `vendor/unified-nav.css` 145 处 `!important` 清零原是改形态的前置 ⇒ **降级为非必需**（只调偏移量，不动形态）；
- §12 现有探针大多锚在浮岛几何上 ⇒ **探针基线重建压力大幅下降**。

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
- 全站只此一处，页面内现有的 36 处 `env(safe-area-inset-top)` 与 73 处 `-bottom` 逐步收编（实测全仓 114 处 `env(safe-area-inset` / 33 文件，2026-10-19 复测 top/bottom 拆分不变总数、bottom 77→73）

### A4. 统一滚动模型

目标：**所有 `tab` 形态页面 = `100dvh` + 壳内 `.app-scroll` 滚动**。
收益：
- 返回位置恢复只需管一个容器，三套机制合成一套
- 底栏不再被键盘顶起（现在是各页自己藏）
- `position: fixed` 可从 154 处大幅收敛

代价与顺序：Home 的「开场画跟手揭开」依赖 `position:fixed` + `touch-action:none`（`Home/style.scoped.css:75-101`），**先改 Home 风险最高**，建议从 ActivitiesWall / Shop 这两个纯文档流页面先试，Home 放最后。

### A5. 左栏升级为壳的 rail 形态

- 现状：4 个页面各挂一份 `UserSpaceSideRail`，`≥1024px + ≥600px 高` 才显示（`side-rail.css:22`）
- 目标：由壳统一渲染，页面只声明「当前项」
- **补一个洞**：手机横屏（如 844×390）现在**两头空** —— 底栏被 `(orientation: landscape)` 关掉（`Home/style.scoped.css:206-210`），左栏要求 `min-width:1024`（`side-rail.css:22`）。这一档要么给 rail 要么给底栏，不能没有。

---

## 6. 主线 B：栈

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
- **禁止** `router.push(固定落点)` 当返回（**2026-10-19 复核后 5 处**；原 7 处中 `Partners.vue:419` 与 `BlockWall/index.vue:461` 已随当日退场删除）：`PushplusSettingsPage.vue:28`、`AccountSecurity/index.vue:558`、`CloudPlusMain.vue:1286`、`ShopAccountPanel.vue:369`、`NewsDetailPage.vue:100`
- 任何全屏层/弹层打开时 `history.pushState` 一个哨兵，`popstate` 关层 —— 现在**只有** `usePostDetailModal.js:43` 这么做，发帖编辑器、购物袋、图片查看器都要补

### B3. 手势四件套

| 手势 | 语义 | 现状 |
| --- | --- | --- |
| 左边缘右滑 | 返回 | **无**（`useEdgeSwipeGesture` 已有，反向复用即可） |
| sheet 下滑 | 关闭 | **无**（grabber 只是装饰：`Shop/style.scoped.css:872`） |
| 下拉 | 刷新列表 | **无**（首页/论坛/消息三个列表最需要） |
| 长按 | 上下文菜单（帖子/评论） | **无** |

> 手势必须遵守 Apple 的两条隐含约束：**可发现**（首次使用有提示或视觉暗示）、**可撤销**（滑到一半松手要回弹，不能误触就执行）。这条写进 `probe-sheet-gesture` 断言。

### B4. 每 tab 独立栈（**需拍板**）

原生 APP 切 tab 会保留各自的历史与滚动位置。现在是单栈 `router.push`。
- 完整方案：每个 tab 一个 `history` 分支（工程量大，需自研或改路由层）
- 简化方案：**记住每 tab 的最后路由 + 滚动位置**，切回时恢复（UserSpace 已有 `saveTabScrollPosition`，推广到四席）
- 建议先做简化方案，观察真实使用再决定是否上完整方案

---

## 7. 主线 C：面

### C1. 四把尺子（新增令牌，唯一来源）

```css
:root {
  /* 字阶 7 档 —— 替代 97 种取值 */
  --fs-caption: 11px; --fs-footnote: 12px; --fs-body-sm: 13px;
  --fs-body: 15px; --fs-title: 17px; --fs-headline: 20px; --fs-display: 24px;

  /* 圆角 5 档 —— 替代 121 种取值 */
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 20px; --r-full: 999px;

  /* 间距 8 档 —— 替代 892 种 padding */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;

  /* 层级 7 层 —— 替代 92 种 z-index 取值 */
  --z-base: 0; --z-sticky: 10; --z-tabbar: 100;
  --z-sheet: 200; --z-overlay: 300; --z-modal: 400; --z-toast: 500;
}
```

**落地策略（关键，别搞成一次性大重构）**：
1. 新代码必须用令牌 —— 用 lint 规则 + 门禁锁死
2. 旧代码**不强制替换**，但在**每次改到该文件时顺手替换**（搭便车）
3. 棘轮只降不升：每个维度记录当前字面量总数，只允许下降

**补一条 Apple 侧的要求**：字阶要能被系统字号放大。做法是**只把正文/标题改成 `rem`**（`html { font-size: 100% }`），不要把所有 px 都换掉 —— 元信息、图标、徽标保持 px 是合理的，避免 200% 字号下布局崩坏。

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

- 竖屏正文基准从 12/13px 提到 **15px**（现在明显偏小，`12px` 有 614 处、`11px` 有 311 处，2026-10-19 复测）
- 关键文本改 `rem`，`html { font-size: 100% }`（当前实测 `rootFont: 16px`，但子元素几乎全用 px 覆盖）
- 加 `-webkit-text-size-adjust: 100%`（已有，`style.css:58`），**不要**用 `user-scalable=no`（`index.html:67` 已经是 `user-scalable=yes, maximum-scale=5.0`，保持）
- **验收**：浏览器字号放大到 200% 时，正文不截断、按钮文字不溢出（新增 `probe-text-zoom`）

### C4. 首屏 chrome 收敛（视觉上最直观的一刀）

| | 现在 | 目标 |
| --- | --- | --- |
| 顶部 | 胶囊 50 + 分区 tab + 搜索 + 签到工具条（≈220–240px） | **胶囊保留（A2 拍板）+ safe-area 偏移**；分区 tab 滚动时收起；搜索进顶栏图标 |
| 首屏内容 | ≈1 张帖子卡 | ≥2 张 |
| 页脚 | 首页 5 列 sitemap 页脚（`HomeFooter.vue:5-40`） | **删除**（APP 没有 sitemap 页脚） |

顺带清理：`App.vue:398` 全局挂载的 `Footer.vue` 自己写了 `display:none`（`Footer.vue:31-33`），`footer.css` 的 `.footer-home` 无任何使用者 —— 都是残留，一并删。

---

## 8. 主线 D：感（新增，2026-10-19）

> 这条主线回答一个问题：**上面三层做完之后，一个用读屏的人、一个手指不精准的人、一个开了「减少动态效果」的人，能不能完整使用 BOH？**
> 现在的答案是「不能」。本章把「不能」拆成**八个**可验收的缺口（D1–D8）。
> D6/D7/D8 是 2026-10-19 三轮实测新增的 —— 原五项（D1–D5）漏掉了「键盘能不能进得去」「表单控件有没有名字」「全局反馈通道响不响」，这三项恰好是 Apple Responsibility 与 Agency 原则里最直接的落点，缺一项，无障碍就只做了一半。

### D1. 无障碍基线：从 5 页扩到 12 页，只降不升

**现状（可复核）**：`scripts/probes/probe-a11y.mjs` 已用 axe-core 跑了棘轮，但只覆盖 5 个公开页；基线 `scripts/a11y-baseline.json` 记录 **72 处 serious 对比度违规**：

| 页面 | color-contrast::serious |
| --- | --- |
| 首页 | 26 |
| 论坛列表 | 26 |
| 关于我们 | 18 |
| 摄影集 | 1 |
| BOH AI | 1 |

**问题不是「有债」，是「债的可见范围太窄」**：消息中心、商城、用户空间、BOHAI 设置、发帖编辑器都不在扫描范围 —— 恰恰是交互最密的地方。

**动作**：
1. 覆盖页 5 → 12：+ 消息中心、商城、用户空间（需登录态 fixture）、帖子详情、发帖编辑器、BOHAI 设置
2. 基线**只降不升**；每修完一页跑 `--update` 把数字压下去
3. 补两类规则开关：`forced-colors`（Windows 高对比，当前 **0 处**）、`prefers-contrast`（当前 **3 处**）
4. **禁止**用「关规则」换绿色 —— 与 `AGENTS.md` 的反自欺纪律一致

**判据**：`probe:a11y` 在 12 页上新增违规为 0；总存量单调下降。

### D2. 焦点与模态协议（Agency 原则的硬落地）

**现状（可复核，2026-10-19 三轮实测已修正两项）**：
- 28 个文件里有 **39 个 `<Teleport to="body">`** 全屏层/弹层
- 全仓只有 **2 个文件 5 处** `inert`（`AnniversaryCafe` ×2、`Join` ×3）
- `CommonAlertModal.vue` 的根节点**没有** `role="alertdialog"`、`aria-modal`、`aria-labelledby`、焦点陷阱 —— 而它是全站用得最多的确认弹窗
- 33 个文件写了 `role="dialog"`、29 个写了 `aria-modal`，但**语义有了、焦点没管**：Tab 会跑到遮罩后面的页面

> ⚠️ **口径更正（2026-10-19 三轮实测）**：本文初稿写「**没有** focus-trap 实现」，**该结论错误**。
> 焦点陷阱**已经存在**：`src/views/DataManagement/composables/useDialogFocusTrap.js`（98 行，完整的 `v-dialog-focus` 指令：可聚焦选择器循环、Escape + stopPropagation、挂载聚焦、卸载回归触发元素并带 `isConnected` 保护），消费方 `FreemodelsConfig.vue:372,376` 与 `KeysAndModels.vue:580,585`。
> **错因值得记下来**：初稿 grep 的是 `useFocusTrap` / `focus-trap` —— **代码库从未用过的命名**，于是「搜不到」被读成「能力不存在」。这正是 `AGENTS.md` §2 那条「别 grep 文本数，会串」的教科书案例。正确判据是按**能力**搜（`git grep -i 'focusTrap\|trapFocus\|cycleTab'`），不是按**猜测的名字**搜。
> **对方案的影响是好的**：D2 不是从零发明，而是**把已有的 98 行提升为全站协议** —— `useDialogFocusTrap` 原样搬进 `src/composables/useModalLayer.js`，`Teleport` 迁移时逐个换掉。**唯一要补的是它只覆盖 2 / 39**，且只在后台。

**动作**：新增 `src/composables/useModalLayer.js`，一个口子收全部：

```js
useModalLayer({
  active,                 // ref，是否打开
  onEscape,               // Esc 关闭（优先级低于内部未保存确认）
  initialFocus,           // 打开后焦点落点（默认第一个可聚焦元素）
  returnFocus: true,      // 关闭后回触发元素
})
```
内部职责：① Tab/Shift+Tab 循环；② 背景 `inert`（不是 `aria-hidden`，`inert` 同时挡焦点与读屏）；③ Esc 关闭；④ 关闭后焦点回原处；⑤ 打开时锁 `body` 滚动（与 A4 的滚动模型对齐）。

**迁移顺序**：`CommonAlertModal` → 发帖编辑器 → 图片查看器 → 购物袋 → 5 套详情浮层。
**判据**：`probe-focus-trap.mjs` —— 每个模态打开后连按 12 次 Tab 不逃出；Esc 关闭；关闭后 `document.activeElement` 是触发按钮。

### D3. 三态统一：加载 / 空 / 失败

**现状**：`skeleton` 相关 **1,117 处 / 70 文件**（视觉上不缺），但语义几乎为零：`aria-busy` 仅 **8 处 / 6 文件**，`aria-live` 仅 **26 处 / 19 文件**（2026-10-19 复测）。
后果：读屏用户点「加载更多」后**听不到任何变化**；请求失败时页面只是「没反应」。

**动作**：
1. 新增 `src/components/states/` 三件套：`StateLoading`（骨架 + `aria-busy`）、`StateEmpty`（说明 + 主行动）、`StateError`（原因 + **重试按钮**）
2. 三态必须**成对出现**：有 loading 就必须有 error，有 error 就必须有 retry —— 这是 Agency 原则的「容易从错误中恢复」
3. 异步结果用 `role="status"` + `aria-live="polite"` 播报（失败用 `assertive`，但不要滥用）
4. 骨架屏不播报（避免噪音），只播报「加载完成 / 失败」

**判据**：新增页面若只有 loading 没有 error，`check:state-trio` 直接红；`probe-aria-live` 断言「点加载更多 → 有 live region 文本变化」。

### D4. 触控热区与可访问名

**现状（两套证据）**：

源码静态扫描（`<button>` 共 **1,256** 个，2026-10-19 复测）：
- 纯图标按钮（零文本内容）**226 个**（用户端 161 / 后台 65）
- **真·无任何可访问名 14 个**（用户端 6 / 后台 8）：`App.vue:435`、`AvatarCropModal.vue:8`、`FollowListModal.vue:8`、`Birthday/index.vue:223,227`、`DataManagement/components/EditDrawer.vue:716,817`、`Dev/MotionLab.vue:36,58`、`HeroConsole/index.vue:1192,1263`、`Home/components/OfficialHeroStage.vue:25,196`、`CommunityTab.vue:133`

> ⚠️ **口径更正（2026-10-19 三轮实测）**：初稿写「纯图标 **217** 个 / 无可访问名 **58** 个（用户端 24 / 后台 34）」，**两个数都不可复现**，因为没给判据。重测（花括号/引号配平的 `<button>` 词法切分）得：
>
> | 口径 | 初稿 | 实测 | 说明 |
> | --- | --- | --- | --- |
> | 零文本内容的 `<button>` | 217 | **226** | 与初稿方向一致（161 用户端 / 65 后台） |
> | 零文本**且**无 `aria-label`/`aria-labelledby`/`title` | 58 | **14**（6/8） | 初稿约 4× 于实测 |
>
> 两者不矛盾：零文本按钮的「名字」常来自嵌套组件（如 `<CloseIcon/>`），**那不是可访问名**（读屏念不出来）；而按严格判据（自身无任何命名属性）只有 14 个。**本文采用严格口径 14**，因为它才对应「读屏念不出按钮名」这个真实后果。
> 留档判据命令（可重跑）：花括号/引号配平扫描 `src/**/*.vue` 的 `<button>` 开闭标签对（1,247 对 / 1,256 个开标签），判定条件为零文本内容且无命名属性。**不用 grep 数 —— `<button` 会把动态 `:is` 之类一起算进来。**
> 用户端可访问名最密集处仍需补（不管哪个口径都成立）：`BohChatStream`(5)、`AddressManager`(3)、`BOH8YearsJourney/CopyEditor`(3)、`ShopAccountPanel`(2) 等。

渲染实测（390×844，Playwright）：

| 元素 | 实测尺寸 | 结论 |
| --- | --- | --- |
| `.segment-tab`（分区 tab） | **34×39** | 低于 44×44 |
| `.nav-login-btn` | **40×24** | 明显偏小 |
| `.nav-hamburger` | **36×36** | 低于 44×44 |

**动作**：
1. **不靠改视觉尺寸达标** —— 用 `::after { position:absolute; inset:-Npx }` 扩热区，视觉不变、命中变大。这条是本主线最重要的工艺细节：把「热区」和「视觉尺寸」解耦。
2. 所有纯图标按钮补 `aria-label`（中文，动词开头：「关闭编辑」「更多操作」）；纯装饰图标 `aria-hidden="true"`
3. 主操作（发布、发送、支付）热区 **≥48×48**
4. 相邻热区之间留 ≥8px 间隙，避免误触（Apple 的 target spacing 要求）
5. ⭐ **前置：全仓缺一个全局 `.sr-only`**（2026-10-19 实测）。现有 `.sr-only` 只在 `Cloud+/style.scoped.css:2110`（scoped，全仓仅 `CloudPlusMain.vue:989` 一处 `<figcaption>` 用），`.g-visually-hidden` 只在 `FreemodelsConfig.vue:905`。**`src/style.css` / `tokens.css` / `styles/common/*` 里零命中。**
   ⇒ 所以动作 2 只能靠写 226 遍 `aria-label`（可接受但重复）。**建议先在 `tokens.css` 加一条全局 `.sr-only`**，之后长按钮名（关闭图片查看器第 3 / 5 张）可以用视觉隐藏的 `<span>` 承载，不必把语义塞进属性。
   **顺序很重要**：这条是 D4 的**依赖项**，不是并行可选项 —— 没有它，D4 的补名工作会被迫选一条更差的路径。

**判据**：`probe-touch-target.mjs` 遍历可见交互元素，断言 `getBoundingClientRect()`（含伪元素扩区后的 `elementFromPoint` 命中测试）≥44×44；`check:icon-label` 源码门禁禁止无标签纯图标按钮（基线 **14**，棘轮只降不升）。

### D5. 工艺底线：四种「偏好」都要有降级

| 用户偏好 | 现状 | 要求 |
| --- | --- | --- |
| `prefers-reduced-motion` | ✅ **已做对**：`animations.css:1028` 全局压到 0.001ms，但**显式恢复**三类状态切换的 300ms 纯 opacity 反馈 | 保持。新增动效必须同时给 reduce 降级，且**降级不等于消失**（反馈要可感知） |
| `prefers-reduced-transparency` | ⚠️ **不是 0 处 —— 已有 10 个文件**（2026-10-19 三轮实测更正）：`UnifiedNavbar`、`BOH8YearsJourney`、`CommunityLotteries`、`official-hero-stage.css`、`Login`、`Newsroom`、`Shop`、`ShopConsole`、`Shows`、`AssetsHubPanel`。缺口是**只做了 10 / 全部玻璃面，且无门禁防回退** | 补齐到剩余玻璃面；**加 `check:glass-pref-degrade` 棘轮锁死已做的 10 处**（降级只准增不准减） |
| `prefers-contrast: more` | 3 处 | 边框与文字对比度提升一档 |
| `forced-colors: active`（Windows 高对比） | **0 处** | 至少保证：图标用 `currentColor`、焦点轮廓用 `outline` 不被 `outline:none` 干掉（全仓 **122 处** `outline: none/0`，需逐条确认是否有替代焦点样式） |

> ⚠️ **口径更正（2026-10-19 三轮实测）**：初稿写 `prefers-reduced-transparency` **0 处**，实测 **10 个文件各 1 处**，D5 的一半已经做过了。
> **更有价值的发现是一个真 bug（初稿完全没提）**：**4 处裸 `@media (prefers-color-scheme: dark)` 没有受 `[data-theme]` 约束，会覆盖用户显式选择的亮色。**
>
> | file:line | 选择器 | 后果 |
> | --- | --- | --- |
> | `styles/common/glass-ui.css:606-611` | `.boh-perf-lite .glass-card` / `.glass-user-bubble` | `background: rgba(30,30,30,.92) !important` —— **且用了 `!important`，连同文件 `:614` 的 `[data-theme="dark"]` 规则一起压过**；两分支值还不同（`30,30,30` vs `30,30,40`） |
> | `styles/common/glass-ui.css:333-336` | `.glass-container-light/medium/heavy` | 玻璃容器在系统暗色下变深 |
> | `styles/vendor/unified-nav.css:1363-1366` | `.unified-nav` | 顶栏丢失材质 |
> | `views/HeroConsole/style.scoped.css:964-967` | `.lottery-picker-modal` | 弹层硬编码 `#1d1d1f` |
> | `styles/common/login-modal.css:507-510` | 空块（仅注释） | 死代码 |
>
> **这不是新问题，而是同一个 bug 类已在 DataManagement 修过一次**：`DataManagement/styles/base.css:173` 留了「这里曾有一份 `@media (prefers-color-scheme: dark)` 兜底」的注释，`responsive.css:31` 记录了删除，并有**文件级**探针守卫 `probe-dark-admin-theme.mjs:205`。**守卫只覆盖 DataManagement 一个目录，同样的缺陷在另外 4 个文件里原样存活。**
> ⇒ 动作：把这 4 处并入 `[data-theme="dark"]`，并把 `probe-dark-admin-theme.mjs` 的 F 断言**从文件级升为全仓级**（改判据前先按 `AGENTS.md` 的反证纪律验一次它真的会红）。

**触感的边界（必须写清，避免过度承诺）**：`navigator.vibrate` 全仓仅 4 处，且 **iOS Safari 不支持 Vibration API**。
所以：**Android 可给轻触感，iOS 只能靠动效与文案**。Delight 的实现不能依赖触感，否则一半用户永远收不到。

---

### D6. 键盘可达与切换控制（**新增 2026-10-19 三轮实测**）

> **为什么单开一条**：Apple Responsibility 原则列的无障碍清单里，**「切换控制（Switch Control）」**在 §2.2 与 D1–D5 中完全没有落点。而 D2 只管**焦点别逃出模态**（出口），D4 只管**命中区够大 + 有名字**（入口的一半）。**「进得去」这一半没人管。**

**现状（2026-10-19 实测，判据 `git grep -- src`）**：
- **全仓无 skip-link**（skip-to / skip-link / 跳转正文 → 0 命中）⇒ 键盘/切换控制用户必须 Tab 完整个导航（顶栏 + 灵动岛 + 搜索 + 岛格）才到内容
- **67 处 / 41 文件非语义点击靶**：`div`/`span`/`li`/`p`/`i` 带 `@click` 但无 `role`、无 `tabindex` ⇒ **键盘完全到不了**。代表：`App.vue:428`（toast 容器本身可点关闭）、`CommonAlertModal.vue:4,5`、`AgreementModal.vue:4,5`、`FollowListModal.vue:21`、`AddressManager.vue:157` 等。`@click.self` 的遮罩层尤其糟 —— Esc 是唯一键盘出路，而 Esc 本身也是 D2 待补的
- roving tabindex **有但各写各的**：`DataAdmin.vue:1010,1330,1441,1480,1502,1524,1586`、`BOH8YearsJourney/index.vue:1647`、`UserSpace/components/PointsCard.vue:13`；方向键处理散在 `GlobalSearchIsland.vue:583,589`、`useBohShell.js:1769`、`DataAdmin.vue:7692`。**无共享 composable**
- `tabindex="-1"` 只 8 处且用法正确（焦点锚点），无正 `tabindex`（✅）；`tabindex="0"` 用在 `BohChatStream.vue:9` 滚动区（✅ 正确实践）

**动作**：
1. 在 `AppShell` 顶部加 **skip-link**（「跳到正文」），聚焦时显形 —— 这是本条**成本最低、收益最大**的一步
2. 67 处非语义靶二选一：能改 `<button>`/`<a>` 就改（语义最好）；改不动（`<div>` 内含复杂子结构）就补 `role="button" tabindex="0"` + **Enter/Space 键处理器**（光加 `tabindex` 而不加键盘事件，得到的是「能聚焦但按 Space 不动」的更坏结果）
3. roving tabindex 抽成 `useRovingFocus.js`，替换 3 处各写各的（后台那 7 处最先，因为它已有雏形）
4. **明确不做**：完整 Switch Control 扫描（那要求整个交互层可被外部开关设备驱动，等价于全局语义重写）⇒ 本阶段只保证「可聚焦 + 有名字 + 有 Enter/Space」，并把这条边界写进 §11

**判据**：新增 `probe-keyboard-reach.mjs` —— 从 `document.body` 起连续 Tab，断言①存在可见 skip-link 且回车后焦点落到 `<main>`；②前 40 次 Tab 覆盖的交互元素集合 ⊇ 视口内可见交互元素集合的 90%；③`role="button"` 的元素按 Enter/Space 均触发。

### D7. 表单控件命名（**新增 2026-10-19 三轮实测**）

> **为什么必须单开**：D4 只覆盖 `<button>`。表单控件的缺口比按钮大一个量级，而且**落在转化最关键的路径上**（发帖、回复、改资料、注销）。

**现状（2026-10-19 实测，`src/*.vue` 静态扫描）**：

| 指标 | 实测 |
| --- | --- |
| `<input>` + `<select>` + `<textarea>` | **398** |
| 有可访问名（`aria-label` / `aria-labelledby` / `<label for>` / 被 `<label>` 包住） | 238 |
| **无任何命名关联** | **160（40%）/ 42 文件** |
| …其中**仅靠 `placeholder` 当唯一线索** | **77** |
| `<label for=…>` 用法总量 | 仅 **28** 处 |
| — 与之对比 `aria-label` | **598** 处 |

**关键分布事实**：`<label for>` 只集中在 `Join/index.vue`、`Login/index.vue`、`Dev/MotionLab.vue`、`OfficialHeroStage.vue` —— **新的注册/引导面做了，旧页面（论坛、个人资料、Cloud+、整个后台）全没做。** 这不是「漏了几处」，是**分界线画在了错误的位置**。

影响最大的未命名控件（全部 placeholder-only）：
```
Forum/components/PostComposer.vue:655,677     帖子标题 + 正文（发帖主路径）
Forum/ForumMain.vue:5479                     引用转发评论框
PostDetail/PostDetailMain.vue:2549,2936      两条回复输入框
user-center/Messages/index.vue:845           消息回复框
user-center/Cloud+/CloudPlusMain.vue:543,551 云端条目标题 + 正文
Profile/components/ProfileEditModal.vue:36-98 昵称/简介/加入日期/生日月日/创作者可见性
user-center/AccountSecurity/index.vue:327,339 注销确认关键词 + 密码
DataManagement/components/KeysAndModels.vue:292-542   10 个控件
```

**动作**：
1. 表单控件一律**`<label for>` 或包裹式 `<label>`**，`placeholder` **只能做补充提示，不能当唯一名字**（placeholder 在输入后消失，且多数读屏不念）
2. 优先补上表 8 类（发帖/回复/改资料/注销 = 高频且后果不可逆），后台 10 个控件次之
3. 假 placeholder（`placeholder="请输入"` 这类零信息文案）本身就该删 —— 它连视觉上都不构成提示
4. `hidden` 的 `<input type="file">` 触发器不计入（无障碍上不构成缺陷）

**判据**：新增 `check:form-label` 门禁（基线 160，棘轮只降不升）+ `probe-form-label.mjs` 在发帖、回复、改资料、注销四条路径上断言焦点到控件时读屏名非空。

### D8. 全局反馈通道与断网态（**新增 2026-10-19 三轮实测**）

> Apple Agency：「用户**始终知道正在发生什么**（加载 / 成功 / 失败 / 可恢复）」。这条拆成三处全仓级别的问题，D1–D7 都不覆盖。

**现状（2026-10-19 实测）**：
- 🔴 **全局 toast 通道无 `role` / `aria-live`** —— `App.vue:427-439` 的 `.welcome-toast` 是全站最常用的通知面（`toast` 279 处 / 36 文件，`Toast` 301 处 / 25 文件），**读屏用户完全听不到**。`App.vue` 唯一的 `aria-live` 在 `:322`（`boh-boot-body`，启动屏，不是 toast）
- 🔴 **`navigator.onLine` 全仓 0 处** —— 只有 2 个 `online` 监听（`stores/auth.ts:418`、`Forum/ForumMain.vue:1197`），**无任何 `offline` 处理**。断网时表现是「点了没反应」，而不是「当前离线」；`网络错误` 只出现 4 次 / 4 文件
- ⚠️ **`aria-atomic` / `aria-relevant` 全仓 0 处** —— 现有 26 个 `aria-live` 区域都会播报**局部 DOM diff**。这会让 D3 的验收判据「点加载更多 → live region 文本变化」抖动或截断（读屏只念变更片段）

**动作**：
1. `App.vue` 的 toast 容器加 `role="status" aria-live="polite" aria-atomic="true"`；失败类用 `role="alert"`（断言式）。**这是一行级改动、零结构风险，却把全站最常用的通知通道从「只有视觉」变成「视觉+听觉」**
2. 所有 `aria-live` 区域**补 `aria-atomic="true"`**（否则 D3 的判据不可靠）—— 存量 26 处，棘轮只准增
3. 新增全局 `useNetworkStatus`：断网时顶栏挂一条可关闭的离线条（不要遮内容、不要阻断操作）；恢复时提示「已恢复连接」并让当前列表重取

**判据**：`probe-aria-live.mjs` 断言 ①触发任一 toast 后 live region 文本完整变化（`aria-atomic`）；②`context.setOffline(true)` 后出现离线提示，恢复后自动消失。

## 9. 阶段划分（按依赖排序，非时间估算）

| 阶段 | 内容 | 体量 | 前置 |
| --- | --- | --- | --- |
| **0 地基** | 四把尺子令牌 + AppShell 骨架 + 安全区 + `--safe-*` | **L** | — |
| **1 导航重写** | 顶栏保浮岛补 safe-area（A2 已拍板）+ 底栏进壳 + rail 进壳 + 首屏 chrome 收敛（标题上收另议） | **L** | 0 |
| **1.5 感知并行** | D1 无障碍扩面 + D3 三态组件 + **D8 toast 播报/断网态**（一行级改动，先做）+ D4 热区/命名（可与 1 并行，互不阻塞） | **M** | 0 |
| **2 栈协议** | `openSurface` + `goBack` + 详情补 URL + 全屏层接 history | **L** | 1 |
| **2.5 焦点协议** | D2 `useModalLayer` 全量迁移（依赖 B1 的模态收口）+ **D6 skip-link / 键盘可达**（不依赖 B1，可并行） | **M** | 2 |
| **3 原生感** | 转场（push/pop）+ 下滑关闭 + 下拉刷新 + 长按菜单 + D5 偏好降级（含 4 处 `prefers-color-scheme` 漏网） | **M** | 2 |
| **4 桌面衍生** | rail 三态 + 双栏详情统一 + 手机横屏补位 | **M** | 1 |
| **5 收口** | 暗色收敛（C2）+ 删页脚 + **D7 表单命名**（160 处，含发帖/回复/注销四条高风险路径）+ 探针补齐 + 门禁上线 | **M** | 1–4 |
| **6 内容层（独立立项）** | 决策 9 策展接回「官方」tab + 决策 10 Accepted Answer + 决策 13 `hot_score` 降级为命名榜单 + 决策 12 AI 席位 | **M**～**L** | **0 + 5**（需令牌与门禁体系就位） |

> ⚠️ **阶段 6 必须与阶段 1–5 分开排期**，理由有两条，缺一不可：
> ① **正交** —— §2.8/§2.9 的全部内容属**内容模型与产品形态**，壳/栈/面/感一样都不解决。把它们塞进阶段 1 会让主线 A 被内容决策反复打断；
> ② **需要前置资产** —— 「策展接回 feed」要复用 §7 C1 的令牌（否则新加的策展位又是一处无旋钮的硬编码），「hot_score 降级」要复用 §12 的门禁体系（否则新榜单没有棘轮保护）。
> **但决策 9/10/13 的 DB 侧准备（schema、迁移）与前端解耦，可以提前并行。**

**阶段 0 内部顺序**（先低风险验证）：
1. 令牌（纯新增，零风险）
2. 安全区（纯新增，零风险）
3. **全局 `.sr-only` 进 `tokens.css`**（D4 的前置项，纯新增，一处定义解锁 226 个按钮的补名路径 —— 必须排在第 3 步补名**之前**）
4. **热区扩区 + 图标命名**（D4，纯 CSS/属性，零结构风险 —— 建议提到这里，先拿一批「用户立刻能感知」的改善）
5. **toast 加 `role="status"` + `aria-atomic`**（D8 动作 1，一行，收益覆盖全站最常用通知通道）
6. AppShell 骨架只接 **ActivitiesWall + Shop**（两个纯文档流页面，最干净）
7. 验证通过后再接 Home / UserSpace

> 为什么把 D4 / D8 提前：它们是**唯一一个不改架构、当天就能验证**的可用性改善（34×39 → 44×44；toast 静默 → 有播报），也是后面所有手势/栈改造的地基 —— 热区不准、手势误触率会掩盖其他问题；反馈通道不响，用户会觉得「点了没反应」。
>
> **D7 为什么留在阶段 5 而不提前**：160 处表单命名是**批量文本工作**，一次做完会被功能开发插队挤掉；放到阶段 5 可以按「先 8 类高风险、后 152 处」的顺序分批，且此时表单结构已因壳的改造稳定下来，改起来返工少。**但棘轮必须从阶段 0 就上线**（基线 160），否则中途新增会污染计数。

---

## 10. 需要拍板的 13 个决策

| # | 决策 | 选项 | 建议 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | 竖屏顶栏形态 | 通栏 / 保留浮岛 | ✅ **已拍板（2026-10-19）：保留浮岛** | 用户明确要悬浮胶囊；safe-area 走 A2 折中解，底部安全区照做 |
| 2 | 底栏席位 | 4 / 5 | **5**（内容 / 活动 / AI / 消息 / 我） | 活动现在埋在分区 tab 里，是站内第二重心；4 席挤不下 |
| 3 | 详情默认呈现 | sheet 优先 / push 优先 | **可分享的 push，其余 sheet** | 保证刷新与分享，同时保留轻快感 |
| 4 | 桌面端定位 | 壳的 rail 形态 / 独立桌面体验 | **壳的 rail 形态** | 一份代码一套心智；独立体验会让每次改动都要做两遍 |
| 5 | 是否上 Capacitor / 原生壳 | 上 / 不上 | **不上** | PWA + TWA 已就绪（`vite.config.js:411-445` 的 PWA manifest 块、`android-twa/twa-manifest.json`）；上原生壳要重做推送、支付、审核，成本远超收益 |
| 6 | **液态玻璃的边界**（Apple 规则 vs 品牌资产） | A 严守 HIG：玻璃只做导航/浮层，内容全实底<br>B 品牌优先：内容卡保留玻璃，只提高不透明度<br>C 分区：阅读型内容实底，展示型/营销页保留玻璃 | **C**，**且必须显式裁定横屏** | A 会削掉品牌识别；B 会在帖子/评论上牺牲可读性；C 两者都保住，代价是要维护一张「哪类内容可用玻璃」的白名单。⚠️ **2026-10-19 三轮实测新增的裁定点**：§2.6 查出 `PostDetail` **竖屏已把 `.x-main-column` 玻璃全摘、横屏却保留**（`style.scoped.css:1344-1351`），即横屏现状**正在违反本计划自己刚定的规则**。选 C 必须回答：横屏阅读型内容是留玻璃（等于 B 的例外）还是跟进竖屏（视觉变化大）。**另注：`check:liquid-glass` 抓不到任何一条层级违规**（详见 §2.6），`check:glass-on-content` 是全新工作而非扩展 |
| 7 | **正文字号基准** | A 15px 正文 + 12px 元信息<br>B 14px 折中<br>C 保持 13px 现状 | **A** | Apple Body 是 17pt，Web 15px 是可读性与密度的平衡点；12px 元信息保住列表密度。代价是部分卡片要重排（用 `probe-text-zoom` 兜底） |
| 8 | **无障碍是否作为发布阻断项** | A 是：D1/D2/D4 未达标不发版<br>B 否：作为「持续改善」不阻断 | **A** | 这是本章唯一一条「治理决策」：一旦定为不阻断，D 主线会永远排在功能后面（历史上暗色、性能都这样拖过）。阻断范围可收窄为「新增违规为 0」，不要求存量清零 |
| 9 | **策展接回 feed**（§2.8） | A 周报精选带署名进「官方」tab<br>B 进 feed 顶部固定位<br>C 维持现状（策展只在 splash gate 与侧栏） | **A** | BOH 已有的两套策展都长在错误的地方：`home_heroes` 驱动进站前的 splash gate，AI 周报 `featured_posts`（**已带 `reason` 字段**）躺在侧栏不回 feed。进 feed 的是裸 `created_at DESC`。A 最便宜 —— 只需把周报已产出的数据接到「官方」tab 并补一个署名位（对齐 Apple「By <策展人>」模式）。B 会挤占首屏，与 C4「首屏 chrome 收敛」直接冲突。**注意此项与主线 A/C 正交，须独立排期** |
| 10 | **论坛是否引入 Q&A 语义**（§2.8） | A 加 Accepted Answer（楼主标记采纳）<br>B 再加「官方推荐」徽章<br>C 两者都做<br>D 不做 | **A**，B 视运营人力再定 | Apple 论坛的权力来自「被采纳/被官方推荐」，BOH 来自粉丝数（`ProfileMain.vue:354-356`）。A 语义清晰、权限天然（仅楼主）、**不需要任何运营人力**，能立刻改变「什么样的行为被奖励」。B 技术是 S，但需要有人每天真的在看 —— 没有运营承诺的徽章是空壳，会比不做更伤。⚠️ **前置判断**：BOH 4 个标签里只有「#提问」是提问类，所以 A 只对这类帖子生效，**不要试图全站改造** |
| 11 | **AI 来源披露口径**（§2.9） | A 如实披露（改 prompt + UI）<br>B 只加 UI 静态说明，不动 prompt<br>C 维持现状，并把 §2.2 Responsibility 的措辞改成它实际能兑现的范围 | **本轮：C**（2026-10-19 用户裁定：**只记录事实，暂不改 prompt**） | 事实是：实际推理在 SiliconFlow / 智谱云端（`bohai-model-client.js:68-73`），而 prompt 明令禁止提及第三方（`chat-engine-config.js:159`）。与 §2.2 原则 3「保持透明」方向相反。<br>**若最终不披露，C 是唯一诚实的选项** —— 不是删掉原则，而是把原则的表述边界改成它兑现得了的范围，避免文档挂一条永远不兑现的承诺。改 prompt 属产品口径变更，需单独评估回归断言，不应混进形态改造 |
| 12 | **AI 是否该占底栏一席**（§2.9） | A 保持现状（AI 一级席位）<br>B 降级为岛，底栏换内容形态<br>C 混合：底栏留席 + 岛做成真正跨页入口 | **C** | Apple Music 五席全是内容形态，AI 不在其中。但**这条不能照抄** —— Apple 有系统级 AI 可依附，BOH 是独立网页 APP 没有系统层，AI 不占席位就没有一级入口。B 会牺牲 AI 的可达性。折中即 C |
| 13 | **`hot_score` 去留**（§2.8，建议随决策 9 一起拍） | A 降级为命名榜单「本周热门」，默认排序回归纯时间序<br>B 改单指标（去掉 `comment×1.5`）<br>C 维持现状 | **A** | 现公式 `like×1.0 + comment×1.5 + recency/24` 有三处结构问题：**评论权重 1.5× 于赞**（等于把吵架定价成好看）、**48h 硬崖**（超时 recency 归零只剩互动量）、**全局加权和而非个性化**（所有人看到的「最热」完全相同）。且**无法按赞单独排序** —— 榜单根本不存在。Apple 的 Top Charts 是单指标降序 + 有名字 + 有时效。A 同时解决「假榜单」与「默认排序被两个按钮承担」两个问题 |

---

## 11. 明确不做

| 不做 | 理由 |
| --- | --- |
| 全量重写 11,320 个裸色 | 收益/风险比极差；用「新代码强制 + 搭便车替换 + 棘轮」替代 |
| 引入 UI 框架（Vant / NutUI） | 现有液态玻璃与动效体系是品牌资产，框架会推翻它 |
| 改品牌色 / 液态玻璃材质 | 与本目标无关，`check:liquid-glass` 门禁已锁 |
| 动 BOHAI 交互 | 它已经是全站最像原生的一页（去顶栏 + 球态 + 输入框 FLIP），别修好的 |
| 改 `useIsland` 仲裁逻辑 | 优先级（AI > 任务 > 通知）是经过验证的，只升级宿主不改仲裁 |
| **复刻 iOS 原生 chrome** | 不引入 SF 字体文件（系统栈 `ui-sans-serif, system-ui` 已经能在 Apple 设备上拿到 SF）；不仿 iOS 状态栏、开关、返回箭头。**要的是 HIG 的判据，不是 iOS 的皮** |
| **玻璃叠玻璃** | HIG 明确不鼓励；本仓已有「嵌套玻璃退化为静默填充」规则（`liquid-glass.css:98-110`），继续守住 |
| **用彩带/全屏庆祝当 Delight** | 与 Deference 冲突；情感回应优先走灵动岛、微动效、文案 |
| **空间计算 / 3D 悬浮元素** | 2D 内容产品做这个是纯成本；只取「触控目标尺寸」一条转译 |
| **承诺 iOS 触感反馈** | `navigator.vibrate` 在 iOS Safari 不可用，承诺了就是空头支票 |

---

## 12. 验收：新增探针与门禁

现有探针（`probe-home-forum-rail` 21、`probe-rail-landing` 45、`probe-composer-session-gate` 26、`probe-global-search` 58 等）**全部依赖当前几何**，改造期必然大面积红。必须先建新基线，再动结构。

### 新增探针

| 探针 | 断言要点 |
| --- | --- |
| `probe-app-shell.mjs` | 切 tab 时导航 DOM **不重建**（MutationObserver 计数）；壳是唯一滚动容器；`position:fixed` 的导航只在壳内出现 |
| `probe-safe-area.mjs` | 模拟 `safe-area-inset-*` 非 0 时，顶栏内容不进入状态栏区、底栏内容不进入手势区 |
| `probe-back-stack.mjs` | 发帖编辑器/购物袋/图片查看器打开时按返回 → **只关层不退页**；`history.length` 不增长 |
| `probe-sheet-gesture.mjs` | 下滑超过阈值关闭；未达阈值回弹；关闭后焦点回到触发元素 |
| `probe-responsive-parity.mjs` | 同一页面在 390 / 834 / 1440 三档下，**头部组件的 class 序列必须一致**（允许少列，不允许换组件）；违反即红 |
| **`probe-touch-target.mjs`** | 可见交互元素命中区 ≥44×44（含 `::after` 扩区，用 `elementFromPoint` 实测）；相邻热区间隙 ≥8px；主操作 ≥48×48 |
| **`probe-focus-trap.mjs`** | 模态打开后连按 12 次 Tab 不逃出；背景 `inert`；Esc 关闭；关闭后焦点回触发元素 |
| **`probe-state-trio.mjs`** | 列表页：加载中有 `aria-busy`、空态有主行动、失败有重试按钮且可点通 |
| **`probe-text-zoom.mjs`** | 浏览器字号 200% 下正文不截断、按钮文字不溢出、底栏不重叠 |
| **`probe-reduce-motion.mjs`** | `reduce` 下无位移/缩放动画，但状态切换仍有可感知的 opacity 过渡（回归 `animations.css:1028` 那三条） |
| **`probe-concentric-radius.mjs`** | 嵌套圆角满足 `inner = outer − padding`（±2px）。**基线按 §2.6 实测取**：12 对中 2 组完全合规、2 组容差内、8 组违规 ⇒ 首次落基线时**先锁合规组、只对违规组棘轮**，否则一上线就红 |
| **`probe-keyboard-reach.mjs`** | 存在可见 skip-link 且回车后焦点落到 `<main>`；前 40 次 Tab 覆盖 ≥90% 视口内可见交互元素；`role="button"` 元素按 Enter/Space 均触发（D6） |
| **`probe-form-label.mjs`** | 发帖 / 回复 / 改资料 / 注销四条路径上，焦点到控件时读屏名非空（D7） |
| **`probe-aria-live.mjs`** | ①触发任一 toast 后 live region **完整**变化（`aria-atomic`）；②`context.setOffline(true)` 后出现离线提示、恢复后自动消失（D8） |
| **`probe-ranked-signal.mjs`** | 若决策 13 选 A：断言「本周热门」榜单存在**名字与时效标注**，且默认 feed 排序为纯时间序；榜内条目与默认序的差异必须可解释（决策 13 / §2.8） |
| **`probe-curation-feed.mjs`** | 「官方」tab 内每条精选都带署名与理由；且精选条目的 `reason` 非空（决策 9 / §2.8） |
| **`probe-glass-hierarchy.mjs`** | 阅读型容器（`.post-card-v2` / `.x-main-column` / `.x-inbox-list` / `.source-content` / `.table-scroll` / `.answer-block` / `.post-text-v2` / `.comment-*` / `.activity-card`）的计算样式里 `backdrop-filter` 必须为 `none`。**横竖屏都测** —— 竖屏已合规（`PostDetail/style.scoped.css:1344-1351`），横屏是已知违规 |

### 新增门禁（全部带 fixture，`check:gates-self-test` 可自证）

| 门禁 | 规则 |
| --- | --- |
| `check:app-shell` | `src/views/**` 内禁止出现 `position:fixed` 的导航/底栏（白名单：AppShell 目录） |
| `check:z-index` | 只允许 `var(--z-*)`，禁止裸数字（存量棘轮，只降不升） |
| `check:font-size` | 新增/修改的文件禁止裸 px 字号（存量棘轮） |
| `check:no-footer` | 新页面禁止挂页脚 |
| **`check:glass-on-content`** | 解析模板 `class="…liquid-glass…"`，回溯祖先链，命中阅读型选择器清单即红；种子基线锁现有 22 处，只卡**增长**。⚠️ **这是全新工作，不是扩展 `check:liquid-glass`** —— 后者是 CSS 文本字面量匹配器（`scripts/check-liquid-glass.mjs`，73 行），不解析选择器/DOM/内容-外壳概念，且只拦 `blur(≥14px)`、看不见 `var(--liquid-filter*)`。详见 §2.6 |
| **`check:icon-label`** | 纯图标 `<button>` 必须有 `aria-label`/`aria-labelledby`；**基线 14**（2026-10-19 严格口径实测，见 D4 口径更正，非初稿的 58） |
| **`check:state-trio`** | 含异步列表的新页面必须有 loading + empty + error 三态组件 |
| **`check:focus-outline`** | `outline: none/0` 必须同时给出 `:focus-visible` 替代样式（存量 122 处棘轮，2026-10-19 复测） |
| **`check:form-label`** | `<input>`/`<select>`/`<textarea>` 必须有 `<label for>`、包裹式 `<label>` 或 `aria-label`；`placeholder` 不算。**基线 160 / 42 文件**，棘轮只降不升（D7） |
| **`check:click-ability`** | `div`/`span`/`li`/`p`/`i` 带 `@click` 必须同时有 `role` + `tabindex` + 键处理器；**基线 67 / 41 文件**（D6） |
| **`check:scheme-bypass`** | 全仓禁止裸 `@media (prefers-color-scheme: dark)`（必须受 `[data-theme]` 约束）。⚠️ **先把 `probe-dark-admin-theme.mjs:205` 的文件级断言升为全仓级**再落地此门禁 —— 同一 bug 类已在 DataManagement 修过并有守卫，守卫范围窄了 4 个文件（D5） |
| **`check:glass-pref-degrade`** | 已落地 `prefers-reduced-transparency` 的 10 处不得回退（棘轮只增不减，D5） |
| **`check:live-atomic`** | 新增 `aria-live` 区域必须同时写 `aria-atomic`（存量 26 处 `aria-atomic` 为 0，棘轮只增不增）（D8） |
| **`check:curation-authored`** | 进入信息流的精选内容必须带**署名**（人工策展人或规则名），对齐 Apple「By <策展人>」模式；无署名的 AI 精选不得直接进 feed（决策 9 / §2.8） |
| **`check:accepted-answer`** | 「提问」类标签的帖子若渲染了采纳态，必须同时渲染「已解决」徽章与采纳人入口；禁止出现无主采纳（决策 10 / §2.8） |

> **纪律**：每条新门禁必须先在 `scripts/lib/gate-fixtures.mjs` 里放一个已知违规样本，由 `check:gates-self-test` 注入并断言退出码非 0。**没有 fixture 的门禁等于没有门禁**（本仓吃过两次「检查在跑但永远绿」的亏，见 `AGENTS.md` §2）。
>
> ⚠️ **本次新增 9 条门禁的额外风险**（2026-10-19 记录）：`AGENTS.md` §2 已明载本仓出过两次「门禁永远绿」，且根因都是**判据写成文本匹配**。本轮 §2.5 对照表里就有两处（`prefers-reduced-transparency` 与 focus-trap）因为 grep 了错误的字符串而得出反向结论。⇒ **这 9 条里每一条的 fixture 都要选「真实存量违规样本」而不是玩具样本**，否则测的是门禁自己的正则，不是产品。
>
> ⚠️ **`check:glass-on-content` 与 `check:click-ability` 需要结构化解析，不能用正则**：前者要回溯模板祖先链，后者要判断「元素是否真有键盘处理器」。这两条落地前应先评估能否复用现有的 HTML 解析依赖（`vitest` 环境已有 jsdom 依赖），**不要**手搓模板切分器 —— `AGENTS.md` §5 记了 `audit:coupling` 因手搓边界出过两次错的原因。

---

## 13. 主要风险

| 风险 | 触发点 | 缓解 |
| --- | --- | --- |
| Home 开场画被打断 | `Home/style.scoped.css:75-101` 依赖满屏 `position:fixed` + `touch-action:none` | Home **最后**接壳；先 ActivitiesWall / Shop 验证 |
| 顶栏改造撞 `!important` 墙 | `vendor/unified-nav.css` 145 处 `!important` | **已解除**（2026-10-19 拍板保留浮岛，不改形态只调偏移量）；若后续仍要清零，单独一个 PR |
| 探针集体红 | 上述 5 个探针共 166+ 条断言依赖当前几何 | 先建新基线（壳存在时的正确几何），再改结构；红不代表回归 |
| 第 4 套底栏被遗忘 | `Shop/index.vue:298` 的 `.shop-bottom-nav` | 阶段 1 直接删掉，商城并入全局五席 |
| 键盘适配三套并存 | `--kb-inset` / `--pd-dock-inset` / `--boh-visual-height` | 阶段 2 收敛为 `--kb-inset` 一套，PostDetail 与 Login 跟随 |
| **焦点协议接漏** | 39 个 `Teleport` 层分散在 28 个文件，逐个接必漏 | 不做「逐个补」，做「统一收口」：先建 `useModalLayer`，再用门禁禁止裸 `Teleport`（白名单逐步清空） |
| **玻璃实底化削弱品牌观感** | 决策 6 选 C 后，阅读型内容失去玻璃质感 | 先在论坛列表 + 帖子详情两个页面 A/B；保留外框玻璃、只把文字块做实底，视觉损失最小 |
| **15px 正文导致布局溢出** | 3,252 处 px 字号（2026-10-19 复测）背后是硬编码高度 | 只改正文/标题类，不全局改 `html`；用 `probe-text-zoom` 与 200% 字号兜底 |
| **热区扩到 44 会撑高列表** | 论坛卡片行高、底栏间距 | 用 `::after` 扩热区而不是改元素尺寸；视觉零变化，命中变大 |
| **无障碍被功能插队** | 决策 8 若选「不阻断」，D 主线永远排最后 | 决策 8 建议选 A，且阻断范围只卡「新增违规为 0」，不要求存量清零 |
| ⭐ **新门禁本身是假绿** | 本次要新增 **9 条**门禁；本仓已有两次「检查在跑、但永远绿」的前科（`check-project-structure` 只过滤 `.js`、`check:dark-tokens` 跑在观察模式） | 每条先在 `gate-fixtures.mjs` 放**真实存量违规样本**并跑 `npm run check:gates-self-test`；`check:glass-on-content` / `check:click-ability` 需结构化解析，禁止正则 |
| ⭐ **本文自身的数字可能已被推翻** | §2.5 对照表全部基于 2026-10-19 静态计数；退场/改动后即失真 | 每行都给了判据命令；改任一维度后**当场重跑并更正本文**，不要只在别处修（`AGENTS.md` §3：判据变则旧结论自动作废） |
| ⭐ **§2.8/§2.9 被当成形态工作插队** | 阶段 6 与阶段 1–5 依赖不同、性质不同 | 已在 §9 强制拆分为独立阶段；DB 侧可并行，UI 侧必须等阶段 0/5 |
| ⭐ **「官方推荐」徽章做成空壳** | 决策 10 的 B 需要有人每天真的在看；没有运营承诺的空徽章比不做更伤 | 本轮建议只做 A（Accepted Answer，零运营依赖）；B 必须先有运营承诺才排期 |
| ⭐ **§2.2 Responsibility 挂着不兑现的承诺** | 决策 11 本轮裁定「只记录事实」，与原则 3 的透明要求方向相反 | 已列为决策 11；若最终不披露，唯一诚实的收口是把原则的**表述边界**改成它兑现得了的范围，而不是删掉原则 |
| **决策 6 不裁定横屏，规则会和代码打架** | `PostDetail` 竖屏已摘玻璃、横屏保留；§2.3 裁决表写「阅读型一律禁止玻璃」 | 决策 6 必须显式覆盖横屏，并写进 `probe-glass-hierarchy.mjs` 的断点矩阵 |

---

## 14. 建议的下一步

1. **拍 §10 剩余 7 个决策**（决策 2 底栏席位决定阶段 1 的全部工作量；决策 6/7/8 决定 C 与 D 主线的边界）。**决策 6 必须显式裁定横屏**（见 §13 风险）
2. 拍板后把本文拆成 `plans/030-app-shell-stage0.md` 施工单（含逐文件改动清单）
3. **零风险四件先做**：全局 `.sr-only`（D4 前置）、四把尺子令牌、safe-area、D4 热区扩区 + 图标命名 —— 前三件不改架构、当天可验证
4. **D8 动作 1（toast 加 `role="status"` + `aria-atomic`）单独立一个 PR** —— 一行级改动，覆盖全站最常用的通知通道，收益与风险比最高
5. 阶段 0 与「BOHAI 模型升级」（纯后端）并行，互不阻塞
6. 所有前端功能项（表情、多模态、Work generators）等阶段 1 完成后再排
7. **D1 无障碍扩面立即启动**：它不改任何产品代码，只是把探针覆盖面从 5 页扩到 12 页 —— 先让债可见，再谈还债
8. **把 `probe-dark-admin-theme.mjs:205` 的文件级守卫升为全仓级**，锁住那 4 处漏网的 `prefers-color-scheme`（现只有 DataManagement 有守卫）
9. **拍 §10 决策 9–13**（新增五个）。建议**先拍 13 + 9**（`hot_score` 降级 + 策展接回 feed）：两者都只改排序与一个 tab，DB 侧可立刻并行，UI 侧等阶段 0；**决策 11 需单独评估**（改 prompt 的回归面），不要混在形态改造里做
