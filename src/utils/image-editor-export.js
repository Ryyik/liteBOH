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

import { GRAIN_TILE_SIZE, getGrainTile, grainSpeckSize } from './image-editor-grain.js';
import { buildHalationGlow } from './image-editor-halation.js';

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

/* ── 高质量降采样（pica，MIT） ─────────────────────────────────────────────
 * canvas 自带的 drawImage 缩放在多数实现里是双线性 + 少量预滤波，缩到 1/2 以下
 * 会明显发糊、细节糊成色块。pica 是 Lanczos 重采样 + 可选反锐化，正是「导出
 * 1600 宽」这一步最需要的东西。
 *
 * 三个约束：
 *  1. **动态 import** —— pica 只在这一步用，不能进首屏包；
 *  2. **必须能降级** —— jsdom / 老浏览器 / 被 CSP 拦 worker 时退回 drawImage，
 *     导出宁可略糊也不能抛错（发布链断在这里体验最差）；
 *  3. 只缩不放 —— 放大用 pica 除了慢没有收益，画质也不会更好。
 */
let picaPromise = null;

function loadPica() {
  if (!picaPromise) {
    picaPromise = import('pica')
      .then((module) => {
        const Pica = module?.default || module?.Pica || module;
        return typeof Pica === 'function' ? new Pica() : null;
      })
      .catch(() => null);
  }
  return picaPromise;
}

function drawScaled(from, target) {
  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(from, 0, 0, target.width, target.height);
  return target;
}

/**
 * 逐级减半再落到目标尺寸。
 * 单次大幅降采样会丢细节（每个输出像素只采样到极少数源像素），连续减半
 * 相当于近似一次盒式滤波。pica 不可用时这是第二道保险。
 * `target` 传入时直接画进去，省一张中间画布（也让「函数只产出 1 个画布」
 * 这条性质在单测里成立）。
 */
function downscaleByHalving(from, width, height, target = null) {
  let current = from;
  while (current.width / 2 >= width * 2 && current.height / 2 >= height * 2) {
    const next = createCanvas(current.width / 2, current.height / 2);
    current = drawScaled(current, next);
  }
  return drawScaled(current, target || createCanvas(width, height));
}

/**
 * 等比缩到指定尺寸的高质量版本（Lanczos + 轻反锐化）。
 * 失败一律降级，永不抛错。
 */
export async function resizeCanvasHighQuality(from, width, height) {
  const targetWidth = Math.max(1, Math.round(Number(width) || 0));
  const targetHeight = Math.max(1, Math.round(Number(height) || 0));
  const canvas = createCanvas(targetWidth, targetHeight);
  if (!from) return canvas;
  // 不放大：pica 放大既慢也不会更清晰
  if (from.width <= targetWidth && from.height <= targetHeight) return drawScaled(from, canvas);
  const pica = await loadPica();
  if (pica) {
    try {
      await pica.resize(from, canvas, {
        quality: 3,
        unsharpAmount: 80,
        unsharpRadius: 0.6,
        unsharpThreshold: 2,
      });
      return canvas;
    } catch {
      /* 落到下面的降级路径（画布就地复用，不再新建） */
    }
  }
  return downscaleByHalving(from, targetWidth, targetHeight, canvas);
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
  // 超大原图（单反/48MP 直拍）走逐级减半：pica 虽然更锐，但 40MP 以上要跑
  // 一两秒，而这只是「进编辑器前的缓冲位图」，交互延迟比画质更值得优先。
  const pixels = sourceWidth * sourceHeight;
  const canvas =
    scaled && pixels > 12000000
      ? downscaleByHalving(drawable, width, height)
      : await resizeCanvasHighQuality(drawable, width, height);
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

/* ── 胶片模拟层 ────────────────────────────────────────────────────────
 * 顺序不是随便排的，它对应「光进入胶片到成为一张照片」的物理顺序：
 *   调色（显影的色偏）→ 整体染色（胶卷底色）→ halation（片基反射）
 *   → 阴影/高光染色（染料分层）→ 提升黑场（片基灰雾）→ 颗粒（银盐）
 *   → 暗角（镜头失光）→ 漏光（后背）
 * 把颗粒放在染色之前会被染色盖掉一半、放在暗角之后则会连暗角一起加噪，
 * 这两种错在缩略图上看不出来，放大后一眼假。
 *
 * 预览侧的对应实现见 components/ImageEditorFilmFx.vue —— 两边的数值全部来自
 * 同一份 resolveFilterLook()，唯一允许的差异是颗粒图案位置（随机纹理）。
 */

/** 一层纯色，按指定混合模式叠上去。 */
function fillWithBlend(ctx, color, opacity, blend, width, height) {
  if (!(opacity > 0) || !color || color === 'transparent') return;
  try {
    ctx.save();
    ctx.globalCompositeOperation = blend;
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } catch {
    /* 混合模式不被支持：跳过这一层，别让导出失败 */
  }
}

/**
 * 高光泛光：只让**强光**发光（阈值见 utils/image-editor-halation.js）。
 * 早先用「整幅模糊 + screen」，暗部也被抬亮，成片发灰掉饱和 —— 那是雾，不是光晕。
 */
function drawHalation(ctx, source, halation, width, height) {
  const opacity = Number(halation?.opacity) || 0;
  if (opacity <= 0) return;
  const glow = buildHalationGlow(source, halation);
  if (!glow) return;
  try {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.drawImage(glow, 0, 0, width, height);
    ctx.restore();
  } catch {
    /* ignore */
  }
}

/** 颗粒：把共享噪声块按「单颗尺寸」平铺，用 overlay 让中间调不受影响。 */
function drawGrain(ctx, grain, width, height) {
  const opacity = Number(grain?.opacity) || 0;
  if (opacity <= 0) return;
  const tile = getGrainTile();
  if (!tile?.canvas) return;
  const speck = Math.max(1, grainSpeckSize(grain.scale, width) * 1);
  const size = Math.max(2, Math.round(GRAIN_TILE_SIZE * speck));
  try {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(1, opacity);
    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        ctx.drawImage(tile.canvas, x, y, size, size);
      }
    }
    ctx.restore();
  } catch {
    /* ignore */
  }
}

