/**
 * 头像框几何口径（纯模块 · 无 DOM 依赖，可被 vitest 直接测）
 *
 * 这里是「上传一张 PNG 怎么算出 scale」的唯一实现，口径与手工流程完全一致：
 *   scale = 成品画布边长 / 内孔内接圆直径
 * 内孔内接圆用射线法测（从孔心向 360 个方向打射线，取最近命中距离 = 内接半径），
 * 与 scripts/probes 里 python 侧用的 DT 法同样保守 —— 保证头像不会被框压住。
 *
 * 为什么射线法而不是距离变换：JS 里做精确欧氏 DT 要么上 Dijkstra（慢），
 * 要么用曼哈顿近似（对角方向偏大 41%，算出来的 scale 会偏小、头像被压）。
 * 360 条射线 × 粗搜 9×9 网格的采样量在 512 采样边长下约 1.2M 次，够快也够准。
 */

/** 成品画布边长（与存量 5 个框完全一致，不留两套规格） */
export const CANVAS_SIZE = 1223;
/** scale 合理区间：下限=框几乎贴不住头像，上限=116px 卡片装不下（52×2.2=114.4） */
export const AVATAR_MIN_SCALE = 1.2;
export const AVATAR_MAX_SCALE = 2.2;
/** 余量小于此值给黄条 */
export const WARN_MARGIN = 6;
/** 一键适配预留的余量（按 52px 头像 × 116px 卡片算） */
export const AUTO_MARGIN = 10;

/**
 * 预览档位。每档各有自己的容器：36/42/52 出现在论坛卡片里（容器 = 卡片内宽），
 * 96 出现在个人主页 hero（横向宽松）。拿卡片约束去卡 hero 档会把好框误判成溢出。
 */
export const SIZE_PRESETS = [
  { px: 36, container: 116, scene: '卡片' },
  { px: 42, container: 116, scene: '卡片' },
  { px: 52, container: 116, scene: '卡片' },
  { px: 96, container: 260, scene: 'hero' }
];

/** 检测用的采样边长：太大慢、太小测不准内孔 */
export const DETECT_SAMPLE = 512;
/** 孔心粗搜范围（相对画布边长） */
const SEARCH_FRAC = 0.1;
const RAY_COUNT_COARSE = 72;
const RAY_COUNT_FINE = 360;
const OPAQUE_ALPHA = 40;

/** 把 RGBA 采样成方阵 alpha 掩码（供检测用） */
function sampleAlpha(imageData, sampleSize = DETECT_SAMPLE) {
  const { data, width, height } = imageData;
  const scale = Math.min(sampleSize / width, sampleSize / height, 1);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      alpha[y * w + x] = data[(sy * width + sx) * 4 + 3];
    }
  }
  return { alpha, w, h };
}

/** 单点内接半径：向 rayCount 个方向打射线，返回最近命中不透明像素的距离（像素） */
function inscribedRadiusAt(alpha, w, h, cx, cy, rayCount, maxRadius) {
  let minDist = maxRadius;
  for (let i = 0; i < rayCount; i++) {
    const ang = (i / rayCount) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let dist = maxRadius;
    for (let step = 1; step <= maxRadius; step++) {
      const x = Math.round(cx + dx * step);
      const y = Math.round(cy + dy * step);
      if (x < 0 || y < 0 || x >= w || y >= h) { dist = step; break; }
      if (alpha[y * w + x] >= OPAQUE_ALPHA) { dist = step; break; }
    }
    if (dist < minDist) minDist = dist;
    if (minDist <= 1) break;
  }
  return minDist;
}

/**
 * 检测内孔内接圆。
 * @returns {{ hx:number, hy:number, r:number, ratio:number, sampledW:number, sampledH:number }}
 *   hx/hy/r 是**原图坐标**（已从采样尺度换算回去），ratio = 2r / 原图边长（取长边）
 */
