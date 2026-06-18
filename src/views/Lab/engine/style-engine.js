import { WORD_NS } from '../utils/constants.js'

export function applyOperations(stylesDoc, operations) {
  for (const op of operations) {
    if (op.target === '__document__') {
      applyDocumentSettings(stylesDoc, op)
    } else {
      applyStyleOperation(stylesDoc, op)
    }
  }
  return stylesDoc
}

function applyStyleOperation(stylesDoc, op) {
  const styleEl = findStyleById(stylesDoc, op.target)
  if (!styleEl) return

  ensureRPr(styleEl)
  const rPr = styleEl.getElementsByTagNameNS(WORD_NS, 'rPr')[0]
  ensurePPr(styleEl)
  const pPr = styleEl.getElementsByTagNameNS(WORD_NS, 'pPr')[0]

  if (op.font) setFont(rPr, op.font)
  if (op.size) setSize(rPr, op.size)
  setToggle(rPr, 'b', op.bold)
  setToggle(rPr, 'bCs', op.bold)
  setToggle(rPr, 'i', op.italic)
  setToggle(rPr, 'u', op.underline)
  setToggle(rPr, 'strike', op.strikethrough)
  if (op.color) setColor(rPr, op.color)
  if (op.shading) setShading(rPr, op.shading)
  if (op.align) setAlign(pPr, op.align)
  if (op.line !== undefined) setLineSpacing(pPr, op.line)
  if (op.before !== undefined) setSpacing(pPr, 'before', op.before)
  if (op.after !== undefined) setSpacing(pPr, 'after', op.after)
  if (op.firstLine !== undefined) setIndent(pPr, 'firstLine', op.firstLine)
  if (op.indentLeft !== undefined) setIndent(pPr, 'left', op.indentLeft)
  if (op.indentRight !== undefined) setIndent(pPr, 'right', op.indentRight)
}

function applyDocumentSettings(stylesDoc, op) {
  const serializer = new XMLSerializer()
  const docStr = serializer.serializeToString(stylesDoc)

  const doc = docStr.includes('w:document') ? stylesDoc : stylesDoc.ownerDocument
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0]
  if (!body) return
  let sectPr = body.getElementsByTagNameNS(WORD_NS, 'sectPr')[0]
  if (!sectPr) {
    sectPr = doc.createElementNS(WORD_NS, 'w:sectPr')
    body.appendChild(sectPr)
  }
  let pgSz = sectPr.getElementsByTagNameNS(WORD_NS, 'pgSz')[0]
  if (op.pageWidth || op.pageHeight || op.orientation) {
    if (!pgSz) {
      pgSz = doc.createElementNS(WORD_NS, 'w:pgSz')
      sectPr.appendChild(pgSz)
    }
    if (op.pageWidth) pgSz.setAttribute('w:w', String(op.pageWidth))
    if (op.pageHeight) pgSz.setAttribute('w:h', String(op.pageHeight))
    if (op.orientation) pgSz.setAttribute('w:orient', op.orientation)
  }
  let pgMar = sectPr.getElementsByTagNameNS(WORD_NS, 'pgMar')[0]
  if (op.marginTop || op.marginBottom || op.marginLeft || op.marginRight) {
    if (!pgMar) {
      pgMar = doc.createElementNS(WORD_NS, 'w:pgMar')
      const before = sectPr.getElementsByTagNameNS(WORD_NS, 'pgSz')[0]
      sectPr.insertBefore(pgMar, before ? before.nextSibling : sectPr.firstChild)
    }
    if (op.marginTop) pgMar.setAttribute('w:top', String(op.marginTop))
    if (op.marginRight) pgMar.setAttribute('w:right', String(op.marginRight))
    if (op.marginBottom) pgMar.setAttribute('w:bottom', String(op.marginBottom))
    if (op.marginLeft) pgMar.setAttribute('w:left', String(op.marginLeft))
  }
}

function findStyleById(stylesDoc, styleId) {
  const styles = stylesDoc.getElementsByTagNameNS(WORD_NS, 'style')
  for (const style of styles) {
    if (style.getAttribute('w:styleId')?.toLowerCase() === styleId.toLowerCase()) return style
  }
  for (const style of styles) {
    const nameEl = style.getElementsByTagNameNS(WORD_NS, 'name')[0]
    if (nameEl?.getAttribute('w:val')?.toLowerCase() === styleId.toLowerCase()) return style
  }
  return null
}

