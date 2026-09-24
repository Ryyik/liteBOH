# 018 — 状态变化微过渡：骨架→内容、展开收起、积分滚动、边缘指示条

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Interruptibility
- **Estimated scope**: 7 文件（~90 行，含一处小组件 JS）

## Problem

一批「状态突变」处完全没有过渡，内容瞬跳，是当前 UserSpace 观感生硬的主要来源：

**1. 展开/收起走 `max-height 0↔3000px`（350ms）。**

```css
/* src/views/user-center/UserSpace/styles/shell-community.css:782-803 — current */
.expand-enter-active, .expand-leave-active {
  transition:
    opacity 220ms var(--ease-spring),
    max-height 350ms var(--ease-spring),
    transform 280ms var(--ease-spring);
  overflow: hidden;
}
.expand-enter-from, .expand-leave-to { opacity: 0; max-height: 0; transform: translateY(-8px); }
.expand-enter-to, .expand-leave-from { opacity: 1; max-height: 3000px; transform: translateY(0); }
```

用于 CommunityTab.vue:103（成员列表）与 :247（生日列表）的 `<transition name="expand">`。3000px 假高度让真实展开前段速度失真，且是布局属性过渡。

**2. 骨架屏→真实内容硬切。** ActivityHeatmap.vue:218-223（`v-if="loading"` 骨架 / `v-else-if="hasData"` 内容）；AssetsHubPanel.vue:50-62（`v-if="overviewLoading"` 骨架 / `<template v-else>` 内容）。

**3. 简介展开/收起 display 突变。** ProfileHomePanel.vue:896-905：`.profile-bio.clamped`（-webkit-line-clamp: 3）↔ `.profile-bio.expanded`（display: block），高度瞬跳。

**4. 积分数字瞬变。** PointsCard.vue:21 `{{ pointsDisplay }}` 纯文本替换；卡片是低频高情绪场景（用户查看自己的资产），允许 delight。

**5. 边缘滑动指示条 v-if 瞬现。** UserSpaceMain.vue:10 `<div v-if="edgeIndicatorVisible" class="edge-swipe-indicator">`；CSS :3031-3060 仅有无限脉冲 `edgeIndicatorPulse`，出现/消失是硬跳——一个空间提示元素应该从它所在的边缘滑入。

**6. 头像框/色环切换瞬变。** FramedAvatar.vue:5-7 `v-if="frameUrl"` / `v-else-if="ring"` 两层直接替换。

## Target

**1. 展开/收起改 grid-template-rows（保留 Vue Transition，不改触发逻辑）：**

```css
/* shell-community.css — target（替换 :782-803） */
.expand-enter-active, .expand-leave-active {
  transition:
    grid-template-rows 280ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 200ms ease-out,
    transform 240ms cubic-bezier(0.23, 1, 0.32, 1);
}
.expand-enter-from, .expand-leave-to {
  opacity: 0; grid-template-rows: 0fr; transform: translateY(-6px);
}
.expand-enter-to, .expand-leave-from {
  opacity: 1; grid-template-rows: 1fr; transform: translateY(0);
}

/* 新增 */
.expand-shell { display: grid; grid-template-rows: 1fr; }
.expand-clip { overflow: hidden; min-height: 0; }
```

```html
<!-- CommunityTab.vue:103 target：外层包壳，内部结构原样 -->
<transition name="expand">
  <div v-if="isCommunityExpanded" class="expand-shell">
    <div class="expand-clip">
      <div class="community-users-list"> <!-- 内容原样保留 --> </div>
    </div>
  </div>
</transition>
```

CommunityTab.vue:247 生日列表同样处理（`.expand-shell`/`.expand-clip` 复用）。原 `.community-users-list` 的 flex 列布局（shell-community.css:806-810）不动——grid 壳在其外层。

**2. 骨架→内容 reveal：**

