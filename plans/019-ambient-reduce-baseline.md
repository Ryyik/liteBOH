# 019 — 环境动效收敛 + reduce/hover 全量基线

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: MEDIUM（视觉噪声）+ HIGH（无障碍缺口）
- **Category**: Purpose & frequency / Accessibility / Easing
- **Estimated scope**: 11 文件（机械性改动为主，逐条清单化）

## Problem

三类系统性缺口。**必须最后执行**（依赖 013/016/017/018 落位后的最终选择器清单）。

**A. 常驻无限动效抢注意力**（规范：常驻元素上的装饰性循环动效应删除或改为一次性入场）：

```css
/* bottom-nav.css:332 — current：未读角标永久脉冲 */
animation: badge-pulse 2s ease-in-out infinite;
/* profile-panels.css:565 — current：礼物进度徽章同样 2s infinite（keyframes :569-578 还带 box-shadow 动画） */
animation: badge-pulse 2s ease-in-out infinite;
/* profile-panels.css:1202 — 赞助页吉祥物 3.8s 无限漂浮 */
animation: sponsorCatFloat 3.8s ease-in-out infinite;
/* profile-panels.css:1411-1412 — 庆祝猫 pop + 无限 float 叠加 */
animation: sponsorCatPop 2.8s cubic-bezier(0.16, 1, 0.3, 1) both,
  sponsorCatFloat 3.6s ease-in-out infinite 0.8s;
```

**B. 骨架 shimmer 是恒定运动却用 `ease-in-out`**（应为 `linear`；AssetsHubPanel.vue:1719 已是正确样例 `ah-shimmer 1.2s infinite linear`）：
- shell-community.css:434（`skeleton-shimmer 1.4s ease-in-out infinite`）、:693（`badge-shimmer 1.2s ease-in-out infinite`）
- profile-base.css:762（`userspace-forum-skeleton-shimmer 1.3s ease-in-out infinite`）
- profile-panels.css:253（`userspace-stat-shimmer 1.15s ease-in-out infinite`）
- ProfileHomePanel.vue:1377（`userspace-stat-shimmer 1.15s ease-in-out infinite`）
- ActivityHeatmap.vue:341（`heatmap-shimmer 1.4s ease-in-out infinite`）
- AiChatSkeleton.vue:198（`ai-shimmer-anim 1.5s infinite`——省略缓动即默认 ease，补 `linear`）

**C. reduce / hover 基线缺口**：profile-panels.css 与 responsive-integrations.css 整文件无 `prefers-reduced-motion` 块；一批带 transform 的 `:hover` 未被 `@media (hover: hover) and (pointer: fine)` 门控（触屏点按假 hover）。

## Target

### A. 无限动效收敛

```css
/* bottom-nav.css:332 — target：角标改为一次性入场弹入（未读出现时播一次） */
animation: badge-in 240ms cubic-bezier(0.34, 1.3, 0.64, 1) both;
/* 新增 keyframes，删除 :336-344 badge-pulse */
@keyframes badge-in { from { opacity: 0; transform: scale(0.6); } }

/* profile-panels.css:565 — target：同样 badge-in 240ms；删除 :569-578 旧 keyframes */

/* profile-panels.css:1202 — target：hero 猫保留漂浮但放缓减弱 */
animation: sponsorCatFloat 5.2s ease-in-out infinite;
/* 对应 keyframes（:1465 起）纵向振幅减半（translateY 峰值改 ±4px 以内） */

/* profile-panels.css:1411-1412 — target：庆祝猫只 pop 一次，删无限 float */
animation: sponsorCatPop 1.8s cubic-bezier(0.16, 1, 0.3, 1) both;
/* animation-delay 双值（:1428 等）改单值 0.12s / 0.32s */
```

### B. shimmer 统一 linear

上述 B 列出的 7 处全部改为 `... infinite` 且缓动为 `linear`（时长不变）。

### C1. hover 门控（把含 transform 的 :hover 规则移入媒体查询；只变色/阴影的 hover 不动）

逐文件清单（行号为 commit fc8dfc74 时点，漂移则以选择器定位）：

| 文件 | 规则 |
| --- | --- |
| bottom-nav.css | `:230 .nav-item:hover`、`:649 .bottom-nav-island-close:hover` |
| side-rail.css | `:252 .userspace-rail-item:hover`、`:312 .userspace-rail-item:hover .userspace-rail-icon` |
| profile-base.css | `:930 .apple-card:hover`、`:1092 .profile-follow-btn:hover`（transform 行） |
| ProfileHomePanel.vue | `:792 .profile-cover-action`、`:823 .profile-settings-btn:hover`、`:855 .profile-hero-avatar:hover`、`:941 .profile-edit-btn:hover` |
| profile-panels.css | `:1331 .sponsor-method:hover`、`:1407 区段 .sponsor-primary-btn:hover` |
| shell-community.css | `:590 .community-group:hover` |
| AssetsHubPanel.vue | `:2229 .ah-ledger-item:hover`、`:2452/.2459 .ah-sponsor-card:hover`、`:2484 .ah-lottery-card:hover`、`:2611 .ah-points-action-card:hover` |
| responsive-integrations.css | `:539 .theme-option:hover` |
| AvatarFrameGrid.vue | `:357 .afg-card:hover` |
| ProfileImpressionsPanel.vue | `:213 .profile-impression-card:hover`、`:460 .impression-load-more-btn:hover` |

模式（以 apple-card 为例）：

