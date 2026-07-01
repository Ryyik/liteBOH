/**
 * PPT 渲染引擎（token-based + 12 栅格）
 * 支持 12 种版式：cover / agenda / section / content / bullets /
 *   two-column / image-text / chart / table / timeline / quote / end
 * 支持富元素：图表（柱/饼/折线）、表格、图片、流程图
 */
import pptxgen from 'pptxgenjs'
import { getGridContext, colSpan, rowAt, centered, verticalSplit, ptToInch } from './ppt-grid.js'
import { getPresetById, resolveStyle, getFontStack, FONT_STACKS } from '../config/design-tokens.js'

// ===== 版式注册表 =====
const LAYOUTS = {
  cover:      renderCover,
  agenda:     renderAgenda,
  section:    renderSection,
  content:    renderContent,
  bullets:    renderBullets,
  'two-column': renderTwoColumn,
  'image-text': renderImageText,
  chart:      renderChart,
  table:      renderTable,
  timeline:   renderTimeline,
  quote:      renderQuote,
  end:        renderEnd,
}

/**
 * 主构建函数
 * @param {object} data - PPT 结构数据
 * @param {string} presetId - 样式集 ID
 * @param {string} fileName - 输出文件名
 * @param {object} options - { aspect: '16:9'|'4:3', images: Map<string, dataUrl> }
 */
export async function buildPPT(data, presetId = 'boh', fileName = 'AI生成.pptx', options = {}) {
  const preset = getPresetById(presetId)
  const aspect = options.aspect || '16:9'
  const ctx = getGridContext(aspect)
  const images = options.images || new Map()

  const pptx = new pptxgen()
  pptx.author = data.author || 'BOH Agent'
  pptx.title = data.title
  pptx.subject = 'AI 生成演示文稿'
  pptx.defineLayout({ name: 'CUSTOM', width: ctx.canvas.width, height: ctx.canvas.height })
  pptx.layout = 'CUSTOM'

  const renderCtx = { pptx, preset, ctx, images, data }

  const slides = data.slides || []
  for (let i = 0; i < slides.length; i++) {
    const slide = pptx.addSlide()
    const slideData = slides[i]
    const renderer = LAYOUTS[slideData.type] || renderContent
    try {
      await renderer(slide, slideData, renderCtx, i, slides.length)
    } catch (e) {
      // 单页渲染失败不影响整体，降级为内容页
      console.warn(`[PPT] 版式 ${slideData.type} 渲染失败，降级为内容页:`, e.message)
      await renderContent(slide, slideData, renderCtx, i, slides.length)
    }
    // 页脚页码（封面/结束页除外）
    if (slideData.type !== 'cover' && slideData.type !== 'end') {
      renderPageNumber(slide, renderCtx, i, slides.length)
    }
  }

  await pptx.writeFile({ fileName })
  return true
}

// ===== 工具函数 =====
function color(preset, path) {
  const parts = path.split('.')
  let v = preset.tokens.color
  for (const p of parts) v = v?.[p]
  return v || '000000'
}

function font(preset, role) {
  return getFontStack(role, preset.tokens)
}

// 添加背景色
function setBackground(slide, preset, bgKey) {
  const c = color(preset, `bg.${bgKey}`)
  slide.background = { color: c }
}

// 添加装饰矩形（圆角）
function decoRect(slide, pptx, { x, y, w, h, fill, line, lineW = 1, radius = 0.08, fillTrans = 90, lineTrans = 0 }) {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    rectRadius: radius,
    fill: { color: fill, transparency: fillTrans },
    line: line ? { color: line, width: lineW, transparency: lineTrans } : undefined,
  })
}

// 添加分割线
function divider(slide, pptx, { x, y, w, color, width = 2, trans = 0 }) {
  slide.addShape(pptx.ShapeType.line, {
    x, y, w, h: 0,
    line: { color, width, transparency: trans },
  })
}

