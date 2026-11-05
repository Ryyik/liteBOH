import { describe, expect, it } from 'vitest';
import {
  TRASH_RETENTION_DAYS,
  groupSelectedTileKeys,
  isForumEntryTitleOnly,
  listDeletableImageBlocks,
  removeImageBlocks,
  resolveCoverAfterRemoval,
  resolveTrashDaysLeft,
} from '../../src/utils/cloud-image-trash.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-04T12:00:00+08:00');

describe('cloud-image-trash', () => {
  describe('resolveTrashDaysLeft', () => {
    it('整 30 天 → 30；剩 1 小时也算 1 天（向上取整）', () => {
      expect(resolveTrashDaysLeft(new Date(NOW + 30 * DAY).toISOString(), NOW)).toBe(30);
      expect(resolveTrashDaysLeft(new Date(NOW + 60 * 60 * 1000).toISOString(), NOW)).toBe(1);
      expect(resolveTrashDaysLeft(new Date(NOW + 25 * 60 * 60 * 1000).toISOString(), NOW)).toBe(2);
    });

    it('已过期 / 非法时间一律 0（UI 据此禁用恢复）', () => {
      expect(resolveTrashDaysLeft(new Date(NOW - 1).toISOString(), NOW)).toBe(0);
      expect(resolveTrashDaysLeft('', NOW)).toBe(0);
      expect(resolveTrashDaysLeft('not-a-date', NOW)).toBe(0);
    });

    it('超过 30 天被夹到上限，避免出现「剩 45 天」这种不存在的文案', () => {
      expect(resolveTrashDaysLeft(new Date(NOW + 45 * DAY).toISOString(), NOW)).toBe(
        TRASH_RETENTION_DAYS,
      );
    });
  });

  describe('groupSelectedTileKeys', () => {
    it('同一内容的多格里按条目归组，下标升序去重', () => {
      const grouped = groupSelectedTileKeys(['e1::2', 'e1::0', 'e1::2', 'e2::1']);
      expect([...grouped.keys()]).toEqual(['e1', 'e2']);
      expect(grouped.get('e1')).toEqual([0, 2]);
      expect(grouped.get('e2')).toEqual([1]);
    });

    it('纸片格（::paper）与非图片 key 不参与删除', () => {
      const grouped = groupSelectedTileKeys(['e1::paper', 'bad-key', 'e1::1']);
      expect([...grouped.keys()]).toEqual(['e1']);
      expect(grouped.get('e1')).toEqual([1]);
    });

    it('空输入返回空 Map', () => {
      expect(groupSelectedTileKeys([]).size).toBe(0);
      expect(groupSelectedTileKeys(null).size).toBe(0);
    });
  });

  describe('listDeletableImageBlocks', () => {
    it('返回 block 真实下标（不是「第几张图」）—— 文字在前时不能错位', () => {
      // 论坛备份的真实形状：[标题文字, 图1, 图2]
      const blocks = [
        { type: 'text', text: '【标题】' },
        { type: 'image', url: 'a.jpg' },
        { type: 'image', url: 'b.jpg' },
      ];
      expect(listDeletableImageBlocks(blocks).map(({ blockIndex }) => blockIndex)).toEqual([1, 2]);
      expect(listDeletableImageBlocks(blocks).map(({ block }) => block.url)).toEqual([
        'a.jpg',
        'b.jpg',
      ]);
    });

    it('图片在文字前面时下标仍然是 block 下标', () => {
      const blocks = [
        { type: 'image', url: 'a.jpg' },
        { type: 'text', text: '说明' },
        { type: 'image', url: 'b.jpg' },
      ];
      expect(listDeletableImageBlocks(blocks).map(({ blockIndex }) => blockIndex)).toEqual([0, 2]);
    });

    it('跳过没有 url 的图片块与非图片块', () => {
      const blocks = [
        { type: 'image', url: '' },
        { type: 'text', text: 'x' },
        { type: 'image', url: 'ok.jpg' },
      ];
      expect(listDeletableImageBlocks(blocks).map(({ blockIndex }) => blockIndex)).toEqual([2]);
      expect(listDeletableImageBlocks(null)).toEqual([]);
    });
  });

  describe('removeImageBlocks / resolveCoverAfterRemoval', () => {
    const blocks = [
      { type: 'text', text: '正文' },
      { type: 'image', url: 'a.jpg' },
      { type: 'image', url: 'b.jpg' },
    ];

    it('只摘指定下标的图片块，其他块原样保留', () => {
      expect(removeImageBlocks(blocks, [1])).toEqual([
        { type: 'text', text: '正文' },
        { type: 'image', url: 'b.jpg' },
      ]);
    });

    it('下标指向文字块时不误删（防参数漂移把正文删了）', () => {
      expect(removeImageBlocks(blocks, [0])).toEqual(blocks);
    });

    it('封面重算成剩下的第一张图；没图则空字符串', () => {
      expect(resolveCoverAfterRemoval(removeImageBlocks(blocks, [1]))).toBe('b.jpg');
      expect(resolveCoverAfterRemoval([{ type: 'text', text: 'x' }])).toBe('');
    });
  });

  describe('isForumEntryTitleOnly', () => {
    it('论坛备份去掉【标题】后没内容 ⇒ true（删光图要整帖删）', () => {
      expect(isForumEntryTitleOnly({ source: 'forum', contentText: '【周末】\n' })).toBe(true);
      expect(isForumEntryTitleOnly({ source: 'forum', contentText: '【周末】' })).toBe(true);
    });

    it('帖子有正文 ⇒ false（只删图、文字保留）', () => {
      expect(isForumEntryTitleOnly({ source: 'forum', contentText: '【周末】\n去爬山了' })).toBe(
        false,
      );
    });

    it('非论坛条目 / 没有正文快照 ⇒ false（不误删）', () => {
      expect(isForumEntryTitleOnly({ source: 'manual', contentText: '' })).toBe(false);
      expect(isForumEntryTitleOnly({ source: 'forum', contentText: '' })).toBe(false);
      expect(isForumEntryTitleOnly(null)).toBe(false);
    });
  });
});
