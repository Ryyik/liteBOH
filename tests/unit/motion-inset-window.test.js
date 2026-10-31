import { describe, expect, it } from 'vitest';
import { insetFromRect, insetOpen } from '../../src/utils/motion-origin.js';

/* 窗口展开的几何计算（2026-10-31，iOS 口径）。
 *
 * 这套函数替代了 FLIP 的 `flipFromRect`：卡片 370×104 拉成 390×800 时
 * sx≈0.95 / sy≈0.13，动画中途是一块被纵向拉长七倍的矩形 —— 观感是「橡皮筋」，
 * 不是「从这一格打开」。窗口方案只算 `clip-path: inset()` 的四边，内容全程不缩放。
 *
 * 这些是纯函数，边界条件（源在目标外面、源盖满目标）在浏览器里极难复现，
 * 但一旦算错就是「窗口反着开」或「元素整个消失」，所以必须锁住。 */

const card = { left: 10, top: 120, width: 370, height: 104 };
const page = { left: 0, top: 0, width: 390, height: 800 };

describe('insetFromRect：从卡片算到页面', () => {
  it('四边按「目标边界 − 源边界」算（上/左/右/下）', () => {
    const win = insetFromRect(card, page, { radius: 16 });
    expect(win.top).toBe(120);
    expect(win.left).toBe(10);
    expect(win.right).toBe(390 - (10 + 370)); // 10
    expect(win.bottom).toBe(800 - (120 + 104)); // 576
    expect(win.radius).toBe(16);
    expect(win.value).toBe('inset(120.00px 10.00px 576.00px 10.00px round 16.00px)');
  });

  it('数值统一保留两位小数（避免浮点误差进到 CSS 字符串里）', () => {
    const win = insetFromRect(
      { left: 10.123, top: 20.987, width: 100, height: 50 },
      { left: 0, top: 0, width: 390, height: 800 },
    );
    expect(win.value).toMatch(/^inset\([\d.]+px [\d.]+px [\d.]+px [\d.]+px round [\d.]+px\)$/);
    expect(win.top).toBeCloseTo(20.987, 3);
  });

  it('源有一部分落在目标外面时夹到 0（横屏卡片在面板左外侧）', () => {
    // 卡片 left=0 而面板 left=128 ⇒ 算出 -128，必须夹成 0，否则 inset 负值会放大
    const win = insetFromRect(
      { left: 0, top: 100, width: 400, height: 90 },
      { left: 128, top: 24, width: 1024, height: 752 },
    );
    expect(win.left).toBe(0);
    expect(win.top).toBe(76);
    // 右/下仍是正值：窗口从面板左上角开始张开
    expect(win.right).toBeGreaterThan(0);
    expect(win.bottom).toBeGreaterThan(0);
  });

  it('源盖满目标（同尺寸/无位移）返回 null —— 调用方降级为淡入，不演无意义的抽搐', () => {
    expect(insetFromRect(page, page)).toBeNull();
    expect(
      insetFromRect(
        { left: 0, top: 0, width: 400, height: 820 },
        { left: 0, top: 0, width: 390, height: 800 },
      ),
    ).toBeNull();
  });

  it('差一点点就够（>2px）仍算有形变 —— 阈值是为了滤掉亚像素抖动', () => {
    expect(
      insetFromRect(
        { left: 0, top: 0, width: 390, height: 799 },
        { left: 0, top: 0, width: 390, height: 800 },
      ),
    ).toBeNull();
    expect(
      insetFromRect(
        { left: 0, top: 0, width: 390, height: 790 },
        { left: 0, top: 0, width: 390, height: 800 },
      ),
    ).not.toBeNull();
  });

  it('非法输入一律返回 null，不抛错（首帧可能早于布局就绪）', () => {
    expect(insetFromRect(null, page)).toBeNull();
    expect(insetFromRect(card, null)).toBeNull();
    expect(insetFromRect({ left: 0, top: 0, width: 0, height: 0 }, page)).toBeNull();
    expect(insetFromRect(card, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe('insetOpen：完全打开时的终点值', () => {
  it('无圆角时是纯 0', () => {
    expect(insetOpen(0)).toBe('inset(0px 0px 0px 0px round 0.00px)');
  });

  it('横屏面板 24px 圆角必须带进终点，否则最后一帧把圆角削成直角', () => {
    expect(insetOpen(24)).toBe('inset(0px 0px 0px 0px round 24.00px)');
  });

  it('异常输入归到 0，不产生 NaN 字符串', () => {
    expect(insetOpen(Number.NaN)).toBe('inset(0px 0px 0px 0px round 0.00px)');
    expect(insetOpen(-8)).toBe('inset(0px 0px 0px 0px round 0.00px)');
  });
});