// 页脚页码
function renderPageNumber(slide, ctx, idx, total) {
  const { pptx, preset } = ctx
  const c = color(preset, 'text.muted')
  slide.addText(`${idx + 1} / ${total}`, {
    x: ctx.ctx.canvas.width - 1.3,
    y: ctx.ctx.canvas.height - 0.5,
    w: 1.0,
    h: 0.3,
    fontSize: 10,
    color: c,
    align: 'right',
    fontFace: font(preset, 'body').ppt,
  })
}

// ===== 版式 1：封面页 =====
function renderCover(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'cover')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onDark')

  // 标题装饰框
  decoRect(slide, pptx, {
    x: 1.5, y: 1.8, w: grid.canvas.width - 3, h: 2.8,
    fill: primary, line: primary, radius: 0.15, fillTrans: 88, lineTrans: 30,
  })

  // 标题
  const titleFont = font(preset, 'title')
  slide.addText(data.title || '', {
    x: 1.8, y: 2.1, w: grid.canvas.width - 3.6, h: 1.6,
    fontSize: 40, fontFace: titleFont.ppt, color: textC,
    bold: true, align: 'center',
  })

  // 分割线
  divider(slide, pptx, {
    x: grid.canvas.width / 2 - 2, y: 3.8, w: 4, color: primary, width: 3,
  })

  // 副标题
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 1.8, y: 4.0, w: grid.canvas.width - 3.6, h: 0.8,
      fontSize: 20, fontFace: font(preset, 'subtitle').ppt, color: textC,
      align: 'center',
    })
  }

  // 作者/日期
  if (data.author || data.date) {
    slide.addText([data.author, data.date].filter(Boolean).join('  ·  '), {
      x: 1.8, y: grid.canvas.height - 1.3, w: grid.canvas.width - 3.6, h: 0.4,
      fontSize: 12, color: textC, align: 'center',
      fontFace: font(preset, 'body').ppt,
    })
  }

  // 底部装饰条
  decoRect(slide, pptx, {
    x: 0, y: grid.canvas.height - 0.4, w: grid.canvas.width, h: 0.4,
    fill: primary, line: primary, radius: 0, fillTrans: 80, lineTrans: 0,
  })
}

// ===== 版式 2：目录页 =====
function renderAgenda(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'content')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')
  const mutedC = color(preset, 'text.muted')

  renderSectionHeader(slide, ctx, data.title || '目录', 'content')

  const items = data.items || data.points || []
  if (items.length === 0) return

  const colCount = items.length > 6 ? 2 : 1
  const perCol = Math.ceil(items.length / colCount)
  const segs = verticalSplit(grid, perCol, 0.15, 1.6)

  items.forEach((item, i) => {
    const col = Math.floor(i / perCol)
    const rowInCol = i % perCol
    const seg = segs[rowInCol]
    const colPos = colSpan(grid, col === 0 ? 1 : 7, 6)

    // 序号圆角框
    decoRect(slide, pptx, {
      x: colPos.x, y: seg.y, w: 0.5, h: seg.h,
      fill: primary, line: primary, radius: 0.08, fillTrans: 80, lineTrans: 0,
    })
    slide.addText(String(i + 1), {
      x: colPos.x, y: seg.y, w: 0.5, h: seg.h,
      fontSize: 20, color: primary, bold: true, align: 'center', valign: 'middle',
      fontFace: font(preset, 'heading').ppt,
    })

    // 内容
    const txt = typeof item === 'string' ? item : (item.title || item.text || '')
    const sub = typeof item === 'object' ? (item.subtitle || item.desc || '') : ''
    slide.addText(txt, {
      x: colPos.x + 0.7, y: seg.y, w: colPos.w - 0.7, h: sub ? seg.h * 0.6 : seg.h,
      fontSize: 16, color: textC, bold: true, valign: 'middle',
      fontFace: font(preset, 'heading').ppt,
    })
    if (sub) {
      slide.addText(sub, {
        x: colPos.x + 0.7, y: seg.y + seg.h * 0.55, w: colPos.w - 0.7, h: seg.h * 0.4,
        fontSize: 11, color: mutedC, valign: 'middle',
        fontFace: font(preset, 'body').ppt,
      })
    }
  })
}