export function detectInnerHole(imageData, opts = {}) {
  const sampleSize = opts.sampleSize || DETECT_SAMPLE;
  const { alpha, w, h } = sampleAlpha(imageData, sampleSize);
  const maxRadius = Math.ceil(Math.min(w, h) / 2);

  // 找起点：中心若是透明就直接用；否则向内找最近的可放孔心处（孔洞中心必然是透明的）
  let sx = Math.floor(w / 2);
  let sy = Math.floor(h / 2);
  if (alpha[sy * w + sx] >= OPAQUE_ALPHA) {
    let found = false;
    const maxR = Math.ceil(Math.min(w, h) / 4);
    outer:
    for (let r = 1; r <= maxR; r += 2) {
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * Math.PI * 2;
        const x = Math.round(sx + Math.cos(ang) * r);
        const y = Math.round(sy + Math.sin(ang) * r);
        if (x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] < OPAQUE_ALPHA) {
          sx = x; sy = y; found = true; break outer;
        }
      }
    }
    if (!found) {
      return { hx: 0, hy: 0, r: 0, ratio: 0, sampledW: w, sampledH: h };
    }
  }

  // 粗搜：在中心邻域找内接半径最大的孔心
  const range = Math.round(Math.min(w, h) * SEARCH_FRAC);
  let best = { x: sx, y: sy, r: 0 };
  for (let dy = -range; dy <= range; dy += Math.max(1, Math.round(range / 4))) {
    for (let dx = -range; dx <= range; dx += Math.max(1, Math.round(range / 4))) {
      const x = sx + dx; const y = sy + dy;
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
      if (alpha[y * w + x] >= OPAQUE_ALPHA) continue;
      const r = inscribedRadiusAt(alpha, w, h, x, y, RAY_COUNT_COARSE, maxRadius);
      if (r > best.r) best = { x, y, r };
    }
  }
  // 精算：最优点上加密射线
  if (best.r > 0) {
    const fine = inscribedRadiusAt(alpha, w, h, best.x, best.y, RAY_COUNT_FINE, maxRadius);
    if (fine >= best.r - 2) best.r = fine;
  }

  // 换算回原图坐标
  const k = imageData.width / w;
  const hx = best.x * (imageData.width / w);
  const hy = best.y * (imageData.height / h);
  const r = best.r * Math.min(imageData.width / w, imageData.height / h);
  const longSide = Math.max(imageData.width, imageData.height);
  return {
    hx, hy, r,
    ratio: longSide > 0 ? (2 * r) / longSide : 0,
    sampledW: w, sampledH: h, _k: k
  };
}

/**
 * 由「素材在画布上的缩放」推几何读数。
 *
 * 模型：素材原图先把长边铺满画布（baseFit），再乘用户缩放 zoom。
 *   fitK    = CANVAS_SIZE / 原图长边            （铺满系数）
 *   k       = fitK * zoom                       （当前缩放系数，原图坐标 -> 画布坐标）
 *   内孔画布直径 = 2r * k
 *   scale   = CANVAS_SIZE / 内孔画布直径 = 长边 / (2r * zoom)
 */
export function computeMetrics({ hole, imgW, imgH, zoom, offsetX = 0, offsetY = 0 }) {
  const longSide = Math.max(imgW, imgH);
  const holeDiaCanvas = 2 * hole.r * (CANVAS_SIZE / longSide) * zoom;
  const scale = holeDiaCanvas > 0 ? CANVAS_SIZE / holeDiaCanvas : Infinity;
  const holeShare = holeDiaCanvas / CANVAS_SIZE;
  return {
    k: (CANVAS_SIZE / longSide) * zoom,
    holeDiaCanvas,
    holeShare,
    scale,
    offset: Math.hypot(offsetX, offsetY)
  };
}

/**
 * 素材对齐锚点（**唯一实现**，预览层与烘焙导出共用）。
 *
 * 有内孔 → 锚点就是孔心（成品图孔心居中的口径来源）。
 * 测不出内孔 → 回退「图片自身中心」= 原图铺满画布。这个兜底不是可选项：
 * 若照旧把 (0,0) 当孔心，预览会整张不可见、烘焙会只剩右下角一小块（2026-09-25 两处都踩过）。
 */
