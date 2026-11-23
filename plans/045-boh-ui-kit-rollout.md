# 045 — Boh UI Kit：全站组件统一（大换血）

> **执行框架定稿（2026-11-23 用户确认）：组件层从零建 + 两条铁律。**
> · Kit 在 `src/components/ui/` 从零设计（API 按 Demo 定稿），**不继承旧组件实现**；
>   旧件（UserCenterPageHeader/EmptyState/SegmentTabs…）最终变成消费者后被替换下线。
> · 铁律 A：Kit 合入之日起，**新页面/新功能必须用 ui/ 组件**——门禁棘轮锁死
>   （新增手写 position:fixed 弹层 = exit 1；新增裸写 backdrop-filter = exit 1）。
> · 铁律 B：存量按本计划家族顺序渐进迁移，迁完一个锁一个，方向不可逆。

> 依据：2026-11-23 全站四域并行扫描（社区 / 商业管理 / 用户中心 / 横切层）+ Demo 原型
> `docs/demos/boh-ui-kit-demo.html`（v0.1，探针 `scripts/probes/probe-ui-kit-demo.mjs` 24/24）。
> 视觉基因：论坛 UI 的 `--liquid-*` 液态玻璃体系，**不另起材质**。
> 目标：页面不再自带 UI，只负责内容和数据。

## 0a. 动画过渡层（用户明确要求：组件自带动画，页面零配置）

真源是 tokens.css 既有 motion 单源（--duration-* / --ease-* / --motion-* Ladder），
Kit 原则：**动画长在组件里，tokens 是唯一参数**。

| 组件 | 内置动画 | token 口径 |
| --- | --- | --- |
| BohButton | 按压 scale(0.97) / hover 抬升 / loading spinner 无缝替换文字 | --duration-press(160ms) + --ease-emphasized |
| BohModal / BohSheet | 遮罩淡入 + 弹窗上浮缩放；Sheet 底部滑入；关闭走出场 | --duration-slow(360ms) + --ease-emphasized |
| BohToast | 顶部滑入淡入 / 到时滑出 | --duration-base(240ms) + --ease-emphasized |
| BohDropdown / Popover | 面板上浮展开；位置翻转有过渡 | --duration-base + --ease-emphasized |
| BohNavHeader | 返程离场（位移+淡出） | --motion-morph-out(360ms) + --ease-morph-out（**棘轮现值不许动**） |
| 列表/卡片容器 | 入场 stagger（55ms/项，最多叠 6 项） | --motion-stagger / --motion-stagger-max |
| BohSpinner / Skeleton | spin 0.8s / shimmer 1.4s 循环 | 全站唯一 keyframes |
| BohSwitch / Segmented | 滑块位移 / 选中胶囊滑动 | --duration-base + --ease-emphasized |
| 卡片↔详情（跨屏形变） | 窗口展开/收口 | --motion-morph-in(620) / -out(360)，经 motion.js 读 token |

实现约定：
- `src/components/ui/motion.css` 收敛过渡预设类（.boh-enter / .boh-exit / .boh-stagger）+
  Vue `<Transition name="boh-...">` 约定；动画内置在组件里，业务页面**零 CSS**。
- 门禁：新组件动画时长**禁止写死毫秒**，必须读 token（与 motion.js「JS 不写第二份
  毫秒数」同一条纪律）。
- 可达性：`prefers-reduced-motion` 下一律退化为直切（liquid-glass.css 交互类已有先例）。

## 0. 统一清单（18 必选 + 1 第二批）