// ===== 版式 3：章节分隔页 =====
function renderSection(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'cover')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onDark')

  // 大序号
  if (data.index !== undefined || data.number !== undefined) {
    slide.addText(String(data.index ?? data.number ?? ''), {
      x: 0, y: 1.0, w: grid.canvas.width, h: 2.5,
      fontSize: 120, color: primary, bold: true, align: 'center', valign: 'middle',
      fontFace: font(preset, 'title').ppt,
      transparency: 30,
    })
  }

  // 装饰线
  divider(slide, pptx, {
    x: grid.canvas.width / 2 - 2, y: 3.8, w: 4, color: primary, width: 3,
  })

  // 章节标题
  slide.addText(data.title || '', {
    x: 1.5, y: 4.1, w: grid.canvas.width - 3, h: 1.0,
    fontSize: 36, color: textC, bold: true, align: 'center',
    fontFace: font(preset, 'title').ppt,
  })

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 1.5, y: 5.2, w: grid.canvas.width - 3, h: 0.6,
      fontSize: 16, color: textC, align: 'center',
      fontFace: font(preset, 'body').ppt,
    })
  }
}

// ===== 版式 4：内容页（标题 + 段落文本） =====
function renderContent(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'content')
  renderSectionHeader(slide, ctx, data.title || '', 'content')

  const textC = color(preset, 'text.onLight')
  const mutedC = color(preset, 'text.muted')
  const primary = color(preset, 'primary')

  // 段落内容
  const paragraphs = data.paragraphs || data.content || []
  if (paragraphs.length > 0) {
    const area = colSpan(grid, 1, 12)
    const segs = verticalSplit(grid, paragraphs.length, 0.15, 1.6)
    paragraphs.forEach((p, i) => {
      const seg = segs[i]
      const txt = typeof p === 'string' ? p : (p.text || '')
      const styleName = typeof p === 'object' ? p.style : 'body'
      const st = resolveStyle(styleName, preset.tokens)

      slide.addText(txt, {
        x: area.x, y: seg.y, w: area.w, h: seg.h,
        fontSize: st.size ? st.size / 2 : 14,
        fontFace: font(preset, 'body').ppt,
        color: st.bold ? textC : mutedC,
        bold: !!st.bold,
        italic: !!st.italic,
        align: 'left',
        valign: 'top',
      })
    })
  }
}

// ===== 版式 5：要点列表 =====
function renderBullets(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'content')
  renderSectionHeader(slide, ctx, data.title || '', 'content')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')
  const mutedC = color(preset, 'text.muted')

  const points = data.points || []
  if (points.length === 0) return

  const area = colSpan(grid, 1, 12)
  const segs = verticalSplit(grid, points.length, 0.2, 1.6)

  points.forEach((point, i) => {
    const seg = segs[i]
    const txt = typeof point === 'string' ? point : (point.text || point)
    const sub = typeof point === 'object' ? (point.detail || point.desc || '') : ''

    // 要点背景框
    decoRect(slide, pptx, {
      x: area.x, y: seg.y, w: area.w, h: seg.h,
      fill: primary, line: primary, radius: 0.06, fillTrans: 92, lineTrans: 60,
    })

    // 序号/项目符号
    slide.addShape(pptx.ShapeType.ellipse, {
      x: area.x + 0.15, y: seg.y + seg.h / 2 - 0.2, w: 0.4, h: 0.4,
      fill: { color: primary },
      line: { color: primary, width: 1 },
    })
    slide.addText(String(i + 1), {
      x: area.x + 0.15, y: seg.y + seg.h / 2 - 0.2, w: 0.4, h: 0.4,
      fontSize: 12, color: color(preset, 'primaryFg'), bold: true,
      align: 'center', valign: 'middle',
      fontFace: font(preset, 'heading').ppt,
    })

    // 要点文本
    slide.addText(txt, {
      x: area.x + 0.75, y: seg.y, w: area.w - 1.0, h: sub ? seg.h * 0.65 : seg.h,
      fontSize: 15, color: textC, bold: true, valign: 'middle',
      fontFace: font(preset, 'heading').ppt,
    })
    if (sub) {
      slide.addText(sub, {
        x: area.x + 0.75, y: seg.y + seg.h * 0.6, w: area.w - 1.0, h: seg.h * 0.35,
        fontSize: 11, color: mutedC, valign: 'middle',
        fontFace: font(preset, 'body').ppt,
      })
    }
  })
}

