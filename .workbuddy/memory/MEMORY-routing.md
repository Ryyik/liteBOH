# 路由 / 交互 / 单源 —— 分册

> 从 `MEMORY.md` 外置（2026-10-31）。**动路由、交互逻辑、跨模块单源前读它。** 主索引见 `MEMORY.md`。

## 路由

- `key=route.path`（禁 fullPath/name）；`<script setup>` 运行时 API 显式 import；
  `ForumMain` 的 `watch immediate` 禁同步调下方 `const`（TDZ）。
- UserSpace 旧 tab 映射单源 `resolveRequestedUserSpaceTab()`；直接用裸 `route.query.tab` ⇒ 旧值失映射＝整页白屏。
- 可见性单源 `isGlobalNavbarVisible(route)`；首页入场真源 `.home --gate-p`（`probe-home-gate-pull` 50）；
  竖屏菜单 `probe-nav-mobile-menu`(48)；概览岛唯一触发点＝首页 `gateSettled` 落定。

## 交互 / 组件

- `useConfirmDialog` 互斥**会 reject** → 调用点把预期拒绝归化成取消，别删那条 reject。
- ⚠️ 手动输入框时**不能整体重绘**（光标会丢），单独 sync 提交按钮 `disabled`。
- 自动增高真源 `composables/useAutoGrowTextarea.js`（**勿加第 5 份**）；上限只声明在 CSS `max-height`；
  空内容先摘 `placeholder` 再量；`height='auto'` 后必须无条件写回。护栏 `probe-reply-autogrow`(10)。
- ⚠️ 发帖 FAB 是**双宿主**：首页 `/` 与 UserSpace 的「内容」tab（`?tab=community`，无 tab 参数也算）；
  竖屏下内嵌 PostComposer 是 `v-if="!isMobileComposerMode"` **不渲染**，FAB 是唯一发帖入口 ——
  **别按「只属于首页」把它收回去**（2026-10-06 c19a35dc 这么收过，导致「我的→内容」竖屏零入口）。
  护栏 `probe-user-space-ia` 两条（挂载 + `closest` 遮挡）。
- 头像框：佩戴同步唯一注册点 `initAvatarFrameSync()`；url→id 反查不到**保留本机**、绝不回落 none；
  `avatar_frames.url` 发布后不可变；本机 key `boh-avatar-frame-id/-owner/-pending`。
- 动态加载失败恢复 `vite-preload-recovery.js`；密码 ≥8 `auth-validation.js`；通知 store `stores/notification-loader.ts`；
  论坛搜索 RPC 单实现 9 参（PG 42725，**禁新增签名**）。

## 数据口径 / 单源

- AI 额度口径 `utils/ai-quota-display.js`：界面**只显示百分比**（进度条走 `meterPercent`、`percent` 不封顶）；
  档位比大小走 `subscription-benefits.js` 的 `PLAN_AI_TOKEN_PERCENTS`；**界面不许显示 Token 数**。
- `bohai_model_configs.api_url` 只解析 `choices[0]`；`freemodels.api_base_url` 名字误导，存的是
  **完整 chat/completions 端点**（存量如此，勿改语义）。
- 跨表同名字段语义真源 `src/config/field-semantics.ts`（`lab_ai_model_configs.model_id` 存的是
  `bohai_model_configs.mode_id`）。守卫 `tests/unit/field-semantics.test.js`。

## 探针写法

- ⚠️ 探针 `page.evaluate(fn)` **只序列化函数体** ⇒ 闭包依赖一律作为**参数**传入。
- ⚠️ 探针漂移 ＝ 抖动，不是回归（先单跑一遍那个用例再下结论）。改完必反证。

## 过渡动效 / 形变（Forum ⇄ PostDetail）

- 形变目标口径：入场/退场**同一盒子** `.detail-container`（别再拿 `.x-post-card` 当退场克隆源，会「从 y=0 张开、从 y=80 收起」）。
- `morph-layer.js` 克隆必须挂进**样式上下文壳**（`cloneNode(false)` 复制页根 + `createContextShell`），
  否则 `.post-detail-page .x-post-card{…}` 后代选择器失配，`class` 里的 `glass-panel` 回落到
  `rgba(255,255,255,.8)` + `24px` 圆角 + 阴影 = **白块**。护栏 `probe-forum-motion` C1b–C1e。
- 壳自身必须内联中和 `transform/filter/backdrop-filter/contain/animation/position`（否则换掉绝对定位包含块、或自己先淡入）。
- 🔴 **禁入场/垫层类样式一律「时长归零」不是 `animation: none`**：可见性靠 fill 撑住的
  动画（`base.css` `.fade-in-up`：`opacity:0; translateY(30px)`）被 none 掐掉 = 元素直接消失。
  口径：`animation-duration: 0s !important; animation-delay: 0s !important;` 保留 fill。
  该纪律记三份：`page-snapshot.js` / `morph-layer.js` / `feed.css` 末段。
- **禁入场的类绝不能定时摘**：摘掉那一刻动画被重新创建、从 0 重播（=「重新挂载似的闪」）。
  永久类（`is-morph-entry` / `.tab-no-replay`）与临时类（`is-morph-veil`）拆开挂。
- **返回标记的摘除时刻必须锚「目的地列表挂载」不是「离开详情」**：固定 900ms 会把
  `fadeInUp`(1s) re-seek 到 90% ⇒ 「列表像刷新抖一下」（实测 translateY 0→1.1px）。
  真源 `detail-return-flag.js`（列表挂载 + 1400ms），别在页面里另设定时器。
- 返回白屏垫层 `utils/page-snapshot.js`：点卡片时 `#app.cloneNode(true)`，返回铺在收缩层下；
  交接判据 = 真列表可见 + 几何与垫层内重合 ±2px，命中握 60ms 再淡 160ms。
  ⚠️ `animation: none` 会把快照整层变透明（见上），判「有 DOM」会 500ms 就摘（真列表 ~950ms）。
- 🔴 **WAAPI 关键帧不给显式 `offset:1` 终帧会隐式回落 underlying value**：淡出链
  `[{op:1},{op:1,offset:.25},{op:0,offset:.65}]` 尾段会反弹回 op≈1（实测 0.005→0.92）。
  链尾必补 `{opacity: 0}` 显式终帧。
- 底栏「内容/我」= user-space 内部 tab；「我/图库」等是**独立路由** = 整页重挂。
  判「应用内导航」用 `window.history.state?.back`（冷加载为 null ⇒ 保留首次入场）：
  UserSpaceMain → `.tab-no-replay`；ForumMain → `html[data-boh-nav-returning]`（卸载时摘）。
- ⚠️ UserSpaceMain 模板曾引用未声明的 `replayGuardTab` ⇒ `tab-no-replay` 恒 false、
  修复静默失效；类开关必须用 `<script setup>` 里真实声明的 ref（tabNoReplay）。
- `SegmentTabs` 指示器初值 `{x:0,w:0}` + 常驻 transition ⇒ 重挂时「官方→最新」滑动；
  改为 `animatable` ref，只有 watch(modelValue) 才放开 300ms 过渡。
- 形变时长单源 `tokens.css` `--motion-morph-in/-in-near/-out`（620/480/360）+
  `--ease-morph`/`--ease-morph-out`；探针断言读 token 不写死数值。
  返程淡出 0.25 起淡 / 0.65 归零（linear offset = 墙钟时间，几何走前载曲线），
  探针 E3b 判「影子存活 ≤ 总时长 72%」——几何比值判据在横屏（758→644）必假红。