```css
/* ActivityHeatmap.vue — target（新增；keyframes userspace-panel-in 本文件 :293 已有） */
.heatmap-metrics, .heatmap-scroll {
  animation: userspace-panel-in 240ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
```

```css
/* AssetsHubPanel.vue — target（新增；keyframes ah-materialize 本文件 :1732 已有） */
.ah-smart-focus { animation: ah-materialize 260ms cubic-bezier(0.23, 1, 0.32, 1) both; }
```

（骨架卸载时内容分支重新挂载，animation 自动播放一次，即「到达感」。）

**3. 简介展开 reveal：**

```css
/* ProfileHomePanel.vue — target（新增） */
.profile-bio.expanded { animation: bio-reveal 200ms cubic-bezier(0.23, 1, 0.32, 1); }
.profile-bio.clamped { animation: bio-clamp 150ms ease-out; }
@keyframes bio-reveal { from { opacity: 0.4; transform: translateY(3px); } }
@keyframes bio-clamp { from { opacity: 0.4; } }
```

**4. 积分滚动（PointsCard.vue，唯一 JS 改动）：**

```js
// PointsCard.vue <script setup> — target（追加）
import { computed, onUnmounted, ref, watch } from 'vue'; // computed 已有，补齐其余

const displayPoints = ref(Math.max(0, Number(props.points) || 0));
let rafId = 0;
watch(() => props.points, (to) => {
  const target = Math.max(0, Number(to) || 0);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    displayPoints.value = target;
    return;
  }
  const from = displayPoints.value;
  const start = performance.now();
  const duration = 600;
  cancelAnimationFrame(rafId);
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    displayPoints.value = Math.round(from + (target - from) * eased);
    if (t < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
});
onUnmounted(() => cancelAnimationFrame(rafId));
```

```js
// 原 :53 改为消费动画值（初始挂载不播动画——displayPoints 初值即 props 值）
const pointsDisplay = computed(() => displayPoints.value.toLocaleString('zh-CN'));
```

同时给卡片补按压/悬停反馈（PointsCard.vue:74 现有 hover 无 transition，瞬跳）：

```css
/* PointsCard.vue <style scoped> — target */
.points-card {
  /* 原有声明保留，追加 */
  transition: transform 160ms var(--ease-out, ease-out), box-shadow 160ms var(--ease-out, ease-out);
}
.points-card.is-interactive:active { transform: scale(0.98); }
@media (hover: hover) and (pointer: fine) {
  .points-card.is-interactive:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(27, 49, 69, .12); }
}
@media (prefers-reduced-motion: reduce) {
  .points-card.is-interactive:hover, .points-card.is-interactive:active { transform: none; }
}
```

（原 :74 hover 规则与 :77 reduce 单行删除，由上面三条替代。）

**5. 边缘指示条滑入滑出：**

```html
<!-- UserSpaceMain.vue:10 — target -->
<transition name="edge-ind">
  <div v-if="edgeIndicatorVisible" class="edge-swipe-indicator"></div>
</transition>
```

```css
/* UserSpaceMain.vue <style scoped>（:3031 附近）— target（新增） */
.edge-ind-enter-active { transition: opacity 200ms ease-out, transform 240ms cubic-bezier(0.23, 1, 0.32, 1); }
.edge-ind-leave-active { transition: opacity 240ms ease-out; }
.edge-ind-enter-from { opacity: 0; transform: translateX(10px); }
.edge-ind-leave-to { opacity: 0; }
```

（指示条 fixed 贴右缘，enter 从 +10px 滑入 = 从边缘生长。`edgeIndicatorPulse` 无限脉冲保留——它是功能可见性，reduce 由第 019 计划补 `animation: none`。）

**6. 头像框 crossfade：**