// ===== 版式 6：两栏对比 =====
function renderTwoColumn(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'content')
  renderSectionHeader(slide, ctx, data.title || '对比', 'content')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')
  const mutedC = color(preset, 'text.muted')

  const left = data.leftColumn || data.left || {}
  const right = data.rightColumn || data.right || {}

  const leftPos = colSpan(grid, 1, 6)
  const rightPos = colSpan(grid, 7, 6)
  const bodyY = grid.margin.y + 1.6
  const bodyH = grid.contentH - 1.6

  // 左右栏背景框
  decoRect(slide, pptx, {
    x: leftPos.x, y: bodyY, w: leftPos.w, h: bodyH,
    fill: primary, line: primary, radius: 0.1, fillTrans: 94, lineTrans: 60,
  })
  decoRect(slide, pptx, {
    x: rightPos.x, y: bodyY, w: rightPos.w, h: bodyH,
    fill: primary, line: primary, radius: 0.1, fillTrans: 94, lineTrans: 60,
  })

  // 左栏标题
  decoRect(slide, pptx, {
    x: leftPos.x + 0.2, y: bodyY + 0.2, w: leftPos.w - 0.4, h: 0.5,
    fill: primary, line: primary, radius: 0.05, fillTrans: 80, lineTrans: 0,
  })
  slide.addText(left.title || '优势', {
    x: leftPos.x + 0.2, y: bodyY + 0.2, w: leftPos.w - 0.4, h: 0.5,
    fontSize: 16, color: color(preset, 'primaryFg'), bold: true,
    align: 'center', valign: 'middle',
    fontFace: font(preset, 'heading').ppt,
  })

  // 左栏内容
  const leftItems = left.items || []
  if (leftItems.length > 0) {
    const segs = verticalSplit(grid, leftItems.length, 0.1, 1.6 + 0.7)
    leftItems.forEach((item, i) => {
      slide.addText(typeof item === 'string' ? item : (item.text || ''), {
        x: leftPos.x + 0.4, y: segs[i].y, w: leftPos.w - 0.8, h: segs[i].h,
        fontSize: 13, color: textC, valign: 'middle',
        bullet: { type: 'bullet', code: '25A0' },
        fontFace: font(preset, 'body').ppt,
      })
    })
  }

  // 右栏标题
  decoRect(slide, pptx, {
    x: rightPos.x + 0.2, y: bodyY + 0.2, w: rightPos.w - 0.4, h: 0.5,
    fill: primary, line: primary, radius: 0.05, fillTrans: 80, lineTrans: 0,
  })
  slide.addText(right.title || '劣势', {
    x: rightPos.x + 0.2, y: bodyY + 0.2, w: rightPos.w - 0.4, h: 0.5,
    fontSize: 16, color: color(preset, 'primaryFg'), bold: true,
    align: 'center', valign: 'middle',
    fontFace: font(preset, 'heading').ppt,
  })

  const rightItems = right.items || []
  if (rightItems.length > 0) {
    const segs = verticalSplit(grid, rightItems.length, 0.1, 1.6 + 0.7)
    rightItems.forEach((item, i) => {
      slide.addText(typeof item === 'string' ? item : (item.text || ''), {
        x: rightPos.x + 0.4, y: segs[i].y, w: rightPos.w - 0.8, h: segs[i].h,
        fontSize: 13, color: textC, valign: 'middle',
        bullet: { type: 'bullet', code: '25A0' },
        fontFace: font(preset, 'body').ppt,
      })
    })
  }
}

