import { describe, expect, it } from 'vitest';
import { reorderList, resolveDropIndex } from '../../src/utils/shop-order.js';

/**
 * 拖拽排序的落点算法。
 *
 * 这些用例锁的是「算偏一格」这类**不会报错**的 bug：拖到 A/B 之间却插到 B 后面，
 * 界面上只会看到顺序和手指不一致，没有异常、没有红字。所以边界（首、尾、原位）
 * 与「三种卡片高度不同」的混排都要钉住。
 */
const rect = (top, height) => ({ top, height });
// 三张等高卡：100–200 / 210–310 / 320–420（间距 10）
const equalRects = [rect(100, 100), rect(210, 100), rect(320, 100)];

describe('resolveDropIndex', () => {
  it('指针在自身中线附近时原位不动', () => {
    expect(resolveDropIndex(equalRects, 1, 260)).toBe(1);
  });

  it('第一张往下拖过第二张中线 → 落到第 1 位', () => {
    expect(resolveDropIndex(equalRects, 0, 275)).toBe(1);
  });

  it('第一张拖到最后一张下方 → 落到末位', () => {
    expect(resolveDropIndex(equalRects, 0, 500)).toBe(2);
  });

  it('最后一张往上拖过第一张中线 → 落到首位', () => {
    expect(resolveDropIndex(equalRects, 2, 120)).toBe(0);
  });

  it('指针在列表上方 → 首位', () => {
    expect(resolveDropIndex(equalRects, 1, 0)).toBe(0);
  });

  it('混排（小卡 80 / 横幅 116 / 大图 300）也按各自中线算，不用固定步长', () => {
    const mixed = [rect(100, 80), rect(190, 116), rect(316, 300)];
    // 拖第一张（小卡）到横幅中线以上 → 原位
    expect(resolveDropIndex(mixed, 0, 200)).toBe(0);
    // 越过横幅中线（248）→ 第 1 位
    expect(resolveDropIndex(mixed, 0, 260)).toBe(1);
    // 越过大图中线（466）→ 末位
    expect(resolveDropIndex(mixed, 0, 500)).toBe(2);
  });

  it('空列表 / 单张卡不炸', () => {
    expect(resolveDropIndex([], 0, 100)).toBe(0);
    expect(resolveDropIndex([rect(0, 100)], 0, 500)).toBe(0);
    expect(resolveDropIndex(null, 0, 100)).toBe(0);
  });
});

describe('reorderList', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('往后移：0 → 2', () => {
    expect(reorderList(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('往前移：3 → 0', () => {
    expect(reorderList(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('原地不动返回等价副本（不共享引用，调用方可以安全当作已更新）', () => {
    const out = reorderList(list, 1, 1);
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
  });

  it('越界下标夹到合法区间，不产生空洞', () => {
    expect(reorderList(list, -5, 99)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('不改原数组（乐观更新前要先保住旧顺序）', () => {
    const source = ['a', 'b', 'c'];
    reorderList(source, 0, 2);
    expect(source).toEqual(['a', 'b', 'c']);
  });

  it('空 / 单元素 / 非数组输入安全', () => {
    expect(reorderList([], 0, 1)).toEqual([]);
    expect(reorderList(['a'], 0, 0)).toEqual(['a']);
    expect(reorderList(null, 0, 1)).toEqual([]);
  });
});
