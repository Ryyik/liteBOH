/**
 * 发帖图片编辑器的滤镜预设表 —— v3「胶片模拟 + 可调参数」（2026-11-05 重做）。
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
 * 所以每一档都是「调色 + 若干物理层」，两层都要在预览和导出里同时成立。
 *
 * ── 分层数据的字段含义 ──────────────────────────────────────────────────
 * grade      基础调色（CSS filter 函数表，预览与导出共用同一根串）
 * cast       整体染色 { color, opacity, blend } —— 胶卷底色，overlay 叠整幅
 * lift       提升黑场 0~0.25（白场百分比，lighten 混合）
 * shadow     阴影染色 { color, opacity, blend } —— multiply，压暗并偏色
 * highlight  高光染色 { color, opacity, blend }
 * halation   { color, opacity, blur } —— blur 是「画布宽度的占比」，不写像素
 * grain      { opacity, scale } —— scale 是单颗颗粒在 1600 宽成片上的边长
 * vignette   0~1（multiply 的暗角强度）
 * leak       { color, x, y, radius, opacity } —— x/y/radius 都是归一化值
 *
 * ── 混合模式是最容易做错的一环（实测） ──────────────────────────────────
 * cast 若用 soft-light：亮色只会「提亮 + 轻微偏色」，成片像蒙了一层雾
 * （Kodak Gold 实测亮度 134→155、饱和度 0.54→0.37）。必须用 overlay 才真的改色相。
 * shadow 若用 screen：暗部被抬亮，画面发灰；胶片暗部是「被染料压暗并偏色」⇒ multiply。
 * highlight 的 soft-light 提亮很猛，不透明度要压在 0.05~0.11 之间。
 *
 * ── 强度与微调 ──────────────────────────────────────────────────────────
 * strength（0~1）整体缩放：调色按「恒等值 → 目标值」插值、物理层按 opacity 缩放，
 * 强度 0 严格等于原图。
 * tune（每项 0~2 的倍率）只作用于对应物理层，给用户「这卷胶片的颗粒/暗角再重一点」
 * 的余地 —— 颗粒、暗角、泛光、染色、褪色五项（见 TUNE_SLIDERS）。
 *
 * 数值来源：调色基线参考 cc-gram（MIT，Copyright (c) 2019 - present Michael Wang，
 * https://github.com/EastSun5566/cc-gram，CSSgram 的 canvas 版），物理层参数按
 * 各胶卷的公开特性手工标定（Kodak Portra 400 / Gold 200 / Ektar 100 /
 * Fuji Superia 400 / Velvia 50 / Pro 400H / Provia 100F / Ilford HP5 Plus /
 * Agfa Vista 400）。
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
  cast: { color: 'transparent', opacity: 0, blend: 'overlay' },
  shadow: { color: 'transparent', opacity: 0, blend: 'multiply' },
  highlight: { color: 'transparent', opacity: 0, blend: 'soft-light' },
  halation: { color: 'transparent', opacity: 0, blur: 0 },
  grain: { opacity: 0, scale: 3 },
  vignette: 0,
  leak: { color: 'transparent', x: 0.5, y: 0.5, radius: 0.6, opacity: 0 },
};

/**
 * 微调项：key 对应 look 里的物理层，label 给 UI，max 是倍率上限。
 * 上限不是 2 而是分项给的 —— 暗角翻倍就黑了，褪色翻倍会整幅发白。
 */
export const TUNE_SLIDERS = [
  { key: 'grain', label: '颗粒', max: 2 },
  { key: 'vignette', label: '暗角', max: 2 },
  { key: 'halation', label: '泛光', max: 2 },
  { key: 'cast', label: '染色', max: 2 },
  { key: 'lift', label: '褪色', max: 2 },
];

/** 各层缩放后的安全上限（超出就不是「胶片」而是坏了）。 */
const TUNE_LIMITS = {
  grain: 1,
  vignette: 0.92,
  halation: 1,
  cast: 1,
  lift: 0.22,
};

