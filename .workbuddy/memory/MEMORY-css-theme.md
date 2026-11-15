# CSS / 主题 —— 分册

> 从 `MEMORY.md` 外置（2026-10-31）。**动 CSS / 主题 / 布局前读它。** 主索引见 `MEMORY.md`。

## 单源 / 入口

- `:root` 禁进 scoped @import；全局变量唯一入口 `glass-aliases.css`；动效/玻璃单源 `tokens.css`；
  暗色真源 `theme-manager.js`；scoped 特异性 +1。

## 特异性 / 覆盖

- ⚠️ **竖屏 / 媒体查询覆盖必须放文件末尾**：同特异性下后写的赢 ⇒ 写在基础规则（如 `.ah-btn{height:36px}`）
  之前的 `@media(max-width:767px){.ah-btn{height:40px}}` **静默失效**（2026-10-27 实测量出来仍 36px）。
- ⚠️ 组件内写 `:focus-visible` 想覆盖 `layout.css` 的 `.bohai-page :focus-visible` 时，**特异性打平**
  （全局那条编译后带 `[data-v-*]`，同为 0,3,0 且更靠后）⇒ 静默失效（实测 offset 仍 2px）。
  用双写伪类 `.x:focus-visible:focus-visible`(0,4,0)，比依赖祖先结构稳（岛形态也生效）。
- ⚠️ 切 tab 只切 class 不同步 `hidden` ⇒ `.panel.is-on{display:block}` 压过 `[hidden]`，两面板同时显示。
- 🔴 **`src/style.css:290` 有全局 `a:hover { background-color: transparent !important }`**
  （为压 glass-ui-vue 的全局 hover）。任何**写在 `a` 上的悬停底色都会被它吃掉**，
  且症状极具欺骗性：`a.matches(':hover')` 为真、同规则里的 `transform` 也生效，
  只有 `background-color` 恒为透明 —— 只看截图会误判成"没写 hover"。
  ⇒ 链接类悬停底色一律写在**行容器（`li` / 父 div）**上；暗色之所以"看起来正常"，
  是 `navbar-dark.css` 用 `!important` 另写了一份（2026-11-15 下拉岛整行 hover 踩到）。

## 液态玻璃

- ⚠️ 三铁律：材质单源 `liquid-glass.css` 只挂基础类（≤768px 强制关 backdrop 变体）；
  scoped 让位写 `:not(.liquid-glass)`；白底玻璃需 `.cloud-page::before` 环境光 + 父级 `isolation:isolate`；色值走 color-mix。
- ⚠️ 玻璃底图**必须放面板背后**（进 `backdrop-filter`）；放面板自身 `background-image` 不经过模糊
  ⇒ 深色字块透进正文（白遮罩 .90 仍剩约 8% 可见）。
- ⚠️ 判「白玻璃」看**元素自身 background-color**（合成亮度会骗人：55% 白叠深底 lum≈0.27 < 阈值 0.35 假绿）；
  `check:dark-tokens` 连 `var(--x,#hex)` fallback 也计数 ⇒ 想零增长别写 fallback。护栏 `probe:dark-surfaces`(36)。
- ⚠️ 模态框底色用 `--card-solid` 不用 `--card`：后者是 62% 半透明（液态玻璃），底下是表格正文时
  字段标签会和背后文字叠在一起。

## 暗色

