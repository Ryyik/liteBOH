/**
 * 发帖图片编辑器的滤镜预设表（2026-11-05）。
 *
 * 预设数值取自 cc-gram（MIT，Copyright (c) 2019 - present Michael Wang，
 * https://github.com/EastSun5566/cc-gram），它本身是 CSSgram（Una Kravets）
 * 的 canvas 化版本。这里只搬「数值」，不引依赖：全部预设都是纯 CSS filter
 * 函数串，同一根字符串既给 `<img :style="filter">` 做实时预览，也给
 * `ctx.filter` 做导出合成 —— 预览与产物必然一致（这是选它而不是引一个
 * WebGL 滤镜库的唯一理由：编辑器已有 canvas 合成管线，不需要第二套渲染栈）。
 *
 * ⚠️ 只保留 9 档（原图 + 8 个风格）。手机上的横向 chip 条超过 10 档就开始
 * 靠滑，选滤镜反而变慢；cc-gram 的 40 档里另外那些是给桌面批量修图用的。
 * 新增/替换时务必在下方 PERMALINK 注释里写清是哪一支预设改的。
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

/**
 * 预设表。settings 的键与 CSS filter 函数同名（数值语义也一致）：
 * brightness/contrast/saturate/sepia/grayscale/invert 是倍数或 0~1，
 * hue-rotate 是角度，blur 是像素。
 *
 * 来源标注（cc-gram / CSSgram 原名）：
 *  · vivid    ← clarendon
 *  · soft     ← stinson
 *  · warm     ← reyes
 *  · cool     ← 自建（cc-gram 无冷调预设，按 hue-rotate 正向 + 降饱和收）
 *  · mono     ← moon
 *  · film     ← 1977
 *  · retro    ← sutro
 *  · fade     ← willow
 */
export const IMAGE_EDITOR_FILTERS = [
  { id: 'none', label: '原图', swatch: 'linear-gradient(135deg,#d8d8dd,#f4f4f6)', settings: {} },
  {
    id: 'vivid',
    label: '鲜明',
    swatch: 'linear-gradient(135deg,#ff8a5c,#ffd166)',
    settings: { contrast: 1.2, saturate: 1.35 },
  },
  {
    id: 'soft',
    label: '柔和',
    swatch: 'linear-gradient(135deg,#ffe3c8,#f7c6b8)',
    settings: { contrast: 0.75, brightness: 1.15, saturate: 0.85 },
  },
  {
    id: 'warm',
    label: '暖阳',
    swatch: 'linear-gradient(135deg,#ffb26b,#e08a5a)',
    settings: { sepia: 0.22, contrast: 0.85, brightness: 1.1, saturate: 0.75 },
  },
  {
    id: 'cool',
    label: '冷调',
    swatch: 'linear-gradient(135deg,#8fb8e0,#bcd8f0)',
    settings: { 'hue-rotate': 14, saturate: 0.95, brightness: 1.04 },
  },
  {
    id: 'mono',
    label: '黑白',
    swatch: 'linear-gradient(135deg,#5c5c60,#c9c9ce)',
    settings: { grayscale: 1, brightness: 1.1, contrast: 1.1 },
  },
  {
    id: 'film',
    label: '胶片',
    swatch: 'linear-gradient(135deg,#c98b62,#6b7a5a)',
    settings: { contrast: 1.1, brightness: 1.1, saturate: 1.3 },
  },
  {
    id: 'retro',
    label: '复古',
    swatch: 'linear-gradient(135deg,#a8763f,#4d3b2a)',
    settings: { brightness: 0.75, contrast: 1.3, sepia: 0.5, 'hue-rotate': -25 },
  },
  {
    id: 'fade',
    label: '褪色',
    swatch: 'linear-gradient(135deg,#cfd3cd,#f0ece4)',
    settings: { contrast: 0.95, brightness: 0.9, grayscale: 0.5 },
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
    if (name === 'grayscale' && value <= 0) continue;
    parts.push(`${name}(${value}${CSS_UNITS[name] || ''})`);
  }
  // 抵消项（如 grayscale: 0）不输出，全空即原图
  return parts.length ? parts.join(' ') : 'none';
}

/** 预设 id → CSS filter 串（UI 的 chip 预览与导出共用这一条）。 */
export function getEditorFilterString(id = 'none') {
  return buildFilterString(getEditorFilter(id).settings);
}
