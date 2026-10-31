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

## 布局细节

- ⚠️ 窄屏一行硬压三连（nowrap + min-width:0 + 子项 shrink:0）＝压 0 宽/竖排字/被裁；修法是折行。
- ⚠️ 避软键盘：`height:100dvh; padding-bottom:calc(env(safe-area-inset-bottom)+var(--kb-inset))`，**别减高度**。
  高度断言用 `offsetHeight`。
- ⚠️ `.badge` 在 `1fr` 网格列默认 stretch ⇒ 要 `justify-self:start`。
- ⚠️ `--muted-foreground:#7f8d9f` 在白底只有 3.38:1（< AA 4.5）⇒ 达标值 `#5a6577`(5.41) / 暗色 `#a8b0bd`(7.49)。

## 验收纪律

- ⚠️⚠️ **样式类改动/故障的验收必须带截图肉眼过**（2026-10-13 实证：三 CSS 全失败时程序化差分只报 1 项，
  肉眼是大面积塌陷；采样点不能替代视觉）。留证探针 `probe:css-visual`。