function ensureRPr(styleEl) {
  let rPr = styleEl.getElementsByTagNameNS(WORD_NS, 'rPr')[0]
  if (!rPr) {
    rPr = styleEl.ownerDocument.createElementNS(WORD_NS, 'w:rPr')
    styleEl.insertBefore(rPr, styleEl.firstChild)
  }
  return rPr
}

function ensurePPr(styleEl) {
  let pPr = styleEl.getElementsByTagNameNS(WORD_NS, 'pPr')[0]
  if (!pPr) {
    pPr = styleEl.ownerDocument.createElementNS(WORD_NS, 'w:pPr')
    const rPr = styleEl.getElementsByTagNameNS(WORD_NS, 'rPr')[0]
    styleEl.insertBefore(pPr, rPr || styleEl.firstChild)
  }
  return pPr
}

function setFont(rPr, fontName) {
  let rFonts = rPr.getElementsByTagNameNS(WORD_NS, 'rFonts')[0]
  if (!rFonts) {
    rFonts = rPr.ownerDocument.createElementNS(WORD_NS, 'w:rFonts')
    rPr.insertBefore(rFonts, rPr.firstChild)
  }
  rFonts.setAttribute('w:ascii', fontName)
  rFonts.setAttribute('w:hAnsi', fontName)
  rFonts.setAttribute('w:eastAsia', fontName)
}

function setSize(rPr, halfPt) {
  let sz = rPr.getElementsByTagNameNS(WORD_NS, 'sz')[0]
  if (!sz) { sz = rPr.ownerDocument.createElementNS(WORD_NS, 'w:sz'); rPr.appendChild(sz) }
  sz.setAttribute('w:val', String(halfPt))
  let szCs = rPr.getElementsByTagNameNS(WORD_NS, 'szCs')[0]
  if (!szCs) { szCs = rPr.ownerDocument.createElementNS(WORD_NS, 'w:szCs'); rPr.appendChild(szCs) }
  szCs.setAttribute('w:val', String(halfPt))
}

function setToggle(rPr, tagName, value) {
  if (value === undefined || value === null) return
  let el = rPr.getElementsByTagNameNS(WORD_NS, tagName)[0]
  if (value) {
    if (!el) {
      el = rPr.ownerDocument.createElementNS(WORD_NS, `w:${tagName}`)
      rPr.appendChild(el)
    }
  } else {
    if (el) el.parentNode.removeChild(el)
  }
}

function setColor(rPr, colorVal) {
  let color = rPr.getElementsByTagNameNS(WORD_NS, 'color')[0]
  if (!color) { color = rPr.ownerDocument.createElementNS(WORD_NS, 'w:color'); rPr.appendChild(color) }
  color.setAttribute('w:val', colorVal)
}

function setShading(rPr, colorVal) {
  let shading = rPr.getElementsByTagNameNS(WORD_NS, 'shd')[0]
  if (!shading) { shading = rPr.ownerDocument.createElementNS(WORD_NS, 'w:shd'); rPr.appendChild(shading) }
  shading.setAttribute('w:val', 'clear')
  shading.setAttribute('w:fill', colorVal)
}

function setAlign(pPr, alignVal) {
  let jc = pPr.getElementsByTagNameNS(WORD_NS, 'jc')[0]
  if (!jc) { jc = pPr.ownerDocument.createElementNS(WORD_NS, 'w:jc'); pPr.appendChild(jc) }
  jc.setAttribute('w:val', alignVal)
}

function setLineSpacing(pPr, lineVal) {
  let spacing = pPr.getElementsByTagNameNS(WORD_NS, 'spacing')[0]
  if (!spacing) { spacing = pPr.ownerDocument.createElementNS(WORD_NS, 'w:spacing'); pPr.appendChild(spacing) }
  spacing.setAttribute('w:line', String(lineVal))
  spacing.setAttribute('w:lineRule', 'auto')
}

function setSpacing(pPr, attr, val) {
  if (val === undefined || val === null) return
  let spacing = pPr.getElementsByTagNameNS(WORD_NS, 'spacing')[0]
  if (!spacing) { spacing = pPr.ownerDocument.createElementNS(WORD_NS, 'w:spacing'); pPr.appendChild(spacing) }
  spacing.setAttribute(`w:${attr}`, String(val))
}

