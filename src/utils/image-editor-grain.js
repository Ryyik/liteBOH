/**
 * 胶片颗粒噪声块（2026-11-05，随「胶片模拟滤镜」一起引入）。
 *
 * 为什么是「共享一块噪声」而不是每个滤镜随机生成：
 * 预览是 CSS 的 `background-image`，导出是 canvas 的 `drawImage` 平铺。两边的
 * 噪声必须是**同一张图**，否则同一档滤镜在预览和成片里的颗粒密度对不上，
 * 用户会觉得「导出后画面变脏了」。所以这里只生成一次、缓存、两边共用。
 *
 * 为什么不用 SVG feTurbulence：它的分形噪声自带方向性云纹，放大后像水渍而不像
 * 银盐颗粒；逐像素随机更接近胶片。代价是要一张 128×128 的位图（约 6KB PNG）。
 *
 * ⚠️ 这一层刻意放在 utils：导出管线（utils/image-editor-export.js）要用它，
 * 而 utils 不许反向依赖 views（滤镜预设表在 views/composables 下）。
 */

/** 噪声块边长（像素）。128 足够避免肉眼可见的重复接缝。 */
export const GRAIN_TILE_SIZE = 128;

/** 颗粒振幅：以 128 为基准的加减范围（两次均匀分布求和 ≈ 中间高两边低的分布）。 */
const GRAIN_AMPLITUDE = 46;

/** 固定种子的 mulberry32 —— 保证每次启动生成的噪声块完全一致。 */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cachedTile = null;
let cached = false;

/**
 * 取噪声块：`{ canvas, dataUrl, size }`。
 * 环境不支持 canvas（jsdom / 极端降级）时返回 `null` —— 调用方必须容错，
 * 颗粒是「锦上添花」的一层，缺了也不该让导出失败。
 */
export function getGrainTile() {
  if (cached) return cachedTile;
  cached = true;
  try {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = GRAIN_TILE_SIZE;
    canvas.height = GRAIN_TILE_SIZE;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || typeof ctx.createImageData !== 'function') return null;
    const image = ctx.createImageData(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE);
    const random = createRandom(0x9e3779b9);
    for (let i = 0; i < image.data.length; i += 4) {
      // 两个均匀分布相加再减 1：中间值多、极值少，接近真实银盐的团簇感
      const noise = (random() + random() - 1) * GRAIN_AMPLITUDE;
      const value = Math.round(128 + noise);
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch {
      dataUrl = '';
    }
    cachedTile = { canvas, dataUrl, size: GRAIN_TILE_SIZE };
    return cachedTile;
  } catch {
    cachedTile = null;
    return null;
  }
}

/**
 * 单颗颗粒的边长（像素）。
 * `scale` 是「以 1600 宽成片为基准的颗粒粗细」，导出与预览用同一个公式换算，
 * 所以手机上看预览时的颗粒感和最终成片一致。
 */
export function grainSpeckSize(scale, canvasWidth) {
  const safeScale = Math.max(0.2, Number(scale) || 1);
  const width = Math.max(1, Number(canvasWidth) || 1);
  return safeScale * (width / 1600);
}
