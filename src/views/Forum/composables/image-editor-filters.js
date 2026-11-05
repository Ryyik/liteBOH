/**
 * 发帖图片编辑器的滤镜预设表 —— v2「胶片模拟」（2026-11-05 重做）。
 *
 * ── 为什么推翻 v1 ────────────────────────────────────────────────────────
 * v1 是 9 根 CSS filter 串（对比度/饱和度/棕褐），本质是「调色」。用户对照
 * Dazz Cam / 飓风相机 / Lumi400 这类胶片机 App 后反馈「太普通」—— 那些 App 的
 * 观感并不来自调色，而来自**介质本身的不完美**：
 *   · 非均匀颗粒（暗部结块、亮部分散，不是整幅同一层噪点）
 *   · halation（强光在片基上反射出的红橙色光晕）
 *   · 提升的黑场（胶片黑是发灰的，不是 0）
 *   · 暗角（镜头边缘失光）
 *   · 漏光（后背不严，整幅被染一层暖色）
 *   · 按胶卷实测的色偏（Portra 偏暖肤色、Superia 青绿阴影、Velvia 深蓝）
 * 所以 v2 把一档滤镜拆成「调色 + 若干物理层」，两层都要在预览和导出里同时成立。
 *
 * ── 分层数据的字段含义 ──────────────────────────────────────────────────
 * grade      基础调色（CSS filter 函数表，预览与导出共用同一根串）
 * lift       提升黑场 0~0.25（白场百分比，lighten 混合）
 * shadow     阴影染色 { color, opacity, blend } —— screen 混合下暗部受影响最大
 * highlight  高光染色 { color, opacity, blend }
 * halation   { color, opacity, blur } —— blur 是「画布宽度的占比」，不写像素
 * grain      { opacity, scale } —— scale 是单颗颗粒在 1600 宽成片上的边长
 * vignette   0~1（multiply 的暗角强度）
 * leak       { color, x, y, radius, opacity } —— x/y/radius 都是归一化值
 *
 * ── 强度 ────────────────────────────────────────────────────────────────
 * 每档都支持 0~100% 强度：调色按「恒等值 → 目标值」线性插值，物理层按 opacity
 * 缩放。强度 0 等于原图（这里是唯一一处「强度 0 必须严格等于原图」的保证，
 * 否则滑块拖到底还会剩一层颗粒，用户会以为坏了）。
 *
 * 数值来源：调色基线参考 cc-gram（MIT，Copyright (c) 2019 - present Michael Wang，
 * https://github.com/EastSun5566/cc-gram，CSSgram 的 canvas 版），物理层参数按
 * 各胶卷的公开特性手工标定（Kodak Portra 400 / Fuji Superia 400 / Velvia 50 /
 * Ilford HP5 Plus / CineStill 800T）。
 */

/** CSS filter 函数的输出顺序（固定顺序，便于单测逐字比对）。 */
const FILTER_FUNCTION_ORDER = [
  'blur',
  'brightness',
  'contrast',
  'grayscale',
  'hue-rotate',
  'invert',
  'saturate',
  'sepia',
];

/** 需要带单位的函数。 */
const CSS_UNITS = { blur: 'px', 'hue-rotate': 'deg' };

/** 各 CSS filter 函数的「不改变画面」值 —— 强度插值的起点。 */
const FILTER_IDENTITY = {
  blur: 0,
  brightness: 1,
  contrast: 1,
  grayscale: 0,
  'hue-rotate': 0,
  invert: 0,
  saturate: 1,
  sepia: 0,
};

/** 无任何物理层的空 look（原图 / 降级时的兜底，调用方不必逐层判空）。 */
const EMPTY_LAYERS = {
  lift: 0,
  cast: { color: 'transparent', opacity: 0, blend: 'soft-light' },
  shadow: { color: 'transparent', opacity: 0, blend: 'screen' },
  highlight: { color: 'transparent', opacity: 0, blend: 'soft-light' },
  halation: { color: 'transparent', opacity: 0, blur: 0 },
  grain: { opacity: 0, scale: 3 },
  vignette: 0,
  leak: { color: 'transparent', x: 0.5, y: 0.5, radius: 0.6, opacity: 0 },
};