```html
<!-- FramedAvatar.vue:5-7 — target -->
<Transition name="fa-swap" mode="out-in">
  <span v-if="frameUrl" key="frame" class="boh-avatar-frame" :style="frameStyle" aria-hidden="true"></span>
  <span v-else-if="ring" key="ring" class="fa-mock-ring" :class="{ 'is-rainbow': ring === 'rainbow' }"
    :style="ring !== 'rainbow' ? { '--fa-ring-color': ring } : null" aria-hidden="true"></span>
</Transition>
```

```css
/* FramedAvatar.vue <style scoped> — target（新增） */
.fa-swap-enter-active { transition: opacity 180ms ease-out, transform 180ms ease-out; }
.fa-swap-enter-from { opacity: 0; transform: scale(1.04); }
.fa-swap-leave-active { transition: opacity 100ms ease-out; }
.fa-swap-leave-to { opacity: 0; }
```

（Vue 内置 `<Transition>` 在 SFC 模板中无需 import。）

reduce 补充（本计划范围内顺手加）：

```css
/* shell-community.css reduce 块（:302-309）内追加 */
.expand-enter-active, .expand-leave-active { transition-duration: 1ms; }
/* ActivityHeatmap.vue reduce 块（:551-561）内追加 */
.heatmap-metrics, .heatmap-scroll { animation: none; }
/* ProfileHomePanel.vue reduce 块（:1388）内追加 */
.profile-bio.expanded, .profile-bio.clamped { animation: none; }
```

## Repo conventions to follow

- rAF 定时器必须清理（project_memory 硬约束）；reduce 用 `matchMedia` 分支跳过（同全局惯例）。
- grid-template-rows 0fr/1fr 是本项目可用的展开方案（019 计划的 shimmer 等不适用此法，勿混用）。
- 强 ease-out 字面量 `cubic-bezier(0.23, 1, 0.32, 1)` 与 013/016 保持一致。

## Steps

1. shell-community.css：替换 expand 三段规则 + 新增 `.expand-shell`/`.expand-clip`；reduce 块追加。
2. CommunityTab.vue：两处 `<transition name="expand">` 内容包壳。
3. ActivityHeatmap.vue：reveal 规则新增 + reduce 追加。
4. AssetsHubPanel.vue：`.ah-smart-focus` reveal 新增。
5. ProfileHomePanel.vue：bio-reveal/bio-clamp 新增 + reduce 追加。
6. PointsCard.vue：count-up JS + 卡片 transition/active/hover/reduce 替换。
7. UserSpaceMain.vue：指示条包 Transition + 四条过渡规则。
8. FramedAvatar.vue：fa-swap 包裹 + 四条规则。

## Boundaries

- 不改任何业务逻辑（展开条件、积分来源、指示条触发手势 useEdgeSwipeGesture）。
- PointsCard 除 count-up 外不改 props/emit；`.points-card-cat` 皮肤布局不动。
- 不碰 AssetsHubPanel 骨架本身（ah-shimmer）与 `ah-panel` 过渡。
- 若 CommunityTab:247 生日列表的容器类名与预期不符，按「v-if 元素外包 expand-shell/expand-clip」模式适配并记录。

## Verification

- **Mechanical**: `npm run build`；`rg "max-height: 3000px" src/` 零命中。
- **Feel check**:
  - 方块页展开「社区伙伴」：列表从 0 高度顺滑生长 280ms，收起反向；快速反复点开合不跳变；
  - 活跃轨迹/资产总览：骨架消失瞬间内容轻浮入（240-260ms），不再闪现；
  - 简介展开收起：轻微浮沉+淡入，高度跳变被掩盖；
  - 积分变动（如签到后）：数字 600ms ease-out 滚动到新值；reduce 下直接跳到新值；
  - 从屏幕右缘滑动唤起 AI：绿色指示条从边缘滑入，松手后淡出；
  - 更换头像框：旧层快速淡出、新层 180ms 淡入微缩；
  - reduce 全程复核：以上位移动画全部退化为瞬时。
- **Done when**: 六处状态突变均有 ≤280ms 的衔接过渡，reduce 完整。