/**
 * 预设表。`grade` 的键与 CSS filter 函数同名（数值语义也一致）。
 * 15 档 + 原图：再多样例会让 chip 条变成「必须滑才能选完」，而手机横向滑动
 * 的手感成本明显高于桌面。16 档是当前上限，再加就要考虑分组了。
 *
 * 顺序（2026-11-05 用户口径，11-06 插入 INS）：
 * 原图 → CCD → INS → 品牌胶卷（Gold/Ektar/400H/Provia/Vista）
 * → 通用风格（负片/日光/反转/黑白/傻瓜机）→ 场景档（夜景/室内/空气感）。
 * 「最后几个胶卷模拟」原本排在末尾，用户要求提到前面；CCD 是热门风格，紧随原图。
 * INS 跟 CCD 相邻：两者都是「数码/社交」热门风格，不是某一卷胶片。
 * 场景档放末尾：它们不是"某一卷胶片"，而是"某个拍摄场景"的解法，
 * 混进品牌序列会让"我在挑胶卷"这件事失去意义。
 * ⚠️ 这个数组同时是发帖图片编辑器的 chip 顺序 —— 改顺序会影响两处，这是有意的单一真源。
 */
export const IMAGE_EDITOR_FILTERS = [
  {
    id: 'none',
    label: '原图',
    swatch: 'linear-gradient(135deg,#d8d8dd,#f4f4f6)',
    grade: {},
  },
  {
    // 千禧年 CCD：青橙分离、高光容易溢出（那代小底机器的宽容度就是这样）
    id: 'ccd',
    label: 'CCD',
    swatch: 'linear-gradient(135deg,#0b5f7d,#ffdca8)',
    grade: { brightness: 1.04, contrast: 1.2, saturate: 1.2 },
    cast: { color: '#12668c', opacity: 0.34, blend: 'overlay' },
    lift: 0.02,
    shadow: { color: '#0b5f7d', opacity: 0.22, blend: 'multiply' },
    highlight: { color: '#ffdca8', opacity: 0.09, blend: 'soft-light' },
    halation: { color: '#ff6a3d', opacity: 0.2, blur: 0.022 },
    grain: { opacity: 0.1, scale: 2.4 },
    vignette: 0.16,
  },
  {
    // INS 风：降饱和 + 提对比，冷灰调、几乎无颗粒与暗角。
    // 对应 Instagram 的 Ludwig 那一类（"slightly desaturates colours while
    // increasing contrast"），不是 Clarendon（那个是提饱和 + 冷高光）。
    // 与胶片档的分界线在「干净」：胶片靠颗粒和暗角立住风格，INS 一有这两样就脏，
    // 所以 grain / vignette 压到全表最低。
    id: 'ins',
    label: 'INS',
    swatch: 'linear-gradient(135deg,#c6d2dc,#f2f0eb)',
    grade: { brightness: 1.03, contrast: 1.16, saturate: 0.82 },
    // 冷灰只铺很薄一层：太重会从「干净的灰」变成「阴天发闷」
    cast: { color: '#c8d4de', opacity: 0.12, blend: 'overlay' },
    lift: 0.028,
    shadow: { color: '#4a5761', opacity: 0.1, blend: 'multiply' },
    highlight: { color: '#ffffff', opacity: 0.05, blend: 'soft-light' },
    // 泛光也几乎不要：光晕是胶片特征，会立刻破坏「干净」
    halation: { color: '#ffffff', opacity: 0.04, blur: 0.01 },
    grain: { opacity: 0.04, scale: 2 },
    vignette: 0.03,
  },
  {
    // Kodak Gold 200：蜜黄色调、暗部偏暖、颗粒明显（消费卷的"胶片味"主要来自它）
    id: 'gold',
    label: 'Gold',
    swatch: 'linear-gradient(135deg,#f7c96b,#8a5a2b)',
    grade: { brightness: 1.04, contrast: 1.04, saturate: 1.08, sepia: 0.12 },
    cast: { color: '#f2c274', opacity: 0.34, blend: 'overlay' },
    lift: 0.02,
    shadow: { color: '#7a4a1f', opacity: 0.16, blend: 'multiply' },
    highlight: { color: '#fff0c2', opacity: 0.1, blend: 'soft-light' },
    halation: { color: '#ffb347', opacity: 0.16, blur: 0.014 },
    grain: { opacity: 0.34, scale: 3.8 },
    vignette: 0.2,
  },
  {
    // Kodak Ektar 100：极细颗粒 + 极高饱和，红蓝很"顶"，肤色容易偏粉
    id: 'ektar',
    label: 'Ektar',
    swatch: 'linear-gradient(135deg,#1d5fa0,#d63a3a)',
    grade: { brightness: 1.0, contrast: 1.28, saturate: 1.46 },
    cast: { color: '#0d4a8c', opacity: 0.32, blend: 'overlay' },
    shadow: { color: '#123a6a', opacity: 0.2, blend: 'multiply' },
    highlight: { color: '#ffe0cc', opacity: 0.06, blend: 'soft-light' },
    halation: { color: '#ff6a4a', opacity: 0.1, blur: 0.008 },
    grain: { opacity: 0.08, scale: 1.8 },
    vignette: 0.16,
  },
  {
    // Fuji Pro 400H：柔和淡彩、青绿阴影、通透（婚礼片那一挂）
    id: 'pro400h',
    label: '400H',
    swatch: 'linear-gradient(135deg,#c9ecdc,#f6f4ea)',
    grade: { brightness: 1.06, contrast: 1.02, saturate: 0.94 },
    cast: { color: '#b6e6d4', opacity: 0.38, blend: 'overlay' },
    lift: 0.035,
    shadow: { color: '#3f7f6a', opacity: 0.2, blend: 'multiply' },
    highlight: { color: '#f2fff8', opacity: 0.11, blend: 'soft-light' },
    halation: { color: '#e8fff4', opacity: 0.1, blur: 0.016 },
    grain: { opacity: 0.16, scale: 2.6 },
    vignette: 0.12,
  },
  {
    // Fuji Provia 100F：所见即所得的反转片，中等反差、颗粒极细
    id: 'provia',
    label: 'Provia',
    swatch: 'linear-gradient(135deg,#2c6ea8,#e8eef2)',
    grade: { brightness: 1.01, contrast: 1.18, saturate: 1.16 },
    cast: { color: '#1a5788', opacity: 0.26, blend: 'overlay' },
    shadow: { color: '#14425f', opacity: 0.14, blend: 'multiply' },
    highlight: { color: '#fff4e6', opacity: 0.05, blend: 'soft-light' },
    halation: { color: '#ffd9b8', opacity: 0.1, blur: 0.008 },
    grain: { opacity: 0.07, scale: 1.8 },
    vignette: 0.14,
  },
  {
    // Agfa Vista 400：饱和、暖底、整体偏洋红，混合光/霓虹下最有味道
    id: 'vista',
    label: 'Vista',
    swatch: 'linear-gradient(135deg,#ff7fb0,#6a2f6b)',
    grade: { brightness: 1.02, contrast: 1.16, saturate: 1.3 },
    cast: { color: '#e6bcc6', opacity: 0.24, blend: 'overlay' },
    shadow: { color: '#5a1f4a', opacity: 0.18, blend: 'multiply' },
    highlight: { color: '#ffe3c8', opacity: 0.08, blend: 'soft-light' },
    halation: { color: '#ff5c8a', opacity: 0.14, blur: 0.016 },
    grain: { opacity: 0.34, scale: 4 },
    vignette: 0.26,
  },
  {
    // Kodak Portra 400：肤色准、对比柔和、暗部略偏青、高光偏奶黄
    id: 'portra',
    label: '负片',
    swatch: 'linear-gradient(135deg,#f0c9a4,#7d8f96)',
    grade: { brightness: 1.03, contrast: 1.08, saturate: 0.94, sepia: 0.08 },
    cast: { color: '#ffd0a0', opacity: 0.3, blend: 'overlay' },
    lift: 0.035,
    shadow: { color: '#2a4a63', opacity: 0.14, blend: 'multiply' },
    highlight: { color: '#ffd9b0', opacity: 0.1, blend: 'soft-light' },
    halation: { color: '#ff8a5c', opacity: 0.14, blur: 0.014 },
    grain: { opacity: 0.22, scale: 3.2 },
    vignette: 0.16,
  },
  {
    // Fuji Superia 400：青绿阴影、肤色略红、日常感强（「日本街拍」那一挂）
    id: 'superia',
    label: '日光',
    swatch: 'linear-gradient(135deg,#9fd6c2,#f2e6c8)',
    grade: { brightness: 1.02, contrast: 1.12, saturate: 1.1 },
    cast: { color: '#0f9c78', opacity: 0.36, blend: 'overlay' },
    lift: 0.025,
    shadow: { color: '#14705c', opacity: 0.18, blend: 'multiply' },
    highlight: { color: '#f3ffdc', opacity: 0.06, blend: 'soft-light' },
    halation: { color: '#e8fff0', opacity: 0.1, blur: 0.012 },
    grain: { opacity: 0.24, scale: 3.2 },
    vignette: 0.2,
  },
  {
    // Fuji Velvia 50：反转片，极高饱和、深蓝、几乎无颗粒
    id: 'velvia',
    label: '反转',
    swatch: 'linear-gradient(135deg,#1d4f8c,#e0453c)',
    grade: { brightness: 0.97, contrast: 1.36, saturate: 1.52 },
    cast: { color: '#0b3b74', opacity: 0.42, blend: 'overlay' },
    shadow: { color: '#0e3a6e', opacity: 0.22, blend: 'multiply' },
    highlight: { color: '#fff1e0', opacity: 0.05, blend: 'soft-light' },
    halation: { color: '#ffd0b0', opacity: 0.1, blur: 0.01 },
    grain: { opacity: 0.08, scale: 2 },
    vignette: 0.22,
  },
  {
    // Ilford HP5 Plus：冷调阴影 + 暖高光的硒调，颗粒粗
    id: 'mono',
    label: '黑白',
    swatch: 'linear-gradient(135deg,#3a3f4a,#e8e2d6)',
    grade: { brightness: 1.02, contrast: 1.24, grayscale: 1 },
    lift: 0.05,
    cast: { color: '#b9c2cc', opacity: 0.16, blend: 'overlay' },
    shadow: { color: '#2f3540', opacity: 0.16, blend: 'multiply' },
    highlight: { color: '#fff3e2', opacity: 0.08, blend: 'soft-light' },
    halation: { color: '#ffffff', opacity: 0.12, blur: 0.014 },
    grain: { opacity: 0.36, scale: 4.2 },
    vignette: 0.28,
  },
  {
    // 一次性相机：闪光灯直打 + 重度暗角 + 角落漏光
    id: 'disposable',
    label: '傻瓜机',
    swatch: 'linear-gradient(135deg,#ffb347,#2b3550)',
    grade: { brightness: 1.05, contrast: 1.12, saturate: 1.18 },
    // 高饱和暖色 overlay 打在饱和蓝上会转紫，所以这里用「降饱和的暖底」
    cast: { color: '#f2d0ad', opacity: 0.26, blend: 'overlay' },
    lift: 0.02,
    shadow: { color: '#12203a', opacity: 0.2, blend: 'multiply' },
    highlight: { color: '#ffe6c2', opacity: 0.09, blend: 'soft-light' },
    halation: { color: '#ff7a3d', opacity: 0.14, blur: 0.02 },
    grain: { opacity: 0.3, scale: 4.6 },
    vignette: 0.46,
    // 漏光是「角落一抹」，不是半幅染色：radius 0.62 会盖住整片天空，screen 上去就是粉紫
    leak: { color: '#ff8a2b', x: 0.9, y: 0.04, radius: 0.34, opacity: 0.24 },
  },
  /* ── 场景档（2026-11-05）：前 12 档是「胶卷/风格」，这三档按拍摄场景调 ──
   * 夜景与室内是现有 11 档都不擅长的两块：
   *  · 夜景：Gold/Vista 在暗光下会把灯光糊成一片暖黄，CCD 的青橙分离又太"数码"；
   *  · 室内：负片(Portra)的暖调会把室内钨丝灯的黄再叠一层，脸直接变蜡。
   */
  {
    // CineStill 800T 的逻辑：钨丝灯平衡（3200K）⇒ 阴影压青、灯光留暖，
    // 亮点周围一圈红橙光晕（800T 去掉 remjet 层，这是它的招牌）。
    // 关键在 lift：夜景暗部一旦死黑就变成数码噪点，抬一点黑场才像胶片。
    id: 'night',
    label: '夜景',
    swatch: 'linear-gradient(135deg,#0a2c3d,#ff8f4d)',
    grade: { brightness: 1.05, contrast: 1.06, saturate: 1.08 },
    // 冷调只走阴影层：整幅 overlay 会把灯光一起染青，暗部出绿（实测）
    cast: { color: '#2a6b93', opacity: 0.1, blend: 'overlay' },
    lift: 0.05,
    shadow: { color: '#0d3157', opacity: 0.22, blend: 'multiply' },
    highlight: { color: '#ffb066', opacity: 0.13, blend: 'soft-light' },
    // 泛光要「大而弱」：小半径强泛光会变成每个灯泡套个红圈，一眼假；
    // 但全画幅红橙 screen 叠深蓝底会混出黄绿（实测），强度必须压到 0.2 以下
    halation: { color: '#ff5a32', opacity: 0.24, blur: 0.026 },
    grain: { opacity: 0.26, scale: 3.4 },
    vignette: 0.22,
  },
  {
    // 日系室内：室内混光（钨丝灯 + 荧光灯）先把暖黄中和掉（cast 偏青），
    // 再轻过曝 + 低反差把暗部提起来 —— 这两步就是「清透」的全部来源。
    // contrast < 1 是有意的：日系室内就是要软一点，锐利反而脏。
    id: 'indoor',
    label: '室内',
    swatch: 'linear-gradient(135deg,#bfe3e6,#f6efe2)',
    grade: { brightness: 1.14, contrast: 0.93, saturate: 0.9 },
    cast: { color: '#a9cde0', opacity: 0.18, blend: 'overlay' },
    lift: 0.05,
    shadow: { color: '#43738f', opacity: 0.11, blend: 'multiply' },
    highlight: { color: '#fff6e8', opacity: 0.1, blend: 'soft-light' },
    halation: { color: '#ffe8cc', opacity: 0.07, blur: 0.014 },
    grain: { opacity: 0.14, scale: 2.4 },
    vignette: 0.1,
  },
  {
    // 日系「空气感」：轻过曝 + 低反差 + 淡青，高光轻微溢出。
    // 颗粒要最细、暗角要最弱 —— 一有暗角画面就不「轻」了。
    id: 'airy',
    label: '空气感',
    swatch: 'linear-gradient(135deg,#d9eef2,#fffdf6)',
    grade: { brightness: 1.1, contrast: 0.88, saturate: 0.86 },
    cast: { color: '#d5e6f0', opacity: 0.26, blend: 'overlay' },
    lift: 0.075,
    shadow: { color: '#84a3bc', opacity: 0.14, blend: 'multiply' },
    highlight: { color: '#ffffff', opacity: 0.12, blend: 'soft-light' },
    halation: { color: '#ffffff', opacity: 0.12, blur: 0.022 },
    grain: { opacity: 0.1, scale: 2.2 },
    vignette: 0.06,
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
 * 微调值归一：每项 0~max，缺省 1（= 预设原样）。
 * 脏数据（字符串 / NaN / 负数）一律回落到 1，不让画面被一条坏命令打歪。
 */
export function normalizeFilterTune(tune = {}) {
  const result = {};
  for (const slider of TUNE_SLIDERS) {
    const raw = Number(tune?.[slider.key]);
    result[slider.key] = Number.isFinite(raw) ? Math.min(slider.max, Math.max(0, raw)) : 1;
  }
  return result;
}

/** 微调是否全为默认值（UI 用它决定「微调」按钮是否显示已改标记）。 */
export function isDefaultFilterTune(tune = {}) {
  const normalized = normalizeFilterTune(tune);
  return TUNE_SLIDERS.every((slider) => normalized[slider.key] === 1);
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
 * 把预设 id + 强度 + 微调解析成一份「渲染用」的完整 look。
 * 预览（CSS 分层）与导出（canvas 分层）都吃这一份，两边的数值必须同源。
 */
export function resolveFilterLook(id = 'none', strength = 1, tune = {}) {
  const preset = getEditorFilter(id);
  const ratio = clampStrength(strength);
  const tuned = normalizeFilterTune(tune);
  const grade = interpolateGrade(preset.grade, ratio);
  const scale = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return num * ratio;
  };
  /** 物理层：强度线性缩放后再乘微调倍率，并按各层上限收敛。 */
  const layer = (source, key) => {
    const base = source && typeof source === 'object' ? source : {};
    const limit = key ? TUNE_LIMITS[key] : 1;
    const multiplier = key ? tuned[key] : 1;
    return {
      ...base,
      opacity: Math.min(limit, scale(base.opacity) * multiplier),
    };
  };
  return {
    id: preset.id,
    label: preset.label,
    strength: ratio,
    tune: tuned,
    css: buildFilterString(grade),
    lift: Math.min(TUNE_LIMITS.lift, scale(preset.lift) * tuned.lift),
    cast: { ...EMPTY_LAYERS.cast, ...layer(preset.cast, 'cast') },
    shadow: { ...EMPTY_LAYERS.shadow, ...layer(preset.shadow) },
    highlight: { ...EMPTY_LAYERS.highlight, ...layer(preset.highlight) },
    halation: {
      ...EMPTY_LAYERS.halation,
      ...layer(preset.halation, 'halation'),
      blur: scale(preset.halation?.blur),
    },
    grain: {
      ...EMPTY_LAYERS.grain,
      ...layer(preset.grain, 'grain'),
      scale: Number(preset.grain?.scale) || 3,
    },
    vignette: Math.min(TUNE_LIMITS.vignette, scale(preset.vignette) * tuned.vignette),
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
