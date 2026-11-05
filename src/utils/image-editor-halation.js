/**
 * halation（高光泛光）的共享生成器 —— 预览与导出都调用这里。
 *
 * ── 为什么不用 `filter: blur()` 叠 screen ──────────────────────────────
 * 那是「整幅模糊后加亮」：暗部也被抬起来，结果画面发亮、发灰、掉饱和。
 * 实测 Kodak Gold 档：均值亮度 134 → 162，饱和度 0.54 → 0.38，观感是「蒙了
 * 一层雾」，正好和胶片该有的高饱和相反。
 *
 * 真实的 halation 只发生在**强光**上：光穿过乳剂层打到片基，再反射回乳剂层，
 * 于是亮部周围多出一圈红橙色的光。所以这里先按亮度做阈值，只保留高光，
 * 再染上泛光色并模糊 —— 亮部发光、暗部不动。
 *
 * ⚠️ 输出是一张**小图**（默认 360px 宽）。放大到画布尺寸时浏览器/canvas 的
 * 双线性插值本身就是最好的放大模糊，比在大图上做 blur 便宜一个数量级。
 */

/** 开始发光的亮度阈值（0~1，sRGB 亮度）。0.72 ≈ 只有接近白的地方才发光。 */
export const HALATION_THRESHOLD = 0.82;

/** 泛光图的工作宽度：够表现大光斑，又把 getImageData 的成本压到可忽略。 */
const GLOW_WIDTH = 360;

/** #rrggbb / #rgb → { r, g, b }（非法值返回 null，调用方跳过这一层）。 */
function parseHexColor(color) {
  const raw = String(color || '').trim();
  if (!raw.startsWith('#')) return null;
  const hex = raw.slice(1);
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

/**
 * 生成泛光位图。
 *
 * @param {CanvasImageSource & { width?:number, height?:number, naturalWidth?:number, naturalHeight?:number }} source
 * @param {{ color?: string, threshold?: number, blur?: number }} halation
 *        blur 是「画布宽度占比」（与 look.halation.blur 同一口径）
 * @param {{ cssFilter?: string }} [options]
 *        cssFilter：预览传入 look.css。导出时 source 已经是调色后的画布，
 *        这里补上同一条串，两边的「阈值前的亮度」才对得上。
 * @returns {HTMLCanvasElement|null} 取不到像素（jsdom / 跨域污染）时返回 null
 */
export function buildHalationGlow(source, halation = {}, options = {}) {
  if (!source) return null;
  const naturalWidth = Number(source.naturalWidth || source.width) || 0;
  const naturalHeight = Number(source.naturalHeight || source.height) || 0;
  if (!naturalWidth || !naturalHeight) return null;
  if (typeof document === 'undefined') return null;

  const width = Math.min(GLOW_WIDTH, naturalWidth);
  const height = Math.max(1, Math.round((naturalHeight / naturalWidth) * width));
  const threshold = Number(halation.threshold) || HALATION_THRESHOLD;
  const tint = parseHexColor(halation.color) || { r: 255, g: 120, b: 70 };

  const small = document.createElement('canvas');
  small.width = width;
  small.height = height;
  const smallCtx = small.getContext('2d', { willReadFrequently: true });
  if (!smallCtx) return null;

  let imageData;
  try {
    const cssFilter = String(options?.cssFilter || '').trim();
    if (cssFilter && cssFilter !== 'none') smallCtx.filter = cssFilter;
    smallCtx.drawImage(source, 0, 0, width, height);
    imageData = smallCtx.getImageData(0, 0, width, height);
  } catch {
    // 跨域图 / jsdom：没有像素就别假装有泛光
    return null;
  }

  const data = imageData.data;
  const span = Math.max(0.05, 1 - threshold);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    let weight = (luminance - threshold) / span;
    if (weight <= 0) {
      data[i + 3] = 0;
      continue;
    }
    // smoothstep：阈值边缘不留硬台阶，否则光斑边界是一圈锯齿
    weight = Math.min(1, weight);
    weight = weight * weight * (3 - 2 * weight);
    // 光晕偏染色（红橙），但保留一点原色，纯色光斑会假
    data[i] = Math.round(r * 0.3 + tint.r * 0.7);
    data[i + 1] = Math.round(g * 0.3 + tint.g * 0.7);
    data[i + 2] = Math.round(b * 0.3 + tint.b * 0.7);
    data[i + 3] = Math.round(255 * weight);
  }
  smallCtx.putImageData(imageData, 0, 0);

  // 模糊在小图坐标系里做，半径按比例换算，放大后自然继续扩散
  const radius = Math.max(1, (Number(halation.blur) || 0.012) * width);
  const glow = document.createElement('canvas');
  glow.width = width;
  glow.height = height;
  const glowCtx = glow.getContext('2d');
  if (!glowCtx) return null;
  try {
    glowCtx.filter = `blur(${radius.toFixed(2)}px)`;
  } catch {
    /* 不支持 ctx.filter 的环境：不模糊也能用，只是光斑硬一点 */
  }
  glowCtx.drawImage(small, 0, 0);
  return glow;
}
