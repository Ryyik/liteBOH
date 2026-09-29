/**
 * Cloud+ 条目维护动作（删除等需要跨 API 与 CDN 清理的编排）。
 *
 * 为什么要独立成模块：删除一条 Cloud+ 内容 = 「守卫校验 → 清理 Cloudinary 图片 → 删行」
 * 三步编排。它同时被两个管理面调用——Cloud+ 页（私密内容）与「我」页作品格（公开笔记）。
 * 编排只写这一份，两个入口行为才不会漂。
 */
import {
  extractCloudinaryPublicIdFromUrl,
  deleteCloudinaryAssetsByPublicIds,
} from './cloudinary-client.js';
import { deleteMyCloudEntry } from './api/boh-cloud-api.js';

export function collectCloudEntryImagePublicIds(entry) {
  return Array.from(
    new Set(
      (Array.isArray(entry?.contentBlocks) ? entry.contentBlocks : [])
        .filter((block) => block?.type === 'image')
        .map((block) =>
          String(block?.publicId || extractCloudinaryPublicIdFromUrl(block?.url)).trim(),
        )
        .filter(Boolean),
    ),
  );
}

/**
 * 删除一条 Cloud+ 内容并尽力清理其云端图片。
 * 先跑 validateOnly 守卫（含「论坛同步不可删」），守卫过了才动 CDN。
 */
export async function deleteCloudEntryWithAssets(userId, entry) {
  const guardResult = await deleteMyCloudEntry(userId, entry?.id, {
    legacyNoteDate: entry?.legacyNoteDate || entry?.entryDate || '',
    validateOnly: true,
  });
  if (!guardResult.ok) {
    return guardResult;
  }

  const publicIds = collectCloudEntryImagePublicIds(entry);
  if (publicIds.length) {
    const cloudinaryResult = await deleteCloudinaryAssetsByPublicIds(publicIds);
    if (!cloudinaryResult.ok) {
      return cloudinaryResult;
    }
  }

  return deleteMyCloudEntry(userId, entry?.id, {
    legacyNoteDate: entry?.legacyNoteDate || entry?.entryDate || '',
  });
}
