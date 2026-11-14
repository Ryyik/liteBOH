/**
 * 自动初排引擎（规则版，无 AI）
 *
 * 市调共识（Shutterfly 论文）：自动初排是留存关键 —— 用户从零手排大量弃坑。
 * 引擎输入照片池（已按时间升序），输出页面流（photo_refs），用户在其上手动微调。
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
 * @returns {Array<{page_type:string, layout_id:string, chapter_title:string, note:string, photo_refs:string[]}>}
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
        page_type: 'content',
        layout_id: 'note',
        chapter_title: '',
        note: '',
        photo_refs: take(queue, NOTE_MAX_PHOTOS),
      });
    }
  };

  for (const cluster of clusters) {
    flush([...cluster]);
  }

  if (appendEndPage) {
    pages.push({
      page_type: 'end',
      layout_id: 'full',
      chapter_title: '',
      note: '',
      photo_refs: [],
    });
  }
  return pages;
}

/**
 * 把新照片追加进已有页面流：优先填未满槽位，再开新页
 * @returns {{pages: Array, changed: boolean}}
 */
export function appendPhotosToPages(pages, newPhotos) {
  const next = (pages || []).map((p) => ({ ...p, photo_refs: [...(p.photo_refs || [])] }));
  let changed = false;

  for (const photo of newPhotos) {
    const openPage = next.find((p) => {
      if (p.page_type !== 'content') return false;
      // 历史三图/四图页即使还有空槽也不再塞图：口径是一页最多两张
      const cap = Math.min(NOTE_MAX_PHOTOS, getLayout(p.layout_id).maxPhotos);
      return (p.photo_refs || []).length < cap;
    });
    if (openPage) {
      openPage.photo_refs.push(photo.id);
    } else {
      next.push({
        page_type: 'content',
        layout_id: 'note',
        chapter_title: '',
        note: '',
        photo_refs: [photo.id],
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
