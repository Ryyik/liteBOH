# 002 — 清理 9 个 CSS 中复制粘贴的 .transition { all !important } helper

- **Status**: TODO
- **Commit**: eed9baf
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 11 个文件（9 个修改 + 2 个验证）

## Problem

项目早期复制粘贴的旧模板代码在 9 个 CSS 文件中重复定义 `.transition` helper，全部使用 `transition: all 0.5s ease-in-out !important`。一旦在元素上加 `.transition` class（或继承到 `.btn` 等），所有属性都会被动画化 — 包括 `width/height/padding/margin/top/left` 等 layout 属性，触发 reflow + paint + composite 三阶段开销。在 hover/focus 等高频交互下会掉帧。

**当前代码（9 处重复定义）：**

```css
/* src/styles/helpers/variabls.css:25-28 */
.transition {
  -webkit-transition: all 0.5s ease-in-out !important;
  -o-transition: all 0.5s ease-in-out !important;
  transition: all 0.5s ease-in-out !important;
}

/* src/styles/components/buttons.css:28-32 — 同时绑定到 .btn */
.transition, .btn, .btn:hover, .btn:focus {
  -webkit-transition: all 0.5s ease-in-out !important;
  -o-transition: all 0.5s ease-in-out !important;
  transition: all 0.5s ease-in-out !important;
}

/* src/styles/components/close-button.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/components/cursor.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/components/headings.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/components/link_underline.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/components/overlay.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/components/page__animate.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/pages/globalpage.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/pages/section__header.css:28-31 */
.transition { ... all 0.5s ease-in-out !important; }

/* src/styles/layouts/footer.css:28-31 — 同时绑定到多个选择器 */
.transition, .menu-social-links-container ul li a, .menu-social-links-container ul li a:hover,
.privacy-policy-link a, .privacy-policy-link a:hover {
  ... all 0.5s ease-in-out !important;
}
```

**违反的规则**（来自 AUDIT.md）：
- "Animate `transform` and `opacity` only. `width`/`height`/`margin`/`padding`/`top`/`left` trigger layout + paint + composite."
- "`transition: all` animates unintended properties off-GPU — always a finding."

## Target

把 9 个文件中的 `.transition` helper 统一改为只动画 GPU 友好的属性；删除 `!important`（除非该文件需要覆盖第三方样式）；让 Plan 001 引入的 `var(--ease-out)` 等 token 在这里被引用。

由于 Plan 001 已在 [animations.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/animations.css) 中定义了 `.transition-all`，本 plan 不再重复定义 `.transition` helper — 改为让 9 个文件引用全局 token，**完全删除本地 `.transition` 定义**。

```css
/* 目标：所有 9 个文件中的 .transition 块整段删除 */
/* （如果某文件 .transition 还绑定到其他选择器如 .btn，则只保留其他选择器，transition 改为具体属性） */
```

### 按文件具体改法

**A. variabls.css / close-button.css / cursor.css / headings.css / link_underline.css / overlay.css / page__animate.css / globalpage.css / section__header.css**

这 8 个文件只是"复制粘贴的 `.transition` 孤岛"，没有任何元素需要 `.transition` class 本身（实际样式来自各组件 scoped css）。**整段删除 `.transition` 块**。

```css
/* 删除整段（variabls.css:25-28 等 8 处） */
.transition {
  -webkit-transition: all 0.5s ease-in-out !important;
  -o-transition: all 0.5s ease-in-out !important;
  transition: all 0.5s ease-in-out !important;
}
```

**B. buttons.css** — 保留 `.btn` 的 transition 但改为具体属性

```css
/* src/styles/components/buttons.css — 修改后 */
/* 删除 .transition helper，保留 .btn 的过渡但限定属性 */
.btn, .btn:hover, .btn:focus {
  transition:
    transform 0.2s var(--ease-out),
    background-color 0.2s var(--ease-out),
    color 0.2s var(--ease-out),
    border-color 0.2s var(--ease-out),
    box-shadow 0.2s var(--ease-out);
}
```

**C. footer.css** — 保留其他选择器但改为具体属性

