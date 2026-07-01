/**
 * Word 从零生成引擎（基于 docx 库）
 * 支持样式集（Design Tokens）、标题层级、正文、列表、表格、图片、页眉页脚
 * AI 输出结构化 JSON（文档大纲），引擎渲染为完整 .docx
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, NumberFormat, ImageRun,
  LevelFormat, convertInchesToTwip, PageOrientation,
} from 'docx'
import { getPresetById, resolveStyle, getFontStack, FONT_STACKS } from '../config/design-tokens.js'

/**
 * 构建 Word 文档
 * @param {object} docData - 文档结构数据
 * @param {string} presetId - 样式集 ID
 * @returns {Promise<Blob>} docx Blob
 */
export async function buildWordDoc(docData, presetId = 'boh') {
  const preset = getPresetById(presetId)
  const doc = assembleDocument(docData, preset)
  const blob = await Packer.toBlob(doc)
  return blob
}

/**
 * 构建 + 下载
 */
export async function buildAndDownloadWord(docData, presetId, fileName = 'AI生成.docx') {
  const blob = await buildWordDoc(docData, presetId)
  downloadBlob(blob, fileName)
  return blob
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// ===== 组装 Document =====
function assembleDocument(docData, preset) {
  const meta = docData.meta || {}
  const page = docData.page || {}
  const blocks = docData.blocks || docData.content || []

  // 页面设置
  const pageSize = {
    width: page.width || convertInchesToTwip(8.27),   // A4 默认
    height: page.height || convertInchesToTwip(11.69),
    orientation: page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
  }
  const pageMargin = {
    top: page.marginTop || convertInchesToTwip(1),
    bottom: page.marginBottom || convertInchesToTwip(1),
    left: page.marginLeft || convertInchesToTwip(1.25),
    right: page.marginRight || convertInchesToTwip(1.25),
  }

  // 默认样式
  const styles = buildStyles(preset)

  // 段落渲染
  const children = []
  for (const block of blocks) {
    const elements = renderBlock(block, preset)
    if (Array.isArray(elements)) children.push(...elements)
    else children.push(elements)
  }

  // 页眉页脚
  const header = buildHeader(docData, preset)
  const footer = buildFooter(docData, preset)

  return new Document({
    creator: meta.author || 'BOH Agent',
    title: docData.title || meta.title || 'AI 生成文档',
    description: meta.description || '',
    styles,
    sections: [{
      properties: {
        page: {
          size: pageSize,
          margin: pageMargin,
        },
      },
      headers: header ? { default: header } : undefined,
      footers: footer ? { default: footer } : undefined,
      children,
    }],
  })
}

// ===== 样式定义（docx 样式表） =====
function buildStyles(preset) {
  const titleFont = getFontStack('title', preset.tokens)
  const headingFont = getFontStack('heading', preset.tokens)
  const bodyFont = getFontStack('body', preset.tokens)
  const primary = preset.tokens.color.primary
  const textC = preset.tokens.color.text.onLight
  const mutedC = preset.tokens.color.text.muted

  return {
    default: {
      document: {
        run: {
          font: { ascii: bodyFont.ascii, eastAsia: bodyFont.eastAsia },
          size: 24, // 12pt
          color: textC,
        },
        paragraph: {
          spacing: { line: 360, before: 0, after: 80 },
        },
      },
      heading1: {
        run: { font: { ascii: headingFont.ascii, eastAsia: headingFont.eastAsia }, size: 56, bold: true, color: primary },
        paragraph: { spacing: { before: 240, after: 120, line: 320 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: headingFont.ascii, eastAsia: headingFont.eastAsia }, size: 44, bold: true, color: primary },
        paragraph: { spacing: { before: 200, after: 100, line: 320 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: { ascii: headingFont.ascii, eastAsia: headingFont.eastAsia }, size: 36, bold: true, color: textC },
        paragraph: { spacing: { before: 160, after: 80, line: 300 }, outlineLevel: 2 },
      },
      heading4: {
        run: { font: { ascii: headingFont.ascii, eastAsia: headingFont.eastAsia }, size: 30, bold: true, color: textC },
        paragraph: { spacing: { before: 120, after: 60, line: 280 }, outlineLevel: 3 },
      },
    },
  }
}

// ===== 块级元素渲染 =====
function renderBlock(block, preset) {
  if (!block || !block.type) return new Paragraph({ children: [] })

  switch (block.type) {
    case 'heading': return renderHeading(block, preset)
    case 'paragraph': return renderParagraph(block, preset)
    case 'list': return renderList(block, preset)
    case 'ordered-list': return renderList(block, preset, true)
    case 'quote': return renderQuote(block, preset)
    case 'code': return renderCode(block, preset)
    case 'table': return renderTable(block, preset)
    case 'image': return renderImage(block, preset)
    case 'divider': return renderDivider(preset)
    case 'toc': return renderTOC(preset)
    default: return renderParagraph(block, preset)
  }
}

function renderHeading(block, preset) {
  const level = Math.min(Math.max(block.level || 1, 1), 4)
  const headingMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
  }
  return new Paragraph({
    heading: headingMap[level],
    alignment: mapAlign(block.align),
    children: [
      new TextRun({
        text: block.text || '',
        bold: block.bold,
        italic: block.italic,
        color: block.color,
      }),
    ],
  })
}

function renderParagraph(block, preset) {
  const bodyFont = getFontStack('body', preset.tokens)
  const textC = preset.tokens.color.text.onLight

  // 支持富文本片段
  let runs
  if (Array.isArray(block.runs)) {
    runs = block.runs.map(r => new TextRun({
      text: r.text || '',
      bold: r.bold,
      italic: r.italic,
      underline: r.underline ? {} : undefined,
      strike: r.strikethrough,
      color: r.color || textC,
      size: r.size,
      font: r.font ? { ascii: r.font, eastAsia: r.font } : undefined,
      highlight: r.highlight,
    }))
  } else {
    runs = [new TextRun({
      text: block.text || '',
      bold: block.bold,
      italic: block.italic,
      color: block.color || textC,
    })]
  }

  return new Paragraph({
    alignment: mapAlign(block.align),
    spacing: {
      line: block.line || 360,
      before: block.before || 0,
      after: block.after || 80,
    },
    indent: block.firstLine ? { firstLine: block.firstLine } : undefined,
    children: runs,
  })
}

function renderList(block, preset, ordered = false) {
  const items = block.items || []
  const textC = preset.tokens.color.text.onLight
  return items.map(item => new Paragraph({
    numbering: ordered ? undefined : undefined, // 用 bullet 字符模拟
    bullet: ordered ? undefined : { level: 0 },
    numbering: ordered ? { reference: 'default-numbering', level: 0 } : undefined,
    children: [new TextRun({ text: typeof item === 'string' ? item : (item.text || ''), color: textC })],
  }))
}

function renderQuote(block, preset) {
  const primary = preset.tokens.color.primary
  const bodyFont = getFontStack('body', preset.tokens)
  return new Paragraph({
    spacing: { before: 80, after: 80, line: 360 },
    indent: { left: convertInchesToTwip(0.4) },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: primary, space: 8 },
    },
    children: [new TextRun({
      text: block.text || '',
      italics: true,
      color: preset.tokens.color.text.muted,
    })],
  })
}

