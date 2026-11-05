/**
 * 发帖图片编辑器的「猫贴纸」素材表（2026-11-05）。
 *
 * 素材来源：`Downloads/03_图片素材/猫图` 里那批实心白猫，经
 * `scripts/one-off/make-editor-stickers.py` 去掉白色矩形底后落到
 * `src/assets/images/editor-stickers/`。原图带整块白底，直接当贴纸会贴出一块
 * 白砖；脚本按「笔画聚类 → 凸包 → 平滑」重建轮廓，包内填白当身体、包外只留
 * 描边与彩色装饰，于是贴纸既没有白底、又能真正遮住画面。
 *
 * ⚠️ 贴纸必须是**不透明**的：它的产品用途是遮挡（替代马赛克）。
 * 仓库里的 `theme-cats` 那套线描猫身体是透明的，只能做装饰，不能做遮挡 ——
 * 两套素材别混用。
 */
import sticker01 from '@/assets/images/editor-stickers/sticker-01.webp';
import sticker02 from '@/assets/images/editor-stickers/sticker-02.webp';
import sticker03 from '@/assets/images/editor-stickers/sticker-03.webp';
import sticker04 from '@/assets/images/editor-stickers/sticker-04.webp';
import sticker05 from '@/assets/images/editor-stickers/sticker-05.webp';
import sticker06 from '@/assets/images/editor-stickers/sticker-06.webp';
import sticker07 from '@/assets/images/editor-stickers/sticker-07.webp';
import sticker08 from '@/assets/images/editor-stickers/sticker-08.webp';
import sticker09 from '@/assets/images/editor-stickers/sticker-09.webp';
import sticker10 from '@/assets/images/editor-stickers/sticker-10.webp';

export const EDITOR_STICKERS = [
  { id: 'cat-01', label: '猫贴纸 1', src: sticker01 },
  { id: 'cat-02', label: '猫贴纸 2', src: sticker02 },
  { id: 'cat-03', label: '猫贴纸 3', src: sticker03 },
  { id: 'cat-04', label: '猫贴纸 4', src: sticker04 },
  { id: 'cat-05', label: '猫贴纸 5', src: sticker05 },
  { id: 'cat-06', label: '猫贴纸 6', src: sticker06 },
  { id: 'cat-07', label: '猫贴纸 7', src: sticker07 },
  { id: 'cat-08', label: '猫贴纸 8', src: sticker08 },
  { id: 'cat-09', label: '猫贴纸 9', src: sticker09 },
  { id: 'cat-10', label: '猫贴纸 10', src: sticker10 },
];

/** 贴纸默认宽度占画布宽度的比例（放上去就是「一块能盖住脸」的大小）。 */
export const EDITOR_STICKER_DEFAULT_SIZE = 0.42;

/** 缩放上下限：占画布宽度的比例。 */
export const EDITOR_STICKER_MIN_SIZE = 0.12;
export const EDITOR_STICKER_MAX_SIZE = 1.4;

/** src → 已解码的 HTMLImageElement，供 canvas 同步绘制。 */
const imageCache = new Map();

/**
 * 预载贴纸位图。canvas 合成是同步的（renderDocToCanvas），所以进编辑器前
 * 必须先把图解码好，否则导出会缺贴纸。
 */
export function preloadEditorStickers() {
  if (typeof Image === 'undefined') return Promise.resolve(imageCache);
  const tasks = EDITOR_STICKERS.map(
    (sticker) =>
      new Promise((resolve) => {
        if (imageCache.has(sticker.src)) {
          resolve();
          return;
        }
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          imageCache.set(sticker.src, image);
          resolve();
        };
        // 单张贴纸载入失败不能阻断编辑：canvas 侧会跳过没有位图的贴纸
        image.onerror = () => resolve();
        image.src = sticker.src;
      }),
  );
  return Promise.all(tasks).then(() => imageCache);
}

/** 同步取已载入的位图（渲染器用）。 */
export function getLoadedStickerImage(src) {
  return imageCache.get(src) || null;
}

/** 当前已载入位图的 src → image 快照（渲染器用）。 */
export function getLoadedStickerImages() {
  return imageCache;
}
