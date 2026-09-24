# 013 — 重做 UserSpace Tab 切换动效（曲线、时序、方向复位）

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: HIGH
- **Category**: Easing / Interruptibility / Performance
- **Estimated scope**: 2 文件（shell-community.css 约 60 行 + UserSpaceMain.vue 约 6 行）

## Problem

Tab 切换是 UserSpace 最高频的动效，当前实现有三处硬伤：

**1. 出场用 ease-in 曲线且被硬截断。**

```css
/* src/views/user-center/UserSpace/styles/shell-community.css:276-279 — current */
.user-space-page.tab-transition-forward .tab-page.is-leaving {
  animation: userspace-tab-out-forward 250ms cubic-bezier(0.4, 0, 1, 1) forwards;
  will-change: transform, opacity;
}
/* :287-290 后退方向同样 cubic-bezier(0.4, 0, 1, 1) */
```

`cubic-bezier(0.4, 0, 1, 1)` 起步速度为 0——正是用户盯着看的切屏瞬间被拖慢；属于「ease-in 用在 UI 出场」反模式。

```js
// src/views/user-center/UserSpace/UserSpaceMain.vue:346 — current
const TAB_LEAVE_CLEAR_DELAY_MS = 170;
```

离场页在 170ms 被摘除 `leavingTab`（触发 v-show 隐藏），而出场动画要跑 250ms——**动画在中途被硬截断，末端跳一下**。

**2. 方向类永不复位。**

```js
// UserSpaceMain.vue:459 — current
const tabTransitionDirection = ref('forward');
```

`tab-transition-forward/back` 类一旦加上永不移除，导致：
- `will-change: transform, opacity`（shell-community.css:273/278/284/289）**常驻**在可见页签上；
- 每次通过 v-show 重新显示页签（mountedTabs 闩锁机制），都会按**上一次的方向**重播一遍 280ms 入场动画；
- 基础规则 `.tab-page { animation: userspace-tab-in 180ms ... backwards; }`（:266-268）在方向类增删时会再重放一次。

**3. 移动端进出场性格不一致**：入场已改为纯 fade（:343-352），出场仍是 translate3d 滑动。

## Target

```css
/* shell-community.css — target（替换 193-309 段中的对应规则） */

/* 基础规则：方向类是唯一的入场驱动；方向复位后不再重放 */
.tab-page {
  animation: none;
}

/* 出场：180ms 强 ease-out，先快后稳，带轻微景深模糊 */
.user-space-page.tab-transition-forward .tab-page.is-leaving {
  animation: userspace-tab-out-forward 180ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
  will-change: transform, opacity;
}
.user-space-page.tab-transition-back .tab-page.is-leaving {
  animation: userspace-tab-out-back 180ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
  will-change: transform, opacity;
}

/* 入场：300ms 强 ease-out（非对称：出场快、入场稳） */
.user-space-page.tab-transition-forward .tab-page:not(.is-leaving) {
  animation: userspace-tab-in-forward 300ms cubic-bezier(0.23, 1, 0.32, 1) backwards;
  will-change: transform, opacity;
}
.user-space-page.tab-transition-back .tab-page:not(.is-leaving) {
  animation: userspace-tab-in-back 300ms cubic-bezier(0.23, 1, 0.32, 1) backwards;
  will-change: transform, opacity;
}
```

```css
/* 出场 keyframes 增加景深模糊（新旧帧都要写 filter） */
@keyframes userspace-tab-out-forward {
  from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
  to { opacity: 0; transform: translate3d(-18px, 0, 0) scale(0.985); filter: blur(3px); }
}
@keyframes userspace-tab-out-back {
  from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
  to { opacity: 0; transform: translate3d(18px, 0, 0) scale(0.985); filter: blur(3px); }
}
/* 入场 keyframes（userspace-tab-in-forward / -in-back）几何不变，
   仅把 30px 保持、scale 0.985 保持，时长改由 animation 简写控制 */
```

```css
/* 移动端（≤768px，:314-353 媒体块内）：进出场统一为 fade */
.user-space-page.tab-transition-forward .tab-page.is-leaving,
.user-space-page.tab-transition-back .tab-page.is-leaving {
  animation: userspace-tab-out-fade 160ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
}
@keyframes userspace-tab-out-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
/* 入场沿用既有 userspace-tab-in-fade，时长改 240ms、曲线改 cubic-bezier(0.23, 1, 0.32, 1) */
```