/** 暗角：径向渐变 + multiply，边缘压暗而不是加黑圈。 */
function drawVignette(ctx, strength, width, height) {
  const amount = Number(strength) || 0;
  if (amount <= 0 || typeof ctx.createRadialGradient !== 'function') return;
  try {
    const inner = Math.min(width, height) * 0.28;
    const outer = Math.max(width, height) * 0.72;
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      inner,
      width / 2,
      height / 2,
      outer,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, amount)})`);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } catch {
    /* ignore */
  }
}

/** 漏光：从归一化坐标点发散的暖色光斑，screen 混合。 */
function drawLightLeak(ctx, leak, width, height) {
  const opacity = Number(leak?.opacity) || 0;
  if (opacity <= 0 || !leak?.color || leak.color === 'transparent') return;
  if (typeof ctx.createRadialGradient !== 'function') return;
  try {
    const cx = (Number(leak.x) || 0.5) * width;
    const cy = (Number(leak.y) || 0.5) * height;
    const radius = Math.max(1, (Number(leak.radius) || 0.6) * Math.max(width, height));
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, leak.color);
    gradient.addColorStop(0.55, leak.color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } catch {
    /* ignore */
  }
}

/**
 * 套一整份胶片 look（调色 + 物理层）。
 * 传入的 look 必须来自 resolveFilterLook()，这里只负责画。
 */
function applyFilmLook(source, look) {
  const cssActive = Boolean(look?.css) && look.css !== 'none';
  const layersActive =
    (Number(look?.cast?.opacity) || 0) > 0 ||
    (Number(look?.halation?.opacity) || 0) > 0 ||
    (Number(look?.shadow?.opacity) || 0) > 0 ||
    (Number(look?.highlight?.opacity) || 0) > 0 ||
    (Number(look?.lift) || 0) > 0 ||
    (Number(look?.grain?.opacity) || 0) > 0 ||
    (Number(look?.vignette) || 0) > 0 ||
    (Number(look?.leak?.opacity) || 0) > 0;
  // 原图 / 强度 0：一层都不画，省掉一次全量位图拷贝
  if (!cssActive && !layersActive) return source;
  const base = cssActive ? applyCanvasFilter(source, look.css) : source;
  // 后面全是就地绘制，必须是独立画布（不能改到工作位图本身）
  const canvas = base === source ? cloneCanvas(source) : base;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  /* 整体染色：胶卷底色。soft-light 作用在整幅（含中间调），是「一眼能看出是哪卷」
     的那一层；shadow/highlight 各只影响一端，替代不了它。 */
  fillWithBlend(
    ctx,
    look?.cast?.color,
    look?.cast?.opacity,
    look?.cast?.blend || 'soft-light',
    width,
    height,
  );
  drawHalation(ctx, canvas, look?.halation, width, height);
  // 混合模式由预设决定（shadow 用 multiply 压暗染色、highlight 用 soft-light 提亮），
  // 写死 'screen' 会和预览分叉 —— 预览读的是 look.shadow.blend。
  fillWithBlend(
    ctx,
    look?.shadow?.color,
    look?.shadow?.opacity,
    look?.shadow?.blend || 'multiply',
    width,
    height,
  );
  fillWithBlend(
    ctx,
    look?.highlight?.color,
    look?.highlight?.opacity,
    look?.highlight?.blend || 'soft-light',
    width,
    height,
  );
  // 'lighten' + 白色 + 低透明度 = 只抬黑场，不动高光
  fillWithBlend(ctx, '#ffffff', look?.lift, 'lighten', width, height);
  drawGrain(ctx, look?.grain, width, height);
  drawVignette(ctx, look?.vignette, width, height);
  drawLightLeak(ctx, look?.leak, width, height);
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
  const { filter = 'none', look = null, stickers = [], stickerImages = null } = options || {};
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
  if (look) current = applyFilmLook(current, look);
  else if (filter && filter !== 'none') current = applyCanvasFilter(current, filter);
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
  if (scaled) output = await resizeCanvasHighQuality(canvas, width, height);
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
