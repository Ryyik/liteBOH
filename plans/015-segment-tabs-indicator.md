# 015 — SegmentTabs 灵动化：指示器收敛 + 激活态改 transition 驱动

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: HIGH
- **Category**: Interruptibility / Easing / Physicality
- **Estimated scope**: 1 文件（SegmentTabs.vue ~20 行）

## Problem

SegmentTabs 是「方块/空间/资产/消息/设置」等内容分区的高频切换控件（抖音式文字页签），当前三处问题：

```css
/* src/views/user-center/UserSpace/components/SegmentTabs.vue:127-146 — current */
.segment-tab.active {
  color: var(--text-primary, #1d1d1f);
  font-weight: 600;
  font-size: 15.5px;
  animation: seg-tab-pop 0.34s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes seg-tab-pop {
  0% { transform: scale(0.82); }
  55% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
```

高频点按用 keyframes：快速来回切时每次从 `scale(0.82)` 重放，中途反转必跳变；340ms 超 UI 300ms 预算；1.56 的过冲过弹，与克制的玻璃拟态性格不符。

```css
/* SegmentTabs.vue:155 — current */
.segment-tab-indicator {
  /* ... */
  transition: transform 0.4s cubic-bezier(0.3, 1.3, 0.35, 1), width 0.4s cubic-bezier(0.3, 1.3, 0.35, 1);
}
```

指示器 400ms + 1.3 过冲：橡皮筋感明显，切换显得黏滞。

```css
/* SegmentTabs.vue:123-125 — current */
.segment-tab:active { transform: scale(0.88); }
```

按压缩到 0.88，超出规范建议的 0.95-0.98 克制区间，观感偏猛。

## Target

```css
/* target */
.segment-tab {
  /* :116 原 transition: color 0.2s ease, transform 0.16s ease; 替换为 */
  transition:
    color 180ms var(--ease-out, ease-out),
    transform 240ms cubic-bezier(0.34, 1.3, 0.64, 1),
    font-size 240ms cubic-bezier(0.34, 1.3, 0.64, 1);
}

.segment-tab:active {
  transform: scale(0.96);
}

.segment-tab.active {
  color: var(--text-primary, #1d1d1f);
  font-weight: 600;
  font-size: 15.5px;
  /* animation: seg-tab-pop ... 一行删除 */
}

/* @keyframes seg-tab-pop（:134-146）整段删除 */

.segment-tab-indicator {
  /* 其余声明不变，仅替换 transition */
  transition:
    transform 300ms cubic-bezier(0.3, 1.15, 0.35, 1),
    width 300ms cubic-bezier(0.3, 1.15, 0.35, 1);
}
```

设计说明：
- **激活态文字放大走 font-size transition**（可中断、从当前值重定向），替代 keyframes 弹跳；`font-weight: 500→600` 静态字体不可插值，会瞬跳——由颜色与字号变化承载主反馈，可接受。
- 指示器保留轻微过冲（1.15，收敛自 1.3），300ms 贴预算上限；width + transform 同时过渡是本控件固有结构（JS 量测 offsetLeft/offsetWidth 后写入，SegmentTabs.vue:48-60），宽度变化量只有几像素，观感可接受；executor 勿改为纯 transform 方案（需要改 JS 量测逻辑，超出本计划）。

既有 reduce 块（:166-172，transition/animation-duration 1ms）已覆盖全部改动，无需修改。

## Repo conventions to follow

- `cubic-bezier(0.34, 1.3, 0.64, 1)` = 012/014 统一的轻过冲弹性曲线（高频控件全站一致）。
- 指示器量测逻辑（SegmentTabs.vue:48-84，ResizeObserver + fonts.ready 校准）是正确实现，勿动。

## Steps

1. SegmentTabs.vue `:116`：transition 替换为 Target 三条。
2. `:123-125`：`:active` 改 `scale(0.96)`。
3. `:127-132`：删除 `.active` 中的 `animation: seg-tab-pop ...;` 行（color/font-weight/font-size 保留）。
4. `:134-146`：整段删除 `@keyframes seg-tab-pop`。
5. `:155`：指示器 transition 替换为 Target 两条。

## Boundaries

- 只改 SegmentTabs.vue 的 `<style scoped>` 段。
- 不改模板、不改 `measure()` / `indicatorStyle` 等 JS 逻辑。
- 不改 `--segment-tabs-inset` 避让体系。

## Verification

- **Mechanical**: `npm run build`；`rg "seg-tab-pop" src/` 零命中。
- **Feel check**（进入「方块」页签，顶部文字页签处）:
  - 快速来回切「官方 / 最新 / 关注」：文字放大缩小平滑过渡、无从 0.82 重放的顿挫；指示器滑动带轻微落定、无橡皮筋拖尾；
  - 按住未激活页签：轻微缩小（0.96），松开回弹；
  - DevTools Animations 10% 速度：指示器 300ms 内完成位移+变宽，过冲幅度肉眼温和；
  - reduce 模式：切换瞬时完成，指示器直接落位。
- **Done when**: 高频连切无重放跳变，弹性收敛到克制区间。