```css
@media (hover: hover) and (pointer: fine) {
  .apple-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
}
```

注意 profile-panels.css:1615-1622 `.profile-edit-btn` 的 hover 位移与 `:active scale(0.98)` 争用 transform——hover 进门控后触屏按压不再互相覆盖。

### C2. reduce 基线（新块或扩展现有块；原则：保留 opacity/color 反馈，砍位移/缩放与无限循环）

```css
/* profile-panels.css 文件末尾新增 */
@media (prefers-reduced-motion: reduce) {
  .userspace-stat-shimmer 所在选择器, .badge-*, .sponsor-hero-cat, .sponsor-party-cat { animation: none; }
  .modal-card, .sponsorCatPop 目标元素 { animation-duration: 1ms; }
  .profile-edit-btn:hover, .sponsor-method:hover, .sponsor-primary-btn:hover { transform: none; }
}

/* responsive-integrations.css 文件末尾新增 */
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active { transition-duration: 1ms; }
  .fade-enter-from { transform: none; }
  .check-pop-enter-active, .check-pop-leave-active { transition-duration: 1ms; }
  .theme-option:hover { transform: none; }
}
```

（017 已在两文件写过 reduce 片段——合并进同一块，勿重复。）

扩展既有块：

- **shell-community.css:302-309** 追加：`.skeleton-block, .skeleton-line, .badge-loading::after { animation: none; }`；`.forum-card-in 使用者` 与 `userspace-list-item-in` 使用者改 opacity-only：

```css
@keyframes reduce-fade { from { opacity: 0; } }
.user-space-page .forum-page.embedded-mode .post-card,
.user-space-page .forum-page.embedded-mode .post-composer,
.user-item, .community-users-list .user-item {
  animation-name: reduce-fade;
  animation-duration: 150ms;
}
```

（`userspace-list-item-in` 定义于 shell-community.css:957，消费者带 `--item-index` stagger——保留 delay，仅换 name。）

- **profile-base.css:775-779** 追加：`.profile-subpage-shell { animation-duration: 1ms; }`（:862 userspace-subpage-in）、`.profile-post-card { animation-duration: 1ms; }`（:1275）、`@keyframes reduce-fade` 同款用于 shimmer 消费者 `animation: none`；hover transform none 与 C1 合并处理。

- **AiChatSkeleton.vue** 文件末尾新增：`@media (prefers-reduced-motion: reduce) { .ai-shimmer, .ai-shimmer 类的骨架元素 { animation: none; } }`（骨架退化为静态色块，可接受）。

- **UserSpaceMain.vue** reduce（新增块）：`.edge-swipe-indicator { animation: none; }`。

- **ActivityHeatmap.vue:551-561**、**ProfileImpressionsPanel.vue:491-**、**AssetsHubPanel.vue:2645-**：各追加 hover transform none 一行（016/018 已补动画侧）。

### D. 顺手清理

- ActivityHeatmap.vue:453：`.heatmap-cell` 的 transition 删除死属性 `transform 160ms var(--ease-out)`（无任何规则改变它的 transform），仅保留 `outline-color 160ms ease`。

## Repo conventions to follow

- reduce 的正确写法参照 bottom-nav.css:280-302（animation none + transition-duration 1ms）与 PointsCard.vue:77（hover transform none）。
- `cubic-bezier(0.34, 1.3, 0.64, 1)` 入场弹入曲线与 012/014/015 一致。
- shimmer 正确样例：AssetsHubPanel.vue:1719。

## Steps

1. A 组：3 个文件的无限动效改一次性/减弱（含 keyframes 增删）。
2. B 组：7 处 shimmer 缓动改 linear。
3. C1 组：按清单把带 transform 的 hover 移入门控媒体查询。
4. C2 组：11 个文件的 reduce 新增/合并/扩展（先 `rg -n "prefers-reduced-motion" src/views/user-center/UserSpace` 盘点现状，避免重复块）。
5. D 组：删除死 transition 属性。

## Boundaries

- 不改 `spin` / `load-more-spin` / `gs-spin` 等**功能必需**的旋转指示器（linear 且语义正确；settings-glass.css:662 reduce 块未覆盖 gs-spin 属可接受——spinner 表达加载状态，保留）。
- 不碰全局 animations.css / unified-nav.css（另有 plans/001-004）。
- 不在本计划处理 `transition: all`（性能议题，另行决定）。
- 每处改动以选择器定位；行号漂移不作为 STOP 理由（本计划是机械清扫），但选择器名对不上时必须 STOP。

## Verification

- **Mechanical**: `npm run build`；`rg "ease-in-out infinite" src/views/user-center/UserSpace` 仅剩 sponsor hero cat（有意保留）与 spin 类（白名单）；`rg "prefers-reduced-motion" src/views/user-center/UserSpace -l` 覆盖 11 个文件。
- **Feel check**:
  - 底栏未读角标只在出现瞬间弹一下，之后静止；徽章数字加载 shimmer 匀速；
  - 赞助页只保留 hero 猫缓慢漂浮，庆祝猫 pop 一次后静止；
  - DevTools Rendering 开 reduce：全站无无限动画（shimmer 全静止）、卡片 hover 无位移但颜色反馈保留、骨架→内容瞬时替换；
  - 触屏设备（或 DevTools 触摸模拟）点按卡片：无残留上浮；
  - 013-018 的新动效在 reduce 下全部降级（联检）。
- **Done when**: 无注意力窃取型循环动画、shimmer 全站 linear、reduce/hover 基线全覆盖。