/**
 * 预设表。`grade` 的键与 CSS filter 函数同名（数值语义也一致）。
 * 10 档 + 原图：再多样例会让 chip 条变成「必须滑才能选完」，而手机横向滑动
 * 的手感成本明显高于桌面。
 */
export const IMAGE_EDITOR_FILTERS = [
  {
    id: 'none',
    label: '原图',
    swatch: 'linear-gradient(135deg,#d8d8dd,#f4f4f6)',
    grade: {},
  },
  {
    // Kodak Portra 400：肤色准、对比柔和、暗部略偏青、高光偏奶黄
    id: 'portra',
    label: '负片',
    swatch: 'linear-gradient(135deg,#f0c9a4,#7d8f96)',
    grade: { brightness: 1.04, contrast: 1.03, saturate: 0.92, sepia: 0.06 },
    cast: { color: '#ffd9b0', opacity: 0.18, blend: 'soft-light' },
    lift: 0.03,
    shadow: { color: '#2a4a63', opacity: 0.1, blend: 'screen' },
    highlight: { color: '#ffd9b0', opacity: 0.14, blend: 'soft-light' },
    halation: { color: '#ff9a6b', opacity: 0.12, blur: 0.012 },
    grain: { opacity: 0.14, scale: 3 },
    vignette: 0.1,
  },
  {
    // Fuji Superia 400：青绿阴影、肤色略红、日常感强（「日本街拍」那一挂）
    id: 'superia',
    label: '日光',
    swatch: 'linear-gradient(135deg,#9fd6c2,#f2e6c8)',
    grade: { brightness: 1.02, contrast: 1.08, saturate: 1.06 },
    cast: { color: '#12a07a', opacity: 0.24, blend: 'soft-light' },
    lift: 0.02,
    shadow: { color: '#14705c', opacity: 0.13, blend: 'screen' },
    highlight: { color: '#f3ffdc', opacity: 0.08, blend: 'soft-light' },
    halation: { color: '#e8fff0', opacity: 0.08, blur: 0.01 },
    grain: { opacity: 0.16, scale: 3.2 },
    vignette: 0.14,
  },
  {
    // Fuji Velvia 50：反转片，极高饱和、深蓝、几乎无颗粒
    id: 'velvia',
    label: '反转',
    swatch: 'linear-gradient(135deg,#1d4f8c,#e0453c)',
    grade: { brightness: 0.98, contrast: 1.3, saturate: 1.42 },
    cast: { color: '#0d3a6b', opacity: 0.3, blend: 'soft-light' },
    shadow: { color: '#0e3a6e', opacity: 0.14, blend: 'screen' },
    highlight: { color: '#fff1e0', opacity: 0.06, blend: 'soft-light' },
    halation: { color: '#ffd0b0', opacity: 0.06, blur: 0.008 },
    grain: { opacity: 0.06, scale: 2 },
    vignette: 0.18,
  },
  {
    // Ilford HP5 Plus：冷调阴影 + 暖高光的硒调，颗粒粗
    id: 'mono',
    label: '黑白',
    swatch: 'linear-gradient(135deg,#3a3f4a,#e8e2d6)',
    grade: { brightness: 1.03, contrast: 1.16, grayscale: 1 },
    lift: 0.05,
    shadow: { color: '#3a3f4a', opacity: 0.1, blend: 'screen' },
    highlight: { color: '#fff3e2', opacity: 0.1, blend: 'soft-light' },
    halation: { color: '#ffffff', opacity: 0.1, blur: 0.012 },
    grain: { opacity: 0.3, scale: 4.2 },
    vignette: 0.22,
  },
  {
    // 一次性相机：闪光灯直打 + 重度暗角 + 边缘漏光
    id: 'disposable',
    label: '傻瓜机',
    swatch: 'linear-gradient(135deg,#ffb347,#2b3550)',
    grade: { brightness: 1.06, contrast: 1.06, saturate: 1.14 },
    cast: { color: '#ffb066', opacity: 0.24, blend: 'soft-light' },
    lift: 0.02,
    shadow: { color: '#12203a', opacity: 0.14, blend: 'screen' },
    highlight: { color: '#ffe6c2', opacity: 0.12, blend: 'soft-light' },
    halation: { color: '#ff7a3d', opacity: 0.26, blur: 0.018 },
    grain: { opacity: 0.24, scale: 4.6 },
    vignette: 0.38,
    leak: { color: '#ff8a2b', x: 0.88, y: 0.06, radius: 0.62, opacity: 0.22 },
  },
  {
    // 千禧年 CCD：青橙分离、高光容易溢出（那代小底机器的宽容度就是这样）
    id: 'ccd',
    label: 'CCD',
    swatch: 'linear-gradient(135deg,#0b5f7d,#ffdca8)',
    grade: { brightness: 1.05, contrast: 1.14, saturate: 1.12 },
    cast: { color: '#0b5f7d', opacity: 0.34, blend: 'soft-light' },
    lift: 0.02,
    shadow: { color: '#0b5f7d', opacity: 0.16, blend: 'screen' },
    highlight: { color: '#ffdca8', opacity: 0.12, blend: 'soft-light' },
    halation: { color: '#ff6a3d', opacity: 0.3, blur: 0.02 },
    grain: { opacity: 0.08, scale: 2.4 },
    vignette: 0.12,
  },
  {
    // CineStill 800T：灯光片在日光下偏蓝，强到夸张的红色 halation
    id: 'tungsten',
    label: '钨丝夜',
    swatch: 'linear-gradient(135deg,#16327e,#ff4a1e)',
    grade: { brightness: 0.97, contrast: 1.12, saturate: 1.08, 'hue-rotate': 14 },
    // 灯光片在日光下的蓝偏必须走整体染色：screen 只抬暗部，暖色天空照样是暖的
    cast: { color: '#17418f', opacity: 0.62, blend: 'soft-light' },
    lift: 0.04,
    shadow: { color: '#16327e', opacity: 0.24, blend: 'screen' },
    highlight: { color: '#ffe0c0', opacity: 0.08, blend: 'soft-light' },
    halation: { color: '#ff4a1e', opacity: 0.48, blur: 0.026 },
    grain: { opacity: 0.28, scale: 4.4 },
    vignette: 0.3,
  },
  {
    // 70 年代老照片：黑场大幅抬升、饱和塌陷、暖黄、粗颗粒
    id: 'faded',
    label: '老照片',
    swatch: 'linear-gradient(135deg,#c9ae86,#efe3cd)',
    grade: { brightness: 1.07, contrast: 0.92, saturate: 0.62, sepia: 0.32 },
    cast: { color: '#d8b78a', opacity: 0.34, blend: 'soft-light' },
    lift: 0.1,
    shadow: { color: '#6b5844', opacity: 0.12, blend: 'screen' },
    highlight: { color: '#fff2d8', opacity: 0.16, blend: 'soft-light' },
    halation: { color: '#ffcf9a', opacity: 0.1, blur: 0.016 },
    grain: { opacity: 0.2, scale: 5 },
    vignette: 0.28,
  },
  {
    // Kodak Gold 200：蜜黄色调、暗部偏暖、颗粒明显（消费卷的"胶片味"主要来自它）
    id: 'gold',
    label: 'Gold',
    swatch: 'linear-gradient(135deg,#f7c96b,#8a5a2b)',
    grade: { brightness: 1.05, contrast: 0.98, saturate: 1.05, sepia: 0.1 },
    cast: { color: '#f5c96b', opacity: 0.3, blend: 'soft-light' },
    lift: 0.02,
    shadow: { color: '#7a4a1f', opacity: 0.1, blend: 'screen' },
    highlight: { color: '#fff0c2', opacity: 0.14, blend: 'soft-light' },
    halation: { color: '#ffb347', opacity: 0.14, blur: 0.012 },
    grain: { opacity: 0.26, scale: 3.8 },
    vignette: 0.14,
  },
  {
    // Kodak Ektar 100：极细颗粒 + 极高饱和，红蓝很"顶"，肤色容易偏粉
    id: 'ektar',
    label: 'Ektar',
    swatch: 'linear-gradient(135deg,#1d5fa0,#d63a3a)',
    grade: { brightness: 1.0, contrast: 1.22, saturate: 1.36 },
    cast: { color: '#0f4f8f', opacity: 0.22, blend: 'soft-light' },
    shadow: { color: '#123a6a', opacity: 0.12, blend: 'screen' },
    highlight: { color: '#ffe0cc', opacity: 0.08, blend: 'soft-light' },
    halation: { color: '#ff6a4a', opacity: 0.1, blur: 0.008 },
    grain: { opacity: 0.06, scale: 1.8 },
    vignette: 0.12,
  },
  {
    // Fuji Pro 400H：柔和淡彩、青绿阴影、通透（婚礼片那一挂）
    id: 'pro400h',
    label: '400H',
    swatch: 'linear-gradient(135deg,#c9ecdc,#f6f4ea)',
    grade: { brightness: 1.1, contrast: 0.94, saturate: 0.86 },
    cast: { color: '#bfe6d8', opacity: 0.3, blend: 'soft-light' },
    lift: 0.05,
    shadow: { color: '#3f7f6a', opacity: 0.14, blend: 'screen' },
    highlight: { color: '#f2fff8', opacity: 0.16, blend: 'soft-light' },
    halation: { color: '#e8fff4', opacity: 0.1, blur: 0.014 },
    grain: { opacity: 0.1, scale: 2.6 },
    vignette: 0.08,
  },
  {
    // Fuji Provia 100F：所见即所得的反转片，中等反差、颗粒极细
    id: 'provia',
    label: 'Provia',
    swatch: 'linear-gradient(135deg,#2c6ea8,#e8eef2)',
    grade: { brightness: 1.01, contrast: 1.14, saturate: 1.12 },
    cast: { color: '#1b5a8a', opacity: 0.16, blend: 'soft-light' },
    shadow: { color: '#14425f', opacity: 0.08, blend: 'screen' },
    highlight: { color: '#fff4e6', opacity: 0.06, blend: 'soft-light' },
    halation: { color: '#ffd9b8', opacity: 0.06, blur: 0.008 },
    grain: { opacity: 0.05, scale: 1.8 },
    vignette: 0.1,
  },
  {
    // Agfa Vista 400：饱和、暖底、整体偏洋红，混合光/霓虹下最有味道
    id: 'vista',
    label: 'Vista',
    swatch: 'linear-gradient(135deg,#ff7fb0,#6a2f6b)',
    grade: { brightness: 1.03, contrast: 1.12, saturate: 1.24 },
    cast: { color: '#ff7fb0', opacity: 0.26, blend: 'soft-light' },
    shadow: { color: '#5a1f4a', opacity: 0.12, blend: 'screen' },
    highlight: { color: '#ffe3c8', opacity: 0.1, blend: 'soft-light' },
    halation: { color: '#ff5c8a', opacity: 0.18, blur: 0.014 },
    grain: { opacity: 0.28, scale: 4 },
    vignette: 0.2,
  },
];