function setIndent(pPr, attr, val) {
  if (val === undefined || val === null) return
  let ind = pPr.getElementsByTagNameNS(WORD_NS, 'ind')[0]
  if (!ind) { ind = pPr.ownerDocument.createElementNS(WORD_NS, 'w:ind'); pPr.appendChild(ind) }
  ind.setAttribute(`w:${attr}`, String(val))
}

export function applyContentOperations(documentDoc, operations) {
  for (const op of operations) {
    if (op.type === 'replaceText') {
      applyReplaceText(documentDoc, op)
    } else if (op.type === 'insertText') {
      applyInsertText(documentDoc, op)
    } else if (op.type === 'deleteParagraph') {
      applyDeleteParagraph(documentDoc, op)
    } else if (op.type === 'addParagraph') {
      applyAddParagraph(documentDoc, op)
    }
  }
  return documentDoc
}

function applyReplaceText(documentDoc, op) {
  const paragraphs = documentDoc.getElementsByTagNameNS(WORD_NS, 'p')
  for (const p of paragraphs) {
    const runs = p.getElementsByTagNameNS(WORD_NS, 'r')
    let fullText = ''
    for (const r of runs) {
      const t = r.getElementsByTagNameNS(WORD_NS, 't')[0]
      if (t) fullText += t.textContent || ''
    }
    if (fullText.includes(op.find)) {
      let remainingText = fullText
      for (const r of runs) {
        const t = r.getElementsByTagNameNS(WORD_NS, 't')[0]
        if (t) {
          const idx = remainingText.indexOf(op.find)
          if (idx === 0) {
            t.textContent = op.replace + remainingText.substring(op.find.length)
            break
          } else if (idx > 0) {
            remainingText = remainingText.substring(t.textContent.length)
          } else {
            remainingText = remainingText.substring(t.textContent.length)
          }
        }
      }
    }
  }
}

function applyInsertText(documentDoc, op) {
  const paragraphs = documentDoc.getElementsByTagNameNS(WORD_NS, 'p')
  const insertIndex = Math.min(op.atIndex, paragraphs.length)
  const targetP = paragraphs[insertIndex]
  if (!targetP) return

  const runs = targetP.getElementsByTagNameNS(WORD_NS, 'r')
  if (runs.length === 0) {
    const r = documentDoc.createElementNS(WORD_NS, 'w:r')
    const t = documentDoc.createElementNS(WORD_NS, 'w:t')
    t.textContent = op.text
    r.appendChild(t)
    targetP.appendChild(r)
    return
  }

  const firstRun = runs[0]
  const firstT = firstRun.getElementsByTagNameNS(WORD_NS, 't')[0]
  if (firstT) {
    firstT.textContent = op.text + firstT.textContent
  } else {
    const t = documentDoc.createElementNS(WORD_NS, 'w:t')
    t.textContent = op.text
    firstRun.insertBefore(t, firstRun.firstChild)
  }
}

function applyDeleteParagraph(documentDoc, op) {
  const paragraphs = documentDoc.getElementsByTagNameNS(WORD_NS, 'p')
  const removeIndex = parseInt(op.atIndex, 10)
  if (removeIndex >= 0 && removeIndex < paragraphs.length) {
    const pToRemove = paragraphs[removeIndex]
    pToRemove.parentNode.removeChild(pToRemove)
  }
}

function applyAddParagraph(documentDoc, op) {
  const body = documentDoc.getElementsByTagNameNS(WORD_NS, 'body')[0]
  if (!body) return

  const sectPr = body.getElementsByTagNameNS(WORD_NS, 'sectPr')[0]

  const p = documentDoc.createElementNS(WORD_NS, 'w:p')

  if (op.style) {
    const pPr = documentDoc.createElementNS(WORD_NS, 'w:pPr')
    const pStyle = documentDoc.createElementNS(WORD_NS, 'w:pStyle')
    pStyle.setAttribute('w:val', op.style)
    pPr.appendChild(pStyle)

    if (op.align) {
      const jc = documentDoc.createElementNS(WORD_NS, 'w:jc')
      jc.setAttribute('w:val', op.align)
      pPr.appendChild(jc)
    }
    p.appendChild(pPr)
  }

  const r = documentDoc.createElementNS(WORD_NS, 'w:r')
  const t = documentDoc.createElementNS(WORD_NS, 'w:t')
  t.textContent = op.text
  r.appendChild(t)
  p.appendChild(r)

  if (sectPr) {
    body.insertBefore(p, sectPr)
  } else {
    body.appendChild(p)
  }
}
