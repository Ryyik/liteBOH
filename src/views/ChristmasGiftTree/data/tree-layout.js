/**
 * 圣诞树的几何与挂点布局（纯函数，不碰 DOM）
 *
 * 为什么单独抽出来：
 *  1. 彩灯与头像挂饰必须**共用同一个树形**——两边各写一套坐标，改树形时必然漏改一处
 *     （这是 8 周年页当年「5 套 media query 各写一套绝对定位」的老毛病）。
 *  2. 挂点必须**可证明不重叠**。眼估「差不多能挂下」在 30 人以上一定翻车，
 *     所以这里按「层」排布：每层可用宽度由树形算出，容量 = floor(宽 / 间距)，
 *     排不下就自动缩一档尺寸重排，再排不下才交给树下的雪地。
 *  3. 坐标全部落在 SVG viewBox 的 600×720 基准里，渲染层用百分比定位 ⇒
 *     竖屏 / 横屏 / 桌面一套坐标走通，不用写第二个断点的点表。
 */

export const TREE_VIEWBOX = { width: 600, height: 720 };

/** 树身形：顶点、底边、底半宽。三层锥体都从这组值推出来 */
export const TREE_SHAPE = {
  centerX: 300,
  apexY: 74,
  baseY: 648,
  baseHalfWidth: 236,
};

/**
 * 挂点只落在 t∈[minT, maxT] 的区间。
 * 下限 0.3 而不是 0.2：0.2 处树冠只剩 ~17 格宽，一行放不下两个，8 个人会被挤成
 * 五六行、沿中轴排成一条线；抬高下限让最下面一行也有 2 个位置，分布才铺得开。
 */
export const HANGER_T_RANGE = { min: 0.3, max: 0.86 };

/** 尺寸阶梯（单位 = viewBox 基准，渲染时换算成容器百分比）。人越多头像越小 */
const SIZE_STEPS = [
  { max: 8, size: 48 },
  { max: 14, size: 44 },
  { max: 20, size: 38 },
  // 兜底档：活动容量就是 20 人，走到这里说明服务端容量校验没拦住，缩一档也别掉出树
  { max: Infinity, size: 34 },
];

export function hangerSize(count) {
  const step = SIZE_STEPS.find((s) => count <= s.max) || SIZE_STEPS[SIZE_STEPS.length - 1];
  return step.size;
}

/** 树在高度比例 t 处的挂点可用半宽（0.84 让挂饰落在树冠内侧，不悬空） */
export function halfWidthAt(t) {
  return TREE_SHAPE.baseHalfWidth * t * 0.84;
}

/**
 * 生成挂点。
 * @param {number} count 需要挂的人数
 * @returns {{ hangers: Array, overflow: number, size: number }}
 *   overflow > 0 表示树挂满了，剩余的人该去雪地
 */
export function buildHangerLayout(count) {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return { hangers: [], overflow: 0, size: hangerSize(0) };

  const { min, max } = HANGER_T_RANGE;

  /*
   * 从「最大尺寸」逐档往下试，第一个排得下的就采用。
   * 反过来（先定尺寸再缩）会让人数刚到 20 就缩成小头像 —— 明明还挂得下。
   * 每一档内部再找「最少行数」，行数越少行距越大，挂饰摊得越开。
   */
  const startIndex = SIZE_STEPS.findIndex((s) => s.size === hangerSize(total));
  let last = null;

  for (let i = Math.max(0, startIndex); i < SIZE_STEPS.length; i += 1) {
    const size = SIZE_STEPS[i].size;
    const result = packRows(total, size, min, max);
    last = { ...result, size };
    if (result.hangers.length >= total) {
      return { ...last, overflow: 0 };
    }
  }

  // 缩到最小仍排不完：已排的留在树上，剩下的交给雪地
  return { ...last, overflow: total - last.hangers.length };
}

function packRows(total, size, minT, maxT) {
  const treeHeight = TREE_SHAPE.baseY - TREE_SHAPE.apexY;
  const span = maxT - minT;
  // 跨行的最小垂直距离：略大于一个直径，保证上下列不会擦边
  const minRowStep = (size * 1.16) / treeHeight;
  const maxRows = Math.max(1, Math.floor(span / minRowStep) + 1);

  let best = { hangers: [] };
  /*
   * 行数从「人均最多 3 个」起算，逐个增加。
   * 少了这一步，8 个人会全挤在最宽的那一行（底层能放 7 个），树腰空一片、
   * 树底压一排 —— 看起来像货架，不像挂满。
   */
  const minRows = Math.max(2, Math.ceil(total / 3));
  for (let rows = minRows; rows <= maxRows; rows += 1) {
    const result = placeRows(total, size, minT, maxT, rows);
    best = result;
    if (result.hangers.length >= total) return result;
  }
  return best;
}