// ===== 版式 7：图文页 =====
async function renderImageText(slide, data, ctx) {
  const { pptx, preset, ctx: grid, images } = ctx
  setBackground(slide, preset, 'content')
  renderSectionHeader(slide, ctx, data.title || '', 'content')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')
  const mutedC = color(preset, 'text.muted')

  const imageOnLeft = data.imagePosition !== 'right'
  const imgPos = colSpan(grid, imageOnLeft ? 1 : 7, 6)
  const txtPos = colSpan(grid, imageOnLeft ? 7 : 1, 6)
  const bodyY = grid.margin.y + 1.6
  const bodyH = grid.contentH - 1.6

  // 图片：优先用 AI 生成的图，否则用占位图框
  const imgKey = data.imageKey || data.image
  const imgData = imgKey ? images.get(imgKey) : null
  if (imgData) {
    slide.addImage({ data: imgData, x: imgPos.x, y: bodyY, w: imgPos.w, h: bodyH, sizing: { type: 'cover', w: imgPos.w, h: bodyH } })
  } else {
    // 占位图框
    decoRect(slide, pptx, {
      x: imgPos.x, y: bodyY, w: imgPos.w, h: bodyH,
      fill: primary, line: primary, radius: 0.08, fillTrans: 88, lineTrans: 30,
    })
    slide.addText('[ 图片 ]', {
      x: imgPos.x, y: bodyY, w: imgPos.w, h: bodyH,
      fontSize: 14, color: mutedC, align: 'center', valign: 'middle',
      fontFace: font(preset, 'body').ppt,
    })
  }

  // 文字
  const points = data.points || data.texts || []
  if (points.length > 0) {
    const segs = verticalSplit(grid, points.length, 0.15, 1.6)
    points.forEach((p, i) => {
      const seg = segs[i]
      slide.addText(typeof p === 'string' ? p : (p.text || ''), {
        x: txtPos.x, y: seg.y, w: txtPos.w, h: seg.h,
        fontSize: 14, color: textC, valign: 'top',
        bullet: { type: 'bullet', code: '25A0' },
        fontFace: font(preset, 'body').ppt,
      })
    })
  } else if (data.text) {
    slide.addText(data.text, {
      x: txtPos.x, y: bodyY, w: txtPos.w, h: bodyH,
      fontSize: 14, color: textC, valign: 'top',
      fontFace: font(preset, 'body').ppt,
    })
  }
}

// ===== 版式 8：图表页 =====
function renderChart(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'content')
  renderSectionHeader(slide, ctx, data.title || '数据图表', 'content')

  const primary = color(preset, 'primary')
  const secondary = color(preset, 'secondary')
  const accent = color(preset, 'accent')

  const area = colSpan(grid, 1, 12)
  const bodyY = grid.margin.y + 1.6
  const bodyH = grid.contentH - 1.6

  const chartType = (data.chartType || 'bar').toLowerCase()
  const chartData = data.chartData || data.data || []
  const categories = chartData.map(d => d.label || d.name || '')
  const values = chartData.map(d => Number(d.value || 0))

  const chartOpt = {
    x: area.x, y: bodyY, w: area.w, h: bodyH,
    chartColors: [primary, secondary, accent, color(preset, 'neutral.500')],
    showLegend: data.showLegend !== false,
    legendPos: 'b',
    legendFontSize: 11,
    showValue: true,
    valGridLine: { style: 'solid', size: 1, color: color(preset, 'neutral.200') },
    catGridLine: { style: 'none' },
  }

  if (chartType === 'pie' || chartType === 'donut') {
    slide.addChart(pptx.ChartType.pie, [{
      name: data.title || '占比',
      labels: categories,
      values,
    }], { ...chartOpt, firstSliceAng: 90, holeSize: chartType === 'donut' ? 50 : undefined })
  } else if (chartType === 'line') {
    slide.addChart(pptx.ChartType.line, [{
      name: data.series || data.title || '趋势',
      labels: categories,
      values,
    }], { ...chartOpt, lineSize: 3, lineSmooth: true, lineDataSymbolSize: 8 })
  } else {
    // bar / column 默认柱状图
    slide.addChart(pptx.ChartType.bar, [{
      name: data.series || data.title || '数据',
      labels: categories,
      values,
    }], { ...chartOpt, barDir: 'col', barGapWidthPct: 80 })
  }

  // 图表说明
  if (data.caption) {
    slide.addText(data.caption, {
      x: area.x, y: grid.canvas.height - 0.8, w: area.w, h: 0.4,
      fontSize: 11, color: color(preset, 'text.muted'), align: 'center', italic: true,
      fontFace: font(preset, 'body').ppt,
    })
  }
}

