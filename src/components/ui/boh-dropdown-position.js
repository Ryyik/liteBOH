/**
 * BohDropdown 定位纯函数（plans/045 组件 13）
 *
 * 为什么要单独抽出来：本仓测试环境是 node、不挂组件（见 tests/unit/boh-ui-kit.test.js
 * 头注），浮层里唯一能"跑真断言"的就是这段几何计算。把它留在 .vue 里就只能靠
 * 源码字符串守卫，等于没测。
 *
 * 坐标口径：全部是**视口坐标**（getBoundingClientRect 的值），因为面板走
 * position: fixed + Teleport，不受祖先 transform / overflow 影响。
 * 不做任何 DOM 访问 —— 输入是矩形，输出是矩形，纯函数。
 */

/** 面板与触发器之间留的缝（px）。与 BohModal 的视觉节奏一致 */
export const DROPDOWN_GAP = 8;

/** 距视口边缘的最小留白（px）。贴边会显得面板"粘"在屏幕上 */
export const DROPDOWN_EDGE = 12;

/**
 * 窄屏档：这个宽度以下不再做"贴着触发器"的浮层，改走底部上拉。
 * 与 PostComposer 现有口径（900）和 UserSpace 全宽档一致 —— 收敛 899 孤岛。
 */
export const DROPDOWN_NARROW_MAX = 900;

/**
 * 判断某个方向放不放得下。
 * @param {number} space 该方向可用空间（px）
 * @param {number} need 面板尺寸（px）
 */
const fits = (space, need) => space >= need;

/**
 * 计算下拉面板位置。
 *
 * @param {object} opt
 * @param {{top:number,bottom:number,left:number,right:number,width:number,height:number}} opt.anchor
 *        触发器矩形（getBoundingClientRect 原样传入）
 * @param {{width:number,height:number}} opt.panel 面板尺寸
 * @param {{width:number,height:number}} opt.viewport 视口尺寸
 * @param {'bottom-start'|'bottom-end'|'top-start'|'top-end'} [opt.placement]
 *        首选方向。默认 bottom-start（面板左上角对齐触发器左下角）
 * @param {number} [opt.gap]
 * @param {number} [opt.edge]
 * @param {boolean} [opt.narrow] 是否走窄屏底部上拉形态
 * @returns {{top:number,left:number,placement:string,flipped:boolean,narrow:boolean}}
 *          placement 是**最终**采用的方向（可能与首选不同）；flipped 表示发生过翻转
 */
export function computeDropdownPosition({
  anchor,
  panel,
  viewport,
  placement = 'bottom-start',
  gap = DROPDOWN_GAP,
  edge = DROPDOWN_EDGE,
  narrow = false,
} = {}) {
  const vw = viewport?.width ?? 0;
  const vh = viewport?.height ?? 0;
  const pw = Math.min(panel?.width ?? 0, vw - edge * 2);
  const ph = Math.min(panel?.height ?? 0, vh - edge * 2);

  // ── 窄屏：底部上拉，不跟触发器走（跟着走会遮住输入区，也没地方放）──
  // 四边各留 edge：贴着屏幕边缘的浮层既难看也压住 home indicator。
  // ⚠️ 窄屏下只回传 left，**不回传 top**：面板底边由 CSS 的 `bottom: edge` 定，
  // 高度又随内容变，JS 算出来的 top 会与实际渲染差几像素（实测 844 视口漂到 841）。
  if (narrow) {
    return {
      top: 0,
      left: edge,
      placement: 'bottom-start',
      flipped: false,
      narrow: true,
    };
  }

  const aTop = anchor?.top ?? 0;
  const aBottom = anchor?.bottom ?? 0;
  const aLeft = anchor?.left ?? 0;
  const aRight = anchor?.right ?? 0;

  // ── 纵向：首选下，放不下且上方更宽裕就翻上去 ──
  const wantedTop = String(placement).startsWith('top');
  const spaceBelow = vh - aBottom - gap - edge;
  const spaceAbove = aTop - gap - edge;

  let vertical = wantedTop ? 'top' : 'bottom';
  let flipped = false;
  if (vertical === 'bottom' && !fits(spaceBelow, ph) && fits(spaceAbove, ph)) {
    vertical = 'top';
    flipped = true;
  } else if (vertical === 'top' && !fits(spaceAbove, ph) && fits(spaceBelow, ph)) {
    vertical = 'bottom';
    flipped = true;
  }

  let top;
  if (vertical === 'bottom') {
    top = aBottom + gap;
    // 下方即便翻转也不够（面板比两侧都高）：夹在视口内，优先保住顶部可见
    if (top + ph > vh - edge) top = Math.max(edge, vh - ph - edge);
  } else {
    top = aTop - gap - ph;
    if (top < edge) top = edge;
  }

  // ── 横向：按 -start / -end 对齐，越界就夹回来 ──
  const wantedEnd = String(placement).endsWith('end');
  let left = wantedEnd ? aRight - pw : aLeft;
  if (left + pw > vw - edge) left = vw - pw - edge;
  if (left < edge) left = edge;

  const finalPlacement = wantedEnd ? `${vertical}-end` : `${vertical}-start`;

  return {
    top: Math.round(top),
    left: Math.round(left),
    placement: finalPlacement,
    flipped,
    narrow: false,
  };
}

/**
 * 箭头/指示器应该在面板的哪一侧（面板翻转后，视觉锚点要跟着换边）。
 * @param {string} placement computeDropdownPosition 返回的 placement
 * @returns {'bottom'|'top'} 指示器**所在边**：面板在上方时指示器在下边
 */
export function arrowSideOf(placement) {
  return String(placement).startsWith('top') ? 'bottom' : 'top';
}
