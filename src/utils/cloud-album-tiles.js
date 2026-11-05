/**
 * 图库格子（albumTiles）的构造逻辑 —— 抽成纯函数，单测能锁住最关键的契约：
 * **key 的后半段必须是 contentBlocks 的真实下标**，不是「第几张图」。
 *
 * 为什么这条契约重要：
 *   删除 RPC 按 block 下标定位。论坛备份的 blocks 永远是 `[标题文字, 图1, 图2…]`，
 *   用图片序号会整体错位一位 —— 选第一张打到文字块（INVALID_BLOCK），
 *   选第二张删掉第一张（2026-11-04 审查实测发现）。
 */
import { resolveDbCloudTileImage, resolveDbCloudTileLqip } from './db-image-url.js';
import { listDeletableImageBlocks } from './cloud-image-trash.js';

/**
 * @param {Array} entries 已按筛选/排序处理过的条目
 * @returns {Array<{key:string, entry:object, imageUrl:string, displayUrl:string, lqipUrl:string, isFirstOfEntry:boolean}>}
 */
export function buildAlbumTiles(entries) {
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    const imageBlocks = listDeletableImageBlocks(entry?.contentBlocks);

    // 没有可删的图片块 ⇒ 纸片格（不可选、不参与删除）
    if (!imageBlocks.length) {
      return [
        {
          key: `${entry?.id}::paper`,
          entry,
          imageUrl: '',
          displayUrl: '',
          lqipUrl: '',
          isFirstOfEntry: true,
        },
      ];
    }

    return imageBlocks.map(({ block, blockIndex }, position) => {
      const imageUrl = String(block?.url || '').trim();
      return {
        key: `${entry.id}::${blockIndex}`,
        entry,
        imageUrl,
        // 缩略图（400px 方形）+ LQIP 占位：格子只有 78~200px，拉原图既慢又闪
        displayUrl: resolveDbCloudTileImage(imageUrl),
        lqipUrl: resolveDbCloudTileLqip(imageUrl),
        isFirstOfEntry: position === 0,
      };
    });
  });
}
