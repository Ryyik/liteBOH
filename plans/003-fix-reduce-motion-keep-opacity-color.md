# 003 — 修正 reduce-motion 实现：保留 opacity/color 反馈，仅砍位移与缩放

- **Status**: TODO
- **Commit**: eed9baf
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 6 个文件

## Problem

项目在 6 处 `@media (prefers-reduced-motion: reduce)` 块中把所有动画与过渡一刀切到 `0.01ms` / `1ms`，包括 opacity/color transition。这违反 AUDIT.md 的 "Reduced motion means fewer and gentler animations, **not zero** — keep transitions that aid comprehension, remove position changes"。

启用 reduce-motion 的用户在反馈层级完全失去视觉反馈：按钮点击没有 color/opacity 变化、模态框瞬间出现无淡入、消息状态变化无渐变。

**当前代码（6 处违规）：**

```css
/* src/styles/common/animations.css:934-941 — 全局基线 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* src/views/BlockWall/style.scoped.css:676 — 同上 */
*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }

/* src/views/user-center/Cloud+/style.scoped.css:1790 — 同上 */
animation-duration: 0.01ms !important;

/* src/views/user-center/Subscription/style.scoped.css:1034 — 同上 */
animation-duration: 0.01ms !important;

/* src/styles/themes/dark-mode.css:218 — 同上 */
animation-duration: 0.01ms !important;

/* src/views/BOHAI/BOHAI/styles/motion-system.css:241-258 — reduce-motion 用 1ms 而非 0.01ms，但同样砍 opacity */
.bohai-page.reduce-motion *,
.bohai-page.reduce-motion *::before,
.bohai-page.reduce-motion *::after {
  scroll-behavior: auto !important;
  animation-duration: 1ms !important;
  animation-delay: 0ms !important;
  transition-duration: 1ms !important;
}

@media (prefers-reduced-motion: reduce) {
  .bohai-page *,
  .bohai-page *::before,
  .bohai-page *::after { ... 同上 ... }
}
```

**违反的规则**（来自 AUDIT.md）：
- "Reduced motion means fewer and gentler animations, not zero — keep transitions that aid comprehension, remove position changes."
- "Reduced-motion implementations that nuke all feedback" — 直接命中该反模式。

## Target

只砍位移（translate）、缩放（scale）、旋转（rotate）相关动画；保留 opacity、color、background-color、border-color、box-shadow 等非位置变化的过渡。

由于 CSS `animation-duration` 无法选择性作用于 transform 子属性，采用策略：
1. **animation-duration 缩短为 0.001ms**（实质禁用 keyframes，因为 keyframes 内嵌 transform）。
2. **transition-duration 不砍** — 保留 transition（transition 是属性级，已用 Plan 001/002 改为只动画 transform/opacity/color 等；transform 由 transition 触发的，浏览器仍会按 reduce-motion 自动跳过 transform 部分？实际上不会，需要显式控制）。

更精确的做法：在 reduce-motion 媒体查询中**显式重置 transform 相关 transition 为 0ms，保留其他属性的正常 duration**。但这对每条 transition: transform ... 都要重写一遍，工作量大。

**折中方案**（推荐）：把 transition-duration 缩短为 `100ms`（不是 0.01ms）—— 短到几乎瞬间但保留视觉过渡。动画（animation）保留禁用（因为 keyframes 多含 transform）。

```css
/* 目标：全局基线（animations.css:934） */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    /* 禁用 keyframes 动画（多数含 transform） */
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0ms !important;

    /* 保留 transition 但缩短到 100ms — 仍能感知淡入/颜色变化 */
    transition-duration: 100ms !important;
    transition-delay: 0ms !important;

    /* 关闭滚动动画 */
    scroll-behavior: auto !important;
  }
}

/* 目标：BlockWall style.scoped.css:676 */
@media (prefers-reduced-motion: reduce) {
  /* 仅保留本页面装饰动画的 reduced 处理，transition 用全局基线 */
  .block-wall-page *,
  .block-wall-page *::before,
  .block-wall-page *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    /* 删除 transition-duration 行 — 让全局 100ms 接管 */
  }
}

/* 目标：Cloud+/Subscription style.scoped.css */
@media (prefers-reduced-motion: reduce) {
  /* 删除 animation-duration: 0.01ms !important */
  /* 改为只在装饰性 keyframes 上禁用，保留通用过渡 */
  [class*="skeleton"],
  [class*="shimmer"] {
    animation: none !important;
  }
}

/* 目标：dark-mode.css:218 */
@media (prefers-reduced-motion: reduce) {
  /* dark-mode 主题不应有不同 reduce-motion 处理；删除该块 */
}

/* 目标：BOHAI motion-system.css:241-258 */
.bohai-page.reduce-motion *,
.bohai-page.reduce-motion *::before,
.bohai-page.reduce-motion *::after {
  scroll-behavior: auto !important;
  animation-duration: 0.001ms !important;
  animation-delay: 0ms !important;
  /* 保留 100ms transition — 让消息气泡淡入仍可感知 */
  transition-duration: 100ms !important;
  transition-delay: 0ms !important;
}

@media (prefers-reduced-motion: reduce) {
  .bohai-page *,
  .bohai-page *::before,
  .bohai-page *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.001ms !important;
    animation-delay: 0ms !important;
    transition-duration: 100ms !important;
    transition-delay: 0ms !important;
  }
}
```

