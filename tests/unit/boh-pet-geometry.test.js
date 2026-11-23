import { describe, expect, it } from 'vitest';
import {
  bubbleMaxWidth,
  computeBubbleGeometry,
  computeMenuGeometry,
  menuHeight,
  MENU_WIDTH,
} from '../../src/utils/boh-pet-geometry.js';

/** 从 style 对象里取 px 数值（'356px' → 356）。 */
const px = (v) => Number(String(v).replace('px', ''));

/**
 * 断言「气泡整体落在视口内」。
 * 右锚定的元素没有 left 值 —— 用 right 反推左边界，这正是修 bug 的关键点：
 * 旧实现用 left 锚定，宽度一撑就超出；这里按最终几何反推，能把那种回归抓住。
 */
const assertInsideViewport = (style, viewport, maxWidth) => {
  const w = Math.min(maxWidth, Number(px(style.maxWidth)));
  if (style.left !== undefined) {
    const left = px(style.left);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + w).toBeLessThanOrEqual(viewport.w + 0.5);
  } else {
    const right = px(style.right);
    expect(right).toBeGreaterThanOrEqual(0);
    // right 锚定 ⇒ 左边界 = W - right - width，必须 ≥ 0
    expect(viewport.w - right - w).toBeGreaterThanOrEqual(-0.5);
    // 右边界 = W - right，必须 ≤ W
    expect(viewport.w - right).toBeLessThanOrEqual(viewport.w + 0.5);
  }
};

describe('小方气泡几何（窄屏越界是实测踩出来的真 bug）', () => {
  const sizes = [
    { w: 320, h: 568 }, // iPhone SE 一代（最窄的常见竖屏）
    { w: 360, h: 800 }, // 安卓常见
    { w: 390, h: 844 }, // iPhone 14/15
    { w: 430, h: 932 }, // iPhone Pro Max
    { w: 1280, h: 800 }, // 桌面
  ];

  it('右缘：长句撑满 maxWidth 也不越过右边界（本次修复的核心回归守卫）', () => {
    for (const viewport of sizes) {
      const pos = { x: viewport.w - 26, y: 300 }; // 贴右缘探头
      const style = computeBubbleGeometry({
        edge: 'right',
        pos,
        peekW: 26,
        size: 64,
        viewport,
      });
      /* 旧的左锚定实现：left = x - 200 + 64 - 8 = W - 170，
         宽度撑到 200 ⇒ right = W + 30 —— 正好溢出 30px，与实测一致。
         这条断言在旧实现下必红（320 宽时溢出 30，right=350 > 320）。 */
      assertInsideViewport(style, viewport, bubbleMaxWidth(viewport.w));
      // 右锚定的右边缘恒为「挂件左边缘 - 8」，与视口宽度无关
      expect(px(style.right)).toBe(34); // W - (W-26) + 8
    }
  });

  it('右缘：气泡右边缘与挂件左边缘保持 8px 间距（不压住角色）', () => {
    const viewport = { w: 390, h: 844 };
    const pos = { x: 364, y: 320 };
    const style = computeBubbleGeometry({ edge: 'right', pos, peekW: 26, size: 64, viewport });
    // 气泡右边缘 = W - right = 390 - 34 = 356；挂件左边缘 = 364 ⇒ 间距 8
    expect(viewport.w - px(style.right)).toBe(pos.x - 8);
  });

  it('左缘：气泡从探头右侧长出去，不越过左边界', () => {
    for (const viewport of sizes) {
      const style = computeBubbleGeometry({
        edge: 'left',
        pos: { x: 0, y: 300 },
        peekW: 26,
        size: 64,
        viewport,
      });
      expect(px(style.left)).toBe(34); // peekW + 8
      assertInsideViewport(style, viewport, bubbleMaxWidth(viewport.w));
    }
  });

  it('上缘 / 下缘：水平方向恒落在视口内', () => {
    for (const viewport of sizes) {
      for (const x of [0, 8, viewport.w / 2, viewport.w - 64, viewport.w]) {
        const top = computeBubbleGeometry({
          edge: 'top',
          pos: { x, y: 0 },
          peekW: 26,
          size: 64,
          viewport,
        });
        assertInsideViewport(top, viewport, bubbleMaxWidth(viewport.w));

        const bottom = computeBubbleGeometry({
          edge: 'bottom',
          pos: { x, y: viewport.h - 112 },
          peekW: 26,
          size: 64,
          viewport,
        });
        assertInsideViewport(bottom, viewport, bubbleMaxWidth(viewport.w));
      }
    }
  });

  it('浮空：按「靠哪半屏」选锚定，两侧都不越界', () => {
    for (const viewport of sizes) {
      // 右半屏浮空 ⇒ 右锚定，气泡向左长
      const rightHalf = computeBubbleGeometry({
        edge: null,
        pos: { x: viewport.w - 120, y: 300 },
        peekW: 26,
        size: 64,
        viewport,
      });
      expect(rightHalf.right).toBeDefined();
      assertInsideViewport(rightHalf, viewport, bubbleMaxWidth(viewport.w));

      // 左半屏浮空 ⇒ 左锚定，气泡向右长
      const leftHalf = computeBubbleGeometry({
        edge: null,
        pos: { x: 20, y: 300 },
        peekW: 26,
        size: 64,
        viewport,
      });
      expect(leftHalf.left).toBeDefined();
      assertInsideViewport(leftHalf, viewport, bubbleMaxWidth(viewport.w));

      // 正中间：两侧都要能放下，任意一侧都不越界
      const middle = computeBubbleGeometry({
        edge: null,
        pos: { x: viewport.w / 2 - 32, y: 300 },
        peekW: 26,
        size: 64,
        viewport,
      });
      assertInsideViewport(middle, viewport, bubbleMaxWidth(viewport.w));
    }
  });

  it('垂直钳制：贴顶部时不顶出上边界，贴底部时不顶出下边界', () => {
    const viewport = { w: 390, h: 844 };
    const atTop = computeBubbleGeometry({
      edge: 'right',
      pos: { x: 364, y: -50 },
      peekW: 26,
      size: 64,
      viewport,
    });
    expect(px(atTop.top)).toBeGreaterThanOrEqual(8);

    const atBottom = computeBubbleGeometry({
      edge: 'right',
      pos: { x: 364, y: 900 },
      peekW: 26,
      size: 64,
      viewport,
    });
    expect(px(atBottom.top)).toBeLessThanOrEqual(844 - 96);
  });

  it('maxWidth 在窄屏收窄，但不会窄到读不下一句短台词', () => {
    // min(200, max(132, W-96))：320 ⇒ max(132,224)=224 ⇒ 封顶 200
    expect(bubbleMaxWidth(320)).toBe(200);
    expect(bubbleMaxWidth(390)).toBe(200);
    expect(bubbleMaxWidth(200)).toBe(132); // 极端窄屏兜底下限
    expect(bubbleMaxWidth(1280)).toBe(200);
    for (const w of [280, 320, 360, 390, 430]) {
      expect(bubbleMaxWidth(w)).toBeGreaterThanOrEqual(132);
      // 气泡 + 两侧留白不能超出视口
      expect(bubbleMaxWidth(w) + 16).toBeLessThanOrEqual(Math.max(w, 148));
    }
  });
});