| # | 组件 | 现状规模（实测） | 共享实现现状 |
| --- | --- | --- | --- |
| 1 | 材质层 Liquid Glass（地基） | 56 文件裸写 backdrop-filter | tokens.css + liquid-glass.css 已单源，缺的是采用 |
| 2 | 按钮 BohButton | btn-primary 17 文件 62 处；21 文件硬编码蓝 hex | GlassPillButton 仅 3 文件用 |
| 3 | 弹窗 BohModal | 68/213 视图手写遮罩 | 无；useDialogFocusTrap 是积木 |
| 4 | 底部 Sheet BohSheet | Shop 9 份同源弹层（源码注释自认同源） | store-tokens.css 只共享了 token |
| 5 | 确认框 BohConfirm | 3 处原生 confirm 残留 | useConfirmDialog 22 import，基本统一 |
| 6 | Toast notify() | 8 套手写状态机；notify.js 3 调用方；三通道并存 | 通道存在 |
| 7 | BohSpinner + 骨架屏 | 17 文件 spinner；28 文件 4 套骨架命名；keyframes 重定义 113 次 | 无 |
| 8 | 空态 EmptyState | 34 文件手写 | 已有，采用 3/11（user-center 域） |
| 9 | 输入件 Field 族 | 5 套字段组（ck-/am-/field-group/field/gs-） | 无 |
| 10 | 标签 Tag/Badge | 各页 ≥9 套写法 | 无 |
| 11 | 头像 Avatar | 55 文件各自渲染 | 无（仅裁剪弹窗共享） |
| 12 | 导航头 BohNavHeader | 22 文件手写返回按钮 | UserCenterPageHeader 域内 93%，域外 0 |
| 13 | 下拉/选择器 BohDropdown | 15 文件手写 | 无 |
| 14 | 无限滚动 useInfiniteScroll | 10 文件手写 IntersectionObserver | 无 |
| 15 | 图片查看器 ImageLightbox | Forum/PostDetail 两份逐行级复制分叉 | 无 |
| 16 | 设置分组行 GroupedSettingList | 9 面板复制 gs-row/gs-group | 无；ProfileSettingsPanel 是蓝本 |
| 17 | 上传管线 useUploadPipeline | 编排 5+ 处重复（Join 380 行手搓） | 原语全共享（AvatarCropModal 7 方） |
| 18 | 筛选 Chips | 23 文件手写 | 无 |
| 19 | 卡片 BohCard（第二批） | border-radius 裸写 1041 处/129 文件 | 渐进迁移，不设门槛 |

## 1. 阶段划分

### 阶段 0 · token 打底（先做，半天）—— ✅ 2026-11-23 已完成（新 token 为增量，物理更名挪到阶段 5）
- ~~`--boh-brand-blue` 更名~~ → **调整**：`--boh-brand-blue` 15 文件在用，阶段 0 不动它；改为在 tokens.css **增量新增语义色层**（--boh-accent/-accent-text/-accent-strong/-accent-soft + success/warning/danger/info 五类 soft 变体），物理更名放到阶段 5 BohButton 迁移时随消费者一起切换。
- 暗色主色 `#0a84ff` 压深到 `#0a72da`（白字 3.65→4.74:1）+ `--boh-accent-text`（暗 `#6cb0ff`）：已落地 tokens.css，亮/暗/home-cat/anniversary-mc 四套全配齐，单测锁定。
- `src/components/ui/` 规范就位：一组件一文件 + 源码守卫测试（本仓无 jsdom，测试 = 纯函数 + 源码断言，见 tests/unit/boh-ui-kit.test.js）。

### 阶段 0.5 · motion.css 预设层 —— ✅ 2026-11-23 已完成
- `src/components/ui/motion.css`：boh-pop / boh-fade / boh-slide-up 三组 Vue Transition 预设 + .boh-stagger-item 列表入场（55ms 步长、6 项封顶，读 Ladder token）+ prefers-reduced-motion 全降级。
- 已由 main.js 全局加载；**守卫**：预设层禁止写死毫秒（var() 回退值也不行——首版踩过，单测锁）。

### 阶段 1 · 零成本收割（1–2 天，全是「通道已有、只做迁移」）
1. **Toast 统一**：8 套手写 → `notify()` 单入口（五类语义）。HeroConsole/ShopConsole 的 console-toast 逐字相同直接删。顺带决策三通道收敛：toast=轻提示 / showIsland=强提示，`stores/notifications.ts` 与 App.vue 双渲染层合并。
2. **EmptyState 补采用**：34 文件迁移；收编 Bolek 的 BohEmptyState 双胞胎；Messages 同文件混用两套的一并清。
3. **useConfirmDialog 清尾**：3 处原生 confirm、AddressManager 手写残留弹窗。
4. **僵尸 composable 处置**：useGlassBlur / useImageLoaded / useImageFailure / useKeyboardInset / useSwipeActions / useScrollStage / useDebounceThrottle / useRoutePrefetch 零外部消费——逐个二选一（接入或删除），不许保持现状。

### 阶段 2 · 浮层体系（3–5 天，最大宗）
1. `BohModal` + `BohSheet`：Teleport + 遮罩 + 滚锁（useBodyScrollLock 内置）+ 焦点陷阱（useDialogFocusTrap 内置）+ 暗色 + 窄屏自动 Sheet 化。
2. 试点收割：Shop 9 份弹层 + HeroConsole 的 lottery-picker；随后 PostComposer 3 套 overlay、Profile/DataManagement 各手写 Modal。
3. `BohDropdown`：触发器 + 玻璃面板 + 外点/Esc 关闭 + 位置翻转；收 PostComposer「更多」、Messages 筛选、管理台 UserPicker 泛化。

