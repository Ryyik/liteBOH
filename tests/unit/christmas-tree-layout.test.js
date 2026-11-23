import { describe, expect, it } from 'vitest';

import {
  HANGER_T_RANGE,
  TREE_SHAPE,
  buildHangerLayout,
  hangerSize,
  halfWidthAt,
} from '../../src/views/ChristmasGiftTree/data/tree-layout.js';

const treeHeight = TREE_SHAPE.baseY - TREE_SHAPE.apexY;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tOf(point) {
  return (point.y - TREE_SHAPE.apexY) / treeHeight;
}

describe('christmas tree hanger layout', () => {
  it('places everyone without overlap for any realistic headcount (1–20)', () => {
    for (let count = 1; count <= 20; count += 1) {
      const { hangers, overflow } = buildHangerLayout(count);
      expect(overflow).toBe(0);
      expect(hangers).toHaveLength(count);

      // 两个人以上就必须两两分开：圆心距不得小于直径（<= 就是粘在一起）
      for (let i = 0; i < hangers.length; i += 1) {
        for (let j = i + 1; j < hangers.length; j += 1) {
          expect(distance(hangers[i], hangers[j])).toBeGreaterThanOrEqual(hangers[i].size);
        }
      }
    }
  });

  it('keeps every hanger inside the cone silhouette', () => {
    for (let count = 1; count <= 20; count += 1) {
      const { hangers } = buildHangerLayout(count);
      for (const hanger of hangers) {
        const t = tOf(hanger);
        expect(t).toBeGreaterThanOrEqual(HANGER_T_RANGE.min - 0.05);
        expect(t).toBeLessThanOrEqual(HANGER_T_RANGE.max + 0.05);
        expect(Math.abs(hanger.x - TREE_SHAPE.centerX)).toBeLessThanOrEqual(halfWidthAt(t) + 0.5);
      }
    }
  });

  it('hangs a lone avatar in the middle band instead of the bottom row', () => {
    const { hangers } = buildHangerLayout(1);
    expect(hangers).toHaveLength(1);
    expect(hangers[0].x).toBe(TREE_SHAPE.centerX);
    // 单人挂树心：不能掉到最宽的那一行（那看起来像摆在地上）
    expect(tOf(hangers[0])).toBeGreaterThan(0.45);
    expect(tOf(hangers[0])).toBeLessThan(0.65);
  });

  it('stacks two avatars vertically so they never touch', () => {
    const { hangers } = buildHangerLayout(2);
    expect(hangers).toHaveLength(2);
    expect(distance(hangers[0], hangers[1])).toBeGreaterThan(hangers[0].size);
    expect(tOf(hangers[0])).not.toBeCloseTo(tOf(hangers[1]), 2);
  });

  it('shrinks avatars monotonically as the tree fills up', () => {
    const sizes = [4, 10, 16, 20].map((count) => buildHangerLayout(count).size);
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
    expect(hangerSize(4)).toBeGreaterThan(hangerSize(20));
  });

  it('returns nothing for an empty tree', () => {
    expect(buildHangerLayout(0)).toEqual({ hangers: [], overflow: 0, size: hangerSize(0) });
  });
});
