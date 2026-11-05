/**
 * 胶片颗粒噪声块单测（2026-11-05）。
 *
 * 这一层的失败模式不是「报错」而是「静默变脏」：噪声块生成不出来时颗粒层直接
 * 跳过，画面看着没问题但失去胶片感。所以这里盯三件事：
 *  1. 无 canvas 环境返回 null 而不是抛错（导出链不能断在这）；
 *  2. 同一进程内只生成一次（每张图重新生成会有明显的接缝闪烁）；
 *  3. 单颗颗粒尺寸的换算公式（预览与导出共用它，偏一点两边就对不上）。
 */
import { describe, expect, it } from 'vitest';
import { GRAIN_TILE_SIZE, getGrainTile, grainSpeckSize } from '@/utils/image-editor-grain.js';

describe('grainSpeckSize', () => {
  it('1600 宽成片上，颗粒边长等于 scale（标定基准）', () => {
    expect(grainSpeckSize(3, 1600)).toBeCloseTo(3, 6);
  });

  it('按画布宽度等比例缩放（预览 350px 与导出 1600px 观感一致）', () => {
    expect(grainSpeckSize(3, 800)).toBeCloseTo(1.5, 6);
    expect(grainSpeckSize(3, 350)).toBeCloseTo(3 * (350 / 1600), 6);
  });

  it('非法输入兜底，不返回 0 / NaN（0 会让平铺循环死循环）', () => {
    expect(grainSpeckSize(0, 1600)).toBeGreaterThan(0);
    expect(grainSpeckSize(Number.NaN, 1600)).toBeGreaterThan(0);
    expect(grainSpeckSize(3, 0)).toBeGreaterThan(0);
  });
});

describe('getGrainTile', () => {
  it('无 canvas 支持时返回 null 且不抛（jsdom 环境）', () => {
    expect(() => getGrainTile()).not.toThrow();
    expect(getGrainTile()).toBeNull();
  });

  it('噪声块边长是 2 的幂，平铺时接缝不易被看出', () => {
    expect(GRAIN_TILE_SIZE).toBe(128);
  });
});