```css
/* src/styles/layouts/footer.css:28-31 — 修改后 */
.menu-social-links-container ul li a,
.menu-social-links-container ul li a:hover,
.privacy-policy-link a,
.privacy-policy-link a:hover {
  transition:
    transform 0.2s var(--ease-out),
    background-color 0.2s var(--ease-out),
    color 0.2s var(--ease-out),
    opacity 0.2s var(--ease-out);
}
```

## Repo conventions to follow

- **Token 来源**：Plan 001 新建的 `src/styles/common/tokens.css` 定义了 `--ease-out` 等 token。
- **import 顺序**：tokens.css 在 main.js 中先于其他组件 css 导入（Plan 001 已处理）。
- **现有样例**：[BOHAI motion-system.css:74-81](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/BOHAI/BOHAI/styles/motion-system.css#L74) 已示范了"具体属性 + var(--ease-*)" 的写法。
- **`.transition` class 本身不再需要** — 现代代码应直接在元素上写 `transition:` 属性，避免 helper class 滥用。

## Steps

1. 在每个文件的对应位置删除 `.transition { all !important }` 块：
   - [variabls.css:25-28](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/helpers/variabls.css#L25)
   - [close-button.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/components/close-button.css#L28)
   - [cursor.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/components/cursor.css#L28)
   - [headings.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/components/headings.css#L28)
   - [link_underline.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/components/link_underline.css#L28)
   - [overlay.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/components/overlay.css#L28)
   - [page__animate.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/components/page__animate.css#L28)
   - [globalpage.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/pages/globalpage.css#L28)
   - [section__header.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/pages/section__header.css#L28)
2. [buttons.css:28-32](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/components/buttons.css#L28) — 删除 `.transition` 选择器，保留 `.btn` 改为 Target B。
3. [footer.css:28-31](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/layouts/footer.css#L28) — 删除 `.transition` 选择器，保留其他选择器改为 Target C。
4. `npm run build` 验证。

## Boundaries

- **不动** [animations.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/animations.css) 的 `.transition-all/.transition-fast/.transition-slow`（Plan 001 已处理）。
- **不动** [unified-nav.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css) 的 `transition: all`（Plan 004 范围）。
- **不动** Vue 组件中的 `<style scoped>` 内的 transition（不在本 plan 范围；若发现具体违规另立 plan）。
- **不添加新依赖**。
- 不改变任何选择器的 specificity（仅替换 transition 值），避免覆盖关系变化。

## Verification

- **机械验证**：
  - `grep -rn "\.transition\b" src/styles/components src/styles/helpers src/styles/layouts src/styles/pages` 只剩 `.transition-transform`、`.transition-opacity`（animations.css 中保留为具体属性）或 0 处。
  - `grep -rn "transition: all.*!important" src/styles` 返回 0（除 unified-nav.css 留给 Plan 004）。
  - `npm run build` 通过。
  - `npm run lint` 通过。

- **Feel check**：
  - 首页 hero 按钮 hover：DevTools Performance 录制，hover 触发动画，确认没有 layout/paint 抖动（应只有 composite 层 transform）。
  - 页脚社交链接 hover：确认仍能过渡颜色/背景色，但不再触发 box model 变化的过渡。
  - 全站点击 `.btn` 元素（如登录页登录按钮）：确认按钮过渡平滑且不掉帧。

- **回归检查**：
  - [section__header.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/pages/section__header.css) 中可能有用到 `.transition` class 的 HTML 模板；删除前先 `grep -rn "class=\"[^\"]*\\btransition\\b" src/` 检查 HTML/Vue 模板是否有 `class="transition"`，若有则改为在元素上直接写 `style="transition: ..."` 或在 scoped css 中定义。
  - 检查 [index.html](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/index.html) 是否有 `class="transition"`。

- **Done when**：
  - 9 个文件无 `.transition { all !important }` 定义
  - 全局 `grep "transition: all.*!important"` 在 src/styles/ 中为 0（除 unified-nav.css 留给 Plan 004）
  - build 通过，按钮/链接 hover 仍有过渡但性能更好