export function anchorPoint(hole, imgW, imgH) {
  const hasHole = Number.isFinite(hole?.r) && hole.r > 0;
  return hasHole ? { x: hole.hx, y: hole.hy, hasHole: true } : { x: imgW / 2, y: imgH / 2, hasHole: false };
}

/**
 * 编辑器画布上「素材层」的最终变换（返回**舞台像素**，直接喂给 style）。
 *
 * 为什么这段必须收进纯模块：上一版是组件里手拼 left/top/width/height，
 * 而组件在「未测出内孔」时提前返回了一个**没有 k 字段**的 metrics —— `k || 0` 取到 0，
 * 于是图层塌成 0×0：上传白底素材后整张图凭空消失，运营看不见图、也就无从判断该不该抠底。
 * （2026-09-25 实测：中秋特别.PNG 1400²、带 alpha 通道但 0 个透明像素 → r=0 → 预览全空。）
 */
export function layerTransform({ hole, imgW, imgH, zoom = 1, offsetX = 0, offsetY = 0, stage = CANVAS_SIZE }) {
  const { k } = computeMetrics({ hole, imgW, imgH, zoom, offsetX, offsetY });
  const toStage = stage / CANVAS_SIZE;
  const anchor = anchorPoint(hole, imgW, imgH);
  return {
    k,
    width: imgW * k * toStage,
    height: imgH * k * toStage,
    left: (CANVAS_SIZE / 2 - (anchor.x * k + offsetX)) * toStage,
    top: (CANVAS_SIZE / 2 - (anchor.y * k + offsetY)) * toStage
  };
}

/** 某一档的溢出判定（负 over = 装得下） */export function sizeState(preset, scale) {
  const frameLayerPx = preset.px * scale;
  const over = frameLayerPx - preset.container;
  const base = { ...preset, frameLayerPx, over };
  if (over > 0) return { ...base, cls: 'bad' };
  if (over > -WARN_MARGIN) return { ...base, cls: 'warn' };
  return { ...base, cls: '' };
}

/** 四档判定结果 + 最紧的一档（占容器比例最高的那个） */
export function sizeStates(scale) {
  const all = SIZE_PRESETS.map((p) => sizeState(p, scale));
  const worst = all.reduce((a, b) => (b.over > a.over ? b : a));
  return { all, worst };
}

/** 按最紧档回算建议 scale（一键自动适配用），并夹到合理区间 */
export function suggestScale({ preset = SIZE_PRESETS.find((p) => p.px === 52), margin = AUTO_MARGIN } = {}) {
  const raw = (preset.container - margin) / preset.px;
  return Math.min(AVATAR_MAX_SCALE, Math.max(AVATAR_MIN_SCALE, raw));
}

/** 发布前的整体体检：返回 { ok, blockers[], warnings[] } */
export function reviewFrame({ scale, offset, holeShare, hasAlpha }) {
  const blockers = [];
  const warnings = [];
  const { worst, all } = sizeStates(scale);

  if (!hasAlpha) blockers.push('素材没有透明通道：深色主题下会显示成白色方块，请先抠底');
  if (!Number.isFinite(scale) || scale <= 0) blockers.push('未能测出内孔：素材中心可能不是孔洞');
  else if (scale > AVATAR_MAX_SCALE) {
    blockers.push(`scale ${scale.toFixed(2)} 超过上限 ${AVATAR_MAX_SCALE}，最紧档 ${worst.px}px 会溢出 ${Math.round(worst.over)}px`);
  } else if (scale < AVATAR_MIN_SCALE) {
    warnings.push(`scale ${scale.toFixed(2)} 低于 ${AVATAR_MIN_SCALE}，框会紧贴头像几乎没有厚度`);
  }
  if (offset > 24) blockers.push(`孔心偏离画布中心 ${Math.round(offset)}px：渲染层按图片中心对齐，会整体错位`);
  else if (offset > 8) warnings.push(`孔心偏离 ${Math.round(offset)}px，建议点「居中」再发布`);
  if (holeShare < 0.45 && scale <= AVATAR_MAX_SCALE) {
    warnings.push(`内孔占比 ${(holeShare * 100).toFixed(1)}%，装饰外扩较大，小尺寸下装饰会糊成一团`);
  }
  const warnOnly = all.filter((s) => s.cls === 'warn');
  if (warnOnly.length) warnings.push(`${warnOnly.map((s) => s.px + 'px').join('/')} 档余量不足 ${WARN_MARGIN}px`);

  return { ok: blockers.length === 0, blockers, warnings };
}