/** id → 预设（渲染与 UI 都从这里取，别各建一份 Map）。 */
export const IMAGE_EDITOR_FILTER_MAP = new Map(
  IMAGE_EDITOR_FILTERS.map((preset) => [preset.id, preset]),
);

/** 按 id 取预设；未知 id 归「原图」（脏数据不该把画面变成黑块）。 */
export function getEditorFilter(id = 'none') {
  return IMAGE_EDITOR_FILTER_MAP.get(String(id || 'none')) || IMAGE_EDITOR_FILTER_MAP.get('none');
}

/** 把 0~1 之外的值夹回来；非法值按上限算（滑块的 NaN 不该把画面清零）。 */
function clampStrength(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(1, Math.max(0, num));
}

/**
 * 把 settings 拼成 CSS filter 串。空设置返回 `'none'` ——
 * `ctx.filter = 'none'` 是合法值，而空字符串在部分浏览器里会被当成非法值忽略。
 */
export function buildFilterString(settings = {}) {
  if (!settings || typeof settings !== 'object') return 'none';
  const parts = [];
  for (const name of FILTER_FUNCTION_ORDER) {
    const raw = settings[name];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    // 恒等值不输出：constrast(1)/brightness(1) 是空操作，留着只会让
    // 「强度 0」拼出 'contrast(1) saturate(1)' 这种看着不像原图的串
    if (value === FILTER_IDENTITY[name]) continue;
    if (name === 'grayscale' && value <= 0) continue;
    parts.push(`${name}(${value}${CSS_UNITS[name] || ''})`);
  }
  // 抵消项（如 grayscale: 0）不输出，全空即原图
  return parts.length ? parts.join(' ') : 'none';
}

