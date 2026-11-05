/**
 * 图片编辑器的位图管线（发帖图片编辑 P0，2026-11-05 定稿方案）。
 *
 * 职责边界：这里只管「文件 ↔ canvas ↔ 文件」的像素事实；命令序列的语义
 * （撤销/归一化坐标）在 views/Forum/composables/useImageEditorDoc.js。
 *
 * 三档尺寸（单源在此，别处不许写字面量）：
 *  · 工作位图最长边 ≤ 2560 —— 进编辑器时一次性降采样。原图可能是 48MP 手机直拍，
 *    编辑器里任何交互都不该再碰它；2560 是「裁切后仍略超导出上限、留一次导出
 *    降采样余量」的档位（2560 / 1600 = 1.6×）。
 *  · 导出最长边 ≤ 1600 —— 与 FORUM_UPLOAD_IMAGE_MAX_DIMENSION 同值（发帖展示上限
 *    就是详情页 w_1600），编辑产物直接贴着管线的压缩档走，后续压缩通常是 no-op。
 *  · JPEG 质量 0.9 —— 导出唯一一次有损编码。
 *
 * ⚠️ 导出必须从工作位图合成（renderDocToCanvas），**不能**拿 cropper 的
 * getResult().canvas 直接用：cropper 的 src 是预览用的 JPEG（有损），从它裁切
 * 会叠一层「预览编码 → 再解码 → 再编码」的代际损耗。cropper 只提供交互坐标。
 */

/** 工作位图最长边（进编辑器一次性降采样）。 */
export const IMAGE_EDITOR_WORKING_MAX_DIMENSION = 2560;
/** 导出最长边（= 发帖上传压缩档，见 forum-format.js 的 FORUM_UPLOAD_IMAGE_MAX_DIMENSION）。 */
export const IMAGE_EDITOR_EXPORT_MAX_DIMENSION = 1600;
/** 导出 JPEG 质量。 */
export const IMAGE_EDITOR_EXPORT_QUALITY = 0.9;

/** 计算导出尺寸：等比、不超过 maxDimension（纯函数，测试直接吃）。 */
export function computeExportDimensions(
  width,
  height,
  maxDimension = IMAGE_EDITOR_EXPORT_MAX_DIMENSION,
) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const limit = Math.max(1, Number(maxDimension) || 1);
  const longest = Math.max(w, h);
  if (longest <= limit || longest === 0)
    return { width: Math.round(w), height: Math.round(h), scaled: false };
  const ratio = limit / longest;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio), scaled: true };
}