### 阶段 3 · 内容基元（2–3 天）
1. `BohSpinner` + `SkeletonLine/Block`：全站唯一 spin 与 shimmer keyframes；删孤儿 AiChatSkeleton、归并 ProfileHomeSkeleton。
2. `BohNavHeader`：泛化 UserCenterPageHeader（back/title/actions + embed 模式），收编 22 个手写返回按钮；返程动画内置 `--ease-morph-out`（620/360 棘轮口径不动）。
3. `useInfiniteScroll(target, onLoadMore)`：10 处哨兵收敛；ForumMain 一文件双 observer 的先收。

### 阶段 4 · 形态件（3–5 天）
1. Field 族（Input/Textarea/Switch/Segmented）：统一玻璃面 + accent 聚焦环 + 错误态；5 套字段组按此收敛。
2. `GroupedSettingList`：9 个 gs-row 面板数据驱动化。
3. Tag/Badge + 筛选 Chips：五类语义胶囊 + 选中态 accent。
4. `ImageLightbox`：Forum 版为基准合并 PostDetail 版（两份几乎同源，合并即消双份 bug 面）。
5. `useUploadPipeline`：选图→压缩→裁剪→审核→上传→回填一条 composable；Join/Forum/NewsEditor/ShopEditor 编排接入。

### 阶段 5 · 按钮与主色（最后，影响面最大）
1. `BohButton`：四档权重 × 三尺寸 + 内置 loading；纪律：**primary 一屏一个**。
2. 21 文件硬编码蓝 hex → token；62 处 btn-primary 渐进替换。
3. BohCard 渐进迁移（允许长期共存，只锁新页面必须用）。

## 2. 门禁与验收纪律（每阶段不变式）

- 每迁一个家族：`npm run verify:fast` + 家族专属探针；**样式类改动必须截图肉眼过**（程序化差分抓不住大面积塌陷）。
- 材质：新组件禁裸写 `backdrop-filter`，只准走 `.liquid-glass` 类；`check:liquid-glass` 把关。
- lint 警告棘轮（现值以 package.json 为准）只许下调；清理一批随手下调。
- 视觉回归探针（portrait-visual-audit 等）在阶段 2/5 结束后各全量跑一遍。
- 每家族迁完，把旧写法加进对应 check（如 `backdrop-filter` 裸写计数棘轮化），防回潮。

## 3. 风险与纪律

- **并行会话**：动 src/ 大搬迁前 `git status --porcelain` 核对在途改动；一次 commit 只带一个家族。
- **破坏性阈值**：删组件/删 composable 前先全仓搜引用（AiChatSkeleton 教训：看着像共享件其实是孤儿，反之亦然）。
- **返程动效棘轮**：BohNavHeader 内置 `--ease-morph-out` 时不得改 tokens 现值；改档走 plans/035 的口径。
- **自定义主题**：home-cat / anniversary-mc 两套主题的语义 token 层（tokens.css:249 起）必须同步吃到新组件——验收探针在两主题下各跑一遍对比度。

## 4. 本计划的交付锚点

- Demo（视觉与交互口径真源）：`docs/demos/boh-ui-kit-demo.html`
- 探针：`scripts/probes/probe-ui-kit-demo.mjs`（24 断言，`DEMO_FILE` 可覆盖被测文件）
- 扫描证据：2026-11-23 工作日志（`.workbuddy/memory/2026-11-23.md`）

## 5. 执行进度（按 commit 追加）

| 日期 | 批次 | 结果 |
| --- | --- | --- |
| 2026-11-23 | 阶段 0 + 首批组件（`70a45ba7`） | 语义色层 + motion.css + BohButton/BohModal/BohToast + 21 断言 |
| 2026-11-23 | Toast 统一（`e8e0b591`） | 9 处手写 toast → bohtoast，18 文件净删 348 行 |
| 2026-11-23 | 确认框清尾（`7f538b26` `ce0571e9`） | 5 处原生 confirm → useConfirmDialog，全仓归零 |
| 2026-11-23 | EmptyState 第一批（`05b5220b`） | user-center 域 7 文件 14 处，净删 123 行 |
| 2026-11-23 | EmptyState 第二批 | BOH8YearsEvent ×2、SharedMemoryManagement、PostDetail（4 处结构简单空态）；**例外保留**：ForumMain（4 分支 + chip）、DataAdmin（3 分支 + 筛选 chip）——强收会让结构退化。BohEmptyState 不是「双胞胎」：只有一行品牌字标、形态不同，不收编（死 props 另清）。28/28 验收断言 + 双主题截图人眼过 |