function placeRows(total, size, minT, maxT, rows) {
  const hangers = [];
  const treeHeight = TREE_SHAPE.baseY - TREE_SHAPE.apexY;
  const span = maxT - minT;
  const rowStep = rows > 1 ? span / (rows - 1) : 0;
  const pitch = size * 1.16;
  /*
   * 抖动必须受行距余量约束：
   *  上下两行各自抖动，最坏情况是相向各抖满 ⇒ 实际间距 = 行距 - 2×振幅。
   * 振幅写死成 size 的固定比例，就会在「行距刚好等于一个直径」时把保证顶破
   * （实测 n=14 时圆心距掉到 62.5 < 64，肉眼已是两个球粘在一起）。
   * 所以振幅 = (行距 - 直径) / 2，且不超过半径的一小部分。
   */
  const rowStepPx = rowStep * treeHeight;
  const jitterAmp = rows > 1 ? Math.max(0, Math.min(size * 0.1, (rowStepPx - size * 1.16) / 2)) : 0;

  for (let rowIndex = 0; rowIndex < rows && hangers.length < total; rowIndex += 1) {
    const t = maxT - rowIndex * rowStep;
    const halfW = halfWidthAt(t);
    // 可用半宽要扣掉头像自身的一半，保证最外侧那个不越出树冠
    const usableHalf = Math.max(0, halfW - size / 2);
    const capacity = Math.max(1, Math.floor((usableHalf * 2) / pitch) + 1);
    const remain = total - hangers.length;
    /*
     * 剩余行数均摊：只按容量放的话，人数少时会全部塞进最宽的底行（8 人能有 7 个
     * 挤在底层、树腰空一片）。按「还剩几个人 / 还剩几行」均分，挂饰就沿树高散开了。
     */
    const rowsLeft = Math.max(1, rows - rowIndex);
    const evenShare = Math.ceil(remain / rowsLeft);
    const n = Math.min(capacity, remain, Math.max(1, evenShare));

    const stepX = n > 1 ? (usableHalf * 2) / (n - 1) : 0;
    /*
     * 奇偶行错开小半步：相邻两行人数相同时不会连成一条竖线。
     * 偏移必须**同时**受 stepX 和 size 约束 —— 只看 stepX 时，两人一行（stepX 极大）
     * 会算出一百多像素的偏移，最外侧那个直接挂到树冠外面。
     */
    const stagger = rowIndex % 2 === 0 ? 0 : Math.min(stepX * 0.18, size * 0.3);

    for (let i = 0; i < n; i += 1) {
      const baseX = n === 1 ? 0 : -usableHalf + i * stepX;
      /*
       * 这里**不能 clamp**：偏移一旦被截到 usableHalf，最外侧两点会被压到同一侧，
       * 实测圆心距从 41.9 掉到 34.5（两个球直接粘住）。
       * 偏移量本身受 0.18×stepX 约束，最多越出半个头像的余量，仍在树冠范围内。
       */
      const x = TREE_SHAPE.centerX + baseX + stagger;
      // 轻微抖动：纯网格会像贴纸墙；幅度已按行距余量收紧，不会破坏不重叠
      const jitterY = ((((hangers.length * 37) % 11) - 5) / 5) * jitterAmp;
      hangers.push({
        x,
        y: TREE_SHAPE.apexY + t * treeHeight + jitterY,
        size,
        row: rowIndex,
      });
    }
  }

  /*
   * 人很少时不要全挤在最宽的那一行（看着像货架上摆了一排）。
   * 单人挂树心；两人上下错开——两个 78 的头像并排需要 160 宽，
   * 而中段树冠只有 ~220，并排会顶到边缘，错开挂才是自然的。
   */
  if (hangers.length === 1) {
    hangers[0].y = TREE_SHAPE.apexY + 0.54 * treeHeight;
  } else if (hangers.length === 2) {
    hangers[0].y = TREE_SHAPE.apexY + 0.55 * treeHeight;
    hangers[0].x = TREE_SHAPE.centerX - 46;
    hangers[1].y = TREE_SHAPE.apexY + 0.76 * treeHeight;
    hangers[1].x = TREE_SHAPE.centerX + 52;
  }

  return { hangers };
}
