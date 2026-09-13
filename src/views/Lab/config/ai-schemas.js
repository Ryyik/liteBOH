/**
 * AI 生成 Schema 配置
 * 定义 Word / PPT 的两阶段生成 Prompt + JSON Schema 约束
 */

// ===== PPT Schema =====
// v2：版式(type)与内容字段分离；硬约束写进字段描述；新增 imagePrompt 支持配图
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
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['cover', 'agenda', 'section', 'content', 'bullets',
                   'two-column', 'image-text', 'chart', 'table', 'timeline', 'quote', 'end'],
            description: '版式类型',
          },
          title: { type: 'string', description: '本页标题（≤ 20 字）' },
          subtitle: { type: 'string', description: '副标题（可选）' },
          // cover/section
          index: { type: 'number', description: '章节序号(section)' },
          // agenda
          items: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '≤ 15 字' },
                subtitle: { type: 'string', description: '≤ 25 字' },
              },
            },
          },
          // content
          paragraphs: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '40-120 字' },
                style: { type: 'string', enum: ['heading-1', 'heading-2', 'heading-3', 'heading-4', 'body', 'body-large', 'caption', 'quote'] },
              },
            },
          },
          // bullets / image-text
          points: {
            type: 'array',
            minItems: 2,
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '要点正文，不超过 30 字' },
                detail: { type: 'string', description: '补充说明（可选），不超过 40 字' },
              },
            },
          },
          // two-column
          leftColumn: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              items: { type: 'array', maxItems: 5, items: { type: 'string' } },
            },
          },
          rightColumn: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              items: { type: 'array', maxItems: 5, items: { type: 'string' } },
            },
          },
          // image-text
          imageKey: { type: 'string', description: '图片标识，留空则按 imagePrompt 配图' },
          imagePrompt: { type: 'string', description: '配图画面描述（英文，≤ 40 词），供图像生成/素材匹配使用' },
          imagePosition: { type: 'string', enum: ['left', 'right'] },
          text: { type: 'string' },
          // chart
          chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'donut', 'area', 'radar'] },
          chartData: {
            type: 'array',
            minItems: 3,
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '≤ 10 字' },
                value: { type: 'number' },
              },
            },
          },
          caption: { type: 'string', description: '图表来源或说明' },
          // table
          headers: { type: 'array', maxItems: 5, items: { type: 'string' } },
          rows: { type: 'array', maxItems: 6, items: { type: 'array', items: {} } },
          // timeline
          events: {
            type: 'array',
            minItems: 3,
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                title: { type: 'string', description: '≤ 15 字' },
              },
            },
          },
          // quote
          quote: { type: 'string', description: '引文，≤ 60 字' },
          source: { type: 'string', description: '引文来源' },
          // 通用
          speakerNotes: { type: 'string', description: '演讲者备注（必填，40-90 字，口语化）' },
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
// 大纲（Planner）：按场景匹配叙事框架 + 版式多样性规划
export const PPT_OUTLINE_PROMPT = `<role>
你是一个资深演示文稿策划师，擅长为中文场景设计逻辑严密、重点突出的演示结构。
</role>

<thinking>
在 <thinking> 内推演：
1. 判断场景类型（工作汇报/融资路演/教学培训/产品发布/行业分析），选定叙事框架
2. 按"每页只讲一个论点"原则切分章节，页与页之间要有清晰的递进关系
3. 为每页指定版式：数据论述用 chart、并列信息用 two-column 或 bullets、流程演进用 timeline、观点引证用 quote，避免连续 3 页使用同一版式
</thinking>

<constraints>
- 只输出大纲（结构和标题），不写正文
- 叙事框架按场景匹配：工作汇报=现状-分析-方案-计划；融资路演=问题-方案-市场-竞争-团队-规划；教学培训=引入-概念-方法-案例-总结；行业分析=现状-趋势-机会-建议
- 全篇版式至少使用 4 种；含数据论述的页必须指定 chart 版式
- 总页数 8-15 页；必须含封面页(cover)与结束页(end)，章节多于 1 章时使用 section 分隔
- summary 写清该页核心论点（30 字内），后续单页生成将依赖它展开
- 严格输出 JSON，不要任何额外文字
</constraints>

<output_format>
{"title":"主标题","author":"作者（未知则留空）","date":"日期或场合","outline":[{"type":"cover|agenda|section|content|bullets|two-column|image-text|chart|table|timeline|quote|end","title":"页标题（≤20字）","summary":"本页核心论点（30字内）"}]}
</output_format>`