## Repo conventions to follow

- **数值统一**：100ms 是 Plan 001 中 `--duration-press` 与 `--duration-tooltip` 之间的值，作为 reduce-motion 下的统一过渡时长。
- **保持选择器一致性**：`*, *::before, *::after` 写法是项目既有约定。
- **dark-mode.css 不应有 reduce-motion 重定义** — 这是主题文件，与无障碍正交，应删除。

## Steps

1. 编辑 [animations.css:934-941](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/animations.css#L934)：把 `transition-duration: 0.01ms` 改为 `transition-duration: 100ms`，并把 `animation-duration: 0.01ms` 改为 `0.001ms`，新增 `animation-delay: 0ms` 与 `transition-delay: 0ms` 与 `scroll-behavior: auto`。
2. 编辑 [BlockWall/style.scoped.css:675-677](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/BlockWall/style.scoped.css#L675)：删除 `transition-duration: 0.01ms !important;` 一行，保留 animation 禁用（BlockWall 有大量 keyframes 装饰）。
3. 编辑 [Cloud+/style.scoped.css:1786-1792](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/user-center/Cloud+/style.scoped.css#L1786)：把 `animation-duration: 0.01ms !important;` 改为 `animation-duration: 0.001ms !important;` 并新增 `transition-duration: 100ms !important;`。
4. 编辑 [Subscription/style.scoped.css:1034](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/user-center/Subscription/style.scoped.css#L1034)：同上。
5. 编辑 [dark-mode.css:214-220](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/themes/dark-mode.css#L214)：删除整个 `@media (prefers-reduced-motion: reduce)` 块（让全局 animations.css 接管）。
6. 编辑 [motion-system.css:241-258](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/BOHAI/BOHAI/styles/motion-system.css#L241)：把 `1ms` 改为 `0.001ms`（animation）和 `100ms`（transition），新增 `scroll-behavior: auto`。

## Boundaries

- **不动** 各文件中已有的 `@media (prefers-reduced-motion: reduce)` 块以外的内容。
- **不动** [GlobalAiGlassOverlay.vue:1054](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/components/GlobalAiGlassOverlay.vue#L1054) 等其它 reduce-motion 实现（如果它们已经合理处理，不要改）。
- **不动** [glass-ui.css:575](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/glass-ui.css#L575) 等其他 reduce-motion 块（本 plan 仅修上面列出的 6 处明确违规）。
- **不添加新依赖**。

## Verification

- **机械验证**：
  - `grep -rn "transition-duration: 0.01ms" src/` 返回 0
  - `grep -rn "animation-duration: 0.01ms" src/` 返回 0
  - `grep -rn "transition-duration: 100ms" src/styles/common/animations.css src/views/BOHAI/BOHAI/styles/motion-system.css` 至少 2 处
  - `npm run build` 通过

- **Feel check**：
  - 在 macOS 系统设置 → 辅助功能 → 显示 → 勾选"减少动态效果"。
  - 重新加载网站，触发以下交互并确认：
    - 任一 `.btn` 按钮 hover：背景色仍有渐变（约 100ms），不是瞬间跳变。
    - CommonAlertModal 弹出：背景遮罩仍有 opacity 淡入。
    - BOHAI 工作区发送消息：消息气泡仍有 opacity 淡入，但不再有 translateY 入场位移。
    - BlockWall 页面：花瓣飘落动画停止，但卡片点击的 hover 颜色反馈仍可见。
  - DevTools Rendering 面板 → 勾选 `Emulate CSS prefers-reduced-motion: reduce`，重复上述验证。
  - DevTools Performance 录制：reduce-motion 下点击按钮应无 transform 动画帧。

- **Done when**：
  - 6 个文件的 reduce-motion 块都按 Target 修改
  - 系统启用 reduce-motion 后 opacity/color 过渡仍可见
  - 关键 keyframes 装饰（如花瓣、shimmer）在 reduce-motion 下停止
  - build 通过
