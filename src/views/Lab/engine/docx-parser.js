import JSZip from 'jszip'
import { WORD_NS } from '../utils/constants.js'

export async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const stylesXmlStr = await zip.file('word/styles.xml')?.async('string')
  const documentXmlStr = await zip.file('word/document.xml')?.async('string')
  if (!stylesXmlStr || !documentXmlStr) throw new Error('无法解析 .docx')

  const parser = new DOMParser()
  const stylesDoc = parser.parseFromString(stylesXmlStr, 'text/xml')
  const documentDoc = parser.parseFromString(documentXmlStr, 'text/xml')

  const styles = parseStyles(stylesDoc)
  const content = parseDocumentContent(documentDoc, styles)
  const documentSettings = parseDocumentSettings(documentDoc)

  return { zip, stylesDoc, documentDoc, styles, content, documentSettings, fileName: file.name }
}

function parseStyles(stylesDoc) {
  const styleElements = stylesDoc.getElementsByTagNameNS(WORD_NS, 'style')
  const styles = []
  const styleMap = {}
  for (const el of styleElements) {
    const styleId = el.getAttribute('w:styleId') || ''
    const type = el.getAttribute('w:type') || ''
    const nameEl = el.getElementsByTagNameNS(WORD_NS, 'name')[0]
    const name = nameEl?.getAttribute('w:val') || styleId
    const rPr = el.getElementsByTagNameNS(WORD_NS, 'rPr')[0]
    const pPr = el.getElementsByTagNameNS(WORD_NS, 'pPr')[0]
    const styleInfo = {
      styleId, type, name,
      font: parseFont(rPr),
      size: parseSize(rPr),
      bold: hasElement(rPr, 'b') || hasElement(rPr, 'bCs'),
      italic: hasElement(rPr, 'i'),
      underline: hasElement(rPr, 'u'),
      strikethrough: hasElement(rPr, 'strike'),
      color: parseColor(rPr),
      shading: parseShading(rPr),
      align: parseAlign(pPr),
      spacing: parseSpacing(pPr),
      indent: parseIndent(pPr),
    }
    styles.push(styleInfo)
    styleMap[styleId] = styleInfo
  }
  return { styles, styleMap }
}

function parseFont(rPr) {
  if (!rPr) return null
  const rFonts = rPr.getElementsByTagNameNS(WORD_NS, 'rFonts')[0]
  if (!rFonts) return null
  return { ascii: rFonts.getAttribute('w:ascii'), hAnsi: rFonts.getAttribute('w:hAnsi'), eastAsia: rFonts.getAttribute('w:eastAsia') }
}

function parseSize(rPr) {
  if (!rPr) return null
  const sz = rPr.getElementsByTagNameNS(WORD_NS, 'sz')[0]
  return sz ? parseInt(sz.getAttribute('w:val'), 10) : null
}

function parseColor(rPr) {
  if (!rPr) return null
  const c = rPr.getElementsByTagNameNS(WORD_NS, 'color')[0]
  return c ? c.getAttribute('w:val') || null : null
}

function parseShading(rPr) {
  if (!rPr) return null
  const s = rPr.getElementsByTagNameNS(WORD_NS, 'shd')[0]
  return s ? s.getAttribute('w:fill') || null : null
}

function hasElement(parent, tagName) {
  return parent ? parent.getElementsByTagNameNS(WORD_NS, tagName).length > 0 : false
}

function parseAlign(pPr) {
  if (!pPr) return null
  const jc = pPr.getElementsByTagNameNS(WORD_NS, 'jc')[0]
  return jc ? jc.getAttribute('w:val') || null : null
}

function parseSpacing(pPr) {
  if (!pPr) return null
  const s = pPr.getElementsByTagNameNS(WORD_NS, 'spacing')[0]
  if (!s) return null
  return {
    before: s.getAttribute('w:before') ? parseInt(s.getAttribute('w:before'), 10) : null,
    after: s.getAttribute('w:after') ? parseInt(s.getAttribute('w:after'), 10) : null,
    line: s.getAttribute('w:line') ? parseInt(s.getAttribute('w:line'), 10) : null,
  }
}

function parseIndent(pPr) {
  if (!pPr) return null
  const i = pPr.getElementsByTagNameNS(WORD_NS, 'ind')[0]
  if (!i) return null
  return {
    left: i.getAttribute('w:left') ? parseInt(i.getAttribute('w:left'), 10) : null,
    right: i.getAttribute('w:right') ? parseInt(i.getAttribute('w:right'), 10) : null,
    firstLine: i.getAttribute('w:firstLine') ? parseInt(i.getAttribute('w:firstLine'), 10) : null,
    hanging: i.getAttribute('w:hanging') ? parseInt(i.getAttribute('w:hanging'), 10) : null,
  }
}

function parseDocumentContent(documentDoc, styles) {
  const body = documentDoc.getElementsByTagNameNS(WORD_NS, 'body')[0]
  if (!body) return []
  const paragraphs = body.getElementsByTagNameNS(WORD_NS, 'p')
  const content = []
  for (const p of paragraphs) {
    const pPr = p.getElementsByTagNameNS(WORD_NS, 'pPr')[0]
    let styleId = null
    if (pPr) {
      const pStyle = pPr.getElementsByTagNameNS(WORD_NS, 'pStyle')[0]
      styleId = pStyle?.getAttribute('w:val') || null
    }
    const runs = p.getElementsByTagNameNS(WORD_NS, 'r')
    const textParts = []
    for (const r of runs) {
      const t = r.getElementsByTagNameNS(WORD_NS, 't')[0]
      if (t) textParts.push(t.textContent || '')
    }
    const text = textParts.join('')
    const isHeading = styleId ? styleId.toLowerCase().startsWith('heading') : false
    const styleInfo = styleId ? styles.styleMap[styleId] : null
    content.push({
      styleId: styleId || 'Normal',
      styleName: styleInfo?.name || styleId || 'Normal',
      isHeading,
      text,
    })
  }
  return content
}

function parseDocumentSettings(documentDoc) {
  const body = documentDoc.getElementsByTagNameNS(WORD_NS, 'body')[0]
  if (!body) return {}
  const sectPr = body.getElementsByTagNameNS(WORD_NS, 'sectPr')[0]
  if (!sectPr) return {}
  const pgSz = sectPr.getElementsByTagNameNS(WORD_NS, 'pgSz')[0]
  const pgMar = sectPr.getElementsByTagNameNS(WORD_NS, 'pgMar')[0]
  return {
    pageWidth: pgSz?.getAttribute('w:w') || null,
    pageHeight: pgSz?.getAttribute('w:h') || null,
    orientation: pgSz?.getAttribute('w:orient') || null,
    marginTop: pgMar?.getAttribute('w:top') || null,
    marginBottom: pgMar?.getAttribute('w:bottom') || null,
    marginLeft: pgMar?.getAttribute('w:left') || null,
    marginRight: pgMar?.getAttribute('w:right') || null,
  }
}

export function reparseStylesFromDoc(stylesDoc) {
  return parseStyles(stylesDoc)
}
