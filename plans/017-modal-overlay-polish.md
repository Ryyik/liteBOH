# 017 — 模态与覆盖层家族升级：曲线统一 + 勾选弹入 + island 收敛

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: MEDIUM
- **Category**: Easing / Physicality / Cohesion
- **Estimated scope**: 5 文件（~50 行）

## Problem

模态/覆盖层是「允许魅力预算」的场景（低频、可稍长），但当前家族成员曲线各异且偏弱：

**1. 通用模态入场用裸 `ease`。**

```css
/* src/views/user-center/UserSpace/styles/profile-panels.css:739 — current */
.modal-card { /* ... */ animation: modalIn 0.25s ease; }
/* @keyframes modalIn :742-750 from: opacity 0, scale(0.95) translateY(10px) */
```

**2. ThemeModal 纯 fade、选中勾瞬现。**

```css
/* src/views/user-center/UserSpace/styles/responsive-integrations.css:497-505 — current */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
```

```html
<!-- ThemeModal.vue:30-31 / :44 — current：Check 图标 v-if 生灭，无任何过渡 -->
<Check v-if="currentThemePreference === 'light'" class="theme-check" ... />
```

**3. AvatarFramePickerModal 退场曲线与入场不一致。**

```css
/* src/views/user-center/UserSpace/components/AvatarFramePickerModal.vue:249-259 — current */
.afpm-fade-enter-active { transition: opacity 240ms cubic-bezier(0.32, 0.72, 0, 1); }
.afpm-fade-leave-active { transition: opacity 160ms ease; }          /* 裸 ease */
.afpm-fade-enter-active .afpm-card { transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1); }
/* :261-268 leave-to 只有 opacity，卡片退场无位移 */
```

**4. 底栏 island 出入场时长失控（560-940ms）。**

```css
/* src/views/user-center/UserSpace/components/bottom-nav.css:658-673 — current */
.bottom-nav-island-enter-active, .bottom-nav-island-leave-active {
  transition: opacity 0.56s ease, transform 0.78s cubic-bezier(0.32, 0.72, 0.36, 1), filter 0.56s ease;
}
.bottom-nav-island-enter-active .bottom-nav-island-icon, /* ...四个子元素 */ {
  transition: opacity 0.84s ease, transform 0.94s cubic-bezier(0.19, 1, 0.22, 1);
}
```

入场等 0.94s 才完全落位；:693-713 leave 段 0.52-0.7s 同样偏长（收合回导航条的形态本身很好，只改时长曲线）。

## Target

```css
/* profile-panels.css — target */
.modal-card { animation: modalIn 320ms cubic-bezier(0.23, 1, 0.32, 1); }
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.94) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
```

```css
/* responsive-integrations.css — target（ThemeModal 用） */
.fade-enter-active { transition: opacity 220ms cubic-bezier(0.23, 1, 0.32, 1), transform 260ms cubic-bezier(0.23, 1, 0.32, 1); }
.fade-leave-active { transition: opacity 160ms ease-out; }
.fade-enter-from { opacity: 0; transform: translateY(10px) scale(0.97); }
.fade-leave-to { opacity: 0; }

/* 勾选弹入（新增；svg 必须声明 transform-box 才能绕自身中心缩放） */
.check-pop-enter-active { transition: transform 240ms cubic-bezier(0.34, 1.5, 0.64, 1), opacity 180ms ease-out; }
.check-pop-enter-from { opacity: 0; transform: scale(0.5); }
.check-pop-leave-active { transition: opacity 100ms ease-out; }
.check-pop-leave-to { opacity: 0; }
.theme-check { transform-origin: center; transform-box: fill-box; }
```

```html
<!-- ThemeModal.vue — target：两处 Check（:30 与 :44）各自包裹 -->
<Transition name="check-pop">
  <Check v-if="currentThemePreference === 'light'" key="light" class="theme-check" :size="16" :stroke-width="2.2" aria-hidden="true" />
</Transition>
<!-- 深色同理，key="dark" -->
```

注意：`.fade` 的 enter-from 现在带 transform——`.fade` 还被 ThemeModal 的 overlay 使用（ThemeModal.vue:2 `<transition name="fade">` 包住 `.modal-overlay`）。**transform 加在 overlay 上没问题**（整体浮起 10px），但 scale(0.97) 会让背景遮罩也轻微缩放，观感可接受；feel-check 确认，若遮罩缩放可见则去掉 scale 只留 translateY。

