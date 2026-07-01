/**
 * AI 生成 Schema 配置
 * 定义 Word / PPT 的两阶段生成 Prompt + JSON Schema 约束
 */

// ===== PPT Schema =====
export const PPT_SCHEMA = {
  title: 'PPT 结构',
  description: '一份完整的演示文稿结构',
  type: 'object',
  required: ['title', 'slides'],
  properties: {
    title: { type: 'string', description: 'PPT 主标题' },
    author: { type: 'string', description: '作者' },
    date: { type: 'string', description: '日期或场合' },
    slides: {
      type: 'array',
      minItems: 5,
      maxItems: 20,
      items: {
        type: 'object',
        required: ['type', 'title'],
        properties: {
          type: {
            type: 'string',
            enum: ['cover', 'agenda', 'section', 'content', 'bullets',
                   'two-column', 'image-text', 'chart', 'table', 'timeline', 'quote', 'end'],
            description: '版式类型',
          },
          title: { type: 'string', description: '本页标题' },
          subtitle: { type: 'string' },
          // cover/section
          index: { type: 'number', description: '章节序号(section)' },
          // agenda
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                subtitle: { type: 'string' },
              },
            },
          },
          // content
          paragraphs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                style: { type: 'string', enum: ['heading-1', 'heading-2', 'heading-3', 'heading-4', 'body', 'body-large', 'caption', 'quote'] },
              },
            },
          },
          // bullets
          points: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '要点（不超过 30 字）' },
                detail: { type: 'string', description: '补充说明（可选）' },
              },
            },
          },
          // two-column
          leftColumn: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
            },
          },
          rightColumn: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
            },
          },
          // image-text
          imageKey: { type: 'string', description: '图片标识，留空则占位' },
          imagePosition: { type: 'string', enum: ['left', 'right'] },
          text: { type: 'string' },
          // chart
          chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'donut'] },
          chartData: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'number' },
              },
            },
          },
          caption: { type: 'string' },
          // table
          headers: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: {} } },
          // timeline
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
          // quote
          quote: { type: 'string' },
          source: { type: 'string' },
          // 通用
          speakerNotes: { type: 'string', description: '演讲者备注' },
        },
      },
    },
  },
}

// ===== Word Schema =====
export const WORD_SCHEMA = {
  title: 'Word 文档结构',
  description: '一份完整的 Word 文档结构',
  type: 'object',
  required: ['title', 'blocks'],
  properties: {
    title: { type: 'string' },
    meta: {
      type: 'object',
      properties: {
        author: { type: 'string' },
        description: { type: 'string' },
        header: { type: 'string' },
        footer: { type: 'string' },
      },
    },
    page: {
      type: 'object',
      properties: {
        orientation: { type: 'string', enum: ['portrait', 'landscape'] },
        marginTop: { type: 'number' },
        marginBottom: { type: 'number' },
        marginLeft: { type: 'number' },
        marginRight: { type: 'number' },
      },
    },
    header: { type: 'string' },
    footer: { type: 'string' },
    blocks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: ['heading', 'paragraph', 'list', 'ordered-list', 'quote', 'code', 'table', 'image', 'divider', 'toc'],
          },
          // heading
          level: { type: 'number', enum: [1, 2, 3, 4] },
          text: { type: 'string' },
          // paragraph 富文本
          runs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                bold: { type: 'boolean' },
                italic: { type: 'boolean' },
                underline: { type: 'boolean' },
                strikethrough: { type: 'boolean' },
                color: { type: 'string' },
                size: { type: 'number' },
                font: { type: 'string' },
              },
            },
          },
          // 段落属性
          align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
          firstLine: { type: 'number', description: '首行缩进(twip)，2字符≈480' },
          line: { type: 'number', description: '行距，360=1.5倍' },
          before: { type: 'number' },
          after: { type: 'number' },
          // list
          items: { type: 'array', items: { type: 'string' } },
          // table
          headers: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: {} } },
          // image
          data: { type: 'string', description: 'base64 dataUrl' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
    },
  },
}

// ===== 大纲 Schema（第一阶段） =====
export const OUTLINE_SCHEMA = {
  ppt: {
    type: 'object',
    required: ['title', 'outline'],
    properties: {
      title: { type: 'string' },
      outline: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'title'],
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string', description: '该页要点概述' },
          },
        },
      },
    },
  },
  word: {
    type: 'object',
    required: ['title', 'outline'],
    properties: {
      title: { type: 'string' },
      outline: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'title'],
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
          },
        },
      },
    },
  },
}

// ===== 系统提示词 =====
export const PPT_OUTLINE_PROMPT = `你是一个专业的 PPT 内容策划师。请根据用户主题，先输出一份 PPT 大纲（仅结构和标题，不细化内容）。
要求：
1. 包含封面页(cover)和结束页(end)
2. 合理使用章节分隔页(section)划分篇章
3. 根据内容选择最合适的版式：cover/agenda/section/content/bullets/two-column/image-text/chart/table/timeline/quote/end
4. 总页数 8-15 页
5. 严格输出 JSON，不要任何额外文字`

export const PPT_DETAIL_PROMPT = `你是一个专业的 PPT 内容撰写师。请根据已确认的大纲，为每一页填充详细内容。
要求：
1. 严格遵循大纲的版式类型和标题
2. 要点简洁有力，每个不超过 30 字
3. 数据图表(chart)需提供具体的 chartData 数组
4. 表格(table)需提供完整的 headers 和 rows
5. 时间线(timeline)需提供 events 数组
6. 每页可加 speakerNotes 演讲者备注
7. 严格输出完整 JSON，遵循给定 Schema`

export const WORD_OUTLINE_PROMPT = `你是一个专业的 Word 文档策划师。请根据用户需求，先输出文档大纲（仅结构和标题）。
要求：
1. 合理使用标题层级 heading(level 1-4)
2. 综合运用 paragraph/list/quote/table/divider 等块类型
3. 长文档应有清晰的章节结构
4. 严格输出 JSON，不要任何额外文字`

export const WORD_DETAIL_PROMPT = `你是一个专业的 Word 文档撰写师。请根据已确认的大纲，填充完整内容。
要求：
1. 严格遵循大纲的结构
2. 正文段落充实、专业，符合中文排版规范
3. 段落默认首行缩进 2 字符(firstLine: 480)，行距 1.5 倍(line: 360)
4. 表格提供完整的 headers 和 rows
5. 引用(quote)用于强调或第三方观点
6. 严格输出完整 JSON，遵循给定 Schema`

// ===== JSON 提取工具 =====
export function extractJSON(raw) {
  if (!raw) return null
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // 提取第一个 {...} 或 [...]
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (match) {
      try { return JSON.parse(match[0]) } catch { /* ignore */ }
    }
    return null
  }
}
