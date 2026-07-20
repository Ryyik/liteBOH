# 004 — 修复 unified-nav.css 的 transition: all 与整页 bounce 过渡

- **Status**: TODO
- **Commit**: eed9baf
- **Severity**: HIGH/MEDIUM
- **Category**: Performance / Physicality
- **Estimated scope**: 1 文件，~1700 行 CSS

## Problem

[src/styles/vendor/unified-nav.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css) 是统一导航栏的核心样式，存在两类问题：

**问题 A（HIGH，Performance）**：23+ 处使用 `transition: all 0.3s ease` 或 `transition: all 0.25s ease !important`。导航栏是高频交互区（鼠标频繁 hover、focus、点击切换菜单），每次触发 `transition: all` 会动画化 layout 属性，掉帧明显。

**问题 B（MEDIUM，Physicality）**：[L24-27](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css#L24) 整页过渡用 `cubic-bezier(0.34, 1.56, 0.64, 1)`（spring back bounce 1.56）+ `1.2s` duration。bounce 1.56 对全局过渡过于活泼，且 1.2s 远超 UI 上限 500ms。

**当前代码：**

```css
/* unified-nav.css:24-27 — 整页过渡，bounce 1.56 + 1.2s 过长 */
.unified-nav-shell {
  transition: transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1),
              opacity 1.2s cubic-bezier(0.34, 1.56, 0.64, 1),
              border-radius 1.2s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* unified-nav.css:363 — transition: all 高频交互区 */
.dropdown-trigger { transition: all 0.3s ease; }

/* unified-nav.css:390 */
.nav-item { transition: all 0.25s ease; }

/* unified-nav.css:454, 468, 1054, 1070, 1143, 1604, 1625 */
... { transition: all 0.3s ease; }

/* unified-nav.css:899, 997, 1313, 1336, 1350, 1366 — !important */
... { transition: all 0.25s ease !important; }
... { transition: all 0.3s ease !important; }

/* unified-nav.css:1715, 1746, 1780, 1805 — 简写 transition: all 0.3s */
... { transition: all 0.3s; }
```

**违反的规则**（来自 AUDIT.md）：
- "`transition: all` animates unintended properties off-GPU — always a finding."
- "Modals, drawers: 200–500ms" — 整页过渡属于此类，1.2s 超上限。
- bounce 0.1-0.3 是推荐范围；1.56 远超，UI 上显得"过于弹"。

## Target

把 23 处 `transition: all` 替换为只动画 `transform / opacity / background-color / color / border-color / box-shadow`；整页过渡的 bounce 从 1.56 降到 0（用 `--ease-emphasized`），duration 从 1.2s 降到 500ms。

### 修改 L24-27 整页过渡

```css
/* unified-nav.css:24-27 — 修改后 */
.unified-nav-shell {
  transition:
    transform 500ms var(--ease-emphasized),
    opacity 500ms var(--ease-emphasized),
    border-radius 500ms var(--ease-emphasized),
    box-shadow 500ms var(--ease-emphasized);
}
```

### 替换 23 处 transition: all

**通用替换模板**（按元素类型选择保留的属性）：

```css
/* 通用 nav-item / dropdown-trigger — 包含 hover 颜色 + transform 反馈 */
.nav-item,
.dropdown-trigger,
.dropdown-menu-item,
.sidebar-toggle {
  transition:
    transform 0.2s var(--ease-out),
    background-color 0.2s var(--ease-out),
    color 0.2s var(--ease-out),
    border-color 0.2s var(--ease-out),
    box-shadow 0.2s var(--ease-out);
}

/* 仅颜色变化的元素 — 链接、icon */
.nav-link,
.nav-icon,
.menu-item-link {
  transition:
    color 0.2s var(--ease-out),
    background-color 0.2s var(--ease-out),
    opacity 0.2s var(--ease-out);
}

/* 含位移 + 缩放 hover 反馈 */
.has-hover-transform {
  transition:
    transform 0.2s var(--ease-out),
    background-color 0.2s var(--ease-out),
    box-shadow 0.2s var(--ease-out);
}
```

**针对 !important 的处理**：原 `!important` 用于覆盖第三方样式或 scoped 样式。保留 `!important` 但限定属性：

```css
/* unified-nav.css:899 — 修改前 */
.menu-mobile-item { transition: all 0.25s ease !important; }
/* 修改后 */
.menu-mobile-item {
  transition:
    transform 0.2s var(--ease-out) !important,
    background-color 0.2s var(--ease-out) !important,
    color 0.2s var(--ease-out) !important;
}
```

## Repo conventions to follow

- **Token 来源**：Plan 001 新建的 `src/styles/common/tokens.css` 定义了 `--ease-out` / `--ease-emphasized`。BOHAI [motion-system.css:5-6](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/BOHAI/BOHAI/styles/motion-system.css#L5) 已示范 `--ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1)` 用于关键过渡。
- **import 顺序**：unified-nav.css 在 [main.js:8](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/main.js#L8) 导入，**在 tokens.css 之前**。需要把 tokens.css 的导入移到 unified-nav.css 之前。

**main.js 调整：**
```js
// main.js — 把 tokens.css 提到第一位
import "./styles/common/tokens.css";     // ← 移到最前
import "./styles/vendor/fonts.css";
import "./styles/vendor/unified-nav.css";
import "./styles/common/glass-ui.css";
import "./styles/common/animations.css";
...
```

## Steps

1. 编辑 [main.js:7-8](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/main.js#L7)：在 `import "./styles/vendor/fonts.css";` 之前插入 `import "./styles/common/tokens.css";`（如果 Plan 001 已加在 animations.css 之前，移到更前面）。删除 Plan 001 中加在 animations.css 之前的那一行，统一放在最前。
2. 编辑 [unified-nav.css:24-27](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css#L24)：替换为 Target 中的 500ms ease-emphasized 版本。
3. 替换以下 23 处 `transition: all` 为具体属性（按元素类型参照 Target 通用模板）：
   - L363, L390, L409, L454, L468, L572, L1054, L1070, L1101, L1124, L1143, L1604, L1625, L1669
   - L1715, L1746, L1780, L1805（无 `ease` 的简写）
   - L899, L997, L1313, L1336, L1350, L1366（带 `!important`）
4. 保留 [unified-nav.css:162](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css#L162) `transition: transform 0.3s ease`（已经是具体属性，但把 ease 改为 `var(--ease-out)`）。
5. 保留 [unified-nav.css:250](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css#L250) `transition: background-color 0.2s ease, ...`（已具体，把 ease 改为 `var(--ease-out)`）。
6. 保留 [unified-nav.css:1007](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css#L1007) `transition: padding-top 0.3s ease` — **特殊**：这是 layout 属性过渡，可能需要保留（如果 nav 折叠/展开 padding 必须过渡）— 但应改用 transform 代替 padding。如果改造成本大，**保留 padding 过渡但把 ease 改为 var(--ease-out)**。
7. `npm run build` 验证。

## Boundaries

- **不动** [UnifiedNavbar/index.vue](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/components/UnifiedNavbar/index.vue) 或 [UnifiedNavbar/style.scoped.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/components/UnifiedNavbar/style.scoped.css)（独立组件样式不在本 plan 范围）。
- **不动** unified-nav.css 中已有的具体属性 transition（L162, L250, L572, L1007）。
- **不改变**任何选择器的 specificity。
- **不添加新依赖**。
- 不删除任何 !important（保留覆盖优先级），只把 `all` 替换为具体属性。

## Verification

- **机械验证**：
  - `grep -c "transition: all" src/styles/vendor/unified-nav.css` 返回 0
  - `grep -c "1.56" src/styles/vendor/unified-nav.css` 返回 0（bounce 数值已移除）
  - `grep -c "1.2s" src/styles/vendor/unified-nav.css` 应为 0（除非有非过渡用途）
  - `npm run build` 通过

- **Feel check**：
  - 启动 `npm run dev`，访问任意页面，触发以下交互：
    - 顶部导航 hover：菜单项背景色淡入约 200ms（不是 300ms ease），无明显掉帧。
    - 移动端汉堡菜单展开：背景遮罩淡入 + 菜单 transform 滑入；DevTools Performance 录制无紫色 layout 条。
    - 整页切换（如 desktop → mobile viewport 变化时 unified-nav 形态变化）：过渡时长 500ms，无明显 bounce（之前 1.2s + bounce 看起来"晃悠"）。
  - DevTools Animations 面板把速度调到 10%，触发 nav-item hover：确认 transform 与 background-color 是同步进行的 ease-out 曲线。
  - DevTools Rendering → 勾选 `prefers-reduced-motion: reduce`：确认 nav hover 仍有颜色变化但无 transform。

- **回归检查**：
  - 检查移动端导航在 iOS Safari（最弱设备）下的展开动画是否仍流畅。
  - 检查 dark mode 下导航 hover 颜色过渡是否正常（dark-mode.css 不应再受 unified-nav.css 的 transition 影响）。

- **Done when**：
  - unified-nav.css 中无 `transition: all`
  - 整页过渡 500ms + ease-emphasized
  - build 通过，nav 交互无掉帧
  - reduce-motion 下仍有颜色反馈
