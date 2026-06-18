import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'

export async function buildModifiedDocx(zip, stylesDoc, documentDoc) {
  const serializer = new XMLSerializer()
  zip.file('word/styles.xml', serializer.serializeToString(stylesDoc))
  if (documentDoc) {
    zip.file('word/document.xml', serializer.serializeToString(documentDoc))
  }
  return await zip.generateAsync({ type: 'blob' })
}

export function templateToOperations(tpl) {
  return tpl.operations || []
}

export async function buildFromTemplate(template, title) {
  const ops = templateToOperations(template)
  const doc = new Document({
    styles: { paragraphStyles: buildStyleDefinitions(ops) },
    sections: [{
      children: [
        new Paragraph({ text: title || '文档标题', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun('由 BOH 办公 AI 生成的文档。')] }),
      ],
    }],
  })
  return await Packer.toBlob(doc)
}

function buildStyleDefinitions(ops) {
  const alignMap = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, both: AlignmentType.JUSTIFIED, justify: AlignmentType.JUSTIFIED }
  return ops.map(op => {
    const def = { id: op.target, name: op.target, basedOn: op.target === 'Normal' ? undefined : 'Normal', run: {}, paragraph: {} }
    if (op.font) def.run.fonts = { ascii: op.font, hAnsi: op.font, eastAsia: op.font }
    if (op.size) def.run.size = op.size
    if (op.bold) def.run.bold = true
    if (op.italic) def.run.italics = true
    if (op.color) def.run.color = op.color
    if (op.align) def.paragraph.alignment = alignMap[op.align]
    if (op.line) def.paragraph.spacing = { ...def.paragraph.spacing, line: op.line }
    return def
  })
}
