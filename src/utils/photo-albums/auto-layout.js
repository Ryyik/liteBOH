/**
 * 自动初排引擎（规则版，无 AI）
 *
 * 市调共识（Shutterfly 论文）：自动初排是留存关键 —— 用户从零手排大量弃坑。
 * 引擎输入照片池（已按时间升序），输出页面流（photo_refs），用户在其上手动微调。
 *
 * 策略：
 *   1. 时间聚类：拍摄/上传间隔 ≤ CLUSTER_GAP_MS 归为同组（同组才有"连拍成页"意义）；
 *   2. 组内按剩余张数与横竖比匹配版式：
 *        1 张  landscape→full / portrait→img-left-text（隔页换 img-right-text 制造节奏）
 *              square→full
 *        2 张  duo
 *        3 张  trio
 *        4 张  grid4
 *        ≥5 张 strip（截取前 5 张，其余留在池中下一组续排）
 *   3. 尾页固定追加 end 页。
 */

import { getLayout } from './layouts.js';

const CLUSTER_GAP_MS = 3 * 60 * 60 * 1000;      // 3 小时内的照片视为同一场景
const STRIP_MAX = 5;

function photoTime(photo) {
  const t = Date.parse(photo?.capturedAt || photo?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

function ratioOf(photo) {
  return String(photo?.ratio || 'landscape');
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

  // 2) 组内匹配版式
  const pages = [];
  let textAlternator = 0;
  const flush = (queue) => {
    while (queue.length) {
      const count = queue.length;
      if (count === 1) {
        const only = queue[0];
        const r = ratioOf(only);
        let layoutId = 'full';
        if (r === 'portrait') {
          layoutId = textAlternator % 2 === 0 ? 'img-left-text' : 'img-right-text';
          textAlternator += 1;
        }
        pages.push({ page_type: 'content', layout_id: layoutId, chapter_title: '', note: '', photo_refs: take(queue, 1) });
      } else if (count === 2) {
        pages.push({ page_type: 'content', layout_id: 'duo', chapter_title: '', note: '', photo_refs: take(queue, 2) });
      } else if (count === 3) {
        pages.push({ page_type: 'content', layout_id: 'trio', chapter_title: '', note: '', photo_refs: take(queue, 3) });
      } else if (count === 4) {
        pages.push({ page_type: 'content', layout_id: 'grid4', chapter_title: '', note: '', photo_refs: take(queue, 4) });
      } else {
        // ≥5：胶片条带走至多 5 张，剩余滚动到下一轮
        pages.push({ page_type: 'content', layout_id: 'strip', chapter_title: '', note: '', photo_refs: take(queue, STRIP_MAX) });
      }
    }
  };

  for (const cluster of clusters) {
    flush([...cluster]);
  }

  if (appendEndPage) {
    pages.push({ page_type: 'end', layout_id: 'full', chapter_title: '', note: '', photo_refs: [] });
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
      return (p.photo_refs || []).length < getLayout(p.layout_id).maxPhotos;
    });
    if (openPage) {
      openPage.photo_refs.push(photo.id);
    } else {
      const r = ratioOf(photo);
      next.push({
        page_type: 'content',
        layout_id: r === 'portrait' ? 'img-left-text' : 'full',
        chapter_title: '',
        note: '',
        photo_refs: [photo.id]
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
