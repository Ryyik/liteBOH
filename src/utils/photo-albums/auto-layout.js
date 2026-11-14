/**
 * 自动初排引擎（规则版，无 AI）
 *
 * 市调共识（Shutterfly 论文）：自动初排是留存关键 —— 用户从零手排大量弃坑。
 * 引擎输入照片池（已按时间升序），输出页面流（photoRefs），用户在其上手动微调。
 *
 * ⚠️ **字段名一律驼峰**（`pageType` / `layoutId` / `chapterTitle` / `note` / `photoRefs`），
 *    与 `useAlbumEditor` / `PageCanvas` / `AlbumSheet` / `saveAlbumPages` 是同一套页面对象。
 *    2026-11-14 之前本文件吐的是蛇形（`page_type` / `photo_refs`），而全链路只读驼峰 ⇒
 *    「自动初排」后页面渲染成空、保存时 `photo_refs` 被写成 `[]`（照片引用全丢）。
 *    写入数据库的 snake_case 转换只在 `photo-albums-api.js` 的 `saveAlbumPages` 里做一次。
 *
 * 策略：
 *   1. 时间聚类：拍摄/上传间隔 ≤ CLUSTER_GAP_MS 归为同组（同组才有"连拍成页"意义）；
 *   2. 组内按「最多两图」切页：每组按 2 张一页顺序切开，1 张也成一页；
 *      所有内容页统一 note（笔记版式：横图图上文下、竖图左图右文，两图上下堆叠）；
 *   3. 尾页固定追加 end 页。
 */

import { getLayout } from './layouts.js';

const CLUSTER_GAP_MS = 3 * 60 * 60 * 1000; // 3 小时内的照片视为同一场景
const NOTE_MAX_PHOTOS = 2; // 影集口径：一页最多两图

function photoTime(photo) {
  const t = Date.parse(photo?.capturedAt || photo?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

/**
 * 按版式槽位数从队列头部取 n 张
 */
function take(queue, n) {
  return queue.splice(0, n).map((p) => p.id);
}

/**
 * @param {Array<{id:string, ratio:string, createdAt?:string, capturedAt?:string}>} photos
 * @param {object} [options]
 * @param {boolean} [options.appendEndPage=true] 是否追加尾页
 * @returns {Array<{pageType:string, layoutId:string, chapterTitle:string, note:string, photoRefs:string[]}>}
 */
export function buildAutoLayoutPages(photos, options = {}) {
  const appendEndPage = options.appendEndPage !== false;
  const sorted = [...(photos || [])].sort((a, b) => photoTime(a) - photoTime(b));

  // 1) 时间聚类
  const clusters = [];
  let current = [];
  let anchorTime = 0;
  for (const photo of sorted) {
    const t = photoTime(photo);
    if (current.length && anchorTime && t - anchorTime > CLUSTER_GAP_MS) {
      clusters.push(current);
      current = [];
    }
    current.push(photo);
    if (t) anchorTime = t;
  }
  if (current.length) clusters.push(current);

  // 2) 组内切页：一页最多两张，统一笔记版式
  const pages = [];
  const flush = (queue) => {
    while (queue.length) {
      pages.push({
        pageType: 'content',
        layoutId: 'note',
        chapterTitle: '',
        note: '',
        photoRefs: take(queue, NOTE_MAX_PHOTOS),
      });
    }
  };

  for (const cluster of clusters) {
    flush([...cluster]);
  }

  if (appendEndPage) {
    pages.push({
      pageType: 'end',
      layoutId: 'full',
      chapterTitle: '',
      note: '',
      photoRefs: [],
    });
  }
  return pages;
}

/**
 * 把新照片追加进已有页面流：优先填未满槽位，再开新页
 * @param {Array} pages 驼峰页面对象（`useAlbumEditor` 的 pages.value）
 * @returns {{pages: Array, changed: boolean}}
 */
export function appendPhotosToPages(pages, newPhotos) {
  const next = (pages || []).map((p) => ({ ...p, photoRefs: [...(p.photoRefs || [])] }));
  let changed = false;

  for (const photo of newPhotos) {
    const openPage = next.find((p) => {
      if (p.pageType !== 'content') return false;
      // 历史三图/四图页即使还有空槽也不再塞图：口径是一页最多两张
      const cap = Math.min(NOTE_MAX_PHOTOS, getLayout(p.layoutId).maxPhotos);
      return (p.photoRefs || []).length < cap;
    });
    if (openPage) {
      openPage.photoRefs.push(photo.id);
    } else {
      next.push({
        pageType: 'content',
        layoutId: 'note',
        chapterTitle: '',
        note: '',
        photoRefs: [photo.id],
      });
    }
    changed = true;
  }
  return { pages: next, changed };
}

/**
 * 页面流重排（拖拽换序后调用）：重写 page_index 交给调用方持久化
 */
export function reindexPages(pages) {
  return (pages || []).map((p, i) => ({ ...p, page_index: i }));
}
