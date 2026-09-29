/**
 * 公开笔记的文字封面（自动生成，非用户选择）。
 *
 * 设计约定（2026-09-29 拍板）：公开笔记进「作品格」瀑布流，但笔记没有图，
 * 纯文字卡在流里是黑洞 ⇒ 用「标题 + hash 取色板底色」自动生成文字封面：
 * 不强制用户选图，也不在作品格里加子段。有真图片的笔记仍走图片封面。
 *
 * hash 只求稳定（同一条笔记永远同一配色），不求密码学强度。
 */

export const CLOUD_NOTE_COVER_THEME_COUNT = 6;

export function hashCloudNoteSeed(seedText = '') {
  const text = String(seedText || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function pickCloudNoteCoverTheme(seedText = '') {
  return hashCloudNoteSeed(seedText) % CLOUD_NOTE_COVER_THEME_COUNT;
}

/**
 * 作品格卡片视图模型：帖子与公开笔记在「作品格」里并排展示，
 * 两边各自有一套字段（post.images / entry.contentBlocks），这里把笔记折成一侧。
 *
 * @param {object} entry 归一化后的 cloud entry
 * @returns {{id:string, isCloudNote:true, title:string, summary:string, imageCount:number,
 *   coverImageUrl:string, coverTheme:number, dateValue:string, entry:object}|null}
 */
export function buildCloudNoteWorkCard(entry = {}) {
  const id = String(entry?.id || '').trim();
  if (!id) return null;
  return {
    id,
    isCloudNote: true,
    title: String(entry.title || '').trim(),
    summary: String(entry.previewText || entry.contentText || '').trim(),
    imageCount: Array.isArray(entry.contentBlocks)
      ? entry.contentBlocks.filter((block) => block?.type === 'image').length
      : 0,
    coverImageUrl: String(entry.coverImageUrl || '').trim(),
    coverTheme: pickCloudNoteCoverTheme(`${id}:${entry.title || ''}`),
    dateValue: String(entry.updatedAt || entry.entryDate || '').trim(),
    entry,
  };
}
