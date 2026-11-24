/**
 * BohDropdown 定位纯函数的行为测试（plans/045 组件 13）。
 *
 * 这是这批里唯一能跑真断言的层（本仓无 jsdom，组件只能源码守卫）。
 * 覆盖的点全是手写下拉真实踩过的：翻转、贴边夹取、窄屏改形态。
 */
import { describe, expect, it } from 'vitest';
import {
  arrowSideOf,
  computeDropdownPosition,
  DROPDOWN_EDGE,
  DROPDOWN_GAP,
} from '../../src/components/ui/boh-dropdown-position.js';

const viewport = { width: 1000, height: 800 };
const panel = { width: 240, height: 180 };

/** 触发器：x=400..500, y=300..340 */
const anchor = { top: 300, bottom: 340, left: 400, right: 500, width: 100, height: 40 };

describe('computeDropdownPosition · 基本方向', () => {
  it('下方放得下就放在下方，左边缘对齐触发器', () => {
    const r = computeDropdownPosition({ anchor, panel, viewport });
    expect(r.placement).toBe('bottom-start');
    expect(r.flipped).toBe(false);
    expect(r.top).toBe(anchor.bottom + DROPDOWN_GAP);
    expect(r.left).toBe(anchor.left);
  });

  it('-end 档右边缘对齐触发器右边缘', () => {
    const r = computeDropdownPosition({
      anchor,
      panel,
      viewport,
      placement: 'bottom-end',
    });
    expect(r.placement).toBe('bottom-end');
    expect(r.left).toBe(anchor.right - panel.width);
  });
});

describe('computeDropdownPosition · 翻转', () => {
  it('下方空间不足、上方够 → 翻到上方面板底部贴着触发器上沿', () => {
    const low = { ...anchor, top: 600, bottom: 640 };
    const r = computeDropdownPosition({ anchor: low, panel, viewport });
    expect(r.placement).toBe('top-start');
    expect(r.flipped).toBe(true);
    expect(r.top).toBe(low.top - DROPDOWN_GAP - panel.height);
  });

  it('下方和上方都不够 → 留在下方但夹在视口内（不溢出）', () => {
    const tiny = { width: 1000, height: 300 };
    const mid = { top: 130, bottom: 170, left: 400, right: 500, width: 100, height: 40 };
    const r = computeDropdownPosition({ anchor: mid, panel, viewport: tiny });
    expect(r.top + panel.height).toBeLessThanOrEqual(tiny.height - DROPDOWN_EDGE);
    expect(r.top).toBeGreaterThanOrEqual(DROPDOWN_EDGE);
  });

  it('首选 top 但上方放不下、下方够 → 翻到下方', () => {
    const mid = { top: 60, bottom: 100, left: 400, right: 500, width: 100, height: 40 };
    const r = computeDropdownPosition({
      anchor: mid,
      panel,
      viewport,
      placement: 'top-start',
    });
    expect(r.placement).toBe('bottom-start');
    expect(r.flipped).toBe(true);
  });
});

describe('computeDropdownPosition · 横向夹取', () => {
  it('右侧越界 → 夹回视口右边缘内', () => {
    const right = { top: 300, bottom: 340, left: 880, right: 980, width: 100, height: 40 };
    const r = computeDropdownPosition({ anchor: right, panel, viewport });
    expect(r.left + panel.width).toBeLessThanOrEqual(viewport.width - DROPDOWN_EDGE);
  });

  it('左侧越界（-end 档触发器贴左边）→ 夹到最小留白处', () => {
    const left = { top: 300, bottom: 340, left: 10, right: 110, width: 100, height: 40 };
    const r = computeDropdownPosition({
      anchor: left,
      panel,
      viewport,
      placement: 'bottom-end',
    });
    expect(r.left).toBe(DROPDOWN_EDGE);
  });

  it('面板比视口还宽 → 宽度收进视口，位置不越界', () => {
    const narrowVp = { width: 300, height: 800 };
    const widePanel = { width: 500, height: 100 };
    const r = computeDropdownPosition({
      anchor: { top: 300, bottom: 340, left: 10, right: 110, width: 100, height: 40 },
      panel: widePanel,
      viewport: narrowVp,
    });
    expect(r.left).toBeGreaterThanOrEqual(DROPDOWN_EDGE);
    expect(r.left).toBeLessThanOrEqual(narrowVp.width - DROPDOWN_EDGE);
  });
});

describe('computeDropdownPosition · 窄屏形态', () => {
  it('narrow 时只回 left（top 交给 CSS 的 bottom 贴底）', () => {
    const r = computeDropdownPosition({ anchor, panel, viewport, narrow: true });
    expect(r.narrow).toBe(true);
    expect(r.left).toBe(DROPDOWN_EDGE);
    /* 🔴 刻意不回传 top：面板高度随内容变，JS 算的 top 与最终渲染会差几像素
       （实测 844 视口下底边漂到 841 而不是 832）。窄屏形态的垂直位置由 CSS
       `bottom: edge` 决定，这里给 0 是占位，消费方必须忽略它。 */
    expect(r.top).toBe(0);
    expect(r.placement).toBe('bottom-start');
  });

  it('narrow 时 left 恒为 edge（左右各留边距，宽度由 CSS 撑开）', () => {
    const r = computeDropdownPosition({ anchor, panel, viewport, narrow: true });
    expect(r.left).toBe(DROPDOWN_EDGE);
  });

  it('窄屏下 flipped 恒为 false（形态已换，不存在翻转概念）', () => {
    const r = computeDropdownPosition({ anchor, panel, viewport, narrow: true });
    expect(r.flipped).toBe(false);
  });
});

describe('arrowSideOf', () => {
  it('面板在下方 → 指示器在上边', () => {
    expect(arrowSideOf('bottom-start')).toBe('top');
    expect(arrowSideOf('bottom-end')).toBe('top');
  });

  it('面板在上方 → 指示器在下边', () => {
    expect(arrowSideOf('top-start')).toBe('bottom');
  });
});

describe('返回值契约', () => {
  it('top/left 一律取整（避免半像素导致的 1px 抖动）', () => {
    const r = computeDropdownPosition({
      anchor: { top: 300.4, bottom: 340.7, left: 400.3, right: 500.9, width: 100, height: 40 },
      panel,
      viewport,
    });
    expect(Number.isInteger(r.top)).toBe(true);
    expect(Number.isInteger(r.left)).toBe(true);
  });

  it('缺参不抛错（挂载首帧 panel 尺寸还未知）', () => {
    expect(() => computeDropdownPosition({})).not.toThrow();
    const r = computeDropdownPosition({});
    expect(Number.isFinite(r.top)).toBe(true);
    expect(Number.isFinite(r.left)).toBe(true);
  });
});
