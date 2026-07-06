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
export const PPT_OUTLINE_PROMPT = `<role>
你是一个专业的 PPT 内容策划师。
</role>

<thinking>
在输出大纲前先在 &lt;thinking&gt; 内推演：
1. 分析用户主题，确定核心信息层次
2. 规划叙事结构和篇章划分
3. 为每页选择最合适的版式
</thinking>

<constraints>
- 只输出大纲（结构和标题），不细化内容
- 严格输出 JSON，不要任何额外文字
- 总页数 8-15 页
</constraints>

<output_format>
包含封面页(cover)和结束页(end)，合理使用章节分隔页(section)划分篇章
版式：cover/agenda/section/content/bullets/two-column/image-text/chart/table/timeline/quote/end
</output_format>`

export const PPT_DETAIL_PROMPT = `<role>
你是一个专业的 PPT 内容撰写师。
</role>

<constraints>
- 严格遵循大纲的版式类型和标题
- 要点简洁有力，每个不超过 30 字
- 严格输出完整 JSON，遵循给定 Schema
</constraints>

<output_format>
- 数据图表(chart)需提供具体的 chartData 数组
- 表格(table)需提供完整的 headers 和 rows
- 时间线(timeline)需提供 events 数组
- 每页可加 speakerNotes 演讲者备注
</output_format>`

export const WORD_OUTLINE_PROMPT = `<role>
你是一个专业的 Word 文档策划师。
</role>

<thinking>
在输出大纲前先在 &lt;thinking&gt; 内推演：
1. 分析用户需求，确定文档类型和读者
2. 规划章节结构和内容层级
3. 选择最合适的块类型组合
</thinking>

<constraints>
- 只输出大纲（结构和标题），不填充内容
- 严格输出 JSON，不要任何额外文字
- 长文档应有清晰的章节结构
</constraints>

<output_format>
合理使用标题层级 heading(level 1-4)，综合运用 paragraph/list/quote/table/divider 等块类型
</output_format>`

export const WORD_DETAIL_PROMPT = `<role>
你是一个专业的 Word 文档撰写师。
</role>

<constraints>
- 严格遵循大纲的结构
- 正文段落充实、专业，符合中文排版规范
- 段落默认首行缩进 2 字符(firstLine: 480)，行距 1.5 倍(line: 360)
- 严格输出完整 JSON，遵循给定 Schema
</constraints>

<output_format>
- 表格提供完整的 headers 和 rows
- 引用(quote)用于强调或第三方观点
</output_format>`

// ===== 思考级别指令 =====
export function buildThinkingInstruction(level = 0.5) {
  if (level < 0.25) return '\n\n直接输出结果，无需额外推理。'
  if (level < 0.45) return '\n\n<thinking>简要概述思路即可，然后直接输出结果。</thinking>'
  if (level < 0.65) return '\n\n<thinking>在输出前进行适当的推理和验证，确保结果正确。</thinking>'
  if (level < 0.85) return '\n\n<thinking>请进行多步骤推理：\n1. 分析需求\n2. 设计方案\n3. 验证可行性\n4. 输出结果</thinking>'
  return '\n\n<thinking>请进行深入的、多层次的推理分析：\n1. 全面理解用户需求和上下文\n2. 拆解为子问题并逐一推演\n3. 评估多种方案的优劣\n4. 严谨验证每一步的正确性\n5. 输出最优结果</thinking>'
}

// ===== JSON 提取工具 =====
export function extractJSON(raw) {
  if (!raw) return null
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```[\w-]*\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // 提取第一个完整 {...} 或 [...]
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (match) {
      try { return JSON.parse(match[0]) } catch { /* ignore */ }
    }
    // 截断恢复：如果只有开头没有结尾 }，尝试补上后再解析
    if (cleaned.startsWith('{')) {
      let balance = 0
      let end = -1
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') balance++
        else if (cleaned[i] === '}') balance--
        if (balance === 0) { end = i; break }
      }
      if (end < 0) {
        // 从未闭合，尝试补上 }
        try { return JSON.parse(cleaned + '}') } catch { /* ignore */ }
      }
    }
    return null
  }
}