```css
/* reduce 块（:302-309）改为直接关动画 */
@media (prefers-reduced-motion: reduce) {
  .tab-page,
  .tab-page.is-leaving,
  .user-space-page.tab-transition-forward .tab-page,
  .user-space-page.tab-transition-back .tab-page {
    animation: none;
  }
}
```

```js
// UserSpaceMain.vue — target
const TAB_LEAVE_CLEAR_DELAY_MS = 340; // ≥ 出场 180ms + 入场 300ms 的收尾余量，且 > 两者

const tabTransitionDirection = ref(''); // 初始无方向：首屏不播入场

// clearLeavingTabTimer 回调（:1961-1966）中追加一行，复位方向：
clearLeavingTabTimer = setTimeout(() => {
  if (leavingTab.value === previousTab) {
    leavingTab.value = null;
  }
  tabTransitionDirection.value = '';
  clearLeavingTabTimer = null;
}, TAB_LEAVE_CLEAR_DELAY_MS);
```

`switchTab`（:1930）在改 `currentTab` 前已调用 `updateTabTransitionDirection`（:1934），所以切换瞬间方向类总是存在的；方向复位为 `''` 后 `.tab-page` 的 animation-name 变为 `none`，**不会重放**。

## Repo conventions to follow

- 强 ease-out 值取自全局 token：`src/styles/common/tokens.css:32` `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`。本文件局部 `--ease-out`（shell-community.css:31）是 `(0.16, 1, 0.3, 1)`，为避免歧义**统一写字面量** `cubic-bezier(0.23, 1, 0.32, 1)`。
- 出快进稳的非对称节奏是 AUDIT 规范（entering → ease-out；时长预算 modal/page 级 200-500ms）。

## Steps

1. shell-community.css `:266-268`：基础 `.tab-page` 规则改为 `animation: none;`。
2. `:271-290`：四条方向规则按 Target 替换（入场 300ms、出场 180ms，曲线统一 `cubic-bezier(0.23, 1, 0.32, 1)`）。
3. `:232-241` / `:255-264`：两个出场 keyframes 增加 `filter: blur(0) → blur(3px)`，水平位移 26/30px 收敛为 18px（入场 keyframes 几何不动）。
4. `:314-353` 移动端媒体块：新增出场 fade 规则与 `userspace-tab-out-fade` keyframes；入场 fade 改 240ms + 强 ease-out。
5. `:302-309` reduce 块改 `animation: none`。
6. UserSpaceMain.vue `:346` 延时改 340；`:459` 初始值改 `''`；timer 回调追加方向复位。

## Boundaries

- 不改 `mountedTabs` 闩锁逻辑、v-if/v-show 结构、`is-leaving` 的 z-index/contain 规则（:292-300）。
- 不碰 bottom-nav.css、SegmentTabs.vue（另有计划）。
- 不删除 `userspace-tab-in`（180ms 基础）keyframes 定义本身可保留（不再被引用即可），如确认无其他引用可删。
- 若实际代码与本 Plan 引用偏差较大（commit 漂移），STOP 并报告，不要即兴发挥。

## Verification

- **Mechanical**: `npm run build` 通过；`rg "TAB_LEAVE_CLEAR_DELAY_MS" src/` 只剩一处 340。
- **Feel check**（`npm run dev` 后进 /user-space）：
  - 快速连续切换 5 个页签（前进/后退混合）：无从零重放的跳变、无 ~170ms 处的截断顿挫；出页快速让位、入页 300ms 稳稳落位；
  - DevTools Animations 面板 10% 速度：出场页先快后淡出并轻微模糊（景深），入场页 30px 滑入；
  - 切换结束后检查根元素 class：无 `tab-transition-*` 残留；DevTools Elements 选中可见页签：无 `will-change` 内联/继承生效；
  - 切走再切回同一页签（v-show 复用）：方向与此次操作一致，不再按历史方向重播；
  - reduce 模式：页签瞬时切换，无任何位移动画。
- **Done when**: 高频连切无跳变，will-change 不常驻，reduce 下降级完整。
