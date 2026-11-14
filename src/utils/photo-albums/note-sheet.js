/**
 * 影集「笔记版式」内容解析（单一真源）
 *
 * 阅读页（AlbumPageSheet）、编辑器画布（PageCanvas）、离线导出（offline-export）
 * 三处渲染都必须从这里取标题 / 元信息 / 正文，禁止各自再写一份兜底链 ——
 * 否则「导出后标题变了」这类问题会反复出现。
 *
 * 兜底口径（老影集三列全空也能正常阅读）：
 *   headline → 首图配文 → 章节标题 → 影集标题
 *   taken_on → 首图创建时间
 *   place    → 为空则只显示日期
 */

/**
 * 是否走笔记版式：内容页且照片不超过 2 张。
 * 影集口径是「一页最多两图、统一笔记排版」——两图页也用同一套
 * 「图在上 / 左标题右正文」，不再有双图网格；三图及以上的历史页面
 * 继续用原网格渲染，避免吞掉已有照片。
 */
export function isNoteSheetPage(page) {
  if (!page || page.pageType !== 'content') return false;
  const refs = page.photoRefs || [];
  return refs.length <= 2;
}

/** 竖图判定：优先用实际宽高，缺失时回退入库时的 ratio */
export function photoIsPortrait(photo) {
  const width = Number(photo?.width || 0);
  const height = Number(photo?.height || 0);
  if (width > 0 && height > 0) return height > width;
  return String(photo?.ratio || '') === 'portrait';
}

/** 日期只显示 YYYY.MM.DD；解析失败返回空串 */
export function formatNoteDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (dateOnly) return `${dateOnly[1]}.${dateOnly[2]}.${dateOnly[3]}`;
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return '';
  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/**
 * 解析一页笔记的全部可见内容
 * @param {{page:object|null, photos?:Array, album?:object|null}} input
 */
export function resolveNoteContent({ page, photos = [], album = null } = {}) {
  const photoById = new Map((photos || []).map((photo) => [String(photo.id), photo]));
  const refs = (page?.photoRefs || []).map((id) => photoById.get(String(id))).filter(Boolean);
  const primary = refs[0] || null;

  let headline = String(page?.headline || '').trim();
  let headlineFromCaption = false;
  if (!headline && primary?.caption) {
    headline = String(primary.caption).trim();
    headlineFromCaption = true;
  }
  if (!headline) headline = String(page?.chapterTitle || '').trim();
  if (!headline) headline = String(album?.title || '').trim();

  const paragraphs = String(page?.note || '')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const captions = refs
    .map((photo, index) => ({ photo, index, text: String(photo.caption || '').trim() }))
    .filter((entry) => entry.text && !(headlineFromCaption && entry.index === 0))
    .map((entry) => entry.text);

  return {
    headline,
    dateText: formatNoteDate(page?.takenOn || primary?.createdAt),
    placeText: String(page?.place || '').trim(),
    paragraphs,
    captions,
    photos: refs,
    photo: primary,
    isPair: refs.length > 1,
    // 竖图变体只针对单图页；两图页统一「上图下文」
    isPortrait: refs.length === 1 && photoIsPortrait(primary),
    hasBody: paragraphs.length > 0 || captions.length > 0,
  };
}