// 单页生成（Designer）：把大纲一页扩写为可排版的结构化内容
export const PPT_PAGE_PROMPT = `<role>
你是专业的 PPT 内容撰写师，负责把大纲中的一页扩写为可直接排版的结构化内容。
</role>

<constraints>
- 只输出这一页的 JSON 对象，不要数组、不要任何解释文字
- 不得添加 schema 之外的字段；type 与 title 必须与大纲条目保持一致
- bullets / image-text 页：points 2-5 条，每条 text ≤ 30 字，可选 detail ≤ 40 字
- 要点必须含具体信息量：写明主体、数据、结论或动作（如"华东区营收增长 23%"），禁止"市场很大""效果不错"这类无信息量的空泛短句
- content 页：paragraphs 2-4 段，每段 40-120 字
- chart 页：chartData 3-6 项（label ≤ 10 字，value 为数字），chartType 按数据形态从 bar/line/pie/donut/area/radar 中选择；给出 caption 说明数据口径
- table 页：headers 2-5 列，rows 2-6 行，单元格内容精炼（≤ 12 字）
- timeline 页：events 3-6 项，每项含 date 与 title（≤ 15 字）
- quote 页：quote ≤ 60 字，必须给 source 来源
- image-text 页：必须给 imagePrompt（英文画面描述，≤ 40 词，适配配图生成），imagePosition 为 left 或 right
- cover/end 页：给出 subtitle；section 页：给出 index 与 subtitle
- 所有页必须写 speakerNotes（40-90 字，口语化演讲稿，承接上一页内容）
- 文字量宁少勿多：单页放不下、需要缩小字号才能塞下的内容即为不合格，应删减到版面可容纳
</constraints>

<output_format>
单页 JSON 对象，按 type 选用字段：type/title/subtitle/index/items/paragraphs/points/leftColumn/rightColumn/imagePrompt/imagePosition/imageKey/text/chartType/chartData/caption/headers/rows/events/quote/source/speakerNotes
</output_format>`

// 单页质检修复（Reviewer）：错误清单驱动的修正回路
export const PPT_PAGE_FIX_PROMPT = `<role>
你是严格的 PPT 质检师。下面给出一页幻灯片的结构化内容与质检错误清单，请修正所有问题。
</role>

<constraints>
- 只输出修正后的完整单页 JSON 对象，不要任何解释
- 保持 type 与 title 不变，仅修正错误清单指出的问题
- 文字精炼：要点每条 ≤ 30 字，删除空洞表述与重复信息
- 扩充过短的要点时必须补入具体信息（数据、主体、结论或动作），不是简单拉长句子
- 必须保留或补全 speakerNotes（40-90 字，口语化）
- 缺失的数据字段（chartData/headers/rows/events/quote/source/imagePrompt）必须依据标题与主题合理补全，不得留空
- 修正后的页面必须能直接通过原错误清单的全部检查
</constraints>`

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
  // 剥离思考标签（thinking/think/reasoning），避免其中内容干扰 JSON 定位
  cleaned = cleaned.replace(/<(thinking|think|reasoning)>[\s\S]*?<\/\1>/gi, '').trim()
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

// ===== Token 限制（与后端 TIER_MAX_OUTPUT_TOKENS 对齐） =====
// P2-11: 前端 max_tokens 不应超过后端 tier 限制，避免发送无效的大值。
// 后端 buildRuntimePayload 会用 policy.maxTokens 覆盖前端值，此处 clamp 仅为减少请求体冗余和让前端有正确预期。
// 取 ultra tier 上限作为前端 clamp 上界（实际限制由后端按用户 tier 强制执行）。
// 质量优化（2026-09-12）：free 1200/plus 1800 会导致 PPT 单页 JSON 高频截断（截断后靠补 } 恢复，
// 内容静默缺失），统一上调一档；后端 policy 同步前，实际生效值仍以服务端为准。
export const TIER_MAX_OUTPUT_TOKENS = {
  free: 2048,
  plus: 2560,
  pro: 3072,
  max: 4096,
  ultra: 4096,
}
export const FRONTEND_MAX_OUTPUT_TOKENS = TIER_MAX_OUTPUT_TOKENS.ultra