/** 强度插值：每项从「恒等值」线性走向目标值。 */
function interpolateGrade(grade = {}, strength = 1) {
  const result = {};
  for (const name of FILTER_FUNCTION_ORDER) {
    const raw = grade[name];
    if (raw === undefined || raw === null || raw === '') continue;
    const target = Number(raw);
    if (!Number.isFinite(target)) continue;
    const start = FILTER_IDENTITY[name];
    const value = start + (target - start) * strength;
    // 浮点噪声会让 1.0000000001 出现在串里，统一收敛到 4 位
    const rounded = Math.round(value * 10000) / 10000;
    if (name === 'grayscale' && rounded <= 0.0001) continue;
    result[name] = rounded;
  }
  return result;
}

/**
 * 把预设 id + 强度解析成一份「渲染用」的完整 look。
 * 预览（CSS 分层）与导出（canvas 分层）都吃这一份，两边的数值必须同源。
 */
export function resolveFilterLook(id = 'none', strength = 1) {
  const preset = getEditorFilter(id);
  const ratio = clampStrength(strength);
  const grade = interpolateGrade(preset.grade, ratio);
  const scale = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return num * ratio;
  };
  const layer = (source, extraKeys = []) => {
    const base = source && typeof source === 'object' ? source : {};
    const result = { ...base, opacity: scale(base.opacity) };
    for (const key of extraKeys) result[key] = scale(base[key]);
    return result;
  };
  return {
    id: preset.id,
    label: preset.label,
    strength: ratio,
    css: buildFilterString(grade),
    lift: scale(preset.lift),
    cast: { ...EMPTY_LAYERS.cast, ...layer(preset.cast) },
    shadow: { ...EMPTY_LAYERS.shadow, ...layer(preset.shadow) },
    highlight: { ...EMPTY_LAYERS.highlight, ...layer(preset.highlight) },
    halation: { ...EMPTY_LAYERS.halation, ...layer(preset.halation, ['blur']) },
    grain: {
      ...EMPTY_LAYERS.grain,
      ...layer(preset.grain),
      scale: Number(preset.grain?.scale) || 3,
    },
    vignette: scale(preset.vignette),
    leak: {
      ...EMPTY_LAYERS.leak,
      ...layer(preset.leak),
      x: Number(preset.leak?.x ?? EMPTY_LAYERS.leak.x),
      y: Number(preset.leak?.y ?? EMPTY_LAYERS.leak.y),
      radius: Number(preset.leak?.radius ?? EMPTY_LAYERS.leak.radius),
    },
  };
}

/** 预设 id + 强度 → CSS filter 串（UI 的 chip 预览与导出共用这一条）。 */
export function getEditorFilterString(id = 'none', strength = 1) {
  return resolveFilterLook(id, strength).css;
}

/** 空 look（原图）—— 模板里当常量用，避免每次新建对象。 */
export const EMPTY_FILTER_LOOK = resolveFilterLook('none', 1);
