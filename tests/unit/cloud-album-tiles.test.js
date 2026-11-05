import { describe, expect, it } from 'vitest';
import { buildAlbumTiles } from '../../src/utils/cloud-album-tiles.js';

const img = (url, publicId) => ({ type: 'image', url, publicId, width: 100, height: 100 });

describe('buildAlbumTiles', () => {
  it('论坛备份 [标题文字, 图1, 图2] ⇒ key 用 block 下标 1/2（不是 0/1）', () => {
    const entry = {
      id: 'e1',
      contentBlocks: [{ type: 'text', text: '【标题】' }, img('a.jpg', 'pa'), img('b.jpg', 'pb')],
    };

    const tiles = buildAlbumTiles([entry]);

    // 这是删除错位的根因：用图片序号会得到 e1::0 / e1::1，
    // 而 e1::0 在 contentBlocks 里是文字块 —— 删除必报 INVALID_BLOCK。
    expect(tiles.map((tile) => tile.key)).toEqual(['e1::1', 'e1::2']);
    expect(tiles.map((tile) => tile.imageUrl)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('图片在文字前面时仍是 block 下标（中间的文字块被跳过）', () => {
    const entry = {
      id: 'e2',
      contentBlocks: [img('a.jpg', 'pa'), { type: 'text', text: '说明' }, img('b.jpg', 'pb')],
    };

    expect(buildAlbumTiles([entry]).map((tile) => tile.key)).toEqual(['e2::0', 'e2::2']);
  });

  it('没有可删图片块 ⇒ 纸片格（不可选）', () => {
    const tiles = buildAlbumTiles([
      { id: 'e3', contentBlocks: [{ type: 'text', text: '只有文字' }] },
      { id: 'e4', contentBlocks: [] },
      { id: 'e5' },
    ]);

    expect(tiles.map((tile) => tile.key)).toEqual(['e3::paper', 'e4::paper', 'e5::paper']);
    expect(tiles.every((tile) => tile.imageUrl === '')).toBe(true);
  });

  it('跳过没有 url 的图片块，不为它生成格子', () => {
    const entry = {
      id: 'e6',
      contentBlocks: [{ type: 'image', url: '', publicId: 'p0' }, img('ok.jpg', 'p1')],
    };

    expect(buildAlbumTiles([entry]).map((tile) => tile.key)).toEqual(['e6::1']);
  });

  it('多条目按顺序摊平；isFirstOfEntry 只标每条内容的第一张', () => {
    const tiles = buildAlbumTiles([
      { id: 'a', contentBlocks: [img('a1.jpg', 'p1'), img('a2.jpg', 'p2')] },
      { id: 'b', contentBlocks: [{ type: 'text', text: 't' }, img('b1.jpg', 'p3')] },
    ]);

    expect(tiles.map((tile) => tile.key)).toEqual(['a::0', 'a::1', 'b::1']);
    expect(tiles.map((tile) => tile.isFirstOfEntry)).toEqual([true, false, true]);
  });

  it('空输入不炸', () => {
    expect(buildAlbumTiles(null)).toEqual([]);
    expect(buildAlbumTiles([])).toEqual([]);
  });
});
