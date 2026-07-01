/**
 * PPT 栅格布局系统
 * 基于 12 列栅格 + 间距令牌计算元素坐标，淘汰硬编码
 * 画布尺寸：10in × 7.5in（4:3）/ 13.33in × 7.5in（16:9）
 */

// 画布预设
export const CANVAS = {
  '4:3':  { width: 10,    height: 7.5,  ratio: 4 / 3 },
  '16:9': { width: 13.33, height: 7.5,  ratio: 16 / 9 },
}

// 栅格配置
export const GRID = {
  columns: 12,
  // 安全边距（英寸）
  margin: {
    x: 0.6,
    y: 0.5,
  },
  // 列间距（英寸）
  gutter: 0.2,
}

/**
 * 计算栅格区域
 * @param {string} aspect - '4:3' | '16:9'
 * @returns {object} 栅格参数
 */
export function getGridContext(aspect = '16:9') {
  const canvas = CANVAS[aspect] || CANVAS['16:9']
  const contentW = canvas.width - GRID.margin.x * 2
  const colW = (contentW - GRID.gutter * (GRID.columns - 1)) / GRID.columns
  return {
    canvas,
    contentW,
    contentH: canvas.height - GRID.margin.y * 2,
    colW,
    gutter: GRID.gutter,
    margin: GRID.margin,
    columns: GRID.columns,
  }
}

/**
 * 根据列起止计算 x 坐标和宽度
 * @param {object} ctx - getGridContext 返回值
 * @param {number} startCol - 起始列（1-12）
 * @param {number} span - 跨越列数
 * @returns {{x: number, w: number}}
 */
export function colSpan(ctx, startCol, span) {
  const x = ctx.margin.x + (startCol - 1) * (ctx.colW + ctx.gutter)
  const w = span * ctx.colW + (span - 1) * ctx.gutter
  return { x, w }
}

/**
 * 行定位：基于内容区顶部偏移
 * @param {object} ctx
 * @param {number} offsetInch - 距顶部的偏移
 * @param {number} heightInch - 元素高度
 */
export function rowAt(ctx, offsetInch, heightInch) {
  return { y: ctx.margin.y + offsetInch, h: heightInch }
}

/**
 * 居中定位
 * @param {object} ctx
 * @param {number} heightInch
 */
export function centered(ctx, heightInch) {
  return { y: (ctx.canvas.height - heightInch) / 2, h: heightInch }
}

/**
 * 垂直分段：把内容区垂直分成 n 段，返回每段的 {y, h}
 * @param {object} ctx
 * @param {number} count - 段数
 * @param {number} gapInch - 段间距
 * @param {number} startOffset - 起始偏移（从内容区顶）
 */
export function verticalSplit(ctx, count, gapInch = 0.15, startOffset = 0) {
  const availH = ctx.contentH - startOffset - gapInch * (count - 1)
  const segH = availH / count
  const items = []
  for (let i = 0; i < count; i++) {
    items.push({
      y: ctx.margin.y + startOffset + i * (segH + gapInch),
      h: segH,
    })
  }
  return items
}

/**
 * 把 pt 转成英寸（PPT 用英寸）
 * @param {number} pt
 */
export function ptToInch(pt) {
  return pt / 72
}