/** 计算工作位图尺寸：等比、不超过 maxDimension。 */
export function computeWorkingDimensions(
  width,
  height,
  maxDimension = IMAGE_EDITOR_WORKING_MAX_DIMENSION,
) {
  return computeExportDimensions(width, height, maxDimension);
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * 解码文件为可绘制的位图（ImageBitmap，失败时退 HTMLImageElement）。
 * 只在工作位图这一处解码一次，编辑全程复用。
 */
async function decodeFileToDrawable(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* 落到 <img> 路径 */
    }
  }
  if (typeof Image === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new Error('当前环境无法解码图片');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('图片解码失败'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 建工作位图：解码 + 一次性降采样到 ≤ maxDimension。
 * 返回 { canvas, width, height } —— canvas 就是编辑全程唯一真源的位图。
 */
export async function createWorkingSource(file, maxDimension = IMAGE_EDITOR_WORKING_MAX_DIMENSION) {
  if (!file) throw new Error('缺少图片文件');
  const drawable = await decodeFileToDrawable(file);
  const sourceWidth = Number(drawable?.width) || 0;
  const sourceHeight = Number(drawable?.height) || 0;
  if (!sourceWidth || !sourceHeight) throw new Error('图片尺寸异常');
  const { width, height, scaled } = computeWorkingDimensions(
    sourceWidth,
    sourceHeight,
    maxDimension,
  );
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(drawable, 0, 0, width, height);
  if (typeof drawable?.close === 'function') drawable.close();
  return { canvas, width, height, scaled, sourceWidth, sourceHeight };
}

/** 顺时针旋转 90°。 */
function rotateCanvasCW(source) {
  const { width, height } = source;
  const canvas = createCanvas(height, width);
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** 逆时针旋转 90°。 */
function rotateCanvasCCW(source) {
  const { width, height } = source;
  const canvas = createCanvas(height, width);
  const ctx = canvas.getContext('2d');
  ctx.translate(0, canvas.height);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** 水平翻转。 */
function flipCanvasHorizontal(source) {
  const { width, height } = source;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** 按归一化矩形裁切。 */
function cropCanvasByRect(source, rect) {
  const { x, y, width, height } = rect;
  const sx = x * source.width;
  const sy = y * source.height;
  const sw = width * source.width;
  const sh = height * source.height;
  const canvas = createCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 复制一份 canvas（贴纸层要就地画，不能改到工作位图本身）。 */
function cloneCanvas(source) {
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * 套一层 CSS filter（滤镜预设）。
 * `ctx.filter` 在少数环境不可用（jsdom / 老 Safari），此时**原样返回**——
 * 宁可导出「没滤镜的原图」，也不要抛错让整条发布链失败。
 */
function applyCanvasFilter(source, filterString) {
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d');
  try {
    ctx.filter = filterString;
    if (typeof ctx.filter !== 'string' || ctx.filter === 'none') return source;
  } catch {
    return source;
  }
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * 贴纸层（遮挡用）。
 * 贴纸按「宽度占画布比例」定位，高度按位图自身比例推 —— 永不拉伸变形。
 * 没有位图的贴纸直接跳过（预载失败不该让导出整体失败）。
 */
function drawStickers(source, stickers, stickerImages) {
  const canvas = cloneCanvas(source);
  const ctx = canvas.getContext('2d');
  for (const sticker of stickers) {
    const image = stickerImages?.get?.(sticker.asset) || stickerImages?.[sticker.asset] || null;
    if (!image) continue;
    const naturalWidth = Number(image.naturalWidth || image.width) || 0;
    const naturalHeight = Number(image.naturalHeight || image.height) || 0;
    if (!naturalWidth || !naturalHeight) continue;
    const width = Math.max(8, Number(sticker.size) * canvas.width);
    const height = (width * naturalHeight) / naturalWidth;
    ctx.drawImage(
      image,
      Number(sticker.x) * canvas.width - width / 2,
      Number(sticker.y) * canvas.height - height / 2,
      width,
      height,
    );
  }
  return canvas;
}

/**
 * 由命令序列从工作位图合成 canvas（预览与导出共用这一个合成器）。
 * 每次都从 source 全量重放命令 —— 非破坏模型的核心：中间不落有损文件。
 *
 * options.filter —— 已解析好的 CSS filter 串（由调用方从文档模型取出）
 * options.stickers / options.stickerImages —— 已折叠的贴纸列表与其位图表
 *
 * ⚠️ 这里刻意**不** import 文档模型的 fold 函数：utils 不许反向依赖 views，
 * 贴纸列表由调用方（编辑器的 composable）fold 好再传进来。
 */
export function renderDocToCanvas(source, commands = [], options = {}) {
  if (!source) throw new Error('缺少工作位图');
  const { filter = 'none', stickers = [], stickerImages = null } = options || {};
  let current = source;
  for (const command of Array.isArray(commands) ? commands : []) {
    if (!command || typeof command !== 'object') continue;
    if (command.type === 'rotate') {
      current = command.dir === 'ccw' ? rotateCanvasCCW(current) : rotateCanvasCW(current);
    } else if (command.type === 'flip') {
      current = flipCanvasHorizontal(current);
    } else if (command.type === 'crop') {
      const rect = command.rect;
      if (!rect || !(Number(rect.width) > 0) || !(Number(rect.height) > 0)) continue;
      current = cropCanvasByRect(current, rect);
    }
  }
  if (filter && filter !== 'none') current = applyCanvasFilter(current, filter);
  if (Array.isArray(stickers) && stickers.length)
    current = drawStickers(current, stickers, stickerImages);
  return current;
}

/** canvas → object URL（预览用，JPEG 有损只影响预览不影响导出）。 */
export function canvasToObjectUrl(canvas, quality = IMAGE_EDITOR_EXPORT_QUALITY) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('预览生成失败'));
            return;
          }
          resolve(URL.createObjectURL(blob));
        },
        'image/jpeg',
        quality,
      );
    } catch (error) {
      reject(error);
    }
  });
}

/** 编辑产物文件名：保留原 basename，标 -edited，统一 .jpg。 */
export function buildEditedFileName(originalName = '') {
  const base = String(originalName || '').trim();
  const stem = base.replace(/\.[^./\\]+$/, '') || 'image';
  return `${stem}-edited.jpg`;
}

/**
 * 导出：合成结果按 ≤ maxDimension 等比降采样 → JPEG → new File。
 * 这是编辑链唯一一次有损编码（源是工作位图的原始像素）。
 */
export async function exportCanvasToJpegFile(
  canvas,
  {
    name = '',
    maxDimension = IMAGE_EDITOR_EXPORT_MAX_DIMENSION,
    quality = IMAGE_EDITOR_EXPORT_QUALITY,
  } = {},
) {
  if (!canvas) throw new Error('缺少导出画布');
  const { width, height, scaled } = computeExportDimensions(
    canvas.width,
    canvas.height,
    maxDimension,
  );
  let output = canvas;
  if (scaled) {
    output = createCanvas(width, height);
    const ctx = output.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, width, height);
  }
  const blob = await new Promise((resolve, reject) => {
    try {
      output.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('图片导出失败'));
            return;
          }
          resolve(result);
        },
        'image/jpeg',
        quality,
      );
    } catch (error) {
      reject(error);
    }
  });
  return new File([blob], buildEditedFileName(name), { type: 'image/jpeg' });
}
