/**
 * 图库回收站纯逻辑（plans/039）—— 不依赖 supabase，单测可直接引入。
 *
 * 只放「不需要网络」的计算：保留天数、按条目归组、从 blocks 里摘掉指定下标。
 * 真正的读写走 utils/api/cloud-image-trash-api.js。
 */

export const TRASH_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 回收站剩余天数：向上取整到天，夹在 0..30。
 * 过期（<=0）返回 0 —— 调用方据此禁用「恢复」。
 */
export function resolveTrashDaysLeft(purgeAfter, now = Date.now()) {
  const deadline = Date.parse(String(purgeAfter || ''));
  if (!Number.isFinite(deadline)) return 0;
  const diff = deadline - Number(now || 0);
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.min(TRASH_RETENTION_DAYS, Math.ceil(diff / MS_PER_DAY));
}

/**
 * 把选中的格子（key = `${entryId}::${index}`）按条目归组。
 * 返回值：Map<entryId, number[]>（下标升序、去重）。
 *
 * 为什么要归组：删除 RPC 的粒度是「一条内容 + 一组 block 下标」，
 * 一次多选可能跨多条内容，必须拆成多次调用。
 */
export function groupSelectedTileKeys(tileKeys = []) {
  const grouped = new Map();
  for (const rawKey of Array.isArray(tileKeys) ? tileKeys : []) {
    const key = String(rawKey || '');
    const sep = key.lastIndexOf('::');
    if (sep <= 0) continue;
    const entryId = key.slice(0, sep);
    const index = Number(key.slice(sep + 2));
    if (!entryId || !Number.isInteger(index) || index < 0) continue;
    if (!grouped.has(entryId)) grouped.set(entryId, []);
    const list = grouped.get(entryId);
    if (!list.includes(index)) list.push(index);
  }
  for (const list of grouped.values()) list.sort((a, b) => a - b);
  return grouped;
}

/**
 * 列出「可删除的图片块」及其在 contentBlocks 里的**真实下标**。
 *
 * ⚠️ 这个下标必须是 block 下标，不能是「第几张图」的序号：
 *   删除 RPC 的 `p_block_indexes` 按 contentBlocks 下标定位，
 *   而论坛备份的 blocks 永远是 `[标题文字, 图1, 图2…]`。
 *   用图片序号会整体错位一位 —— 选第一张会打到文字块（INVALID_BLOCK），
 *   选第二张会删掉第一张（2026-11-04 审查发现）。
 */
export function listDeletableImageBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block, blockIndex) => ({ block, blockIndex }))
    .filter(({ block }) => block?.type === 'image' && String(block?.url || '').trim());
}

/**
 * 从 contentBlocks 里摘掉指定下标（删除成功后的本地乐观更新）。
 * 返回新数组；下标非法/非图片的项原样保留。
 */
export function removeImageBlocks(blocks, indexes = []) {
  const list = Array.isArray(blocks) ? blocks : [];
  const drop = new Set(
    (Array.isArray(indexes) ? indexes : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0),
  );
  return list.filter((block, index) => !(drop.has(index) && block?.type === 'image'));
}

/** 重算封面：剩下的第一张图；没有图则空字符串（与 DB 侧口径一致）。 */
export function resolveCoverAfterRemoval(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  const firstImage = list.find((block) => block?.type === 'image' && block?.url);
  return firstImage ? String(firstImage.url) : '';
}

/**
 * 论坛备份条目是否「只有标题、没有正文」—— 决定删光图片时是否整帖删除。
 *
 * 论坛备份的 content_text 形如 `【标题】\n正文`（create_forum_post_with_images 写入）。
 * 去掉开头的【标题】后若没有内容，说明帖子正文为空 ⇒ 删光图 = 整帖删。
 *
 * ⚠️ 不能用 entryType：删掉第一张图后守卫会把 entry_type 从 image 改写成 mixed
 * （content_blocks 里永远有「【标题】」文字块），第二次删最后一张就判不出来了。
 */
export function isForumEntryTitleOnly(entry) {
  if (String(entry?.source || '').trim() !== 'forum') return false;
  const text = String(entry?.contentText || '');
  if (!text.trim()) return false;
  return text.replace(/^【[^】]*】\s*/, '').trim() === '';
}
