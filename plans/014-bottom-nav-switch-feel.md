# 014 — 底部导航切换胶囊改 transform 驱动 + 图标弹性反馈可中断

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: HIGH
- **Category**: Performance / Interruptibility / Physicality
- **Estimated scope**: 1 文件（bottom-nav.css ~40 行）

## Problem

底部导航是全站最高频的点击目标（每天数十次以上），当前切档动效有两处硬伤：

**1. 选中胶囊动画布局属性 `left`。**

```css
/* src/views/user-center/UserSpace/components/bottom-nav.css:162-180 — current */
.nav-items::before {
  /* ... */
  left: var(--active-nav-center);
  width: clamp(68px, calc(100% / var(--nav-count) - 4px), 82px);
  /* ... */
  transform: translateX(-50%) scaleX(1);
  transition:
    left 210ms var(--bottom-nav-ease),
    transform 210ms var(--bottom-nav-ease),
    opacity 160ms ease,
    background-color 160ms ease,
    box-shadow 210ms ease;
}
```

`--active-nav-center` 由 `useUserSpaceTabs.js:35` 以百分比写入，切档时改 `left` 触发 layout + paint（胶囊滑过时会带动整条导航重排），快速连点时观感发涩。

**2. 图标弹跳用 keyframes，快速连点会从 0% 重放并与 transition 打架。**

```css
/* bottom-nav.css:261-278 — current */
.nav-item.active .nav-icon {
  transform: translateY(-3px) scale(1.14);
  animation: navIconPop 180ms var(--bottom-nav-ease) both;
}
@keyframes navIconPop {
  0% { transform: translateY(1px) scale(0.9); }
  70% { transform: translateY(-5px) scale(1.2); }
  100% { transform: translateY(-3px) scale(1.14); }
}
```

`.nav-icon` 本身已有 `transition: transform 170ms ...`（:258）——同元素上 animation 与 transition 竞争 transform，中途切换会跳变。tab 切换是可快速反复触发且可逆的操作，规范要求用 transition（可从当前状态重定向），不能用 keyframes（每次从零重放）。

## Target

```css
/* target — 胶囊：纯 transform 驱动 */
.nav-items::before {
  left: 0;
  width: calc(100% / var(--nav-count) - 6px);
  transform: translateX(calc(var(--active-nav-index) * (100% + 6px)));
  transition:
    transform 260ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 160ms ease,
    background-color 160ms ease,
    box-shadow 210ms ease;
}
```

几何推导（执行者需理解，勿改动数值）：`.nav-items` 是 `grid-template-columns: repeat(var(--nav-count), minmax(0, 1fr))` 的等宽网格；胶囊宽 = 一列 − 6px，相邻两枚胶囊左缘间距 = 一列 = 胶囊宽 + 6px。`translateX` 的百分比基于**胶囊自身宽度**，所以第 index 枚胶囊的偏移 = `index × (100% + 6px)`。原 `clamp(68px, ...)` 下限删掉——胶囊只是背景板，触控目标是 `.nav-item` 本身。原 `translateX(-50%)` 一并删除（不再需要居中补偿）。

`--active-nav-index` 已由 `useUserSpaceTabs.js:34` 的 `navIndicatorStyle` 提供并通过继承作用于 `.nav-items`（executor 需确认绑定处：UserSpaceBottomNav 模板上 `:style="navIndicatorStyle"` 所在元素是 `.nav-items` 或其祖先）。`--active-nav-center` 变量不再被 CSS 引用，composable 里可保留不动。

```css
/* target — 图标：删 animation，纯 transition 弹性，可中断重定向 */
.nav-icon {
  transition: transform 240ms cubic-bezier(0.34, 1.3, 0.64, 1), color 140ms ease;
}

.nav-item.active .nav-icon {
  transform: translateY(-3px) scale(1.14);
  /* animation: navIconPop ... 一行删除 */
}

.nav-item:active .nav-icon {
  transform: translateY(-1px) scale(0.92);
  transition-duration: 120ms;
}
```

删除 `@keyframes navIconPop`（:266-278）整段。

既有 reduce 块（:280-302）已覆盖 `.nav-items::before` 与 `.nav-icon`（transition-duration: 1ms、animation: none），无需改动。

## Repo conventions to follow

- `cubic-bezier(0.32, 0.72, 0, 1)` = 全局 `--ease-drawer`（tokens.css:36，iOS-like 滑入曲线），与胶囊「归位」语义匹配。
- `cubic-bezier(0.34, 1.3, 0.64, 1)` = 本计划 012/015 统一采用的轻过冲弹性曲线，全站高频控件共用同一手感。
- 按压反馈规范：scale 0.92-0.97、120-160ms（AUDIT.md §3：0.95-0.98 区间的克制按压）。

## Steps

1. bottom-nav.css `:162-180`：`.nav-items::before` 按 Target 重写（left: 0、新宽度、新 transform、新 transition；删除 `transform: translateX(-50%) scaleX(1)` 静态声明，`.is-hidden .nav-items` 相关的 scaleX 逻辑不在本伪元素上，勿动 :196-203）。
2. `:255-258`：`.nav-icon` transition 替换为 Target 两条。
3. `:261-264`：删除 `animation: navIconPop ...` 行。
4. `:266-278`：整段删除 `@keyframes navIconPop`。
5. `:261` 规则后新增 `.nav-item:active .nav-icon` 规则。

## Boundaries

- 只改 bottom-nav.css。不改 useUserSpaceTabs.js、UserSpaceBottomNav.vue、UserSpaceSideRail.vue（横屏左栏指示器是另一套实现且当前正确）。
- 不动 island 相关规则（:346-735，另属 017）。
- 不动 `--bottom-nav-collapse-scale` / `is-hidden` 折叠逻辑。
- 若发现 `navIndicatorStyle` 并未把 `--active-nav-index` 绑定到 `.nav-items` 的祖先链上，STOP 并报告（需补一行绑定而不是即兴改 JS）。

## Verification

- **Mechanical**: `npm run build`；`rg "navIconPop" src/` 零命中；`rg "active-nav-center" src/views/user-center/UserSpace` 仅剩 composable 中的定义（无 CSS 消费者）。
- **Feel check**（/user-space，宽屏 + 手机宽度各一遍）:
  - 左右快速交替点 5 个页签：胶囊**连续滑行**、中途可被反向重定向，绝不瞬移、无重排抖动（Performance 面板 Recording 应无 Layout 条目随切换出现）；
  - 图标起落带轻微过冲弹性，连点时从当前位置平滑转向，不从 0 重放；
  - 按住某个 tab：图标轻微下压缩小，松开弹回；
  - DevTools Animations 10% 速度：胶囊路径为一条连续滑轨；
  - reduce 模式：切档瞬时完成。
- **Done when**: 切档零 layout 触发、图标反馈可中断且带弹性。
