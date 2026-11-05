/**
 * 贴纸命令单测（2026-11-05）—— foldStickers 的语义是「贴纸贴在最终画面上」，
 * 所以最要紧的一条是 crop 之后贴纸坐标要跟着重映射：漏了它，裁一刀贴纸就跑到
 * 画面外（用户看到的是「猫没了」）。
 */
import { describe, expect, it } from 'vitest';
import {
  clampSticker,
  foldStickers,
  isValidEditorCommand,
  resolveFilterId,
} from '@/views/Forum/composables/useImageEditorDoc.js';

describe('clampSticker', () => {
  it('中心点夹到画面内、尺寸夹到合法区间', () => {
    expect(clampSticker({ id: 'a', asset: 'x', x: 1.4, y: -0.2, size: 9 })).toMatchObject({
      x: 1,
      y: 0,
      size: 2,
    });
  });

  it('非法数值回落中心（不让 NaN 把贴纸画到 (NaN, NaN)）', () => {
    expect(clampSticker({ id: 'a', asset: 'x', x: 'a', y: null, size: undefined })).toMatchObject({
      x: 0.5,
      y: 0.5,
      size: 0.4,
    });
  });
});

describe('foldStickers', () => {
  const add = (id, extra = {}) => ({
    type: 'sticker-add',
    id,
    asset: 'cat',
    x: 0.5,
    y: 0.5,
    size: 0.4,
    ...extra,
  });

  it('add → 按入栈顺序返回', () => {
    const list = foldStickers([add('a'), add('b')]);
    expect(list.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('update 覆盖同 id 的坐标（后写的赢）', () => {
    const list = foldStickers([add('a'), { type: 'sticker-update', id: 'a', x: 0.2, y: 0.3 }]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ x: 0.2, y: 0.3, size: 0.4 });
  });

  it('update 不存在的 id 不凭空造贴纸', () => {
    expect(foldStickers([{ type: 'sticker-update', id: 'ghost', x: 0.1 }])).toEqual([]);
  });

  it('remove 删掉对应贴纸', () => {
    const list = foldStickers([add('a'), add('b'), { type: 'sticker-remove', id: 'a' }]);
    expect(list.map((item) => item.id)).toEqual(['b']);
  });

  it('缺 asset 的 add 被丢弃（画不出来）', () => {
    expect(foldStickers([{ ...add('a'), asset: '' }])).toEqual([]);
  });

  it('crop 把已有贴纸重映射到裁后坐标系', () => {
    // 画布 100x100，贴纸在中心 (0.5, 0.5)，size 0.4
    // 裁掉左半边 40%、上边 20%（rect x=0.4 y=0.2 w=0.5 h=0.6）
    const list = foldStickers([
      add('a'),
      { type: 'crop', rect: { x: 0.4, y: 0.2, width: 0.5, height: 0.6 } },
    ]);
    // x' = (0.5 - 0.4) / 0.5 = 0.2；y' = (0.5 - 0.2) / 0.6 = 0.5；size' = 0.4 / 0.5 = 0.8
    expect(list[0].x).toBeCloseTo(0.2, 6);
    expect(list[0].y).toBeCloseTo(0.5, 6);
    expect(list[0].size).toBeCloseTo(0.8, 6);
  });

  it('crop 后贴纸被裁到画面外时夹到边界（不会出现负坐标贴纸）', () => {
    const list = foldStickers([
      add('a', { x: 0.05, y: 0.9 }),
      { type: 'crop', rect: { x: 0.4, y: 0.2, width: 0.5, height: 0.6 } },
    ]);
    expect(list[0].x).toBe(0);
    expect(list[0].y).toBe(1);
  });

  it('crop 之后再 add 的贴纸不受影响（新命令用新坐标系）', () => {
    const list = foldStickers([
      { type: 'crop', rect: { x: 0.4, y: 0.2, width: 0.5, height: 0.6 } },
      add('b', { x: 0.3, y: 0.3 }),
    ]);
    expect(list[0]).toMatchObject({ x: 0.3, y: 0.3 });
  });
});

describe('resolveFilterId', () => {
  it('后写的滤镜覆盖先写的', () => {
    expect(
      resolveFilterId([
        { type: 'filter', id: 'vivid' },
        { type: 'filter', id: 'mono' },
      ]),
    ).toBe('mono');
  });

  it('没有滤镜命令时是 none（不默认加任何色调）', () => {
    expect(resolveFilterId([])).toBe('none');
    expect(resolveFilterId([{ type: 'rotate' }])).toBe('none');
  });
});

describe('isValidEditorCommand · 新命令类型', () => {
  it('filter 必须有非空 id', () => {
    expect(isValidEditorCommand({ type: 'filter', id: 'mono' })).toBe(true);
    expect(isValidEditorCommand({ type: 'filter', id: '' })).toBe(false);
  });

  it('sticker-add 必须有 id 与 asset', () => {
    expect(isValidEditorCommand({ type: 'sticker-add', id: 'a', asset: 'cat' })).toBe(true);
    expect(isValidEditorCommand({ type: 'sticker-add', id: '', asset: 'cat' })).toBe(false);
  });

  it('sticker-update / remove 只需要 id', () => {
    expect(isValidEditorCommand({ type: 'sticker-update', id: 'a', x: 0.3 })).toBe(true);
    expect(isValidEditorCommand({ type: 'sticker-remove', id: 'a' })).toBe(true);
    expect(isValidEditorCommand({ type: 'sticker-remove' })).toBe(false);
  });
});
