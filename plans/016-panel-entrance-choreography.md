# 016 — 面板入场编排统一：一套节奏 + 级联延迟

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens / Easing & duration
- **Estimated scope**: 5 文件（各 2-6 行）

## Problem

UserSpace 各主面板共用同一个入场 keyframes（`userspace-panel-in`，14px 上浮），但**时长碎片化、各自为政**，同一屏的面板节奏互相打架：

```css
/* src/views/user-center/UserSpace/components/ProfileHomePanel.vue:712 — current */
.profile-hero-panel { /* ... */ animation: userspace-panel-in 300ms var(--ease-out) both; }
/* ProfileHomePanel.vue:961 */
.profile-service-panel { /* ... */ animation: userspace-panel-in 320ms var(--ease-out) 50ms both; }
/* ProfileHomePanel.vue:1084 */
.profile-content-panel { /* ... */ animation: userspace-panel-in 340ms var(--ease-out) 90ms both; }
/* src/views/user-center/UserSpace/components/ActivityHeatmap.vue:290 */
.profile-activity-heatmap { /* ... */ animation: userspace-panel-in 330ms var(--ease-out) 70ms both; }
```

300/320/330/340ms 四种时长 + 50/70/90ms 三种延迟，全部踩过 UI 300ms 预算，入场整体观感「拖」。

同类问题：

```css
/* src/views/user-center/UserSpace/styles/shell-community.css:488-494 — current */
.user-space-page .forum-page.embedded-mode .post-card,
.user-space-page .forum-page.embedded-mode .post-composer {
  animation: forum-card-in 350ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
/* forum-card-in（:496-508）from: translateY(30px) scale(0.97) blur(2px) — 位移过大 */
```

```css
/* src/views/user-center/UserSpace/components/ProfileImpressionsPanel.vue:209 — current */
animation: impression-card-in 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) both;
/* animation-delay: var(--stagger-delay, 0ms); — stagger 保留 */
```

400ms + 1.2 过冲曲线，与「克制玻璃拟态」不符。

## Target

统一为一套节奏：**280ms 强 ease-out，级联延迟 0 / 60 / 120ms**（30-80ms stagger 规范区间，总编排 ≤400ms 完成，不阻塞交互——延迟只作用于入场透明度/位移）。

```css
/* target — ProfileHomePanel.vue */
.profile-hero-panel    { animation: userspace-panel-in 280ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.profile-service-panel { animation: userspace-panel-in 280ms cubic-bezier(0.23, 1, 0.32, 1) 60ms both; }
.profile-content-panel { animation: userspace-panel-in 280ms cubic-bezier(0.23, 1, 0.32, 1) 120ms both; }
```

```css
/* target — ActivityHeatmap.vue:290 */
.profile-activity-heatmap { /* ... */ animation: userspace-panel-in 280ms cubic-bezier(0.23, 1, 0.32, 1) 60ms both; }
```

```css
/* target — shell-community.css:488-494 与 :496-508 */
.user-space-page .forum-page.embedded-mode .post-card,
.user-space-page .forum-page.embedded-mode .post-composer {
  animation: forum-card-in 280ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
@keyframes forum-card-in {
  from { opacity: 0; transform: translateY(14px) scale(0.98); filter: blur(2px); }
  to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
```

```css
/* target — ProfileImpressionsPanel.vue:209 */
animation: impression-card-in 280ms cubic-bezier(0.23, 1, 0.32, 1) both;
/* animation-delay: var(--stagger-delay, 0ms); 保持不变 */
/* impression-card-in keyframes（:218-224）几何不变（translateY(10px)），只换曲线时长 */
```

两个 keyframes 定义处（profile-base.css:361、ActivityHeatmap.vue:293 的 scoped 副本）几何均为 14px 上浮，保持不变。

reduce 处理：各文件既有 reduce 块（ProfileHomePanel.vue:1388、ActivityHeatmap.vue:551、ProfileImpressionsPanel.vue:491）需把上述选择器纳入 `animation-duration: 1ms`（或 none）——ActivityHeatmap:551 现有块是 `animation-duration: 1ms`（作用于 .profile-activity-heatmap），已覆盖；ProfileImpressions:491 已有 `.profile-impression-card { animation: none; }`；ProfileHomePanel 的 reduce 块需**新增**三条面板规则。

## Repo conventions to follow

- 强 ease-out 字面量 `cubic-bezier(0.23, 1, 0.32, 1)` = 全局 `--ease-out`（tokens.css:32）；UserSpace 局部遮蔽值是 `(0.16, 1, 0.3, 1)`，为全站一致**写字面量**。
- 级联参考样例：列表项 30ms stagger 已正确（shell-community.css:954 `animation-delay: calc(var(--item-index, 0) * 30ms)`），容器级编排沿用 60ms 粒度。

## Steps

1. ProfileHomePanel.vue `:712 / :961 / :1084`：三条 animation 替换（280ms / 60ms / 120ms，曲线字面量）。
2. ProfileHomePanel.vue `:1388-1392` reduce 块内新增 `.profile-hero-panel, .profile-service-panel, .profile-content-panel { animation-duration: 1ms; animation-delay: 0ms; }`。
3. ActivityHeatmap.vue `:290`：替换为 280ms / 60ms。
4. shell-community.css `:488-494`：时长曲线替换；`:496-508` keyframes from 值按 Target 收敛。
5. ProfileImpressionsPanel.vue `:209`：替换曲线时长（保留 stagger delay 行）。

## Boundaries

- 不改 keyframes 名称与几何（14px 上浮体系）、不改 stagger 变量（--stagger-delay / --item-index / --post-appear-delay）。
- 不碰 profile-base.css:1275 的 `profile-post-card-in 340ms`（属 019 的同名合并议题）。
- 不碰 AssetsHubPanel 的 `ah-materialize`（属 018）。
- 各文件实际行号若漂移，以选择器名定位。

## Verification

- **Mechanical**: `npm run build`；`rg "userspace-panel-in [0-9]{3}ms" src/views/user-center/UserSpace` 所有命中均为 280ms。
- **Feel check**（进入「我的」页签）:
  - 头像卡落定 → 60ms 后服务面板跟上 → 120ms 后内容面板收尾：可感知的级联但总时长 <450ms，无「各个面板各走各的」散乱感；
  - 论坛嵌入页刷新：帖子卡 14px 轻浮入 + 微模糊，不再 30px 大位移砸下来；
  - DevTools Animations 10%：三个面板的间距精确为 60ms；
  - reduce 模式：面板直接呈现，无位移。
- **Done when**: 同屏面板共用 280ms/0-60-120ms 一套节奏。