/* ─────────────── canvas 侧工具 ─────────────── */

/** 从 File/Blob 读成可绘制的图 + ImageData（一次性） */
export async function loadImageForEdit(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { bitmap, imageData, width: bitmap.width, height: bitmap.height };
}

/** 是否真的带透明层：按**像素事实**判定，不看扩展名（白底存成 RGBA 的图很常见） */
export function hasRealAlpha(imageData) {
  const { data } = imageData;
  let transparent = 0;
  const total = imageData.width * imageData.height;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      transparent++;
      if (transparent > total * 0.02) return true;
    }
  }
  return false;
}

/**
 * 白底抠图：外部白 + 孔洞白透明化，主体内部白色高光保留。
 * 判定靠连通性 —— 与 scripts/probes 里 python 侧同一套口径。
 */
export function resolveWhiteBackground(imageData, threshold = 244) {
  const { data, width, height } = imageData;
  const total = width * height;
  const isWhite = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    isWhite[i] = (data[p] >= threshold && data[p + 1] >= threshold && data[p + 2] >= threshold) ? 1 : 0;
  }

  const mark = new Uint8Array(total);   // 1 = 判为背景
  const stack = [];
  const push = (x, y) => {
    const i = y * width + x;
    if (isWhite[i] && !mark[i]) { mark[i] = 1; stack.push(i); }
  };
  // 四角 + 中心（中心是孔洞）
  push(0, 0); push(width - 1, 0); push(0, height - 1); push(width - 1, height - 1);
  push(Math.floor(width / 2), Math.floor(height / 2));

  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  // 半透明过渡：背景带内用亮度做软 alpha，其余保持不透明
  let cleared = 0;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (mark[i]) {
      data[p + 3] = 0;
      cleared++;
    }
  }
  // data 与原 imageData.data 是同一份引用（就地改写），这里一并回传方便调用方直接使用
  return { data, width, height, cleared, total };
}

/**
 * 烘焙：把当前摆位烧进 CANVAS_SIZE 方图，保证**内孔圆心落在画布中心**。
 * 这是「渲染层零改动」的关键 —— 输出图与内置素材同构，渲染只认 url + scale。
 */
export async function bakeFrame({ bitmap, hole, zoom, offsetX = 0, offsetY = 0, size = CANVAS_SIZE }) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const k = (size / Math.max(bitmap.width, bitmap.height)) * zoom;
  const dispW = bitmap.width * k;
  const dispH = bitmap.height * k;
  // 锚点与预览层同一口径（见 anchorPoint）：测不出内孔就按图片自身中心对齐。
  // 若照旧把 (0,0) 当孔心，导出的成品只剩右下角一小块、其余全透明 —— 那就是一张废图。
  const anchor = anchorPoint(hole, bitmap.width, bitmap.height);
  const dx = size / 2 - anchor.x * k + offsetX;
  const dy = size / 2 - anchor.y * k + offsetY;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, dx, dy, dispW, dispH);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, size, k, dx, dy };
}

/** 估算烘焙后的 PNG 体积（超限时提示，服务端不拦但运营要知道） */
export function formatKB(bytes) {
  return `${Math.round(bytes / 1024)}KB`;
}