describe('小方菜单几何（触摸项高必须参与钳制）', () => {
  it('菜单项高：触摸 44px×2+padding，桌面 26px×2+padding', () => {
    expect(menuHeight(true)).toBe(98);
    expect(menuHeight(false)).toBe(76);
    expect(menuHeight(true)).toBeGreaterThan(menuHeight(false));
  });

  it('任意 y 位置菜单都不越出视口下缘（触摸项高必须参与钳制）', () => {
    const viewport = { w: 390, h: 844 };
    /* 为什么必须用真实高度：钳制式是 top = H - MENU_H - 8。
       若按桌面 76 算而实际高度 98，只要挂件能停到 y > 760 就会溢出 14px。
       `clampY` 目前把 y 限在 660 以内（844-120-64），所以现状不会真的溢出 ——
       但这是「两个魔数恰好对上」，不是不变量。这条测试直接锁不变量本身。 */
    for (let y = 0; y <= viewport.h + 100; y += 20) {
      for (const isTouch of [true, false]) {
        const style = computeMenuGeometry({
          pos: { x: 364, y },
          size: 64,
          viewport,
          isTouch,
        });
        const top = px(style.top);
        expect(top).toBeGreaterThanOrEqual(8);
        expect(top + menuHeight(isTouch)).toBeLessThanOrEqual(viewport.h);
      }
    }
  });

  it('贴右缘时菜单翻到左侧，且左边界不越出', () => {
    for (const viewport of [
      { w: 320, h: 568 },
      { w: 390, h: 844 },
      { w: 1280, h: 800 },
    ]) {
      const pos = { x: viewport.w - 26, y: 300 };
      const style = computeMenuGeometry({ pos, size: 64, viewport, isTouch: true });
      const left = px(style.left);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + MENU_WIDTH).toBeLessThanOrEqual(viewport.w - 8 + 0.5);
    }
  });

  it('贴左缘时菜单翻到右侧，且右边界不越出', () => {
    const viewport = { w: 390, h: 844 };
    const style = computeMenuGeometry({ pos: { x: 0, y: 300 }, size: 64, viewport, isTouch: true });
    const left = px(style.left);
    expect(left).toBe(64 + 8); // pos.x + size + 8
    expect(left + MENU_WIDTH).toBeLessThanOrEqual(viewport.w - 8);
  });
});