// ===== 版式 9：表格页 =====
function renderTable(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'content')
  renderSectionHeader(slide, ctx, data.title || '数据表格', 'content')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')
  const mutedC = color(preset, 'text.muted')
  const bgMuted = color(preset, 'bg.muted')

  const area = colSpan(grid, 1, 12)
  const bodyY = grid.margin.y + 1.6
  const bodyH = grid.contentH - 1.6

  const headers = data.headers || (data.table && data.table[0]) || []
  const rows = data.rows || (data.table ? data.table.slice(1) : [])

  if (headers.length === 0) return

  const tableRows = [
    headers.map(h => ({ text: String(h), options: { bold: true, color: color(preset, 'primaryFg'), fill: { color: primary }, align: 'center', valign: 'middle', fontSize: 12, fontFace: font(preset, 'heading').ppt } })),
    ...rows.map((row, ri) => row.map(cell => ({
      text: String(cell ?? ''),
      options: {
        color: textC,
        fill: { color: ri % 2 === 0 ? 'ffffff' : bgMuted },
        align: 'left',
        valign: 'middle',
        fontSize: 11,
        fontFace: font(preset, 'body').ppt,
      },
    }))),
  ]

  slide.addTable(tableRows, {
    x: area.x, y: bodyY, w: area.w,
    colW: area.w / headers.length,
    border: { type: 'solid', pt: 0.5, color: color(preset, 'neutral.200') },
    rowH: Math.min(0.5, bodyH / (tableRows.length + 1)),
    valign: 'middle',
  })
}

// ===== 版式 10：时间线 =====
function renderTimeline(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'content')
  renderSectionHeader(slide, ctx, data.title || '时间线', 'content')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')
  const mutedC = color(preset, 'text.muted')

  const events = data.events || data.timeline || []
  if (events.length === 0) return

  const area = colSpan(grid, 1, 12)
  const bodyY = grid.margin.y + 1.6
  const bodyH = grid.contentH - 1.6

  // 水平时间线（横线）
  const lineY = bodyY + bodyH / 2
  divider(slide, pptx, { x: area.x + 0.3, y: lineY, w: area.w - 0.6, color: primary, width: 2 })

  const segW = (area.w - 0.6) / events.length
  events.forEach((ev, i) => {
    const cx = area.x + 0.3 + segW * (i + 0.5)
    const isUp = i % 2 === 0

    // 节点圆
    slide.addShape(pptx.ShapeType.ellipse, {
      x: cx - 0.12, y: lineY - 0.12, w: 0.24, h: 0.24,
      fill: { color: primary },
      line: { color: primary, width: 2 },
    })

    // 日期/序号
    const dateTxt = typeof ev === 'string' ? ev : (ev.date || ev.time || String(i + 1))
    const titleTxt = typeof ev === 'object' ? (ev.title || ev.event || '') : ''

    const dateY = isUp ? lineY - 0.6 : lineY + 0.15
    const titleY = isUp ? lineY - 1.6 : lineY + 0.5

    slide.addText(dateTxt, {
      x: cx - segW / 2 + 0.1, y: dateY, w: segW - 0.2, h: 0.4,
      fontSize: 13, color: primary, bold: true, align: 'center', valign: 'middle',
      fontFace: font(preset, 'heading').ppt,
    })
    if (titleTxt) {
      slide.addText(titleTxt, {
        x: cx - segW / 2 + 0.1, y: titleY, w: segW - 0.2, h: 1.0,
        fontSize: 11, color: mutedC, align: 'center', valign: 'top',
        fontFace: font(preset, 'body').ppt,
      })
    }
  })
}

