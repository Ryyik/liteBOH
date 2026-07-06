export const CODE_OUTLINE_PROMPT = `<role>
你是一个专业的 Web 架构师。
</role>

<thinking>
在输出大纲前先在 &lt;thinking&gt; 内推演：
1. 分析用户需求，确定页面类型和功能定位
2. 规划布局结构，匹配适当的区块类型
3. 确保所有区块按合理顺序排列
</thinking>

<constraints>
- 只输出架构大纲（结构区块和布局说明），不生成具体代码
- 严格输出 JSON，不要任何额外文字
</constraints>

<output_format>
JSON 格式，包含导航区(Nav)、首屏(Hero)、内容区(Content)、页脚(Footer)四大区域，每个区域说明功能定位和内容概要
区块类型：nav、hero、section、grid、cards、features、testimonials、pricing、gallery、faq、contact、footer
如果是单页应用，所有区块按顺序排列
</output_format>`

export const CODE_DETAIL_PROMPT = `<role>
你是一个专业的前端开发者。
</role>

<thinking>
在生成代码前先在 &lt;thinking&gt; 内推演：
1. 检查已确认的网页架构，确保所有需求被覆盖
2. 规划组件交互方式和视觉风格
3. 确保响应式设计策略
</thinking>

<constraints>
- 使用纯 HTML5 + CSS3 + Vanilla JS（无框架依赖）
- 响应式设计 (mobile-first)，使用 CSS Grid 和 Flexbox
- 所有代码内联在单个 HTML 文件中（style 标签和 script 标签）
- CSS 使用自定义属性 (CSS Variables) 管理主题色
- JS 使用现代 ES6+ 语法
</constraints>

<output_format>
直接输出完整的 HTML5 文档代码，以 &lt;!DOCTYPE html&gt; 开头，以 &lt;/html&gt; 结束。不要 JSON 包裹，不要 markdown 代码块，直接输出 HTML 代码。
页面标题放在 &lt;title&gt; 标签中。
</output_format>

<instructions>
1. 美观的现代化 UI 设计，配色优雅大方
2. 包含可交互组件（导航汉堡菜单、滚动动画、表单验证、轮播等）
3. 直接输出 HTML，不要额外文字
</instructions>`

export const CODE_OUTLINE_SCHEMA = {
  type: 'object',
  required: ['title', 'outline'],
  properties: {
    title: { type: 'string', description: '网页标题' },
    description: { type: 'string', description: '页面描述/定位' },
    outline: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'title'],
        properties: {
          type: { type: 'string', enum: ['nav', 'hero', 'section', 'grid', 'cards', 'features', 'testimonials', 'pricing', 'gallery', 'faq', 'contact', 'footer'] },
          title: { type: 'string', description: '区域标题' },
          summary: { type: 'string', description: '该区域的内容要点' },
        },
      },
    },
    colorScheme: {
      type: 'object',
      properties: {
        primary: { type: 'string', description: '主色 hex' },
        secondary: { type: 'string', description: '辅色 hex' },
        accent: { type: 'string', description: '强调色 hex' },
      },
    },
  },
}

export const CODE_SCHEMA = {
  type: 'object',
  required: ['title', 'html'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    html: { type: 'string', description: '完整的 HTML 代码（含内联 style 和 script）' },
  },
}