- ⚠️ 三坑：① 异步 chunk 的 scoped 样式带 `[data-v-*]` 且晚于 themes/*.css ⇒ `[data-theme=dark] .x` 被压掉，
  **必须写 `html[data-theme=dark] .x`**；② 反色实心按钮（`--liquid-text-primary` 底 + `color:#fff`）暗色改
  `color:var(--boh-bg-primary)`；③ 共享组件禁依赖宿主私有变量（`--text-primary` 只由 `.user-space-page` 定义），
  走全局 `--liquid-text-*`。

## 定位 / 裁剪

- ⚠️ **`position:fixed` 会被祖先 `backdrop-filter`/`filter`/`transform` 劫持成「相对该祖先定位」**
  （规范行为，不是 bug）。admin `.management-section` 带 `backdrop-filter: blur(18px)` ⇒ 遮罩 `inset:0`
  实测只铺到 1117×878 @(292,131)。修法 = `Teleport` 出去，宿主选**页根**（`.data-management-page`）而不是
  `body` —— 页级 token（`--card/--foreground/--radius/--spacing`）挂在页根上，挂 body 全丢。
  护栏 `probe-admin-dialogs`(7)。
- ⚠️ **单位矩阵同样算**：`animation: … both` 收尾后 computed 仍是 `matrix(1,0,0,1,0,0)`（≠ none）⇒
  资产页 .ah-page / .tab-page 都是这个形态，充值弹窗遮罩 1440×900 只剩 1131×600 @(275,0)。
  **Teleport 到 body 后暗色覆盖的前缀必须从 `.user-space-page[data-theme=dark]` 改成 `html[data-theme=dark]`**
  （节点已不在页根里）。护栏 `probe-user-space-ia` 的「遮罩铺满视口」三条。
- ⚠️ 绝对定位浮层**禁挂 overflow 滚动容器内**（任一轴非 visible 裁到 padding box；88px 窄栏下 172px 浮层剩 68px）。
  **240px 宽栏 215>172 恰好不暴露 ⇒ 断言必须覆盖窄档**。浮层挂成滚动容器**兄弟**；
  `contain:paint`（`.liquid-glass`）同样裁后代，左栏靠 `side-rail.css` 的 `contain:none` 让位。护栏 `probe-rail-more-menu`(16)。
- ⚠️ **fixed 容器会被撑高的子元素撑开**：`#unified-nav-container` 岛展开 78→390px 且 `pointer-events:auto`
  （**撑高有意**，接「点外部关闭」，别改高度）；带实心背景就成页顶一块矩形 ⇒ 容器只定位＋接点击，
  **视觉全交 `.unified-nav-surface`**。
- ⚠️ 绝对定位元素要「按自身宽度居中」时，`left:0;right:0;margin:0 auto` **对 `width:max-content` 无效**
  （引擎走 shrink-to-fit，auto 边距在宽度定下来之前先解析成 0；实测偏右半个宽度）。
  正确写法 `left:50%` + **`translate:-50% 0`**（独立属性，不被 `transform` 覆盖）。
  ⚠️ 别用 `transform: translateX(-50%)` —— 元素已有进出场动画（transform 写 translateY/scaleY）时，
  两个声明会互相覆盖、动画静默失效；`translate` 与 `transform` 是两套坐标系，可叠加（下拉岛实测）。

## 滚动锁 / 穿透

- ⚠️ **本站的滚动容器是 `html`，不是 `body`**：`style.css` 写死 `html{overflow-y:auto!important}` +
  `body{overflow-y:visible!important}` ⇒ `document.body.style.overflow='hidden'`（inline、无 important）
  **被样式表盖掉**，浮层背后照样滚（2026-11-10 商城详情报障真因；`Shop/index.vue` 曾 7 处这么写）。
  一律用 `acquireBodyScrollLock`（它已改成同时锁 `documentElement` + `important` + 补滚动条宽度）。
  护栏 `probe-shop-detail-scroll`(11，判别性只有 A1–A3) + `body-scroll-lock-single-source`。

## 布局细节

- ⚠️ 窄屏一行硬压三连（nowrap + min-width:0 + 子项 shrink:0）＝压 0 宽/竖排字/被裁；修法是折行。
- ⚠️ 避软键盘：`height:100dvh; padding-bottom:calc(env(safe-area-inset-bottom)+var(--kb-inset))`，**别减高度**。
  高度断言用 `offsetHeight`。
- ⚠️ `.badge` 在 `1fr` 网格列默认 stretch ⇒ 要 `justify-self:start`。
- ⚠️ `--muted-foreground:#7f8d9f` 在白底只有 3.38:1（< AA 4.5）⇒ 达标值 `#5a6577`(5.41) / 暗色 `#a8b0bd`(7.49)。

## 过渡动效：两条会「看起来像没做」的坑（2026-11-14 定帧实测）

- ⚠️ **别把为 transform 写的急起曲线用在 opacity 上**。`cubic-bezier(0.23,1,0.32,1)`
  在 30% 时间就走完 90% 不透明度 ⇒ 240ms 的动画感知只有 ~50ms，报障会写成「硬切」，
  而你在代码里明明写了动画（底栏切页就是这么被判死的）。
  透明度用端部平缓的 `cubic-bezier(0.4,0,0.2,1)`。
- ⚠️ **两层同时淡 = 必然漏底色**。上层 A→0、下层 0→B 且两段时长不等时，
  中途合成覆盖率 < 1，页面底色就透出来（本仓 2026-10-31「闪白」的根因，
  切页时 t=20ms 实测覆盖率只有 0.68）。
  正确做法：**让其中一层全程不透明**，只让另一层退场 —— 覆盖率恒为 1，结构上不可能漏。
- 取证手法：`document.getAnimations().forEach(a => { a.pause(); a.currentTime = t })`
  再截图，可把过渡定在任意毫秒，比 screencast 逐帧稳。

## 验收纪律

- ⚠️⚠️ **样式类改动/故障的验收必须带截图肉眼过**（2026-10-13 实证：三 CSS 全失败时程序化差分只报 1 项，
  肉眼是大面积塌陷；采样点不能替代视觉）。留证探针 `probe:css-visual`。