```css
/* AvatarFramePickerModal.vue — target */
.afpm-fade-leave-active { transition: opacity 200ms cubic-bezier(0.32, 0.72, 0, 1); }
.afpm-fade-leave-active .afpm-card { transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1); }
.afpm-fade-leave-to .afpm-card { transform: translateY(8px) scale(0.985); }
.afpm-fade-enter-active .afpm-card { transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1); }
/* enter-from 卡片 translateY(14px) scale(0.975) 保持 */
```

```css
/* bottom-nav.css — target（island） */
.bottom-nav-island-enter-active, .bottom-nav-island-leave-active {
  transition:
    opacity 300ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 420ms cubic-bezier(0.32, 0.72, 0, 1),
    filter 300ms ease-out;
}
.bottom-nav-island-enter-active .bottom-nav-island-icon,
.bottom-nav-island-enter-active .bottom-nav-island-copy,
.bottom-nav-island-enter-active .bottom-nav-island-close,
.bottom-nav-island-enter-active .bottom-nav-island-accent {
  transition:
    opacity 320ms ease-out,
    transform 460ms cubic-bezier(0.23, 1, 0.32, 1);
}
.bottom-nav-island-leave-active .bottom-nav-island-content {
  transition:
    transform 320ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 260ms ease-out,
    box-shadow 260ms ease-out;
}
.bottom-nav-island-leave-active::after {
  transition: opacity 220ms ease, transform 260ms cubic-bezier(0.32, 0.72, 0, 1), bottom 260ms cubic-bezier(0.32, 0.72, 0, 1);
}
/* enter-from / leave-to 的几何（translateY(16px) scale(0.982)、blur(3px)、scaleY(0.66) 收合形态）全部保持 */
```

reduce（各文件新增/扩展）：

```css
@media (prefers-reduced-motion: reduce) {
  .modal-card { animation-duration: 1ms; }
  .fade-enter-from, .afpm-fade-enter-from .afpm-card, .afpm-fade-leave-to .afpm-card { transform: none; }
  .check-pop-enter-active, .check-pop-leave-active { transition-duration: 1ms; }
}
```

bottom-nav island 的 reduce 由既有 :981-994 块（`.bottom-nav-island *` transition-duration 0.12s + animation none）覆盖，无需改。

## Repo conventions to follow

- `cubic-bezier(0.32, 0.72, 0, 1)` = 全局 `--ease-drawer`（tokens.css:36），覆盖层/抽屉系标准曲线，AFPM 与 island 原本就在用，只是时长失控。
- 模态豁免 transform-origin 检查（居中出现是正确的）；勾选图标是 svg，必须 `transform-box: fill-box`。
- 项目约束：模态统一走既有体系，本计划只改动效，不改开关逻辑。

## Steps

1. profile-panels.css `:739` 与 `:742-750`：按 Target 替换。
2. responsive-integrations.css `:497-505`：按 Target 替换；文件内新增 check-pop 四条与 .theme-check transform-box 规则。
3. ThemeModal.vue `:30-31`、`:44`：`<Check>` 包 `<Transition name="check-pop">`（各自加 key）。
4. AvatarFramePickerModal.vue `:249-268`：leave 段按 Target 替换，enter 卡片 300→280ms。
5. bottom-nav.css `:658-673`、`:693-713`：时长曲线按 Target 替换（leave-to 几何不动）。
6. 各文件新增/扩展 reduce 块（见上）。

## Boundaries

- 不改模态开关逻辑、v-if 结构（除包裹 Transition）、遮罩点击关闭行为。
- 不动 settings-glass.css（导出进度条属性能议题，不在本批）。
- 不动 useConfirmDialog / AdminConfirmModal 体系。
- island 子元素 leave 段 `transition: none`（:675-680）保持——收合由 content 承载。

## Verification

- **Mechanical**: `npm run build`；`rg "0\.9[46]s|0\.84s|0\.78s" src/views/user-center/UserSpace` 零命中。
- **Feel check**:
  - 设置 → 主题设置：卡片 12px 浮入 320ms 落定；点深色/浅色：勾标从中心弹性放大，切换时旧勾 100ms 淡出；
  - 头像框选择器：打开浮入、关闭时卡片轻微下沉 8px 淡出，开合曲线一致；
  - 底栏 island 展开/收合：内容 ~460ms 内完成，收合的 scaleY 形态保持，整体比之前快约一半但仍有「回归」感；
  - DevTools 10% 速度逐帧看：所有入场均为强 ease-out（起步快）；
  - reduce：模态瞬时出现、勾标瞬现、无位移。
- **Done when**: 家族内所有覆盖层入场 ≤460ms、曲线统一、勾选有弹入。