function renderCode(block, preset) {
  const mono = FONT_STACKS.mono
  return new Paragraph({
    spacing: { before: 60, after: 60, line: 280 },
    shading: { type: ShadingType.CLEAR, fill: 'F4F4F5' },
    children: [new TextRun({
      text: block.text || block.code || '',
      font: { ascii: mono.ascii, eastAsia: mono.eastAsia },
      size: 20,
      color: preset.tokens.color.text.onLight,
    })],
  })
}

function renderTable(block, preset) {
  const primary = preset.tokens.color.primary
  const primaryFg = preset.tokens.color.primaryFg
  const textC = preset.tokens.color.text.onLight
  const mutedBg = preset.tokens.color.bg.muted

  const headers = block.headers || []
  const rows = block.rows || []
  if (headers.length === 0) return new Paragraph({ children: [] })

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: primary },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: String(h), bold: true, color: primaryFg })],
      })],
    })),
  })

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map(cell => new TableCell({
      shading: ri % 2 === 0 ? undefined : { type: ShadingType.CLEAR, fill: mutedBg },
      children: [new Paragraph({
        children: [new TextRun({ text: String(cell ?? ''), color: textC })],
      })],
    })),
  }))

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: preset.tokens.color.neutral['200'] },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: preset.tokens.color.neutral['200'] },
      left: { style: BorderStyle.SINGLE, size: 4, color: preset.tokens.color.neutral['200'] },
      right: { style: BorderStyle.SINGLE, size: 4, color: preset.tokens.color.neutral['200'] },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: preset.tokens.color.neutral['200'] },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: preset.tokens.color.neutral['200'] },
    },
  })
}

function renderImage(block, preset) {
  // 需要图片 dataUrl
  if (!block.data) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '[ 图片占位 ]', italics: true, color: preset.tokens.color.text.muted })],
    })
  }
  // data URL → buffer
  const base64 = block.data.split(',')[1] || block.data
  const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      data: buffer,
      transformation: {
        width: block.width || 400,
        height: block.height || 300,
      },
    })],
  })
}

function renderDivider(preset) {
  const primary = preset.tokens.color.primary
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: primary, space: 1 },
    },
    children: [],
  })
}

function renderTOC(preset) {
  // docx 库支持目录域
  return new Paragraph({
    children: [new TextRun({ text: '【在此处右键更新目录】', color: preset.tokens.color.text.muted, italics: true })],
  })
}

// ===== 页眉页脚 =====
function buildHeader(docData, preset) {
  if (!docData.header && !docData.meta?.header) return null
  const text = docData.header || docData.meta?.header
  const primary = preset.tokens.color.primary
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: primary, space: 4 } },
      children: [new TextRun({ text, size: 18, color: preset.tokens.color.text.muted })],
    })],
  })
}

function buildFooter(docData, preset) {
  if (docData.footer === false) return null
  const primary = preset.tokens.color.primary
  const footerText = docData.footer || docData.meta?.footer || ''
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: primary, space: 4 } },
      children: [
        new TextRun({ text: footerText, size: 18, color: preset.tokens.color.text.muted }),
        new TextRun({ text: '   第 ', size: 18, color: preset.tokens.color.text.muted }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: preset.tokens.color.text.muted }),
        new TextRun({ text: ' 页 / 共 ', size: 18, color: preset.tokens.color.text.muted }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: preset.tokens.color.text.muted }),
        new TextRun({ text: ' 页', size: 18, color: preset.tokens.color.text.muted }),
      ],
    })],
  })
}

// ===== 工具 =====
function mapAlign(align) {
  const map = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    both: AlignmentType.JUSTIFIED,
  }
  return map[align] || AlignmentType.LEFT
}
