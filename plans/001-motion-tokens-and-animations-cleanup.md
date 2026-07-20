# 001 — 建立 motion tokens 并修复 animations.css 的弱 easing 与 scale(0)

- **Status**: TODO
- **Commit**: eed9baf
- **Severity**: HIGH
- **Category**: Easing / Physicality / Cohesion
- **Estimated scope**: 2 files (1 新建 + 1 修改)，~960 行 CSS

## Problem

[animations.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/animations.css) 包含 30+ 个 keyframes，全部使用 `ease` 弱缓动；同时存在 `scale(0)` 违规。项目已有 BOHAI [motion-system.css:1-7](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/BOHAI/BOHAI/styles/motion-system.css#L1) 的 token 化样板，但全局 animations.css 没有引用，造成两套并存的 easing 体系。

**当前代码（节选自 [animations.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/animations.css)）：**

```css
/* animations.css:18 — 默认 ease，弱 */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* animations.css:44 — 入场用 ease，违反 "entry → ease-out" */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }

/* animations.css:108 */
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

/* animations.css:166 */
@keyframes zoomIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }

/* animations.css:196 — bounceIn 起始 scale(0.3)，太低 */
@keyframes bounceIn {
  0% { opacity: 0; transform: scale(0.3); }
  50% { opacity: 1; transform: scale(1.05); }
  70% { transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}

/* animations.css:236 — rotateIn 使用 scale(0)，违反 "never scale(0)" */
@keyframes rotateIn { from { opacity: 0; transform: rotate(-200deg) scale(0); } to { opacity: 1; transform: rotate(0) scale(1); } }

/* animations.css:267 — modalSlideUp 用 scale(0.95)，OK 但 easing 是 ease */
@keyframes modalSlideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* animations.css:416 — dotPulse 用 scale(0)，装饰用但偏激 */
@keyframes dotPulse {
  0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* animations.css:467 — animate-fade-in 类用 ease */
.animate-fade-in { animation: fadeIn 0.3s ease; }

/* animations.css:520 — transition-all 用 cubic-bezier(0.4, 0, 0.2, 1) Material standard，OK 但与全局 token 不一致 */
.transition-all { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.transition-fast { transition: all 0.15s ease; }
.transition-slow { transition: all 0.5s ease; }

/* animations.css:559 — hover 类用 ease */
.hover-lift { transition: transform 0.3s ease; }
.hover-scale { transition: transform 0.3s ease; }
.hover-scale:hover { transform: scale(1.05); }
```

**违反的规则**（来自 AUDIT.md）：
- "Entering or exiting → `ease-out`"（keyframes 默认 `ease` 迟钝）
- "Built-in CSS easings are too weak for deliberate motion"
- "Never `scale(0)` — nothing in the real world appears from nothing"
- "Five hand-typed cubic-beziers that almost match is a consolidation finding"

## Target

建立 `src/styles/common/tokens.css` 作为 motion tokens 的单一来源；animations.css 引用 token 并修正 `scale(0)`。

### 1. 新建 `src/styles/common/tokens.css`

```css
/**
 * ==============================================
 * Motion Tokens — 全站动效 token 单一来源
 * ==============================================
 * 与 BOHAI motion-system.css 命名对齐（--bohai-motion-*）
 * 但放在全局，供所有页面/组件引用。
 * 推荐自 AUDIT.md:
 *   --ease-out: cubic-bezier(0.23, 1, 0.32, 1)
 *   --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)
 * 项目既有（保持兼容）:
 *   cubic-bezier(0.16, 1, 0.3, 1)   ← BOHAI/CommonAlertModal/login-modal 已用
 * ==============================================
 */

:root {
  /* Easing — UI 强曲线 */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);  /* BOHAI 既有 emphasized，保留 */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);       /* BOHAI 既有 standard，保留 */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* iOS-like drawer 曲线 */

  /* Duration — UI 动画 < 300ms */
  --duration-press: 160ms;     /* 按钮按压反馈 */
  --duration-tooltip: 200ms;   /* tooltip / 小 popover */
  --duration-fast: 180ms;      /* hover / color change */
  --duration-base: 240ms;      /* dropdown / popover */
  --duration-slow: 360ms;      /* modal / drawer */
  --duration-page: 500ms;      /* 整页过渡上限 */
}
```

### 2. 修改 [animations.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/animations.css)

将所有 keyframes 的默认 timing function 从 `ease` 改为 `var(--ease-out)` 或 `var(--ease-emphasized)`；修正 `scale(0)` 违规。

```css
/* keyframes 定义本身不需要 timing function（由 .animate-* class 注入），
   但 .animate-* helper class 必须使用强 ease-out */

/* 修正 scale(0) */
@keyframes rotateIn {
  from { opacity: 0; transform: rotate(-200deg) scale(0.9); }
  to   { opacity: 1; transform: rotate(0) scale(1); }
}

@keyframes bounceIn {  /* 起始 scale 从 0.3 提到 0.85 */
  0%   { opacity: 0; transform: scale(0.85); }
  50%  { opacity: 1; transform: scale(1.05); }
  70%  { transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes dotPulse {  /* 装饰用，scale(0)→scale(0.4) 保持视觉差但避免"从无到有" */
  0%, 80%, 100% { transform: scale(0.4); opacity: 0.5; }
  40%           { transform: scale(1);   opacity: 1; }
}

/* 入场动画 helper class 一律使用 --ease-out */
.animate-fade-in        { animation: fadeIn 0.3s var(--ease-out); }
.animate-fade-in-up     { animation: fadeInUp 0.5s var(--ease-out); }
.animate-fade-in-down   { animation: fadeInDown 0.5s var(--ease-out); }
.animate-slide-down     { animation: slideDown 0.35s var(--ease-out); }
.animate-zoom-in        { animation: zoomIn 0.3s var(--ease-out); }
.animate-pulse          { animation: pulse 1.5s var(--ease-in-out) infinite; }
.animate-spin           { animation: spin 1s linear infinite; }  /* 常量运动保留 linear */

/* transition helper 改为具体属性，不再 transition: all */
.transition-all {
  transition:
    transform 0.3s var(--ease-out),
    opacity 0.3s var(--ease-out),
    background-color 0.3s var(--ease-out),
    border-color 0.3s var(--ease-out),
    color 0.3s var(--ease-out),
    box-shadow 0.3s var(--ease-out);
}
.transition-fast {
  transition:
    transform 0.15s var(--ease-out),
    opacity 0.15s var(--ease-out),
    background-color 0.15s var(--ease-out),
    border-color 0.15s var(--ease-out),
    color 0.15s var(--ease-out);
}
.transition-slow {
  transition:
    transform 0.5s var(--ease-out),
    opacity 0.5s var(--ease-out),
    background-color 0.5s var(--ease-out),
    border-color 0.5s var(--ease-out),
    box-shadow 0.5s var(--ease-out);
}

/* hover 类：hover 用 ease，但入场效果用 ease-out */
.hover-lift  { transition: transform 0.3s var(--ease-out); }
.hover-scale { transition: transform 0.3s var(--ease-out); }
.hover-scale:hover { transform: scale(1.05); }  /* 卡片悬停 1.02-1.05 可接受 */
.hover-glow  { transition: box-shadow 0.3s var(--ease-out); }
.hover-glow:hover { box-shadow: 0 0 20px rgba(255, 255, 255, 0.4); }

/* 列表项渐入 */
.animate-list-enter { animation: list-item-enter 0.4s var(--ease-out) forwards; }
```

### 3. 在 [main.js](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/main.js) 中导入 tokens.css

在 animations.css 之前导入：

```js
// main.js:12-14
import "./styles/common/glass-ui.css";
import "./styles/common/tokens.css";   // ← 新增，必须在 animations.css 之前
import "./styles/common/animations.css";
```

## Repo conventions to follow

- **Token 命名**：与 [motion-system.css:1-7](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/BOHAI/BOHAI/styles/motion-system.css#L1) 对齐（`--ease-emphasized` / `--ease-standard`），新增 `--ease-out` / `--ease-in-out` / `--ease-drawer` 三个 AUDIT.md 推荐的 token。
- **import 顺序**：tokens.css 必须在 animations.css 之前导入（main.js L13 → L14）。
- **BOHAI 工作区**保留其局部 `.bohai-page { --bohai-motion-*: ... }` 不动 — 它使用同名 token 但作用域更具体，符合"扩展而非平行"原则。后续 Plan 004 可让 BOHAI 也引用全局 token，本 plan 不动 BOHAI。

## Steps

1. 新建 `src/styles/common/tokens.css`，内容如上 Target §1。
2. 在 `src/main.js` L13 后插入一行 `import "./styles/common/tokens.css";`，**在 `import "./styles/common/animations.css";` 之前**。
3. 编辑 `src/styles/common/animations.css`：
   - 修改 3 处 keyframes（`rotateIn` L236-243、`bounceIn` L196-212、`dotPulse` L416-427）按 Target §2。
   - 把所有 `.animate-fade-in`、`.animate-fade-in-up`、`.animate-fade-in-down`、`.animate-slide-down`、`.animate-zoom-in`、`.animate-pulse`、`.animate-spin`、`.animate-list-enter`、`.animate-skeleton-pulse`、`.animate-skeleton-wave`、`.animate-tab-slide-left`、`.animate-tab-slide-right`、`.animate-upload-spin`、`.animate-card-expand` 的 timing function 改为 `var(--ease-out)` 或 `var(--ease-in-out)`（脉冲/呼吸类用 ease-in-out，常量运动 spin 用 linear）。
   - 把 `.transition-all`、`.transition-fast`、`.transition-slow`、`.transition-transform`、`.transition-opacity`、`.hover-lift`、`.hover-scale`、`.hover-glow` 改为 Target §2 中的具体属性形式。
4. 跑 `npm run lint` 和 `npm run build`。

## Boundaries

- **不动** [motion-system.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/BOHAI/BOHAI/styles/motion-system.css)（BOHAI 已是样板，本 plan 只让全局对齐它）。
- **不动** [variabls.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/helpers/variabls.css) 中的 `.transition { all !important }`（那是 Plan 002 的范围）。
- **不动** [unified-nav.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/vendor/unified-nav.css)（Plan 004 的范围）。
- **不动** reduce-motion 媒体查询（Plan 003 的范围）。
- **不添加新依赖**。
- keyframes 的关键帧内容（translateY(30px)、scale(0.95) 等）只改 scale(0) → scale(0.4-0.9)，不改其它数值。

## Verification

- **机械验证**：
  - `npm run lint` 通过
  - `npm run build` 通过
  - `grep -n "scale(0)" src/styles/common/animations.css` 只剩 `button-ripple`（涟漪扩散，scale(0) 是正确的）
  - `grep -n "transition: all" src/styles/common/animations.css` 返回 0
  - `grep -n "var(--ease-out)" src/styles/common/animations.css` 至少 15 处

- **Feel check**（运行 `npm run dev` 后在浏览器手动验证）：
  - 在任一用 `.animate-fade-in-up` 的元素上，DevTools Animations 面板把速度调到 10%，确认入场是"先快后慢"的 ease-out 曲线（不是均匀的 ease）。
  - 触发 `.animate-zoom-in`，确认起始 scale 是 0.8（不是 0），元素从"小一点"出现而不是"从无到有"。
  - 触发任一使用 `.animate-list-enter` 的列表（如 Forum 帖子列表），确认入场感觉比之前更有"自然减速"。
  - DevTools Rendering 面板 → 勾选 `prefers-reduced-motion: reduce`，确认仍能看到 opacity 淡入（如果完全消失则 Plan 003 没生效）。

- **Done when**：
  - tokens.css 存在并在 main.js 中先于 animations.css 导入
  - animations.css 中无 `transition: all`
  - animations.css 中无 `scale(0)`（除 button-ripple 外）
  - 所有 `.animate-*` helper 引用 `var(--ease-*)` token
  - build 通过且浏览器中入场动画明显更"干脆"
