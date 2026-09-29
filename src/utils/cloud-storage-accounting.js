/**
 * Cloud+ 存储记账（单一真源）。
 *
 * 设计约定（2026-09-29 拍板）：公开笔记计入「作品格」展示，但仍占用 Cloud+ 配额；
 * Cloud+ 自身 = 私密笔记容器 + 全部存储的账目。配额单位沿用既有真源「图片张数」
 * （subscription-benefits 的 cloudImageLimit），账目按「私密 / 公开」分段。
 *
 * 本模块只做纯计算，不发请求；所有需要「私密/公开/剩余」口径的界面
 * （Cloud+ 存储条、我页作品格、UserSpaceMain 用量回退）都从这里取数，禁止再写第二份 reduce。
 */

export const CLOUD_ENTRY_VISIBILITIES = ['private', 'public'];

export function normalizeCloudVisibility(value) {
  const safe = String(value || '')
    .trim()
    .toLowerCase();
  return CLOUD_ENTRY_VISIBILITIES.includes(safe) ? safe : 'private';
}

export function isPublicCloudEntry(entry) {
  return normalizeCloudVisibility(entry?.visibility) === 'public';
}

export function countCloudEntryImages(entry) {
  if (!Array.isArray(entry?.contentBlocks)) return 0;
  return entry.contentBlocks.filter((block) => block?.type === 'image').length;
}

function clampCount(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

/**
 * @param {Array} entries 归一化后的 cloud entries（含 visibility / contentBlocks）
 * @param {number} limit 配额上限（图片张数；<=0 视为未取到，按 0 记账、百分比全 0）
 * @returns {{limit:number, usedImages:number, privateImages:number, publicImages:number,
 *   remainingImages:number, privateEntries:number, publicEntries:number,
 *   privatePercent:number, publicPercent:number, remainingPercent:number, overflow:boolean}}
 */
export function computeCloudStorageAccounting({ entries = [], limit = 0 } = {}) {
  const safeLimit = clampCount(limit);
  const list = Array.isArray(entries) ? entries : [];

  let privateImages = 0;
  let publicImages = 0;
  let privateEntries = 0;
  let publicEntries = 0;

  list.forEach((entry) => {
    const images = countCloudEntryImages(entry);
    if (isPublicCloudEntry(entry)) {
      publicEntries += 1;
      publicImages += images;
    } else {
      privateEntries += 1;
      privateImages += images;
    }
  });

  const usedImages = privateImages + publicImages;
  const remainingImages = safeLimit > 0 ? Math.max(0, safeLimit - usedImages) : 0;

  // 百分比按「已用内部占比 + 剩余」分摊到 100；余量吃掉取整误差，避免条上出现缝。
  let privatePercent = 0;
  let publicPercent = 0;
  let remainingPercent = 0;
  if (safeLimit > 0) {
    const usedRatio = Math.min(1, usedImages / safeLimit);
    privatePercent = usedRatio > 0 ? Math.floor((privateImages / safeLimit) * 100) : 0;
    publicPercent = usedRatio > 0 ? Math.floor((publicImages / safeLimit) * 100) : 0;
    privatePercent = Math.min(privatePercent, Math.floor(usedRatio * 100));
    publicPercent = Math.min(publicPercent, Math.floor(usedRatio * 100) - privatePercent);
    remainingPercent = Math.max(0, 100 - privatePercent - publicPercent);
  }

  return {
    limit: safeLimit,
    usedImages,
    privateImages,
    publicImages,
    remainingImages,
    privateEntries,
    publicEntries,
    privatePercent,
    publicPercent,
    remainingPercent,
    overflow: safeLimit > 0 && usedImages > safeLimit,
  };
}