// ===== 版式 11：引述页 =====
function renderQuote(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'muted')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')

  // 大引号装饰
  slide.addText('"', {
    x: 1.0, y: 0.8, w: 3, h: 3,
    fontSize: 200, color: primary, bold: true, align: 'left', valign: 'top',
    fontFace: 'Georgia',
    transparency: 40,
  })

  const c = centered(grid, 2.5)
  // 引文
  slide.addText(data.quote || data.text || '', {
    x: 1.5, y: c.y, w: grid.canvas.width - 3, h: 1.8,
    fontSize: 22, color: textC, italic: true, align: 'center', valign: 'middle',
    fontFace: font(preset, 'heading').ppt,
  })

  // 来源
  if (data.author || data.source) {
    divider(slide, pptx, {
      x: grid.canvas.width / 2 - 1, y: c.y + 2.0, w: 2, color: primary, width: 2,
    })
    slide.addText(`— ${data.author || data.source}`, {
      x: 1.5, y: c.y + 2.15, w: grid.canvas.width - 3, h: 0.5,
      fontSize: 14, color: primary, bold: true, align: 'center',
      fontFace: font(preset, 'body').ppt,
    })
  }
}

// ===== 版式 12：结束页 =====
function renderEnd(slide, data, ctx) {
  const { pptx, preset, ctx: grid } = ctx
  setBackground(slide, preset, 'end')

  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onDark')

  // 中心装饰框
  decoRect(slide, pptx, {
    x: 2, y: 2.0, w: grid.canvas.width - 4, h: 3.5,
    fill: primary, line: primary, radius: 0.15, fillTrans: 88, lineTrans: 30,
  })

  // 上装饰线
  divider(slide, pptx, {
    x: grid.canvas.width / 2 - 2, y: 2.5, w: 4, color: primary, width: 2,
  })

  // 标题
  slide.addText(data.title || '谢谢观看', {
    x: 1.5, y: 2.8, w: grid.canvas.width - 3, h: 1.2,
    fontSize: 36, color: textC, bold: true, align: 'center',
    fontFace: font(preset, 'title').ppt,
  })

  // 下装饰线
  divider(slide, pptx, {
    x: grid.canvas.width / 2 - 2, y: 4.0, w: 4, color: primary, width: 2,
  })

  // 副标题
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 1.5, y: 4.2, w: grid.canvas.width - 3, h: 0.8,
      fontSize: 16, color: textC, align: 'center',
      fontFace: font(preset, 'body').ppt,
    })
  }

  // 品牌 logo
  if (preset.tokens.brand?.showOnSlides) {
    decoRect(slide, pptx, {
      x: grid.canvas.width / 2 - 1.5, y: 5.8, w: 3, h: 0.5,
      fill: primary, line: primary, radius: 0.05, fillTrans: 80, lineTrans: 0,
    })
    slide.addText(`由 ${preset.tokens.brand.logo} 生成`, {
      x: grid.canvas.width / 2 - 1.5, y: 5.85, w: 3, h: 0.4,
      fontSize: 12, color: color(preset, 'primaryFg'), align: 'center',
      fontFace: font(preset, 'body').ppt,
    })
  }

  // 底部装饰条
  decoRect(slide, pptx, {
    x: 0, y: grid.canvas.height - 0.4, w: grid.canvas.width, h: 0.4,
    fill: primary, line: primary, radius: 0, fillTrans: 80, lineTrans: 0,
  })
}

// ===== 公共：内容页标题栏 =====
function renderSectionHeader(slide, ctx, title, bgKey) {
  const { pptx, preset, ctx: grid } = ctx
  const primary = color(preset, 'primary')
  const textC = color(preset, 'text.onLight')

  // 标题背景装饰框
  decoRect(slide, pptx, {
    x: grid.margin.x - 0.1, y: grid.margin.y - 0.05, w: grid.contentW + 0.2, h: 0.9,
    fill: primary, line: primary, radius: 0.08, fillTrans: 90, lineTrans: 0,
  })

  // 标题
  slide.addText(title, {
    x: grid.margin.x + 0.15, y: grid.margin.y, w: grid.contentW - 0.3, h: 0.8,
    fontSize: 24, color: textC, bold: true, valign: 'middle',
    fontFace: font(preset, 'heading').ppt,
  })

  // 标题下分割线
  divider(slide, pptx, {
    x: grid.margin.x, y: grid.margin.y + 1.0, w: grid.contentW, color: primary, width: 2,
  })
}
